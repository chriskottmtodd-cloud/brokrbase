/**
 * Tools exposed to the Claude app over MCP ("Connect to Claude" in Settings).
 * Every tool is bound to a single userId and only touches that user's rows.
 * There are deliberately no delete tools.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Contact, Task } from "../../drizzle/schema";
import {
  completeTaskWithLog,
  createActivity,
  createContact,
  createContactPropertyLink,
  createTask,
  findSimilarContacts,
  getActivities,
  getActivitiesForProperty,
  getActivityDetail,
  getContactById,
  getContactPropertyLinks,
  getContacts,
  getContactsForProperty,
  getProperties,
  getPropertyById,
  getTaskById,
  getTasks,
  recomputeContactLastContacted,
  updateActivity,
  updateContact,
  updateTask,
} from "../db";
import { resolveContactMention } from "../_core/entityResolution";

const ACTIVITY_TYPE = z.enum(["call", "email", "meeting", "note", "text", "voicemail"]);
const OUTCOME = z.enum(["reached", "voicemail", "no_answer", "callback_requested", "not_interested", "interested", "follow_up"]);
const TASK_TYPE = z.enum(["call", "email", "meeting", "follow_up", "research", "other"]);
const PRIORITY = z.enum(["urgent", "high", "medium", "low"]);
const DEAL_ROLE = z.enum(["owner", "seller", "buyer", "tenant", "buyers_broker", "listing_agent", "property_manager", "attorney", "lender", "other"]);

const CREATE_CONTACT_SHAPE = {
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).default(""),
  company: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().optional().describe("Street address"),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip: z.string().max(20).optional(),
  isOwner: z.boolean().optional().describe("True if they own property"),
  isBuyer: z.boolean().optional().describe("True if they're looking to buy"),
  notes: z.string().optional().describe("Lasting facts about the person: title, website, what they own or want. Not the meeting itself"),
  metThem: z
    .object({
      summary: z.string().max(300).describe("One line, e.g. \"Met at the CCIM lunch\""),
      details: z.string().optional().describe("What was discussed"),
      type: ACTIVITY_TYPE.default("meeting"),
      occurredAt: z.string().optional().describe("ISO date/time; defaults to now"),
    })
    .optional()
    .describe("If the user met or talked with them, logged in their history as an activity"),
  confirmNew: z.boolean().default(false),
};

const UPDATE_CONTACT_SHAPE = {
  contactId: z.number().int(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  priority: z.enum(["hot", "warm", "cold", "inactive"]).optional(),
  notes: z.string().optional(),
};

const UPDATE_ACTIVITY_SHAPE = {
  activityId: z.number().int(),
  contactId: z.number().int().nullable().optional().describe("Move to this contact (null to unlink)"),
  propertyId: z.number().int().nullable().optional().describe("Move to this property (null to unlink)"),
  type: ACTIVITY_TYPE.optional(),
  subject: z.string().max(300).optional(),
  notes: z.string().optional(),
  outcome: OUTCOME.nullable().optional(),
  occurredAt: z.string().optional().describe("ISO date/time"),
};

const UPDATE_TASK_SHAPE = {
  taskId: z.number().int(),
  title: z.string().min(1).max(300).optional(),
  type: TASK_TYPE.optional(),
  priority: PRIORITY.optional(),
  dueDate: z.string().nullable().optional().describe("YYYY-MM-DD or ISO date/time; null clears it"),
  description: z.string().optional(),
  contactId: z.number().int().nullable().optional(),
  propertyId: z.number().int().nullable().optional(),
  reopen: z.boolean().optional().describe("Set true to reopen a completed task"),
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(ms: number, now: number) {
  const days = Math.floor((now - ms) / DAY_MS);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function contactLabel(c: Contact) {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return c.company ? `${name} (${c.company})` : name;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Date-only strings ("2026-10-08") are pinned to noon UTC so they don't shift a day. */
function parseDue(value: string): Date | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function contactSummary(c: Contact) {
  return {
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim(),
    company: c.company,
    email: c.email,
    phone: c.phone,
    priority: c.priority,
    lastContactedAt: c.lastContactedAt,
  };
}

const isOpen = (t: Task) => t.status === "pending" || t.status === "in_progress";

export function registerBrokrbaseTools(server: McpServer, userId: number) {
  /** Wraps a handler with logging and a friendly error instead of a crash. */
  function run<A>(name: string, fn: (args: A) => Promise<ToolResult>) {
    return async (args: A): Promise<ToolResult> => {
      console.log(`[mcp] user=${userId} tool=${name}`);
      try {
        return await fn(args);
      } catch (e) {
        console.error(`[mcp] user=${userId} tool=${name} failed:`, e);
        return fail(`Something went wrong running ${name}. Please try again.`);
      }
    };
  }

  async function contactNames(ids: (number | null)[]) {
    const unique = Array.from(new Set(ids.filter((id): id is number => !!id)));
    const rows = await Promise.all(unique.map((id) => getContactById(id, userId)));
    return new Map(rows.filter(Boolean).map((c) => [c!.id, `${c!.firstName} ${c!.lastName}`.trim()]));
  }

  async function propertyNames(ids: (number | null)[]) {
    const unique = Array.from(new Set(ids.filter((id): id is number => !!id)));
    const rows = await Promise.all(unique.map((id) => getPropertyById(id, userId)));
    return new Map(rows.filter(Boolean).map((p) => [p!.id, p!.name]));
  }

  /**
   * Ownership check + human-readable target, e.g. " with John Smith (Acme) on Fairview".
   * Returns an error message string if an id isn't the user's.
   */
  async function resolveTargets(contactId?: number, propertyId?: number): Promise<{ text: string } | string> {
    let text = "";
    if (contactId) {
      const c = await getContactById(contactId, userId);
      if (!c) return `No contact with id ${contactId}.`;
      text += ` with ${contactLabel(c)}`;
    }
    if (propertyId) {
      const p = await getPropertyById(propertyId, userId);
      if (!p) return `No property with id ${propertyId}.`;
      text += ` on ${p.name}`;
    }
    return { text };
  }

  // ─── Read tools ────────────────────────────────────────────────────────────

  server.registerTool(
    "search_contacts",
    {
      title: "Search contacts",
      description:
        "Find contacts by name, company, email, or phone, ranked best-first. If the user mentioned a property, pass it as `property` so people linked to that property rank first. The response says whether there's a clear best match or a close call. Clear match: use it, then name who you used so the user can correct you. Close call: ask the user which one before writing anything.",
      inputSchema: {
        query: z.string().min(1).describe("Name, company, email, or phone"),
        property: z.string().optional().describe("Property name, address, or id the user mentioned, if any"),
      },
      annotations: { readOnlyHint: true },
    },
    run("search_contacts", async ({ query, property }: { query: string; property?: string }) => {
      let candidates: Contact[] = await getContacts(userId, { search: query, limit: 50 });
      let fuzzy = false;
      if (candidates.length === 0) {
        const resolved = await resolveContactMention(userId, { name: query });
        const ids = resolved.topCandidates?.map((c) => c.id) ?? (resolved.id ? [resolved.id] : []);
        candidates = (await Promise.all(ids.map((id) => getContactById(id, userId)))).filter(Boolean) as Contact[];
        fuzzy = true;
      }
      if (candidates.length === 0) {
        return ok({ contacts: [], guidance: "No contacts match. Ask the user who they meant, or offer to create a new contact." });
      }

      // Contacts linked to the mentioned property, with their role there
      const linkedAt = new Map<number, string>();
      if (property?.trim()) {
        const props = /^\d+$/.test(property.trim())
          ? [await getPropertyById(Number(property), userId)].filter(Boolean)
          : await getProperties(userId, { search: property.trim(), limit: 5 });
        for (const p of props) {
          for (const l of await getContactsForProperty(p!.id, userId)) {
            linkedAt.set(l.contactId, `${(l.dealRole ?? "linked").replace(/_/g, " ")} at ${p!.name}`);
          }
        }
      }

      // Tier: linked to the property (4) + exact name (2) + contacted in the last 30 days (1)
      const q = query.trim().toLowerCase();
      const now = Date.now();
      const scored = candidates
        .map((c) => {
          const full = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
          const exactName = full === q || c.firstName.toLowerCase() === q || c.lastName.toLowerCase() === q;
          const last = c.lastContactedAt ? new Date(c.lastContactedAt).getTime() : 0;
          const recent = last > 0 && now - last < 30 * DAY_MS;
          const reasons: string[] = [];
          if (linkedAt.has(c.id)) reasons.push(linkedAt.get(c.id)!);
          if (last) reasons.push(`last contacted ${daysAgo(last, now)}`);
          return { c, tier: (linkedAt.has(c.id) ? 4 : 0) + (exactName ? 2 : 0) + (recent ? 1 : 0), last, reasons };
        })
        .sort((a, b) => b.tier - a.tier || b.last - a.last)
        .slice(0, 10);

      const [top, second] = scored;
      const closeCall = !!second && second.tier === top.tier;
      const label = (s: (typeof scored)[number]) => `${contactLabel(s.c)}${s.reasons.length ? ` — ${s.reasons.join(", ")}` : ""}`;
      return ok({
        clearBestMatch: !closeCall,
        guidance: closeCall
          ? `Close call between ${label(top)} and ${label(second)}. Ask the user which one before writing anything.`
          : `Best match: ${label(top)}. Use this contact, then tell the user who you used so they can correct you.`,
        note: fuzzy ? "No direct match; these are the closest fuzzy name matches." : undefined,
        contacts: scored.map((s) => ({ ...contactSummary(s.c), whyRanked: s.reasons })),
      });
    }),
  );

  server.registerTool(
    "get_contact",
    {
      title: "Get contact details",
      description: "Full details for one contact: info, notes, linked properties, recent activity history, and open tasks.",
      inputSchema: { contactId: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    run("get_contact", async ({ contactId }: { contactId: number }) => {
      const contact = await getContactById(contactId, userId);
      if (!contact) return fail(`No contact with id ${contactId}.`);
      const [links, activity, tasks] = await Promise.all([
        getContactPropertyLinks(contactId, userId),
        getActivities(userId, { contactId, limit: 15 }),
        getTasks(userId, { contactId, limit: 50 }),
      ]);
      return ok({
        contact: { ...contactSummary(contact), address: contact.address, city: contact.city, state: contact.state, notes: contact.notes, isOwner: contact.isOwner, isBuyer: contact.isBuyer },
        properties: links.map((l) => ({ propertyId: l.propertyId, name: l.propertyName, city: l.propertyCity, type: l.propertyType, role: l.dealRole })),
        recentActivity: activity.map((a) => ({ id: a.id, type: a.type, subject: a.subject, notes: a.notes, outcome: a.outcome, occurredAt: a.occurredAt })),
        openTasks: tasks.filter(isOpen).map((t) => ({ id: t.id, title: t.title, type: t.type, priority: t.priority, dueAt: t.dueAt })),
      });
    }),
  );

  server.registerTool(
    "search_properties",
    {
      title: "Search properties",
      description: "Find properties in the CRM by name, address, or city.",
      inputSchema: { query: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    run("search_properties", async ({ query }: { query: string }) => {
      const rows = await getProperties(userId, { search: query, limit: 15 });
      return ok({
        properties: rows.map((p) => ({ id: p.id, name: p.name, type: p.propertyType, address: p.address, city: p.city, state: p.state, status: p.status, owner: p.ownerName })),
      });
    }),
  );

  server.registerTool(
    "get_property",
    {
      title: "Get property details",
      description: "Full details for one property: specs, status, linked contacts with their roles, and recent activity.",
      inputSchema: { propertyId: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    run("get_property", async ({ propertyId }: { propertyId: number }) => {
      const p = await getPropertyById(propertyId, userId);
      if (!p) return fail(`No property with id ${propertyId}.`);
      const [contacts, activity] = await Promise.all([
        getContactsForProperty(propertyId, userId),
        getActivitiesForProperty(userId, propertyId, 15),
      ]);
      const { boundary: _boundary, latitude: _lat, longitude: _lng, ...details } = p;
      return ok({
        property: details,
        contacts: contacts.map((c) => ({ contactId: c.contactId, name: `${c.firstName} ${c.lastName}`.trim(), company: c.company, phone: c.phone, email: c.email, role: c.dealRole })),
        recentActivity: activity.map((a) => ({ id: a.id, type: a.type, contact: [a.contactFirstName, a.contactLastName].filter(Boolean).join(" ") || null, subject: a.subject, notes: a.notes, outcome: a.outcome, occurredAt: a.occurredAt })),
      });
    }),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "List the broker's tasks. 'overdue' = open and due before today, 'today' = open and due by end of today (includes overdue), 'open' = everything not completed, 'completed' = recently completed. Times are UTC; the response includes the current server time.",
      inputSchema: { filter: z.enum(["overdue", "today", "open", "completed"]).default("open") },
      annotations: { readOnlyHint: true },
    },
    run("list_tasks", async ({ filter }: { filter: "overdue" | "today" | "open" | "completed" }) => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
      const all = await getTasks(userId, { limit: 500 });
      let tasks = filter === "completed" ? all.filter((t) => t.status === "completed") : all.filter(isOpen);
      if (filter === "overdue") tasks = tasks.filter((t) => t.dueAt && new Date(t.dueAt) < startOfToday);
      if (filter === "today") tasks = tasks.filter((t) => t.dueAt && new Date(t.dueAt) <= endOfToday);
      if (filter === "completed") {
        tasks = tasks.sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()).slice(0, 25);
      }
      const names = await contactNames(tasks.map((t) => t.contactId));
      return ok({
        now: now.toISOString(),
        count: tasks.length,
        tasks: tasks.slice(0, 100).map((t) => ({
          id: t.id, title: t.title, type: t.type, priority: t.priority, status: t.status, dueAt: t.dueAt, completedAt: t.completedAt,
          contactId: t.contactId, contact: t.contactId ? names.get(t.contactId) ?? null : null, propertyId: t.propertyId, description: t.description,
        })),
      });
    }),
  );

  server.registerTool(
    "recent_activity",
    {
      title: "Recent activity",
      description: "The most recent logged calls, emails, meetings, and notes across the whole CRM, newest first. Use this to find an activity's id when the user wants to fix something that was just logged.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(15) },
      annotations: { readOnlyHint: true },
    },
    run("recent_activity", async ({ limit }: { limit: number }) => {
      const rows = await getActivities(userId, { limit });
      const names = await contactNames(rows.map((a) => a.contactId));
      const props = await propertyNames(rows.map((a) => a.propertyId));
      return ok({
        activity: rows.map((a) => ({
          id: a.id, type: a.type, contactId: a.contactId, contact: a.contactId ? names.get(a.contactId) ?? null : null,
          propertyId: a.propertyId, property: a.propertyId ? props.get(a.propertyId) ?? null : null,
          subject: a.subject, notes: a.notes, outcome: a.outcome, occurredAt: a.occurredAt,
        })),
      });
    }),
  );

  // ─── Write tools ───────────────────────────────────────────────────────────

  server.registerTool(
    "log_activity",
    {
      title: "Log activity",
      description:
        "Log a call, email, meeting, text, voicemail, or note, linked to a contact and/or property. Use this whenever the user says they met, called, texted, or had coffee/lunch with an existing contact; coffee or lunch is type meeting. Get ids from search_contacts / search_properties first (pass the property to search_contacts so the right person ranks first). If the search flagged a close call, ask the user first; otherwise just log it. Always finish by telling the user, in one line, the `confirmation` from the response and that they can say so if it's the wrong person.",
      inputSchema: {
        type: ACTIVITY_TYPE,
        contactId: z.number().int().optional(),
        propertyId: z.number().int().optional(),
        subject: z.string().max(300).describe("Short one-line summary"),
        notes: z.string().optional().describe("What was discussed"),
        outcome: OUTCOME.optional(),
        occurredAt: z.string().optional().describe("ISO date/time; defaults to now"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("log_activity", async (a: { type: z.infer<typeof ACTIVITY_TYPE>; contactId?: number; propertyId?: number; subject: string; notes?: string; outcome?: z.infer<typeof OUTCOME>; occurredAt?: string }) => {
      if (!a.contactId && !a.propertyId) return fail("Link the activity to a contact or property (search for one first).");
      const targets = await resolveTargets(a.contactId, a.propertyId);
      if (typeof targets === "string") return fail(targets);
      const occurredAt = a.occurredAt ? new Date(a.occurredAt) : new Date();
      if (isNaN(occurredAt.getTime())) return fail("occurredAt isn't a valid date.");
      const result = await createActivity({ userId, type: a.type, contactId: a.contactId, propertyId: a.propertyId, subject: a.subject, notes: a.notes ?? null, outcome: a.outcome, occurredAt });
      const activityId = (result as unknown as Array<{ insertId: number }>)[0]?.insertId ?? null;
      return ok({
        logged: true,
        activityId,
        confirmation: `Logged ${a.type === "note" ? "a note" : `a ${a.type}`}${targets.text}: "${a.subject}".`,
        ifWrong: "If the user says it's the wrong person or details, fix it with update_activity using this activityId.",
      });
    }),
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a follow-up task, optionally tied to a contact and/or property. Afterwards tell the user the `confirmation` in one line so they can correct anything.",
      inputSchema: {
        title: z.string().min(1).max(300),
        type: TASK_TYPE.default("follow_up"),
        priority: PRIORITY.default("medium"),
        dueDate: z.string().optional().describe("YYYY-MM-DD or ISO date/time"),
        description: z.string().optional(),
        contactId: z.number().int().optional(),
        propertyId: z.number().int().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("create_task", async (t: { title: string; type: z.infer<typeof TASK_TYPE>; priority: z.infer<typeof PRIORITY>; dueDate?: string; description?: string; contactId?: number; propertyId?: number }) => {
      const targets = await resolveTargets(t.contactId, t.propertyId);
      if (typeof targets === "string") return fail(targets);
      const dueAt = t.dueDate ? parseDue(t.dueDate) : null;
      if (t.dueDate && !dueAt) return fail("dueDate isn't a valid date.");
      const taskId = await createTask({ userId, title: t.title, type: t.type, priority: t.priority, dueAt, description: t.description ?? null, contactId: t.contactId ?? null, propertyId: t.propertyId ?? null });
      return ok({
        created: true,
        taskId,
        confirmation: `Created task "${t.title}"${targets.text}${dueAt ? `, due ${dueAt.toISOString().slice(0, 10)}` : ", no due date"}.`,
        ifWrong: "Fix anything with update_task using this taskId.",
      });
    }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description: "Mark a task complete. If the task has a contact, an activity is also logged in their history with the note. Get the task id from list_tasks or get_contact. Tell the user the `confirmation` afterwards.",
      inputSchema: {
        taskId: z.number().int(),
        note: z.string().optional().describe("What happened"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("complete_task", async ({ taskId, note }: { taskId: number; note?: string }) => {
      const task = await getTaskById(taskId, userId);
      if (!task) return fail(`No task with id ${taskId}.`);
      if (task.status === "completed") return ok({ alreadyCompleted: true, title: task.title });
      const targets = await resolveTargets(task.contactId ?? undefined, task.propertyId ?? undefined);
      const result = await completeTaskWithLog(task, userId, note);
      return ok({
        completed: true,
        ...result,
        confirmation: `Completed "${task.title}"${typeof targets === "string" ? "" : targets.text}${result.activityLogged ? " and logged it in their history" : ""}.`,
        ifWrong: "Reopen with update_task (reopen: true). The logged activity can be corrected with update_activity.",
      });
    }),
  );

  server.registerTool(
    "create_contact",
    {
      title: "Create contact",
      description:
        "Add a new contact, e.g. from a business card photo or someone the user just met. Fill every field you can from the card. " +
        "Split what you know into two places: `notes` holds lasting facts about the person as short lines (job title, website, what they own or are looking for, especially a building that isn't in the CRM yet, e.g. \"Owns the strip center on Fairview Ave\"). " +
        "`metThem` logs the interaction itself in their history: if the user met them, called them, or talked with them, put where/when and what was discussed there, not in notes. Skip filler like logos or slogans. " +
        "Checks for likely duplicates first: if any are found, nothing is created and they're returned; ask the user whether one is the same person, and only pass confirmNew: true if it's someone different. " +
        "After creating, reply with the `confirmation`, then do any other follow-ups the user asked for (create_task, link_contact_to_property if the building is in the CRM).",
      inputSchema: CREATE_CONTACT_SHAPE,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("create_contact", async ({ confirmNew, metThem, ...c }: z.infer<z.ZodObject<typeof CREATE_CONTACT_SHAPE>>) => {
      const metAt = metThem?.occurredAt ? new Date(metThem.occurredAt) : new Date();
      if (isNaN(metAt.getTime())) return fail("metThem.occurredAt isn't a valid date.");
      if (!confirmNew) {
        const similar = await findSimilarContacts(userId, c);
        if (similar.length > 0) {
          return ok({ created: false, possibleDuplicates: similar, note: "Possible duplicates found. Ask the user whether one is the same person. If it's the same person, don't create anyone: log the interaction on the existing contact with log_activity, and add any new facts with update_contact. If it's someone different, call create_contact again with confirmNew: true." });
        }
      }
      const result = await createContact({
        userId,
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        address: c.address ?? null,
        city: c.city ?? null,
        state: c.state ?? null,
        zip: c.zip ?? null,
        isOwner: c.isOwner ?? false,
        isBuyer: c.isBuyer ?? false,
        notes: c.notes ?? null,
        notesUpdatedAt: c.notes ? new Date() : null,
      });
      const contactId = (result as { insertId?: number }).insertId;
      let activityId: number | null = null;
      if (metThem && contactId) {
        const logged = await createActivity({
          userId,
          contactId,
          type: metThem.type,
          subject: metThem.summary,
          notes: metThem.details ?? null,
          occurredAt: metAt,
        });
        activityId = (logged as unknown as Array<{ insertId: number }>)[0]?.insertId ?? null;
      }
      const name = `${c.firstName} ${c.lastName}`.trim();
      const extras = [c.notes && "notes", metThem && `logged the ${metThem.type === "note" ? "note" : metThem.type} in their history`].filter(Boolean);
      return ok({
        created: true,
        contactId,
        activityId,
        confirmation: `Added ${c.company ? `${name} (${c.company})` : name} as a new contact${extras.length ? `, with ${extras.join(" and ")}` : ""}.`,
      });
    }),
  );

  server.registerTool(
    "update_contact",
    {
      title: "Update contact",
      description: "Update a contact's details. Only the fields you pass are changed. For notes, pass the full new notes text: read the current notes with get_contact first and add to them, so nothing is lost.",
      inputSchema: UPDATE_CONTACT_SHAPE,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("update_contact", async ({ contactId, ...fields }: z.infer<z.ZodObject<typeof UPDATE_CONTACT_SHAPE>>) => {
      if (!(await getContactById(contactId, userId))) return fail(`No contact with id ${contactId}.`);
      const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (Object.keys(data).length === 0) return fail("No fields to update.");
      await updateContact(contactId, userId, "notes" in data ? { ...data, notesUpdatedAt: new Date() } : data);
      return ok({ updated: true, fields: Object.keys(data) });
    }),
  );

  server.registerTool(
    "link_contact_to_property",
    {
      title: "Link contact to property",
      description: "Connect a contact to a property with a role (owner, tenant, buyer, etc.).",
      inputSchema: {
        contactId: z.number().int(),
        propertyId: z.number().int(),
        role: DEAL_ROLE,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("link_contact_to_property", async ({ contactId, propertyId, role }: { contactId: number; propertyId: number; role: z.infer<typeof DEAL_ROLE> }) => {
      if (!(await getContactById(contactId, userId))) return fail(`No contact with id ${contactId}.`);
      if (!(await getPropertyById(propertyId, userId))) return fail(`No property with id ${propertyId}.`);
      const existing = await getContactPropertyLinks(contactId, userId);
      if (existing.some((l) => l.propertyId === propertyId)) return ok({ linked: true, alreadyLinked: true });
      await createContactPropertyLink({ userId, contactId, propertyId, dealRole: role, source: "manual" });
      return ok({ linked: true, role });
    }),
  );

  // ─── Fix tools (corrections, never deletes) ────────────────────────────────

  server.registerTool(
    "update_activity",
    {
      title: "Fix an activity",
      description:
        "Correct a logged activity: move it to a different contact or property (\"that was the other John\"), or change its type, subject, notes, outcome, or date. Only the fields you pass change. Use recent_activity or get_contact to find the activity id. Tell the user the `confirmation` afterwards.",
      inputSchema: UPDATE_ACTIVITY_SHAPE,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("update_activity", async ({ activityId, occurredAt, ...fields }: z.infer<z.ZodObject<typeof UPDATE_ACTIVITY_SHAPE>>) => {
      const detail = await getActivityDetail(activityId, userId);
      if (!detail) return fail(`No activity with id ${activityId}.`);
      const before = detail.activity;
      const targets = await resolveTargets(fields.contactId ?? undefined, fields.propertyId ?? undefined);
      if (typeof targets === "string") return fail(targets);
      const data: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (occurredAt !== undefined) {
        const d = new Date(occurredAt);
        if (isNaN(d.getTime())) return fail("occurredAt isn't a valid date.");
        data.occurredAt = d;
      }
      if (Object.keys(data).length === 0) return fail("No fields to change.");
      await updateActivity(activityId, userId, data);

      // Keep "last contacted" honest on both the old and new contact
      const contactChanged = fields.contactId !== undefined && fields.contactId !== before.contactId;
      if (contactChanged || data.occurredAt) {
        const ids = new Set([before.contactId, fields.contactId ?? before.contactId].filter((id): id is number => !!id));
        for (const id of Array.from(ids)) await recomputeContactLastContacted(id, userId);
      }

      const after = await resolveTargets(fields.contactId === undefined ? before.contactId ?? undefined : fields.contactId ?? undefined,
        fields.propertyId === undefined ? before.propertyId ?? undefined : fields.propertyId ?? undefined);
      return ok({
        updated: true,
        changed: Object.keys(data),
        confirmation: `Updated the ${(data.type as string) ?? before.type}${typeof after === "string" ? "" : after.text}.`,
      });
    }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Fix or reschedule a task",
      description:
        "Change a task: reschedule it, rename it, change priority/type, move it to a different contact or property, or reopen it if it was completed by mistake (reopen: true). Only the fields you pass change. Reopening doesn't remove the activity logged at completion; fix that with update_activity if needed. Tell the user the `confirmation` afterwards.",
      inputSchema: UPDATE_TASK_SHAPE,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("update_task", async ({ taskId, dueDate, reopen, ...fields }: z.infer<z.ZodObject<typeof UPDATE_TASK_SHAPE>>) => {
      const task = await getTaskById(taskId, userId);
      if (!task) return fail(`No task with id ${taskId}.`);
      const targets = await resolveTargets(fields.contactId ?? undefined, fields.propertyId ?? undefined);
      if (typeof targets === "string") return fail(targets);
      const data: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (dueDate !== undefined) {
        const d = dueDate === null ? null : parseDue(dueDate);
        if (dueDate !== null && !d) return fail("dueDate isn't a valid date.");
        data.dueAt = d;
      }
      if (reopen) {
        data.status = "pending";
        data.completedAt = null;
      }
      if (Object.keys(data).length === 0) return fail("No fields to change.");
      await updateTask(taskId, userId, data);
      const title = (data.title as string) ?? task.title;
      const due = data.dueAt !== undefined ? (data.dueAt ? `, now due ${(data.dueAt as Date).toISOString().slice(0, 10)}` : ", no due date") : "";
      return ok({
        updated: true,
        changed: Object.keys(data),
        confirmation: `Updated task "${title}"${reopen ? " (reopened)" : ""}${due}.`,
      });
    }),
  );
}
