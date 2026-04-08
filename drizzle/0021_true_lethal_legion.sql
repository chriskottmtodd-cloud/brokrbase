CREATE TABLE `unsolicited_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL,
	`userId` int NOT NULL,
	`amount` float,
	`buyerContactId` int,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `unsolicited_offers_id` PRIMARY KEY(`id`)
);
