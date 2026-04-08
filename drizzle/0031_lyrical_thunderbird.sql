CREATE INDEX `activities_userId_occurredAt_idx` ON `activities` (`userId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `listings_userId_stage_idx` ON `listings` (`userId`,`stage`);--> statement-breakpoint
CREATE INDEX `listings_propertyId_idx` ON `listings` (`propertyId`);--> statement-breakpoint
CREATE INDEX `properties_userId_idx` ON `properties` (`userId`);--> statement-breakpoint
CREATE INDEX `properties_userId_status_idx` ON `properties` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `properties_userId_city_idx` ON `properties` (`userId`,`city`);