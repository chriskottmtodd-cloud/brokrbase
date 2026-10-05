import { and, desc, eq, lte } from "drizzle-orm";
import { InsertTask, Task, tasks } from "../../drizzle/schema";
import { getDb } from "./connection";
import { createActivity } from "./activities";

export async function getTasks(userId: number, filters?: {
  status?: string;
  priority?: string;
  contactId?: number;
  propertyId?: number;
  dueToday?: boolean;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const conditions = [eq(tasks.userId, userId)];
  if (filters?.status) conditions.push(eq(tasks.status, filters.status as Task["status"]));
  if (filters?.priority) conditions.push(eq(tasks.priority, filters.priority as Task["priority"]));
  if (filters?.contactId) conditions.push(eq(tasks.contactId, filters.contactId));
  if (filters?.propertyId) conditions.push(eq(tasks.propertyId, filters.propertyId));
  if (filters?.dueToday) {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    conditions.push(lte(tasks.dueAt, endOfDay));
  }
  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(tasks.dueAt, desc(tasks.createdAt))
    .limit(filters?.limit ?? 100);
}

export async function createTask(data: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(tasks).values(data);
}

export async function updateTask(id: number, userId: number, data: Partial<InsertTask>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tasks).set(data).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
}

export async function deleteTask(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
}

export async function getTaskById(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  return result[0];
}

const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "text", "voicemail"] as const;

/**
 * Complete a task and, if it has a contact, log an activity in their history.
 * Server-side twin of handleComplete() in client/src/pages/Tasks.tsx.
 */
export async function completeTaskWithLog(task: Task, userId: number, note?: string) {
  await updateTask(task.id, userId, { status: "completed", completedAt: new Date() });
  if (!task.contactId) return { activityLogged: false };
  const type = (ACTIVITY_TYPES as readonly string[]).includes(task.type)
    ? (task.type as (typeof ACTIVITY_TYPES)[number])
    : "note";
  await createActivity({
    userId,
    type,
    contactId: task.contactId,
    propertyId: task.propertyId ?? undefined,
    subject: task.title,
    notes: note ?? null,
    outcome: "follow_up",
  });
  return { activityLogged: true };
}
