CREATE TABLE `bids` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`bidder_id` text,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bidder_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bids_product_created_idx` ON `bids` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`platforms` text DEFAULT '[]' NOT NULL,
	`min_budget_cents` integer NOT NULL,
	`max_budget_cents` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaigns_brand_status_idx` ON `campaigns` (`brand_id`,`status`);--> statement-breakpoint
CREATE INDEX `campaigns_discovery_idx` ON `campaigns` (`status`,`category`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`campaign_id` text,
	`message` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `connections_creator_status_idx` ON `connections` (`creator_id`,`status`);--> statement-breakpoint
CREATE INDEX `connections_brand_status_idx` ON `connections` (`brand_id`,`status`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`website_url` text NOT NULL,
	`logo_url` text,
	`category` text NOT NULL,
	`current_bid_cents` integer NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`listing_starts_at` integer NOT NULL,
	`listing_ends_at` integer NOT NULL,
	`campaign_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_active_rank_idx` ON `products` (`status`,`current_bid_cents`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`niche` text DEFAULT '' NOT NULL,
	`avatar_url` text,
	`rate_cents` integer DEFAULT 0 NOT NULL,
	`followers` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`available` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_user_id_unique` ON `profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`followers` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_accounts_profile_platform_unique` ON `social_accounts` (`profile_id`,`platform`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_id_unique` ON `users` (`external_id`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);