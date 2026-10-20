import { localIntegrationBlockedResponse } from "@/lib/runtime-safety";
import { getRequestAuthUser, getSupabaseAdmin } from "@/lib/supabase-admin";
import { publicCreator, validateCreatorProfile, type PublicCreator } from "@/lib/creator-profiles";
import { requestClientKey, tooManyRequests } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
const columns = "id, handle, display_name, bio, niche, location, x_handle, avatar_url, available, starting_rate, platforms";
export async function GET(request: Request) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked; const user = await getRequestAuthUser(request); if (!user) return Response.json({ error: "Sign in as a creator to continue." }, { status: 401 });
  try { const { data } = await getSupabaseAdmin().from("creator_profiles").select(columns).eq("user_id", user.id).maybeSingle(); return Response.json({ creator: data ? publicCreator(data as PublicCreator) : null, email: user.email || "" }); } catch { return Response.json({ error: "Creator profiles are not configured yet." }, { status: 503 }); }
}
export async function PUT(request: Request) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked; if (tooManyRequests(`creator-save:${requestClientKey(request)}`, 12, 10 * 60 * 1000)) return Response.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  const user = await getRequestAuthUser(request); if (!user) return Response.json({ error: "Sign in as a creator to continue." }, { status: 401 }); let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Add profile details." }, { status: 400 }); }
  const parsed = validateCreatorProfile(body); if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  try { const admin = getSupabaseAdmin(); const { data: present } = await admin.from("creator_profiles").select("id").eq("user_id", user.id).maybeSingle(); const query = present ? admin.from("creator_profiles").update(parsed.value).eq("user_id", user.id) : admin.from("creator_profiles").insert({ user_id: user.id, ...parsed.value }); const { data, error } = await query.select(columns).single(); if (error || !data) return Response.json({ error: /duplicate|unique/i.test(error?.message || "") ? "That handle is already taken." : "Could not save profile." }, { status: /duplicate|unique/i.test(error?.message || "") ? 409 : 500 }); return Response.json({ creator: publicCreator(data as PublicCreator) }); } catch { return Response.json({ error: "Creator profiles are not configured yet." }, { status: 503 }); }
}
