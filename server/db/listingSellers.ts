import { and, eq } from "drizzle-orm";
import {
  InsertListingSeller,
  ListingSeller,
  contacts,
  listingSellers,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getListingSellers(listingId: number, userId: number): Promise<Array<ListingSeller & { firstName: string; lastName: string; company: string | null; phone: string | null; email: string | null }>> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      id:        listingSellers.id,
      listingId: listingSellers.listingId,
      contactId: listingSellers.contactId,
      userId:    listingSellers.userId,
      role:      listingSellers.role,
      createdAt: listingSellers.createdAt,
      firstName: contacts.firstName,
      lastName:  contacts.lastName,
      company:   contacts.company,
      phone:     contacts.phone,
      email:     contacts.email,
    })
    .from(listingSellers)
    .innerJoin(contacts, eq(listingSellers.contactId, contacts.id))
    .where(and(eq(listingSellers.listingId, listingId), eq(listingSellers.userId, userId)));
}

export async function addListingSeller(data: InsertListingSeller) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Prevent duplicates
  const existing = await db
    .select({ id: listingSellers.id })
    .from(listingSellers)
    .where(and(eq(listingSellers.listingId, data.listingId), eq(listingSellers.contactId, data.contactId)))
    .limit(1);
  if (existing.length > 0) return; // already linked
  await db.insert(listingSellers).values(data);
}

export async function removeListingSeller(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(listingSellers).where(and(eq(listingSellers.id, id), eq(listingSellers.userId, userId)));
}
