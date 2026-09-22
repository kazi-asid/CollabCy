import {
  getAttentionSessionUser,
  loadAttentionMarketplace,
  placeAttentionBid,
  publishAttentionListing,
  recordAttentionVisit,
  subscribeToAttentionMarketplace,
} from "@/lib/supabase";
import type { AttentionBackend } from "./repository";

export function createAttentionBackend(): AttentionBackend {
  return {
    async sessionUserId() {
      const user = await getAttentionSessionUser();
      return user?.id || null;
    },
    async isDemoSession() {
      return false;
    },
    async load() {
      const result = await loadAttentionMarketplace();
      if (result.skipped) {
        if (result.error) console.error("[attention]", result.error);
        return { products: [], activity: [], unavailable: true, error: result.error || "Marketplace backend is not configured." };
      }
      if (result.error) {
        console.error("[attention]", result.error);
        return { products: [], activity: [], error: result.error };
      }
      return { products: result.products, activity: result.activity };
    },
    async placeBid(productId, increment) {
      const result = await placeAttentionBid(productId, increment);
      if (result.skipped) throw new Error("Marketplace backend is not configured.");
      if (result.error || !result.result) throw new Error(result.error || "Could not place this bid.");
      return result.result;
    },
    async recordVisit(productId) {
      const result = await recordAttentionVisit(productId);
      if (result.skipped) throw new Error("Marketplace backend is not configured.");
      if (result.error || result.clickCount == null) throw new Error(result.error || "Could not record this visit.");
      return { clickCount: result.clickCount };
    },
    async publish(input) {
      const result = await publishAttentionListing({
        brandName: input.brandName,
        name: input.name,
        logo: input.logo,
        websiteUrl: input.websiteUrl,
        description: input.description,
        category: input.category,
        initialBid: input.initialBid,
        campaign: input.campaign,
      });
      if (result.skipped) throw new Error("Marketplace backend is not configured.");
      if (result.error || !result.product) throw new Error(result.error || "Could not publish this listing.");
      return result.product;
    },
    subscribe(onChange) {
      return subscribeToAttentionMarketplace(onChange);
    },
  };
}
