import { eq, sql } from "drizzle-orm";
import { InsertUser, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "./connection";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${email.trim()})`)
    .orderBy(users.id)
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    lastSignedIn: users.lastSignedIn,
    createdAt: users.createdAt,
  }).from(users).orderBy(users.id);
}

export async function createUserWithPassword(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: "user" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const openId = `local-user-${data.email.trim().toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  await db.insert(users).values({
    openId,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "password",
    role: data.role ?? "user",
    lastSignedIn: new Date(),
  });
  return getUserByEmail(data.email);
}

export async function updateUserProfile(
  id: number,
  data: {
    name?: string | null;
    company?: string | null;
    title?: string | null;
    phone?: string | null;
    marketFocus?: string | null;
    signature?: string | null;
    voiceNotes?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set(data).where(eq(users.id, id));
}
