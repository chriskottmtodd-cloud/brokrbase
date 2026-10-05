import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Tests for the "Connect to Claude" MCP server. The DB layer is replaced
 * with a tiny in-memory fake that scopes rows by userId like the real one.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const contacts = [
  { id: 1, userId: 1, firstName: "Mike", lastName: "Jones", company: "Acme", email: null, phone: null, priority: "warm", lastContactedAt: null },
  { id: 2, userId: 2, firstName: "Other", lastName: "Person", company: null, email: null, phone: null, priority: "warm", lastContactedAt: null },
  { id: 3, userId: 1, firstName: "John", lastName: "Smith", company: "Acme", email: null, phone: null, priority: "warm", lastContactedAt: daysAgo(200) },
  { id: 4, userId: 1, firstName: "John", lastName: "Peters", company: null, email: null, phone: null, priority: "warm", lastContactedAt: daysAgo(200) },
  { id: 5, userId: 1, firstName: "Johnny", lastName: "Cash", company: null, email: null, phone: null, priority: "warm", lastContactedAt: daysAgo(1) },
];
const fairview = { id: 100, userId: 1, name: "Fairview Apartments" };
const activities = [{ id: 500, userId: 1, type: "call", contactId: 3, propertyId: null }];
const recomputed: number[] = [];
const createdContacts: unknown[] = [];
const tasks = [
  { id: 10, userId: 1, title: "Call Mike", type: "call", status: "pending", contactId: 1, propertyId: null, dueAt: null, completedAt: null },
  { id: 20, userId: 2, title: "Not yours", type: "call", status: "pending", contactId: 2, propertyId: null, dueAt: null, completedAt: null },
];
const createdActivities: unknown[] = [];

vi.mock("./db", () => ({
  getUserByMcpTokenHash: vi.fn(async (hash: string) => (hash === tokenHashForUser1 ? { id: 1 } : undefined)),
  getContactById: vi.fn(async (id: number, userId: number) => contacts.find((c) => c.id === id && c.userId === userId)),
  getContacts: vi.fn(async (userId: number, f?: { search?: string }) =>
    contacts.filter((c) => c.userId === userId && (!f?.search || `${c.firstName} ${c.lastName}`.toLowerCase().includes(f.search.toLowerCase())))),
  getContactPropertyLinks: vi.fn(async () => []),
  getActivities: vi.fn(async () => []),
  getTasks: vi.fn(async (userId: number) => tasks.filter((t) => t.userId === userId)),
  getTaskById: vi.fn(async (id: number, userId: number) => tasks.find((t) => t.id === id && t.userId === userId)),
  completeTaskWithLog: vi.fn(async () => ({ activityLogged: true })),
  createActivity: vi.fn(async (data: unknown) => { createdActivities.push(data); return [{ insertId: 777 }]; }),
  getPropertyById: vi.fn(async (id: number, userId: number) => (id === fairview.id && userId === fairview.userId ? fairview : undefined)),
  getProperties: vi.fn(async (userId: number, f?: { search?: string }) =>
    userId === 1 && f?.search && fairview.name.toLowerCase().includes(f.search.toLowerCase()) ? [fairview] : []),
  getContactsForProperty: vi.fn(async (propertyId: number) => (propertyId === fairview.id ? [{ contactId: 4, dealRole: "owner" }] : [])),
  getActivityDetail: vi.fn(async (id: number, userId: number) => {
    const activity = activities.find((a) => a.id === id && a.userId === userId);
    return activity ? { activity } : null;
  }),
  updateActivity: vi.fn(),
  updateTask: vi.fn(),
  recomputeContactLastContacted: vi.fn(async (id: number) => { recomputed.push(id); }),
  getActivitiesForProperty: vi.fn(async () => []),
  createTask: vi.fn(),
  createContact: vi.fn(async (data: unknown) => { createdContacts.push(data); return { insertId: 900 }; }),
  findSimilarContacts: vi.fn(async (_userId: number, c: { firstName: string; lastName?: string }) =>
    c.firstName === "Mike" && c.lastName === "Jones" ? [{ id: 1, firstName: "Mike", lastName: "Jones" }] : []),
  updateContact: vi.fn(),
  createContactPropertyLink: vi.fn(),
}));
vi.mock("./_core/entityResolution", () => ({
  resolveContactMention: vi.fn(async () => ({ id: null, topCandidates: [] })),
}));

let tokenHashForUser1 = "";

const { generateMcpToken, hashMcpToken, authenticateMcpToken, registerMcpRoutes } = await import("./_core/mcp");
const { registerBrokrbaseTools } = await import("./mcp/tools");

async function clientFor(userId: number) {
  const server = new McpServer({ name: "test", version: "0" });
  registerBrokrbaseTools(server, userId);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test-client", version: "0" });
  await client.connect(b);
  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>) {
  return (result.content as { text: string }[])[0].text;
}

describe("MCP link tokens", () => {
  it("generates long, unique, URL-safe tokens", () => {
    const a = generateMcpToken();
    const b = generateMcpToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically to 64 hex chars", () => {
    expect(hashMcpToken("abc")).toBe(hashMcpToken("abc"));
    expect(hashMcpToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("authenticates a valid token and rejects bad ones", async () => {
    const token = generateMcpToken();
    tokenHashForUser1 = hashMcpToken(token);
    expect(await authenticateMcpToken(token)).toBe(1);
    expect(await authenticateMcpToken(generateMcpToken())).toBeNull();
    expect(await authenticateMcpToken("short")).toBeNull();
    expect(await authenticateMcpToken(undefined)).toBeNull();
  });
});

describe("MCP HTTP endpoint", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("returns 401 for an unknown link", async () => {
    const res = await fetch(`${base}/mcp/${generateMcpToken()}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("serves tools/list for a valid link", async () => {
    const token = generateMcpToken();
    tokenHashForUser1 = hashMcpToken(token);
    const res = await fetch(`${base}/mcp/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("search_contacts");
  });
});

describe("MCP tools stay inside the user's own data", () => {
  it("lists only the user's tasks", async () => {
    const client = await clientFor(1);
    const out = text(await client.callTool({ name: "list_tasks", arguments: { filter: "open" } }));
    expect(out).toContain("Call Mike");
    expect(out).not.toContain("Not yours");
  });

  it("can't read another user's contact", async () => {
    const client = await clientFor(1);
    const result = await client.callTool({ name: "get_contact", arguments: { contactId: 2 } });
    expect(result.isError).toBe(true);
  });

  it("can't complete another user's task", async () => {
    const client = await clientFor(1);
    const result = await client.callTool({ name: "complete_task", arguments: { taskId: 20 } });
    expect(result.isError).toBe(true);
  });

  it("can't log activity against another user's contact", async () => {
    const client = await clientFor(1);
    const result = await client.callTool({ name: "log_activity", arguments: { type: "call", contactId: 2, subject: "x" } });
    expect(result.isError).toBe(true);
    expect(createdActivities).toHaveLength(0);
  });

  it("logs activity for the user's own contact", async () => {
    const client = await clientFor(1);
    const result = await client.callTool({ name: "log_activity", arguments: { type: "call", contactId: 1, subject: "Talked about Fairview" } });
    expect(result.isError).toBeFalsy();
    expect(createdActivities).toEqual([expect.objectContaining({ userId: 1, contactId: 1, type: "call" })]);
  });
});

describe("Picking the right person", () => {
  it("flags two equally likely Johns as a close call", async () => {
    const client = await clientFor(1);
    const out = JSON.parse(text(await client.callTool({ name: "search_contacts", arguments: { query: "John" } })));
    expect(out.clearBestMatch).toBe(false);
    expect(out.guidance).toMatch(/Ask the user/);
  });

  it("ranks the John linked to the mentioned property first", async () => {
    const client = await clientFor(1);
    const out = JSON.parse(text(await client.callTool({ name: "search_contacts", arguments: { query: "John", property: "Fairview" } })));
    expect(out.clearBestMatch).toBe(true);
    expect(out.contacts[0].name).toBe("John Peters");
    expect(out.contacts[0].whyRanked[0]).toBe("owner at Fairview Apartments");
  });

  it("ranks exact first-name matches above partial ones like Johnny", async () => {
    const client = await clientFor(1);
    const out = JSON.parse(text(await client.callTool({ name: "search_contacts", arguments: { query: "John" } })));
    expect(out.contacts.at(-1).name).toBe("Johnny Cash");
  });

  it("says who it logged to", async () => {
    const client = await clientFor(1);
    const out = JSON.parse(text(await client.callTool({ name: "log_activity", arguments: { type: "call", contactId: 3, propertyId: 100, subject: "Pricing" } })));
    expect(out.confirmation).toBe('Logged a call with John Smith (Acme) on Fairview Apartments: "Pricing".');
    expect(out.activityId).toBe(777);
  });
});

describe("Fixing mistakes", () => {
  it("moves an activity to the other John and resets both contacts' last-contacted dates", async () => {
    const client = await clientFor(1);
    const result = await client.callTool({ name: "update_activity", arguments: { activityId: 500, contactId: 4 } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result)).confirmation).toBe("Updated the call with John Peters.");
    expect(recomputed.sort()).toEqual([3, 4]);
  });

  it("can't move an activity onto another user's contact", async () => {
    const client = await clientFor(1);
    const result = await client.callTool({ name: "update_activity", arguments: { activityId: 500, contactId: 2 } });
    expect(result.isError).toBe(true);
  });

  it("can't edit another user's task", async () => {
    const client = await clientFor(1);
    const result = await client.callTool({ name: "update_task", arguments: { taskId: 20, title: "hijack" } });
    expect(result.isError).toBe(true);
  });

  it("reschedules and reopens a task", async () => {
    const client = await clientFor(1);
    const out = JSON.parse(text(await client.callTool({ name: "update_task", arguments: { taskId: 10, dueDate: "2026-10-13", reopen: true } })));
    expect(out.confirmation).toBe('Updated task "Call Mike" (reopened), now due 2026-10-13.');
  });
});

describe("Business cards and new people", () => {
  it("creates the contact and logs the meeting in their history in one step", async () => {
    createdActivities.length = 0;
    const client = await clientFor(1);
    const out = JSON.parse(text(await client.callTool({
      name: "create_contact",
      arguments: {
        firstName: "Jane", lastName: "Doe", company: "Doe Holdings", phone: "208-555-0100",
        isOwner: true, notes: "VP Acquisitions\nOwns the strip center on Fairview Ave",
        metThem: { summary: "Coffee at Flying M", details: "Thinking about selling next year" },
      },
    })));
    expect(out.confirmation).toBe("Added Jane Doe (Doe Holdings) as a new contact, with notes and logged the meeting in their history.");
    expect(createdContacts.at(-1)).toEqual(expect.objectContaining({ userId: 1, isOwner: true, notes: expect.stringContaining("Fairview") }));
    expect(createdActivities).toEqual([expect.objectContaining({ userId: 1, contactId: 900, type: "meeting", subject: "Coffee at Flying M" })]);
  });

  it("stops on a likely duplicate and points Claude to logging on the existing contact", async () => {
    createdActivities.length = 0;
    const client = await clientFor(1);
    const out = JSON.parse(text(await client.callTool({
      name: "create_contact",
      arguments: { firstName: "Mike", lastName: "Jones", metThem: { summary: "Lunch" } },
    })));
    expect(out.created).toBe(false);
    expect(out.note).toMatch(/log_activity/);
    expect(createdActivities).toHaveLength(0);
  });
});
