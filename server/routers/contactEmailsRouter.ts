import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  getContactEmails,
  addContactEmail,
  removeContactEmail,
  setPrimaryContactEmail,
  findContactByEmail,
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
      // Step 0: Email-first lookup — if caller provides explicit sender email, try it immediately
      if (input.senderEmail) {
        const directMatch = await findContactByEmail(input.senderEmail.toLowerCase().trim(), ctx.user.id);
        if (directMatch) {
          return {
            primaryContactId: directMatch.id,
            primaryContactName: `${directMatch.firstName} ${directMatch.lastName}`,
            primaryContactEmail: directMatch.email ?? input.senderEmail,
            primaryContactCompany: directMatch.company ?? "",
            primaryContactPhone: "",
            confidence: "high" as const,
            reasoning: "Direct email match from sender address.",
            matchedContact: {
              id: directMatch.id,
              firstName: directMatch.firstName,
              lastName: directMatch.lastName,
              company: directMatch.company ?? null,
              email: directMatch.email ?? null,
              isOwner: directMatch.isOwner ?? null,
              isBuyer: directMatch.isBuyer ?? null,
              lastContactedAt: directMatch.lastContactedAt ?? null,
            },
          };
        }
      }

      // Step 1: Load all contacts for AI context
      const allContacts = await getContacts(ctx.user.id, { limit: 2000 });

      // Step 2: Extract all email addresses from the thread
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const foundEmails = Array.from(new Set((input.thread.match(emailRegex) ?? []).map(e => e.toLowerCase())));

      // Step 3: Build contact list for AI — include emails so AI can reason about who is who
      const contactListStr = allContacts.slice(0, 300).map(c =>
        `${c.id}:${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ""}${c.email ? ` <${c.email}>` : ""}`
      ).join("\n");

      // Step 4: Ask AI to identify the PRIMARY contact and extract their specific email.
      // AI's job: figure out WHO this interaction is about (not just who sent it).
      // We then use the email AI identifies to do a hard DB match — we do NOT trust the ID AI returns,
      // because AI can hallucinate IDs or pick the wrong person by name.
      const prompt = `You are a CRM assistant for a commercial real estate broker (Chriskott Todd, multifamily broker in Idaho/Montana).

Analyze this email thread and identify who the PRIMARY CONTACT is — the person the broker should log this interaction against in the CRM. This is NOT necessarily the sender. It could be:
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
      // If the AI extracted an email for the primary contact and it exists in the CRM,
      // that contact wins — regardless of what ID the AI guessed.
      if (result.primaryContactEmail) {
        const emailMatch = await findContactByEmail(result.primaryContactEmail.toLowerCase().trim(), ctx.user.id);
        if (emailMatch) {
          return {
            ...result,
            primaryContactId: emailMatch.id,
            confidence: "high" as const, // email match is always high confidence
            matchedContact: {
              id: emailMatch.id,
              firstName: emailMatch.firstName,
              lastName: emailMatch.lastName,
              company: emailMatch.company ?? null,
              email: emailMatch.email ?? null,
              isOwner: emailMatch.isOwner ?? null,
              isBuyer: emailMatch.isBuyer ?? null,
              lastContactedAt: emailMatch.lastContactedAt ?? null,
            },
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
