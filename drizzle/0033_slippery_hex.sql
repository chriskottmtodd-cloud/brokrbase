CREATE TABLE `activity_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`userId` int NOT NULL,
	`contactId` int,
	`propertyId` int,
	`listingId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`userId` int NOT NULL,
	`street` varchar(300),
	`unit` varchar(50),
	`city` varchar(100),
	`state` varchar(50),
	`zip` varchar(20),
	`county` varchar(100),
	`addressLabel` enum('home','office','mailing','other') DEFAULT 'other',
	`isPrimary` boolean NOT NULL DEFAULT false,
	`addressSource` enum('enformion','manual','import','other') NOT NULL DEFAULT 'manual',
	`firstReportedDate` varchar(20),
	`lastReportedDate` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_phones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`userId` int NOT NULL,
	`number` varchar(30) NOT NULL,
	`phoneType` enum('mobile','landline','unknown') DEFAULT 'unknown',
	`label` varchar(100),
	`isPrimary` boolean NOT NULL DEFAULT false,
	`isConnected` boolean,
	`phoneStatus` enum('untried','verified','wrong_number','disconnected','no_answer') NOT NULL DEFAULT 'untried',
	`statusNotes` text,
	`phoneSource` enum('enformion','manual','import','other') NOT NULL DEFAULT 'manual',
	`firstReportedDate` varchar(20),
	`lastReportedDate` varchar(20),
	`lastAttemptAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_phones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `owner_research` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`propertyId` int NOT NULL,
	`searchType` enum('llc_lookup','contact_enrich') NOT NULL,
	`searchInput` text,
	`researchStatus` enum('pending','completed','failed','no_results') NOT NULL DEFAULT 'pending',
	`entityChain` text,
	`rawResponse` text,
	`apiCost` float,
	`executionTimeMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `owner_research_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `research_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ownerResearchId` int NOT NULL,
	`propertyId` int NOT NULL,
	`firstName` varchar(100),
	`lastName` varchar(100),
	`fullName` varchar(300) NOT NULL,
	`title` varchar(200),
	`researchContactType` enum('principal','registered_agent','parent_entity','unknown') NOT NULL DEFAULT 'unknown',
	`isEntity` boolean NOT NULL DEFAULT false,
	`address` varchar(300),
	`city` varchar(100),
	`state` varchar(50),
	`zip` varchar(20),
	`county` varchar(100),
	`isEnriched` boolean NOT NULL DEFAULT false,
	`enrichedAt` timestamp,
	`identityScore` int,
	`enrichResponse` text,
	`promotedToContactId` int,
	`promotedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contact_property_links` MODIFY COLUMN `source` enum('email_studio','ai_assistant','manual','import','task','activity','owner_research') NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `properties` ADD `ownerLlc` varchar(200);--> statement-breakpoint
ALTER TABLE `properties` ADD `researchStatus` enum('researched','contact_on_file','pending_review','not_researched','partial_data') DEFAULT 'not_researched';--> statement-breakpoint
CREATE INDEX `activity_links_activityId_idx` ON `activity_links` (`activityId`);--> statement-breakpoint
CREATE INDEX `activity_links_contactId_idx` ON `activity_links` (`contactId`);--> statement-breakpoint
CREATE INDEX `activity_links_propertyId_idx` ON `activity_links` (`propertyId`);--> statement-breakpoint
CREATE INDEX `activity_links_listingId_idx` ON `activity_links` (`listingId`);--> statement-breakpoint
CREATE INDEX `activity_links_userId_idx` ON `activity_links` (`userId`);--> statement-breakpoint
CREATE INDEX `ca_contactId_idx` ON `contact_addresses` (`contactId`);--> statement-breakpoint
CREATE INDEX `ca_userId_idx` ON `contact_addresses` (`userId`);--> statement-breakpoint
CREATE INDEX `cp_contactId_idx` ON `contact_phones` (`contactId`);--> statement-breakpoint
CREATE INDEX `cp_userId_idx` ON `contact_phones` (`userId`);--> statement-breakpoint
CREATE INDEX `or_propertyId_idx` ON `owner_research` (`propertyId`);--> statement-breakpoint
CREATE INDEX `or_userId_idx` ON `owner_research` (`userId`);--> statement-breakpoint
CREATE INDEX `rc_ownerResearchId_idx` ON `research_contacts` (`ownerResearchId`);--> statement-breakpoint
CREATE INDEX `rc_propertyId_idx` ON `research_contacts` (`propertyId`);--> statement-breakpoint
CREATE INDEX `rc_userId_idx` ON `research_contacts` (`userId`);--> statement-breakpoint
CREATE INDEX `rc_promotedToContactId_idx` ON `research_contacts` (`promotedToContactId`);