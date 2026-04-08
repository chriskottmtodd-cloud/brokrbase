import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  properties,
  contacts,
  activities,
  tasks,
  contactPropertyLinks,
  listings,
  saleRecords,
  unsolicitedOffers,
  buyerCriteria,
  listingSellers,
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── CSV helper ────────────────────────────────────────────────────────────────
function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col];
        if (val == null) return "";
        const str = String(val);
        if (str.includes(",") || str.includes("\n") || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export const exportRouter = router({
  // ─── Raw: Properties ────────────────────────────────────────────────────────
  properties: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.userId, ctx.user.id));
    const columns = [
      "id", "name", "propertyType", "address", "city", "state", "zip", "county",
      "unitCount", "vintageYear", "sizeSqft", "lotAcres", "estimatedValue",
      "lastSalePrice", "lastSaleDate", "askingPrice", "capRate", "noi",
      "status", "ownerId", "ownerName", "ownerCompany", "ownerPhone", "ownerEmail",
      "latitude", "longitude", "isMyListing", "offMarketInterest",
      "offMarketConfidence", "offMarketTimeline", "offMarketNotes",
      "notes", "importNotes", "tags", "lastContactedAt", "nextFollowUpAt",
      "createdAt", "updatedAt",
    ];
    return { filename: "properties.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Contacts ───────────────────────────────────────────────────────────
  contacts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, ctx.user.id));
    const columns = [
      "id", "firstName", "lastName", "email", "phone", "company",
      "isOwner", "isBuyer", "buyerType", "address", "city", "state", "zip",
      "priority", "notes", "ownerNotes", "tags", "lastContactedAt",
      "nextFollowUpAt", "snoozedUntil", "createdAt", "updatedAt",
    ];
    return { filename: "contacts.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Activities ─────────────────────────────────────────────────────────
  activities: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select()
      .from(activities)
      .where(eq(activities.userId, ctx.user.id));
    const columns = [
      "id", "contactId", "propertyId", "listingId", "type", "subject",
      "summary", "notes", "outcome", "occurredAt", "createdAt",
    ];
    return { filename: "activities.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Tasks ──────────────────────────────────────────────────────────────
  tasks: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, ctx.user.id));
    const columns = [
      "id", "title", "description", "type", "priority", "status",
      "dueAt", "completedAt", "contactId", "propertyId", "listingId",
      "createdAt", "updatedAt",
    ];
    return { filename: "tasks.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Contact-Property Links ─────────────────────────────────────────────
  contactPropertyLinks: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select()
      .from(contactPropertyLinks)
      .where(eq(contactPropertyLinks.userId, ctx.user.id));
    const columns = [
      "id", "contactId", "propertyId", "listingId", "dealRole", "source", "label", "createdAt",
    ];
    return { filename: "contact_property_links.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Listings ───────────────────────────────────────────────────────────
  listings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select()
      .from(listings)
      .where(eq(listings.userId, ctx.user.id));
    const columns = [
      "id", "propertyId", "title", "description", "askingPrice", "capRate", "noi",
      "stage", "status", "unitCount", "propertyName", "listedAt", "closedAt",
      "sellerId", "brokerNotes", "marketingMemo", "createdAt", "updatedAt",
    ];
    return { filename: "listings.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Sale Records ───────────────────────────────────────────────────────
  saleRecords: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    // Join to listings to filter by userId
    const rows = await db
      .select({
        id: saleRecords.id,
        propertyId: saleRecords.propertyId,
        listingId: saleRecords.listingId,
        closingDate: saleRecords.closingDate,
        closingPrice: saleRecords.closingPrice,
        pricePerUnit: saleRecords.pricePerUnit,
        capRate: saleRecords.capRate,
        processNote: saleRecords.processNote,
        createdAt: saleRecords.createdAt,
        updatedAt: saleRecords.updatedAt,
      })
      .from(saleRecords)
      .innerJoin(properties, and(
        eq(saleRecords.propertyId, properties.id),
        eq(properties.userId, ctx.user.id)
      ));
    const columns = [
      "id", "propertyId", "listingId", "closingDate", "closingPrice",
      "pricePerUnit", "capRate", "processNote", "createdAt", "updatedAt",
    ];
    return { filename: "sale_records.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Unsolicited Offers ─────────────────────────────────────────────────
  unsolicitedOffers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select({
        id: unsolicitedOffers.id,
        propertyId: unsolicitedOffers.propertyId,
        buyerContactId: unsolicitedOffers.buyerContactId,
        amount: unsolicitedOffers.amount,
        receivedAt: unsolicitedOffers.receivedAt,
        notes: unsolicitedOffers.notes,
        createdAt: unsolicitedOffers.createdAt,
      })
      .from(unsolicitedOffers)
      .innerJoin(properties, and(
        eq(unsolicitedOffers.propertyId, properties.id),
        eq(properties.userId, ctx.user.id)
      ));
    const columns = [
      "id", "propertyId", "buyerContactId", "amount", "receivedAt", "notes", "createdAt",
    ];
    return { filename: "unsolicited_offers.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Raw: Buyer Criteria ─────────────────────────────────────────────────────
  buyerCriteria: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db
      .select()
      .from(buyerCriteria)
      .where(eq(buyerCriteria.userId, ctx.user.id));
    const columns = [
      "id", "contactId", "propertyTypes", "minUnits", "maxUnits",
      "minVintageYear", "maxVintageYear", "minPrice", "maxPrice",
      "markets", "states", "statuses", "notes", "createdAt", "updatedAt",
    ];
    return { filename: "buyer_criteria.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Rich: Properties ────────────────────────────────────────────────────────
  propertiesRich: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const props = await db
      .select({
        id: properties.id,
        name: properties.name,
        propertyType: properties.propertyType,
        address: properties.address,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        county: properties.county,
        unitCount: properties.unitCount,
        vintageYear: properties.vintageYear,
        estimatedValue: properties.estimatedValue,
        lastSalePrice: properties.lastSalePrice,
        status: properties.status,
        ownerName: properties.ownerName,
        ownerEmail: contacts.email,
        ownerPhone: contacts.phone,
        ownerCompany: contacts.company,
        notes: properties.notes,
        importNotes: properties.importNotes,
        offMarketInterest: properties.offMarketInterest,
        offMarketNotes: properties.offMarketNotes,
        latitude: properties.latitude,
        longitude: properties.longitude,
        createdAt: properties.createdAt,
      })
      .from(properties)
      .leftJoin(contacts, eq(properties.ownerId, contacts.id))
      .where(eq(properties.userId, ctx.user.id));

    // Get activity stats per property
    const actStats = await db
      .select({
        propertyId: activities.propertyId,
        activityCount: sql<number>`COUNT(*)`,
        lastActivityDate: sql<string>`MAX(${activities.occurredAt})`,
        lastActivityType: sql<string>`MAX(${activities.type})`,
      })
      .from(activities)
      .where(eq(activities.userId, ctx.user.id))
      .groupBy(activities.propertyId);

    const statsMap = new Map(actStats.map((s) => [s.propertyId, s]));

    const rows = props.map((p) => {
      const stats = statsMap.get(p.id);
      return {
        ...p,
        activityCount: stats?.activityCount ?? 0,
        lastActivityDate: stats?.lastActivityDate ?? "",
        lastActivityType: stats?.lastActivityType ?? "",
      };
    });

    const columns = [
      "id", "name", "propertyType", "address", "city", "state", "zip", "county",
      "unitCount", "vintageYear", "estimatedValue", "lastSalePrice", "status",
      "ownerName", "ownerEmail", "ownerPhone", "ownerCompany",
      "lastActivityDate", "lastActivityType", "activityCount",
      "notes", "importNotes", "offMarketInterest", "offMarketNotes",
      "latitude", "longitude", "createdAt",
    ];
    return { filename: "properties_rich.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Rich: Contacts ──────────────────────────────────────────────────────────
  contactsRich: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const ctcts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, ctx.user.id));

    // Get linked property names per contact
    const links = await db
      .select({
        contactId: contactPropertyLinks.contactId,
        propertyName: properties.name,
      })
      .from(contactPropertyLinks)
      .innerJoin(properties, eq(contactPropertyLinks.propertyId, properties.id))
      .where(eq(contactPropertyLinks.userId, ctx.user.id));

    const linkMap = new Map<number, string[]>();
    for (const l of links) {
      if (!l.contactId) continue;
      if (!linkMap.has(l.contactId)) linkMap.set(l.contactId, []);
      linkMap.get(l.contactId)!.push(l.propertyName);
    }

    // Get activity stats per contact
    const actStats = await db
      .select({
        contactId: activities.contactId,
        activityCount: sql<number>`COUNT(*)`,
        lastActivityDate: sql<string>`MAX(${activities.occurredAt})`,
        lastActivityType: sql<string>`MAX(${activities.type})`,
      })
      .from(activities)
      .where(eq(activities.userId, ctx.user.id))
      .groupBy(activities.contactId);

    const statsMap = new Map(actStats.map((s) => [s.contactId, s]));

    const rows = ctcts.map((c) => {
      const stats = statsMap.get(c.id);
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        company: c.company,
        isOwner: c.isOwner,
        isBuyer: c.isBuyer,
        priority: c.priority,
        linkedPropertyNames: (linkMap.get(c.id) ?? []).join("; "),
        activityCount: stats?.activityCount ?? 0,
        lastActivityDate: stats?.lastActivityDate ?? "",
        lastActivityType: stats?.lastActivityType ?? "",
        notes: c.notes,
        ownerNotes: c.ownerNotes,
        city: c.city,
        state: c.state,
        createdAt: c.createdAt,
      };
    });

    const columns = [
      "id", "firstName", "lastName", "email", "phone", "company",
      "isOwner", "isBuyer", "priority",
      "linkedPropertyNames", "activityCount", "lastActivityDate", "lastActivityType",
      "notes", "ownerNotes", "city", "state", "createdAt",
    ];
    return { filename: "contacts_rich.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Rich: Listings ──────────────────────────────────────────────────────────
  listingsRich: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    const listingRows = await db
      .select({
        id: listings.id,
        title: listings.title,
        propertyName: properties.name,
        propertyAddress: properties.address,
        propertyCity: properties.city,
        unitCount: listings.unitCount,
        askingPrice: listings.askingPrice,
        capRate: listings.capRate,
        stage: listings.stage,
        status: listings.status,
        brokerNotes: listings.brokerNotes,
        listedAt: listings.listedAt,
        closedAt: listings.closedAt,
        createdAt: listings.createdAt,
      })
      .from(listings)
      .leftJoin(properties, eq(listings.propertyId, properties.id))
      .where(eq(listings.userId, ctx.user.id));

    // Get seller info (first seller per listing)
    const sellers = await db
      .select({
        listingId: listingSellers.listingId,
        sellerName: sql<string>`CONCAT(${contacts.firstName}, ' ', COALESCE(${contacts.lastName}, ''))`,
        sellerEmail: contacts.email,
        sellerPhone: contacts.phone,
      })
      .from(listingSellers)
      .innerJoin(contacts, eq(listingSellers.contactId, contacts.id))
      .innerJoin(listings, and(
        eq(listingSellers.listingId, listings.id),
        eq(listings.userId, ctx.user.id)
      ));

    const sellerMap = new Map<number, typeof sellers[0]>();
    for (const s of sellers) {
      if (!sellerMap.has(s.listingId)) sellerMap.set(s.listingId, s);
    }

    // Get buyer interest counts
    const { buyerInterests } = await import("../../drizzle/schema");
    const buyerCounts = await db
      .select({
        listingId: buyerInterests.listingId,
        count: sql<number>`COUNT(*)`,
      })
      .from(buyerInterests)
      .where(eq(buyerInterests.userId, ctx.user.id))
      .groupBy(buyerInterests.listingId);

    const buyerCountMap = new Map(buyerCounts.map((b) => [b.listingId, b.count]));

    const rows = listingRows.map((l) => {
      const seller = sellerMap.get(l.id);
      return {
        ...l,
        sellerName: seller?.sellerName ?? "",
        sellerEmail: seller?.sellerEmail ?? "",
        sellerPhone: seller?.sellerPhone ?? "",
        interestedBuyerCount: buyerCountMap.get(l.id) ?? 0,
      };
    });

    const columns = [
      "id", "title", "propertyName", "propertyAddress", "propertyCity", "unitCount",
      "askingPrice", "capRate", "stage", "status",
      "sellerName", "sellerEmail", "sellerPhone",
      "interestedBuyerCount", "brokerNotes",
      "listedAt", "closedAt", "createdAt",
    ];
    return { filename: "listings_rich.csv", csv: toCSV(rows as Record<string, unknown>[], columns) };
  }),

  // ─── Full Backup ─────────────────────────────────────────────────────────────
  fullBackup: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const userId = ctx.user.id;

    // Raw tables
    const [
      propsRaw,
      ctctsRaw,
      actsRaw,
      tasksRaw,
      linksRaw,
      listingsRaw,
      saleRaw,
      offersRaw,
      criteriaRaw,
    ] = await Promise.all([
      db.select().from(properties).where(eq(properties.userId, userId)),
      db.select().from(contacts).where(eq(contacts.userId, userId)),
      db.select().from(activities).where(eq(activities.userId, userId)),
      db.select().from(tasks).where(eq(tasks.userId, userId)),
      db.select().from(contactPropertyLinks).where(eq(contactPropertyLinks.userId, userId)),
      db.select().from(listings).where(eq(listings.userId, userId)),
      db
        .select({ id: saleRecords.id, propertyId: saleRecords.propertyId, listingId: saleRecords.listingId, closingDate: saleRecords.closingDate, closingPrice: saleRecords.closingPrice, pricePerUnit: saleRecords.pricePerUnit, capRate: saleRecords.capRate, processNote: saleRecords.processNote, createdAt: saleRecords.createdAt, updatedAt: saleRecords.updatedAt })
        .from(saleRecords)
        .innerJoin(properties, and(eq(saleRecords.propertyId, properties.id), eq(properties.userId, userId))),
      db
        .select({ id: unsolicitedOffers.id, propertyId: unsolicitedOffers.propertyId, buyerContactId: unsolicitedOffers.buyerContactId, amount: unsolicitedOffers.amount, receivedAt: unsolicitedOffers.receivedAt, notes: unsolicitedOffers.notes, createdAt: unsolicitedOffers.createdAt })
        .from(unsolicitedOffers)
        .innerJoin(properties, and(eq(unsolicitedOffers.propertyId, properties.id), eq(properties.userId, userId))),
      db.select().from(buyerCriteria).where(eq(buyerCriteria.userId, userId)),
    ]);

    const propCols = ["id","name","propertyType","address","city","state","zip","county","unitCount","vintageYear","sizeSqft","lotAcres","estimatedValue","lastSalePrice","lastSaleDate","askingPrice","capRate","noi","status","ownerId","ownerName","ownerCompany","ownerPhone","ownerEmail","latitude","longitude","isMyListing","offMarketInterest","offMarketConfidence","offMarketTimeline","offMarketNotes","notes","importNotes","tags","lastContactedAt","nextFollowUpAt","createdAt","updatedAt"];
    const ctctCols = ["id","firstName","lastName","email","phone","company","isOwner","isBuyer","buyerType","address","city","state","zip","priority","notes","ownerNotes","tags","lastContactedAt","nextFollowUpAt","snoozedUntil","createdAt","updatedAt"];
    const actCols = ["id","contactId","propertyId","listingId","type","subject","summary","notes","outcome","occurredAt","createdAt"];
    const taskCols = ["id","title","description","type","priority","status","dueAt","completedAt","contactId","propertyId","listingId","createdAt","updatedAt"];
    const linkCols = ["id","contactId","propertyId","listingId","dealRole","source","label","createdAt"];
    const listCols = ["id","propertyId","title","description","askingPrice","capRate","noi","stage","status","unitCount","propertyName","listedAt","closedAt","sellerId","brokerNotes","marketingMemo","createdAt","updatedAt"];
    const saleCols = ["id","propertyId","listingId","closingDate","closingPrice","pricePerUnit","capRate","processNote","createdAt","updatedAt"];
    const offerCols = ["id","propertyId","buyerContactId","amount","receivedAt","notes","createdAt"];
    const critCols = ["id","contactId","propertyTypes","minUnits","maxUnits","minVintageYear","maxVintageYear","minPrice","maxPrice","markets","states","statuses","notes","createdAt","updatedAt"];

    return {
      exportedAt: new Date().toISOString(),
      properties: { rows: propsRaw, csv: toCSV(propsRaw as Record<string, unknown>[], propCols) },
      contacts: { rows: ctctsRaw, csv: toCSV(ctctsRaw as Record<string, unknown>[], ctctCols) },
      activities: { rows: actsRaw, csv: toCSV(actsRaw as Record<string, unknown>[], actCols) },
      tasks: { rows: tasksRaw, csv: toCSV(tasksRaw as Record<string, unknown>[], taskCols) },
      contactPropertyLinks: { rows: linksRaw, csv: toCSV(linksRaw as Record<string, unknown>[], linkCols) },
      listings: { rows: listingsRaw, csv: toCSV(listingsRaw as Record<string, unknown>[], listCols) },
      saleRecords: { rows: saleRaw, csv: toCSV(saleRaw as Record<string, unknown>[], saleCols) },
      unsolicitedOffers: { rows: offersRaw, csv: toCSV(offersRaw as Record<string, unknown>[], offerCols) },
      buyerCriteria: { rows: criteriaRaw, csv: toCSV(criteriaRaw as Record<string, unknown>[], critCols) },
    };
  }),
});
