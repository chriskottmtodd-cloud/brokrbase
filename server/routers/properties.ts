import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createProperty,
  deleteProperty,
  findDuplicateProperty,
  getProperties,
  getPropertiesByOwner,
  getPropertiesForMap,
  getPropertyById,
  updateProperty,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";

const PROPERTY_TYPE_ENUM = z.enum([
  "mhc",
  "apartment",
  "affordable_housing",
  "self_storage",
  "office",
  "retail",
  "industrial",
  "other",
]);

const STATUS_ENUM = z.enum([
  "researching",
  "prospecting",
  "seller",
  "listed",
  "under_contract",
  "recently_sold",
]);

export const propertiesRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          propertyType: z.string().optional(),
          status: z.string().optional(),
          minUnits: z.number().optional(),
          maxUnits: z.number().optional(),
          city: z.string().optional(),
          county: z.string().optional(),
          ownerId: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => getProperties(ctx.user.id, input)),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const property = await getPropertyById(input.id, ctx.user.id);
      if (!property) throw new TRPCError({ code: "NOT_FOUND" });
      return property;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        propertyType: PROPERTY_TYPE_ENUM,
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        county: z.string().optional(),
        unitCount: z.number().optional(),
        vintageYear: z.number().optional(),
        yearRenovated: z.number().optional(),
        sizeSqft: z.number().optional(),
        lotAcres: z.number().optional(),
        estimatedValue: z.number().optional(),
        askingPrice: z.number().optional(),
        capRate: z.number().optional(),
        noi: z.number().optional(),
        status: STATUS_ENUM.optional(),
        ownerId: z.number().optional(),
        ownerName: z.string().optional(),
        ownerCompany: z.string().optional(),
        ownerPhone: z.string().optional(),
        ownerEmail: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        boundary: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createProperty({ ...input, userId: ctx.user.id });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          name: z.string().optional(),
          propertyType: PROPERTY_TYPE_ENUM.optional(),
          address: z.string().nullable().optional(),
          city: z.string().nullable().optional(),
          state: z.string().nullable().optional(),
          zip: z.string().nullable().optional(),
          county: z.string().nullable().optional(),
          unitCount: z.number().nullable().optional(),
          vintageYear: z.number().nullable().optional(),
          yearRenovated: z.number().nullable().optional(),
          sizeSqft: z.number().nullable().optional(),
          lotAcres: z.number().nullable().optional(),
          estimatedValue: z.number().nullable().optional(),
          askingPrice: z.number().nullable().optional(),
          capRate: z.number().nullable().optional(),
          noi: z.number().nullable().optional(),
          status: STATUS_ENUM.optional(),
          ownerId: z.number().nullable().optional(),
          ownerName: z.string().nullable().optional(),
          ownerCompany: z.string().nullable().optional(),
          ownerPhone: z.string().nullable().optional(),
          ownerEmail: z.string().nullable().optional(),
          latitude: z.number().nullable().optional(),
          longitude: z.number().nullable().optional(),
          boundary: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await updateProperty(input.id, ctx.user.id, input.data);
      return { success: true };
    }),

  forMap: protectedProcedure.query(({ ctx }) => getPropertiesForMap(ctx.user.id)),

  // Returns the Google Maps API key so the client can load the JS lib.
  // This is a public-readable browser key (Google restricts it via referrer).
  mapsConfig: protectedProcedure.query(() => ({
    apiKey: ENV.googleMapsApiKey,
  })),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteProperty(input.id, ctx.user.id);
      return { success: true };
    }),

  byOwner: protectedProcedure
    .input(z.object({ ownerId: z.number() }))
    .query(({ ctx, input }) => getPropertiesByOwner(input.ownerId, ctx.user.id)),

  checkDuplicate: protectedProcedure
    .input(z.object({ name: z.string(), address: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const id = await findDuplicateProperty(ctx.user.id, input.name, input.address);
      return { duplicateId: id };
    }),
});
