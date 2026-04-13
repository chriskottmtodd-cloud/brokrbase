import { z } from "zod";
import {
  createContactPropertyLink,
  deleteContactPropertyLink,
  getContactPropertyLinkById,
  getContactPropertyLinks,
  getContactsForProperty,
  updateContactPropertyLinkRole,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const DEAL_ROLE_ENUM = z.enum([
  "owner", "seller", "buyer", "tenant", "buyers_broker",
  "listing_agent", "property_manager", "attorney", "lender", "other",
]);

const SOURCE_ENUM = z.enum(["email_studio", "manual", "import", "task", "activity"]);

export const contactLinksRouter = router({
  listForContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(({ ctx, input }) =>
      getContactPropertyLinks(input.contactId, ctx.user.id)
    ),

  listForProperty: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(({ ctx, input }) =>
      getContactsForProperty(input.propertyId, ctx.user.id)
    ),

  create: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        propertyId: z.number().optional(),
        source: SOURCE_ENUM.default("manual"),
        label: z.string().optional(),
        dealRole: DEAL_ROLE_ENUM.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createContactPropertyLink({
        userId: ctx.user.id,
        contactId: input.contactId,
        propertyId: input.propertyId ?? null,
        source: input.source,
        label: input.label ?? null,
        dealRole: input.dealRole ?? null,
      });
    }),

  updateRole: protectedProcedure
    .input(z.object({
      id: z.number(),
      dealRole: DEAL_ROLE_ENUM.nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateContactPropertyLinkRole(input.id, input.dealRole, ctx.user.id);
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const link = await getContactPropertyLinkById(input.id, ctx.user.id);
      if (!link) return { ok: false };
      await deleteContactPropertyLink(input.id, ctx.user.id);
      return { ok: true };
    }),
});
