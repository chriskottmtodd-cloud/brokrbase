import { InsertContact, InsertProperty, contacts, properties } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function bulkInsertProperties(rows: InsertProperty[]): Promise<{ inserted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (rows.length === 0) return { inserted: 0 };
  // Insert in batches of 50 to avoid query size limits
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db.insert(properties).values(batch);
    inserted += batch.length;
  }
  return { inserted };
}

export async function bulkInsertContacts(rows: InsertContact[]): Promise<{ inserted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (rows.length === 0) return { inserted: 0 };
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db.insert(contacts).values(batch);
    inserted += batch.length;
  }
  return { inserted };
}
