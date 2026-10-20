import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const read=(rel)=>readFileSync(join(root,rel),'utf8');

const marketplace=read('app/marketplace.tsx');
const publicUi=read('app/ui/public.tsx');
const client=read('lib/supabase.ts');
const listingSql=read('supabase/migrations/20261009000000_attention_paid_initial_listing.sql');
const collabCleanup=read('supabase/migrations/20261009120000_drop_collaboration_marketplace.sql');

assert.match(marketplace,/if\(path==='\/'\)return <AttentionMarketplace\/>/);
assert.match(marketplace,/if\(path==='\/discover'\)\{router\.replace\('\/'\);return\}/);
assert.match(marketplace,/path==='\/brand\/products\/new'/);
assert.match(marketplace,/path==='\/listings'/);
assert.match(marketplace,/path==='\/about'/);
assert.match(marketplace,/path==='\/faq'/);
assert.match(marketplace,/path==='\/creators'/);
assert.match(marketplace,/path==='\/launches'/);
assert.doesNotMatch(marketplace,/path==='\/brands'/);
assert.doesNotMatch(marketplace,/AdminWorkspace/);
assert.doesNotMatch(marketplace,/from '\.\/ui\/auth'/);
assert.doesNotMatch(marketplace,/from '\.\/ui\/deals'/);

const publicHeader=publicUi.slice(publicUi.indexOf('export function PublicHeader'),publicUi.indexOf('export function PublicFooter'));
const publicFooter=publicUi.slice(publicUi.indexOf('export function PublicFooter'));
assert.match(publicHeader,/href="\/creators"/);
assert.doesNotMatch(publicHeader,/href="\/brands"/);
assert.doesNotMatch(publicHeader,/href="\/login"/);
assert.doesNotMatch(publicHeader,/href="\/signup"/);
assert.match(publicHeader,/href="\/"/);
assert.match(publicFooter,/href="\/creators"/);
assert.doesNotMatch(publicFooter,/href="\/brands"/);
assert.doesNotMatch(publicFooter,/href="\/login"/);
assert.doesNotMatch(publicFooter,/href="\/signup"/);

assert.match(client,/Listings start through checkout/);
assert.match(client,/Bids are placed through checkout/);
assert.doesNotMatch(client,/createCampaign/);
assert.doesNotMatch(client,/invite_creator_to_campaign/);

assert.match(listingSql,/create_pending_attention_listing/);
const uniqueWebsiteSql=read('supabase/migrations/20261010140000_attention_unique_website_listings.sql');
assert.match(uniqueWebsiteSql,/already_listed/);
assert.match(uniqueWebsiteSql,/attention_website_key/);
assert.match(collabCleanup,/drop table if exists public\.campaigns cascade/);
assert.match(collabCleanup,/Does not drop Attention Marketplace/);

console.log('PASS: marketplace payment paths remain isolated from the new public Creator and LaunchEvent surfaces.');
