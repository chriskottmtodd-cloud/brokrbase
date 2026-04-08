import { z } from "zod";
import {
  findDuplicateContacts,
  findDuplicateProperties,
  mergeContacts,
  mergeProperties,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const dataCleanupRouter = router({
  findDuplicateContacts: protectedProcedure.query(({ ctx }) =>
    findDuplicateContacts(ctx.user.id)
  ),

  findDuplicateProperties: protectedProcedure.query(({ ctx }) =>
    findDuplicateProperties(ctx.user.id)
  ),

  mergeContacts: protectedProcedure
    .input(
      z.object({
        targetId: z.number().int().positive(),
        sourceId: z.number().int().positive(),
      })
    )
    .mutation(({ ctx, input }) =>
      mergeContacts(input.targetId, input.sourceId, ctx.user.id)
    ),

  mergeProperties: protectedProcedure
    .input(
      z.object({
        targetId: z.number().int().positive(),
        sourceId: z.number().int().positive(),
      })
    )
    .mutation(({ ctx, input }) =>
      mergeProperties(input.targetId, input.sourceId, ctx.user.id)
    ),
});
