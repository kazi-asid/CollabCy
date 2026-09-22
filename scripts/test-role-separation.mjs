import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root=process.cwd();
const read=(rel)=>readFileSync(join(root,rel),'utf8');
const out=mkdtempSync(join(tmpdir(),'gohighnet-role-separation-'));

const main=()=>{
  const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','app/data.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
  assert.equal(build.status,0,build.stdout+build.stderr);
  writeFileSync(join(out,'package.json'),'{"type":"commonjs"}');
  const require=createRequire(import.meta.url);
  const {roleConflictNotice,canonicalMarketplaceRole,brandCanBrowseCreators}=require(join(out,'data.js'));

  const brandCopy=roleConflictNotice('brand');
  assert.match(brandCopy.title,/already registered as a Brand/);
  assert.match(brandCopy.body,/already registered as a Brand account/);
  assert.match(brandCopy.body,/different email address for a Creator account/);
  const creatorCopy=roleConflictNotice('creator');
  assert.match(creatorCopy.title,/already registered as a Creator/);
  assert.match(creatorCopy.body,/already registered as a Creator account/);
  assert.match(creatorCopy.body,/different email address for a Brand account/);

  assert.equal(canonicalMarketplaceRole([]),null);
  assert.equal(canonicalMarketplaceRole([{role:'creator',created:20},{role:'brand',created:10}]),'brand');
  assert.equal(canonicalMarketplaceRole([{role:'brand',created:20},{role:'creator',created:5}]),'creator');
  assert.equal(brandCanBrowseCreators('brand',[]),false);
  assert.equal(brandCanBrowseCreators('brand',[{id:'one'}]),true);
  assert.equal(brandCanBrowseCreators('creator',[{id:'one'}]),false);

  const migration=read('supabase/migrations/20260921260000_marketplace_role_separation.sql');
  assert.match(migration,/prevent_second_marketplace_role/);
  assert.match(migration,/marketplace_role_audit/);
  assert.match(migration,/profiles_one_identity_idx/);
  assert.match(migration,/if dual_count = 0/);
  assert.match(migration,/campaign_applications_brand_creator_only/);
  assert.match(migration,/connections_brand_creator_only/);
  assert.match(migration,/conversations_brand_creator_only/);
  assert.match(migration,/deals_brand_creator_only/);
  assert.match(migration,/current_user_is_creator\(\)/);
  assert.match(migration,/if not public\.current_user_is_brand\(\)/);
  assert.match(migration,/profile_has_role\(camp\.user_id, 'brand'\)/);
  assert.match(migration,/profile_has_role\(app\.creator_id, 'creator'\)/);
  assert.match(migration,/This email is already registered as a Brand account/);
  assert.match(migration,/Brand to Brand connections are not allowed/);
  assert.match(migration,/Creator to Creator connections are not allowed/);
  assert.doesNotMatch(migration,/delete from public\.profiles/i);
  assert.doesNotMatch(migration,/drop table public\.profiles/i);
  assert.doesNotMatch(migration,/stripe/i);

  const client=read('lib/supabase.ts');
  assert.match(client,/listOwnProfiles/);
  assert.match(client,/canonicalMarketplaceRole\(owned\.profiles\)/);
  assert.match(client,/existing && existing !== role/);
  assert.match(client,/resolvedRole = canonical \|\| role/);
  assert.match(client,/already registered as a brand/);
  assert.match(client,/Brand to Brand connections are not allowed/);
  assert.match(client,/profiles: \{ \[role\]: profile \}/);
  assert.doesNotMatch(client,/maybeMigrateLocalProfile/);
  assert.match(client,/onConflict: "user_id,role"/);

  const store=read('app/store.tsx');
  assert.match(store,/postAuthPath\(applied\.role/);
  assert.match(store,/postAuthPath\(next\.role/);
  assert.match(store,/hydrateFromUser/);
  assert.doesNotMatch(store,/startDemo/);
  assert.doesNotMatch(store,/demoDeals/);
  assert.match(store,/event==='SIGNED_OUT'/);
  assert.match(store,/authUserId/);
  assert.match(store,/version:3/);

  const marketplace=read('app/marketplace.tsx');
  assert.doesNotMatch(marketplace,/startDemo/);
  assert.match(marketplace,/workspace&&!path\.startsWith\('\/'\+s\.role\+'\/'\)/);

  const auth=read('app/ui/auth.tsx');
  assert.match(auth,/One email can be a Brand or a Creator, not both/);
  assert.match(auth,/if\(error\)return/);
  assert.match(auth,/persistAuthenticatedProfile\(s\.role,profile\)/);
  assert.match(auth,/saveOAuthIntent\(\{role,next:params.get\('next'\)\}\)/);

  const connectionsRpc=read('supabase/migrations/20260922120000_connections_rpc_only.sql');
  assert.match(connectionsRpc,/revoke insert on table public\.connections/);
  assert.match(connectionsRpc,/drop policy if exists "connections_insert_brand"/);
  assert.match(connectionsRpc,/grant select, update on table public\.connections to authenticated/);
  assert.doesNotMatch(connectionsRpc,/grant insert on table public\.connections/);

  const settings=read('app/ui/account.tsx');
  assert.match(settings,/Account type/);
  assert.match(settings,/disabled/);
  assert.doesNotMatch(settings,/setRole\(/);
  assert.doesNotMatch(settings,/startDemo/);

  console.log('PASS: one auth identity maps to one marketplace role; Brand↔Creator only is enforced in SQL, RPCs, and auth UX.');
};

try{main()}finally{rmSync(out,{recursive:true,force:true})}
