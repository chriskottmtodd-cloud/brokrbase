ALTER TABLE `buyer_interests` ADD `pricePointFeedback` varchar(500);--> statement-breakpoint
ALTER TABLE `buyer_interests` ADD `aiScore` float;--> statement-breakpoint
ALTER TABLE `buyer_interests` ADD `aiRationale` text;--> statement-breakpoint
ALTER TABLE `buyer_interests` ADD `aiFollowUpFlag` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `buyer_interests` ADD `aiRankedAt` timestamp;