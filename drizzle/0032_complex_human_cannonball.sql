CREATE TABLE `unit_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`bedCount` int,
	`bathCount` int,
	`unitCount` int,
	`avgSqft` int,
	`askingRent` float,
	`effectiveRent` float,
	`renovationTier` enum('classic','renovated','premium') DEFAULT 'classic',
	`yearRenovated` int,
	`vacantUnits` int DEFAULT 0,
	`rentDataSource` varchar(100),
	`rentDataDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `unit_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `properties` MODIFY COLUMN `propertyType` enum('mhc','apartment','affordable_housing','self_storage','other','industrial') NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `yearRenovated` int;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
CREATE INDEX `unit_types_propertyId_idx` ON `unit_types` (`propertyId`);--> statement-breakpoint
CREATE INDEX `unit_types_userId_idx` ON `unit_types` (`userId`);