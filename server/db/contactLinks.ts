import { and, desc, eq } from "drizzle-orm";
import {
  InsertContactPropertyLink,
  contactPropertyLinks,
  contacts,
  listings,
  properties,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createContactPropertyLink(data: InsertContactPropertyLink) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.insert(contactPropertyLinks).values(data);
}

export async function getContactPropertyLinks(contactId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Join with properties and listings to get names
  const rows = await db
    .select({
      id: contactPropertyLinks.id,
      contactId: contactPropertyLinks.contactId,
      propertyId: contactPropertyLinks.propertyId,
      listingId: contactPropertyLinks.listingId,
      source: contactPropertyLinks.source,
      label: contactPropertyLinks.label,
      dealRole: contactPropertyLinks.dealRole,
      createdAt: contactPropertyLinks.createdAt,
      propertyName: properties.name,
      propertyCity: properties.city,
      propertyType: properties.propertyType,
      listingTitle: listings.title,
      listingStage: listings.stage,
    })
    .from(contactPropertyLinks)
    .leftJoin(properties, eq(contactPropertyLinks.propertyId, properties.id))
    .leftJoin(listings, eq(contactPropertyLinks.listingId, listings.id))
    .where(
      and(
        eq(contactPropertyLinks.contactId, contactId),
        eq(contactPropertyLinks.userId, userId),
      )
    )
    .orderBy(desc(contactPropertyLinks.createdAt));
  return rows;
}

export async function getContactPropertyLinkById(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(contactPropertyLinks)
    .where(and(eq(contactPropertyLinks.id, id), eq(contactPropertyLinks.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteContactPropertyLink(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.delete(contactPropertyLinks).where(
    and(eq(contactPropertyLinks.id, id), eq(contactPropertyLinks.userId, userId))
  );
}

export async function updateContactPropertyLinkRole(
  id: number,
  dealRole: "owner" | "seller" | "buyer" | "buyers_broker" | "listing_agent" | "property_manager" | "attorney" | "lender" | "other" | null,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.update(contactPropertyLinks)
    .set({ dealRole })
    .where(and(eq(contactPropertyLinks.id, id), eq(contactPropertyLinks.userId, userId)));
}

/**
 * Recompute the primary owner for a property based on contact_property_links.
 * Logic:
 * - If property.ownerId is already set AND that contact still has an "owner" link → keep it
 * - Otherwise pick the most recently created "owner" link as primary
 * - If no owner links exist, clear ownerId and ownerName
 *
 * Always called after any link create/update/delete to keep denormalized fields in sync.
 */
export async function recomputePrimaryOwner(propertyId: number, userId: number) {
  const db = await getDb();
  if (!db) return;

  // Get current property
  const [prop] = await db
    .select({ id: properties.id, ownerId: properties.ownerId })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1);
  if (!prop) return;

  // Get all owner links
  const ownerLinks = await db
    .select({
      id: contactPropertyLinks.id,
      contactId: contactPropertyLinks.contactId,
      createdAt: contactPropertyLinks.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contactPropertyLinks)
    .innerJoin(contacts, eq(contactPropertyLinks.contactId, contacts.id))
    .where(and(
      eq(contactPropertyLinks.propertyId, propertyId),
      eq(contactPropertyLinks.userId, userId),
      eq(contactPropertyLinks.dealRole, "owner"),
    ))
    .orderBy(desc(contactPropertyLinks.createdAt));

  if (ownerLinks.length === 0) {
    // No owner links — clear primary owner fields
    await db.update(properties)
      .set({ ownerId: null, ownerName: null })
      .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
    return;
  }

  // If current ownerId is still in the owner list, keep it
  const currentStillOwner = prop.ownerId ? ownerLinks.find((l) => l.contactId === prop.ownerId) : undefined;
  const primary = currentStillOwner ?? ownerLinks[0];

  await db.update(properties)
    .set({
      ownerId: primary.contactId,
      ownerName: `${primary.firstName} ${primary.lastName}`.trim(),
    })
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
}

/**
 * Set a specific contact as the primary owner of a property.
 * Validates that the contact has an "owner" link to this property.
 */
export async function setPrimaryOwner(propertyId: number, contactId: number, userId: number) {
  const db = await getDb();
  if (!db) return;

  // Verify the contact has an owner link
  const [link] = await db
    .select({ id: contactPropertyLinks.id })
    .from(contactPropertyLinks)
    .where(and(
      eq(contactPropertyLinks.propertyId, propertyId),
      eq(contactPropertyLinks.contactId, contactId),
      eq(contactPropertyLinks.userId, userId),
      eq(contactPropertyLinks.dealRole, "owner"),
    ))
    .limit(1);
  if (!link) throw new Error("Contact is not linked as an owner of this property");

  // Get contact name
  const [contact] = await db
    .select({ firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) throw new Error("Contact not found");

  await db.update(properties)
    .set({
      ownerId: contactId,
      ownerName: `${contact.firstName} ${contact.lastName}`.trim(),
    })
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
}

export async function getContactsForProperty(propertyId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      id: contactPropertyLinks.id,
      contactId: contactPropertyLinks.contactId,
      source: contactPropertyLinks.source,
      label: contactPropertyLinks.label,
      dealRole: contactPropertyLinks.dealRole,
      createdAt: contactPropertyLinks.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
      email: contacts.email,
      phone: contacts.phone,
      priority: contacts.priority,
    })
    .from(contactPropertyLinks)
    .innerJoin(contacts, eq(contactPropertyLinks.contactId, contacts.id))
    .where(
      and(
        eq(contactPropertyLinks.propertyId, propertyId),
        eq(contactPropertyLinks.userId, userId),
      )
    )
    .orderBy(desc(contactPropertyLinks.createdAt));
}

export async function getContactPropertyLinksForProperty(userId: number, propertyId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      id: contactPropertyLinks.id,
      contactId: contactPropertyLinks.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactCompany: contacts.company,
      dealRole: contactPropertyLinks.dealRole,
      source: contactPropertyLinks.source,
    })
    .from(contactPropertyLinks)
    .leftJoin(contacts, eq(contactPropertyLinks.contactId, contacts.id))
    .where(and(eq(contactPropertyLinks.userId, userId), eq(contactPropertyLinks.propertyId, propertyId)));
}
