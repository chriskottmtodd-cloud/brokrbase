ALTER TABLE `properties` MODIFY COLUMN `address` varchar(500);--> statement-breakpoint
ALTER TABLE `properties` ADD CONSTRAINT `prop_addr_uniq` UNIQUE(`userId`,`address`,`city`,`zip`);
