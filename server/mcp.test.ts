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

const contacts = [
  { id: 1, userId: 1, firstName: "Mike", lastName: "Jones", company: "Acme", email: null, phone: null, priority: "warm", lastContactedAt: null },
  { id: 2, userId: 2, firstName: "Other", lastName: "Person", company: null, email: null, phone: null, priority: "warm", lastContactedAt: null },
];
const tasks = [
  { id: 10, userId: 1, title: "Call Mike", type: "call", status: "pending", contactId: 1, propertyId: null, dueAt: null, completedAt: null },
  { id: 20, userId: 2, title: "Not yours", type: "call", status: "pending", contactId: 2, propertyId: null, dueAt: null, completedAt: null },
];
const createdActivities: unknown[] = [];

vi.mock("./db", () => ({
  getUserByMcpTokenHash: vi.fn(async (hash: string) => (hash === tokenHashForUser1 ? { id: 1 } : undefined)),
  getContactById: vi.fn(async (id: number, userId: number) => contacts.find((c) => c.id === id && c.userId === userId)),
  getContacts: vi.fn(async (userId: number) => contacts.filter((c) => c.userId === userId)),
  getContactPropertyLinks: vi.fn(async () => []),
  getActivities: vi.fn(async () => []),
  getTasks: vi.fn(async (userId: number) => tasks.filter((t) => t.userId === userId)),
  getTaskById: vi.fn(async (id: number, userId: number) => tasks.find((t) => t.id === id && t.userId === userId)),
  completeTaskWithLog: vi.fn(async () => ({ activityLogged: true })),
  createActivity: vi.fn(async (data: unknown) => { createdActivities.push(data); }),
  getPropertyById: vi.fn(async () => undefined),
  getProperties: vi.fn(async () => []),
  getContactsForProperty: vi.fn(async () => []),
  getActivitiesForProperty: vi.fn(async () => []),
  createTask: vi.fn(),
  createContact: vi.fn(),
  findSimilarContacts: vi.fn(async () => []),
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
