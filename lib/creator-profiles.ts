export const CREATOR_NICHES = ["Tech & AI", "Design & UX", "Dev Tools", "Indie Hackers", "Growth & Marketing", "Productivity", "Other"] as const;
export type PublicCreator = { id: string; handle: string; display_name: string; bio: string; niche: string; location: string; x_handle: string; avatar_url: string; available: boolean; starting_rate: number | null; platforms: string[] };

export function normalizeHandle(value: string) { return value.trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32); }
export function xProfileUrl(handle: string) { const clean = normalizeHandle(handle); return clean ? `https://x.com/${encodeURIComponent(clean)}` : ""; }
export function safeAvatarUrl(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 2048) return "";
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function validateCreatorProfile(body: unknown) {
  if (!body || typeof body !== "object") return { error: "Add profile details." } as const;
  const input = body as Record<string, unknown>;
  const display_name = text(input.display_name, 80); const handle = normalizeHandle(text(input.handle, 40)); const bio = text(input.bio, 500); const niche = text(input.niche, 40) || "Other";
  const starting_rate = input.starting_rate == null || input.starting_rate === "" ? null : Number(input.starting_rate);
  if (!display_name) return { error: "Add your display name." } as const;
  if (handle.length < 3) return { error: "Choose a public handle." } as const;
  if (!CREATOR_NICHES.includes(niche as (typeof CREATOR_NICHES)[number])) return { error: "Choose a niche." } as const;
  if (starting_rate !== null && (!Number.isInteger(starting_rate) || starting_rate < 0 || starting_rate > 100000)) return { error: "Starting rate must be a whole dollar or blank." } as const;
  return { value: { display_name, handle, bio, niche, location: text(input.location, 80), x_handle: normalizeHandle(text(input.x_handle, 40)), avatar_url: safeAvatarUrl(input.avatar_url), available: input.available !== false, starting_rate, platforms: Array.isArray(input.platforms) ? input.platforms.filter((v): v is string => typeof v === "string").map(v => v.trim().slice(0, 24)).filter(Boolean).slice(0, 6) : [] } } as const;
}
export function publicCreator(row: PublicCreator): PublicCreator { return { ...row, platforms: row.platforms || [] }; }
