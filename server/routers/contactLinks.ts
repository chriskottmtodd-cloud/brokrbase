import { z } from "zod";
import {
  createContactPropertyLink,
  getContactPropertyLinks,
  deleteContactPropertyLink,
  getContactsForProperty,
  updateContactPropertyLinkRole,
  getContactPropertyLinkById,
  updateProperty,
  getDealConnectionsForContact,
  findDealMentionsInText,
  recomputePrimaryOwner,
  setPrimaryOwner,
} from "../db";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

const DEAL_ROLE_ENUM = z.enum([
  "owner", "seller", "buyer", "buyers_broker",
  "listing_agent", "property_manager", "attorney", "lender", "other",
]);

export const contactLinksRouter = router({
  /** Get all property/listing links for a contact */
  listForContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(({ ctx, input }) =>
      getContactPropertyLinks(input.contactId, ctx.user.id)
    ),

  /** Get all contacts linked to a property */
  listForProperty: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(({ ctx, input }) =>
      getContactsForProperty(input.propertyId, ctx.user.id)
    ),

  /** Get buyer-interest and listing-seller connections for a contact (merged deal view) */
  getDealConnections: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(({ ctx, input }) =>
      getDealConnectionsForContact(input.contactId, ctx.user.id)
    ),

  /** Fuzzy-match a note text against listing/property names and return potential deal links */
  suggestDealLinks: protectedProcedure
    .input(z.object({ text: z.string(), contactId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.text.trim()) return { suggestions: [] };
      const matches = await findDealMentionsInText(input.text, ctx.user.id);
      return { suggestions: matches };
    }),

  /** Create a link between a contact and a property/listing.
   *  If dealRole === "owner" and a propertyId is provided, also sets
   *  properties.ownerId so the map and other owner-FK queries stay in sync.
   */
  create: protectedProcedure
    .input(
      z.object({
        contactId: z.number(),
        propertyId: z.number().optional(),
        listingId: z.number().optional(),
        source: z
          .enum(["email_studio", "ai_assistant", "manual", "import", "task", "activity"])
          .default("manual"),
        label: z.string().optional(),
        dealRole: DEAL_ROLE_ENUM.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await createContactPropertyLink({
        userId: ctx.user.id,
        contactId: input.contactId,
        propertyId: input.propertyId ?? null,
        listingId: input.listingId ?? null,
        source: input.source,
        label: input.label ?? null,
        dealRole: input.dealRole ?? null,
      });

      // Recompute primary owner if this affects ownership
      if (input.propertyId) {
        await recomputePrimaryOwner(input.propertyId, ctx.user.id).catch(() => {});
      }

      return result;
    }),

  /** Update the dealRole on an existing link.
   *  - Setting TO "owner": update property.ownerId = contactId
   *  - Setting AWAY from "owner": clear property.ownerId if it still points to this contact
   */
  updateRole: protectedProcedure
    .input(z.object({
      id: z.number(),
      dealRole: DEAL_ROLE_ENUM.nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const link = await getContactPropertyLinkById(input.id, ctx.user.id);
      await updateContactPropertyLinkRole(input.id, input.dealRole, ctx.user.id);
      if (link?.propertyId) {
        await recomputePrimaryOwner(link.propertyId, ctx.user.id).catch(() => {});
      }
      return { ok: true };
    }),

  /** Set a specific contact as the primary owner of a property. */
  setPrimaryOwner: protectedProcedure
    .input(z.object({ propertyId: z.number(), contactId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await setPrimaryOwner(input.propertyId, input.contactId, ctx.user.id);
        return { ok: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to set primary owner",
        });
      }
    }),

  /** Delete a link by its ID.
   *  If the deleted link had dealRole "owner", also clears property.ownerId.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const link = await getContactPropertyLinkById(input.id, ctx.user.id);
      await deleteContactPropertyLink(input.id, ctx.user.id);
      if (link?.propertyId) {
        await recomputePrimaryOwner(link.propertyId, ctx.user.id).catch(() => {});
      }
      return { ok: true };
    }),
});
