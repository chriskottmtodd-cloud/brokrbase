import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createListing,
  getBuyerInterestsByListing,
  getListingById,
  getListings,
  getPropertyById,
  syncPropertyStatusFromListing,
  updateBuyerInterest,
  updateListing,
  upsertBuyerInterest,
  getListingSellers,
  addListingSeller,
  removeListingSeller,
  createDealActivity,
  getDealActivities,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const listingsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), stage: z.string().optional(), search: z.string().optional() }).optional())
    .query(({ ctx, input }) => getListings(ctx.user.id, input)),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const listing = await getListingById(input.id, ctx.user.id);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      return listing;
    }),

  create: protectedProcedure
    .input(z.object({
      propertyId: z.number().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      askingPrice: z.number().optional(),
      capRate: z.number().optional(),
      noi: z.number().optional(),
      unitCount: z.number().optional(),
      stage: z.enum(["new", "active", "under_contract", "closed", "withdrawn", "expired"]).default("active"),
      status: z.enum(["active", "under_contract", "sold", "withdrawn"]).default("active"),
      sellerId: z.number().optional(),
      brokerNotes: z.string().optional(),
      marketingMemo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let propertyName: string | undefined;
      if (input.propertyId) {
        const prop = await getPropertyById(input.propertyId, ctx.user.id);
        propertyName = prop?.name;
      }
      await createListing({ ...input, propertyId: input.propertyId ?? 0, userId: ctx.user.id, propertyName });

      // Sync property status from the new listing's stage
      if (input.propertyId) {
        // Fetch the newly inserted listing (most recent for this property+user)
        const allListings = await getListings(ctx.user.id);
        const newListing = allListings.find(l => l.propertyId === input.propertyId);
        if (newListing) await syncPropertyStatusFromListing(newListing.id, ctx.user.id);
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      askingPrice: z.number().optional(),
      capRate: z.number().optional(),
      noi: z.number().optional(),
      unitCount: z.number().optional(),
      stage: z.enum(["new", "active", "under_contract", "closed", "withdrawn", "expired"]).optional(),
      status: z.enum(["active", "under_contract", "sold", "withdrawn"]).optional(),
      sellerId: z.number().optional(),
      brokerNotes: z.string().optional(),
      marketingMemo: z.string().optional(),
      closedAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateListing(id, ctx.user.id, data);
      // If stage changed, sync the linked property status automatically
      if (data.stage !== undefined) {
        await syncPropertyStatusFromListing(id, ctx.user.id);
      }
    }),

  buyerInterests: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .query(({ ctx, input }) => getBuyerInterestsByListing(input.listingId, ctx.user.id)),

  upsertBuyerInterest: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      contactId: z.number(),
      status: z.enum(["prospect", "contacted", "interested", "toured", "loi_submitted", "under_contract", "closed", "passed"]).default("prospect"),
      offerAmount: z.number().optional(),
      notes: z.string().optional(),
      lastContactedAt: z.date().optional(),
    }))
    .mutation(({ ctx, input }) => upsertBuyerInterest({ ...input, userId: ctx.user.id })),

  updateBuyerInterest: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["prospect", "contacted", "interested", "toured", "loi_submitted", "under_contract", "closed", "passed"]).optional(),
      offerAmount: z.number().optional(),
      notes: z.string().optional(),
      lastContactedAt: z.date().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateBuyerInterest(id, ctx.user.id, data);
    }),

  // ── Listing Sellers ────────────────────────────────────────────────────────
  getSellers: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .query(({ ctx, input }) => getListingSellers(input.listingId, ctx.user.id)),

  addSeller: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      contactId: z.number(),
      role: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      addListingSeller({ ...input, userId: ctx.user.id, role: input.role ?? "seller" })
    ),

  removeSeller: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => removeListingSeller(input.id, ctx.user.id)),

  // ── Deal Activities ────────────────────────────────────────────────────────
  dealActivities: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .query(({ ctx, input }) => getDealActivities(input.listingId, ctx.user.id)),

  createDealActivity: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      type: z.enum(["loi", "offer", "call", "email", "note", "price_change", "stage_change", "buyer_added", "document", "other"]).default("note"),
      summary: z.string(),
    }))
    .mutation(({ ctx, input }) =>
      createDealActivity({ ...input, userId: ctx.user.id })
    ),
});
