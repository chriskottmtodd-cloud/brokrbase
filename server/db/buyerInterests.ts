import { and, desc, eq } from "drizzle-orm";
import {
  InsertBuyerInterest,
  buyerInterests,
  contacts,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getBuyerInterestsByListing(listingId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      interest: buyerInterests,
      contact: {
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        company: contacts.company,
        priority: contacts.priority,
      },
    })
    .from(buyerInterests)
    .leftJoin(contacts, eq(buyerInterests.contactId, contacts.id))
    .where(and(eq(buyerInterests.listingId, listingId), eq(buyerInterests.userId, userId)))
    .orderBy(desc(buyerInterests.updatedAt));
}

export async function upsertBuyerInterest(data: InsertBuyerInterest) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(buyerInterests).values(data).onDuplicateKeyUpdate({
    set: { status: data.status, notes: data.notes, offerAmount: data.offerAmount, lastContactedAt: data.lastContactedAt },
  });
}

export async function updateBuyerInterest(id: number, userId: number, data: Partial<InsertBuyerInterest>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(buyerInterests).set(data).where(and(eq(buyerInterests.id, id), eq(buyerInterests.userId, userId)));
}
