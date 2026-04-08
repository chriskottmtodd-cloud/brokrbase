import {
  bigint,
  boolean,
  float,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users (Auth) ────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }), // bcrypt hash for DB-based login
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Contacts ────────────────────────────────────────────────────────────────
// One contact can be both an owner and a buyer
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // CRM user who owns this contact
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  company: varchar("company", { length: 200 }),
  // Dual-role flags
  isOwner: boolean("isOwner").default(false).notNull(),
  isBuyer: boolean("isBuyer").default(false).notNull(),
  // Buyer-specific fields
  buyerType: mysqlEnum("buyerType", ["individual", "institutional", "family_office", "syndication", "other"]),
  buyerCriteria: text("buyerCriteria"), // JSON string: {minUnits, maxUnits, minYear, maxYear, propertyTypes[], locations[], maxPrice}
  // Owner-specific fields
  ownerNotes: text("ownerNotes"),
  // General
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),
  priority: mysqlEnum("priority", ["hot", "warm", "cold", "inactive"]).default("warm").notNull(),
  tags: text("tags"), // JSON array of strings
  notes: text("notes"),
  notesUpdatedAt: timestamp("notesUpdatedAt"),
  lastContactedAt: timestamp("lastContactedAt"),
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  snoozedUntil: timestamp("snoozedUntil"),
   createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userIdx:  index("contacts_userId_idx").on(t.userId),
  emailIdx: index("contacts_email_idx").on(t.email),
}));
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Contact Emails (multiple emails per contact) ────────────────────────────
export const contactEmails = mysqlTable("contact_emails", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  label: varchar("label", { length: 100 }), // e.g. "work", "personal", "assistant"
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ContactEmail = typeof contactEmails.$inferSelect;
export type InsertContactEmail = typeof contactEmails.$inferInsert;

// ─── Properties ──────────────────────────────────────────────────────────────
export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  propertyType: mysqlEnum("propertyType", ["mhc", "apartment", "affordable_housing", "self_storage", "other", "industrial"]).notNull(),
  address: varchar("address", { length: 500 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }).default("ID"),
  zip: varchar("zip", { length: 20 }),
  county: varchar("county", { length: 100 }),
  // Property attributes
  unitCount: int("unitCount"),
  vintageYear: int("vintageYear"),
  yearRenovated: int("yearRenovated"),
  sizeSqft: int("sizeSqft"),
  lotAcres: float("lotAcres"),
  // Financial
  estimatedValue: float("estimatedValue"),
  lastSalePrice: float("lastSalePrice"),
  lastSaleDate: timestamp("lastSaleDate"),
  askingPrice: float("askingPrice"),
  capRate: float("capRate"),
  noi: float("noi"),
  // Status
  status: mysqlEnum("status", [
    "researching",
    "prospecting",
    "seller",
    "listed",
    "under_contract",
    "recently_sold",
  ]).default("researching").notNull(),
  // Owner linkage
  ownerId: int("ownerId"), // FK to contacts
  ownerName: varchar("ownerName", { length: 200 }), // denormalized for quick display
  ownerCompany: varchar("ownerCompany", { length: 200 }),
  ownerLlc: varchar("ownerLlc", { length: 200 }), // property-specific LLC (e.g. "Primrose Aspen LLC")
  ownerPhone: varchar("ownerPhone", { length: 50 }),
  ownerEmail: varchar("ownerEmail", { length: 200 }),
  // Map
  latitude: float("latitude"),
  longitude: float("longitude"),
  // Listing flag
  isMyListing: boolean("isMyListing").default(false).notNull(),
  // Off-market interest tracking
  offMarketInterest: boolean("offMarketInterest").default(false).notNull(),
  offMarketConfidence: mysqlEnum("offMarketConfidence", ["casual_mention", "serious_interest", "actively_exploring"]),
  offMarketTimeline: varchar("offMarketTimeline", { length: 100 }), // e.g. "2-3 years", "12-18 months"
  offMarketNotes: text("offMarketNotes"), // what the owner said
  // Meta
  notes: text("notes"),
  tags: text("tags"), // JSON array
  lastContactedAt: timestamp("lastContactedAt"),
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  notesUpdatedAt: bigint("notesUpdatedAt", { mode: "number" }),
  marketId: int("marketId"), // FK to markets table — explicit market assignment
  importNotes: text("importNotes"), // Original notes from import, never overwritten by AI
  webIntelligence: text("webIntelligence"), // JSON string of structured web intel sections
  webIntelligenceUpdatedAt: bigint("webIntelligenceUpdatedAt", { mode: "number" }),
  // Owner research status (denormalized for fast map queries)
  researchStatus: mysqlEnum("researchStatus", [
    "researched",
    "contact_on_file",
    "pending_review",
    "not_researched",
    "partial_data",
  ]).default("not_researched"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Unique index for upsert deduplication: (userId, address, city, zip)
  addrUniq: uniqueIndex("prop_addr_uniq").on(t.userId, t.address, t.city, t.zip),
  userIdx: index("properties_userId_idx").on(t.userId),
  statusIdx: index("properties_userId_status_idx").on(t.userId, t.status),
  cityIdx: index("properties_userId_city_idx").on(t.userId, t.city),
}));
export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

// ─── Listings ────────────────────────────────────────────────────────────────
export const listings = mysqlTable("listings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  propertyId: int("propertyId").notNull(), // FK to properties
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  askingPrice: float("askingPrice"),
  capRate: float("capRate"),
  noi: float("noi"),
  stage: mysqlEnum("stage", ["new", "active", "under_contract", "closed", "withdrawn", "expired"]).default("active").notNull(),
  status: mysqlEnum("status", ["active", "under_contract", "sold", "withdrawn"]).default("active").notNull(),
  unitCount: int("unitCount"),
  propertyName: varchar("propertyName", { length: 200 }), // denormalized
  listedAt: timestamp("listedAt").defaultNow(),
  closedAt: timestamp("closedAt"),
  sellerId: int("sellerId"), // FK to contacts (owner selling)
  brokerNotes: text("brokerNotes"),
  marketingMemo: text("marketingMemo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
   updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userIdx: index("listings_userId_idx").on(t.userId),
  stageIdx: index("listings_userId_stage_idx").on(t.userId, t.stage),
  propertyIdx: index("listings_propertyId_idx").on(t.propertyId),
}));
export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;

// ─── Buyer Interests ─────────────────────────────────────────────────────────
// Tracks which buyers are interested in which listings
export const buyerInterests = mysqlTable("buyer_interests", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId").notNull(),
  contactId: int("contactId").notNull(), // buyer
  userId: int("userId").notNull(),
  status: mysqlEnum("status", [
    "prospect",
    "contacted",
    "interested",
    "toured",
    "loi_submitted",
    "under_contract",
    "closed",
    "passed",
  ]).default("prospect").notNull(),
  offerAmount: float("offerAmount"),
  notes: text("notes"),
  pricePointFeedback: varchar("pricePointFeedback", { length: 500 }),
  aiScore: float("aiScore"),
  aiRationale: text("aiRationale"),
  aiFollowUpFlag: boolean("aiFollowUpFlag").default(false),
  aiRankedAt: timestamp("aiRankedAt"),
  lastContactedAt: timestamp("lastContactedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  listingIdx: index("buyer_interests_listingId_idx").on(t.listingId),
  contactIdx: index("buyer_interests_contactId_idx").on(t.contactId),
  userIdx:    index("buyer_interests_userId_idx").on(t.userId),
}));
export type BuyerInterest = typeof buyerInterests.$inferSelect;;
export type InsertBuyerInterest = typeof buyerInterests.$inferInsert;

// ─── Activities ──────────────────────────────────────────────────────────────
// All calls, emails, meetings — tied to contacts and/or properties
export const activities = mysqlTable("activities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["call", "email", "meeting", "note", "text", "voicemail"]).notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).default("outbound"),
  contactId: int("contactId"), // optional FK to contacts
  propertyId: int("propertyId"), // optional FK to properties
  listingId: int("listingId"), // optional FK to listings
  subject: varchar("subject", { length: 300 }),
  notes: text("notes"), // raw notes from the call/meeting
  summary: text("summary"), // AI-generated summary
  duration: int("duration"), // in minutes
  outcome: mysqlEnum("outcome", ["reached", "voicemail", "no_answer", "callback_requested", "not_interested", "interested", "follow_up"]),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userIdx:      index("activities_userId_idx").on(t.userId),
  contactIdx:   index("activities_contactId_idx").on(t.contactId),
  propertyIdx:  index("activities_propertyId_idx").on(t.propertyId),
  listingIdx:   index("activities_listingId_idx").on(t.listingId),
  userDateIdx:  index("activities_userId_occurredAt_idx").on(t.userId, t.occurredAt),
}));
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

// ─── Activity Links (multi-link join table) ──────────────────────────────────
// Lets one activity be tied to multiple contacts/properties/listings.
// The activities.contactId/propertyId/listingId fields remain the "primary"
// link (used by deal narratives and lastContactedAt updates) for back-compat.
export const activityLinks = mysqlTable("activity_links", {
  id:         int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  userId:     int("userId").notNull(),
  contactId:  int("contactId"),
  propertyId: int("propertyId"),
  listingId:  int("listingId"),
  createdAt:  timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  activityIdx: index("activity_links_activityId_idx").on(t.activityId),
  contactIdx:  index("activity_links_contactId_idx").on(t.contactId),
  propertyIdx: index("activity_links_propertyId_idx").on(t.propertyId),
  listingIdx:  index("activity_links_listingId_idx").on(t.listingId),
  userIdx:     index("activity_links_userId_idx").on(t.userId),
}));
export type ActivityLink = typeof activityLinks.$inferSelect;
export type InsertActivityLink = typeof activityLinks.$inferInsert;

// ─── Tasks (To-Do) ───────────────────────────────────────────────────────────
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["call", "email", "meeting", "follow_up", "research", "other"]).default("follow_up").notNull(),
  priority: mysqlEnum("priority", ["urgent", "high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  contactId: int("contactId"), // optional FK
  propertyId: int("propertyId"), // optional FK
  listingId: int("listingId"), // optional FK
  activityId: int("activityId"), // optional FK — task created from AI note extraction
  dueAt: timestamp("dueAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userIdx:    index("tasks_userId_idx").on(t.userId),
  contactIdx: index("tasks_contactId_idx").on(t.contactId),
}));
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Notifications ───────────────────────────────────────────────────────────
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", [
    "buyer_interest",
    "task_due",
    "follow_up_overdue",
    "contact_unreached",
    "deal_update",
    "system",
  ]).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  message: text("message"),
  isRead: boolean("isRead").default(false).notNull(),
  relatedContactId: int("relatedContactId"),
  relatedPropertyId: int("relatedPropertyId"),
  relatedListingId: int("relatedListingId"),
  relatedTaskId: int("relatedTaskId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Buyer Criteria ──────────────────────────────────────────────────────────
// One criteria profile per buyer contact. Stored as JSON strings for arrays.
export const buyerCriteria = mysqlTable("buyer_criteria", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  contactId: int("contactId").notNull().unique(), // one profile per contact
  // Property type filter (JSON array of enum values, null = any)
  propertyTypes: text("propertyTypes"), // JSON: ["mhc","apartment",...]
  // Unit count range
  minUnits: int("minUnits"),
  maxUnits: int("maxUnits"),
  // Vintage year range
  minVintageYear: int("minVintageYear"),
  maxVintageYear: int("maxVintageYear"),
  // Price range
  minPrice: float("minPrice"),
  maxPrice: float("maxPrice"),
  // Markets: cities or counties (JSON array of strings, null = any)
  markets: text("markets"), // JSON: ["Nampa","Boise","Canyon County",...]
  // States (JSON array, null = any)
  states: text("states"), // JSON: ["ID","OR",...]
  // Deal status filter (JSON array, null = any)
  statuses: text("statuses"), // JSON: ["tracking","prospect","listed",...]
  // Free-form notes about buyer preferences
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BuyerCriteria = typeof buyerCriteria.$inferSelect;
export type InsertBuyerCriteria = typeof buyerCriteria.$inferInsert;

// ─── Listing Knowledge Base ───────────────────────────────────────────────────
export const listingKnowledge = mysqlTable("listing_knowledge", {
  id:        int("id").autoincrement().primaryKey(),
  userId:    int("userId").notNull(),
  listingId: int("listingId").notNull(),
  title:     varchar("title", { length: 200 }).notNull(),
  content:   text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ListingKnowledge = typeof listingKnowledge.$inferSelect;
export type InsertListingKnowledge = typeof listingKnowledge.$inferInsert;

// ─── Contact ↔ Property/Listing Links ───────────────────────────────────────
// Tracks which contacts are associated with which properties/listings,
// including how/where the link was created (source context).
export const contactPropertyLinks = mysqlTable("contact_property_links", {
  id:         int("id").autoincrement().primaryKey(),
  userId:     int("userId").notNull(),
  contactId:  int("contactId").notNull(),
  propertyId: int("propertyId"),   // optional FK to properties
  listingId:  int("listingId"),    // optional FK to listings
  // Role this contact plays on this specific deal (separate from their general contact type)
  dealRole:   mysqlEnum("dealRole", [
    "owner",
    "seller",
    "buyer",
    "buyers_broker",
    "listing_agent",
    "property_manager",
    "attorney",
    "lender",
    "other",
  ]),
  // Where/how this link was created
  source:     mysqlEnum("source", [
    "email_studio",
    "ai_assistant",
    "manual",
    "import",
    "task",
    "activity",
    "owner_research",
  ]).default("manual").notNull(),
  // Human-readable label shown on the contact page
  label:      varchar("label", { length: 300 }),
  createdAt:  timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  contactIdx:  index("cpl_contactId_idx").on(t.contactId),
  propertyIdx: index("cpl_propertyId_idx").on(t.propertyId),
  listingIdx:  index("cpl_listingId_idx").on(t.listingId),
  userIdx:     index("cpl_userId_idx").on(t.userId),
}));
export type ContactPropertyLink = typeof contactPropertyLinks.$inferSelect;
export type InsertContactPropertyLink = typeof contactPropertyLinks.$inferInsert;

// ─── Listing Chat Messages ────────────────────────────────────────────────────
export const listingChatMessages = mysqlTable("listing_chat_messages", {
  id:        int("id").autoincrement().primaryKey(),
  userId:    int("userId").notNull(),
  listingId: int("listingId").notNull(),
  role:      mysqlEnum("role", ["user", "assistant"]).notNull(),
  content:   text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ListingChatMessage = typeof listingChatMessages.$inferSelect;
export type InsertListingChatMessage = typeof listingChatMessages.$inferInsert;

// ─── Listing Sellers ──────────────────────────────────────────────────────────
// Multiple contacts can be linked as sellers/parties on a single listing.
// This is separate from the property's owner field — a listing may have a
// primary owner plus partners, trusts, or other decision-makers.
export const listingSellers = mysqlTable("listing_sellers", {
  id:        int("id").autoincrement().primaryKey(),
  listingId: int("listingId").notNull(),
  contactId: int("contactId").notNull(),
  userId:    int("userId").notNull(),
  role:      varchar("role", { length: 100 }).default("seller"), // e.g. "seller", "partner", "trustee"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ListingSeller = typeof listingSellers.$inferSelect;
export type InsertListingSeller = typeof listingSellers.$inferInsert;

// ─── Sale Records ─────────────────────────────────────────────────────────────
// Permanent closing record attached to a property (and optionally a listing).
// Created manually via the "Record Sale" button when a deal closes.
export const saleRecords = mysqlTable("sale_records", {
  id:            int("id").autoincrement().primaryKey(),
  propertyId:    int("propertyId").notNull(),
  listingId:     int("listingId"),   // optional — which listing this sale came from
  userId:        int("userId").notNull(),
  closingDate:   timestamp("closingDate"),
  closingPrice:  float("closingPrice"),
  pricePerUnit:  float("pricePerUnit"),   // auto-calculated but editable
  capRate:       float("capRate"),
  processNote:   text("processNote"),     // short story about how the deal came together
  createdAt:     timestamp("createdAt").defaultNow().notNull(),
  updatedAt:     timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SaleRecord = typeof saleRecords.$inferSelect;
export type InsertSaleRecord = typeof saleRecords.$inferInsert;

// ─── Deal Activities ──────────────────────────────────────────────────────────
// Immutable chronological log of deal events on a listing.
// Auto-populated from AI Assistant, Email Studio, and buyer additions.
export const dealActivities = mysqlTable("deal_activities", {
  id:          int("id").autoincrement().primaryKey(),
  listingId:   int("listingId").notNull(),
  userId:      int("userId").notNull(),
  type:        mysqlEnum("type", [
    "loi",
    "offer",
    "call",
    "email",
    "note",
    "price_change",
    "stage_change",
    "buyer_added",
    "document",
    "other",
  ]).default("note").notNull(),
  summary:     text("summary").notNull(),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
});
export type DealActivity = typeof dealActivities.$inferSelect;
export type InsertDealActivity = typeof dealActivities.$inferInsert;

// ─── Unsolicited Offers (Off-Market) ─────────────────────────────────────────
// Tracks unsolicited offers received on off-market / prospecting properties.
// Independent of the listing pipeline — lives directly on the property record.
export const unsolicitedOffers = mysqlTable("unsolicited_offers", {
  id:             int("id").autoincrement().primaryKey(),
  propertyId:     int("propertyId").notNull(),
  userId:         int("userId").notNull(),
  amount:         float("amount"),                    // offer amount in dollars
  buyerContactId: int("buyerContactId"),              // optional — linked contact
  receivedAt:     timestamp("receivedAt").defaultNow().notNull(),
  notes:          text("notes"),                      // context about the offer
  createdAt:      timestamp("createdAt").defaultNow().notNull(),
});
export type UnsolicitedOffer = typeof unsolicitedOffers.$inferSelect;
export type InsertUnsolicitedOffer = typeof unsolicitedOffers.$inferInsert;

// ─── Deal Narratives ─────────────────────────────────────────────────────────
// AI-generated running summary of deal state per property, auto-updated after each activity.
export const dealNarratives = mysqlTable("deal_narratives", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  propertyId: int("propertyId").notNull(),
  listingId: int("listingId"),

  // The narrative itself
  summary: text("summary").notNull(),

  // Structured fields for quick access
  sellerMotivation: text("sellerMotivation"),
  pricingStatus: text("pricingStatus"),
  buyerActivity: text("buyerActivity"),
  keyDates: text("keyDates"),
  blockers: text("blockers"),
  nextSteps: text("nextSteps"),

  // Metadata
  activityCount: int("activityCount").default(0).notNull(),
  lastActivityId: int("lastActivityId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  userPropertyIdx: uniqueIndex("dn_user_property_idx").on(t.userId, t.propertyId),
}));
export type DealNarrative = typeof dealNarratives.$inferSelect;
export type InsertDealNarrative = typeof dealNarratives.$inferInsert;

// ─── Markets (configurable hierarchy) ────────────────────────────────────────
export const markets = mysqlTable("markets", {
  id:        int("id").autoincrement().primaryKey(),
  userId:    int("userId").notNull(),
  name:      varchar("name", { length: 100 }).notNull(),
  slug:      varchar("slug", { length: 100 }).notNull(),
  parentId:  int("parentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Market = typeof markets.$inferSelect;
export type InsertMarket = typeof markets.$inferInsert;

// ─── Market Intel ─────────────────────────────────────────────────────────────
export const marketIntel = mysqlTable("market_intel", {
  id:             int("id").autoincrement().primaryKey(),
  userId:         int("userId").notNull(),
  marketId:       int("marketId").notNull(),
  content:        text("content").notNull(),
  source:         varchar("source", { length: 200 }),
  extractedFacts: text("extractedFacts"),
  createdAt:      timestamp("createdAt").defaultNow().notNull(),
  updatedAt:      timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketIntel = typeof marketIntel.$inferSelect;
export type InsertMarketIntel = typeof marketIntel.$inferInsert;

// ─── Contact Phones (multiple phones per contact) ───────────────────────────
export const contactPhones = mysqlTable("contact_phones", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  userId: int("userId").notNull(),
  number: varchar("number", { length: 30 }).notNull(),
  type: mysqlEnum("phoneType", ["mobile", "landline", "unknown"]).default("unknown"),
  label: varchar("label", { length: 100 }), // e.g. "personal", "office", "assistant"
  isPrimary: boolean("isPrimary").default(false).notNull(),
  isConnected: boolean("isConnected"), // from Enformion API
  status: mysqlEnum("phoneStatus", ["untried", "verified", "wrong_number", "disconnected", "no_answer"]).default("untried").notNull(),
  statusNotes: text("statusNotes"), // e.g. "Left VM 4/6, mentioned market tracking"
  source: mysqlEnum("phoneSource", ["enformion", "manual", "import", "other"]).default("manual").notNull(),
  firstReportedDate: varchar("firstReportedDate", { length: 20 }), // from API
  lastReportedDate: varchar("lastReportedDate", { length: 20 }),  // from API
  lastAttemptAt: timestamp("lastAttemptAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  contactIdx: index("cp_contactId_idx").on(t.contactId),
  userIdx: index("cp_userId_idx").on(t.userId),
}));
export type ContactPhone = typeof contactPhones.$inferSelect;
export type InsertContactPhone = typeof contactPhones.$inferInsert;

// ─── Contact Addresses (multiple addresses per contact) ─────────────────────
export const contactAddresses = mysqlTable("contact_addresses", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  userId: int("userId").notNull(),
  street: varchar("street", { length: 300 }),
  unit: varchar("unit", { length: 50 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),
  county: varchar("county", { length: 100 }),
  label: mysqlEnum("addressLabel", ["home", "office", "mailing", "other"]).default("other"),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  source: mysqlEnum("addressSource", ["enformion", "manual", "import", "other"]).default("manual").notNull(),
  firstReportedDate: varchar("firstReportedDate", { length: 20 }),
  lastReportedDate: varchar("lastReportedDate", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  contactIdx: index("ca_contactId_idx").on(t.contactId),
  userIdx: index("ca_userId_idx").on(t.userId),
}));
export type ContactAddress = typeof contactAddresses.$inferSelect;
export type InsertContactAddress = typeof contactAddresses.$inferInsert;

// ─── Owner Research (per-property research record) ──────────────────────────
// Stores the raw research results before promotion to contacts.
export const ownerResearch = mysqlTable("owner_research", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  propertyId: int("propertyId").notNull(),
  // What was searched
  searchType: mysqlEnum("searchType", ["llc_lookup", "contact_enrich"]).notNull(),
  searchInput: text("searchInput"), // JSON: the LLC name or name+address that was searched
  // Results
  status: mysqlEnum("researchStatus", ["pending", "completed", "failed", "no_results"]).default("pending").notNull(),
  entityChain: text("entityChain"), // JSON: parsed chain e.g. [{ name, type, title, address }]
  rawResponse: text("rawResponse"), // JSON: full Enformion API response for audit trail
  // Metadata
  apiCost: float("apiCost"), // track spend per lookup
  executionTimeMs: int("executionTimeMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  propertyIdx: index("or_propertyId_idx").on(t.propertyId),
  userIdx: index("or_userId_idx").on(t.userId),
}));
export type OwnerResearch = typeof ownerResearch.$inferSelect;
export type InsertOwnerResearch = typeof ownerResearch.$inferInsert;

// ─── Research Contacts (staging table for discovered people/entities) ────────
// Each person or entity found during owner research, before promotion to contacts.
export const researchContacts = mysqlTable("research_contacts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ownerResearchId: int("ownerResearchId").notNull(), // FK to owner_research
  propertyId: int("propertyId").notNull(), // denormalized for quick queries
  // Identity
  firstName: varchar("firstName", { length: 100 }),
  lastName: varchar("lastName", { length: 100 }),
  fullName: varchar("fullName", { length: 300 }).notNull(),
  title: varchar("title", { length: 200 }), // from API: "MANAGER,OFFICER", "REGISTERED AGENT", etc.
  // Classification
  contactType: mysqlEnum("researchContactType", [
    "principal",           // actual decision-maker (human)
    "registered_agent",    // agent — skip for outreach
    "parent_entity",       // another LLC in the chain
    "unknown",             // couldn't determine
  ]).default("unknown").notNull(),
  isEntity: boolean("isEntity").default(false).notNull(), // true if this is an LLC/company, not a person
  // Address from filing
  address: varchar("address", { length: 300 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),
  county: varchar("county", { length: 100 }),
  // Enrichment
  isEnriched: boolean("isEnriched").default(false).notNull(),
  enrichedAt: timestamp("enrichedAt"),
  identityScore: int("identityScore"), // from Contact/Enrich (0-100)
  enrichResponse: text("enrichResponse"), // JSON: raw Contact/Enrich response
  // Promotion to full CRM contact
  promotedToContactId: int("promotedToContactId"), // FK to contacts — null until promoted
  promotedAt: timestamp("promotedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  researchIdx: index("rc_ownerResearchId_idx").on(t.ownerResearchId),
  propertyIdx: index("rc_propertyId_idx").on(t.propertyId),
  userIdx: index("rc_userId_idx").on(t.userId),
  promotedIdx: index("rc_promotedToContactId_idx").on(t.promotedToContactId),
}));
export type ResearchContact = typeof researchContacts.$inferSelect;
export type InsertResearchContact = typeof researchContacts.$inferInsert;

// ─── Unit Types (Unit Mix & Rents) ──────────────────────────────────────────
export const unitTypes = mysqlTable("unit_types", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull(),
  userId: int("userId").notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  bedCount: int("bedCount"),
  bathCount: int("bathCount"),
  unitCount: int("unitCount"),
  avgSqft: int("avgSqft"),
  askingRent: float("askingRent"),
  effectiveRent: float("effectiveRent"),
  renovationTier: mysqlEnum("renovationTier", ["classic", "renovated", "premium"]).default("classic"),
  yearRenovated: int("yearRenovated"),
  vacantUnits: int("vacantUnits").default(0),
  rentDataSource: varchar("rentDataSource", { length: 100 }),
  rentDataDate: timestamp("rentDataDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  propertyIdx: index("unit_types_propertyId_idx").on(t.propertyId),
  userIdx: index("unit_types_userId_idx").on(t.userId),
}));
export type UnitType = typeof unitTypes.$inferSelect;
export type InsertUnitType = typeof unitTypes.$inferInsert;
