import { localIntegrationBlockedResponse } from "@/lib/runtime-safety";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { publicCreator, type PublicCreator } from "@/lib/creator-profiles";

export const dynamic = "force-dynamic";
const columns = "id, handle, display_name, bio, niche, location, x_handle, avatar_url, available, starting_rate, platforms";
function queryTerm(value: string) { return value.toLowerCase().replace(/[^a-z0-9 _@-]/g, "").trim().slice(0, 60); }

export async function GET(request: Request) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked;
  const url = new URL(request.url); const q = queryTerm(url.searchParams.get("q") || ""); const niche = (url.searchParams.get("niche") || "").trim().slice(0, 40);
  const offset = Math.max(0, Math.min(10000, Number(url.searchParams.get("offset") || 0) || 0)); const sort = url.searchParams.get("sort") === "name" ? "name" : "newest";
  try {
    const admin = getSupabaseAdmin(); let lookup = admin.from("creator_profiles").select(columns).order(sort === "name" ? "display_name" : "created_at", { ascending: sort === "name" }).range(offset, offset + 11);
    if (niche && niche !== "All Creators") lookup = lookup.eq("niche", niche);
    if (q) { const pattern = `%${q.replace(/[%_,()]/g, "")}%`; lookup = lookup.or(`display_name.ilike.${pattern},handle.ilike.${pattern},x_handle.ilike.${pattern},niche.ilike.${pattern}`); }
    const { data, error } = await lookup; if (error) return Response.json({ error: "Could not load creators." }, { status: 500 });
    const rows = (data || []) as PublicCreator[]; return Response.json({ creators: rows.slice(0, 12).map(publicCreator), offset, has_more: rows.length > 12 });
  } catch { return Response.json({ creators: [], offset, has_more: false, unavailable: true }); }
}
