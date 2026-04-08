import { and, eq } from "drizzle-orm";
import {
  Contact,
  InsertContact,
  InsertProperty,
  Property,
  activities,
  buyerInterests,
  contactEmails,
  contactPropertyLinks,
  contacts,
  listingSellers,
  properties,
  saleRecords,
  tasks,
  unsolicitedOffers,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export interface DuplicateContactPair {
  contact1: Contact;
  contact2: Contact;
  reasons: string[]; // e.g. ["same_email", "same_name"]
}

export interface DuplicatePropertyPair {
  property1: Property;
  property2: Property;
  reasons: string[]; // e.g. ["same_geocode", "same_name_city"]
}

export async function findDuplicateContacts(userId: number): Promise<DuplicateContactPair[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const allContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(contacts.createdAt);

  const pairs: DuplicateContactPair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < allContacts.length; i++) {
    for (let j = i + 1; j < allContacts.length; j++) {
      const a = allContacts[i];
      const b = allContacts[j];
      const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
      if (seen.has(key)) continue;

      const reasons: string[] = [];

      // Same name (case-insensitive, trimmed)
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase().trim();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase().trim();
      if (nameA === nameB && nameA.length > 1) reasons.push("same_name");

      // Same email
      if (a.email && b.email && a.email.toLowerCase().trim() === b.email.toLowerCase().trim()) {
        reasons.push("same_email");
      }

      // Same phone (strip non-digits for comparison)
      const phoneA = (a.phone ?? "").replace(/\D/g, "");
      const phoneB = (b.phone ?? "").replace(/\D/g, "");
      if (phoneA.length >= 7 && phoneA === phoneB) reasons.push("same_phone");

      if (reasons.length > 0) {
        seen.add(key);
        pairs.push({ contact1: a, contact2: b, reasons });
      }
    }
  }

  return pairs;
}

export async function findDuplicateProperties(userId: number): Promise<DuplicatePropertyPair[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const allProps = await db
    .select()
    .from(properties)
    .where(eq(properties.userId, userId))
    .orderBy(properties.createdAt);

  const pairs: DuplicatePropertyPair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < allProps.length; i++) {
    for (let j = i + 1; j < allProps.length; j++) {
      const a = allProps[i];
      const b = allProps[j];
      const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
      if (seen.has(key)) continue;

      const reasons: string[] = [];

      // Same geocode (within ~50m: ~0.0005 degrees)
      if (
        a.latitude != null && a.longitude != null &&
        b.latitude != null && b.longitude != null
      ) {
        const latDiff = Math.abs(a.latitude - b.latitude);
        const lngDiff = Math.abs(a.longitude - b.longitude);
        if (latDiff < 0.0005 && lngDiff < 0.0005) reasons.push("same_geocode");
      }

      // Same name in same city (case-insensitive)
      if (
        a.name && b.name &&
        a.name.toLowerCase().trim() === b.name.toLowerCase().trim() &&
        a.city && b.city &&
        a.city.toLowerCase().trim() === b.city.toLowerCase().trim()
      ) {
        reasons.push("same_name_city");
      }

      if (reasons.length > 0) {
        seen.add(key);
        pairs.push({ property1: a, property2: b, reasons });
      }
    }
  }

  return pairs;
}

/** Pick the "best" value between two options: prefer non-null, then longer string */
function pickBest<T>(a: T, b: T): T {
  if (a == null) return b;
  if (b == null) return a;
  if (typeof a === "string" && typeof b === "string") {
    return a.length >= b.length ? a : b;
  }
  return a;
}

/**
 * Merge contact `sourceId` into `targetId`.
 * - Best field values are written to target
 * - All linked data (activities, tasks, contactPropertyLinks, listingSellers, buyerInterests, contactEmails)
 *   is re-pointed to target
 * - Source contact is deleted
 */
export async function mergeContacts(
  targetId: number,
  sourceId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [target] = await db.select().from(contacts).where(and(eq(contacts.id, targetId), eq(contacts.userId, userId)));
  const [source] = await db.select().from(contacts).where(and(eq(contacts.id, sourceId), eq(contacts.userId, userId)));
  if (!target || !source) throw new Error("Contact not found");

  // Build merged record — pick best value for each field
  const merged: Partial<InsertContact> = {
    firstName: pickBest(target.firstName, source.firstName),
    lastName: pickBest(target.lastName, source.lastName),
    email: pickBest(target.email ?? null, source.email ?? null) ?? undefined,
    phone: pickBest(target.phone ?? null, source.phone ?? null) ?? undefined,
    company: pickBest(target.company ?? null, source.company ?? null) ?? undefined,
    address: pickBest(target.address ?? null, source.address ?? null) ?? undefined,
    city: pickBest(target.city ?? null, source.city ?? null) ?? undefined,
    state: pickBest(target.state ?? null, source.state ?? null) ?? undefined,
    zip: pickBest(target.zip ?? null, source.zip ?? null) ?? undefined,
    notes: [target.notes, source.notes].filter(Boolean).join("\n\n---\n\n") || undefined,
    ownerNotes: [target.ownerNotes, source.ownerNotes].filter(Boolean).join("\n\n---\n\n") || undefined,
    buyerCriteria: pickBest(target.buyerCriteria ?? null, source.buyerCriteria ?? null) ?? undefined,
    isOwner: target.isOwner || source.isOwner,
    isBuyer: target.isBuyer || source.isBuyer,
    priority: target.priority,
    lastContactedAt: target.lastContactedAt && source.lastContactedAt
      ? (target.lastContactedAt > source.lastContactedAt ? target.lastContactedAt : source.lastContactedAt)
      : (target.lastContactedAt ?? source.lastContactedAt ?? undefined),
  };

  // Update target with merged data
  await db.update(contacts).set(merged).where(eq(contacts.id, targetId));

  // Re-point all linked data from source -> target
  await db.update(activities).set({ contactId: targetId }).where(eq(activities.contactId, sourceId));
  await db.update(tasks).set({ contactId: targetId }).where(eq(tasks.contactId, sourceId));
  await db.update(contactPropertyLinks).set({ contactId: targetId }).where(eq(contactPropertyLinks.contactId, sourceId));
  await db.update(listingSellers).set({ contactId: targetId }).where(eq(listingSellers.contactId, sourceId));
  await db.update(buyerInterests).set({ contactId: targetId }).where(eq(buyerInterests.contactId, sourceId));
  await db.update(contactEmails).set({ contactId: targetId }).where(eq(contactEmails.contactId, sourceId));

  // Update any properties where ownerId points to source
  await db.update(properties).set({ ownerId: targetId }).where(and(eq(properties.ownerId, sourceId), eq(properties.userId, userId)));

  // Delete source
  await db.delete(contacts).where(and(eq(contacts.id, sourceId), eq(contacts.userId, userId)));
}

/**
 * Merge property `sourceId` into `targetId`.
 * - Best field values written to target
 * - All linked data re-pointed to target
 * - Source property deleted
 */
export async function mergeProperties(
  targetId: number,
  sourceId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [target] = await db.select().from(properties).where(and(eq(properties.id, targetId), eq(properties.userId, userId)));
  const [source] = await db.select().from(properties).where(and(eq(properties.id, sourceId), eq(properties.userId, userId)));
  if (!target || !source) throw new Error("Property not found");

  const merged: Partial<InsertProperty> = {
    name: pickBest(target.name, source.name),
    address: pickBest(target.address ?? null, source.address ?? null) ?? undefined,
    city: pickBest(target.city ?? null, source.city ?? null) ?? undefined,
    state: pickBest(target.state ?? null, source.state ?? null) ?? undefined,
    zip: pickBest(target.zip ?? null, source.zip ?? null) ?? undefined,
    county: pickBest(target.county ?? null, source.county ?? null) ?? undefined,
    unitCount: pickBest(target.unitCount ?? null, source.unitCount ?? null) ?? undefined,
    vintageYear: pickBest(target.vintageYear ?? null, source.vintageYear ?? null) ?? undefined,
    sizeSqft: pickBest(target.sizeSqft ?? null, source.sizeSqft ?? null) ?? undefined,
    lotAcres: pickBest(target.lotAcres ?? null, source.lotAcres ?? null) ?? undefined,
    estimatedValue: pickBest(target.estimatedValue ?? null, source.estimatedValue ?? null) ?? undefined,
    lastSalePrice: pickBest(target.lastSalePrice ?? null, source.lastSalePrice ?? null) ?? undefined,
    capRate: pickBest(target.capRate ?? null, source.capRate ?? null) ?? undefined,
    noi: pickBest(target.noi ?? null, source.noi ?? null) ?? undefined,
    latitude: pickBest(target.latitude ?? null, source.latitude ?? null) ?? undefined,
    longitude: pickBest(target.longitude ?? null, source.longitude ?? null) ?? undefined,
    ownerId: pickBest(target.ownerId ?? null, source.ownerId ?? null) ?? undefined,
    ownerName: pickBest(target.ownerName ?? null, source.ownerName ?? null) ?? undefined,
    ownerPhone: pickBest(target.ownerPhone ?? null, source.ownerPhone ?? null) ?? undefined,
    ownerEmail: pickBest(target.ownerEmail ?? null, source.ownerEmail ?? null) ?? undefined,
    ownerCompany: pickBest(target.ownerCompany ?? null, source.ownerCompany ?? null) ?? undefined,
  };

  await db.update(properties).set(merged).where(eq(properties.id, targetId));

  // Re-point linked data
  await db.update(activities).set({ propertyId: targetId }).where(eq(activities.propertyId, sourceId));
  await db.update(tasks).set({ propertyId: targetId }).where(eq(tasks.propertyId, sourceId));
  await db.update(contactPropertyLinks).set({ propertyId: targetId }).where(eq(contactPropertyLinks.propertyId, sourceId));
  await db.update(saleRecords).set({ propertyId: targetId }).where(eq(saleRecords.propertyId, sourceId));
  await db.update(unsolicitedOffers).set({ propertyId: targetId }).where(eq(unsolicitedOffers.propertyId, sourceId));

  // Delete source
  await db.delete(properties).where(and(eq(properties.id, sourceId), eq(properties.userId, userId)));
}
