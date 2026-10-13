import type { MarketplaceState, Product } from "./model";

export function createSafeLocalMarketplaceState(now = Date.now()): MarketplaceState {
  const day = 86_400_000;
  const products: Product[] = [
    {
      id: "local-product-aurora", brandId: "local-brand-aurora", brandName: "Aurora Labs", name: "Aurora",
      slug: "aurora", logo: "A", color: "#3267e8", websiteUrl: "https://example.com/aurora",
      description: "A local-only sample listing for safely reviewing marketplace layouts.", category: "AI Tools",
      tags: ["AI Tools"], currentBid: 48, clickCount: 128, visitTimes: [now - 3_600_000], status: "active",
      listingStartsAt: now - 2 * day, listingEndsAt: now + 28 * day,
      bids: [{ id: "local-bid-aurora", amount: 48, createdAt: now - 3_600_000 }],
    },
    {
      id: "local-product-canopy", brandId: "local-brand-canopy", brandName: "Canopy Studio", name: "Canopy",
      slug: "canopy", logo: "C", color: "#6d5ce8", websiteUrl: "https://example.com/canopy",
      description: "A fictional design workspace used only by the safe localhost preview.", category: "Design",
      tags: ["Design"], currentBid: 31, clickCount: 84, visitTimes: [now - 7_200_000], status: "active",
      listingStartsAt: now - day, listingEndsAt: now + 29 * day,
      bids: [{ id: "local-bid-canopy", amount: 31, createdAt: now - 7_200_000 }],
    },
    {
      id: "local-product-beacon", brandId: "local-brand-beacon", brandName: "Beacon Works", name: "Beacon",
      slug: "beacon", logo: "B", color: "#12a594", websiteUrl: "https://example.com/beacon",
      description: "Local fixture data for responsive, filtering, and empty-state checks.", category: "Productivity",
      tags: ["Productivity"], currentBid: 19, clickCount: 57, visitTimes: [], status: "active",
      listingStartsAt: now - 3 * day, listingEndsAt: now + 27 * day,
      bids: [{ id: "local-bid-beacon", amount: 19, createdAt: now - day }],
    },
  ];
  return {
    version: 1,
    products,
    activity: products.map((product) => ({
      id: `local-activity-${product.id}`,
      productId: product.id,
      type: "listing" as const,
      createdAt: product.listingStartsAt,
    })),
  };
}
