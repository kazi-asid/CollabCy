import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const read=(rel)=>readFileSync(join(root,rel),'utf8');

const marketplace=read('app/marketplace.tsx');
const publicUi=read('app/ui/public.tsx');
const collabCleanup=read('supabase/migrations/20261009120000_drop_collaboration_marketplace.sql');

assert.match(marketplace,/if\(path==='\/'\)return <AttentionMarketplace\/>/);
assert.match(marketplace,/if\(path==='\/discover'\)\{router\.replace\('\/'\);return\}/);
assert.doesNotMatch(marketplace,/Discover creators/);
assert.doesNotMatch(marketplace,/Discover brands/);
assert.match(marketplace,/path==='\/creators'/);
assert.match(marketplace,/CreatorDirectory/);
assert.doesNotMatch(marketplace,/path==='\/brands'/);
assert.doesNotMatch(marketplace,/CreatorDiscovery/);
assert.doesNotMatch(marketplace,/BrandDiscovery/);

const publicHeader=publicUi.slice(publicUi.indexOf('export function PublicHeader'),publicUi.indexOf('export function PublicFooter'));
assert.match(publicHeader,/href="\/creators"/);
assert.doesNotMatch(publicHeader,/href="\/brands"/);
assert.doesNotMatch(publicHeader,/href="\/login"/);

assert.match(collabCleanup,/drop view if exists public\.public_creators cascade/);
assert.match(collabCleanup,/drop view if exists public\.public_brands cascade/);
assert.doesNotMatch(collabCleanup,/drop table if exists public\.attention_products/);

console.log('PASS: public Creator Directory is routed without restoring legacy brand discovery.');
