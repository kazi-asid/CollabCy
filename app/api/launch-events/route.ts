import { localIntegrationBlockedResponse } from "@/lib/runtime-safety";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createManageToken, hashManageToken, manageCookieHeader } from "@/lib/manage-token";
import { publicLaunch, slugifyLaunchName, validateLaunchInput, type LaunchEventRecord } from "@/lib/launch-events";
import { requestClientKey, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const columns = "id, slug, product_name, website_url, description, category, logo, banner_url, video_url, screenshots, launch_at, duration_days, status, created_at";

export async function GET(request: Request) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from("launch_events").select(columns).in("status", ["scheduled", "live", "ended"]).order("launch_at", { ascending: true }).limit(48);
    if (error) return Response.json({ error: "Could not load launches." }, { status: 500 });
    return Response.json({ launches: ((data || []) as LaunchEventRecord[]).map(publicLaunch) });
  } catch { return Response.json({ launches: [], unavailable: true }); }
}

export async function POST(request: Request) {
  const blocked = localIntegrationBlockedResponse(request); if (blocked) return blocked;
  if (tooManyRequests(`launch-create:${requestClientKey(request)}`, 8, 10 * 60 * 1000)) return Response.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Add launch details." }, { status: 400 }); }
  const parsed = validateLaunchInput(body); if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const admin = getSupabaseAdmin(); const token = createManageToken(); const base = slugifyLaunchName(parsed.value.product_name);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const slug = attempt ? `${base}-${randomSuffix()}` : base;
      const { data, error } = await admin.from("launch_events").insert({ ...parsed.value, slug, status: "draft", manage_token_hash: hashManageToken(token) }).select(columns).single();
      if (data && !error) {
        const launch = publicLaunch(data as LaunchEventRecord); const secure = new URL(request.url).protocol === "https:";
        return Response.json({ launch, manage_path: `/launch/manage/${launch.id}` }, { status: 201, headers: { "Set-Cookie": manageCookieHeader(launch.id, token, secure) } });
      }
      if (!/duplicate|unique/i.test(error?.message || "")) return Response.json({ error: "Could not save this draft." }, { status: 500 });
    }
    return Response.json({ error: "Could not reserve a launch URL." }, { status: 409 });
  } catch { return Response.json({ error: "LaunchEvent is not configured yet." }, { status: 503 }); }
}

function randomSuffix() { return Math.random().toString(36).slice(2, 8); }
