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
