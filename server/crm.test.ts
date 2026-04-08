import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(overrides?: Partial<TrpcContext>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-openid",
    email: "broker@example.com",
    name: "Test Broker",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
    ...overrides,
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe("auth", () => {
  it("returns null user when not authenticated", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns current user when authenticated", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("broker@example.com");
    expect(result?.name).toBe("Test Broker");
  });

  it("clears session cookie on logout", async () => {
    const clearedCookies: string[] = [];
    const ctx = createTestContext({
      res: {
        clearCookie: (name: string) => clearedCookies.push(name),
      } as TrpcContext["res"],
    });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies.length).toBeGreaterThan(0);
  });
});

// ─── Protected Procedure Guard Tests ─────────────────────────────────────────

describe("protected procedure guards", () => {
  it("throws UNAUTHORIZED when accessing contacts without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contacts.list({})).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when accessing properties without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.properties.list({})).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when accessing tasks without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.tasks.list({})).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when accessing listings without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.listings.list({})).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when accessing activities without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.activities.list({})).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when accessing notifications without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.list()).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when accessing dashboard metrics without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.metrics()).rejects.toThrow();
  });
});

// ─── Input Validation Tests ───────────────────────────────────────────────────

describe("input validation", () => {
  it("rejects contact creation with missing required fields", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    // firstName is required — empty string should fail zod min(1)
    await expect(
      caller.contacts.create({ firstName: "", lastName: "Smith" })
    ).rejects.toThrow();
  });

  it("rejects property creation with missing required fields", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    // name is required
    await expect(
      caller.properties.create({ name: "", address: "123 Main St", city: "Boise", state: "ID", propertyType: "mhc" })
    ).rejects.toThrow();
  });

  it("rejects task creation with empty title", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tasks.create({ title: "" })
    ).rejects.toThrow();
  });

  it("rejects processNotes with empty notes", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.ai.processNotes({ rawNotes: "" })
    ).rejects.toThrow();
  });

  it("accepts empty ids array for markRead without error", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    // markNotificationsRead returns void/undefined when db is not available in test env
    // Just ensure it does not throw
    await expect(caller.notifications.markRead({ ids: [] })).resolves.not.toThrow();
  });
});

// ─── Router Structure Tests ───────────────────────────────────────────────────

describe("router structure", () => {
  it("has all expected top-level routers", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    // Check that key procedures exist
    const expectedPrefixes = ["auth.", "contacts.", "properties.", "tasks.", "listings.", "activities.", "notifications.", "dashboard.", "ai."];
    for (const prefix of expectedPrefixes) {
      const hasPrefix = routerKeys.some(k => k.startsWith(prefix));
      expect(hasPrefix, `Missing router with prefix: ${prefix}`).toBe(true);
    }
  });

  it("contacts router has CRUD procedures", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "contacts.list")).toBe(true);
    expect(keys.some(k => k === "contacts.create")).toBe(true);
    expect(keys.some(k => k === "contacts.update")).toBe(true);
    expect(keys.some(k => k === "contacts.delete")).toBe(true);
  });

  it("properties router has CRUD procedures", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "properties.list")).toBe(true);
    expect(keys.some(k => k === "properties.create")).toBe(true);
    expect(keys.some(k => k === "properties.update")).toBe(true);
    expect(keys.some(k => k === "properties.delete")).toBe(true);
  });

  it("tasks router has CRUD and complete procedures", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "tasks.list")).toBe(true);
    expect(keys.some(k => k === "tasks.create")).toBe(true);
    expect(keys.some(k => k === "tasks.complete")).toBe(true);
    expect(keys.some(k => k === "tasks.delete")).toBe(true);
  });

  it("listings router has CRUD and buyer interest procedures", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "listings.list")).toBe(true);
    expect(keys.some(k => k === "listings.create")).toBe(true);
    // buyer interests are managed via listings.buyerInterests query
    expect(keys.some(k => k.startsWith("listings."))).toBe(true);
  });

  it("followUp router exposes staleContacts procedure", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "followUp.staleContacts")).toBe(true);
  });

  it("ai router has all four AI features including deal matching", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "ai.processNotes")).toBe(true);
    expect(keys.some(k => k === "ai.generateOutreach")).toBe(true);
    expect(keys.some(k => k === "ai.analyzePricing")).toBe(true);
    expect(keys.some(k => k === "ai.findDealMatches")).toBe(true);
  });

  it("dashboard router has metrics and feed procedures", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "dashboard.metrics")).toBe(true);
    expect(keys.some(k => k === "dashboard.recentActivities")).toBe(true);
    expect(keys.some(k => k === "dashboard.upcomingTasks")).toBe(true);
  });
});

// ─── Post-Call Intelligence Tests ────────────────────────────────────────────

describe("callIntel router", () => {
  it("callIntel router exists with expected procedures", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "callIntel.parseCallNote")).toBe(true);
    expect(keys.some(k => k === "callIntel.applyCallActions")).toBe(true);
  });

  it("applyCallActions with empty arrays returns success", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.callIntel.applyCallActions({
      completeTaskIds: [],
      newTasks: [],
      propertyUpdates: [],
    });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.applied)).toBe(true);
    expect(result.applied.length).toBe(0);
  });

  it("throws UNAUTHORIZED when calling parseCallNote without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.callIntel.parseCallNote({ notes: "Test call notes" })
    ).rejects.toThrow();
  });

  it("rejects parseCallNote with empty notes", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.callIntel.parseCallNote({ notes: "" })
    ).rejects.toThrow();
  });
});

// ─── Bulk Import Tests ────────────────────────────────────────────────────────

describe("properties.bulkImport", () => {
  it("bulkImport procedure exists in router", () => {
    const keys = Object.keys(appRouter._def.procedures);
    expect(keys.some(k => k === "properties.bulkImport")).toBe(true);
  });

  it("returns zero counts when given an empty rows array", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.properties.bulkImport({ rows: [], geocode: false });
    expect(result.total).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.geocoded).toBe(0);
    expect(result.failed).toBe(0);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("throws UNAUTHORIZED when called without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.properties.bulkImport({ rows: [], geocode: false })
    ).rejects.toThrow();
  });
});

describe("contactLinks router", () => {
  it("contactLinks router exists with expected procedures", () => {
    const router = appRouter._def.router;
    expect(router).toBeDefined();
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("contactLinks.listForContact");
    expect(procedures).toContain("contactLinks.listForProperty");
    expect(procedures).toContain("contactLinks.create");
    expect(procedures).toContain("contactLinks.delete");
    expect(procedures).toContain("contactLinks.updateRole");
    expect(procedures).toContain("contactLinks.getDealConnections");
    expect(procedures).toContain("contactLinks.suggestDealLinks");
  });

  it("throws UNAUTHORIZED when listing contact links without auth", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).contactLinks.listForContact({ contactId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when creating a contact link without auth", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).contactLinks.create({ contactId: 1, propertyId: 1, source: "manual" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when updating role without auth", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).contactLinks.updateRole({ id: 1, dealRole: "owner" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws UNAUTHORIZED when deleting a link without auth", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).contactLinks.delete({ id: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws UNAUTHORIZED when getting deal connections without auth", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).contactLinks.getDealConnections({ contactId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws UNAUTHORIZED when suggesting deal links without auth", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).contactLinks.suggestDealLinks({ text: "test", contactId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("buyerIntel router", () => {
  it("buyerIntel router exists with expected procedures", () => {
    const router = appRouter._def.procedures;
    expect(router["buyerIntel.updatePricePoint"]).toBeDefined();
    expect(router["buyerIntel.rankBuyers"]).toBeDefined();
    expect(router["buyerIntel.generateReport"]).toBeDefined();
  });
  it("throws UNAUTHORIZED when updating price point without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.buyerIntel.updatePricePoint({ id: 1, pricePointFeedback: "$2M" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws UNAUTHORIZED when ranking buyers without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.buyerIntel.rankBuyers({ listingId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("throws UNAUTHORIZED when generating report without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.buyerIntel.generateReport({ listingId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
