import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent, Bid, Product } from "@/app/attention/model";
import { isActive, safeWebsite } from "@/app/attention/model";
import { isAttentionProductId, validateAttentionIncrement, validateAttentionListing } from "@/app/attention/validation";

function publicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "NEXT_PUBLIC_COLLABCY_LOCAL_READ_ONLY_MODE") {
  return import.meta.env[name] || (typeof process !== "undefined" ? process.env[name] : undefined);
}

const url = publicEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = publicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const readOnlyLocalMode = publicEnv("NEXT_PUBLIC_COLLABCY_LOCAL_READ_ONLY_MODE") === "true";

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (client !== undefined) return client;
  if (!url || !anonKey) {
    client = null;
    return null;
  }
  client = createClient(url, anonKey);
  return client;
}

type AttentionProductRow = {
  id: string;
  brand_name: string;
  name: string;
  slug: string;
  logo: string | null;
  color: string | null;
  website_url: string;
  description: string;
  category: string;
  tags: string[] | null;
  status: string;
  listing_starts_at: string | null;
  listing_ends_at: string | null;
  current_bid: number | string;
  click_count: number | string;
  campaign_title: string | null;
  campaign_description: string | null;
  campaign_requirements: string | null;
  campaign_budget: number | string | null;
  created_at: string;
};

type AttentionBidRow = {
  id: string;
  product_id: string;
  amount: number | string;
  created_at: string;
};

type AttentionActivityRow = {
  id: string;
  product_id: string;
  type: string;
  amount: number | string | null;
  rank: number | string | null;
  created_at: string;
};

export type AttentionListingWrite = {
  brandName: string;
  name: string;
  logo: string;
  websiteUrl: string;
  description: string;
  category: string;
  initialBid: number;
  campaign?: { title: string; description: string; requirements: string; budget: number };
};

export type AttentionBidResult = {
  productId: string;
  bidId: string;
  amount: number;
  currentBid: number;
  rank: number;
  createdAt: number;
};

const ATTENTION_PRODUCT_COLUMNS =
  "id, brand_name, name, slug, logo, color, website_url, description, category, tags, status, listing_starts_at, listing_ends_at, current_bid, click_count, campaign_title, campaign_description, campaign_requirements, campaign_budget, created_at";

const DEMO_ATTENTION_PRODUCT_IDS = new Set([
  "1247c322-2965-484e-987f-00029144e0af",
  "5420e773-585d-4628-bd6f-2c503d0148f8",
  "f935c0f6-d49e-4757-a4b9-1158407f21ab",
]);

function isDemoAttentionProductId(id: string) {
  return DEMO_ATTENTION_PRODUCT_IDS.has(id);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asEpoch(value: string | null | undefined) {
  if (!value) return 0;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function isMissingRelation(error: unknown) {
  const raw = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as { message?: string }).message || "") : "";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
  const msg = raw.toLowerCase();
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find the function");
}

function supabaseErrorParts(error: unknown) {
  if (typeof error === "string") return { message: error, code: "", details: "", hint: "" };
  if (!error || typeof error !== "object") return { message: "", code: "", details: "", hint: "" };
  const value = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    message: typeof value.message === "string" ? value.message : "",
    code: typeof value.code === "string" ? value.code : "",
    details: typeof value.details === "string" ? value.details : "",
    hint: typeof value.hint === "string" ? value.hint : "",
  };
}

function attentionClientError(operation: string, error: unknown, fallback: string) {
  const parts = supabaseErrorParts(error);
  console.error("[attention]", operation, parts.code || "error");
  return attentionErrorMessage(error, fallback);
}

function attentionErrorMessage(error: unknown, fallback: string) {
  const raw = supabaseErrorParts(error).message;
  if (!raw) return fallback;
  if (raw.includes("Enter at least $")) return raw;
  if (raw.includes("expired and cannot receive")) return "This listing has expired and cannot receive bids.";
  if (raw.includes("valid bid amount")) return "Enter a valid bid amount.";
  if (raw.includes("whole-dollar")) return "Use a whole-dollar amount.";
  if (raw.includes("Initial bid must")) return "Initial bid must be a whole dollar between $2 and $100,000.";
  if (raw.includes("$100,000")) return "Demo bids must be $100,000 or less.";
  if (raw.includes("product name, description") || raw.includes("valid website")) return "Add a product name, description, category, and valid website.";
  if (raw.includes("just listed")) return "This product was just listed. Please wait before listing it again.";
  if (raw.includes("Please wait a moment")) return "Please wait a moment before trying again.";
  if (raw.includes("Product not found")) return "Product not found.";
  if (raw.includes("Listings start through checkout")) return "Listings start through checkout.";
  if (raw.includes("failed to fetch") || raw.includes("Failed to fetch") || raw.includes("network")) return "Connection issue. Please try again.";
  return fallback;
}

function rowToBid(row: AttentionBidRow): Bid {
  return {
    id: row.id,
    amount: asNumber(row.amount, 0),
    createdAt: asEpoch(row.created_at),
  };
}

function rowToActivity(row: AttentionActivityRow): ActivityEvent | null {
  const type = row.type === "bid" || row.type === "listing" || row.type === "visit" ? row.type : null;
  if (!type) return null;
  return {
    id: row.id,
    productId: row.product_id,
    type,
    createdAt: asEpoch(row.created_at),
    amount: row.amount == null ? undefined : asNumber(row.amount, 0),
    rank: row.rank == null ? undefined : asNumber(row.rank, 0),
  };
}

function rowToAttentionProduct(
  row: AttentionProductRow,
  bids: Bid[],
  visitTimes: number[],
  now = Date.now(),
): Product {
  const listingStartsAt = asEpoch(row.listing_starts_at);
  const listingEndsAt = asEpoch(row.listing_ends_at);
  const product: Product = {
    id: row.id,
    brandId: "",
    brandName: row.brand_name,
    name: row.name,
    slug: row.slug,
    logo: row.logo || row.name.slice(0, 1) || "P",
    color: row.color || "#3267e8",
    websiteUrl: row.website_url,
    description: row.description,
    category: row.category,
    tags: asStringArray(row.tags),
    currentBid: asNumber(row.current_bid, 0),
    clickCount: asNumber(row.click_count, 0),
    visitTimes,
    status: row.status === "active" ? "active" : "expired",
    listingStartsAt,
    listingEndsAt,
    bids,
  };
  if (row.campaign_title && row.campaign_description && row.campaign_requirements && row.campaign_budget != null) {
    product.campaign = {
      title: row.campaign_title,
      description: row.campaign_description,
      requirements: row.campaign_requirements,
      budget: asNumber(row.campaign_budget, 0),
    };
  }
  if (!isActive(product, now)) product.status = "expired";
  return product;
}

function isAttentionProductRow(value: unknown): value is AttentionProductRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AttentionProductRow>;
  return typeof row.id === "string" && typeof row.slug === "string" && typeof row.website_url === "string";
}

export async function getAttentionSessionUser(): Promise<{ id: string } | null> {
  if (readOnlyLocalMode) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) return null;
  return { id: data.session.user.id };
}

export async function loadAttentionMarketplace(): Promise<{
  products: Product[];
  activity: ActivityEvent[];
  skipped?: boolean;
  error?: string;
}> {
  if (readOnlyLocalMode) {
    try {
      const response = await fetch("/api/attention/read-only", { method: "GET", cache: "no-store" });
      const payload = await response.json().catch(() => null) as { products?: unknown; activity?: unknown; error?: unknown } | null;
      if (!response.ok || !payload || !Array.isArray(payload.products) || !Array.isArray(payload.activity)) {
        return { products: [], activity: [], error: typeof payload?.error === "string" ? payload.error : "Could not load the read-only marketplace." };
      }
      return { products: payload.products as Product[], activity: payload.activity as ActivityEvent[] };
    } catch {
      return { products: [], activity: [], error: "Could not load the read-only marketplace." };
    }
  }
  const supabase = getSupabase();
  if (!supabase) return { products: [], activity: [], skipped: true };
  return loadAttentionMarketplaceWithClient(supabase);
}

export async function loadAttentionMarketplaceWithClient(supabase: SupabaseClient): Promise<{
  products: Product[];
  activity: ActivityEvent[];
  skipped?: boolean;
  error?: string;
}> {
  const { data: productData, error: productError } = await supabase
    .from("attention_products_public")
    .select(ATTENTION_PRODUCT_COLUMNS);
  if (productError) {
    return {
      products: [],
      activity: [],
      skipped: isMissingRelation(productError),
      error: isMissingRelation(productError) ? undefined : attentionClientError("load_products", productError, "Could not load the marketplace."),
    };
  }
  const productRows = (productData || []).filter(isAttentionProductRow).filter((row) => !isDemoAttentionProductId(row.id));
  const productIds = productRows.map((row) => row.id);
  const [{ data: bidData, error: bidError }, { data: activityData, error: activityError }] = await Promise.all([
    productIds.length
      ? supabase.from("attention_bids_public").select("id, product_id, amount, created_at").in("product_id", productIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as AttentionBidRow[], error: null }),
    supabase.from("attention_activity_public").select("id, product_id, type, amount, rank, created_at").order("created_at", { ascending: false }).limit(120),
  ]);
  if (bidError && !isMissingRelation(bidError)) {
    return { products: [], activity: [], error: attentionClientError("load_bids", bidError, "Could not load bid history.") };
  }
  if (activityError && !isMissingRelation(activityError)) {
    return { products: [], activity: [], error: attentionClientError("load_activity", activityError, "Could not load marketplace activity.") };
  }
  const bidsByProduct = new Map<string, Bid[]>();
  for (const row of (bidData || []) as AttentionBidRow[]) {
    if (!row?.id || !row.product_id) continue;
    const list = bidsByProduct.get(row.product_id) || [];
    list.push(rowToBid(row));
    bidsByProduct.set(row.product_id, list);
  }
  const liveProductIds = new Set(productIds);
  const activity = ((activityData || []) as AttentionActivityRow[])
    .map(rowToActivity)
    .filter((event): event is ActivityEvent => !!event && liveProductIds.has(event.productId));
  const visitTimes = new Map<string, number[]>();
  for (const event of activity) {
    if (event.type !== "visit") continue;
    const list = visitTimes.get(event.productId) || [];
    list.push(event.createdAt);
    visitTimes.set(event.productId, list);
  }
  const now = Date.now();
  return {
    products: productRows.map((row) => rowToAttentionProduct(row, bidsByProduct.get(row.id) || [], visitTimes.get(row.id) || [], now)),
    activity,
  };
}

export async function placeAttentionBid(productId: string, increment: number): Promise<{ result?: AttentionBidResult; error?: string; skipped?: boolean }> {
  if (!isAttentionProductId(productId)) return { error: "Product not found." };
  const incrementError = validateAttentionIncrement(increment);
  if (incrementError) return { error: incrementError };
  return { error: "Bids are placed through checkout." };
}

export async function recordAttentionVisit(productId: string): Promise<{ clickCount?: number; error?: string; skipped?: boolean }> {
  if (readOnlyLocalMode) return { error: "Visit recording is disabled in the read-only local preview." };
  const supabase = getSupabase();
  if (!supabase) return { skipped: true };
  if (!isAttentionProductId(productId)) return { error: "Product not found." };
  const { data, error } = await supabase.rpc("record_attention_visit", { p_product_id: productId });
  if (error) {
    return { error: attentionClientError("record_visit", error, "Could not record this visit.") };
  }
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const clickCount = asNumber(row?.click_count, 0);
  if (!Number.isInteger(clickCount) || clickCount < 0) return { error: "Could not record this visit." };
  return { clickCount };
}

export async function publishAttentionListing(input: AttentionListingWrite): Promise<{ product?: Product; error?: string; skipped?: boolean }> {
  const listingError = validateAttentionListing(input);
  if (listingError) return { error: listingError };
  if (!safeWebsite(input.websiteUrl)) return { error: "Add a product name, description, category, and valid website." };
  return { error: "Listings start through checkout." };
}

export function subscribeToAttentionMarketplace(onChange: () => void): () => void {
  if (readOnlyLocalMode) return () => {};
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("attention-marketplace")
    .on("postgres_changes", { event: "*", schema: "public", table: "attention_products" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "attention_bids" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "attention_activity" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
