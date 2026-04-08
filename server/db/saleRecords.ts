import { and, desc, eq, sql } from "drizzle-orm";
import { InsertSaleRecord, SaleRecord, saleRecords } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getSaleRecord(propertyId: number, userId: number): Promise<SaleRecord | undefined> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db
    .select()
    .from(saleRecords)
    .where(and(eq(saleRecords.propertyId, propertyId), eq(saleRecords.userId, userId)))
    .orderBy(desc(saleRecords.createdAt))
    .limit(1);
  return result[0];
}

export async function upsertSaleRecord(data: InsertSaleRecord): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // If a record already exists for this property+listing, update it; otherwise insert
  const existing = await db
    .select({ id: saleRecords.id })
    .from(saleRecords)
    .where(and(
      eq(saleRecords.propertyId, data.propertyId),
      eq(saleRecords.userId, data.userId),
      data.listingId ? eq(saleRecords.listingId, data.listingId) : sql`1=1`,
    ))
    .limit(1);
  if (existing.length > 0) {
    await db.update(saleRecords).set(data).where(eq(saleRecords.id, existing[0].id));
  } else {
    await db.insert(saleRecords).values(data);
  }
}
