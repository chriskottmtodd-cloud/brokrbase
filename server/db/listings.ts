import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  InsertListing,
  Listing,
  buyerInterests,
  contacts,
  listings,
  properties,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getListings(userId: number, opts?: { status?: string; stage?: string; search?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const conditions = [eq(listings.userId, userId)];
  if (opts?.status) conditions.push(eq(listings.status, opts.status as Listing["status"]));
  if (opts?.stage) conditions.push(eq(listings.stage, opts.stage as Listing["stage"]));
  // Single query with buyer count via LEFT JOIN — avoids N+1
  const rows = await db
    .select({ listing: listings, interestedBuyerCount: count(buyerInterests.id) })
    .from(listings)
    .leftJoin(buyerInterests, eq(buyerInterests.listingId, listings.id))
    .where(and(...conditions))
    .groupBy(listings.id)
    .orderBy(desc(listings.createdAt));
  const withCounts = rows.map(r => ({ ...r.listing, interestedBuyerCount: r.interestedBuyerCount }));
  if (opts?.search) {
    const q = opts.search.toLowerCase();
    return withCounts.filter(l => l.title.toLowerCase().includes(q) || (l.propertyName ?? "").toLowerCase().includes(q));
  }
  return withCounts;
}

export async function getListingById(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Alias contacts table for the owner join
  const ownerContact = contacts;

  const result = await db
    .select({
      // All listing fields
      id:              listings.id,
      userId:          listings.userId,
      propertyId:      listings.propertyId,
      title:           listings.title,
      description:     listings.description,
      askingPrice:     listings.askingPrice,
      capRate:         listings.capRate,
      noi:             listings.noi,
      stage:           listings.stage,
      status:          listings.status,
      unitCount:       listings.unitCount,
      propertyName:    listings.propertyName,
      listedAt:        listings.listedAt,
      closedAt:        listings.closedAt,
      sellerId:        listings.sellerId,
      brokerNotes:     listings.brokerNotes,
      marketingMemo:   listings.marketingMemo,
      createdAt:       listings.createdAt,
      updatedAt:       listings.updatedAt,
      // Property owner contact (via properties.ownerId)
      ownerContactId:        ownerContact.id,
      ownerContactFirstName: ownerContact.firstName,
      ownerContactLastName:  ownerContact.lastName,
      ownerContactEmail:     ownerContact.email,
      ownerContactPhone:     ownerContact.phone,
      ownerContactCompany:   ownerContact.company,
    })
    .from(listings)
    .leftJoin(properties, and(eq(listings.propertyId, properties.id), eq(properties.userId, userId)))
    .leftJoin(ownerContact, eq(properties.ownerId, ownerContact.id))
    .where(and(eq(listings.id, id), eq(listings.userId, userId)))
    .limit(1);

  return result[0];
}

export async function createListing(data: InsertListing) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(listings).values(data);
}

export async function updateListing(id: number, userId: number, data: Partial<InsertListing>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(listings).set(data).where(and(eq(listings.id, id), eq(listings.userId, userId)));
}

/**
 * Maps a listing stage to the corresponding property status.
 * Called after any listing create/update that touches stage or propertyId.
 */
export function listingStageToPropertyStatus(
  stage: string
): "listed" | "under_contract" | "recently_sold" | "prospecting" | null {
  switch (stage) {
    case "new":
    case "active":       return "listed";
    case "under_contract": return "under_contract";
    case "closed":       return "recently_sold";
    case "withdrawn":
    case "expired":      return "prospecting";
    default:             return null;
  }
}

/**
 * After a listing is created or its stage changes, sync the linked property status.
 * Only updates the property if it belongs to the same user and has a valid propertyId.
 */
export async function syncPropertyStatusFromListing(
  listingId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({ propertyId: listings.propertyId, stage: listings.stage })
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
    .limit(1);
  const listing = rows[0];
  if (!listing?.propertyId) return; // no linked property
  const newStatus = listingStageToPropertyStatus(listing.stage);
  if (!newStatus) return;
  await db
    .update(properties)
    .set({ status: newStatus })
    .where(and(eq(properties.id, listing.propertyId), eq(properties.userId, userId)));
}

export async function getListingByPropertyId(userId: number, propertyId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Find the most recent active listing for this property
  const rows = await db.select().from(listings)
    .where(and(eq(listings.userId, userId), eq(listings.propertyId, propertyId), eq(listings.status, "active")))
    .orderBy(desc(listings.createdAt))
    .limit(1);
  if (!rows[0]) return null;
  // Return via getListingById for consistent shape (includes owner contact join)
  return getListingById(rows[0].id, userId);
}
