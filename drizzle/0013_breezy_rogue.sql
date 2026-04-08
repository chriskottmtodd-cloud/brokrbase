CREATE TABLE `contact_property_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contactId` int NOT NULL,
	`propertyId` int,
	`listingId` int,
	`source` enum('email_studio','ai_assistant','manual','import','task','activity') NOT NULL DEFAULT 'manual',
	`label` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_property_links_id` PRIMARY KEY(`id`)
);
