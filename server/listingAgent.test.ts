/**
 * Tests for listingAgent router — knowledge add/list/delete and chat saveMessage/history.
 * The DB is mocked so no real database is required.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── In-memory stores ─────────────────────────────────────────────────────────
type KbRow = {
  id: number; userId: number; listingId: number;
  title: string; content: string; createdAt: Date; updatedAt: Date;
};
type ChatRow = {
  id: number; userId: number; listingId: number;
  role: "user" | "assistant"; content: string; createdAt: Date;
};

const kbStore: KbRow[]   = [];
const chatStore: ChatRow[] = [];
let kbSeq   = 1;
let chatSeq = 1;

// ─── Mock getDb ───────────────────────────────────────────────────────────────
// We identify tables by the symbol key "Symbol(drizzle:Name)" that Drizzle attaches.
function tableName(table: object): string {
  const sym = Object.getOwnPropertySymbols(table).find((s) => s.toString().includes("drizzle:Name"));
  return sym ? String((table as Record<symbol, unknown>)[sym]) : "";
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => {
    const mockDb = {
      select: () => ({
        from: (table: object) => ({
          where: (_cond: unknown) => ({
            // list queries use orderBy
            orderBy: (_ord: unknown): Promise<KbRow[] | ChatRow[]> => {
              const name = tableName(table);
              if (name === "listing_knowledge")    return Promise.resolve([...kbStore]);
              if (name === "listing_chat_messages") return Promise.resolve([...chatStore]);
              return Promise.resolve([]);
            },
            // fetch-by-id queries (no orderBy) — return the matching row
            then: (resolve: (v: KbRow[] | ChatRow[]) => void) => {
              const name = tableName(table);
              if (name === "listing_knowledge")    resolve([...kbStore]);
              if (name === "listing_chat_messages") resolve([...chatStore]);
              else resolve([]);
            },
          }),
        }),
      }),
      insert: (table: object) => ({
        values: (data: Record<string, unknown>): Promise<[[{ insertId: number }]]> => {
          const name = tableName(table);
          if (name === "listing_knowledge") {
            const row: KbRow = { id: kbSeq++, createdAt: new Date(), updatedAt: new Date(), ...data } as KbRow;
            kbStore.push(row);
            return Promise.resolve([[{ insertId: row.id }]]);
          }
          if (name === "listing_chat_messages") {
            const row: ChatRow = { id: chatSeq++, createdAt: new Date(), ...data } as ChatRow;
            chatStore.push(row);
            return Promise.resolve([[{ insertId: row.id }]]);
          }
          return Promise.resolve([[{ insertId: 0 }]]);
        },
      }),
      delete: (_table: object) => ({
        where: (_cond: unknown) => Promise.resolve(),
      }),
    };
    return mockDb;
  }),
}));

// ─── Import router AFTER mock is set up ──────────────────────────────────────
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(userId = 1): TrpcContext {
  const user = {
    id: userId,
    openId: `user-${userId}`,
    email: `user${userId}@test.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Knowledge tests ──────────────────────────────────────────────────────────
describe("listingAgent.knowledge", () => {
  beforeEach(() => {
    kbStore.length = 0;
    kbSeq = 1;
  });

  it("add: inserts an entry and returns it with correct fields", async () => {
    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.listingAgent.knowledge.add({
      listingId: 10,
      title:     "T12 Summary",
      content:   "NOI is $180k, occupancy 94%",
    });
    expect(result.title).toBe("T12 Summary");
    expect(result.content).toBe("NOI is $180k, occupancy 94%");
    expect(result.listingId).toBe(10);
    expect(result.userId).toBe(1);
    expect(typeof result.id).toBe("number");
  });

  it("list: returns all entries for a listing", async () => {
    const caller = appRouter.createCaller(makeCtx(1));
    await caller.listingAgent.knowledge.add({ listingId: 10, title: "Entry A", content: "A" });
    await caller.listingAgent.knowledge.add({ listingId: 10, title: "Entry B", content: "B" });

    const list = await caller.listingAgent.knowledge.list({ listingId: 10 });
    expect(list.length).toBe(2);
    expect(list[0]?.title).toBe("Entry A");
    expect(list[1]?.title).toBe("Entry B");
  });

  it("delete: removes an entry owned by the user", async () => {
    const caller = appRouter.createCaller(makeCtx(1));
    const added  = await caller.listingAgent.knowledge.add({ listingId: 10, title: "To Delete", content: "bye" });
    const result = await caller.listingAgent.knowledge.delete({ id: added.id });
    expect(result.success).toBe(true);
  });

  it("delete: throws FORBIDDEN when a different user tries to delete", async () => {
    const caller1 = appRouter.createCaller(makeCtx(1));
    const added   = await caller1.listingAgent.knowledge.add({ listingId: 10, title: "Protected", content: "secret" });

    const caller2 = appRouter.createCaller(makeCtx(2));
    await expect(caller2.listingAgent.knowledge.delete({ id: added.id })).rejects.toThrow(TRPCError);
  });
});

// ─── Chat tests ───────────────────────────────────────────────────────────────
describe("listingAgent.chat", () => {
  beforeEach(() => {
    chatStore.length = 0;
    chatSeq = 1;
  });

  it("saveMessage: persists a user message and returns it", async () => {
    const caller = appRouter.createCaller(makeCtx(1));
    const msg = await caller.listingAgent.chat.saveMessage({
      listingId: 5,
      role:      "user",
      content:   "What is the cap rate?",
    });
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("What is the cap rate?");
    expect(msg.listingId).toBe(5);
    expect(msg.userId).toBe(1);
  });

  it("saveMessage: persists an assistant message", async () => {
    const caller = appRouter.createCaller(makeCtx(1));
    const msg = await caller.listingAgent.chat.saveMessage({
      listingId: 5,
      role:      "assistant",
      content:   "The cap rate is 5.8%.",
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("The cap rate is 5.8%.");
  });

  it("history: returns messages in insertion order", async () => {
    const caller = appRouter.createCaller(makeCtx(1));
    await caller.listingAgent.chat.saveMessage({ listingId: 5, role: "user",      content: "First" });
    await caller.listingAgent.chat.saveMessage({ listingId: 5, role: "assistant", content: "Second" });

    const history = await caller.listingAgent.chat.history({ listingId: 5 });
    expect(history.length).toBe(2);
    expect(history[0]?.role).toBe("user");
    expect(history[0]?.content).toBe("First");
    expect(history[1]?.role).toBe("assistant");
    expect(history[1]?.content).toBe("Second");
  });
});
