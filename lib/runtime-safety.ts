export const PRODUCTION_SUPABASE_PROJECT_REF = "fslbmssxljpimfdukklh";

export function supabaseProjectRef(value?: string) {
  if (!value) return "";
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : "";
  } catch {
    return "";
  }
}

export function isLocalHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

export function isAuthorizedReadOnlyLocalRequest(request: Request) {
  try {
    return process.env.COLLABCY_LOCAL_READ_ONLY_MODE === "true" &&
      isLocalHostname(new URL(request.url).hostname) &&
      supabaseProjectRef(process.env.COLLABCY_READ_ONLY_SUPABASE_URL) === PRODUCTION_SUPABASE_PROJECT_REF;
  } catch {
    return false;
  }
}

/** New server-backed features must stay inert when localhost is deliberately
 * pointed at the production read-only listing source.  The special local
 * mode is for browsing existing public listings, never for creating drafts,
 * profiles, or other remote records. */
export function localIntegrationBlockedResponse(request: Request): Response | null {
  if (!isAuthorizedReadOnlyLocalRequest(request)) return null;
  return Response.json({ error: "This feature is unavailable in local read-only mode." }, { status: 403 });
}
