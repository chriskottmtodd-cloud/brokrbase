/**
 * Remote MCP server so the Claude app can work a user's CRM data.
 * Each user gets a private link from Settings: /mcp/<secret>. Only the
 * SHA-256 of the secret is stored, so the link is shown once.
 */
import { createHash, randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getUserByMcpTokenHash } from "../db";
import { registerBrokrbaseTools } from "../mcp/tools";

export function generateMcpToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Resolves the user id for a link secret, or null if it isn't valid. */
export async function authenticateMcpToken(token: string | undefined): Promise<number | null> {
  if (!token || token.length < 32) return null;
  const user = await getUserByMcpTokenHash(hashMcpToken(token));
  return user?.id ?? null;
}

function buildServer(userId: number): McpServer {
  const server = new McpServer(
    { name: "brokrbase", version: "1.0.0" },
    {
      instructions:
        "Brokrbase is the user's commercial real estate CRM, usually used from a phone mid-day. " +
        "Rule: whenever the user says they met, called, emailed, texted, had coffee or lunch with, or otherwise talked to someone, log it as an activity in that person's history (log_activity for an existing contact, metThem on create_contact for a new one). Never just add it to contact notes. " +
        "Search before you write: look up contacts with search_contacts (pass the property if one was mentioned so the right person ranks first). " +
        "Don't make the user confirm routine logging. If search_contacts reports a clear best match, go ahead and write, then reply with the tool's one-line `confirmation` (who, what, which property) and invite a correction, e.g. \"Logged a call with John Smith (Acme) on Fairview. Let me know if it was a different John.\" " +
        "Only ask first when search_contacts flags a close call, or nothing matches. " +
        "If the user says something was wrong, fix it with update_activity or update_task; nothing can be deleted. " +
        "Business card photos: read the card and create_contact with every field you can fill. Lasting facts about the person (title, website, what they own) go in notes; the meeting itself (where, when, what was discussed) goes in metThem so it's logged as an activity in their history. " +
        "If the user mentions a building, search_properties for it and link_contact_to_property if it's there; if it isn't in the CRM, note it on the contact instead (you can't create properties).",
    },
  );
  registerBrokrbaseTools(server, userId);
  return server;
}

export function registerMcpRoutes(app: Express) {
  app.post("/mcp/:token", async (req: Request, res: Response) => {
    const userId = await authenticateMcpToken(req.params.token).catch(() => null);
    if (!userId) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "This Brokrbase link is invalid or was disconnected. Generate a new one in Settings." },
        id: null,
      });
      return;
    }
    // Stateless: a fresh server + transport per request
    const server = buildServer(userId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[mcp] request failed:", e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  // Stateless server: no SSE stream or session to delete
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  };
  app.get("/mcp/:token", methodNotAllowed);
  app.delete("/mcp/:token", methodNotAllowed);

  // The link itself is the credential, so there's no OAuth. Answer discovery
  // probes with a clean 404 instead of the SPA's index.html.
  app.get(["/.well-known/oauth-protected-resource*", "/.well-known/oauth-authorization-server*"], (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
}
