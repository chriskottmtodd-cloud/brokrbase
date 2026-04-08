import { and, desc, eq } from "drizzle-orm";
import {
  DealActivity,
  InsertDealActivity,
  activities,
  contacts,
  dealActivities,
  listings,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createDealActivity(data: InsertDealActivity): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(dealActivities).values(data);
}

export async function getDealActivities(
  listingId: number,
  userId: number
): Promise<(DealActivity & { source?: "deal" | "property"; contactName?: string | null })[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // 1. Fetch dedicated deal_activities entries
  const dealRows = await db
    .select()
    .from(dealActivities)
    .where(and(eq(dealActivities.listingId, listingId), eq(dealActivities.userId, userId)))
    .orderBy(desc(dealActivities.createdAt));

  // 2. Look up the listing's propertyId so we can pull property-level activities too
  const listingRow = await db
    .select({ propertyId: listings.propertyId })
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.userId, userId)))
    .limit(1);

  const propertyId = listingRow[0]?.propertyId;

  let propertyActivityRows: (DealActivity & { source: "property"; contactName?: string | null })[] = [];
  if (propertyId) {
    // Pull all activities linked to this property (calls, emails, notes, etc.)
    const propActivities = await db
      .select({
        id: activities.id,
        userId: activities.userId,
        type: activities.type,
        subject: activities.subject,
        notes: activities.notes,
        summary: activities.summary,
        outcome: activities.outcome,
        occurredAt: activities.occurredAt,
        createdAt: activities.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(activities)
      .leftJoin(contacts, eq(activities.contactId, contacts.id))
      .where(and(eq(activities.propertyId, propertyId), eq(activities.userId, userId)))
      .orderBy(desc(activities.occurredAt));

    propertyActivityRows = propActivities.map((a) => {
      // Map activity type to deal_activity type (best-effort)
      const typeMap: Record<string, DealActivity["type"]> = {
        call: "call",
        email: "email",
        meeting: "note",
        note: "note",
        text: "note",
        voicemail: "call",
      };
      const dealType: DealActivity["type"] = typeMap[a.type] ?? "other";
      const contactName = a.contactFirstName
        ? `${a.contactFirstName} ${a.contactLastName ?? ""}`.trim()
        : null;
      // Build a readable summary
      const summaryParts: string[] = [];
      if (a.subject) summaryParts.push(a.subject);
      if (a.summary) summaryParts.push(a.summary);
      else if (a.notes) summaryParts.push(a.notes.substring(0, 300));
      if (a.outcome) summaryParts.push(`[${a.outcome.replace(/_/g, " ")}]`);
      const summary = summaryParts.join(" — ") || `${a.type} logged`;
      return {
        id: a.id + 1_000_000, // offset to avoid ID collision with deal_activities
        listingId,
        userId: a.userId,
        type: dealType,
        summary,
        createdAt: a.occurredAt ?? a.createdAt,
        source: "property" as const,
        contactName,
      };
    });
  }

  // 3. Merge and sort both streams by date descending
  const all = [
    ...dealRows.map((r) => ({ ...r, source: "deal" as const, contactName: null })),
    ...propertyActivityRows,
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return all;
}
