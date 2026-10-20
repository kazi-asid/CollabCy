import { attentionCategories, safeWebsite, websiteHost } from "@/app/attention/model";

export const LAUNCH_MIN_DAYS = 7;
export const LAUNCH_MAX_DAYS = 90;
export const launchPublicStatuses = ["scheduled", "live", "ended"] as const;
export type LaunchStatus = "draft" | (typeof launchPublicStatuses)[number] | "hidden";

export type LaunchEventRecord = {
  id: string; slug: string; product_name: string; website_url: string; description: string;
  category: string; logo: string; banner_url: string; video_url: string; screenshots: string[];
  launch_at: string; duration_days: number; status: LaunchStatus; created_at: string;
};

export function slugifyLaunchName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "launch";
}

export function safeHttpsMedia(value: unknown, max = 2048) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.trim().startsWith("data:")) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function safeVideoUrl(value: unknown) {
  const href = safeHttpsMedia(value);
  if (!href) return "";
  const host = new URL(href).hostname.toLowerCase();
  if (["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com", "vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) return href;
  return /\.(mp4|webm)(\?|$)/i.test(href) ? href : "";
}

export function youtubeEmbed(value: string) {
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase();
    const id = host.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") || "";
    return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
  } catch { return ""; }
}

export function launchPhase(record: Pick<LaunchEventRecord, "launch_at" | "duration_days" | "status">, now = Date.now()): LaunchStatus {
  if (record.status === "hidden" || record.status === "draft") return record.status;
  const start = Date.parse(record.launch_at);
  if (!Number.isFinite(start)) return "hidden";
  if (now < start) return "scheduled";
  return now <= start + record.duration_days * 86400000 ? "live" : "ended";
}

export function validateLaunchInput(body: unknown) {
  if (!body || typeof body !== "object") return { error: "Add launch details." } as const;
  const input = body as Record<string, unknown>;
  const product_name = typeof input.product_name === "string" ? input.product_name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const category = typeof input.category === "string" ? input.category : "";
  const website_url = typeof input.website_url === "string" ? safeWebsite(input.website_url) : null;
  const duration_days = Number(input.duration_days);
  const parsedDate = typeof input.launch_at === "string" ? Date.parse(input.launch_at) : NaN;
  const logo = safeHttpsMedia(input.logo);
  const banner_url = safeHttpsMedia(input.banner_url);
  const video_url = safeVideoUrl(input.video_url);
  const screenshots = Array.isArray(input.screenshots) ? input.screenshots.map(safeHttpsMedia).filter(Boolean).slice(0, 6) : [];
  if (!product_name || product_name.length > 80) return { error: "Add a product name." } as const;
  if (!website_url) return { error: "Add a valid website." } as const;
  if (!description || description.length > 500) return { error: "Add a short description." } as const;
  if (!attentionCategories.includes(category)) return { error: "Choose a category." } as const;
  if (!Number.isInteger(duration_days) || duration_days < LAUNCH_MIN_DAYS || duration_days > LAUNCH_MAX_DAYS) return { error: `Campaign duration must be ${LAUNCH_MIN_DAYS}–${LAUNCH_MAX_DAYS} days.` } as const;
  if (!Number.isFinite(parsedDate) || parsedDate < Date.now() - 86400000) return { error: "Choose a future launch date." } as const;
  return { value: { product_name, website_url, host: websiteHost(website_url), description, category, logo, banner_url, video_url, screenshots, launch_at: new Date(parsedDate).toISOString(), duration_days } } as const;
}

export function publicLaunch(record: LaunchEventRecord): LaunchEventRecord {
  return { ...record, screenshots: record.screenshots || [], status: launchPhase(record) };
}
