const buckets = new Map<string, { count: number; expires: number }>();

export function requestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.expires <= now) {
    buckets.set(key, { count: 1, expires: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}
