CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('call','email','meeting','note','text','voicemail') NOT NULL,
	`direction` enum('inbound','outbound') DEFAULT 'outbound',
	`contactId` int,
	`propertyId` int,
	`listingId` int,
	`subject` varchar(300),
	`notes` text,
	`summary` text,
	`duration` int,
	`outcome` enum('reached','voicemail','no_answer','callback_requested','not_interested','interested','follow_up'),
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`userId` int NOT NULL,
	`contactId` int,
	`propertyId` int,
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
	`addressSource` enum('manual','import','other') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`label` varchar(100),
	`isPrimary` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_emails_id` PRIMARY KEY(`id`)
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
	`phoneStatus` enum('untried','verified','wrong_number','disconnected','no_answer') NOT NULL DEFAULT 'untried',
	`statusNotes` text,
	`phoneSource` enum('manual','import','other') NOT NULL DEFAULT 'manual',
	`lastAttemptAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_phones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_property_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contactId` int NOT NULL,
	`propertyId` int,
	`dealRole` enum('owner','seller','buyer','buyers_broker','listing_agent','property_manager','attorney','lender','other'),
	`source` enum('email_studio','manual','import','task','activity') NOT NULL DEFAULT 'manual',
	`label` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_property_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`company` varchar(200),
	`isOwner` boolean NOT NULL DEFAULT false,
	`isBuyer` boolean NOT NULL DEFAULT false,
	`buyerType` enum('individual','institutional','family_office','syndication','other'),
	`ownerNotes` text,
	`address` text,
	`city` varchar(100),
	`state` varchar(50),
	`zip` varchar(20),
	`priority` enum('hot','warm','cold','inactive') NOT NULL DEFAULT 'warm',
	`tags` text,
	`notes` text,
	`notesUpdatedAt` timestamp,
	`lastContactedAt` timestamp,
	`nextFollowUpAt` timestamp,
	`snoozedUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('task_due','follow_up_overdue','contact_unreached','system') NOT NULL,
	`title` varchar(300) NOT NULL,
	`message` text,
	`isRead` boolean NOT NULL DEFAULT false,
	`relatedContactId` int,
	`relatedPropertyId` int,
	`relatedTaskId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`propertyType` enum('mhc','apartment','affordable_housing','self_storage','other','industrial','office','retail') NOT NULL,
	`address` varchar(500),
	`city` varchar(100),
	`state` varchar(50),
	`zip` varchar(20),
	`county` varchar(100),
	`unitCount` int,
	`vintageYear` int,
	`yearRenovated` int,
	`sizeSqft` int,
	`lotAcres` float,
	`estimatedValue` float,
	`lastSalePrice` float,
	`lastSaleDate` timestamp,
	`askingPrice` float,
	`capRate` float,
	`noi` float,
	`status` enum('researching','prospecting','seller','listed','under_contract','recently_sold') NOT NULL DEFAULT 'researching',
	`ownerId` int,
	`ownerName` varchar(200),
	`ownerCompany` varchar(200),
	`ownerPhone` varchar(50),
	`ownerEmail` varchar(200),
	`latitude` float,
	`longitude` float,
	`boundary` text,
	`notes` text,
	`tags` text,
	`lastContactedAt` timestamp,
	`nextFollowUpAt` timestamp,
	`notesUpdatedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`),
	CONSTRAINT `prop_addr_uniq` UNIQUE(`userId`,`address`,`city`,`zip`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(300) NOT NULL,
	`description` text,
	`type` enum('call','email','meeting','follow_up','research','other') NOT NULL DEFAULT 'follow_up',
	`priority` enum('urgent','high','medium','low') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`contactId` int,
	`propertyId` int,
	`activityId` int,
	`dueAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`passwordHash` varchar(255),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`company` varchar(200),
	`title` varchar(200),
	`phone` varchar(50),
	`marketFocus` text,
	`signature` text,
	`voiceNotes` text,
	`preferences` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `activities_userId_idx` ON `activities` (`userId`);--> statement-breakpoint
CREATE INDEX `activities_contactId_idx` ON `activities` (`contactId`);--> statement-breakpoint
CREATE INDEX `activities_propertyId_idx` ON `activities` (`propertyId`);--> statement-breakpoint
CREATE INDEX `activities_userId_occurredAt_idx` ON `activities` (`userId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `activity_links_activityId_idx` ON `activity_links` (`activityId`);--> statement-breakpoint
CREATE INDEX `activity_links_contactId_idx` ON `activity_links` (`contactId`);--> statement-breakpoint
CREATE INDEX `activity_links_propertyId_idx` ON `activity_links` (`propertyId`);--> statement-breakpoint
CREATE INDEX `activity_links_userId_idx` ON `activity_links` (`userId`);--> statement-breakpoint
CREATE INDEX `ca_contactId_idx` ON `contact_addresses` (`contactId`);--> statement-breakpoint
CREATE INDEX `ca_userId_idx` ON `contact_addresses` (`userId`);--> statement-breakpoint
CREATE INDEX `cp_contactId_idx` ON `contact_phones` (`contactId`);--> statement-breakpoint
CREATE INDEX `cp_userId_idx` ON `contact_phones` (`userId`);--> statement-breakpoint
CREATE INDEX `cpl_contactId_idx` ON `contact_property_links` (`contactId`);--> statement-breakpoint
CREATE INDEX `cpl_propertyId_idx` ON `contact_property_links` (`propertyId`);--> statement-breakpoint
CREATE INDEX `cpl_userId_idx` ON `contact_property_links` (`userId`);--> statement-breakpoint
CREATE INDEX `contacts_userId_idx` ON `contacts` (`userId`);--> statement-breakpoint
CREATE INDEX `contacts_email_idx` ON `contacts` (`email`);--> statement-breakpoint
CREATE INDEX `properties_userId_idx` ON `properties` (`userId`);--> statement-breakpoint
CREATE INDEX `properties_userId_status_idx` ON `properties` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `properties_userId_city_idx` ON `properties` (`userId`,`city`);--> statement-breakpoint
CREATE INDEX `tasks_userId_idx` ON `tasks` (`userId`);--> statement-breakpoint
CREATE INDEX `tasks_contactId_idx` ON `tasks` (`contactId`);