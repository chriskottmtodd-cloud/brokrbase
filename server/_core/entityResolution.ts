/**
 * Entity Resolution — turn names extracted by an LLM into validated DB IDs
 * with confidence scores.
 *
 * The LLM is good at understanding spoken language; SQL is good at finding
 * the right row. This module is the SQL half.
 */
import { and, eq, like, or, sql } from "drizzle-orm";
import { contacts, properties } from "../../drizzle/schema";
import { getDb } from "../db/connection";

export type MatchConfidence = "high" | "medium" | "low" | "none";
export type MatchMethod =
  | "exact_email"
  | "exact_phone"
  | "exact_name"
  | "name_plus_company"
  | "name_plus_city"
  | "fuzzy_name"
  | "substring"
  | "unmatched";

export interface ResolvedEntity {
  id: number | null;
  name: string; // canonical display name (post-resolution) or the raw mention if unmatched
  confidence: MatchConfidence;
  matchMethod: MatchMethod;
  candidateCount: number;
  topCandidates?: Array<{ id: number; name: string; score: number }>;
}

export interface ContactMention {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  context?: string;
}

export interface PropertyMention {
  name: string;
  city?: string;
  address?: string;
  unitCount?: number;
  context?: string;
}

// ─── CONTACT RESOLUTION ─────────────────────────────────────────────────
export async function resolveContactMention(
  userId: number,
  mention: ContactMention,
): Promise<ResolvedEntity> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rawName = mention.name.trim();

  // TIER 1: Email exact match
  if (mention.email?.trim()) {
    const byEmail = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          sql`LOWER(COALESCE(${contacts.email}, '')) = LOWER(${mention.email.trim()})`,
        ),
      )
      .limit(2);
    if (byEmail.length === 1) {
      return {
        id: byEmail[0].id,
        name: `${byEmail[0].firstName} ${byEmail[0].lastName}`,
        confidence: "high",
        matchMethod: "exact_email",
        candidateCount: 1,
      };
    }
  }

  // TIER 2: Phone match
  if (mention.phone) {
    const cleanPhone = mention.phone.replace(/\D/g, "");
    if (cleanPhone.length >= 7) {
      const byPhone = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            sql`REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${contacts.phone}, ''), '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${"%" + cleanPhone + "%"}`,
          ),
        )
        .limit(3);
      if (byPhone.length === 1) {
        return {
          id: byPhone[0].id,
          name: `${byPhone[0].firstName} ${byPhone[0].lastName}`,
          confidence: "high",
          matchMethod: "exact_phone",
          candidateCount: 1,
        };
      }
    }
  }

  // TIER 3: Exact name match
  const parts = rawName.split(/\s+/).filter(Boolean);
  const firstName = (parts[0] || "").toLowerCase();
  const lastName = parts.slice(1).join(" ").toLowerCase();

  if (firstName && lastName) {
    const byExact = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          sql`LOWER(${contacts.firstName}) = ${firstName}`,
          or(
            sql`LOWER(${contacts.lastName}) = ${lastName}`,
            sql`LOWER(SUBSTRING_INDEX(${contacts.lastName}, ' ', -1)) = ${lastName}`,
          )!,
        ),
      )
      .limit(5);

    if (byExact.length === 1) {
      return {
        id: byExact[0].id,
        name: `${byExact[0].firstName} ${byExact[0].lastName}`,
        confidence: "high",
        matchMethod: "exact_name",
        candidateCount: 1,
      };
    }

    if (byExact.length > 1 && mention.company) {
      const co = mention.company.toLowerCase();
      const withCompany = byExact.filter((c) =>
        (c.company || "").toLowerCase().includes(co),
      );
      if (withCompany.length === 1) {
        return {
          id: withCompany[0].id,
          name: `${withCompany[0].firstName} ${withCompany[0].lastName}`,
          confidence: "high",
          matchMethod: "name_plus_company",
          candidateCount: byExact.length,
        };
      }
    }

    if (byExact.length > 1) {
      return {
        id: byExact[0].id,
        name: `${byExact[0].firstName} ${byExact[0].lastName}`,
        confidence: "medium",
        matchMethod: "exact_name",
        candidateCount: byExact.length,
        topCandidates: byExact.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ""}`,
          score: 100,
        })),
      };
    }
  }

  // TIER 4: First name only / fuzzy
  if (firstName) {
    const byFirst = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          sql`LOWER(${contacts.firstName}) = ${firstName}`,
        ),
      )
      .limit(15);

    if (byFirst.length === 1) {
      return {
        id: byFirst[0].id,
        name: `${byFirst[0].firstName} ${byFirst[0].lastName}`,
        confidence: lastName ? "medium" : "medium",
        matchMethod: "fuzzy_name",
        candidateCount: 1,
      };
    }

    if (byFirst.length > 1) {
      const co = mention.company?.toLowerCase() || "";
      const scored = byFirst
        .map((c) => {
          const cLast = (c.lastName || "").toLowerCase();
          let score = 50;
          if (lastName && cLast === lastName) score = 95;
          else if (lastName && cLast.startsWith(lastName)) score = 85;
          else if (lastName && cLast.includes(lastName)) score = 70;
          if (co && (c.company || "").toLowerCase().includes(co)) score += 10;
          return { c, score };
        })
        .sort((a, b) => b.score - a.score);

      const top = scored[0];
      const confidence: MatchConfidence =
        top.score >= 90 ? "high" : top.score >= 70 ? "medium" : "low";

      return {
        id: top.c.id,
        name: `${top.c.firstName} ${top.c.lastName}`,
        confidence,
        matchMethod: "fuzzy_name",
        candidateCount: scored.length,
        topCandidates: scored.slice(0, 4).map((s) => ({
          id: s.c.id,
          name: `${s.c.firstName} ${s.c.lastName}${s.c.company ? ` (${s.c.company})` : ""}`,
          score: s.score,
        })),
      };
    }
  }

  return {
    id: null,
    name: rawName,
    confidence: "none",
    matchMethod: "unmatched",
    candidateCount: 0,
  };
}

// ─── PROPERTY RESOLUTION ────────────────────────────────────────────────
export async function resolvePropertyMention(
  userId: number,
  mention: PropertyMention,
): Promise<ResolvedEntity> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rawName = mention.name.trim();
  const q = rawName.toLowerCase();

  // TIER 1: Address exact match
  if (mention.address?.trim()) {
    const byAddr = await db
      .select()
      .from(properties)
      .where(
        and(
          eq(properties.userId, userId),
          sql`LOWER(COALESCE(${properties.address}, '')) = LOWER(${mention.address.trim()})`,
        ),
      )
      .limit(3);
    if (byAddr.length === 1) {
      return {
        id: byAddr[0].id,
        name: byAddr[0].name,
        confidence: "high",
        matchMethod: "exact_name",
        candidateCount: 1,
      };
    }
  }

  // TIER 2: Exact name match
  const byExact = await db
    .select()
    .from(properties)
    .where(
      and(eq(properties.userId, userId), sql`LOWER(${properties.name}) = ${q}`),
    )
    .limit(5);

  if (byExact.length === 1) {
    return {
      id: byExact[0].id,
      name: byExact[0].name,
      confidence: "high",
      matchMethod: "exact_name",
      candidateCount: 1,
    };
  }

  if (byExact.length > 1 && mention.city) {
    const c = mention.city.toLowerCase();
    const withCity = byExact.filter(
      (p) => (p.city || "").toLowerCase() === c,
    );
    if (withCity.length === 1) {
      return {
        id: withCity[0].id,
        name: withCity[0].name,
        confidence: "high",
        matchMethod: "name_plus_city",
        candidateCount: byExact.length,
      };
    }
  }

  // TIER 3: Substring search on name + address
  const bySub = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.userId, userId),
        or(
          sql`LOWER(${properties.name}) LIKE ${"%" + q + "%"}`,
          sql`LOWER(COALESCE(${properties.address}, '')) LIKE ${"%" + q + "%"}`,
        )!,
      ),
    )
    .limit(15);

  if (bySub.length === 1) {
    return {
      id: bySub[0].id,
      name: bySub[0].name,
      confidence: "medium",
      matchMethod: "substring",
      candidateCount: 1,
    };
  }

  if (bySub.length > 1) {
    const scored = bySub
      .map((p) => {
        const pn = (p.name || "").toLowerCase();
        let score = 30;
        if (pn === q) score = 100;
        else if (pn.startsWith(q)) score = 80;
        else if (pn.includes(q)) score = 60;
        if (mention.city && (p.city || "").toLowerCase() === mention.city.toLowerCase())
          score += 15;
        if (mention.unitCount && p.unitCount === mention.unitCount) score += 10;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);

    const top = scored[0];
    const confidence: MatchConfidence =
      top.score >= 90 ? "high" : top.score >= 60 ? "medium" : "low";

    return {
      id: top.p.id,
      name: top.p.name,
      confidence,
      matchMethod: "substring",
      candidateCount: scored.length,
      topCandidates: scored.slice(0, 4).map((s) => ({
        id: s.p.id,
        name: `${s.p.name}${s.p.city ? ` — ${s.p.city}` : ""}${s.p.unitCount ? ` (${s.p.unitCount}u)` : ""}`,
        score: s.score,
      })),
    };
  }

  return {
    id: null,
    name: rawName,
    confidence: "none",
    matchMethod: "unmatched",
    candidateCount: 0,
  };
}
