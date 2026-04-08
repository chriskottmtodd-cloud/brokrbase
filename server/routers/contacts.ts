import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createContact,
  deleteContact,
  findSimilarContacts,
  getActivities,
  getContactById,
  getContacts,
  getProperties,
  globalSearch,
  normalizeContactNameCasing,
  updateContact,
  updateProperty,
  findPropertyByOwnerName,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

export const contactsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          isOwner: z.boolean().optional(),
          isBuyer: z.boolean().optional(),
          priority: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
          linkedPropertyId: z.number().optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) => getContacts(ctx.user.id, input)),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const contact = await getContactById(input.id, ctx.user.id);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });
      return contact;
    }),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().default(""),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        company: z.string().optional(),
        isOwner: z.boolean().default(false),
        isBuyer: z.boolean().default(false),
        buyerType: z.enum(["individual", "institutional", "family_office", "syndication", "other"]).optional(),
        buyerCriteria: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        priority: z.enum(["hot", "warm", "cold", "inactive"]).default("warm"),
        tags: z.string().optional(),
        notes: z.string().optional(),
        ownerNotes: z.string().optional(),
        nextFollowUpAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await createContact({ ...input, userId: ctx.user.id });
      const newId = (result as { insertId?: number })?.insertId;
      if (!newId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Insert failed" });
      const contact = await getContactById(newId, ctx.user.id);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });
      return contact;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        isOwner: z.boolean().optional(),
        isBuyer: z.boolean().optional(),
        buyerType: z.enum(["individual", "institutional", "family_office", "syndication", "other"]).optional(),
        buyerCriteria: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        priority: z.enum(["hot", "warm", "cold", "inactive"]).optional(),
        tags: z.string().optional(),
        notes: z.string().optional(),
        ownerNotes: z.string().optional(),
        nextFollowUpAt: z.date().optional().nullable(),
        lastContactedAt: z.date().optional().nullable(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateContact(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteContact(input.id, ctx.user.id)),

  getPropertiesForContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(({ ctx, input }) =>
      getProperties(ctx.user.id, { ownerId: input.contactId })
    ),

  getActivitiesForContact: protectedProcedure
    .input(
      z.object({ contactId: z.number(), limit: z.number().optional() })
    )
    .query(({ ctx, input }) =>
      getActivities(ctx.user.id, {
        contactId: input.contactId,
        limit: input.limit,
      })
    ),

  bulkImport: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            firstName: z.string(),
            lastName: z.string(),
            email: z.string().optional(),
            phone: z.string().optional(),
            company: z.string().optional(),
            isOwner: z.boolean().default(false),
            isBuyer: z.boolean().default(false),
            address: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            zip: z.string().optional(),
            priority: z
              .enum(["hot", "warm", "cold", "inactive"])
              .default("warm"),
            notes: z.string().optional(),
            ownerNotes: z.string().optional(),
            linkedPropertyOwnerName: z.string().optional(),
          })
        ),
        skipDuplicates: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        index: number;
        name: string;
        status: "ok" | "error" | "skipped_duplicate";
        linkedPropertyId?: number;
        error?: string;
      }> = [];
      const existing = await getContacts(ctx.user.id, { limit: 2000 });
      const existingNames = new Set(
        existing.map(
          (c) => `${c.firstName.toLowerCase()} ${c.lastName.toLowerCase()}`
        )
      );
      const existingEmails = new Set(
        existing.map((c) => c.email?.toLowerCase()).filter(Boolean)
      );
      let inserted = 0;
      let linked = 0;

      for (let index = 0; index < input.rows.length; index++) {
        const row = input.rows[index];
        const fullName = `${row.firstName.toLowerCase()} ${row.lastName.toLowerCase()}`;
        const name = `${row.firstName} ${row.lastName}`;
        try {
          if (input.skipDuplicates) {
            if (existingNames.has(fullName)) {
              results.push({ index, name, status: "skipped_duplicate" });
              continue;
            }
            if (
              row.email &&
              existingEmails.has(row.email.toLowerCase())
            ) {
              results.push({ index, name, status: "skipped_duplicate" });
              continue;
            }
          }
          const insertResult = await createContact({
            userId: ctx.user.id,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email || undefined,
            phone: row.phone || undefined,
            company: row.company || undefined,
            isOwner: row.isOwner,
            isBuyer: row.isBuyer,
            address: row.address || undefined,
            city: row.city || undefined,
            state: row.state || undefined,
            zip: row.zip || undefined,
            priority: row.priority,
            notes: row.notes || undefined,
            ownerNotes: row.ownerNotes || undefined,
          });
          inserted++;
          existingNames.add(fullName);
          if (row.email) existingEmails.add(row.email.toLowerCase());

          let linkedPropertyId: number | undefined;
          if (row.linkedPropertyOwnerName && insertResult?.insertId) {
            const propId = await findPropertyByOwnerName(
              ctx.user.id,
              row.linkedPropertyOwnerName
            );
            if (propId) {
              await updateProperty(propId, ctx.user.id, {
                ownerId: insertResult.insertId,
              });
              linkedPropertyId = propId;
              linked++;
            }
          }
          results.push({ index, name, status: "ok", linkedPropertyId });
        } catch (err) {
          results.push({ index, name, status: "error", error: String(err) });
        }
      }
      return {
        total: input.rows.length,
        inserted,
        linked,
        skipped: results.filter((r) => r.status === "skipped_duplicate")
          .length,
        failed: results.filter((r) => r.status === "error").length,
        results,
      };
    }),

  checkDuplicate: protectedProcedure
    .input(
      z.object({
        firstName: z.string(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .query(({ ctx, input }) =>
      findSimilarContacts(ctx.user.id, input)
    ),

  normalizeNameCasing: protectedProcedure
    .mutation(({ ctx }) => normalizeContactNameCasing(ctx.user.id)),
  globalSearch: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(({ ctx, input }) => globalSearch(ctx.user.id, input.query)),

  // AI-powered living notes refresh — rewrites the contact's notes as a single
  // short paragraph incorporating the new context. Never appends; always rewrites.
  refreshNotes: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      newContext: z.string(), // what just happened (activity summary, deal update, etc.)
    }))
    .mutation(async ({ ctx, input }) => {
      const contact = await getContactById(input.contactId, ctx.user.id);
      if (!contact) throw new Error("Contact not found");

      // Pull the 5 most recent activities for this contact
      const recentActivities = await getActivities(ctx.user.id, {
        contactId: input.contactId,
        limit: 5,
      });
      const activitySummary = recentActivities
        .map((a) => `${a.type} on ${new Date(a.occurredAt ?? Date.now()).toLocaleDateString()}: ${a.subject ?? ""} ${a.notes ? "— " + a.notes.slice(0, 120) : ""}`.trim())
        .join("\n");

      const prompt = `You are updating the CRM notes for a commercial real estate contact. Write a single short paragraph (2-4 sentences max) that describes who this person is and where things stand with them. Be factual and specific — include their role, any deals or properties they're involved in, and their current status. Do NOT use bullet points, timestamps, or log-style entries. Just a clean, human-readable paragraph a broker would write about a contact.

CONTACT:
Name: ${contact.firstName} ${contact.lastName}
Company: ${contact.company ?? "unknown"}
Role: ${contact.isOwner ? "Owner/Seller" : ""}${contact.isBuyer ? " Buyer" : ""}
Phone: ${contact.phone ?? ""}
Email: ${contact.email ?? ""}

CURRENT NOTES:
${contact.notes ?? "(none yet)"}

RECENT ACTIVITY:
${activitySummary || "(none logged)"}

NEW CONTEXT TO INCORPORATE:
${input.newContext}

Write the updated notes paragraph now. Return only the paragraph text — no labels, no preamble.`;

      const response = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const updatedNotes = (response.choices[0]?.message?.content as string ?? "").trim();
      if (!updatedNotes) return { updated: false };

      await updateContact(input.contactId, ctx.user.id, { notes: updatedNotes, notesUpdatedAt: new Date() });
      return { updated: true, notes: updatedNotes };
    }),

  // Scan a batch of import rows and return which ones have potential duplicates
  scanImportForDuplicates: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            index: z.number(),
            firstName: z.string(),
            lastName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const flagged: Array<{
        index: number;
        matches: Array<{ id: number; firstName: string; lastName: string | null; email: string | null; phone: string | null; company: string | null }>;
      }> = [];
      for (const row of input.rows) {
        const matches = await findSimilarContacts(ctx.user.id, {
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
        });
        if (matches.length > 0) {
          flagged.push({ index: row.index, matches });
        }
      }
      return flagged;
    }),
});
