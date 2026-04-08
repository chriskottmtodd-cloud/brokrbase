import { z } from "zod";
import { getStaleContacts, snoozeContact, unsnoozeContact } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const followUpRouter = router({
  staleContacts: protectedProcedure
    .input(z.object({
      thresholds: z.object({
        hot: z.number().min(1).max(365).default(7),
        warm: z.number().min(1).max(365).default(14),
        cold: z.number().min(1).max(365).default(30),
        inactive: z.number().min(1).max(365).default(60),
      }).optional(),
      isOwner: z.boolean().optional(),
      isBuyer: z.boolean().optional(),
    }).optional())
    .query(({ ctx, input }) =>
      getStaleContacts(
        ctx.user.id,
        input?.thresholds ?? { hot: 7, warm: 14, cold: 30, inactive: 60 },
        { isOwner: input?.isOwner, isBuyer: input?.isBuyer }
      )
    ),

  snooze: protectedProcedure
    .input(z.object({
      contactId: z.number().int().positive(),
      days: z.number().int().min(1).max(365),
    }))
    .mutation(({ ctx, input }) =>
      snoozeContact(input.contactId, ctx.user.id, input.days)
    ),

  unsnooze: protectedProcedure
    .input(z.object({
      contactId: z.number().int().positive(),
    }))
    .mutation(({ ctx, input }) =>
      unsnoozeContact(input.contactId, ctx.user.id)
    ),
});
