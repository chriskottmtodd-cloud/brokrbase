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
        "Brokrbase is the user's commercial real estate CRM. Search before you write: look up contacts and properties to get their ids. Confirm details with the user before logging activity, creating tasks, or changing contacts.",
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
