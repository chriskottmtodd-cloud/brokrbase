import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  Activity,
  InsertActivity,
  activities,
  activityLinks,
  contacts,
  properties,
  listings,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getActivities(userId: number, filters?: {
  contactId?: number;
  propertyId?: number;
  listingId?: number;
  type?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // EXACT original implementation — no multi-link logic. We'll re-add
  // multi-link support in a separate code path once we confirm this works.
  const conditions = [eq(activities.userId, userId)];
  if (filters?.contactId) conditions.push(eq(activities.contactId, filters.contactId));
  if (filters?.propertyId) conditions.push(eq(activities.propertyId, filters.propertyId));
  if (filters?.listingId) conditions.push(eq(activities.listingId, filters.listingId));
  if (filters?.type) conditions.push(eq(activities.type, filters.type as Activity["type"]));
  return db
    .select()
    .from(activities)
    .where(and(...conditions))
    .orderBy(desc(activities.occurredAt))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);
}

// ─── Activity detail + multi-link management ───────────────────────────
export async function getActivityDetail(activityId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);
  const activity = rows[0];
  if (!activity) return null;

  // The activity_links table may not yet exist in some environments —
  // tolerate the missing-table error so the modal still loads.
  let links: Array<typeof activityLinks.$inferSelect> = [];
  try {
    links = await db
      .select()
      .from(activityLinks)
      .where(and(eq(activityLinks.activityId, activityId), eq(activityLinks.userId, userId)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(msg)) throw err;
  }

  // Resolve names for primary + linked entities
  const contactIds = new Set<number>();
  const propertyIds = new Set<number>();
  const listingIds = new Set<number>();
  if (activity.contactId) contactIds.add(activity.contactId);
  if (activity.propertyId) propertyIds.add(activity.propertyId);
  if (activity.listingId) listingIds.add(activity.listingId);
  for (const l of links) {
    if (l.contactId) contactIds.add(l.contactId);
    if (l.propertyId) propertyIds.add(l.propertyId);
    if (l.listingId) listingIds.add(l.listingId);
  }

  const [contactRows, propertyRows, listingRows] = await Promise.all([
    contactIds.size
      ? db
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company })
          .from(contacts)
          .where(and(eq(contacts.userId, userId), inArray(contacts.id, Array.from(contactIds))))
      : Promise.resolve([] as Array<{ id: number; firstName: string; lastName: string; company: string | null }>),
    propertyIds.size
      ? db
          .select({ id: properties.id, name: properties.name, city: properties.city })
          .from(properties)
          .where(and(eq(properties.userId, userId), inArray(properties.id, Array.from(propertyIds))))
      : Promise.resolve([] as Array<{ id: number; name: string; city: string | null }>),
    listingIds.size
      ? db
          .select({ id: listings.id, title: listings.title })
          .from(listings)
          .where(and(eq(listings.userId, userId), inArray(listings.id, Array.from(listingIds))))
      : Promise.resolve([] as Array<{ id: number; title: string }>),
  ]);

  const contactMap = new Map(contactRows.map((c) => [c.id, c]));
  const propertyMap = new Map(propertyRows.map((p) => [p.id, p]));
  const listingMap = new Map(listingRows.map((l) => [l.id, l]));

  // Build a unified linked list — primary first, then extras
  const linkedContacts: Array<{ linkId: number | null; id: number; name: string; company: string | null; isPrimary: boolean }> = [];
  const linkedProperties: Array<{ linkId: number | null; id: number; name: string; city: string | null; isPrimary: boolean }> = [];
  const linkedListings: Array<{ linkId: number | null; id: number; title: string; isPrimary: boolean }> = [];

  if (activity.contactId && contactMap.has(activity.contactId)) {
    const c = contactMap.get(activity.contactId)!;
    linkedContacts.push({ linkId: null, id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), company: c.company, isPrimary: true });
  }
  if (activity.propertyId && propertyMap.has(activity.propertyId)) {
    const p = propertyMap.get(activity.propertyId)!;
    linkedProperties.push({ linkId: null, id: p.id, name: p.name, city: p.city, isPrimary: true });
  }
  if (activity.listingId && listingMap.has(activity.listingId)) {
    const l = listingMap.get(activity.listingId)!;
    linkedListings.push({ linkId: null, id: l.id, title: l.title, isPrimary: true });
  }

  for (const link of links) {
    if (link.contactId && contactMap.has(link.contactId) && link.contactId !== activity.contactId) {
      const c = contactMap.get(link.contactId)!;
      linkedContacts.push({ linkId: link.id, id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), company: c.company, isPrimary: false });
    }
    if (link.propertyId && propertyMap.has(link.propertyId) && link.propertyId !== activity.propertyId) {
      const p = propertyMap.get(link.propertyId)!;
      linkedProperties.push({ linkId: link.id, id: p.id, name: p.name, city: p.city, isPrimary: false });
    }
    if (link.listingId && listingMap.has(link.listingId) && link.listingId !== activity.listingId) {
      const l = listingMap.get(link.listingId)!;
      linkedListings.push({ linkId: link.id, id: l.id, title: l.title, isPrimary: false });
    }
  }

  return { activity, linkedContacts, linkedProperties, linkedListings };
}

export async function addActivityLink(data: {
  activityId: number;
  userId: number;
  contactId?: number;
  propertyId?: number;
  listingId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Verify the activity belongs to this user
  const owns = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, data.activityId), eq(activities.userId, data.userId)))
    .limit(1);
  if (owns.length === 0) throw new Error("Activity not found");

  // Don't create duplicates of the primary link
  // (handled by checking primary fields in caller; here we just dedupe within join table)
  const dupConds = [eq(activityLinks.activityId, data.activityId), eq(activityLinks.userId, data.userId)];
  if (data.contactId) dupConds.push(eq(activityLinks.contactId, data.contactId));
  if (data.propertyId) dupConds.push(eq(activityLinks.propertyId, data.propertyId));
  if (data.listingId) dupConds.push(eq(activityLinks.listingId, data.listingId));
  const existing = await db.select({ id: activityLinks.id }).from(activityLinks).where(and(...dupConds)).limit(1);
  if (existing.length > 0) return existing[0];

  const result = await db.insert(activityLinks).values({
    activityId: data.activityId,
    userId: data.userId,
    contactId: data.contactId ?? null,
    propertyId: data.propertyId ?? null,
    listingId: data.listingId ?? null,
  });
  return { id: (result as unknown as Array<{ insertId: number }>)[0]?.insertId ?? null };
}

export async function removeActivityLink(linkId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(activityLinks)
    .where(and(eq(activityLinks.id, linkId), eq(activityLinks.userId, userId)));
}

export async function deleteActivity(activityId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Cascade: remove links first (tolerate missing table)
  try {
    await db
      .delete(activityLinks)
      .where(and(eq(activityLinks.activityId, activityId), eq(activityLinks.userId, userId)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(msg)) throw err;
  }
  await db
    .delete(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)));
}

// Callback for deal narrative regeneration — set by the AI router at startup
let _narrativeCallback: ((userId: number, propertyId: number, activityId: number) => Promise<void>) | null = null;
export function setNarrativeCallback(cb: (userId: number, propertyId: number, activityId: number) => Promise<void>) {
  _narrativeCallback = cb;
}

export async function createActivity(data: InsertActivity) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(activities).values(data);
  const activityId = result[0].insertId;
  // Update lastContactedAt on contact and property
  if (data.contactId) {
    await db.update(contacts).set({ lastContactedAt: data.occurredAt ?? new Date() }).where(eq(contacts.id, data.contactId));
  }
  if (data.propertyId) {
    await db.update(properties).set({ lastContactedAt: data.occurredAt ?? new Date() }).where(eq(properties.id, data.propertyId));
  }
  // Fire-and-forget: queue deal narrative update if activity is linked to a property
  if (data.propertyId && data.userId && _narrativeCallback) {
    const cb = _narrativeCallback;
    const pId = data.propertyId;
    const uId = data.userId;
    setImmediate(async () => {
      try {
        await cb(uId, pId, activityId);
      } catch (err) {
        console.error("Failed to update deal narrative:", err);
      }
    });
  }
  return result;
}

export async function updateActivity(id: number, userId: number, data: Partial<InsertActivity>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(activities).set(data).where(and(eq(activities.id, id), eq(activities.userId, userId)));
}

export async function getActivitiesForProperty(userId: number, propertyId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select({
      id: activities.id,
      type: activities.type,
      direction: activities.direction,
      contactId: activities.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactCompany: contacts.company,
      subject: activities.subject,
      notes: activities.notes,
      summary: activities.summary,
      outcome: activities.outcome,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .where(and(eq(activities.userId, userId), eq(activities.propertyId, propertyId)))
    .orderBy(desc(activities.occurredAt))
    .limit(limit);
}
