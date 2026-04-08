import { and, eq } from "drizzle-orm";
import { contactAddresses, InsertContactAddress, ContactAddress } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getContactAddresses(contactId: number, userId: number): Promise<ContactAddress[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(contactAddresses)
    .where(and(eq(contactAddresses.contactId, contactId), eq(contactAddresses.userId, userId)));
}

export async function createContactAddress(data: InsertContactAddress): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(contactAddresses).values(data);
  return Number(result[0].insertId);
}

export async function deleteContactAddress(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(contactAddresses).where(eq(contactAddresses.id, id));
}
