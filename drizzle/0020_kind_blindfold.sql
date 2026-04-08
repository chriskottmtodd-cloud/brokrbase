CREATE TABLE `deal_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('loi','offer','call','email','note','price_change','stage_change','buyer_added','document','other') NOT NULL DEFAULT 'note',
	`summary` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deal_activities_id` PRIMARY KEY(`id`)
);
