import { loadEnv } from "vite";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";

const PRODUCTION_PROJECT_REF = "fslbmssxljpimfdukklh";
function configuredEnvironment() {
  const local = loadEnv("development", process.cwd(), "");
  if (local.NEXT_PUBLIC_SUPABASE_URL && local.NEXT_PUBLIC_SUPABASE_ANON_KEY) return local;
  try {
    const entries = execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" }).split("\n\n");
    const main = entries.find((entry) => entry.includes("branch refs/heads/main"));
    const root = main?.split("\n").find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    return root ? loadEnv("development", root, "") : local;
  } catch {
    return local;
  }
}
const loaded = configuredEnvironment();
const sourceUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || loaded.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const sourceAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || loaded.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

let projectRef = "";
try {
  const host = new URL(sourceUrl).hostname.toLowerCase();
  projectRef = host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : "";
} catch {}
if (projectRef !== PRODUCTION_PROJECT_REF || !sourceAnonKey) {
  throw new Error("The production read-only preview requires the configured production Supabase URL and anon key.");
}

// Keep public read credentials server-side. Browser code receives inert placeholders.
process.env.COLLABCY_READ_ONLY_SUPABASE_URL = sourceUrl;
process.env.COLLABCY_READ_ONLY_SUPABASE_ANON_KEY = sourceAnonKey;
process.env.COLLABCY_LOCAL_READ_ONLY_MODE = "true";
process.env.NEXT_PUBLIC_COLLABCY_LOCAL_READ_ONLY_MODE = "true";
process.env.COLLABCY_LOCAL_SAFE_MODE = "false";
process.env.NEXT_PUBLIC_COLLABCY_LOCAL_SAFE_MODE = "false";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-read-only-browser-disabled";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DODO_API_KEY = "";
process.env.DODO_ATTENTION_BID_PRODUCT_ID = "";
process.env.DODO_PAYMENTS_WEBHOOK_KEY = "";
process.env.DODO_PAYMENTS_ENVIRONMENT = "test_mode";
process.env.COLLABCY_SITE_VISITS_ENABLED = "false";

// Vinext falls through to a different port when 5173 is occupied. Refuse to start
// instead, because visiting an older server on 5173 can look like an empty proxy.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", (error) => reject(new Error(`Port 5173 is unavailable. Stop the existing localhost server and retry npm run dev. (${error.code || "listen error"})`)));
  probe.listen(5173, "localhost", () => probe.close(resolve));
});

process.argv = [process.execPath, new URL("./run-framework.mjs", import.meta.url).pathname, "dev", ...process.argv.slice(2)];
await import("./run-framework.mjs");
