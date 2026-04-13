import { and, desc, eq } from "drizzle-orm";
import {
  InsertContactPropertyLink,
  contactPropertyLinks,
  contacts,
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
  return db
    .select({
      id: contactPropertyLinks.id,
      contactId: contactPropertyLinks.contactId,
      propertyId: contactPropertyLinks.propertyId,
      source: contactPropertyLinks.source,
      label: contactPropertyLinks.label,
      dealRole: contactPropertyLinks.dealRole,
      createdAt: contactPropertyLinks.createdAt,
      propertyName: properties.name,
      propertyCity: properties.city,
      propertyType: properties.propertyType,
    })
    .from(contactPropertyLinks)
    .leftJoin(properties, eq(contactPropertyLinks.propertyId, properties.id))
    .where(
      and(
        eq(contactPropertyLinks.contactId, contactId),
        eq(contactPropertyLinks.userId, userId),
      )
    )
    .orderBy(desc(contactPropertyLinks.createdAt));
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
  dealRole: "owner" | "seller" | "buyer" | "tenant" | "buyers_broker" | "listing_agent" | "property_manager" | "attorney" | "lender" | "other" | null,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.update(contactPropertyLinks)
    .set({ dealRole })
    .where(and(eq(contactPropertyLinks.id, id), eq(contactPropertyLinks.userId, userId)));
}

export async function getContactsForProperty(propertyId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      id: contactPropertyLinks.id,
      linkId: contactPropertyLinks.id,
      contactId: contactPropertyLinks.contactId,
      dealRole: contactPropertyLinks.dealRole,
      label: contactPropertyLinks.label,
      source: contactPropertyLinks.source,
      createdAt: contactPropertyLinks.createdAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      company: contacts.company,
    })
    .from(contactPropertyLinks)
    .innerJoin(contacts, eq(contactPropertyLinks.contactId, contacts.id))
    .where(and(eq(contactPropertyLinks.propertyId, propertyId), eq(contactPropertyLinks.userId, userId)))
    .orderBy(desc(contactPropertyLinks.createdAt));
}

export async function getContactPropertyLinksForProperty(userId: number, propertyId: number) {
  return getContactsForProperty(propertyId, userId);
}
