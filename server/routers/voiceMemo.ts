import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { transcribeAudioWithGemini } from "../_core/voiceTranscription";
import {
  resolveContactMention,
  resolvePropertyMention,
  type ResolvedEntity,
} from "../_core/entityResolution";
import { createActivity, getContacts, getProperties, getUserById, updateActivity } from "../db";
import { parseLlmJson } from "../lib/parseLlmJson";

// ─── LLM extraction schema (names, not IDs) ─────────────────────────────
const EXTRACTION_PROMPT = `You are analyzing a commercial real estate broker's voice memo or call notes.

Extract the following from the transcript:

1. summary: 1-2 sentence summary of what was discussed.
2. keyInsights: bullet points (max 5) of important facts (cap rates, prices, timelines, motivations).
3. people: each mentioned person:
   - name (full name as spoken)
   - company (if mentioned)
   - role: "owner" | "buyer" | "broker" | "lender" | "property_manager" | "other"
   - context: why they were mentioned
4. properties: each mentioned property:
   - name (as spoken)
   - city (if mentioned)
   - address (if mentioned)
   - unitCount (if mentioned, integer)
   - context
5. newTasks: follow-ups to create:
   - title
   - description
   - personName (the person it relates to, if any — must match a "people" entry)
   - propertyName (the property it relates to, if any — must match a "properties" entry)
   - priority: "urgent" | "high" | "medium" | "low"
   - type: "call" | "email" | "meeting" | "follow_up" | "research" | "other"
   - dueDaysFromNow: integer
6. propertyUpdates: data changes about a property:
   - propertyName (must match a "properties" entry)
   - field: e.g. "askingPrice" | "status" | "notes"
   - newValue: string
   - reason
7. contactLinks: new relationships between people and properties:
   - personName (must match a "people" entry)
   - propertyName (must match a "properties" entry)
   - relationship: "owner" | "buyer" | "seller" | "broker" | "property_manager"
   - reason

IMPORTANT: Return NAMES as spoken, not database IDs. Resolution to records happens server-side.
If a field is unknown, omit it or pass an empty string. Return strict JSON.`;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    keyInsights: { type: "array", items: { type: "string" } },
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          role: { type: "string" },
          context: { type: "string" },
        },
        required: ["name", "company", "role", "context"],
        additionalProperties: false,
      },
    },
    properties: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          unitCount: { type: "number" },
          context: { type: "string" },
        },
        required: ["name", "city", "address", "unitCount", "context"],
        additionalProperties: false,
      },
    },
    newTasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          personName: { type: "string" },
          propertyName: { type: "string" },
          priority: { type: "string" },
          type: { type: "string" },
          dueDaysFromNow: { type: "number" },
        },
        required: ["title", "description", "personName", "propertyName", "priority", "type", "dueDaysFromNow"],
        additionalProperties: false,
      },
    },
    propertyUpdates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          propertyName: { type: "string" },
          field: { type: "string" },
          newValue: { type: "string" },
          reason: { type: "string" },
        },
        required: ["propertyName", "field", "newValue", "reason"],
        additionalProperties: false,
      },
    },
    contactLinks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          personName: { type: "string" },
          propertyName: { type: "string" },
          relationship: { type: "string" },
          reason: { type: "string" },
        },
        required: ["personName", "propertyName", "relationship", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "summary",
    "keyInsights",
    "people",
    "properties",
    "newTasks",
    "propertyUpdates",
    "contactLinks",
  ],
  additionalProperties: false,
} as const;

interface Extraction {
  summary: string;
  keyInsights: string[];
  people: Array<{ name: string; company: string; role: string; context: string }>;
  properties: Array<{ name: string; city: string; address: string; unitCount: number; context: string }>;
  newTasks: Array<{
    title: string;
    description: string;
    personName: string;
    propertyName: string;
    priority: string;
    type: string;
    dueDaysFromNow: number;
  }>;
  propertyUpdates: Array<{ propertyName: string; field: string; newValue: string; reason: string }>;
  contactLinks: Array<{ personName: string; propertyName: string; relationship: string; reason: string }>;
}

function buildWhisperPrompt(
  propertyNames: string[],
  contactNames: string[],
  companyNames: string[],
  marketFocus?: string,
): string {
  const lines = [
    "Commercial real estate investment sales. Multifamily, NNN, retail, industrial, office, self-storage.",
    "Cap rates, NOI, T12, rent rolls, 1031 exchange, price per unit, GRM.",
  ];
  // Use the broker's market focus to prime geography recognition
  if (marketFocus) {
    lines.push(`Broker focus: ${marketFocus}`);
  }
  if (propertyNames.length) lines.push(`Properties: ${propertyNames.slice(0, 80).join(", ")}.`);
  if (contactNames.length) lines.push(`People: ${contactNames.slice(0, 50).join(", ")}.`);
  if (companyNames.length) lines.push(`Companies: ${companyNames.slice(0, 30).join(", ")}.`);
  return lines.join("\n");
}

export const voiceMemoRouter = router({
  process: protectedProcedure
    .input(
      z.object({
        audioBase64: z.string().min(10),
        mimeType: z.string(),
        durationSeconds: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // 1. Decode audio
      const audioBuffer = Buffer.from(input.audioBase64, "base64");

      // 2. Build dynamic transcription prompt from user's DB + profile
      const [recentProps, recentContacts, userProfile] = await Promise.all([
        getProperties(userId, { limit: 200 }),
        getContacts(userId, { limit: 200 }),
        getUserById(userId),
      ]);
      const propertyNames = recentProps.map((p) => p.name).filter((n): n is string => !!n);
      const contactNames = recentContacts
        .map((c) => `${c.firstName} ${c.lastName}`.trim())
        .filter((n) => n.length > 1);
      const companyNames = Array.from(
        new Set(recentContacts.map((c) => c.company).filter((c): c is string => !!c)),
      );
      const transcribePrompt = buildWhisperPrompt(propertyNames, contactNames, companyNames, userProfile?.marketFocus ?? undefined);

      // 3. Transcribe with Gemini (inline audio, no S3)
      const transcription = await transcribeAudioWithGemini({
        audio: audioBuffer,
        mimeType: input.mimeType,
        prompt: transcribePrompt,
      });
      if ("error" in transcription) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Transcription failed: ${transcription.error}${transcription.details ? ` — ${transcription.details}` : ""}`,
        });
      }
      const transcript = transcription.text.trim();
      if (!transcript) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Empty transcript" });
      }

      // 4. Activity record
      const activityResult = await createActivity({
        userId,
        type: "note",
        direction: "outbound",
        subject: "Voice Memo",
        notes: transcript,
        duration: input.durationSeconds ? Math.max(1, Math.round(input.durationSeconds / 60)) : undefined,
        occurredAt: new Date(),
      });
      const activityId = (activityResult as unknown as Array<{ insertId: number }>)[0]?.insertId ?? null;

      // 5. LLM extraction — names, not IDs
      const llm = await invokeLLM({
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: `TRANSCRIPT:\n${transcript}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "voice_memo_extraction",
            strict: true,
            schema: EXTRACTION_SCHEMA,
          },
        },
      });
      const rawContent = llm.choices[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : null;
      if (!content) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no content" });
      }
      let extraction: Extraction;
      try {
        extraction = parseLlmJson<Extraction>(content);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned invalid JSON" });
      }

      // 6. Resolve mentions concurrently
      const peopleResolved = new Map<string, ResolvedEntity>();
      const propsResolved = new Map<string, ResolvedEntity>();

      await Promise.all([
        ...extraction.people.map(async (p) => {
          const r = await resolveContactMention(userId, {
            name: p.name,
            company: p.company || undefined,
            context: p.context,
          });
          peopleResolved.set(p.name, r);
        }),
        ...extraction.properties.map(async (p) => {
          const r = await resolvePropertyMention(userId, {
            name: p.name,
            city: p.city || undefined,
            address: p.address || undefined,
            unitCount: p.unitCount || undefined,
            context: p.context,
          });
          propsResolved.set(p.name, r);
        }),
      ]);

      const refForPerson = (name: string): ResolvedEntity | undefined =>
        name ? peopleResolved.get(name) : undefined;
      const refForProperty = (name: string): ResolvedEntity | undefined =>
        name ? propsResolved.get(name) : undefined;

      // 6b. Link the activity to the first resolved contact and property
      if (activityId) {
        const firstContact = Array.from(peopleResolved.values()).find((r) => r.id && (r.confidence === "high" || r.confidence === "medium"));
        const firstProperty = Array.from(propsResolved.values()).find((r) => r.id && (r.confidence === "high" || r.confidence === "medium"));
        const activityUpdate: Record<string, unknown> = {};
        if (firstContact?.id) activityUpdate.contactId = firstContact.id;
        if (firstProperty?.id) activityUpdate.propertyId = firstProperty.id;
        if (Object.keys(activityUpdate).length > 0) {
          try {
            await updateActivity(activityId, userId, activityUpdate as any);
          } catch {
            // Non-critical — activity exists, just not linked
          }
        }
      }

      // 7. Assemble result
      const newTasks = extraction.newTasks.map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        type: t.type,
        dueDaysFromNow: t.dueDaysFromNow || 1,
        contact: refForPerson(t.personName),
        property: refForProperty(t.propertyName),
      }));

      const propertyUpdates = extraction.propertyUpdates
        .map((u) => ({
          property: refForProperty(u.propertyName),
          field: u.field,
          newValue: u.newValue,
          reason: u.reason,
        }))
        .filter((u): u is typeof u & { property: ResolvedEntity } => !!u.property);

      const contactLinks = extraction.contactLinks
        .map((l) => ({
          contact: refForPerson(l.personName),
          property: refForProperty(l.propertyName),
          relationship: l.relationship,
          reason: l.reason,
        }))
        .filter(
          (l): l is typeof l & { contact: ResolvedEntity; property: ResolvedEntity } =>
            !!l.contact && !!l.property,
        );

      return {
        transcript,
        summary: extraction.summary,
        keyInsights: extraction.keyInsights,
        activityId,
        newTasks,
        propertyUpdates,
        contactLinks,
      };
    }),
});

export type VoiceMemoProcessResult = Awaited<
  ReturnType<(typeof voiceMemoRouter)["createCaller"]>
>["process"] extends (...args: never[]) => Promise<infer R>
  ? R
  : never;
