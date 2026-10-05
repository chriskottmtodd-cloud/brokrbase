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
  getContactById,
  getContactPropertyLinks,
  getContacts,
  getContactsForProperty,
  getProperties,
  getPropertyById,
  getTaskById,
  getTasks,
  updateContact,
} from "../db";
import { resolveContactMention } from "../_core/entityResolution";

const ACTIVITY_TYPE = z.enum(["call", "email", "meeting", "note", "text", "voicemail"]);
const OUTCOME = z.enum(["reached", "voicemail", "no_answer", "callback_requested", "not_interested", "interested", "follow_up"]);
const TASK_TYPE = z.enum(["call", "email", "meeting", "follow_up", "research", "other"]);
const PRIORITY = z.enum(["urgent", "high", "medium", "low"]);
const DEAL_ROLE = z.enum(["owner", "seller", "buyer", "tenant", "buyers_broker", "listing_agent", "property_manager", "attorney", "lender", "other"]);

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

  // ─── Read tools ────────────────────────────────────────────────────────────

  server.registerTool(
    "search_contacts",
    {
      title: "Search contacts",
      description:
        "Find contacts in the broker's Brokrbase CRM by name, company, email, or phone. Always use this to get a contact's id before logging activity, creating tasks, or updating them. Falls back to fuzzy name matching (favoring recently contacted people) when there's no direct hit.",
      inputSchema: { query: z.string().min(1).describe("Name, company, email, or phone") },
      annotations: { readOnlyHint: true },
    },
    run("search_contacts", async ({ query }: { query: string }) => {
      const hits = await getContacts(userId, { search: query, limit: 15 });
      if (hits.length > 0) return ok({ contacts: hits.map(contactSummary) });
      const resolved = await resolveContactMention(userId, { name: query });
      const ids = resolved.topCandidates?.map((c) => c.id) ?? (resolved.id ? [resolved.id] : []);
      const fuzzy = (await Promise.all(ids.map((id) => getContactById(id, userId)))).filter(Boolean) as Contact[];
      return ok({
        contacts: fuzzy.map(contactSummary),
        note: fuzzy.length ? "No exact match; these are the closest fuzzy matches." : "No contacts found.",
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
      description: "The most recent logged calls, emails, meetings, and notes across the whole CRM.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(15) },
      annotations: { readOnlyHint: true },
    },
    run("recent_activity", async ({ limit }: { limit: number }) => {
      const rows = await getActivities(userId, { limit });
      const names = await contactNames(rows.map((a) => a.contactId));
      return ok({
        activity: rows.map((a) => ({ id: a.id, type: a.type, contactId: a.contactId, contact: a.contactId ? names.get(a.contactId) ?? null : null, propertyId: a.propertyId, subject: a.subject, notes: a.notes, outcome: a.outcome, occurredAt: a.occurredAt })),
      });
    }),
  );

  // ─── Write tools ───────────────────────────────────────────────────────────

  server.registerTool(
    "log_activity",
    {
      title: "Log activity",
      description:
        "Log a call, email, meeting, text, voicemail, or note in the CRM, linked to a contact and/or property. Look up ids with search_contacts / search_properties first. Confirm the details with the user before logging.",
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
      if (a.contactId && !(await getContactById(a.contactId, userId))) return fail(`No contact with id ${a.contactId}.`);
      if (a.propertyId && !(await getPropertyById(a.propertyId, userId))) return fail(`No property with id ${a.propertyId}.`);
      const occurredAt = a.occurredAt ? new Date(a.occurredAt) : new Date();
      if (isNaN(occurredAt.getTime())) return fail("occurredAt isn't a valid date.");
      await createActivity({ userId, type: a.type, contactId: a.contactId, propertyId: a.propertyId, subject: a.subject, notes: a.notes ?? null, outcome: a.outcome, occurredAt });
      return ok({ logged: true, type: a.type, subject: a.subject });
    }),
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a follow-up task, optionally tied to a contact and/or property. Confirm the title and due date with the user first.",
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
      if (t.contactId && !(await getContactById(t.contactId, userId))) return fail(`No contact with id ${t.contactId}.`);
      if (t.propertyId && !(await getPropertyById(t.propertyId, userId))) return fail(`No property with id ${t.propertyId}.`);
      const dueAt = t.dueDate ? parseDue(t.dueDate) : null;
      if (t.dueDate && !dueAt) return fail("dueDate isn't a valid date.");
      await createTask({ userId, title: t.title, type: t.type, priority: t.priority, dueAt, description: t.description ?? null, contactId: t.contactId ?? null, propertyId: t.propertyId ?? null });
      return ok({ created: true, title: t.title, dueAt });
    }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description: "Mark a task complete. If the task has a contact, an activity is also logged in their history with the note. Get the task id from list_tasks or get_contact.",
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
      const result = await completeTaskWithLog(task, userId, note);
      return ok({ completed: true, title: task.title, ...result });
    }),
  );

  server.registerTool(
    "create_contact",
    {
      title: "Create contact",
      description:
        "Add a new contact. Checks for likely duplicates first: if any are found, nothing is created and they're returned — ask the user whether one of them is the right person. Only pass confirmNew: true after the user says it's a different person.",
      inputSchema: {
        firstName: z.string().min(1).max(100),
        lastName: z.string().max(100).default(""),
        company: z.string().max(200).optional(),
        email: z.string().max(320).optional(),
        phone: z.string().max(30).optional(),
        notes: z.string().optional(),
        confirmNew: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    run("create_contact", async (c: { firstName: string; lastName: string; company?: string; email?: string; phone?: string; notes?: string; confirmNew: boolean }) => {
      if (!c.confirmNew) {
        const similar = await findSimilarContacts(userId, c);
        if (similar.length > 0) {
          return ok({ created: false, possibleDuplicates: similar, note: "Possible duplicates found. Ask the user before creating; pass confirmNew: true if it's a different person." });
        }
      }
      const result = await createContact({ userId, firstName: c.firstName, lastName: c.lastName, company: c.company ?? null, email: c.email ?? null, phone: c.phone ?? null, notes: c.notes ?? null });
      return ok({ created: true, contactId: (result as { insertId?: number }).insertId, name: `${c.firstName} ${c.lastName}`.trim() });
    }),
  );

  server.registerTool(
    "update_contact",
    {
      title: "Update contact",
      description: "Update a contact's details. Only the fields you pass are changed. For notes, pass the full new notes text (read the current notes with get_contact first so nothing is lost).",
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
}
