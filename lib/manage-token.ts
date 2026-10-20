import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createManageToken() {
  return randomBytes(32).toString("hex");
}

export function hashManageToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function launchManageCookieName(id: string) {
  return `collabcy_launch_${id.replace(/-/g, "").slice(0, 32)}`;
}

export function manageTokenMatches(token: string, expectedHash: string) {
  if (!token || token.length > 128 || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  try {
    return timingSafeEqual(Buffer.from(hashManageToken(token), "hex"), Buffer.from(expectedHash, "hex"));
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string) {
  for (const entry of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function manageCookieHeader(id: string, token: string, secure: boolean) {
  return `${launchManageCookieName(id)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}${secure ? "; Secure" : ""}`;
}
