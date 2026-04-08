import { and, eq, sql } from "drizzle-orm";
import { contacts } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getStaleContacts(
  userId: number,
  thresholds: { hot: number; warm: number; cold: number; inactive: number },
  filters?: { isOwner?: boolean; isBuyer?: boolean; showSnoozed?: boolean }
) {
  const db = await getDb();
  if (!db) return { overdue: [], snoozed: [] };

  // Get all contacts matching the role filter
  const conditions = [eq(contacts.userId, userId)];
  if (filters?.isOwner && !filters?.isBuyer) conditions.push(eq(contacts.isOwner, true));
  if (filters?.isBuyer && !filters?.isOwner) conditions.push(eq(contacts.isBuyer, true));
  if (filters?.isOwner && filters?.isBuyer) {
    conditions.push(sql`(${contacts.isOwner} = 1 OR ${contacts.isBuyer} = 1)`);
  }

  const allContacts = await db
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(contacts.lastContactedAt);

  const now = new Date();

  // Separate snoozed contacts (snooze still active)
  const snoozedContacts = allContacts
    .filter(c => c.snoozedUntil && new Date(c.snoozedUntil) > now)
    .map(c => ({
      ...c,
      snoozedUntilDate: c.snoozedUntil,
      daysUntilUnsnooze: Math.ceil((new Date(c.snoozedUntil!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }));

  // Active (non-snoozed) contacts for overdue check
  const activeContacts = allContacts.filter(c => !c.snoozedUntil || new Date(c.snoozedUntil) <= now);

  // For each active contact, determine if they are overdue based on priority threshold
  const stale = activeContacts
    .map(contact => {
      const threshold =
        contact.priority === "hot" ? thresholds.hot :
        contact.priority === "warm" ? thresholds.warm :
        contact.priority === "cold" ? thresholds.cold :
        thresholds.inactive;

      const lastAttempt = contact.lastContactedAt;
      const daysSince = lastAttempt
        ? Math.floor((now.getTime() - new Date(lastAttempt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const isOverdue = daysSince === null || daysSince >= threshold;

      return {
        ...contact,
        daysSince,
        threshold,
        isOverdue,
        neverContacted: daysSince === null,
        daysOverdue: daysSince === null ? null : Math.max(0, daysSince - threshold),
      };
    })
    .filter(c => c.isOverdue)
    .sort((a, b) => {
      if (a.neverContacted && !b.neverContacted) return -1;
      if (!a.neverContacted && b.neverContacted) return 1;
      return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
    });

  return { overdue: stale, snoozed: snoozedContacts };
}

export async function snoozeContact(id: number, userId: number, days: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + days);
  await db.update(contacts).set({ snoozedUntil }).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
  return { snoozedUntil };
}

export async function unsnoozeContact(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(contacts).set({ snoozedUntil: null }).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
  return { success: true };
}
