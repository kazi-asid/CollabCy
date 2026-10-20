import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [launchRoute, launchDetail, creatorMe, launchMigration, creatorMigration, manageToken, runtimeSafety] = await Promise.all([
  read("app/api/launch-events/route.ts"),
  read("app/api/launch-events/[slug]/route.ts"),
  read("app/api/creator/me/route.ts"),
  read("supabase/migrations/20261020120000_launch_events.sql"),
  read("supabase/migrations/20261020130000_creator_profiles.sql"),
  read("lib/manage-token.ts"),
  read("lib/runtime-safety.ts"),
]);

assert.match(launchRoute, /status:\s*"draft"/);
assert.match(launchRoute, /hashManageToken\(token\)/);
assert.match(launchRoute, /manageCookieHeader/);
assert.doesNotMatch(launchRoute, /manage_token:\s*token/);
assert.match(launchDetail, /manageTokenMatches/);
assert.match(launchDetail, /request_publication.*not configured/s);
assert.match(launchDetail, /localIntegrationBlockedResponse/);
assert.match(creatorMe, /getRequestAuthUser/);
assert.match(creatorMe, /eq\("user_id", user\.id\)/);
assert.match(launchMigration, /duration_days integer not null check \(duration_days between 7 and 90\)/);
assert.match(launchMigration, /status in \('draft', 'scheduled', 'live', 'ended', 'hidden'\)/);
assert.match(launchMigration, /launch_events_public_select/);
assert.match(creatorMigration, /user_id uuid not null unique references auth\.users/);
assert.match(creatorMigration, /auth\.uid\(\) = user_id/);
assert.match(creatorMigration, /creator_profiles_public_select/);
assert.match(manageToken, /randomBytes\(32\)/);
assert.match(manageToken, /timingSafeEqual/);
assert.match(manageToken, /HttpOnly; SameSite=Lax/);
assert.match(runtimeSafety, /localIntegrationBlockedResponse/);

console.log("LaunchEvent and Creator ownership/static safety checks passed.");
