import { and, desc, eq, sql } from "drizzle-orm";
import { contactEmails, contacts } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getContactEmails(contactId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(contactEmails)
    .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.userId, userId)))
    .orderBy(desc(contactEmails.isPrimary), desc(contactEmails.createdAt));
}

export async function addContactEmail(
  contactId: number,
  userId: number,
  email: string,
  label?: string,
  isPrimary?: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (isPrimary) {
    // Unset any existing primary
    await db
      .update(contactEmails)
      .set({ isPrimary: false })
      .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.userId, userId)));
  }
  await db.insert(contactEmails).values({ contactId, userId, email, label: label ?? null, isPrimary: isPrimary ?? false });
  return true;
}

export async function removeContactEmail(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(contactEmails).where(and(eq(contactEmails.id, id), eq(contactEmails.userId, userId)));
}

export async function setPrimaryContactEmail(id: number, contactId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(contactEmails)
    .set({ isPrimary: false })
    .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.userId, userId)));
  await db.update(contactEmails).set({ isPrimary: true }).where(eq(contactEmails.id, id));
}

/** Find ALL contacts that have a given email — handles duplicates where the
 *  same email shows up on multiple contact records (which happens when a
 *  contact gets duplicated). Checks both the primary email field AND the
 *  contact_emails alternate-email table. Whitespace-tolerant, case-insensitive.
 */
export async function findContactsByEmail(email: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const emailLower = email.toLowerCase().trim();
  if (!emailLower) return [];

  const cols = {
    id: contacts.id,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    company: contacts.company,
    email: contacts.email,
    phone: contacts.phone,
    isOwner: contacts.isOwner,
    isBuyer: contacts.isBuyer,
    lastContactedAt: contacts.lastContactedAt,
  };

  // Match against primary email field
  const byPrimary = await db
    .select(cols)
    .from(contacts)
    .where(and(eq(contacts.userId, userId), sql`LOWER(TRIM(${contacts.email})) = ${emailLower}`));

  // Match against contact_emails alt table
  const byAlt = await db
    .select(cols)
    .from(contactEmails)
    .innerJoin(contacts, eq(contactEmails.contactId, contacts.id))
    .where(and(eq(contactEmails.userId, userId), sql`LOWER(TRIM(${contactEmails.email})) = ${emailLower}`));

  // Dedupe by contact id (a contact could appear in both)
  const seen = new Set<number>();
  const merged: typeof byPrimary = [];
  for (const row of [...byPrimary, ...byAlt]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

/** Find a single contact by email — backwards-compatible wrapper.
 *  Returns the first match or null. Use findContactsByEmail when you need
 *  to handle duplicates explicitly.
 */
export async function findContactByEmail(email: string, userId: number) {
  const matches = await findContactsByEmail(email, userId);
  return matches.length > 0 ? matches[0] : null;
}
