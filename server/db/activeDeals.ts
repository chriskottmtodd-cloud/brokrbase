import { and, desc, eq, gte, sql } from "drizzle-orm";
import { activities, contacts, properties } from "../../drizzle/schema";
import { getDb } from "./connection";

export interface ActiveDeal {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  propertyType: string;
  unitCount: number | null;
  status: string;
  ownerId: number | null;
  ownerName: string | null;
  ownerCompany: string | null;
  lastActivityDate: Date;
}

/**
 * Get properties with activity in the last N days, ordered by most recent activity.
 * These are the deals the user is actively working on.
 */
export async function getActiveDeals(userId: number, days = 60): Promise<ActiveDeal[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Find properties that have had activity in the window, ordered by most recent
  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      propertyType: properties.propertyType,
      unitCount: properties.unitCount,
      status: properties.status,
      ownerId: properties.ownerId,
      ownerName: properties.ownerName,
      ownerCompany: properties.ownerCompany,
      lastActivityDate: sql<Date>`MAX(${activities.occurredAt})`.as("lastActivityDate"),
    })
    .from(properties)
    .innerJoin(activities, and(
      eq(activities.propertyId, properties.id),
      eq(activities.userId, userId),
      gte(activities.occurredAt, cutoff),
    ))
    .where(eq(properties.userId, userId))
    .groupBy(properties.id)
    .orderBy(desc(sql`lastActivityDate`))
    .limit(50);

  return rows;
}

export interface DealMatchProperty {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  propertyType?: string;
  unitCount?: number | null;
  ownerName?: string | null;
}

export interface DealMatch {
  property: DealMatchProperty;
  confidence: "high" | "medium" | "low";
  tier: "active" | "inactive" | "none";
  reason: string;
}

/**
 * Tiered property resolution:
 * 1. Check active deals (high confidence if single match)
 * 2. Check broader database (lower confidence)
 * 3. No match — return similar alternatives
 */
export async function resolveProperty(
  userId: number,
  extractedName: string,
): Promise<{
  match: DealMatch | null;
  alternatives: DealMatch[];
  isNew: boolean;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const nameLower = extractedName.toLowerCase().trim();
  if (!nameLower) return { match: null, alternatives: [], isNew: false };

  // --- Tier 1: Active deals ---
  const activeDeals = await getActiveDeals(userId, 60);
  const activeMatches = scoreMatches(activeDeals, nameLower, "active");

  // Single strong active match → high confidence
  if (activeMatches.length === 1 && activeMatches[0].confidence === "high") {
    return { match: activeMatches[0], alternatives: [], isNew: false };
  }

  // Multiple active matches → ambiguous, user picks
  if (activeMatches.length > 1) {
    return { match: null, alternatives: activeMatches.slice(0, 5), isNew: false };
  }

  // Single medium-confidence active match → return it but with alternatives
  if (activeMatches.length === 1) {
    return { match: activeMatches[0], alternatives: [], isNew: false };
  }

  // --- Tier 2: Broader database ---
  const allProperties = await db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      city: properties.city,
      propertyType: properties.propertyType,
      unitCount: properties.unitCount,
      ownerName: properties.ownerName,
    })
    .from(properties)
    .where(eq(properties.userId, userId))
    .limit(3000);

  const broadMatches = scoreMatches(allProperties, nameLower, "inactive");

  if (broadMatches.length > 0) {
    // Found in broader DB but not active — needs confirmation
    return {
      match: broadMatches.length === 1 ? broadMatches[0] : null,
      alternatives: broadMatches.slice(0, 5),
      isNew: false,
    };
  }

  // --- Tier 3: No match — it's new ---
  // Return fuzzy alternatives so user can verify it's truly new
  const fuzzyAlternatives = fuzzySearch(allProperties, nameLower, "inactive").slice(0, 5);
  return {
    match: null,
    alternatives: fuzzyAlternatives,
    isNew: true,
  };
}

/** Score properties against an extracted name */
function scoreMatches<T extends { id: number; name: string; address: string | null; city: string | null }>(
  properties: T[],
  nameLower: string,
  tier: "active" | "inactive",
): DealMatch[] {
  const matches: DealMatch[] = [];

  for (const p of properties) {
    const pName = (p.name ?? "").toLowerCase().trim();
    const pAddr = (p.address ?? "").toLowerCase().trim();

    // Exact name match
    if (pName === nameLower) {
      matches.push({
        property: p as DealMatchProperty,
        confidence: "high",
        tier,
        reason: "Exact name match",
      });
      continue;
    }

    // Name contains search or search contains name (substantial overlap)
    if (pName && nameLower.length >= 4) {
      if (pName.includes(nameLower) || nameLower.includes(pName)) {
        matches.push({
          property: p as DealMatchProperty,
          confidence: tier === "active" ? "high" : "medium",
          tier,
          reason: "Name contains match",
        });
        continue;
      }
    }

    // Address match
    if (pAddr && pAddr === nameLower) {
      matches.push({
        property: p as DealMatchProperty,
        confidence: "high",
        tier,
        reason: "Address match",
      });
      continue;
    }

    // Address contains
    if (pAddr && nameLower.length >= 6 && pAddr.includes(nameLower)) {
      matches.push({
        property: p as DealMatchProperty,
        confidence: "medium",
        tier,
        reason: "Address contains match",
      });
    }
  }

  return matches;
}

/** Fuzzy search for similar properties when no strong match found */
function fuzzySearch<T extends { id: number; name: string; address: string | null; city: string | null }>(
  properties: T[],
  nameLower: string,
  tier: "active" | "inactive",
): DealMatch[] {
  const tokens = nameLower.split(/\s+/).filter(t => t.length >= 3);
  if (tokens.length === 0) return [];

  const scored: { match: DealMatch; score: number }[] = [];

  for (const p of properties) {
    const pName = (p.name ?? "").toLowerCase();
    const pAddr = (p.address ?? "").toLowerCase();
    const combined = `${pName} ${pAddr}`;

    let score = 0;
    for (const token of tokens) {
      if (combined.includes(token)) score++;
    }

    if (score > 0) {
      scored.push({
        match: {
          property: p as DealMatchProperty,
          confidence: "low",
          tier,
          reason: `${score}/${tokens.length} words match`,
        },
        score,
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map(s => s.match);
}
