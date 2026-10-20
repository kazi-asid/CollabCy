import { localIntegrationBlockedResponse } from "@/lib/runtime-safety";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeHandle, publicCreator, type PublicCreator } from "@/lib/creator-profiles";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked;
  const handle = normalizeHandle((await context.params).handle || ""); if (!handle) return Response.json({ error: "Not found." }, { status: 404 });
  try { const { data, error } = await getSupabaseAdmin().from("creator_profiles").select("id, handle, display_name, bio, niche, location, x_handle, avatar_url, available, starting_rate, platforms").eq("handle", handle).maybeSingle(); return error || !data ? Response.json({ error: "Creator not found." }, { status: 404 }) : Response.json({ creator: publicCreator(data as PublicCreator) }); } catch { return Response.json({ error: "Creator Directory is not configured yet." }, { status: 503 }); }
}
