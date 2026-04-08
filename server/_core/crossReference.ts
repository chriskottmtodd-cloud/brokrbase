import { and, eq, sql, or } from "drizzle-orm";
import {
  contacts, properties, contactAddresses, researchContacts,
  contactPhones, ownerResearch,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CrossReference {
  type: "address_match" | "name_match" | "entity_match";
  matchedField: string;
  matchedIn: "contact" | "research_contact" | "property";
  matchedRecordId: number;
  matchedRecordName: string;
  linkedProperties: { id: number; name: string; address: string }[];
  confidence: "exact" | "likely" | "possible";
}

export type ResearchStatus =
  | "researched"
  | "contact_on_file"
  | "pending_review"
  | "not_researched"
  | "partial_data";

// ─── Address Normalization ──────────────────────────────────────────────────

export function normalizeAddress(address: string): string {
  return address
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/\bST\b/g, "STREET")
    .replace(/\bAVE\b/g, "AVENUE")
    .replace(/\bBLVD\b/g, "BOULEVARD")
    .replace(/\bDR\b/g, "DRIVE")
    .replace(/\bLN\b/g, "LANE")
    .replace(/\bRD\b/g, "ROAD")
    .replace(/\bCT\b/g, "COURT")
    .replace(/\bPL\b/g, "PLACE")
    .replace(/\bN\b/g, "NORTH")
    .replace(/\bS\b/g, "SOUTH")
    .replace(/\bE\b/g, "EAST")
    .replace(/\bW\b/g, "WEST")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip unit/suite/apt numbers for street-level matching */
export function stripUnit(address: string): string {
  return address
    .replace(/\b(APT|UNIT|STE|SUITE|#)\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Name Matching ──────────────────────────────────────────────────────────

export function namesMatch(
  a: { first: string; last: string },
  b: { first: string; last: string },
): { match: boolean; confidence: "exact" | "likely" | "possible" } {
  const lastA = a.last.toUpperCase().trim();
  const lastB = b.last.toUpperCase().trim();
  if (!lastA || !lastB || lastA !== lastB) return { match: false, confidence: "possible" };

  const firstA = a.first.toUpperCase().trim();
  const firstB = b.first.toUpperCase().trim();

  if (firstA === firstB) return { match: true, confidence: "exact" };
  // Initial match: "M" matches "MARK"
  if (firstA.length >= 1 && firstB.length >= 1 && firstA[0] === firstB[0]) {
    if (firstA.length === 1 || firstB.length === 1) {
      return { match: true, confidence: "likely" };
    }
    // "MARK" vs "MARK A" — check if one is a prefix with middle initial
    if (firstA.startsWith(firstB) || firstB.startsWith(firstA)) {
      return { match: true, confidence: "likely" };
    }
  }

  return { match: false, confidence: "possible" };
}

// ─── Cross-Reference Queries ────────────────────────────────────────────────

export async function findCrossReferences(
  userId: number,
  input: {
    addresses: Array<{ street: string; city?: string; state?: string; zip?: string }>;
    names: Array<{ first: string; last: string }>;
    entityNames: string[];
  },
  excludePropertyId?: number,
): Promise<CrossReference[]> {
  const db = await getDb();
  if (!db) return [];

  const refs: CrossReference[] = [];

  // 1. Address matching
  for (const addr of input.addresses) {
    if (!addr.street) continue;
    const normalized = normalizeAddress(stripUnit(addr.street));
    if (normalized.length < 5) continue;
    const searchStr = `%${normalized.slice(0, Math.min(normalized.length, 30))}%`;

    // Check contact_addresses
    const addrMatches = await db
      .select({
        id: contactAddresses.contactId,
        street: contactAddresses.street,
        city: contactAddresses.city,
      })
      .from(contactAddresses)
      .where(and(
        eq(contactAddresses.userId, userId),
        sql`UPPER(COALESCE(${contactAddresses.street}, '')) LIKE ${searchStr}`,
      ))
      .limit(5);

    for (const m of addrMatches) {
      // Get the contact name
      const [contact] = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(eq(contacts.id, m.id))
        .limit(1);
      if (!contact) continue;

      // Get properties linked to this contact
      const linkedProps = await getLinkedProperties(db, userId, contact.id, excludePropertyId);

      refs.push({
        type: "address_match",
        matchedField: [addr.street, addr.city, addr.state].filter(Boolean).join(", "),
        matchedIn: "contact",
        matchedRecordId: contact.id,
        matchedRecordName: `${contact.firstName} ${contact.lastName}`,
        linkedProperties: linkedProps,
        confidence: "exact",
      });
    }

    // Check research_contacts for address matches (different properties)
    const rcMatches = await db
      .select({
        id: researchContacts.id,
        fullName: researchContacts.fullName,
        propertyId: researchContacts.propertyId,
        address: researchContacts.address,
      })
      .from(researchContacts)
      .where(and(
        eq(researchContacts.userId, userId),
        sql`UPPER(COALESCE(${researchContacts.address}, '')) LIKE ${searchStr}`,
        excludePropertyId ? sql`${researchContacts.propertyId} != ${excludePropertyId}` : sql`1=1`,
      ))
      .limit(5);

    for (const m of rcMatches) {
      const [prop] = await db
        .select({ id: properties.id, name: properties.name, address: properties.address })
        .from(properties)
        .where(eq(properties.id, m.propertyId))
        .limit(1);

      refs.push({
        type: "address_match",
        matchedField: [addr.street, addr.city, addr.state].filter(Boolean).join(", "),
        matchedIn: "research_contact",
        matchedRecordId: m.id,
        matchedRecordName: m.fullName,
        linkedProperties: prop ? [{ id: prop.id, name: prop.name, address: prop.address ?? "" }] : [],
        confidence: "likely",
      });
    }
  }

  // 2. Name matching
  for (const name of input.names) {
    if (!name.first || !name.last) continue;
    const firstLower = name.first.toLowerCase();
    const lastLower = name.last.toLowerCase();

    // Check contacts
    const nameMatches = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(
        eq(contacts.userId, userId),
        sql`LOWER(${contacts.lastName}) = ${lastLower}`,
        or(
          sql`LOWER(${contacts.firstName}) = ${firstLower}`,
          sql`LEFT(LOWER(${contacts.firstName}), 1) = ${firstLower[0]}`,
        )!,
      ))
      .limit(5);

    for (const m of nameMatches) {
      const matchResult = namesMatch(name, { first: m.firstName, last: m.lastName });
      if (!matchResult.match) continue;

      const linkedProps = await getLinkedProperties(db, userId, m.id, excludePropertyId);
      refs.push({
        type: "name_match",
        matchedField: `${name.first} ${name.last}`,
        matchedIn: "contact",
        matchedRecordId: m.id,
        matchedRecordName: `${m.firstName} ${m.lastName}`,
        linkedProperties: linkedProps,
        confidence: matchResult.confidence,
      });
    }
  }

  // 3. Entity name matching
  for (const entityName of input.entityNames) {
    if (!entityName || entityName.length < 3) continue;
    const searchStr = `%${entityName.toLowerCase()}%`;

    // Check property ownerName and ownerCompany
    const propMatches = await db
      .select({ id: properties.id, name: properties.name, address: properties.address, ownerName: properties.ownerName, ownerCompany: properties.ownerCompany })
      .from(properties)
      .where(and(
        eq(properties.userId, userId),
        excludePropertyId ? sql`${properties.id} != ${excludePropertyId}` : sql`1=1`,
        or(
          sql`LOWER(COALESCE(${properties.ownerName}, '')) LIKE ${searchStr}`,
          sql`LOWER(COALESCE(${properties.ownerCompany}, '')) LIKE ${searchStr}`,
        )!,
      ))
      .limit(10);

    if (propMatches.length > 0) {
      refs.push({
        type: "entity_match",
        matchedField: entityName,
        matchedIn: "property",
        matchedRecordId: propMatches[0].id,
        matchedRecordName: `${propMatches.length} propert${propMatches.length === 1 ? "y" : "ies"}`,
        linkedProperties: propMatches.map((p) => ({ id: p.id, name: p.name, address: p.address ?? "" })),
        confidence: "likely",
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.type}:${r.matchedRecordId}:${r.matchedIn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Property Connections (passive check) ───────────────────────────────────

export async function findPropertyConnections(
  userId: number,
  propertyId: number,
): Promise<CrossReference[]> {
  const db = await getDb();
  if (!db) return [];

  const [prop] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1);
  if (!prop) return [];

  const input: { addresses: any[]; names: any[]; entityNames: string[] } = {
    addresses: [],
    names: [],
    entityNames: [],
  };

  if (prop.ownerName) {
    // Try to parse as LLC vs name
    if (/LLC|INC|CORP|TRUST|LP|LLP|PLLC/i.test(prop.ownerName)) {
      input.entityNames.push(prop.ownerName);
    } else {
      // Strip middle initials and dots: "Michael W Beumeler" → ["Michael", "Beumeler"]
      const parts = prop.ownerName
        .split(/\s+/)
        .filter((p) => p.replace(/\./g, "").length > 1); // drop single-letter parts (middle initials)
      if (parts.length >= 2) {
        // First word = first name, last word = last name (ignore everything in between)
        input.names.push({ first: parts[0], last: parts[parts.length - 1] });
      }
    }
  }
  if (prop.ownerCompany) {
    input.entityNames.push(prop.ownerCompany);
  }

  if (input.names.length === 0 && input.entityNames.length === 0) return [];

  const refs = await findCrossReferences(userId, input, propertyId);

  // Filter out contacts already linked to this property
  const { contactPropertyLinks } = await import("../../drizzle/schema");
  const linkedContacts = await db
    .select({ contactId: contactPropertyLinks.contactId })
    .from(contactPropertyLinks)
    .where(and(
      eq(contactPropertyLinks.propertyId, propertyId),
      eq(contactPropertyLinks.userId, userId),
    ));
  const linkedSet = new Set(linkedContacts.map((l) => l.contactId));
  // Also exclude the property's primary owner
  if (prop.ownerId) linkedSet.add(prop.ownerId);

  return refs.filter((r) => {
    if (r.matchedIn === "contact" && linkedSet.has(r.matchedRecordId)) return false;
    return true;
  });
}

// ─── Contact Connections (for contact detail page) ──────────────────────────

export async function findContactConnections(
  userId: number,
  contactId: number,
): Promise<Array<{ id: number; name: string; address: string; matchReason: string }>> {
  const db = await getDb();
  if (!db) return [];

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);
  if (!contact) return [];

  const results: Array<{ id: number; name: string; address: string; matchReason: string }> = [];
  const seenIds = new Set<number>();

  // Pre-populate with already-linked properties so we exclude them
  const { contactPropertyLinks } = await import("../../drizzle/schema");
  const alreadyLinked = await db
    .select({ propertyId: contactPropertyLinks.propertyId })
    .from(contactPropertyLinks)
    .where(and(
      eq(contactPropertyLinks.contactId, contactId),
      eq(contactPropertyLinks.userId, userId),
    ));
  for (const l of alreadyLinked) {
    if (l.propertyId) seenIds.add(l.propertyId);
  }
  // Also exclude properties where this contact is the primary owner
  const ownedProps = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.ownerId, contactId), eq(properties.userId, userId)));
  for (const p of ownedProps) seenIds.add(p.id);

  // Get contact's addresses
  const addrs = await db
    .select()
    .from(contactAddresses)
    .where(and(eq(contactAddresses.contactId, contactId), eq(contactAddresses.userId, userId)));

  // Name match: find properties where ownerName matches contact name
  const nameSearch = `${contact.firstName} ${contact.lastName}`.toLowerCase();
  const lastLower = contact.lastName.toLowerCase();
  const propsByName = await db
    .select({ id: properties.id, name: properties.name, address: properties.address, ownerName: properties.ownerName })
    .from(properties)
    .where(and(
      eq(properties.userId, userId),
      sql`LOWER(COALESCE(${properties.ownerName}, '')) LIKE ${`%${lastLower}%`}`,
    ))
    .limit(20);

  for (const p of propsByName) {
    if (seenIds.has(p.id)) continue;
    // Verify the name actually matches (not just last name substring)
    if (!p.ownerName) continue;
    const parts = p.ownerName.split(/\s+/);
    if (parts.length < 2) continue;
    const matchResult = namesMatch(
      { first: contact.firstName, last: contact.lastName },
      { first: parts[0], last: parts.slice(1).join(" ") },
    );
    if (matchResult.match) {
      seenIds.add(p.id);
      results.push({
        id: p.id,
        name: p.name,
        address: p.address ?? "",
        matchReason: `Owner name "${p.ownerName}" matches`,
      });
    }
  }

  // Address match: find properties where address matches contact address
  for (const addr of addrs) {
    if (!addr.street) continue;
    const normalized = normalizeAddress(stripUnit(addr.street));
    if (normalized.length < 5) continue;
    const searchStr = `%${normalized.slice(0, 30)}%`;

    // Check if any property has this as its address
    const propsByAddr = await db
      .select({ id: properties.id, name: properties.name, address: properties.address })
      .from(properties)
      .where(and(
        eq(properties.userId, userId),
        sql`UPPER(COALESCE(${properties.address}, '')) LIKE ${searchStr}`,
      ))
      .limit(5);

    for (const p of propsByAddr) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      results.push({
        id: p.id,
        name: p.name,
        address: p.address ?? "",
        matchReason: `Address "${addr.street}, ${addr.city}" matches`,
      });
    }
  }

  return results;
}

// ─── Research Status Calculator ─────────────────────────────────────────────

export async function calculateResearchStatus(
  userId: number,
  propertyId: number,
): Promise<ResearchStatus> {
  const db = await getDb();
  if (!db) return "not_researched";

  // Check for owner_research records
  const [research] = await db
    .select({ id: ownerResearch.id })
    .from(ownerResearch)
    .where(and(eq(ownerResearch.propertyId, propertyId), eq(ownerResearch.userId, userId)))
    .limit(1);

  if (research) {
    // Check if any research contact was promoted
    const [promoted] = await db
      .select({ id: researchContacts.id })
      .from(researchContacts)
      .where(and(
        eq(researchContacts.propertyId, propertyId),
        eq(researchContacts.userId, userId),
        sql`${researchContacts.promotedToContactId} IS NOT NULL`,
      ))
      .limit(1);

    return promoted ? "researched" : "pending_review";
  }

  // Check for linked owner with contact data
  const [prop] = await db
    .select({
      ownerId: properties.ownerId,
      ownerName: properties.ownerName,
      ownerPhone: properties.ownerPhone,
      ownerEmail: properties.ownerEmail,
    })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)))
    .limit(1);

  if (!prop) return "not_researched";

  if (prop.ownerId) {
    // Check if linked contact has any useful data
    const [contact] = await db
      .select({ phone: contacts.phone, email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, prop.ownerId))
      .limit(1);

    if (contact && (contact.phone || contact.email)) {
      return "contact_on_file";
    }

    // Check contact_phones
    const [hasPhone] = await db
      .select({ id: contactPhones.id })
      .from(contactPhones)
      .where(eq(contactPhones.contactId, prop.ownerId))
      .limit(1);

    if (hasPhone) return "contact_on_file";
  }

  // Check for partial data
  if (prop.ownerName || prop.ownerPhone || prop.ownerEmail) {
    if (prop.ownerPhone || prop.ownerEmail) {
      return "contact_on_file";
    }
    return "partial_data";
  }

  return "not_researched";
}

// ─── Update Research Status ─────────────────────────────────────────────────

export async function updatePropertyResearchStatus(
  userId: number,
  propertyId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const status = await calculateResearchStatus(userId, propertyId);
  await db
    .update(properties)
    .set({ researchStatus: status })
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getLinkedProperties(
  db: any,
  userId: number,
  contactId: number,
  excludePropertyId?: number,
): Promise<{ id: number; name: string; address: string }[]> {
  const props = await db
    .select({ id: properties.id, name: properties.name, address: properties.address })
    .from(properties)
    .where(and(
      eq(properties.userId, userId),
      eq(properties.ownerId, contactId),
      excludePropertyId ? sql`${properties.id} != ${excludePropertyId}` : sql`1=1`,
    ))
    .limit(10);
  return props.map((p: any) => ({ id: p.id, name: p.name, address: p.address ?? "" }));
}
