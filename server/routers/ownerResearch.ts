import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { businessV2Search, contactEnrich } from "../_core/enformion";
import {
  findCrossReferences,
  findPropertyConnections,
  findContactConnections,
  updatePropertyResearchStatus,
} from "../_core/crossReference";
import {
  createOwnerResearchRecord,
  updateOwnerResearchRecord,
  getOwnerResearchForProperty,
  createResearchContact,
  getResearchContactsForProperty,
  getResearchContactById,
  updateResearchContact,
  createContact,
  getContactById,
  updateContact,
  findSimilarContacts,
  updateProperty,
  getPropertyById,
  createContactPropertyLink,
  createContactPhone,
  createContactAddress,
} from "../db";
import { contactEmails } from "../../drizzle/schema";
import { getDb } from "../db/connection";

export const ownerResearchRouter = router({
  // ─── LLC Lookup ───────────────────────────────────────────────────────────
  llcLookup: protectedProcedure
    .input(z.object({
      propertyId: z.number(),
      llcName: z.string().min(1),
      state: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create research record
      const researchId = await createOwnerResearchRecord({
        userId: ctx.user.id,
        propertyId: input.propertyId,
        searchType: "llc_lookup",
        searchInput: JSON.stringify({ llcName: input.llcName, state: input.state }),
        status: "pending",
      });

      try {
        const { contacts, rawResponse, executionTimeMs } = await businessV2Search(
          input.llcName,
          input.state,
        );

        if (contacts.length === 0) {
          await updateOwnerResearchRecord(researchId, {
            status: "no_results",
            rawResponse,
            executionTimeMs,
            apiCost: 0.5,
          });
          return { researchId, contacts: [] };
        }

        // Save each contact
        const savedContacts = [];
        for (const c of contacts) {
          const id = await createResearchContact({
            userId: ctx.user.id,
            ownerResearchId: researchId,
            propertyId: input.propertyId,
            firstName: c.firstName,
            lastName: c.lastName,
            fullName: c.fullName,
            title: c.title,
            contactType: c.contactType,
            isEntity: c.isEntity,
            address: c.address,
            city: c.city,
            state: c.state,
            zip: c.zip,
            county: c.county,
          });
          savedContacts.push({ id, ...c });
        }

        await updateOwnerResearchRecord(researchId, {
          status: "completed",
          rawResponse,
          executionTimeMs,
          apiCost: 0.5,
          entityChain: JSON.stringify(contacts.map((c) => ({
            name: c.fullName,
            type: c.contactType,
            title: c.title,
            address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(", "),
          }))),
        });

        // Save LLC name to property
        await updateProperty(input.propertyId, ctx.user.id, { ownerLlc: input.llcName });

        // Update research status
        await updatePropertyResearchStatus(ctx.user.id, input.propertyId);

        // Cross-reference
        const crossRefs = await findCrossReferences(ctx.user.id, {
          addresses: contacts.filter((c) => c.address).map((c) => ({
            street: c.address!, city: c.city ?? undefined, state: c.state ?? undefined, zip: c.zip ?? undefined,
          })),
          names: contacts.filter((c) => c.firstName && c.lastName && !c.isEntity).map((c) => ({
            first: c.firstName!, last: c.lastName!,
          })),
          entityNames: contacts.filter((c) => c.isEntity).map((c) => c.fullName),
        }, input.propertyId);

        return { researchId, contacts: savedContacts, crossReferences: crossRefs };
      } catch (err) {
        await updateOwnerResearchRecord(researchId, {
          status: "failed",
          rawResponse: String(err),
          apiCost: 0.5,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `LLC lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  // ─── Enrich Contact ───────────────────────────────────────────────────────
  enrichContact: protectedProcedure
    .input(z.object({
      researchContactId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rc = await getResearchContactById(input.researchContactId);
      if (!rc) throw new TRPCError({ code: "NOT_FOUND", message: "Research contact not found" });

      try {
        const { result, rawResponse, identityScore } = await contactEnrich({
          firstName: rc.firstName ?? "",
          lastName: rc.lastName ?? "",
          address: rc.address ?? undefined,
          city: rc.city ?? undefined,
          state: rc.state ?? undefined,
          zip: rc.zip ?? undefined,
        });

        await updateResearchContact(rc.id, {
          isEnriched: true,
          enrichedAt: new Date(),
          identityScore,
          enrichResponse: rawResponse,
        });

        return { ...result, researchContactId: rc.id };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Contact enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  // ─── Manual Entry (Path 2) ────────────────────────────────────────────────
  manualEntry: protectedProcedure
    .input(z.object({
      propertyId: z.number(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create research record
      const researchId = await createOwnerResearchRecord({
        userId: ctx.user.id,
        propertyId: input.propertyId,
        searchType: "contact_enrich",
        searchInput: JSON.stringify(input),
        status: "pending",
      });

      // Create research contact
      const rcId = await createResearchContact({
        userId: ctx.user.id,
        ownerResearchId: researchId,
        propertyId: input.propertyId,
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: `${input.firstName} ${input.lastName}`,
        contactType: "principal",
        isEntity: false,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zip: input.zip ?? null,
      });

      // Auto-run enrichment
      try {
        const { result, rawResponse, identityScore } = await contactEnrich({
          firstName: input.firstName,
          lastName: input.lastName,
          address: input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
        });

        await updateResearchContact(rcId, {
          isEnriched: true,
          enrichedAt: new Date(),
          identityScore,
          enrichResponse: rawResponse,
        });

        await updateOwnerResearchRecord(researchId, {
          status: "completed",
          apiCost: 0.25,
        });

        await updatePropertyResearchStatus(ctx.user.id, input.propertyId);

        return { researchId, researchContactId: rcId, ...result };
      } catch (err) {
        await updateOwnerResearchRecord(researchId, {
          status: "failed",
          rawResponse: String(err),
          apiCost: 0.25,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  // ─── Promote to CRM Contact ───────────────────────────────────────────────
  promoteToContact: protectedProcedure
    .input(z.object({
      researchContactId: z.number(),
      dealRole: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rc = await getResearchContactById(input.researchContactId);
      if (!rc) throw new TRPCError({ code: "NOT_FOUND", message: "Research contact not found" });

      // Parse enrichment data if available
      let enrichData: any = null;
      if (rc.enrichResponse) {
        try {
          const parsed = JSON.parse(rc.enrichResponse);
          enrichData = parsed.person ?? parsed;
        } catch { /* ignore */ }
      }

      // Check for duplicates — include phone from enrichment for better matching
      const firstName = rc.firstName ?? rc.fullName.split(" ")[0] ?? "";
      const lastName = rc.lastName ?? rc.fullName.split(" ").slice(1).join(" ") ?? "";
      const primaryPhone = enrichData?.phones?.[0]?.number ?? null;
      const primaryEmail = enrichData?.emails?.[0]?.email ?? null;
      const duplicates = await findSimilarContacts(ctx.user.id, {
        firstName, lastName,
        phone: primaryPhone ?? undefined,
        email: primaryEmail ?? undefined,
      });

      if (duplicates.length > 0) {
        return {
          action: "duplicate_found" as const,
          existingContacts: duplicates,
          researchContactId: rc.id,
        };
      }

      // Create the contact
      return createAndLinkContact(ctx.user.id, rc, enrichData, input.dealRole);
    }),

  // ─── Confirm Promote (after duplicate check) ─────────────────────────────
  confirmPromote: protectedProcedure
    .input(z.object({
      researchContactId: z.number(),
      action: z.enum(["create_new", "link_existing"]),
      existingContactId: z.number().optional(),
      dealRole: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rc = await getResearchContactById(input.researchContactId);
      if (!rc) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.action === "link_existing" && input.existingContactId) {
        // Link existing contact to property
        await createContactPropertyLink({
          userId: ctx.user.id,
          contactId: input.existingContactId,
          propertyId: rc.propertyId,
          dealRole: (input.dealRole as any) ?? "owner",
          source: "owner_research",
        });

        // Update property owner fields
        const existing = await getContactById(input.existingContactId, ctx.user.id);
        if (existing) {
          await updateProperty(rc.propertyId, ctx.user.id, {
            ownerId: existing.id,
            ownerName: `${existing.firstName} ${existing.lastName}`.trim(),
          });
        }

        await updateResearchContact(rc.id, {
          promotedToContactId: input.existingContactId,
          promotedAt: new Date(),
        });

        await updatePropertyResearchStatus(ctx.user.id, rc.propertyId);
        return { action: "linked" as const, contactId: input.existingContactId };
      }

      // Create new
      let enrichData: any = null;
      if (rc.enrichResponse) {
        try {
          const parsed = JSON.parse(rc.enrichResponse);
          enrichData = parsed.person ?? parsed;
        } catch { /* ignore */ }
      }

      return createAndLinkContact(ctx.user.id, rc, enrichData, input.dealRole);
    }),

  // ─── Get Research for Property ────────────────────────────────────────────
  getForProperty: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const research = await getOwnerResearchForProperty(input.propertyId, ctx.user.id);
      const contacts = await getResearchContactsForProperty(input.propertyId, ctx.user.id);
      return { research, contacts };
    }),

  // ─── Contact Phones CRUD ──────────────────────────────────────────────────
  listPhones: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { getContactPhones } = await import("../db");
      return getContactPhones(input.contactId, ctx.user.id);
    }),

  addPhone: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      number: z.string().min(1),
      type: z.enum(["mobile", "landline", "unknown"]).optional(),
      label: z.string().optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await createContactPhone({
        contactId: input.contactId,
        userId: ctx.user.id,
        number: input.number,
        type: input.type ?? "unknown",
        label: input.label ?? null,
        isPrimary: input.isPrimary ?? false,
        source: "manual",
      });
      return { success: true };
    }),

  updatePhone: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["untried", "verified", "wrong_number", "disconnected", "no_answer"]).optional(),
      statusNotes: z.string().optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { updateContactPhone } = await import("../db");
      const { id, ...data } = input;
      const update: any = {};
      if (data.status !== undefined) update.status = data.status;
      if (data.statusNotes !== undefined) update.statusNotes = data.statusNotes;
      if (data.isPrimary !== undefined) update.isPrimary = data.isPrimary;
      if (data.status) update.lastAttemptAt = new Date();
      await updateContactPhone(id, update);
      return { success: true };
    }),

  deletePhone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const { deleteContactPhone } = await import("../db");
      await deleteContactPhone(input.id);
      return { success: true };
    }),

  // ─── Contact Addresses CRUD ───────────────────────────────────────────────
  listAddresses: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { getContactAddresses } = await import("../db");
      return getContactAddresses(input.contactId, ctx.user.id);
    }),

  // ─── Cross-Reference ─────────────────────────────────────────────────────
  crossReference: protectedProcedure
    .input(z.object({
      addresses: z.array(z.object({
        street: z.string(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
      })),
      names: z.array(z.object({ first: z.string(), last: z.string() })),
      entityNames: z.array(z.string()),
      excludePropertyId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return findCrossReferences(ctx.user.id, input, input.excludePropertyId);
    }),

  // ─── Property Connections (passive check) ─────────────────────────────────
  getPropertyConnections: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ ctx, input }) => {
      return findPropertyConnections(ctx.user.id, input.propertyId);
    }),

  // ─── Contact Connections ──────────────────────────────────────────────────
  getContactConnections: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ ctx, input }) => {
      return findContactConnections(ctx.user.id, input.contactId);
    }),

  // ─── Link contact as owner of a property (from connection panel) ──────────
  linkContactAsOwner: protectedProcedure
    .input(z.object({
      propertyId: z.number(),
      contactId: z.number(),
      mode: z.enum(["co_owner", "replace"]).default("co_owner"),
    }))
    .mutation(async ({ ctx, input }) => {
      const contact = await getContactById(input.contactId, ctx.user.id);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });

      // Check if this contact is already linked to this property
      const db = await getDb();
      if (db) {
        const { contactPropertyLinks } = await import("../../drizzle/schema");
        const { and, eq } = await import("drizzle-orm");
        const existing = await db.select({ id: contactPropertyLinks.id })
          .from(contactPropertyLinks)
          .where(and(
            eq(contactPropertyLinks.contactId, input.contactId),
            eq(contactPropertyLinks.propertyId, input.propertyId),
          ))
          .limit(1);
        if (existing.length > 0) {
          // Already linked — just return success without creating duplicate
          return { success: true, alreadyLinked: true };
        }
      }

      // Create the contact_property_link record
      await createContactPropertyLink({
        userId: ctx.user.id,
        contactId: input.contactId,
        propertyId: input.propertyId,
        dealRole: "owner",
        source: "owner_research",
      });

      // Handle primary owner assignment based on mode
      const { recomputePrimaryOwner, setPrimaryOwner } = await import("../db");
      if (input.mode === "replace") {
        // Force this contact to be primary
        await setPrimaryOwner(input.propertyId, input.contactId, ctx.user.id);
      } else {
        // Co-owner mode: only sets primary if no current owner exists
        await recomputePrimaryOwner(input.propertyId, ctx.user.id);
      }

      await updatePropertyResearchStatus(ctx.user.id, input.propertyId);
      return { success: true };
    }),

  // ─── Update Research Status ───────────────────────────────────────────────
  updateResearchStatus: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await updatePropertyResearchStatus(ctx.user.id, input.propertyId);
      return { success: true };
    }),
});

// ─── Helper: Create contact + populate phones/emails/addresses + link ─────

async function createAndLinkContact(
  userId: number,
  rc: any,
  enrichData: any,
  dealRole?: string,
) {
  const firstName = rc.firstName ?? rc.fullName.split(" ")[0] ?? "";
  const lastName = rc.lastName ?? rc.fullName.split(" ").slice(1).join(" ") ?? "";

  // Get primary phone/email from enrichment
  const phones = enrichData?.phones ?? [];
  const emails = enrichData?.emails ?? [];
  const addresses = enrichData?.addresses ?? [];
  const primaryPhone = phones[0]?.number ?? null;
  const primaryEmail = emails[0]?.email ?? null;

  // Create CRM contact
  const result = await createContact({
    userId,
    firstName,
    lastName,
    email: primaryEmail ?? undefined,
    phone: primaryPhone ?? undefined,
    company: undefined,
    isOwner: true,
    isBuyer: false,
    address: rc.address ?? addresses[0]?.street ?? undefined,
    city: rc.city ?? addresses[0]?.city ?? undefined,
    state: rc.state ?? addresses[0]?.state ?? undefined,
    zip: rc.zip ?? addresses[0]?.zip ?? undefined,
    priority: "warm",
  });

  const contactId = (result as any)?.insertId;
  if (!contactId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create contact" });

  // Populate contact_phones
  for (const phone of phones) {
    try {
      const phoneType = (phone.type === "mobile" || phone.type === "landline") ? phone.type : "unknown";
      await createContactPhone({
        contactId,
        userId,
        number: phone.number,
        type: phoneType,
        isPrimary: phone === phones[0],
        isConnected: phone.isConnected ?? null,
        source: "enformion",
        firstReportedDate: phone.firstReportedDate ?? null,
        lastReportedDate: phone.lastReportedDate ?? null,
      });
    } catch { /* skip invalid phone entries */ }
  }

  // Populate contact_emails
  const db = await getDb();
  if (db) {
    for (const email of emails) {
      try {
        await db.insert(contactEmails).values({
          contactId,
          userId,
          email: email.email,
          isPrimary: email === emails[0],
        });
      } catch { /* skip duplicates or invalid entries */ }
    }
  }

  // Populate contact_addresses
  for (const addr of addresses) {
    try {
      await createContactAddress({
        contactId,
        userId,
        street: addr.street ?? null,
        unit: addr.unit ?? null,
        city: addr.city ?? null,
        state: addr.state ?? null,
        zip: addr.zip ?? null,
        isPrimary: addr === addresses[0],
        source: "enformion",
        firstReportedDate: addr.firstReportedDate ?? null,
        lastReportedDate: addr.lastReportedDate ?? null,
      });
    } catch { /* skip invalid address entries */ }
  }

  // Link to property
  await createContactPropertyLink({
    userId,
    contactId,
    propertyId: rc.propertyId,
    dealRole: (dealRole as any) ?? "owner",
    source: "owner_research",
  });

  // Update property owner fields
  await updateProperty(rc.propertyId, userId, {
    ownerId: contactId,
    ownerName: `${firstName} ${lastName}`.trim(),
  });

  // Update research contact
  await updateResearchContact(rc.id, {
    promotedToContactId: contactId,
    promotedAt: new Date(),
  });

  // Update research status
  await updatePropertyResearchStatus(userId, rc.propertyId);

  return { action: "created" as const, contactId };
}
