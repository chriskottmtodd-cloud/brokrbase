CREATE INDEX `activities_userId_idx` ON `activities` (`userId`);--> statement-breakpoint
CREATE INDEX `activities_contactId_idx` ON `activities` (`contactId`);--> statement-breakpoint
CREATE INDEX `activities_propertyId_idx` ON `activities` (`propertyId`);--> statement-breakpoint
CREATE INDEX `activities_listingId_idx` ON `activities` (`listingId`);--> statement-breakpoint
CREATE INDEX `buyer_interests_listingId_idx` ON `buyer_interests` (`listingId`);--> statement-breakpoint
CREATE INDEX `buyer_interests_contactId_idx` ON `buyer_interests` (`contactId`);--> statement-breakpoint
CREATE INDEX `buyer_interests_userId_idx` ON `buyer_interests` (`userId`);--> statement-breakpoint
CREATE INDEX `cpl_contactId_idx` ON `contact_property_links` (`contactId`);--> statement-breakpoint
CREATE INDEX `cpl_propertyId_idx` ON `contact_property_links` (`propertyId`);--> statement-breakpoint
CREATE INDEX `cpl_listingId_idx` ON `contact_property_links` (`listingId`);--> statement-breakpoint
CREATE INDEX `cpl_userId_idx` ON `contact_property_links` (`userId`);--> statement-breakpoint
CREATE INDEX `contacts_userId_idx` ON `contacts` (`userId`);--> statement-breakpoint
CREATE INDEX `contacts_email_idx` ON `contacts` (`email`);--> statement-breakpoint
CREATE INDEX `listings_userId_idx` ON `listings` (`userId`);--> statement-breakpoint
CREATE INDEX `tasks_userId_idx` ON `tasks` (`userId`);--> statement-breakpoint
CREATE INDEX `tasks_contactId_idx` ON `tasks` (`contactId`);