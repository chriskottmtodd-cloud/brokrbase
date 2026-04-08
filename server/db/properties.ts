import { and, desc, eq, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import {
  InsertProperty,
  Property,
  contacts,
  listings,
  properties,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getProperties(userId: number, filters?: {
  search?: string;
  propertyType?: string;
  status?: string;
  minUnits?: number;
  maxUnits?: number;
  minYear?: number;
  maxYear?: number;
  city?: string;
  county?: string;
  ownerId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const conditions = [eq(properties.userId, userId)];
  if (filters?.propertyType) conditions.push(eq(properties.propertyType, filters.propertyType as Property["propertyType"]));
  if (filters?.status) conditions.push(eq(properties.status, filters.status as Property["status"]));
  if (filters?.minUnits !== undefined) conditions.push(gte(properties.unitCount, filters.minUnits));
  if (filters?.maxUnits !== undefined) conditions.push(lte(properties.unitCount, filters.maxUnits));
  if (filters?.minYear !== undefined) conditions.push(gte(properties.vintageYear, filters.minYear));
  if (filters?.maxYear !== undefined) conditions.push(lte(properties.vintageYear, filters.maxYear));
  if (filters?.city) conditions.push(like(properties.city, `%${filters.city}%`));
  if (filters?.county) conditions.push(like(properties.county, `%${filters.county}%`));
  if (filters?.ownerId) conditions.push(eq(properties.ownerId, filters.ownerId));
  if (filters?.search) {
    // Use LOWER() on both sides because the DB collation is utf8mb4_bin (case-sensitive)
    const s = `%${filters.search.toLowerCase()}%`;
    conditions.push(or(
      sql`LOWER(${properties.name}) LIKE ${s}`,
      sql`LOWER(COALESCE(${properties.address}, '')) LIKE ${s}`,
      sql`LOWER(COALESCE(${properties.city}, '')) LIKE ${s}`,
    )!);
  }
  // Sort by most recent interaction: latest activity, then lastContactedAt, then updatedAt
  return db
    .select()
    .from(properties)
    .where(and(...conditions))
    .orderBy(sql`COALESCE(
      (SELECT MAX(occurredAt) FROM activities WHERE activities.propertyId = ${properties.id}),
      ${properties.lastContactedAt},
      ${properties.updatedAt}
    ) DESC`)
    .limit(filters?.limit ?? 200)
    .offset(filters?.offset ?? 0);
}

export async function getPropertyById(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db
    .select({
      // all property fields
      id: properties.id,
      userId: properties.userId,
      name: properties.name,
      propertyType: properties.propertyType,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
      county: properties.county,
      unitCount: properties.unitCount,
      vintageYear: properties.vintageYear,
      yearRenovated: properties.yearRenovated,
      sizeSqft: properties.sizeSqft,
      lotAcres: properties.lotAcres,
      estimatedValue: properties.estimatedValue,
      lastSalePrice: properties.lastSalePrice,
      lastSaleDate: properties.lastSaleDate,
      askingPrice: properties.askingPrice,
      capRate: properties.capRate,
      noi: properties.noi,
      status: properties.status,
      isMyListing: properties.isMyListing,
      offMarketInterest: properties.offMarketInterest,
      offMarketConfidence: properties.offMarketConfidence,
      offMarketTimeline: properties.offMarketTimeline,
      offMarketNotes: properties.offMarketNotes,
      ownerId: properties.ownerId,
      ownerName: properties.ownerName,
      ownerLlc: properties.ownerLlc,
      latitude: properties.latitude,
      longitude: properties.longitude,
      notes: properties.notes,
      tags: properties.tags,
      lastContactedAt: properties.lastContactedAt,
      nextFollowUpAt: properties.nextFollowUpAt,
      notesUpdatedAt: properties.notesUpdatedAt,
      marketId: properties.marketId,
      importNotes: properties.importNotes,
      webIntelligence: properties.webIntelligence,
      webIntelligenceUpdatedAt: properties.webIntelligenceUpdatedAt,
      researchStatus: properties.researchStatus,
      createdAt: properties.createdAt,
      updatedAt: properties.updatedAt,
      // owner contact fields (joined)
      ownerCompany: contacts.company,
      ownerEmail: contacts.email,
      ownerPhone: contacts.phone,
      ownerFirstName: contacts.firstName,
      ownerLastName: contacts.lastName,
    })
    .from(properties)
    .leftJoin(contacts, eq(properties.ownerId, contacts.id))
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createProperty(data: InsertProperty) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(properties).values(data);
  return result[0]; // { insertId, ... }
}

export async function updateProperty(id: number, userId: number, data: Partial<InsertProperty>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(properties).set(data).where(and(eq(properties.id, id), eq(properties.userId, userId)));
}

export async function deleteProperty(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(properties).where(and(eq(properties.id, id), eq(properties.userId, userId)));
}

export async function getPropertiesByOwner(ownerId: number, excludePropertyId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      id: properties.id,
      name: properties.name,
      propertyType: properties.propertyType,
      status: properties.status,
      unitCount: properties.unitCount,
      city: properties.city,
      estimatedValue: properties.estimatedValue,
    })
    .from(properties)
    .where(and(
      eq(properties.ownerId, ownerId),
      eq(properties.userId, userId),
      sql`${properties.id} != ${excludePropertyId}`,
    ))
    .limit(20);
}

export async function getPropertiesForMap(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Use an alias for the contacts table so we can join it twice:
  // once via ownerId (legacy) and once via contactPropertyLinks (new)
  const ownerContact = contacts;

  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      propertyType: properties.propertyType,
      status: properties.status,
      unitCount: properties.unitCount,
      vintageYear: properties.vintageYear,
      city: properties.city,
      state: properties.state,
      address: properties.address,
      county: properties.county,
      latitude: properties.latitude,
      longitude: properties.longitude,
      ownerId: properties.ownerId,
      ownerName: properties.ownerName,
      estimatedValue: properties.estimatedValue,
      askingPrice: properties.askingPrice,
      researchStatus: properties.researchStatus,
      // Owner contact details (joined via ownerId FK -- kept as fallback)
      ownerCompany: ownerContact.company,
      ownerEmail: ownerContact.email,
      ownerPhone: ownerContact.phone,
      ownerFirstName: ownerContact.firstName,
      ownerLastName: ownerContact.lastName,
    })
    .from(properties)
    .leftJoin(ownerContact, eq(properties.ownerId, ownerContact.id))
    .where(eq(properties.userId, userId))
    .limit(3000);

  // Attach listing stage: if property has an under_contract listing, flag it
  const propertyIds = rows.map(r => r.id);
  let underContractIds = new Set<number>();
  if (propertyIds.length > 0) {
    const ucListings = await db
      .select({ propertyId: listings.propertyId })
      .from(listings)
      .where(and(
        eq(listings.userId, userId),
        eq(listings.stage, "under_contract"),
        inArray(listings.propertyId, propertyIds)
      ));
    underContractIds = new Set(ucListings.map(l => l.propertyId));
  }

  return rows.map(r => ({
    ...r,
    listingStage: underContractIds.has(r.id) ? "under_contract" : null,
  }));
}

export async function getPropertiesMissingCoords(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({ id: properties.id, name: properties.name, address: properties.address, city: properties.city, state: properties.state, zip: properties.zip })
    .from(properties)
    .where(and(eq(properties.userId, userId), isNull(properties.latitude)))
    .limit(500);
}

export async function findDuplicateProperty(userId: number, name: string, address?: string): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const nameLower = name.toLowerCase().trim();
  const rows = await db
    .select({ id: properties.id, name: properties.name, address: properties.address, city: properties.city })
    .from(properties)
    .where(eq(properties.userId, userId))
    .limit(3000);

  // Tier 1: Exact name match
  const exactName = rows.find(r => {
    const rName = (r.name ?? "").toLowerCase().trim();
    return rName === nameLower && nameLower !== "unnamed property";
  });
  if (exactName) return exactName.id;

  // Tier 2: Exact address match
  if (address) {
    const addrLower = address.toLowerCase().trim();
    const exactAddr = rows.find(r => {
      const rAddr = (r.address ?? "").toLowerCase().trim();
      return rAddr && rAddr === addrLower;
    });
    if (exactAddr) return exactAddr.id;
  }

  // Tier 3: Fuzzy name match (contains or is contained by, min 6 chars)
  if (nameLower.length >= 6) {
    const fuzzyName = rows.find(r => {
      const rName = (r.name ?? "").toLowerCase().trim();
      if (!rName || rName === "unnamed property") return false;
      return (rName.includes(nameLower) || nameLower.includes(rName)) && rName.length >= 6;
    });
    if (fuzzyName) return fuzzyName.id;
  }

  // Tier 4: Address contains match
  if (address && address.length >= 8) {
    const addrLower = address.toLowerCase().trim();
    const fuzzyAddr = rows.find(r => {
      const rAddr = (r.address ?? "").toLowerCase().trim();
      return rAddr && (rAddr.includes(addrLower) || addrLower.includes(rAddr));
    });
    if (fuzzyAddr) return fuzzyAddr.id;
  }

  return null;
}

export async function findPropertyByOwnerName(userId: number, ownerName: string): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const nameLower = ownerName.toLowerCase().trim();
  const rows = await db
    .select({ id: properties.id, ownerName: properties.ownerName })
    .from(properties)
    .where(and(
      eq(properties.userId, userId),
      like(properties.ownerName, `%${nameLower}%`),
    ))
    .limit(1);
  return rows[0]?.id ?? null;
}
