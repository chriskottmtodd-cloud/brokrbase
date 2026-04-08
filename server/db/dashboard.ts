import { and, desc, eq, lte, or, sql } from "drizzle-orm";
import {
  activities,
  contacts,
  listings,
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
    activeListings,
    pendingTasks,
    urgentTasks,
    recentActivities,
    unreadNotifications,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(properties).where(eq(properties.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(listings).where(and(eq(listings.userId, userId), eq(listings.status, "active"))),
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "pending"))),
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "pending"), lte(tasks.dueAt, tomorrow))),
    db.select().from(activities).where(eq(activities.userId, userId)).orderBy(desc(activities.occurredAt)).limit(5),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
  ]);

  return {
    totalProperties: totalProperties[0]?.count ?? 0,
    activeListings: activeListings[0]?.count ?? 0,
    pendingTasks: pendingTasks[0]?.count ?? 0,
    urgentTasks: urgentTasks[0]?.count ?? 0,
    recentActivities,
    unreadNotifications: unreadNotifications[0]?.count ?? 0,
  };
}

export async function getDealMatchingData(userId: number) {
  const db = await getDb();
  if (!db) return { owners: [], buyers: [], ownerActivities: [], buyerActivities: [] };

  // Get all owner contacts with their properties
  const ownerContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.isOwner, true)));

  // Get all buyer contacts with criteria
  const buyerContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.isBuyer, true)));

  // Get all owner IDs and buyer IDs
  const ownerIds = ownerContacts.map(c => c.id);
  const buyerIds = buyerContacts.map(c => c.id);

  // Get recent activities for owners (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  let ownerActivities: typeof activities.$inferSelect[] = [];
  let buyerActivities: typeof activities.$inferSelect[] = [];

  if (ownerIds.length > 0) {
    ownerActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          sql`${activities.contactId} IN (${sql.join(ownerIds.map(id => sql`${id}`), sql`, `)})`,
          sql`${activities.occurredAt} >= ${twelveMonthsAgo}`
        )
      )
      .orderBy(desc(activities.occurredAt))
      .limit(500);
  }

  if (buyerIds.length > 0) {
    buyerActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          sql`${activities.contactId} IN (${sql.join(buyerIds.map(id => sql`${id}`), sql`, `)})`,
          sql`${activities.occurredAt} >= ${twelveMonthsAgo}`
        )
      )
      .orderBy(desc(activities.occurredAt))
      .limit(500);
  }

  // Get properties linked to owners
  const ownerProperties = ownerIds.length > 0
    ? await db
        .select()
        .from(properties)
        .where(
          and(
            eq(properties.userId, userId),
            sql`${properties.ownerId} IN (${sql.join(ownerIds.map(id => sql`${id}`), sql`, `)})`
          )
        )
    : [];

  return {
    owners: ownerContacts,
    buyers: buyerContacts,
    ownerActivities,
    buyerActivities,
    ownerProperties,
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

/** Properties for the three dashboard panels: my listings (active), under contract, recently sold */
export async function getDashboardListingPanels(userId: number) {
  const db = await getDb();
  if (!db) return { myListings: [], underContract: [], recentlySold: [] };

  // My Listings: active/new stage listings
  const myListingsRows = await db
    .select({
      id: listings.id,
      name: listings.title,
      propertyType: sql<string>`null`,
      address: sql<string>`null`,
      city: sql<string>`null`,
      state: sql<string>`null`,
      unitCount: listings.unitCount,
      vintageYear: sql<number>`null`,
      askingPrice: listings.askingPrice,
      capRate: listings.capRate,
      status: listings.status,
      stage: listings.stage,
      propertyName: listings.propertyName,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .where(and(
      eq(listings.userId, userId),
      or(
        eq(listings.stage, "active"),
        eq(listings.stage, "new"),
      )
    ))
    .orderBy(desc(listings.updatedAt))
    .limit(50);

  // Under Contract: listings with stage = under_contract
  const underContractRows = await db
    .select({
      id: listings.id,
      name: listings.title,
      propertyType: sql<string>`null`,
      address: sql<string>`null`,
      city: sql<string>`null`,
      state: sql<string>`null`,
      unitCount: listings.unitCount,
      vintageYear: sql<number>`null`,
      askingPrice: listings.askingPrice,
      capRate: listings.capRate,
      status: listings.status,
      stage: listings.stage,
      propertyName: listings.propertyName,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .where(and(
      eq(listings.userId, userId),
      eq(listings.stage, "under_contract")
    ))
    .orderBy(desc(listings.updatedAt))
    .limit(50);

  // Recently Sold: from properties table
  const propRows = await db
    .select({
      id: properties.id,
      name: properties.name,
      propertyType: properties.propertyType,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      unitCount: properties.unitCount,
      vintageYear: properties.vintageYear,
      askingPrice: properties.askingPrice,
      lastSalePrice: properties.lastSalePrice,
      capRate: properties.capRate,
      status: properties.status,
      ownerName: properties.ownerName,
      updatedAt: properties.updatedAt,
    })
    .from(properties)
    .where(and(
      eq(properties.userId, userId),
      eq(properties.status, "recently_sold")
    ))
    .orderBy(desc(properties.updatedAt))
    .limit(50);

  return { myListings: myListingsRows, underContract: underContractRows, recentlySold: propRows };
}
