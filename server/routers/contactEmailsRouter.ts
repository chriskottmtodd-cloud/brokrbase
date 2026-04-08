import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  getContactEmails,
  addContactEmail,
  removeContactEmail,
  setPrimaryContactEmail,
  findContactByEmail,
  findContactsByEmail,
  getContacts,
} from "../db";

export const contactEmailsRouter = router({
  /** List all emails for a contact */
  list: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(({ ctx, input }) => getContactEmails(input.contactId, ctx.user.id)),

  /** Add a new email to a contact */
  add: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      email: z.string().email(),
      label: z.string().optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) =>
      addContactEmail(input.contactId, ctx.user.id, input.email, input.label, input.isPrimary)
    ),

  /** Remove an email from a contact */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => removeContactEmail(input.id, ctx.user.id)),

  /** Set an email as the primary email for a contact */
  setPrimary: protectedProcedure
    .input(z.object({ id: z.number(), contactId: z.number() }))
    .mutation(({ ctx, input }) =>
      setPrimaryContactEmail(input.id, input.contactId, ctx.user.id)
    ),

  /**
   * AI-powered: given an email thread, detect the primary contact.
   *
   * Matching priority:
   * 1. AI identifies WHO the interaction is about + extracts their specific email
   * 2. Hard DB lookup on that specific email → deterministic, 100% accurate
   * 3. Only if no email match → fall back to AI's suggested contact ID
   * 4. If no match at all → return AI-extracted info for new contact creation
   *
   * This prevents false matches where a colleague's email in the thread
   * causes the wrong contact to be selected.
   */
  detectFromThread: protectedProcedure
    .input(z.object({
      thread: z.string().min(1),
      background: z.string().optional(),
      senderEmail: z.string().optional(), // explicit sender email for email-first matching
    }))
    .mutation(async ({ ctx, input }) => {
      // Step 0: Email-first lookup — if caller provides an explicit sender email,
      // try it immediately. If multiple contacts share that email (a common
      // duplicate case), return ALL of them so the UI can let the broker pick.
      if (input.senderEmail) {
        const directMatches = await findContactsByEmail(input.senderEmail.toLowerCase().trim(), ctx.user.id);
        if (directMatches.length > 0) {
          const primary = directMatches[0];
          return {
            primaryContactId: primary.id,
            primaryContactName: `${primary.firstName} ${primary.lastName}`,
            primaryContactEmail: primary.email ?? input.senderEmail,
            primaryContactCompany: primary.company ?? "",
            primaryContactPhone: primary.phone ?? "",
            confidence: "high" as const,
            reasoning:
              directMatches.length > 1
                ? `Found ${directMatches.length} contacts with this email — pick the right one.`
                : "Direct email match from sender address.",
            matchedContact: {
              id: primary.id,
              firstName: primary.firstName,
              lastName: primary.lastName,
              company: primary.company ?? null,
              email: primary.email ?? null,
              isOwner: primary.isOwner ?? null,
              isBuyer: primary.isBuyer ?? null,
              lastContactedAt: primary.lastContactedAt ?? null,
            },
            // All matches for the email — useful when there are duplicates and
            // the broker needs to disambiguate.
            allEmailMatches: directMatches.map((c) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              company: c.company ?? null,
              email: c.email ?? null,
              isOwner: c.isOwner ?? null,
              isBuyer: c.isBuyer ?? null,
              lastContactedAt: c.lastContactedAt ?? null,
            })),
          };
        }
      }

      // Step 1: Load all contacts for AI context
      const allContacts = await getContacts(ctx.user.id, { limit: 2000 });

      // Step 2: Extract all email addresses from the thread
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const foundEmails = Array.from(new Set((input.thread.match(emailRegex) ?? []).map(e => e.toLowerCase())));

      // Step 3: Build contact list for AI — include emails so AI can reason about who is who.
      // Bumped from 300 → 1000 so smaller CRMs (under 1k contacts) get full coverage.
      // The client also runs a local fuzzy match as a backup for anything beyond this.
      const contactListStr = allContacts.slice(0, 1000).map(c =>
        `${c.id}:${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ""}${c.email ? ` <${c.email}>` : ""}`
      ).join("\n");

      // Step 4: Ask AI to identify the PRIMARY contact and extract their specific email.
      // AI's job: figure out WHO this interaction is about (not just who sent it).
      // We then use the email AI identifies to do a hard DB match — we do NOT trust the ID AI returns,
      // because AI can hallucinate IDs or pick the wrong person by name.
      // Load the user's profile so the AI doesn't bias toward who SENT the email
      // (which is often the broker themselves) and instead picks the actual counterparty.
      const { getUserById } = await import("../db");
      let senderName = "the broker";
      let senderCompany: string | undefined;
      let senderEmail: string | undefined;
      try {
        const userProfile = await getUserById(ctx.user.id);
        if (userProfile) {
          senderName = userProfile.name?.trim() || senderName;
          senderCompany = userProfile.company?.trim() || undefined;
          senderEmail = userProfile.email?.trim() || undefined;
        }
      } catch { /* ignore */ }

      const prompt = `You are a CRM assistant for a commercial real estate broker named ${senderName}${senderCompany ? ` at ${senderCompany}` : ""}${senderEmail ? ` (${senderEmail})` : ""}.

CRITICAL: ${senderName} is the BROKER. They are the one using the CRM. They are NEVER the "primary contact" — they are the user, not the counterparty. Even if their email or name appears in the thread, NEVER pick them. The primary contact is always the OTHER person — the one ${senderName} is communicating WITH.

Analyze this email thread and identify who the PRIMARY CONTACT is — the person ${senderName} should log this interaction against in the CRM. This is NOT necessarily the sender. It could be:
- A buyer being introduced by a colleague
- A property owner being discussed
- A principal CC'd on the thread
- The person the email is actually about

Think carefully about the context and purpose of the email, not just who sent it.
IMPORTANT: If the primary contact has an email address visible anywhere in the thread, return it in primaryContactEmail — this will be used for an exact database lookup to find the correct CRM record, overriding any ID guess.

${input.background ? `BACKGROUND: ${input.background}\n` : ""}
EMAIL THREAD:
${input.thread.slice(0, 3000)}

EXISTING CRM CONTACTS (id:name <email>):
${contactListStr || "(none yet)"}

EMAIL ADDRESSES FOUND IN THREAD: ${foundEmails.join(", ") || "none"}

Return ONLY valid JSON:
{
  "primaryContactId": <number or null — only set if you are highly confident this CRM ID matches>,
  "primaryContactName": "<full name>",
  "primaryContactEmail": "<the specific email address for this person, extracted from the thread — empty string if not visible>",
  "primaryContactCompany": "<company if visible>",
  "primaryContactPhone": "<phone if visible in signature>",
  "confidence": "high|medium|low",
  "reasoning": "<one sentence explaining why this person is the primary contact>"
}

If not found in CRM, set primaryContactId to null and fill in name/email/company/phone for creating a new contact.`;

      const response = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "contact_detection",
            strict: true,
            schema: {
              type: "object",
              properties: {
                primaryContactId: { type: ["number", "null"] },
                primaryContactName: { type: "string" },
                primaryContactEmail: { type: "string" },
                primaryContactCompany: { type: "string" },
                primaryContactPhone: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                reasoning: { type: "string" },
              },
              required: ["primaryContactId", "primaryContactName", "primaryContactEmail", "primaryContactCompany", "primaryContactPhone", "confidence", "reasoning"],
              additionalProperties: false,
            },
          },
        },
      });

      const raw = (response as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content ?? "{}";
      const result = JSON.parse(raw) as {
        primaryContactId: number | null;
        primaryContactName: string;
        primaryContactEmail: string;
        primaryContactCompany: string;
        primaryContactPhone: string;
        confidence: "high" | "medium" | "low";
        reasoning: string;
      };

      // Step 5: Hard email match — AI identified the person, now use THEIR specific email
      // for a deterministic lookup. Email is always more reliable than an AI-guessed ID.
      // If multiple contacts share that email, return all of them so the broker can pick.
      if (result.primaryContactEmail) {
        const emailMatches = await findContactsByEmail(result.primaryContactEmail.toLowerCase().trim(), ctx.user.id);
        if (emailMatches.length > 0) {
          const primary = emailMatches[0];
          return {
            ...result,
            primaryContactId: primary.id,
            confidence: "high" as const,
            reasoning:
              emailMatches.length > 1
                ? `Found ${emailMatches.length} contacts with this email — pick the right one.`
                : result.reasoning,
            matchedContact: {
              id: primary.id,
              firstName: primary.firstName,
              lastName: primary.lastName,
              company: primary.company ?? null,
              email: primary.email ?? null,
              isOwner: primary.isOwner ?? null,
              isBuyer: primary.isBuyer ?? null,
              lastContactedAt: primary.lastContactedAt ?? null,
            },
            allEmailMatches: emailMatches.map((c) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              company: c.company ?? null,
              email: c.email ?? null,
              isOwner: c.isOwner ?? null,
              isBuyer: c.isBuyer ?? null,
              lastContactedAt: c.lastContactedAt ?? null,
            })),
          };
        }
      }

      // Step 6: No email match — validate the AI's suggested ID as a secondary signal.
      // This handles cases where the primary contact has no email in the thread.
      if (result.primaryContactId) {
        const found = allContacts.find(c => c.id === result.primaryContactId);
        if (found) {
          return {
            ...result,
            matchedContact: {
              id: found.id,
              firstName: found.firstName,
              lastName: found.lastName,
              company: found.company ?? null,
              email: found.email ?? null,
              isOwner: found.isOwner ?? null,
              isBuyer: found.isBuyer ?? null,
              lastContactedAt: found.lastContactedAt ?? null,
            },
          };
        }
        // AI returned an invalid/hallucinated ID — clear it so caller knows to create a new contact
        result.primaryContactId = null;
      }

      // Step 7: No match at all — return AI-extracted info for new contact creation
      return { ...result, matchedContact: null };
    }),
});
