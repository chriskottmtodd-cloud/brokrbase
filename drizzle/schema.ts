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

// ─── Users (Auth + per-user voice profile) ──────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Profile fields used by AI prompts and email signatures
  company: varchar("company", { length: 200 }),
  title: varchar("title", { length: 200 }),
  phone: varchar("phone", { length: 50 }),
  marketFocus: text("marketFocus"),
  signature: text("signature"),
  voiceNotes: text("voiceNotes"),
  preferences: text("preferences"), // JSON: { propertyTypes, typeColors }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Contacts ────────────────────────────────────────────────────────────────
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  company: varchar("company", { length: 200 }),
  isOwner: boolean("isOwner").default(false).notNull(),
  isBuyer: boolean("isBuyer").default(false).notNull(),
  buyerType: mysqlEnum("buyerType", ["individual", "institutional", "family_office", "syndication", "other"]),
  ownerNotes: text("ownerNotes"),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),
  priority: mysqlEnum("priority", ["hot", "warm", "cold", "inactive"]).default("warm").notNull(),
  tags: text("tags"),
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
  label: varchar("label", { length: 100 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ContactEmail = typeof contactEmails.$inferSelect;
export type InsertContactEmail = typeof contactEmails.$inferInsert;

// ─── Contact Phones ──────────────────────────────────────────────────────────
export const contactPhones = mysqlTable("contact_phones", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  userId: int("userId").notNull(),
  number: varchar("number", { length: 30 }).notNull(),
  type: mysqlEnum("phoneType", ["mobile", "landline", "unknown"]).default("unknown"),
  label: varchar("label", { length: 100 }),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  status: mysqlEnum("phoneStatus", ["untried", "verified", "wrong_number", "disconnected", "no_answer"]).default("untried").notNull(),
  statusNotes: text("statusNotes"),
  source: mysqlEnum("phoneSource", ["manual", "import", "other"]).default("manual").notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  contactIdx: index("cp_contactId_idx").on(t.contactId),
  userIdx: index("cp_userId_idx").on(t.userId),
}));
export type ContactPhone = typeof contactPhones.$inferSelect;
export type InsertContactPhone = typeof contactPhones.$inferInsert;

// ─── Contact Addresses ───────────────────────────────────────────────────────
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
  source: mysqlEnum("addressSource", ["manual", "import", "other"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  contactIdx: index("ca_contactId_idx").on(t.contactId),
  userIdx: index("ca_userId_idx").on(t.userId),
}));
export type ContactAddress = typeof contactAddresses.$inferSelect;
export type InsertContactAddress = typeof contactAddresses.$inferInsert;

// ─── Properties ──────────────────────────────────────────────────────────────
export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  propertyType: mysqlEnum("propertyType", ["mhc", "apartment", "affordable_housing", "self_storage", "other", "industrial", "office", "retail"]).notNull(),
  address: varchar("address", { length: 500 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zip: varchar("zip", { length: 20 }),
  county: varchar("county", { length: 100 }),
  unitCount: int("unitCount"),
  vintageYear: int("vintageYear"),
  yearRenovated: int("yearRenovated"),
  sizeSqft: int("sizeSqft"),
  lotAcres: float("lotAcres"),
  estimatedValue: float("estimatedValue"),
  lastSalePrice: float("lastSalePrice"),
  lastSaleDate: timestamp("lastSaleDate"),
  askingPrice: float("askingPrice"),
  capRate: float("capRate"),
  noi: float("noi"),
  // Lease fields (office, retail, industrial)
  primaryTenant: varchar("primaryTenant", { length: 200 }),
  leaseType: varchar("leaseType", { length: 50 }),
  leaseExpiration: timestamp("leaseExpiration"),
  status: mysqlEnum("status", [
    "researching",
    "prospecting",
    "seller",
    "listed",
    "under_contract",
    "recently_sold",
  ]).default("researching").notNull(),
  ownerId: int("ownerId"),
  ownerName: varchar("ownerName", { length: 200 }),
  ownerCompany: varchar("ownerCompany", { length: 200 }),
  ownerPhone: varchar("ownerPhone", { length: 50 }),
  ownerEmail: varchar("ownerEmail", { length: 200 }),
  latitude: float("latitude"),
  longitude: float("longitude"),
  // GeoJSON polygon (or null) — when the broker draws a parcel boundary on
  // the map, the shape is stored here. Pin location stays in lat/lng.
  // Format: { "type": "Polygon", "coordinates": [[[lng,lat],[lng,lat],...]] }
  boundary: text("boundary"),
  notes: text("notes"),
  tags: text("tags"),
  lastContactedAt: timestamp("lastContactedAt"),
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  notesUpdatedAt: bigint("notesUpdatedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  addrUniq: uniqueIndex("prop_addr_uniq").on(t.userId, t.address, t.city, t.zip),
  userIdx: index("properties_userId_idx").on(t.userId),
  statusIdx: index("properties_userId_status_idx").on(t.userId, t.status),
  cityIdx: index("properties_userId_city_idx").on(t.userId, t.city),
}));
export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

// ─── Activities ──────────────────────────────────────────────────────────────
export const activities = mysqlTable("activities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["call", "email", "meeting", "note", "text", "voicemail"]).notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).default("outbound"),
  contactId: int("contactId"),
  propertyId: int("propertyId"),
  listingId: int("listingId"),
  subject: varchar("subject", { length: 300 }),
  notes: text("notes"),
  summary: text("summary"),
  duration: int("duration"),
  outcome: mysqlEnum("outcome", ["reached", "voicemail", "no_answer", "callback_requested", "not_interested", "interested", "follow_up"]),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userIdx:      index("activities_userId_idx").on(t.userId),
  contactIdx:   index("activities_contactId_idx").on(t.contactId),
  propertyIdx:  index("activities_propertyId_idx").on(t.propertyId),
  userDateIdx:  index("activities_userId_occurredAt_idx").on(t.userId, t.occurredAt),
}));
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

// ─── Activity Links (multi-link join table) ──────────────────────────────────
export const activityLinks = mysqlTable("activity_links", {
  id:         int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  userId:     int("userId").notNull(),
  contactId:  int("contactId"),
  propertyId: int("propertyId"),
  createdAt:  timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  activityIdx: index("activity_links_activityId_idx").on(t.activityId),
  contactIdx:  index("activity_links_contactId_idx").on(t.contactId),
  propertyIdx: index("activity_links_propertyId_idx").on(t.propertyId),
  userIdx:     index("activity_links_userId_idx").on(t.userId),
}));
export type ActivityLink = typeof activityLinks.$inferSelect;
export type InsertActivityLink = typeof activityLinks.$inferInsert;

// ─── Tasks ───────────────────────────────────────────────────────────────────
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["call", "email", "meeting", "follow_up", "research", "other"]).default("follow_up").notNull(),
  priority: mysqlEnum("priority", ["urgent", "high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  contactId: int("contactId"),
  propertyId: int("propertyId"),
  activityId: int("activityId"),
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
    "task_due",
    "follow_up_overdue",
    "contact_unreached",
    "system",
  ]).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  message: text("message"),
  isRead: boolean("isRead").default(false).notNull(),
  relatedContactId: int("relatedContactId"),
  relatedPropertyId: int("relatedPropertyId"),
  relatedTaskId: int("relatedTaskId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Contact ↔ Property Links ───────────────────────────────────────────────
export const contactPropertyLinks = mysqlTable("contact_property_links", {
  id:         int("id").autoincrement().primaryKey(),
  userId:     int("userId").notNull(),
  contactId:  int("contactId").notNull(),
  propertyId: int("propertyId"),
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
  source:     mysqlEnum("source", [
    "email_studio",
    "manual",
    "import",
    "task",
    "activity",
  ]).default("manual").notNull(),
  label:      varchar("label", { length: 300 }),
  createdAt:  timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  contactIdx:  index("cpl_contactId_idx").on(t.contactId),
  propertyIdx: index("cpl_propertyId_idx").on(t.propertyId),
  userIdx:     index("cpl_userId_idx").on(t.userId),
}));
export type ContactPropertyLink = typeof contactPropertyLinks.$inferSelect;
export type InsertContactPropertyLink = typeof contactPropertyLinks.$inferInsert;
