import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const read=(rel)=>readFileSync(join(root,rel),'utf8');

const marketplace=read('app/marketplace.tsx');
assert.doesNotMatch(marketplace,/startDemo/);
assert.doesNotMatch(marketplace,/Creator demo/);
assert.doesNotMatch(marketplace,/Brand demo/);
assert.doesNotMatch(marketplace,/AdminWorkspace/);
assert.doesNotMatch(marketplace,/Sign out/);
assert.match(marketplace,/AttentionMarketplace/);
assert.match(marketplace,/BrandProducts creating/);

const publicUi=read('app/ui/public.tsx');
assert.doesNotMatch(publicUi,/I'm a creator/);
assert.doesNotMatch(publicUi,/ComingSoon/);
assert.match(publicUi,/Spotlight your brand/);

const wizard=read('app/attention/spotlight-wizard.tsx');
assert.match(wizard,/Claim your spotlight/);
assert.doesNotMatch(wizard,/Launch your brand/);

console.log('product refinement tests passed');
