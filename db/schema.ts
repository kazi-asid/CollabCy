import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' }).notNull();
const created = () => timestamp('created_at');

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), externalId: text('external_id').notNull(), email: text('email').notNull(), name: text('name').notNull(),
  role: text('role', { enum: ['creator', 'brand'] }).notNull(), createdAt: created(), updatedAt: timestamp('updated_at'),
}, table => ({ externalIdUnique: uniqueIndex('users_external_id_unique').on(table.externalId), emailIndex: index('users_email_idx').on(table.email) }));

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id), bio: text('bio').notNull().default(''), website: text('website').notNull().default(''), location: text('location').notNull().default(''), niche: text('niche').notNull().default(''), avatarUrl: text('avatar_url'), rateCents: integer('rate_cents').notNull().default(0), followers: integer('followers').notNull().default(0), impressions: integer('impressions').notNull().default(0), available: integer('available', { mode: 'boolean' }).notNull().default(false), updatedAt: timestamp('updated_at'),
}, table => ({ profileUserUnique: uniqueIndex('profiles_user_id_unique').on(table.userId) }));

export const socialAccounts = sqliteTable('social_accounts', {
  id: text('id').primaryKey(), profileId: text('profile_id').notNull().references(() => profiles.id), platform: text('platform', { enum: ['x', 'instagram', 'facebook'] }).notNull(), handle: text('handle').notNull(), followers: integer('followers').notNull().default(0), impressions: integer('impressions').notNull().default(0), verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
}, table => ({ profilePlatform: uniqueIndex('social_accounts_profile_platform_unique').on(table.profileId, table.platform) }));

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(), brandId: text('brand_id').notNull().references(() => users.id), title: text('title').notNull(), description: text('description').notNull(), category: text('category').notNull(), platforms: text('platforms').notNull().default('[]'), minBudgetCents: integer('min_budget_cents').notNull(), maxBudgetCents: integer('max_budget_cents').notNull(), status: text('status', { enum: ['draft', 'active', 'paused', 'expired'] }).notNull().default('draft'), expiresAt: integer('expires_at', { mode: 'timestamp_ms' }), createdAt: created(), updatedAt: timestamp('updated_at'),
}, table => ({ brandStatus: index('campaigns_brand_status_idx').on(table.brandId, table.status), discovery: index('campaigns_discovery_idx').on(table.status, table.category) }));

export const products = sqliteTable('products', {
  id: text('id').primaryKey(), brandId: text('brand_id').notNull().references(() => users.id), slug: text('slug').notNull(), name: text('name').notNull(), description: text('description').notNull(), websiteUrl: text('website_url').notNull(), logoUrl: text('logo_url'), category: text('category').notNull(), currentBidCents: integer('current_bid_cents').notNull(), visits: integer('visits').notNull().default(0), listingStartsAt: integer('listing_starts_at', { mode: 'timestamp_ms' }).notNull(), listingEndsAt: integer('listing_ends_at', { mode: 'timestamp_ms' }).notNull(), campaignId: text('campaign_id').references(() => campaigns.id), status: text('status', { enum: ['active', 'expired', 'paused'] }).notNull().default('active'), createdAt: created(),
}, table => ({ slugUnique: uniqueIndex('products_slug_unique').on(table.slug), activeRank: index('products_active_rank_idx').on(table.status, table.currentBidCents) }));

export const bids = sqliteTable('bids', { id: text('id').primaryKey(), productId: text('product_id').notNull().references(() => products.id), bidderId: text('bidder_id').references(() => users.id), amountCents: integer('amount_cents').notNull(), createdAt: created() }, table => ({ productHistory: index('bids_product_created_idx').on(table.productId, table.createdAt) }));

export const connections = sqliteTable('connections', { id: text('id').primaryKey(), creatorId: text('creator_id').notNull().references(() => users.id), brandId: text('brand_id').notNull().references(() => users.id), campaignId: text('campaign_id').references(() => campaigns.id), message: text('message').notNull().default(''), status: text('status', { enum: ['pending', 'accepted', 'declined', 'negotiating', 'completed'] }).notNull().default('pending'), createdAt: created(), updatedAt: timestamp('updated_at') }, table => ({ creatorStatus: index('connections_creator_status_idx').on(table.creatorId, table.status), brandStatus: index('connections_brand_status_idx').on(table.brandId, table.status) }));
