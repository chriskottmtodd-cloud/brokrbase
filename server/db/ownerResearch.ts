import { and, desc, eq } from "drizzle-orm";
import {
  ownerResearch, InsertOwnerResearch, OwnerResearch,
  researchContacts, InsertResearchContact, ResearchContact,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// ─── Owner Research ─────────────────────────────────────────────────────────

export async function createOwnerResearchRecord(data: InsertOwnerResearch): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(ownerResearch).values(data);
  return Number(result[0].insertId);
}

export async function updateOwnerResearchRecord(id: number, data: Partial<InsertOwnerResearch>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(ownerResearch).set(data).where(eq(ownerResearch.id, id));
}

export async function getOwnerResearchForProperty(propertyId: number, userId: number): Promise<OwnerResearch[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(ownerResearch)
    .where(and(eq(ownerResearch.propertyId, propertyId), eq(ownerResearch.userId, userId)))
    .orderBy(desc(ownerResearch.createdAt));
}

// ─── Research Contacts ──────────────────────────────────────────────────────

export async function createResearchContact(data: InsertResearchContact): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(researchContacts).values(data);
  return Number(result[0].insertId);
}

export async function getResearchContactsForResearch(ownerResearchId: number): Promise<ResearchContact[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(researchContacts)
    .where(eq(researchContacts.ownerResearchId, ownerResearchId));
}

export async function getResearchContactsForProperty(propertyId: number, userId: number): Promise<ResearchContact[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(researchContacts)
    .where(and(eq(researchContacts.propertyId, propertyId), eq(researchContacts.userId, userId)))
    .orderBy(desc(researchContacts.createdAt));
}

export async function getResearchContactById(id: number): Promise<ResearchContact | undefined> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.select().from(researchContacts).where(eq(researchContacts.id, id)).limit(1);
  return result[0];
}

export async function updateResearchContact(id: number, data: Partial<InsertResearchContact>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(researchContacts).set(data).where(eq(researchContacts.id, id));
}
