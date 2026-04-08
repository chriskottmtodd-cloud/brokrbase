import { and, eq } from "drizzle-orm";
import { DealNarrative, dealNarratives } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getDealNarrative(userId: number, propertyId: number): Promise<DealNarrative | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db.select().from(dealNarratives)
    .where(and(eq(dealNarratives.userId, userId), eq(dealNarratives.propertyId, propertyId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertDealNarrative(userId: number, propertyId: number, data: {
  summary: string;
  sellerMotivation?: string | null;
  pricingStatus?: string | null;
  buyerActivity?: string | null;
  keyDates?: string | null;
  blockers?: string | null;
  nextSteps?: string | null;
  activityCount?: number;
  lastActivityId?: number;
  listingId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await getDealNarrative(userId, propertyId);
  if (existing) {
    await db.update(dealNarratives).set(data).where(eq(dealNarratives.id, existing.id));
  } else {
    await db.insert(dealNarratives).values({ userId, propertyId, ...data, summary: data.summary });
  }
}
