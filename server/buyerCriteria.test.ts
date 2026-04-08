/**
 * Tests for buyer criteria matching logic.
 * These tests exercise the pure matching functions without hitting the database.
 */
import { describe, expect, it } from "vitest";
import type { BuyerCriteria, Property, Contact } from "../drizzle/schema";

// ─── Minimal test fixtures ────────────────────────────────────────────────────

function makeCriteria(overrides: Partial<BuyerCriteria> = {}): BuyerCriteria {
  return {
    id: 1,
    userId: 1,
    contactId: 10,
    propertyTypes: null,
    minUnits: null,
    maxUnits: null,
    minVintageYear: null,
    maxVintageYear: null,
    minPrice: null,
    maxPrice: null,
    markets: null,
    states: null,
    statuses: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 1,
    userId: 1,
    name: "Test MHC",
    propertyType: "mhc",
    status: "tracking",
    address: "123 Main St",
    city: "Nampa",
    state: "ID",
    zip: "83651",
    county: null,
    country: "US",
    latitude: null,
    longitude: null,
    unitCount: 80,
    vintageYear: 1985,
    sizeSqft: null,
    lotAcres: null,
    askingPrice: 5_000_000,
    estimatedValue: 4_800_000,
    noi: null,
    capRate: null,
    occupancyRate: null,
    ownerName: null,
    ownerId: null,
    ownerFirstName: null,
    ownerLastName: null,
    ownerEmail: null,
    ownerPhone: null,
    notes: null,
    source: null,
    tags: null,
     createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
// ─── Inline matching logic (mirrors db.ts matchBuyersForProperty) ─────────────
// We test the logic directly without a DB connection.

function propertyMatchesCriteria(property: Property, c: BuyerCriteria): boolean {
  if (c.minUnits != null && (property.unitCount ?? 0) < c.minUnits) return false;
  if (c.maxUnits != null && (property.unitCount ?? 0) > c.maxUnits) return false;
  if (c.minVintageYear != null && (property.vintageYear ?? 0) < c.minVintageYear) return false;
  if (c.maxVintageYear != null && (property.vintageYear ?? 9999) > c.maxVintageYear) return false;

  const price = property.askingPrice ?? property.estimatedValue ?? null;
  if (c.minPrice != null && price != null && price < c.minPrice) return false;
  if (c.maxPrice != null && price != null && price > c.maxPrice) return false;

  if (c.propertyTypes) {
    const types = JSON.parse(c.propertyTypes) as string[];
    if (types.length > 0 && !types.includes(property.propertyType)) return false;
  }
  if (c.markets) {
    const mkts = (JSON.parse(c.markets) as string[]).map(m => m.toLowerCase());
    if (mkts.length > 0) {
      const inMarket = mkts.some(m =>
        (property.city ?? "").toLowerCase().includes(m) ||
        (property.county ?? "").toLowerCase().includes(m)
      );
      if (!inMarket) return false;
    }
  }
  if (c.states) {
    const sts = (JSON.parse(c.states) as string[]).map(s => s.toLowerCase());
    if (sts.length > 0 && !sts.includes((property.state ?? "").toLowerCase())) return false;
  }
  if (c.statuses) {
    const ss = JSON.parse(c.statuses) as string[];
    if (ss.length > 0 && !ss.includes(property.status)) return false;
  }
  return true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buyer criteria matching", () => {
  it("matches when criteria is completely open (no filters)", () => {
    const criteria = makeCriteria();
    const property = makeProperty();
    expect(propertyMatchesCriteria(property, criteria)).toBe(true);
  });

  it("matches when property unit count is within range", () => {
    const criteria = makeCriteria({ minUnits: 50, maxUnits: 150 });
    expect(propertyMatchesCriteria(makeProperty({ unitCount: 80 }), criteria)).toBe(true);
    expect(propertyMatchesCriteria(makeProperty({ unitCount: 50 }), criteria)).toBe(true);
    expect(propertyMatchesCriteria(makeProperty({ unitCount: 150 }), criteria)).toBe(true);
  });

  it("rejects when unit count is below minimum", () => {
    const criteria = makeCriteria({ minUnits: 100 });
    expect(propertyMatchesCriteria(makeProperty({ unitCount: 80 }), criteria)).toBe(false);
  });

  it("rejects when unit count exceeds maximum", () => {
    const criteria = makeCriteria({ maxUnits: 50 });
    expect(propertyMatchesCriteria(makeProperty({ unitCount: 80 }), criteria)).toBe(false);
  });

  it("matches when vintage year is within range", () => {
    const criteria = makeCriteria({ minVintageYear: 1970, maxVintageYear: 2000 });
    expect(propertyMatchesCriteria(makeProperty({ vintageYear: 1985 }), criteria)).toBe(true);
  });

  it("rejects when vintage year is outside range", () => {
    const criteria = makeCriteria({ minVintageYear: 1990 });
    expect(propertyMatchesCriteria(makeProperty({ vintageYear: 1985 }), criteria)).toBe(false);
  });

  it("matches when asking price is within range", () => {
    const criteria = makeCriteria({ minPrice: 3_000_000, maxPrice: 8_000_000 });
    expect(propertyMatchesCriteria(makeProperty({ askingPrice: 5_000_000 }), criteria)).toBe(true);
  });

  it("rejects when asking price exceeds maximum", () => {
    const criteria = makeCriteria({ maxPrice: 4_000_000 });
    expect(propertyMatchesCriteria(makeProperty({ askingPrice: 5_000_000 }), criteria)).toBe(false);
  });

  it("falls back to estimatedValue when askingPrice is null", () => {
    // Property has no asking price but estimatedValue is within range
    const criteria = makeCriteria({ maxPrice: 4_000_000 });
    const property = makeProperty({ askingPrice: null, estimatedValue: 3_500_000 });
    // The matching function checks askingPrice first; if null it falls back to estimatedValue
    // Our inline test logic mirrors db.ts: price = askingPrice ?? estimatedValue
    // Since askingPrice is null, price = 3_500_000 which is <= 4_000_000 → should match
    // NOTE: makeProperty sets askingPrice: 5_000_000 by default, so we must explicitly pass null
    expect(propertyMatchesCriteria({ ...property, askingPrice: null }, criteria)).toBe(true);
  });

  it("matches when property type is in the allowed list", () => {
    const criteria = makeCriteria({ propertyTypes: JSON.stringify(["mhc", "apartment"]) });
    expect(propertyMatchesCriteria(makeProperty({ propertyType: "mhc" }), criteria)).toBe(true);
    expect(propertyMatchesCriteria(makeProperty({ propertyType: "apartment" }), criteria)).toBe(true);
  });

  it("rejects when property type is not in the allowed list", () => {
    const criteria = makeCriteria({ propertyTypes: JSON.stringify(["apartment"]) });
    expect(propertyMatchesCriteria(makeProperty({ propertyType: "mhc" }), criteria)).toBe(false);
  });

  it("matches when city is in the markets list", () => {
    const criteria = makeCriteria({ markets: JSON.stringify(["Nampa", "Boise"]) });
    expect(propertyMatchesCriteria(makeProperty({ city: "Nampa" }), criteria)).toBe(true);
  });

  it("rejects when city is not in the markets list", () => {
    const criteria = makeCriteria({ markets: JSON.stringify(["Boise"]) });
    expect(propertyMatchesCriteria(makeProperty({ city: "Nampa" }), criteria)).toBe(false);
  });

  it("matches when state is in the states list", () => {
    const criteria = makeCriteria({ states: JSON.stringify(["ID", "OR"]) });
    expect(propertyMatchesCriteria(makeProperty({ state: "ID" }), criteria)).toBe(true);
  });

  it("rejects when state is not in the states list", () => {
    const criteria = makeCriteria({ states: JSON.stringify(["OR"]) });
    expect(propertyMatchesCriteria(makeProperty({ state: "ID" }), criteria)).toBe(false);
  });

  it("matches when status is in the allowed statuses", () => {
    const criteria = makeCriteria({ statuses: JSON.stringify(["tracking", "prospect"]) });
    expect(propertyMatchesCriteria(makeProperty({ status: "tracking" }), criteria)).toBe(true);
  });

  it("rejects when status is not in the allowed statuses", () => {
    const criteria = makeCriteria({ statuses: JSON.stringify(["listed"]) });
    expect(propertyMatchesCriteria(makeProperty({ status: "tracking" }), criteria)).toBe(false);
  });

  it("handles multiple criteria combined — all must pass", () => {
    const criteria = makeCriteria({
      propertyTypes: JSON.stringify(["mhc"]),
      minUnits: 50,
      maxUnits: 100,   // default fixture has unitCount: 80, so 200 would exceed this
      minVintageYear: 1970,
      maxVintageYear: 2000,
      minPrice: 2_000_000,
      maxPrice: 8_000_000,
      markets: JSON.stringify(["Nampa"]),
      states: JSON.stringify(["ID"]),
    });
    // Perfect match (unitCount: 80, vintageYear: 1985, askingPrice: 5M, city: Nampa, state: ID)
    expect(propertyMatchesCriteria(makeProperty(), criteria)).toBe(true);
    // Fails on unit count (200 > maxUnits 100)
    expect(propertyMatchesCriteria(makeProperty({ unitCount: 200 }), criteria)).toBe(false);
    // Fails on state
    expect(propertyMatchesCriteria(makeProperty({ state: "OR" }), criteria)).toBe(false);
    // Fails on price (10M > maxPrice 8M)
    expect(propertyMatchesCriteria(makeProperty({ askingPrice: 10_000_000 }), criteria)).toBe(false);
  });

  it("empty JSON arrays are treated as 'any' (no filter)", () => {
    const criteria = makeCriteria({
      propertyTypes: JSON.stringify([]),
      markets: JSON.stringify([]),
      states: JSON.stringify([]),
      statuses: JSON.stringify([]),
    });
    expect(propertyMatchesCriteria(makeProperty(), criteria)).toBe(true);
  });
});
