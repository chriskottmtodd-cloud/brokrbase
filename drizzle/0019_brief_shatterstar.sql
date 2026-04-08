ALTER TABLE `properties` ADD `offMarketInterest` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `offMarketConfidence` enum('casual_mention','serious_interest','actively_exploring');--> statement-breakpoint
ALTER TABLE `properties` ADD `offMarketTimeline` varchar(100);--> statement-breakpoint
ALTER TABLE `properties` ADD `offMarketNotes` text;