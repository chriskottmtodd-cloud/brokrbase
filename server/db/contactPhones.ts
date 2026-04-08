import { and, eq } from "drizzle-orm";
import { contactPhones, InsertContactPhone, ContactPhone } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getContactPhones(contactId: number, userId: number): Promise<ContactPhone[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(contactPhones)
    .where(and(eq(contactPhones.contactId, contactId), eq(contactPhones.userId, userId)));
}

export async function createContactPhone(data: InsertContactPhone): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(contactPhones).values(data);
  return Number(result[0].insertId);
}

export async function updateContactPhone(id: number, data: Partial<InsertContactPhone>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(contactPhones).set(data).where(eq(contactPhones.id, id));
}

export async function deleteContactPhone(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(contactPhones).where(eq(contactPhones.id, id));
}

export async function setContactPhonePrimary(id: number, contactId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Unset all primary flags for this contact
  await db.update(contactPhones).set({ isPrimary: false })
    .where(and(eq(contactPhones.contactId, contactId), eq(contactPhones.userId, userId)));
  // Set the new primary
  await db.update(contactPhones).set({ isPrimary: true }).where(eq(contactPhones.id, id));
}
