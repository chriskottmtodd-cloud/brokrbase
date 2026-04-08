import { z } from "zod";
import {
  getUnitTypesByProperty,
  upsertUnitType,
  bulkUpsertUnitTypes,
  deleteUnitType,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const unitTypeSchema = z.object({
  id: z.number().optional(),
  propertyId: z.number(),
  userId: z.number().optional(),
  label: z.string().min(1),
  bedCount: z.number().nullable().optional(),
  bathCount: z.number().nullable().optional(),
  unitCount: z.number().nullable().optional(),
  avgSqft: z.number().nullable().optional(),
  askingRent: z.number().nullable().optional(),
  effectiveRent: z.number().nullable().optional(),
  renovationTier: z.enum(["classic", "renovated", "premium"]).nullable().optional(),
  yearRenovated: z.number().nullable().optional(),
  vacantUnits: z.number().nullable().optional(),
  rentDataSource: z.string().nullable().optional(),
  rentDataDate: z.string().nullable().optional(),
});

export const unitTypesRouter = router({
  list: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ input }) => {
      return getUnitTypesByProperty(input.propertyId);
    }),

  upsert: protectedProcedure
    .input(unitTypeSchema)
    .mutation(async ({ input, ctx }) => {
      await upsertUnitType({
        ...input,
        userId: ctx.user.id,
        rentDataDate: input.rentDataDate ? new Date(input.rentDataDate) : null,
      });
      return { success: true };
    }),

  bulkUpsert: protectedProcedure
    .input(
      z.object({
        propertyId: z.number(),
        units: z.array(unitTypeSchema),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const mapped = input.units.map((u) => ({
        ...u,
        propertyId: input.propertyId,
        userId: ctx.user.id,
        rentDataDate: u.rentDataDate ? new Date(u.rentDataDate) : null,
      }));
      await bulkUpsertUnitTypes(input.propertyId, ctx.user.id, mapped);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteUnitType(input.id);
      return { success: true };
    }),
});
