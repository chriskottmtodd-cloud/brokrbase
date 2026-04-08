import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getBuyerCriteria,
  upsertBuyerCriteria,
  deleteBuyerCriteria,
  matchPropertiesForBuyer,
  matchBuyersForProperty,
  getContactById,
  getPropertyById,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

// Zod schema for criteria input
const criteriaInput = z.object({
  contactId: z.number().int().positive(),
  propertyTypes: z.array(z.enum(["mhc", "apartment", "affordable_housing", "self_storage", "other"])).optional(),
  minUnits: z.number().int().min(0).nullable().optional(),
  maxUnits: z.number().int().min(0).nullable().optional(),
  minVintageYear: z.number().int().min(1800).max(2100).nullable().optional(),
  maxVintageYear: z.number().int().min(1800).max(2100).nullable().optional(),
  minPrice: z.number().min(0).nullable().optional(),
  maxPrice: z.number().min(0).nullable().optional(),
  markets: z.array(z.string().min(1)).optional(), // cities or counties
  states: z.array(z.string().min(1)).optional(),
  statuses: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const buyerCriteriaRouter = router({
  // Get criteria for a specific buyer contact
  get: protectedProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return getBuyerCriteria(input.contactId, ctx.user.id);
    }),

  // Upsert (create or update) criteria for a buyer contact
  upsert: protectedProcedure
    .input(criteriaInput)
    .mutation(async ({ ctx, input }) => {
      // Verify the contact belongs to this user
      const contact = await getContactById(input.contactId, ctx.user.id);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });

      await upsertBuyerCriteria({
        userId: ctx.user.id,
        contactId: input.contactId,
        propertyTypes: input.propertyTypes && input.propertyTypes.length > 0
          ? JSON.stringify(input.propertyTypes)
          : null,
        minUnits: input.minUnits ?? null,
        maxUnits: input.maxUnits ?? null,
        minVintageYear: input.minVintageYear ?? null,
        maxVintageYear: input.maxVintageYear ?? null,
        minPrice: input.minPrice ?? null,
        maxPrice: input.maxPrice ?? null,
        markets: input.markets && input.markets.length > 0
          ? JSON.stringify(input.markets)
          : null,
        states: input.states && input.states.length > 0
          ? JSON.stringify(input.states)
          : null,
        statuses: input.statuses && input.statuses.length > 0
          ? JSON.stringify(input.statuses)
          : null,
        notes: input.notes ?? null,
      });

      return { success: true };
    }),

  // Delete criteria for a buyer contact
  delete: protectedProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteBuyerCriteria(input.contactId, ctx.user.id);
      return { success: true };
    }),

  // Get all properties that match a buyer's criteria
  matchProperties: protectedProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const criteria = await getBuyerCriteria(input.contactId, ctx.user.id);
      if (!criteria) return { criteria: null, matches: [] };
      const matches = await matchPropertiesForBuyer(criteria, ctx.user.id);
      return { criteria, matches };
    }),

  // Get all buyers whose criteria match a given property
  matchBuyers: protectedProcedure
    .input(z.object({ propertyId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const property = await getPropertyById(input.propertyId, ctx.user.id);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      const matches = await matchBuyersForProperty(property, ctx.user.id);
      return matches;
    }),
});
