ALTER TABLE `listings` ADD `stage` enum('new','active','under_contract','closed','withdrawn','expired') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `unitCount` int;--> statement-breakpoint
ALTER TABLE `listings` ADD `propertyName` varchar(200);