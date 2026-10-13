// This entry point deliberately overrides any production-backed values loaded from .env.
process.env.COLLABCY_LOCAL_SAFE_MODE = "true";
process.env.NEXT_PUBLIC_COLLABCY_LOCAL_SAFE_MODE = "true";
process.env.COLLABCY_SITE_VISITS_ENABLED = "false";
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.DODO_API_KEY = "";
process.env.DODO_ATTENTION_BID_PRODUCT_ID = "";
process.env.DODO_PAYMENTS_WEBHOOK_KEY = "";
process.env.DODO_PAYMENTS_ENVIRONMENT = "test_mode";

process.argv = [process.execPath, new URL("./run-framework.mjs", import.meta.url).pathname, "dev", ...process.argv.slice(2)];
await import("./run-framework.mjs");
