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
