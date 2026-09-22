import {attentionCategories,safeWebsite} from './model';

export const ATTENTION_PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAttentionProductId(value: string) {
  return typeof value === 'string' && ATTENTION_PRODUCT_ID.test(value);
}

export function validateAttentionIncrement(increment: number) {
  if (!Number.isFinite(increment) || increment <= 0) return 'Enter a valid bid amount.';
  if (!Number.isInteger(increment)) return 'Use a whole-dollar amount.';
  if (increment > 100000) return 'Demo bids must be $100,000 or less.';
  return '';
}

export function validateAttentionListing(input: {
  name: string;
  websiteUrl: string;
  description: string;
  category: string;
  initialBid: number;
  brandName?: string;
  logo?: string;
  campaign?: {title: string; description: string; requirements: string; budget: number};
}) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > 80 || !description || description.length > 500 || !attentionCategories.includes(input.category) || !safeWebsite(input.websiteUrl)) {
    return 'Add a product name, description, category, and valid website.';
  }
  if (!Number.isInteger(input.initialBid) || input.initialBid < 1 || input.initialBid > 100000) {
    return 'Initial bid must be a whole dollar between $1 and $100,000.';
  }
  if (input.brandName && input.brandName.trim().length > 80) {
    return 'Add a product name, description, category, and valid website.';
  }
  if (input.logo && input.logo.length > 700000) {
    return 'Add a product name, description, category, and valid website.';
  }
  if (input.campaign) {
    if (!input.campaign.title.trim() || input.campaign.title.trim().length > 100 || !input.campaign.description.trim() || input.campaign.description.trim().length > 2000 || !input.campaign.requirements.trim() || input.campaign.requirements.trim().length > 2000 || !Number.isFinite(input.campaign.budget) || input.campaign.budget < 1 || input.campaign.budget > 100000) {
      return 'Complete the optional creator opportunity, including its budget.';
    }
  }
  return '';
}
