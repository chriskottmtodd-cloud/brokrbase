import { and, desc, eq, sql } from "drizzle-orm";
import { InsertNotification, notifications } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getNotifications(userId: number, unreadOnly = false) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const conditions = [eq(notifications.userId, userId)];
  if (unreadOnly) conditions.push(eq(notifications.isRead, false));
  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function markNotificationsRead(userId: number, ids?: number[]) {
  const db = await getDb();
  if (!db) return;
  const conditions = [eq(notifications.userId, userId)];
  if (ids && ids.length > 0) {
    conditions.push(sql`${notifications.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  }
  await db.update(notifications).set({ isRead: true }).where(and(...conditions));
}
