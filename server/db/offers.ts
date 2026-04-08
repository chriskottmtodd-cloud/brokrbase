import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  InsertUnsolicitedOffer,
  UnsolicitedOffer,
  contacts,
  properties,
  unsolicitedOffers,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createUnsolicitedOffer(data: InsertUnsolicitedOffer): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(unsolicitedOffers).values(data);
}

export async function getUnsolicitedOffers(propertyId: number, userId: number): Promise<(UnsolicitedOffer & { buyerName?: string | null })[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({
      id:             unsolicitedOffers.id,
      propertyId:     unsolicitedOffers.propertyId,
      userId:         unsolicitedOffers.userId,
      amount:         unsolicitedOffers.amount,
      buyerContactId: unsolicitedOffers.buyerContactId,
      receivedAt:     unsolicitedOffers.receivedAt,
      notes:          unsolicitedOffers.notes,
      createdAt:      unsolicitedOffers.createdAt,
      buyerName:      contacts.firstName,
    })
    .from(unsolicitedOffers)
    .leftJoin(contacts, eq(unsolicitedOffers.buyerContactId, contacts.id))
    .where(and(eq(unsolicitedOffers.propertyId, propertyId), eq(unsolicitedOffers.userId, userId)))
    .orderBy(desc(unsolicitedOffers.receivedAt));
  return rows;
}

export async function deleteUnsolicitedOffer(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(unsolicitedOffers).where(and(eq(unsolicitedOffers.id, id), eq(unsolicitedOffers.userId, userId)));
}

export async function getRecentUnsolicitedOfferProperties(userId: number, days = 30): Promise<{ propertyId: number; propertyName: string; offerCount: number; latestAmount: number | null; latestAt: Date }[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      propertyId:   unsolicitedOffers.propertyId,
      propertyName: properties.name,
      offerCount:   sql<number>`COUNT(${unsolicitedOffers.id})`,
      latestAmount: sql<number | null>`MAX(${unsolicitedOffers.amount})`,
      latestAt:     sql<Date>`MAX(${unsolicitedOffers.receivedAt})`,
    })
    .from(unsolicitedOffers)
    .leftJoin(properties, eq(unsolicitedOffers.propertyId, properties.id))
    .where(and(eq(unsolicitedOffers.userId, userId), gte(unsolicitedOffers.receivedAt, since)))
    .groupBy(unsolicitedOffers.propertyId, properties.name)
    .orderBy(desc(sql`MAX(${unsolicitedOffers.receivedAt})`));
  return rows as any;
}
