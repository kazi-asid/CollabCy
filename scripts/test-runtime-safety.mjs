import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const pkg = JSON.parse(read("package.json"));

assert.equal(pkg.scripts.dev, "node scripts/run-production-read-only.mjs");
assert.equal(pkg.scripts["dev:production-read-only"], "node scripts/run-production-read-only.mjs");
assert.equal(pkg.scripts["dev:safe"], "node scripts/run-safe-local.mjs");

const runner = read("scripts/run-production-read-only.mjs");
assert.match(runner, /PRODUCTION_PROJECT_REF = "fslbmssxljpimfdukklh"/);
assert.match(runner, /COLLABCY_READ_ONLY_SUPABASE_ANON_KEY = sourceAnonKey/);
assert.match(runner, /NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-read-only-browser-disabled"/);
for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "DODO_API_KEY", "DODO_ATTENTION_BID_PRODUCT_ID", "DODO_PAYMENTS_WEBHOOK_KEY"]) {
  assert.match(runner, new RegExp(`process\\.env\\.${name} = ""`));
}
assert.match(runner, /COLLABCY_SITE_VISITS_ENABLED = "false"/);
assert.match(runner, /createServer/);
assert.match(runner, /Port 5173 is unavailable/);

const readRoute = read("app/api/attention/read-only/route.ts");
assert.match(readRoute, /isAuthorizedReadOnlyLocalRequest/);
assert.match(readRoute, /loadAttentionMarketplaceWithClient/);
assert.doesNotMatch(readRoute, /getSupabaseAdmin|service.role|\.rpc\(|\.insert\(|\.update\(|\.delete\(/i);

const client = read("lib/supabase.ts");
assert.match(client, /if \(readOnlyLocalMode\) return \{ error: "Visit recording is disabled/);
assert.match(client, /fetch\("\/api\/attention\/read-only"/);
assert.match(client, /if \(readOnlyLocalMode\) return \(\) => \{\}/);
assert.match(read("app/attention/site-visits.tsx"), /if\(readOnlyLocalMode\)return/);
assert.match(read("app/attention/website-visit.ts"), /if\(!readOnlyLocalMode\)/);

console.log("PASS: npm run dev is an explicit production-read-only localhost workflow with credentials and writes disabled.");
