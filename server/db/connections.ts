import { and, desc, eq } from "drizzle-orm";
import {
  buyerInterests,
  contacts,
  listings,
  listingSellers,
  properties,
} from "../../drizzle/schema";
import { getDb } from "./connection";

/**
 * Returns all deal connections for a contact from buyer_interests and listing_sellers,
 * shaped to match the contactPropertyLinks format for unified display.
 */
export async function getDealConnectionsForContact(contactId: number, userId: number): Promise<Array<{
  id: number;
  source: "buyer_interest" | "listing_seller";
  listingId: number;
  listingTitle: string | null;
  listingStage: string | null;
  dealRole: string;
  status: string | null; // buyer interest status
  propertyId: number | null;
  propertyName: string | null;
  propertyCity: string | null;
}>> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [buyerRows, sellerRows] = await Promise.all([
    // Buyer interests
    db.select({
      id:           buyerInterests.id,
      listingId:    buyerInterests.listingId,
      listingTitle: listings.title,
      listingStage: listings.stage,
      status:       buyerInterests.status,
      propertyId:   listings.propertyId,
      propertyName: properties.name,
      propertyCity: properties.city,
    })
    .from(buyerInterests)
    .leftJoin(listings, eq(buyerInterests.listingId, listings.id))
    .leftJoin(properties, eq(listings.propertyId, properties.id))
    .where(and(eq(buyerInterests.contactId, contactId), eq(buyerInterests.userId, userId))),

    // Listing sellers
    db.select({
      id:           listingSellers.id,
      listingId:    listingSellers.listingId,
      listingTitle: listings.title,
      listingStage: listings.stage,
      role:         listingSellers.role,
      propertyId:   listings.propertyId,
      propertyName: properties.name,
      propertyCity: properties.city,
    })
    .from(listingSellers)
    .leftJoin(listings, eq(listingSellers.listingId, listings.id))
    .leftJoin(properties, eq(listings.propertyId, properties.id))
    .where(and(eq(listingSellers.contactId, contactId), eq(listingSellers.userId, userId))),
  ]);

  const buyerConnections = buyerRows.map(r => ({
    id: r.id,
    source: "buyer_interest" as const,
    listingId: r.listingId,
    listingTitle: r.listingTitle ?? null,
    listingStage: r.listingStage ?? null,
    dealRole: "buyer",
    status: r.status,
    propertyId: r.propertyId ?? null,
    propertyName: r.propertyName ?? null,
    propertyCity: r.propertyCity ?? null,
  }));

  const sellerConnections = sellerRows.map(r => ({
    id: r.id,
    source: "listing_seller" as const,
    listingId: r.listingId,
    listingTitle: r.listingTitle ?? null,
    listingStage: r.listingStage ?? null,
    dealRole: r.role ?? "seller",
    status: null,
    propertyId: r.propertyId ?? null,
    propertyName: r.propertyName ?? null,
    propertyCity: r.propertyCity ?? null,
  }));

  return [...buyerConnections, ...sellerConnections];
}

/**
 * Fuzzy-match a note string against listing titles and property names/addresses
 * for a given user. Returns matches with score > 0.
 */
export async function findDealMentionsInText(text: string, userId: number): Promise<Array<{
  type: "listing" | "property";
  id: number;
  name: string;
  listingId?: number;
  propertyId?: number;
}>> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [allListings, allProperties] = await Promise.all([
    db.select({ id: listings.id, title: listings.title, propertyId: listings.propertyId })
      .from(listings).where(eq(listings.userId, userId)),
    db.select({ id: properties.id, name: properties.name, address: properties.address, city: properties.city })
      .from(properties).where(eq(properties.userId, userId)),
  ]);

  const lower = text.toLowerCase();
  const matches: Array<{ type: "listing" | "property"; id: number; name: string; listingId?: number; propertyId?: number }> = [];

  for (const l of allListings) {
    if (!l.title) continue;
    // Match if any word of 4+ chars from the title appears in the note
    const words = l.title.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    if (words.some(w => lower.includes(w))) {
      matches.push({ type: "listing", id: l.id, name: l.title, listingId: l.id, propertyId: l.propertyId ?? undefined });
    }
  }

  for (const p of allProperties) {
    if (!p.name && !p.address) continue;
    const searchTerms = [p.name, p.address, p.city].filter(Boolean).join(" ").toLowerCase();
    const words = searchTerms.split(/\s+/).filter(w => w.length >= 4);
    if (words.some(w => lower.includes(w))) {
      // Avoid duplicating if already matched via listing
      const alreadyMatched = matches.some(m => m.propertyId === p.id);
      if (!alreadyMatched) {
        matches.push({ type: "property", id: p.id, name: p.name ?? p.address ?? "Unknown", propertyId: p.id });
      }
    }
  }

  return matches;
}
