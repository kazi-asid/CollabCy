import { localIntegrationBlockedResponse } from "@/lib/runtime-safety";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { launchManageCookieName, manageTokenMatches, readCookie } from "@/lib/manage-token";
import { publicLaunch, validateLaunchInput, type LaunchEventRecord } from "@/lib/launch-events";
import { requestClientKey, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const publicColumns = "id, slug, product_name, website_url, description, category, logo, banner_url, video_url, screenshots, launch_at, duration_days, status, created_at";
const privateColumns = `${publicColumns}, manage_token_hash`;
type Params = { params: Promise<{ slug: string }> };
function validKey(value: string) { return /^[a-zA-Z0-9-]{1,80}$/.test(value); }

async function findLaunch(key: string, includeSecret = false) {
  const admin = getSupabaseAdmin(); const query = admin.from("launch_events").select((includeSecret ? privateColumns : publicColumns) as never);
  return /^[0-9a-f-]{36}$/i.test(key) ? query.eq("id", key).maybeSingle() : query.eq("slug", key).maybeSingle();
}

export async function GET(request: Request, context: Params) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked;
  const { slug } = await context.params; if (!validKey(slug)) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    const { data, error } = await findLaunch(slug, true); if (error || !data) return Response.json({ error: "Launch not found." }, { status: 404 });
    const row = data as unknown as LaunchEventRecord & { manage_token_hash: string };
    const owned = manageTokenMatches(readCookie(request, launchManageCookieName(row.id)), row.manage_token_hash);
    const launch = publicLaunch(row); if (!["scheduled", "live", "ended"].includes(launch.status) && !owned) return Response.json({ error: "Launch not found." }, { status: 404 });
    return Response.json({ launch });
  } catch { return Response.json({ error: "LaunchEvent is not configured yet." }, { status: 503 }); }
}

export async function PATCH(request: Request, context: Params) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked;
  if (tooManyRequests(`launch-manage:${requestClientKey(request)}`, 20, 10 * 60 * 1000)) return Response.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  const { slug } = await context.params; if (!validKey(slug)) return Response.json({ error: "Not found." }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Invalid update." }, { status: 400 }); }
  try {
    const { data: existing, error } = await findLaunch(slug, true); if (error || !existing) return Response.json({ error: "Launch not found." }, { status: 404 });
    const row = existing as unknown as LaunchEventRecord & { manage_token_hash: string }; const token = readCookie(request, launchManageCookieName(row.id));
    if (!manageTokenMatches(token, row.manage_token_hash)) return Response.json({ error: "You cannot manage this launch." }, { status: 403 });
    const admin = getSupabaseAdmin(); const input = body as Record<string, unknown>;
    if (input.hide === true) {
      const { data, error: updateError } = await admin.from("launch_events").update({ status: "hidden" }).eq("id", row.id).select(publicColumns).single();
      if (updateError || !data) return Response.json({ error: "Could not update launch." }, { status: 500 });
      return Response.json({ launch: publicLaunch(data as LaunchEventRecord) });
    }
    if (input.request_publication === true) return Response.json({ error: "LaunchEvent publishing is not configured yet. Your private draft is saved." }, { status: 409 });
    const parsed = validateLaunchInput(body); if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const { data, error: updateError } = await admin.from("launch_events").update(parsed.value).eq("id", row.id).select(publicColumns).single();
    if (updateError || !data) return Response.json({ error: "Could not update launch." }, { status: 500 });
    return Response.json({ launch: publicLaunch(data as LaunchEventRecord) });
  } catch { return Response.json({ error: "LaunchEvent is not configured yet." }, { status: 503 }); }
}
