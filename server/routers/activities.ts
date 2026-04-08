import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, like, or, sql, desc } from "drizzle-orm";
import {
  addActivityLink,
  createActivity,
  deleteActivity,
  getActivities,
  getActivityDetail,
  removeActivityLink,
  updateActivity,
} from "../db";
import { getDb } from "../db/connection";
import { activities, contacts } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

const TYPE_ENUM = z.enum(["call", "email", "meeting", "note", "text", "voicemail"]);
const OUTCOME_ENUM = z.enum([
  "reached",
  "voicemail",
  "no_answer",
  "callback_requested",
  "not_interested",
  "interested",
  "follow_up",
]);

export const activitiesRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          contactId: z.number().optional(),
          propertyId: z.number().optional(),
          listingId: z.number().optional(),
          type: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => getActivities(ctx.user.id, input)),

  create: protectedProcedure
    .input(
      z.object({
        type: TYPE_ENUM,
        direction: z.enum(["inbound", "outbound"]).default("outbound"),
        contactId: z.number().optional(),
        propertyId: z.number().optional(),
        listingId: z.number().optional(),
        subject: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        duration: z.number().optional(),
        outcome: OUTCOME_ENUM.optional(),
        occurredAt: z.date().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createActivity({
        ...input,
        userId: ctx.user.id,
        occurredAt: input.occurredAt ?? new Date(),
      }),
    ),

  getDetail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const detail = await getActivityDetail(input.id, ctx.user.id);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
      return detail;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        type: TYPE_ENUM.optional(),
        subject: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        outcome: OUTCOME_ENUM.nullable().optional(),
        duration: z.number().nullable().optional(),
        occurredAt: z.date().optional(),
        // Allow re-linking the activity to a different contact/property
        // (in case the AI auto-linked it to the wrong one and the broker
        // wants to fix it from the activity detail modal)
        contactId: z.number().nullable().optional(),
        propertyId: z.number().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateActivity(id, ctx.user.id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteActivity(input.id, ctx.user.id);
      return { success: true };
    }),

  addLink: protectedProcedure
    .input(
      z.object({
        activityId: z.number(),
        contactId: z.number().optional(),
        propertyId: z.number().optional(),
        listingId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.contactId && !input.propertyId && !input.listingId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must provide a contactId, propertyId, or listingId",
        });
      }
      return addActivityLink({ ...input, userId: ctx.user.id });
    }),

  // Diagnostic: find activities by free-text and show their contactId.
  // Helps debug "activity isn't on this contact's page" issues.
  debugFind: protectedProcedure
    .input(z.object({ q: z.string().min(1), contactId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const q = `%${input.q.toLowerCase()}%`;

      // Find activities whose subject/notes mention the query
      const matchingActivities = await db
        .select({
          id: activities.id,
          type: activities.type,
          contactId: activities.contactId,
          propertyId: activities.propertyId,
          subject: activities.subject,
          notes: activities.notes,
          occurredAt: activities.occurredAt,
        })
        .from(activities)
        .where(
          and(
            eq(activities.userId, ctx.user.id),
            or(
              sql`LOWER(COALESCE(${activities.subject}, '')) LIKE ${q}`,
              sql`LOWER(COALESCE(${activities.notes}, '')) LIKE ${q}`,
            )!,
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(30);

      // Find contacts matching the query
      const matchingContacts = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          company: contacts.company,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, ctx.user.id),
            or(
              sql`LOWER(${contacts.firstName}) LIKE ${q}`,
              sql`LOWER(${contacts.lastName}) LIKE ${q}`,
              sql`LOWER(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})) LIKE ${q}`,
            )!,
          ),
        )
        .limit(20);

      // Group activity counts by contactId
      const byContactId: Record<string, number> = {};
      for (const a of matchingActivities) {
        const k = String(a.contactId ?? "null");
        byContactId[k] = (byContactId[k] || 0) + 1;
      }

      // If a contactId was passed, count activities directly tied to it
      let countForRequestedContact: number | null = null;
      if (input.contactId) {
        const direct = await db
          .select({ id: activities.id })
          .from(activities)
          .where(
            and(eq(activities.userId, ctx.user.id), eq(activities.contactId, input.contactId)),
          );
        countForRequestedContact = direct.length;
      }

      return {
        currentUserId: ctx.user.id,
        requestedContactId: input.contactId ?? null,
        countForRequestedContact,
        matchingContacts,
        activitiesByContactId: byContactId,
        sampleActivities: matchingActivities.slice(0, 10),
      };
    }),

  removeLink: protectedProcedure
    .input(z.object({ linkId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await removeActivityLink(input.linkId, ctx.user.id);
      return { success: true };
    }),
});
