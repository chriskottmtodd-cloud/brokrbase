import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import {
  InsertProperty,
  Property,
  contactPropertyLinks,
  properties,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getProperties(userId: number, filters?: {
  search?: string;
  propertyType?: string;
  status?: string;
  minUnits?: number;
  maxUnits?: number;
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
  if (filters?.city) conditions.push(like(properties.city, `%${filters.city}%`));
  if (filters?.county) conditions.push(like(properties.county, `%${filters.county}%`));
  if (filters?.ownerId) conditions.push(eq(properties.ownerId, filters.ownerId));
  if (filters?.search) {
    const s = `%${filters.search.toLowerCase()}%`;
    conditions.push(or(
      sql`LOWER(${properties.name}) LIKE ${s}`,
      sql`LOWER(COALESCE(${properties.address}, '')) LIKE ${s}`,
      sql`LOWER(COALESCE(${properties.city}, '')) LIKE ${s}`,
    )!);
  }
  return db
    .select()
    .from(properties)
    .where(and(...conditions))
    .orderBy(desc(properties.updatedAt))
    .limit(filters?.limit ?? 200)
    .offset(filters?.offset ?? 0);
}

export async function getPropertyById(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createProperty(data: InsertProperty) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(properties).values(data);
  return Number(result[0].insertId);
}

export async function updateProperty(id: number, userId: number, data: Partial<InsertProperty>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(properties).set(data).where(and(eq(properties.id, id), eq(properties.userId, userId)));
}

export async function deleteProperty(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(contactPropertyLinks).where(and(eq(contactPropertyLinks.propertyId, id), eq(contactPropertyLinks.userId, userId)));
  await db.delete(properties).where(and(eq(properties.id, id), eq(properties.userId, userId)));
}

export async function getPropertiesByOwner(ownerId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(properties)
    .where(and(eq(properties.userId, userId), eq(properties.ownerId, ownerId)))
    .orderBy(asc(properties.name));
}

export async function getPropertiesForMap(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      id: properties.id,
      name: properties.name,
      propertyType: properties.propertyType,
      status: properties.status,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      latitude: properties.latitude,
      longitude: properties.longitude,
      boundary: properties.boundary,
      unitCount: properties.unitCount,
      vintageYear: properties.vintageYear,
      sizeSqft: properties.sizeSqft,
      lotAcres: properties.lotAcres,
      estimatedValue: properties.estimatedValue,
      askingPrice: properties.askingPrice,
      capRate: properties.capRate,
      noi: properties.noi,
      primaryTenant: properties.primaryTenant,
      leaseType: properties.leaseType,
      leaseExpiration: properties.leaseExpiration,
      zip: properties.zip,
      notes: properties.notes,
      ownerName: properties.ownerName,
      ownerCompany: properties.ownerCompany,
      ownerPhone: properties.ownerPhone,
      ownerEmail: properties.ownerEmail,
    })
    .from(properties)
    .where(eq(properties.userId, userId))
    .orderBy(asc(properties.name));
}

export async function findDuplicateProperty(userId: number, name: string, address?: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const conds = [eq(properties.userId, userId)];
  if (address) {
    conds.push(sql`LOWER(COALESCE(${properties.address}, '')) = LOWER(${address})`);
  } else {
    conds.push(sql`LOWER(${properties.name}) = LOWER(${name})`);
  }
  const result = await db.select({ id: properties.id }).from(properties).where(and(...conds)).limit(1);
  return result.length > 0 ? result[0].id : null;
}
