import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  Contact,
  InsertContact,
  contacts,
  contactPropertyLinks,
  properties,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function findSimilarContacts(
  userId: number,
  input: { firstName: string; lastName?: string; email?: string; phone?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { firstName, lastName = "", email, phone } = input;
  // Build OR conditions: email exact match, phone exact match, or name fuzzy match
  const conditions: ReturnType<typeof or>[] = [];
  if (email && email.trim()) {
    conditions.push(sql`LOWER(COALESCE(${contacts.email}, '')) = LOWER(${email.trim()})`);
  }
  if (phone && phone.trim()) {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length >= 7) {
      conditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${contacts.phone}, ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE ${`%${cleanPhone}%`}`);
    }
  }
  // Name match: first name + last name with fuzzy matching
  // Handles: "Mark Leary" vs "Mark A Leary", middle initials in last name field
  if (firstName.trim()) {
    const firstLower = firstName.trim().toLowerCase();
    const lastLower = lastName.trim().toLowerCase();
    if (lastLower) {
      // Exact last name match
      conditions.push(
        sql`LOWER(${contacts.firstName}) = ${firstLower} AND LOWER(${contacts.lastName}) = ${lastLower}`
      );
      // Last name ends with the search last name (catches "A Leary" matching "Leary")
      conditions.push(
        sql`LOWER(${contacts.firstName}) = ${firstLower} AND LOWER(${contacts.lastName}) LIKE ${`%${lastLower}`}`
      );
      // Search last name ends with stored last name (catches "Leary" matching stored "A Leary")
      // Extract just the final word of the stored lastName
      conditions.push(
        sql`LOWER(${contacts.firstName}) = ${firstLower} AND LOWER(SUBSTRING_INDEX(${contacts.lastName}, ' ', -1)) = ${lastLower}`
      );
    } else {
      conditions.push(sql`LOWER(${contacts.firstName}) = ${firstLower}`);
    }
  }
  if (conditions.length === 0) return [];
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      company: contacts.company,
    })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), or(...conditions)!))
    .limit(5);
  return rows;
}

export async function getContacts(userId: number, filters?: {
  search?: string;
  isOwner?: boolean;
  isBuyer?: boolean;
  priority?: string;
  limit?: number;
  offset?: number;
  linkedPropertyId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const conditions = [eq(contacts.userId, userId)];
  if (filters?.isOwner !== undefined) conditions.push(eq(contacts.isOwner, filters.isOwner));
  if (filters?.isBuyer !== undefined) conditions.push(eq(contacts.isBuyer, filters.isBuyer));
  if (filters?.priority) conditions.push(eq(contacts.priority, filters.priority as Contact["priority"]));
  if (filters?.search) {
    // Use LOWER() on both sides because the DB collation is utf8mb4_bin (case-sensitive)
    const s = `%${filters.search.toLowerCase()}%`;
    conditions.push(
      or(
        sql`LOWER(${contacts.firstName}) LIKE ${s}`,
        sql`LOWER(${contacts.lastName}) LIKE ${s}`,
        // Full name search: "John Smith" matches even though name is split across two columns
        sql`LOWER(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})) LIKE ${s}`,
        sql`LOWER(COALESCE(${contacts.email}, '')) LIKE ${s}`,
        sql`LOWER(COALESCE(${contacts.company}, '')) LIKE ${s}`,
        sql`LOWER(COALESCE(${contacts.phone}, '')) LIKE ${s}`,
      )!
    );
  }
  // If filtering by linked property, join contact_property_links
  if (filters?.linkedPropertyId) {
    // Use a subquery to get contactIds linked to this property, then filter contacts
    const linkedIds = await db
      .select({ contactId: contactPropertyLinks.contactId })
      .from(contactPropertyLinks)
      .where(
        and(
          eq(contactPropertyLinks.propertyId, filters.linkedPropertyId),
          eq(contactPropertyLinks.userId, userId),
        )
      );
    if (linkedIds.length === 0) return [];
    const idSet = linkedIds.map((r) => r.contactId);
    conditions.push(inArray(contacts.id, idSet));
  }
  return db
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(desc(contacts.updatedAt))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);
}

/** Title-case a string: "JOHN DOE" -> "John Doe", handles mixed case too */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`)
    .replace(/\bO'(\w)/g, (_, c) => `O'${c.toUpperCase()}`);
}

/** Normalize ALL-CAPS or all-lowercase contact names to Title Case.
 *  Returns count of contacts updated. */
export async function normalizeContactNameCasing(userId: number): Promise<{ updated: number; preview: Array<{ id: number; before: string; after: string }> }> {
  const db = await getDb();
  if (!db) return { updated: 0, preview: [] };
  const all = await db.select().from(contacts).where(eq(contacts.userId, userId));
  const needsFix = all.filter((c) => {
    const fn = c.firstName ?? "";
    const ln = c.lastName ?? "";
    const co = c.company ?? "";
    // Needs fix if firstName or lastName is all-caps (len > 1) or all-lowercase (len > 1)
    const isAllCaps = (s: string) => s.length > 1 && s === s.toUpperCase() && /[A-Z]/.test(s);
    const isAllLower = (s: string) => s.length > 1 && s === s.toLowerCase() && /[a-z]/.test(s);
    return isAllCaps(fn) || isAllCaps(ln) || isAllLower(fn) || isAllLower(ln) || isAllCaps(co);
  });
  const preview: Array<{ id: number; before: string; after: string }> = [];
  for (const c of needsFix) {
    const before = `${c.firstName} ${c.lastName}`.trim();
    const newFirst = toTitleCase(c.firstName);
    const newLast = toTitleCase(c.lastName);
    const newCompany = c.company ? toTitleCase(c.company) : c.company;
    await db.update(contacts).set({ firstName: newFirst, lastName: newLast, company: newCompany ?? undefined }).where(eq(contacts.id, c.id));
    preview.push({ id: c.id, before, after: `${newFirst} ${newLast}`.trim() });
  }
  return { updated: needsFix.length, preview };
}

/** Global search across contacts and properties */
export async function globalSearch(userId: number, query: string) {
  const db = await getDb();
  if (!db || !query.trim()) return { contacts: [], properties: [] };
  const s = `%${query.toLowerCase()}%`;
  const [matchedContacts, matchedProperties] = await Promise.all([
    db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company, priority: contacts.priority })
      .from(contacts)
      .where(and(
        eq(contacts.userId, userId),
        or(
          sql`LOWER(${contacts.firstName}) LIKE ${s}`,
          sql`LOWER(${contacts.lastName}) LIKE ${s}`,
          sql`LOWER(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})) LIKE ${s}`,
          sql`LOWER(COALESCE(${contacts.company}, '')) LIKE ${s}`,
        )!
      ))
      .orderBy(desc(contacts.updatedAt))
      .limit(6),
    db.select({ id: properties.id, name: properties.name, city: properties.city, propertyType: properties.propertyType, unitCount: properties.unitCount })
      .from(properties)
      .where(and(
        eq(properties.userId, userId),
        or(
          sql`LOWER(${properties.name}) LIKE ${s}`,
          sql`LOWER(COALESCE(${properties.address}, '')) LIKE ${s}`,
          sql`LOWER(COALESCE(${properties.city}, '')) LIKE ${s}`,
        )!
      ))
      .orderBy(desc(properties.updatedAt))
      .limit(6),
  ]);
  return { contacts: matchedContacts, properties: matchedProperties };
}

export async function getContactById(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId))).limit(1);
  return result[0];
}

export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(contacts).values(data);
  return result[0];
}

export async function updateContact(id: number, userId: number, data: Partial<InsertContact>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(contacts).set(data).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
}

export async function deleteContact(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
}
