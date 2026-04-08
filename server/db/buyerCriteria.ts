import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import {
  BuyerCriteria,
  Contact,
  InsertBuyerCriteria,
  Property,
  buyerCriteria,
  contacts,
  properties,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getBuyerCriteria(contactId: number, userId: number): Promise<BuyerCriteria | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(buyerCriteria)
    .where(and(eq(buyerCriteria.contactId, contactId), eq(buyerCriteria.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertBuyerCriteria(data: InsertBuyerCriteria): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(buyerCriteria)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        propertyTypes: data.propertyTypes,
        minUnits: data.minUnits,
        maxUnits: data.maxUnits,
        minVintageYear: data.minVintageYear,
        maxVintageYear: data.maxVintageYear,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        markets: data.markets,
        states: data.states,
        statuses: data.statuses,
        notes: data.notes,
      },
    });
}

export async function deleteBuyerCriteria(contactId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(buyerCriteria)
    .where(and(eq(buyerCriteria.contactId, contactId), eq(buyerCriteria.userId, userId)));
}

export async function matchPropertiesForBuyer(
  criteria: BuyerCriteria,
  userId: number
): Promise<Property[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const conditions = [eq(properties.userId, userId)];

  // Unit count
  if (criteria.minUnits != null) conditions.push(gte(properties.unitCount, criteria.minUnits));
  if (criteria.maxUnits != null) conditions.push(lte(properties.unitCount, criteria.maxUnits));

  // Vintage year
  if (criteria.minVintageYear != null) conditions.push(gte(properties.vintageYear, criteria.minVintageYear));
  if (criteria.maxVintageYear != null) conditions.push(lte(properties.vintageYear, criteria.maxVintageYear));

  // Price (match against askingPrice or estimatedValue)
  if (criteria.minPrice != null) {
    conditions.push(
      or(
        gte(properties.askingPrice, criteria.minPrice),
        gte(properties.estimatedValue, criteria.minPrice)
      )!
    );
  }
  if (criteria.maxPrice != null) {
    conditions.push(
      or(
        lte(properties.askingPrice, criteria.maxPrice),
        lte(properties.estimatedValue, criteria.maxPrice)
      )!
    );
  }

  let rows = await db
    .select()
    .from(properties)
    .where(and(...conditions))
    .orderBy(desc(properties.updatedAt))
    .limit(200);

  // Post-filter for JSON array fields (property types, markets, states, statuses)
  if (criteria.propertyTypes) {
    const types = JSON.parse(criteria.propertyTypes) as string[];
    if (types.length > 0) rows = rows.filter(p => types.includes(p.propertyType));
  }
  if (criteria.markets) {
    const mkts = (JSON.parse(criteria.markets) as string[]).map(m => m.toLowerCase());
    if (mkts.length > 0) {
      rows = rows.filter(p =>
        mkts.some(m =>
          (p.city ?? "").toLowerCase().includes(m) ||
          (p.county ?? "").toLowerCase().includes(m)
        )
      );
    }
  }
  if (criteria.states) {
    const sts = (JSON.parse(criteria.states) as string[]).map(s => s.toLowerCase());
    if (sts.length > 0) rows = rows.filter(p => sts.includes((p.state ?? "").toLowerCase()));
  }
  if (criteria.statuses) {
    const ss = JSON.parse(criteria.statuses) as string[];
    if (ss.length > 0) rows = rows.filter(p => ss.includes(p.status));
  }

  return rows;
}

export async function matchBuyersForProperty(
  property: Property,
  userId: number
): Promise<Array<{ criteria: BuyerCriteria; contact: Contact }>> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Get all buyer criteria for this user
  const allCriteria = await db
    .select()
    .from(buyerCriteria)
    .where(eq(buyerCriteria.userId, userId));

  const matches: Array<{ criteria: BuyerCriteria; contact: Contact }> = [];

  for (const c of allCriteria) {
    // Check numeric ranges
    if (c.minUnits != null && (property.unitCount ?? 0) < c.minUnits) continue;
    if (c.maxUnits != null && (property.unitCount ?? 0) > c.maxUnits) continue;
    if (c.minVintageYear != null && (property.vintageYear ?? 0) < c.minVintageYear) continue;
    if (c.maxVintageYear != null && (property.vintageYear ?? 9999) > c.maxVintageYear) continue;

    const price = property.askingPrice ?? property.estimatedValue ?? null;
    if (c.minPrice != null && price != null && price < c.minPrice) continue;
    if (c.maxPrice != null && price != null && price > c.maxPrice) continue;

    // Check JSON array fields
    if (c.propertyTypes) {
      const types = JSON.parse(c.propertyTypes) as string[];
      if (types.length > 0 && !types.includes(property.propertyType)) continue;
    }
    if (c.markets) {
      const mkts = (JSON.parse(c.markets) as string[]).map(m => m.toLowerCase());
      if (mkts.length > 0) {
        const inMarket = mkts.some(m =>
          (property.city ?? "").toLowerCase().includes(m) ||
          (property.county ?? "").toLowerCase().includes(m)
        );
        if (!inMarket) continue;
      }
    }
    if (c.states) {
      const sts = (JSON.parse(c.states) as string[]).map(s => s.toLowerCase());
      if (sts.length > 0 && !sts.includes((property.state ?? "").toLowerCase())) continue;
    }
    if (c.statuses) {
      const ss = JSON.parse(c.statuses) as string[];
      if (ss.length > 0 && !ss.includes(property.status)) continue;
    }

    // Fetch the contact
    const contactRows = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, c.contactId), eq(contacts.userId, userId)))
      .limit(1);
    if (contactRows[0]) {
      matches.push({ criteria: c, contact: contactRows[0] });
    }
  }

  return matches;
}
