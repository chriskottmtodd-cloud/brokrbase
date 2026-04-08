/**
 * Email/password authentication.
 * Supports multiple users:
 *   1. DB-based users (users table with passwordHash column)
 *   2. Env-var admin fallback (ADMIN_EMAIL + ADMIN_PASSWORD_HASH)
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

// ─── Simple in-memory rate limiter for login attempts ────────────────────────
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.lastAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return false;
  }
  record.count++;
  record.lastAttempt = now;
  return record.count > MAX_ATTEMPTS;
}

function clearRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

export function registerPasswordAuthRoutes(app: Express) {
  // ─── Self-service registration ────────────────────────────────────────────
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    // Check if email already exists
    const existing = await db.getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.createUserWithPassword({
      name,
      email,
      passwordHash,
    });

    res.json({ ok: true });
  });

  // ─── Login ────────────────────────────────────────────────────────────────
  app.post("/api/auth/password-login", async (req: Request, res: Response) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (isRateLimited(ip)) {
      res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
      return;
    }

    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    // ─── Try DB-based user first ──────────────────────────────────────────
    const dbUser = await db.getUserByEmail(email);
    if (dbUser?.passwordHash) {
      const match = await bcrypt.compare(password, dbUser.passwordHash);
      if (!match) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      clearRateLimit(ip);

      await db.upsertUser({
        openId: dbUser.openId,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(dbUser.openId, {
        name: dbUser.name ?? "User",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ ok: true });
      return;
    }

    // ─── Fall back to env-var admin ───────────────────────────────────────
    if (!ENV.adminEmail || !ENV.adminPasswordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!ENV.adminPasswordHash.startsWith("$2")) {
      console.error("ADMIN_PASSWORD_HASH must be a bcrypt hash.");
      res.status(503).json({ error: "Password login is misconfigured" });
      return;
    }

    const emailMatch = email.trim().toLowerCase() === ENV.adminEmail.trim().toLowerCase();
    const passwordMatch = await bcrypt.compare(password, ENV.adminPasswordHash);

    if (!emailMatch || !passwordMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    clearRateLimit(ip);

    const existingUser = await db.getUserByEmail(ENV.adminEmail);
    const ownerOpenId = existingUser?.openId
      || ENV.ownerOpenId
      || `local-admin-${ENV.adminEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

    await db.upsertUser({
      openId: ownerOpenId,
      name: existingUser?.name ?? process.env.OWNER_NAME ?? "Owner",
      email: ENV.adminEmail,
      loginMethod: "password",
      lastSignedIn: new Date(),
      role: "admin",
    });

    const sessionToken = await sdk.createSessionToken(ownerOpenId, {
      name: existingUser?.name ?? process.env.OWNER_NAME ?? "Owner",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ ok: true });
  });
}
