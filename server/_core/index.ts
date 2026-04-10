import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerPasswordAuthRoutes } from "../passwordAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db/connection";
import { sql } from "drizzle-orm";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/** Ensure new columns exist — safe to run repeatedly */
async function runSelfHealingMigrations() {
  try {
    const db = await getDb();
    if (!db) return;
    const cols = await db.execute(sql`SHOW COLUMNS FROM users LIKE 'preferences'`);
    if ((cols as unknown as unknown[]).length === 0) {
      await db.execute(sql`ALTER TABLE users ADD COLUMN preferences TEXT`);
      console.log("[migration] Added preferences column to users");
    }
  } catch (e) {
    console.warn("[migration] Self-healing migration warning:", e);
  }
}

async function startServer() {
  await runSelfHealingMigrations();
  const app = express();
  // Railway / Render / Fly etc. sit behind a reverse proxy — trust it so
  // req.ip, req.protocol and req.hostname read the forwarded headers.
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Simple email/password login (alternative to OAuth)
  registerPasswordAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
