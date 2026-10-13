import { createClient } from "@supabase/supabase-js";
import { loadAttentionMarketplaceWithClient } from "@/lib/supabase";
import { isAuthorizedReadOnlyLocalRequest } from "@/lib/runtime-safety";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!isAuthorizedReadOnlyLocalRequest(request)) {
    return Response.json({ error: "Read-only marketplace access is not enabled." }, { status: 404, headers });
  }
  const url = process.env.COLLABCY_READ_ONLY_SUPABASE_URL?.trim();
  const anonKey = process.env.COLLABCY_READ_ONLY_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return Response.json({ error: "Read-only marketplace access is not configured." }, { status: 503, headers });
  }
  try {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await loadAttentionMarketplaceWithClient(client);
    if (result.error) return Response.json({ error: result.error }, { status: 502, headers });
    return Response.json({ products: result.products, activity: result.activity }, { headers });
  } catch {
    return Response.json({ error: "Could not load the read-only marketplace." }, { status: 502, headers });
  }
}

export async function POST() {
  return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET" } });
}
