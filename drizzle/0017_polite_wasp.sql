CREATE TABLE `listing_sellers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`contactId` int NOT NULL,
	`userId` int NOT NULL,
	`role` varchar(100) DEFAULT 'seller',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_sellers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sale_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL,
	`listingId` int,
	`userId` int NOT NULL,
	`closingDate` timestamp,
	`closingPrice` float,
	`pricePerUnit` float,
	`capRate` float,
	`processNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sale_records_id` PRIMARY KEY(`id`)
);
