CREATE TABLE `deal_narratives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`propertyId` int NOT NULL,
	`listingId` int,
	`summary` text NOT NULL,
	`sellerMotivation` text,
	`pricingStatus` text,
	`buyerActivity` text,
	`keyDates` text,
	`blockers` text,
	`nextSteps` text,
	`activityCount` int NOT NULL DEFAULT 0,
	`lastActivityId` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deal_narratives_id` PRIMARY KEY(`id`),
	CONSTRAINT `dn_user_property_idx` UNIQUE(`userId`,`propertyId`)
);
