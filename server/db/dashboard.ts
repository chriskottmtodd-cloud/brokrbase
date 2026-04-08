import { and, desc, eq, lte, sql } from "drizzle-orm";
import {
  activities,
  contacts,
  notifications,
  properties,
  tasks,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getDashboardMetrics(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalProperties,
    totalContacts,
    pendingTasks,
    urgentTasks,
    recentActivities,
    unreadNotifications,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(properties).where(eq(properties.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(contacts).where(eq(contacts.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "pending"))),
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "pending"), lte(tasks.dueAt, tomorrow))),
    db.select().from(activities).where(eq(activities.userId, userId)).orderBy(desc(activities.occurredAt)).limit(5),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
  ]);

  return {
    totalProperties: totalProperties[0]?.count ?? 0,
    totalContacts: totalContacts[0]?.count ?? 0,
    pendingTasks: pendingTasks[0]?.count ?? 0,
    urgentTasks: urgentTasks[0]?.count ?? 0,
    recentActivities,
    unreadNotifications: unreadNotifications[0]?.count ?? 0,
  };
}

/** Tasks due today or within the next 7 days, pending only */
export async function getDueSoonTasks(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      status: tasks.status,
      contactId: tasks.contactId,
      propertyId: tasks.propertyId,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "pending"),
        lte(tasks.dueAt, sevenDaysOut),
      )
    )
    .orderBy(tasks.dueAt)
    .limit(20);
}

/** Count of contacts overdue for follow-up (nextFollowUpAt < now) */
export async function getOverdueContactsCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        lte(contacts.nextFollowUpAt, now),
      )
    );
  return rows[0]?.count ?? 0;
}
