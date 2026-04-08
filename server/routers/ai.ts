import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createActivity,
  createTask,
  getActivities,
  getActivitiesForProperty,
  getBuyerCriteria,
  getBuyerInterestsByListing,
  getContactById,
  getContactPropertyLinks,
  getContactPropertyLinksForProperty,
  getContacts,
  findSimilarContacts,
  resolveProperty,
  getActiveDeals,
  getDealMatchingData,
  getDealNarrative,
  getListingById,
  getListingByPropertyId,
  getProperties,
  getPropertyById,
  getTasks,
  getUnsolicitedOffers,
  setNarrativeCallback,
  updateProperty,
  updateTask,
  upsertDealNarrative,
} from "../db";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { parseLlmJson } from "../lib/parseLlmJson";
import {
  SYSTEM_PROCESS_NOTES,
  SYSTEM_OUTREACH,
  SYSTEM_DEAL_MATCHER,
  SYSTEM_PRICING,
  SYSTEM_CONTACT_ANALYSIS,
  SYSTEM_PROPERTY_ANALYSIS,
  SYSTEM_CALL_INTEL,
  SYSTEM_DEAL_NARRATIVE,
  EMAIL_STYLE_PROMPT,
} from "../_core/prompts";
import { stripMarkdown, nextWeekday } from "@shared/utils";

// ─── Main AI Router ───────────────────────────────────────────────────────────
export const aiRouter = router({
  processNotes: protectedProcedure
    .input(z.object({
      rawNotes: z.string().min(1),
      contactName: z.string().optional(),
      propertyName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: SYSTEM_PROCESS_NOTES,
          },
          {
            role: "user",
            content: `Process these raw call notes from a commercial real estate broker${input.contactName ? ` about ${input.contactName}` : ""}${input.propertyName ? ` regarding property: ${input.propertyName}` : ""}.
Raw notes:
${input.rawNotes}
Return a JSON object with:
{
  "summary": "2-3 sentence concise summary of the call",
  "keyPoints": ["array of key points discussed"],
  "nextSteps": [
    {
      "title": "specific action item",
      "type": "call|email|meeting|follow_up|research|other",
      "priority": "urgent|high|medium|low",
      "dueInDays": number (days from today, 0 = today, 1 = tomorrow, etc.)
    }
  ],
  "sentiment": "positive|neutral|negative",
  "ownerMotivation": "brief assessment of owner's motivation to sell (if applicable)",
  "buyerInterest": "brief assessment of buyer's interest level (if applicable)"
}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "note_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                keyPoints: { type: "array", items: { type: "string" } },
                nextSteps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      type: { type: "string" },
                      priority: { type: "string" },
                      dueInDays: { type: "number" },
                    },
                    required: ["title", "type", "priority", "dueInDays"],
                    additionalProperties: false,
                  },
                },
                sentiment: { type: "string" },
                ownerMotivation: { type: "string" },
                buyerInterest: { type: "string" },
              },
              required: ["summary", "keyPoints", "nextSteps", "sentiment", "ownerMotivation", "buyerInterest"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : null;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no content" });
      return JSON.parse(content) as {
        summary: string;
        keyPoints: string[];
        nextSteps: Array<{ title: string; type: string; priority: string; dueInDays: number }>;
        sentiment: string;
        ownerMotivation: string;
        buyerInterest: string;
      };
    }),

  generateOutreach: protectedProcedure
    .input(z.object({
      contactName: z.string(),
      contactRole: z.enum(["owner", "buyer"]),
      propertyName: z.string().optional(),
      conversationContext: z.string().optional(),
      outreachType: z.enum(["initial_contact", "follow_up", "offer_discussion", "market_update"]),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: SYSTEM_OUTREACH,
          },
          {
            role: "user",
            content: `Generate a personalized ${input.outreachType.replace(/_/g, " ")} message for ${input.contactName} who is a ${input.contactRole}${input.propertyName ? ` regarding ${input.propertyName}` : ""}.
${input.conversationContext ? `Previous conversation context: ${input.conversationContext}` : ""}
Write a professional, concise email/call script that feels personal and not generic. Focus on value for the ${input.contactRole}.
IMPORTANT: Write the body as plain text only. Do NOT use markdown, asterisks (*), bullet symbols, pound signs (#), or any other markdown formatting. Use plain sentences and line breaks only.
Return JSON with: { "subject": "email subject", "body": "full message body", "callScript": "brief phone call opening" }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "outreach_message",
            strict: true,
            schema: {
              type: "object",
              properties: {
                subject: { type: "string" },
                body: { type: "string" },
                callScript: { type: "string" },
              },
              required: ["subject", "body", "callScript"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent2 = response.choices[0]?.message?.content;
      const content = typeof rawContent2 === "string" ? rawContent2 : null;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no content" });
      const raw = JSON.parse(content) as { subject: string; body: string; callScript: string };
      return { ...raw, body: stripMarkdown(raw.body), callScript: stripMarkdown(raw.callScript) };
    }),

  findDealMatches: protectedProcedure
    .input(z.object({ forceRefresh: z.boolean().optional() }).optional())
    .mutation(async ({ ctx }) => {
      const data = await getDealMatchingData(ctx.user.id);
      if (data.owners.length === 0 && data.buyers.length === 0) {
        return { matches: [], scannedOwners: 0, scannedBuyers: 0, scannedActivities: 0 };
      }

      // Fetch deal narratives for all owner properties (batch)
      const allPropertyIds = (data.ownerProperties ?? []).map(p => p.id);
      const narrativeMap = new Map<number, string>();
      await Promise.all(
        allPropertyIds.slice(0, 20).map(async (pid) => {
          try {
            const n = await getDealNarrative(ctx.user.id, pid);
            if (n) narrativeMap.set(pid, n.summary);
          } catch {}
        })
      );

      const ownerSummaries = data.owners.map(owner => {
        const ownerProps = (data.ownerProperties ?? []).filter(p => p.ownerId === owner.id);
        const ownerActs = data.ownerActivities.filter(a => a.contactId === owner.id);
        const actNotes = ownerActs
          .filter(a => a.notes || a.summary)
          .slice(0, 5)
          .map(a => `[${new Date(a.occurredAt).toLocaleDateString()} - ${a.type}] ${a.summary || a.notes}`)
          .join(" | ");
        return {
          id: owner.id,
          name: `${owner.firstName} ${owner.lastName}`,
          company: owner.company,
          priority: owner.priority,
          ownerNotes: owner.ownerNotes,
          properties: ownerProps.map(p => ({
            id: p.id, name: p.name, type: p.propertyType, units: p.unitCount,
            vintage: p.vintageYear, city: p.city, state: p.state, status: p.status,
            askingPrice: p.askingPrice, estimatedValue: p.estimatedValue,
            dealNarrative: narrativeMap.get(p.id) ?? null,
          })),
          recentConversations: actNotes,
          lastContacted: owner.lastContactedAt,
        };
      });
      const buyerSummaries = data.buyers.map(buyer => {
        let criteria: Record<string, unknown> = {};
        try { criteria = buyer.buyerCriteria ? JSON.parse(buyer.buyerCriteria) : {}; } catch {}
        const buyerActs = data.buyerActivities.filter(a => a.contactId === buyer.id);
        const actNotes = buyerActs
          .filter(a => a.notes || a.summary)
          .slice(0, 5)
          .map(a => `[${new Date(a.occurredAt).toLocaleDateString()} - ${a.type}] ${a.summary || a.notes}`)
          .join(" | ");
        return {
          id: buyer.id, name: `${buyer.firstName} ${buyer.lastName}`,
          company: buyer.company, buyerType: buyer.buyerType, criteria,
          notes: buyer.notes, recentConversations: actNotes, lastContacted: buyer.lastContactedAt,
        };
      });
      const prompt = `You are an expert commercial real estate deal matchmaker specializing in MHC and apartment investment sales in Idaho.
Analyze conversations between a broker and their contacts, then identify potential deal matches where:
- An OWNER has shown any signal of potentially selling
- A BUYER has expressed interest in acquiring properties that match what the owner has

=== OWNERS & THEIR PROPERTIES ===
${JSON.stringify(ownerSummaries, null, 2)}
=== BUYERS & THEIR CRITERIA ===
${JSON.stringify(buyerSummaries, null, 2)}

Return JSON: { "matches": [{ "matchScore": number, "ownerId": number, "ownerName": string, "propertyId": number, "propertyName": string, "propertyType": string, "propertyUnits": number, "propertyVintage": number, "propertyCity": string, "buyerId": number, "buyerName": string, "ownerSignal": string, "buyerSignal": string, "matchReason": string, "recommendedAction": string, "urgency": string }] }`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_DEAL_MATCHER },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "deal_matches",
            strict: true,
            schema: {
              type: "object",
              properties: {
                matches: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      matchScore: { type: "number" },
                      ownerId: { type: "number" },
                      ownerName: { type: "string" },
                      propertyId: { type: "number" },
                      propertyName: { type: "string" },
                      propertyType: { type: "string" },
                      propertyUnits: { type: "number" },
                      propertyVintage: { type: "number" },
                      propertyCity: { type: "string" },
                      buyerId: { type: "number" },
                      buyerName: { type: "string" },
                      ownerSignal: { type: "string" },
                      buyerSignal: { type: "string" },
                      matchReason: { type: "string" },
                      recommendedAction: { type: "string" },
                      urgency: { type: "string" },
                    },
                    required: ["matchScore", "ownerId", "ownerName", "propertyId", "propertyName", "propertyType", "propertyUnits", "propertyVintage", "propertyCity", "buyerId", "buyerName", "ownerSignal", "buyerSignal", "matchReason", "recommendedAction", "urgency"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["matches"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : null;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no content" });
      const parsed = JSON.parse(content) as { matches: Array<{ matchScore: number; ownerId: number; ownerName: string; propertyId: number; propertyName: string; propertyType: string; propertyUnits: number; propertyVintage: number; propertyCity: string; buyerId: number; buyerName: string; ownerSignal: string; buyerSignal: string; matchReason: string; recommendedAction: string; urgency: string }> };
      parsed.matches.sort((a, b) => b.matchScore - a.matchScore);
      return {
        matches: parsed.matches,
        scannedOwners: data.owners.length,
        scannedBuyers: data.buyers.length,
        scannedActivities: data.ownerActivities.length + data.buyerActivities.length,
      };
    }),

  analyzePricing: protectedProcedure
    .input(z.object({
      propertyId: z.number(),
      unitCount: z.number().optional(),
      vintageYear: z.number().optional(),
      city: z.string().optional(),
      noi: z.number().optional(),
      currentAskingPrice: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PRICING },
          {
            role: "user",
            content: `Analyze pricing strategy for a ${input.unitCount ?? "unknown"}-unit property built in ${input.vintageYear ?? "unknown"} in ${input.city ?? "Idaho"}.
NOI: ${input.noi ? `$${input.noi.toLocaleString()}` : "unknown"}
Current asking price: ${input.currentAskingPrice ? `$${input.currentAskingPrice.toLocaleString()}` : "not set"}
Provide pricing analysis as JSON: { "recommendedCapRate": number, "estimatedValue": number, "pricePerUnit": number, "analysis": "2-3 sentence analysis", "marketContext": "brief Idaho market context", "negotiationTips": ["tip1", "tip2"] }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pricing_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendedCapRate: { type: "number" },
                estimatedValue: { type: "number" },
                pricePerUnit: { type: "number" },
                analysis: { type: "string" },
                marketContext: { type: "string" },
                negotiationTips: { type: "array", items: { type: "string" } },
              },
              required: ["recommendedCapRate", "estimatedValue", "pricePerUnit", "analysis", "marketContext", "negotiationTips"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent3 = response.choices[0]?.message?.content;
      const content = typeof rawContent3 === "string" ? rawContent3 : null;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no content" });
      return JSON.parse(content) as { recommendedCapRate: number; estimatedValue: number; pricePerUnit: number; analysis: string; marketContext: string; negotiationTips: string[] };
    }),
});

// ─── Smart Log Router ─────────────────────────────────────────────────────────
// Entity resolution uses a two-step approach:
// 1. LLM extracts names/summaries from notes (lightweight prompt, no entity list)
// 2. Server-side fuzzy matching resolves names to CRM records
export const smartLogRouter = router({
  analyzeContact: protectedProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Step 1: Ask LLM to extract contact name and summarize (no entity list needed)
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: SYSTEM_CONTACT_ANALYSIS,
          },
          {
            role: "user",
            content: `Analyze these call/email notes and:
1. Write a concise 2-3 sentence summary
2. Identify if this is a "call" or "email" interaction
3. Identify the outcome if mentioned (reached/voicemail/no_answer/callback_requested/not_interested/interested/follow_up)
4. Extract the name of the person discussed (first name and last name if available)

Notes:
${input.text}

Return JSON: { "summary": string, "type": "call" | "email", "outcome": string | null, "detectedContactName": string | null }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "contact_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                type: { type: "string" },
                outcome: { type: ["string", "null"] },
                detectedContactName: { type: ["string", "null"] },
              },
              required: ["summary", "type", "outcome", "detectedContactName"],
              additionalProperties: false,
            },
          },
        },
      });
      const parsed = JSON.parse(response.choices[0].message.content as string) as {
        summary: string;
        type: "call" | "email";
        outcome: string | null;
        detectedContactName: string | null;
      };

      // Step 2: Server-side fuzzy match against CRM contacts
      let detectedContactId: number | null = null;
      let confidence: "high" | "medium" | "low" = "low";
      if (parsed.detectedContactName) {
        const nameParts = parsed.detectedContactName.trim().split(/\s+/);
        const firstName = nameParts[0] ?? "";
        const lastName = nameParts.slice(1).join(" ") || undefined;
        const matches = await findSimilarContacts(ctx.user.id, { firstName, lastName });
        if (matches.length === 1) {
          detectedContactId = matches[0].id;
          confidence = lastName ? "high" : "medium";
        } else if (matches.length > 1) {
          // Multiple matches — pick best but lower confidence
          detectedContactId = matches[0].id;
          confidence = "medium";
        }
      }

      return {
        summary: parsed.summary,
        type: parsed.type,
        outcome: parsed.outcome,
        detectedContactId,
        detectedContactName: parsed.detectedContactName,
        confidence,
      };
    }),

  analyzeProperty: protectedProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Step 1: Ask LLM to extract property name and summarize (no entity list needed)
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: SYSTEM_PROPERTY_ANALYSIS,
          },
          {
            role: "user",
            content: `Analyze these deal intelligence notes and:
1. Write a concise 2-3 sentence summary of the key intelligence
2. Extract the property name or address being discussed

Notes:
${input.text}

Return JSON: { "summary": string, "detectedPropertyName": string | null }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "property_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                detectedPropertyName: { type: ["string", "null"] },
              },
              required: ["summary", "detectedPropertyName"],
              additionalProperties: false,
            },
          },
        },
      });
      const parsed = JSON.parse(response.choices[0].message.content as string) as {
        summary: string;
        detectedPropertyName: string | null;
      };

      // Step 2: Tiered resolution — active deals first, then broader DB
      if (!parsed.detectedPropertyName) {
        return {
          summary: parsed.summary,
          detectedPropertyId: null,
          detectedPropertyName: null,
          confidence: "low" as const,
          tier: "none" as const,
          alternatives: [],
          isNew: false,
        };
      }

      const resolution = await resolveProperty(ctx.user.id, parsed.detectedPropertyName);

      return {
        summary: parsed.summary,
        detectedPropertyId: resolution.match?.property.id ?? null,
        detectedPropertyName: parsed.detectedPropertyName,
        confidence: resolution.match?.confidence ?? "low",
        tier: resolution.match?.tier ?? "none",
        alternatives: resolution.alternatives.map(a => ({
          id: a.property.id,
          name: a.property.name,
          city: a.property.city,
          confidence: a.confidence,
          tier: a.tier,
          reason: a.reason,
        })),
        isNew: resolution.isNew,
      };
    }),

  // ─── Get Active Deals ─────────────────────────────────────────────────────
  getActiveDeals: protectedProcedure
    .input(z.object({ days: z.number().default(60) }).optional())
    .query(async ({ ctx, input }) => {
      return getActiveDeals(ctx.user.id, input?.days ?? 60);
    }),

  // ─── Resolve Property (tiered matching) ───────────────────────────────────
  resolvePropertyName: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return resolveProperty(ctx.user.id, input.name);
    }),
});

// ─── Post-Call Intelligence Router ───────────────────────────────────────────
export const callIntelRouter = router({
  parseCallNote: protectedProcedure
    .input(z.object({
      notes: z.string().min(1),
      contactId: z.number().optional(),
      propertyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [openTasks, allContacts, allProperties] = await Promise.all([
        getTasks(ctx.user.id, { status: "pending", limit: 50 }),
        getContacts(ctx.user.id, { limit: 100 }),
        getProperties(ctx.user.id, { limit: 100 }),
      ]);
      const tasksSummary = openTasks.map(t => `[Task #${t.id}] "${t.title}" (${t.priority} priority, due: ${t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "no date"}, contact: ${t.contactId ?? "none"}, property: ${t.propertyId ?? "none"})`).join("\n");
      const contactsSummary = allContacts.map(c => `[Contact #${c.id}] ${c.firstName} ${c.lastName} (${c.company ?? ""}) - owner:${c.isOwner} buyer:${c.isBuyer}`).join("\n");
      const propertiesSummary = allProperties.map(p => `[Property #${p.id}] "${p.name}" - ${p.propertyType}, ${p.unitCount ?? "?"} units, ${p.city ?? ""}, status: ${p.status}`).join("\n");
      const prompt = `You are an AI assistant for a commercial real estate broker. Analyze these call notes and identify actionable updates.
CALL NOTES:
${input.notes}
CURRENT OPEN TASKS:
${tasksSummary || "(none)"}
KNOWN CONTACTS:
${contactsSummary || "(none)"}
KNOWN PROPERTIES:
${propertiesSummary || "(none)"}
Return a JSON object with suggested actions based on the call notes. For each suggestion, be specific and reference exact IDs from the data above.
Rules:
- completedTaskIds: task IDs that appear to be resolved/completed based on the notes
- newTasks: new follow-up items mentioned in the notes
- propertyUpdates: property status or price changes mentioned
- contactLinks: contacts mentioned that should be linked to properties or listings
- summary: 1-2 sentence summary of the call
- keyInsights: 2-4 bullet points of the most important things learned`;
      const response = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_CALL_INTEL },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "call_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                keyInsights: { type: "array", items: { type: "string" } },
                completedTaskIds: { type: "array", items: { type: "number" } },
                newTasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      priority: { type: "string" },
                      type: { type: "string" },
                      contactId: { type: "number" },
                      propertyId: { type: "number" },
                      dueDaysFromNow: { type: "number" },
                    },
                    required: ["title", "description", "priority", "type", "contactId", "propertyId", "dueDaysFromNow"],
                    additionalProperties: false,
                  },
                },
                propertyUpdates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      propertyId: { type: "number" },
                      propertyName: { type: "string" },
                      field: { type: "string" },
                      oldValue: { type: "string" },
                      newValue: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["propertyId", "propertyName", "field", "oldValue", "newValue", "reason"],
                    additionalProperties: false,
                  },
                },
                contactLinks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      contactId: { type: "number" },
                      contactName: { type: "string" },
                      propertyId: { type: "number" },
                      propertyName: { type: "string" },
                      relationship: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["contactId", "contactName", "propertyId", "propertyName", "relationship", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["summary", "keyInsights", "completedTaskIds", "newTasks", "propertyUpdates", "contactLinks"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : null;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no content" });
      let parsed: {
        summary: string;
        keyInsights: string[];
        completedTaskIds: number[];
        newTasks: Array<{ title: string; description: string; priority: string; type: string; contactId: number; propertyId: number; dueDaysFromNow: number }>;
        propertyUpdates: Array<{ propertyId: number; propertyName: string; field: string; oldValue: string; newValue: string; reason: string }>;
        contactLinks: Array<{ contactId: number; contactName: string; propertyId: number; propertyName: string; relationship: string; reason: string }>;
      };
      try { parsed = JSON.parse(content); }
      catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" }); }
      const completedTasks = openTasks
        .filter(t => parsed.completedTaskIds.includes(t.id))
        .map(t => ({ id: t.id, title: t.title, priority: t.priority }));
      return {
        summary: parsed.summary,
        keyInsights: parsed.keyInsights,
        completedTasks,
        newTasks: parsed.newTasks,
        propertyUpdates: parsed.propertyUpdates,
        contactLinks: parsed.contactLinks,
      };
    }),

  applyCallActions: protectedProcedure
    .input(z.object({
      completeTaskIds: z.array(z.number()).optional(),
      newTasks: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        priority: z.enum(["urgent", "high", "medium", "low"]).default("medium"),
        type: z.enum(["call", "email", "meeting", "follow_up", "research", "other"]).default("follow_up"),
        contactId: z.number().optional(),
        propertyId: z.number().optional(),
        dueDaysFromNow: z.number().default(1),
      })).optional(),
      propertyUpdates: z.array(z.object({
        propertyId: z.number(),
        field: z.string(),
        newValue: z.string(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const results: string[] = [];
      if (input.completeTaskIds?.length) {
        await Promise.all(input.completeTaskIds.map(id =>
          updateTask(id, ctx.user.id, { status: "completed", completedAt: new Date() })
        ));
        results.push(`Completed ${input.completeTaskIds.length} task(s)`);
      }
      if (input.newTasks?.length) {
        await Promise.all(input.newTasks.map(t => {
          const dueAt = nextWeekday(new Date(Date.now() + (t.dueDaysFromNow ?? 1) * 86_400_000));
          return createTask({
            userId: ctx.user.id,
            title: t.title,
            description: t.description,
            priority: t.priority as "urgent" | "high" | "medium" | "low",
            type: t.type as "call" | "email" | "meeting" | "follow_up" | "research" | "other",
            contactId: t.contactId || undefined,
            propertyId: t.propertyId || undefined,
            status: "pending",
            dueAt,
          });
        }));
        results.push(`Created ${input.newTasks.length} new task(s)`);
      }
      if (input.propertyUpdates?.length) {
        await Promise.all(input.propertyUpdates.map(u => {
          const updateData: Record<string, unknown> = {};
          if (u.field === "status") updateData.status = u.newValue;
          else if (u.field === "askingPrice") updateData.askingPrice = parseFloat(u.newValue.replace(/[^0-9.]/g, ""));
          else if (u.field === "estimatedValue") updateData.estimatedValue = parseFloat(u.newValue.replace(/[^0-9.]/g, ""));
          else if (u.field === "notes") updateData.notes = u.newValue;
          if (Object.keys(updateData).length > 0) {
            return updateProperty(u.propertyId, ctx.user.id, updateData as Parameters<typeof updateProperty>[2]);
          }
        }));
        results.push(`Updated ${input.propertyUpdates.length} property field(s)`);
      }
      return { success: true, applied: results };
    }),

  // ─── Deal Intelligence Context ────────────────────────────────────────────
  // Assembles rich context about a contact + deal for coaching prompts
  getDealIntelligenceContext: protectedProcedure
    .input(z.object({
      contactId:  z.number().optional(),
      propertyId: z.number().optional(),
      listingId:  z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const now = Date.now();

      const [contact, property, listing] = await Promise.all([
        input.contactId  ? getContactById(input.contactId, userId)  : Promise.resolve(undefined),
        input.propertyId ? getPropertyById(input.propertyId, userId) : Promise.resolve(undefined),
        input.listingId  ? getListingById(input.listingId, userId)   : Promise.resolve(undefined),
      ]);

      // Recent activities for this contact (last 10)
      const recentActivities = input.contactId
        ? await getActivities(userId, { contactId: input.contactId, limit: 10 })
        : [];

      // Buyer criteria if contact is a buyer
      const buyerCriteria = input.contactId
        ? await getBuyerCriteria(input.contactId, userId)
        : null;

      // All deals this contact is linked to (to detect dual-role)
      const contactLinks = input.contactId
        ? await getContactPropertyLinks(input.contactId, userId)
        : [];

      // Find this contact's role on the current deal
      let dealRole: string | null = null;
      if (input.contactId && (input.propertyId || input.listingId)) {
        const matchingLink = contactLinks.find(l =>
          (input.propertyId && l.propertyId === input.propertyId) ||
          (input.listingId  && l.listingId  === input.listingId)
        );
        dealRole = matchingLink?.dealRole ?? null;
      }

      // Days since last contact
      const lastActivity = recentActivities[0];
      const daysSinceContact = lastActivity
        ? Math.floor((now - new Date(lastActivity.occurredAt ?? lastActivity.createdAt).getTime()) / 86_400_000)
        : null;

      // Activity history summary (last 5)
      const activitySummary = recentActivities.slice(0, 5).map(a =>
        `${a.type} on ${new Date(a.occurredAt ?? a.createdAt).toLocaleDateString()}: ${a.summary ?? a.notes ?? "(no notes)"}`
      );

      // Dual-role detection: is this contact both a buyer AND linked to a property as an owner?
      const isDualRole = contact && (contact.isBuyer && contact.isOwner);
      const otherDeals = contactLinks
        .filter(l => l.propertyId !== input.propertyId && l.listingId !== input.listingId)
        .slice(0, 5)
        .map(l => l.propertyName ?? l.listingTitle ?? "Unknown deal");

      return {
        // Contact context
        contactName:       contact ? `${contact.firstName} ${contact.lastName}` : null,
        contactCompany:    contact?.company ?? null,
        contactPriority:   contact?.priority ?? null,
        contactNotes:      contact?.notes ?? null,
        contactIsOwner:    contact?.isOwner ?? false,
        contactIsBuyer:    contact?.isBuyer ?? false,
        isDualRole:        isDualRole ?? false,
        dealRole,
        daysSinceContact,
        totalInteractions: recentActivities.length,
        activitySummary,
        otherDeals,

        // Buyer criteria (if buyer)
        buyerCriteria: buyerCriteria ? {
          propertyTypes: buyerCriteria.propertyTypes ?? [],
          minUnits:      buyerCriteria.minUnits,
          maxUnits:      buyerCriteria.maxUnits,
          minPrice:      buyerCriteria.minPrice,
          maxPrice:      buyerCriteria.maxPrice,
          markets:       buyerCriteria.markets ?? [],
          states:        buyerCriteria.states ?? [],
          notes:         buyerCriteria.notes,
        } : null,

        // Property context
        propertyName:          property?.name ?? null,
        propertyCity:          property?.city ?? null,
        propertyUnitCount:     property?.unitCount ?? null,
        propertyStatus:        property?.status ?? null,
        propertyOffMarket:     property?.offMarketInterest ?? false,
        propertyOffMarketConf: property?.offMarketConfidence ?? null,
        propertyNotes:         property?.notes ?? null,

        // Listing context
        listingTitle:   listing?.title ?? null,
        listingStage:   listing?.stage ?? null,
        listingPrice:   listing?.askingPrice ?? null,
        listingNotes:   listing?.brokerNotes ?? null,
        listingUnitCount: listing?.unitCount ?? null,
      };
    }),

  // ─── Deal Context (for Compose mode) ──────────────────────────────────────
  getDealContext: protectedProcedure
    .input(z.object({
      propertyId: z.number().optional(),
      listingId:  z.number().optional(),
      recipientContactId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Resolve property from listing if only listing provided
      let propertyId = input.propertyId;
      let listing = input.listingId ? await getListingById(input.listingId, userId) : null;
      if (!propertyId && listing) propertyId = listing.propertyId;

      const [property, narrative, recipient] = await Promise.all([
        propertyId ? getPropertyById(propertyId, userId) : Promise.resolve(null),
        propertyId ? getDealNarrative(userId, propertyId) : Promise.resolve(null),
        input.recipientContactId ? getContactById(input.recipientContactId, userId) : Promise.resolve(null),
      ]);

      // Fetch listing from property if not provided
      if (!listing && propertyId) {
        listing = await getListingByPropertyId(userId, propertyId);
      }

      // All activities for this property (with contact names)
      const recentActivities = propertyId
        ? await getActivitiesForProperty(userId, propertyId, 10)
        : [];

      // Buyer criteria if recipient is a buyer
      const buyerCrit = input.recipientContactId
        ? await getBuyerCriteria(input.recipientContactId, userId)
        : null;

      // Contact-property links (who's involved)
      const links = propertyId
        ? await getContactPropertyLinksForProperty(userId, propertyId)
        : [];

      // Buyer interests (if listing)
      const buyers = listing
        ? await getBuyerInterestsByListing(listing.id, userId)
        : [];

      // Unsolicited offers
      const offers = propertyId
        ? await getUnsolicitedOffers(propertyId, userId)
        : [];

      return {
        narrative,
        property,
        listing,
        recipient,
        recentActivities,
        buyerCriteria: buyerCrit,
        links,
        buyers,
        offers,
      };
    }),

  // ─── Generate / Refresh Deal Narrative ───────────────────────────────────
  generateDealNarrative: protectedProcedure
    .input(z.object({
      propertyId: z.number(),
      triggeredByActivityId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await generateDealNarrativeInternal(ctx.user.id, input.propertyId, input.triggeredByActivityId);
      return getDealNarrative(ctx.user.id, input.propertyId);
    }),

  refreshDealNarrative: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await generateDealNarrativeInternal(ctx.user.id, input.propertyId);
      return getDealNarrative(ctx.user.id, input.propertyId);
    }),

  // ─── Get Deal Narrative (read-only) ──────────────────────────────────────
  getDealNarrative: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getDealNarrative(ctx.user.id, input.propertyId);
    }),

  // ─── Raw LLM proxy (used by Email Studio callClaude) ──────────────────────
  invokeLlm: protectedProcedure
    .input(z.object({
      prompt:    z.string().min(1),
      maxTokens: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [{ role: "user", content: input.prompt }],
      });
      const text = (response as { choices: Array<{ message: { content: string } }> })
        .choices[0]?.message?.content ?? "";
      return { text };
    }),

  // ─── Email Studio ─────────────────────────────────────────────────────────
  processEmail: protectedProcedure
    .input(z.object({
      draftReply:    z.string().min(1),
      incomingEmail: z.string().optional(),
      contactNames:  z.string().optional(),
      propertyNames: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const prompt = `${EMAIL_STYLE_PROMPT}

---

${input.contactNames  ? `CRM CONTEXT — known contacts: ${input.contactNames.slice(0, 800)}\n` : ""}\
${input.propertyNames ? `CRM CONTEXT — known properties: ${input.propertyNames.slice(0, 800)}\n` : ""}\
${input.contactNames || input.propertyNames ? "\n---\n\n" : ""}\
${input.incomingEmail?.trim() ? `INCOMING EMAIL THE USER IS RESPONDING TO:\n${input.incomingEmail}\n\n` : ""}\
DRAFT REPLY TO EDIT:
${input.draftReply}

---

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks):
{
  "editedEmail": "the edited reply in Chriskott's voice",
  "contextSummary": "1-2 sentence summary of what this email thread is about in CRM terms",
  "senderName": "first name of the person being emailed, or empty string",
  "dealMentioned": "property or deal name mentioned, or empty string",
  "suggestedActions": [
    {
      "type": "add_task",
      "label": "Short action title",
      "detail": "Specific detail of what to do",
      "contactName": "name if relevant",
      "propertyName": "property name if relevant"
    }
  ]
}

For suggestedActions, include 2-4 specific actions based on the email content. Types: "update_contact", "add_task", "log_activity", "update_property".`;

      const response = await invokeLLM({
        messages: [
          { role: "user", content: prompt },
        ],
      });

      const text = (response as { choices: Array<{ message: { content: string } }> })
        .choices[0]?.message?.content ?? "";
      const parsed = parseLlmJson<{
        editedEmail: string;
        contextSummary: string;
        senderName: string;
        dealMentioned: string;
        suggestedActions: Array<{
          type: string;
          label: string;
          detail: string;
          contactName?: string;
          propertyName?: string;
        }>;
      }>(text);
      parsed.editedEmail = stripMarkdown(parsed.editedEmail);
      return parsed;
    }),
});

// ─── Deal Narrative Generation (internal + callback registration) ─────────

async function generateDealNarrativeInternal(userId: number, propertyId: number, triggeredByActivityId?: number) {
  const [property, existing, recentActivities, listing] = await Promise.all([
    getPropertyById(propertyId, userId),
    getDealNarrative(userId, propertyId),
    getActivitiesForProperty(userId, propertyId, 20),
    getListingByPropertyId(userId, propertyId),
  ]);

  if (!property) return;

  // Fetch buyer interests and offers in parallel
  const [buyers, offers, links] = await Promise.all([
    listing ? getBuyerInterestsByListing(listing.id, userId) : Promise.resolve([]),
    getUnsolicitedOffers(propertyId, userId),
    getContactPropertyLinksForProperty(userId, propertyId),
  ]);

  // Build prompt
  const activityLines = recentActivities.map(a => {
    const date = a.occurredAt ? new Date(a.occurredAt).toLocaleDateString() : "Unknown date";
    const name = [a.contactFirstName, a.contactLastName].filter(Boolean).join(" ") || "Unknown";
    const company = a.contactCompany ? ` (${a.contactCompany})` : "";
    return `- [${date}] ${a.type} (${a.direction ?? "n/a"}) with ${name}${company}: ${a.summary || a.notes || "(no notes)"}\n   Outcome: ${a.outcome ?? "n/a"}`;
  }).join("\n");

  const buyerLines = buyers.map((b: any) =>
    `- ${b.contactFirstName ?? ""} ${b.contactLastName ?? ""} (${b.contactCompany ?? ""}): status=${b.status}, offer=$${b.offerAmount ?? "none"}, feedback: ${b.pricePointFeedback ?? "none"}`
  ).join("\n");

  const offerLines = offers.map((o: any) =>
    `- $${o.amount ?? "?"} from ${o.buyerName ?? "Unknown"} on ${o.receivedAt ? new Date(o.receivedAt).toLocaleDateString() : "?"}: ${o.notes ?? ""}`
  ).join("\n");

  const linkLines = links.map(l =>
    `- ${l.contactFirstName ?? ""} ${l.contactLastName ?? ""}: role=${l.dealRole ?? "unknown"}, source=${l.source}`
  ).join("\n");

  let previousNarrativeBlock = "";
  if (existing) {
    previousNarrativeBlock = `
PREVIOUS NARRATIVE (last updated ${existing.updatedAt ? new Date(existing.updatedAt).toLocaleDateString() : "unknown"}):
${existing.summary}

Seller Motivation: ${existing.sellerMotivation ?? "Unknown"}
Pricing Status: ${existing.pricingStatus ?? "Unknown"}
Buyer Activity: ${existing.buyerActivity ?? "Unknown"}
Key Dates: ${existing.keyDates ?? "Unknown"}
Blockers: ${existing.blockers ?? "Unknown"}
Next Steps: ${existing.nextSteps ?? "Unknown"}
`;
  }

  const prompt = `You are a deal intelligence system for a commercial real estate broker.
Your job is to maintain a running narrative of what's happening with a specific deal/property.

PROPERTY: ${property.name}, ${property.city ?? "Unknown"}, ${property.state ?? "ID"}
- Type: ${property.propertyType}, ${property.unitCount ?? "?"} units
- Status: ${property.status}
- Est. Value: $${property.estimatedValue ?? "Unknown"}
- Off-market interest: ${property.offMarketConfidence ?? "none"} — ${property.offMarketNotes ?? ""}
${previousNarrativeBlock}
RECENT ACTIVITIES (most recent first):
${activityLines || "(no activities logged)"}

${listing ? `LISTING: ${listing.title}, Stage: ${listing.stage}, Asking: $${listing.askingPrice ?? "TBD"}
Broker Notes: ${listing.brokerNotes ?? "none"}

BUYER INTEREST:
${buyerLines || "(no buyers)"}` : ""}

${offerLines ? `UNSOLICITED OFFERS:\n${offerLines}` : ""}

INVOLVED PARTIES:
${linkLines || "(none linked)"}

---

Generate an updated deal narrative. Return ONLY valid JSON:
{
  "summary": "3-5 sentence prose summary of where this deal stands RIGHT NOW. Write as if briefing a broker before a call. Include specific names, numbers, dates. What happened recently, what's the current state, what's the next move.",
  "sellerMotivation": "1-2 sentences on seller's current stance and motivation level. If unknown, say so.",
  "pricingStatus": "1-2 sentences on current pricing landscape — asking price, comps, offers, gap between bid and ask.",
  "buyerActivity": "1-2 sentences on buyer engagement — who's active, what stage, any competition.",
  "keyDates": "Bullet-style list of upcoming deadlines or milestones. Empty string if none known.",
  "blockers": "What's preventing the deal from moving forward? What's the broker waiting on?",
  "nextSteps": "2-3 specific next actions the broker should take, based on recent activity."
}

IMPORTANT:
- Be specific. Use names, numbers, dates from the data above.
- If this is an UPDATE (previous narrative exists), incorporate new information while preserving still-relevant context.
- If information is unknown or not in the data, say "Unknown" — do not fabricate.
- Write from the broker's perspective (your deals, your buyers/sellers).`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_DEAL_NARRATIVE },
      { role: "user", content: prompt },
    ],
  });

  const rawContent = (response as any).choices?.[0]?.message?.content;
  if (!rawContent) return;

  try {
    const parsed = parseLlmJson<{
      summary: string;
      sellerMotivation?: string;
      pricingStatus?: string;
      buyerActivity?: string;
      keyDates?: string;
      blockers?: string;
      nextSteps?: string;
    }>(rawContent);

    await upsertDealNarrative(userId, propertyId, {
      summary: parsed.summary,
      sellerMotivation: parsed.sellerMotivation ?? null,
      pricingStatus: parsed.pricingStatus ?? null,
      buyerActivity: parsed.buyerActivity ?? null,
      keyDates: parsed.keyDates ?? null,
      blockers: parsed.blockers ?? null,
      nextSteps: parsed.nextSteps ?? null,
      activityCount: recentActivities.length,
      lastActivityId: triggeredByActivityId,
      listingId: listing?.id ?? null,
    });
  } catch (err) {
    console.error("Failed to parse deal narrative LLM response:", err);
  }
}

// Register the narrative callback so createActivity can trigger it
setNarrativeCallback(generateDealNarrativeInternal);
