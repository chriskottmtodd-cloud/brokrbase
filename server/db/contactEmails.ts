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

/** Find a contact by any of their stored emails (primary email field OR contact_emails table) */
export async function findContactByEmail(email: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const emailLower = email.toLowerCase().trim();
  // Check primary email field first
  const byPrimary = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company, email: contacts.email, isOwner: contacts.isOwner, isBuyer: contacts.isBuyer, lastContactedAt: contacts.lastContactedAt })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), sql`LOWER(${contacts.email}) = ${emailLower}`))
    .limit(1);
  if (byPrimary.length > 0) return byPrimary[0];
  // Check contact_emails table
  const byAlt = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company, email: contacts.email, isOwner: contacts.isOwner, isBuyer: contacts.isBuyer, lastContactedAt: contacts.lastContactedAt })
    .from(contactEmails)
    .innerJoin(contacts, eq(contactEmails.contactId, contacts.id))
    .where(and(eq(contactEmails.userId, userId), sql`LOWER(${contactEmails.email}) = ${emailLower}`))
    .limit(1);
  if (byAlt.length > 0) return byAlt[0];
  return null;
}
