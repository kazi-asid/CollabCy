import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const read=(rel)=>readFileSync(join(root,rel),'utf8');

const marketplace=read('app/marketplace.tsx');
assert.doesNotMatch(marketplace,/startDemo/);
assert.doesNotMatch(marketplace,/Creator demo/);
assert.doesNotMatch(marketplace,/Brand demo/);
assert.doesNotMatch(marketplace,/Explore sample workspaces/);
assert.doesNotMatch(marketplace,/>PREVIEW</);
assert.match(marketplace,/AdminWorkspace/);
assert.match(marketplace,/Your profile/);
assert.match(marketplace,/Sign out/);

const auth=read('app/ui/auth.tsx');
assert.doesNotMatch(auth,/Frontend preview\. No real account is created/);
assert.doesNotMatch(auth,/Passwords are never stored or sent/);
assert.doesNotMatch(auth,/Creator demo/);
assert.doesNotMatch(auth,/preview terms/);
assert.match(auth,/Terms of Service/);
assert.match(auth,/Privacy Policy/);
assert.match(auth,/terms-attention/);
assert.match(auth,/signInWithPassword/);
assert.match(auth,/signUp/);
assert.match(auth,/Please tick this checkbox to continue/);

const landing=read('app/ui/public.tsx');
assert.doesNotMatch(landing,/Take a look around/);
assert.match(landing,/Discover opportunities/);
assert.match(landing,/href="\/discover"/);

const deals=read('app/ui/deals.tsx');
assert.doesNotMatch(deals,/Waiting for CollabCy verification/);
assert.match(deals,/CollabCy review required/);
assert.match(deals,/fromPlatform/);
assert.match(deals,/CollabCy Admin/);

const dashboard=read('app/ui/dashboard.tsx');
assert.doesNotMatch(dashboard,/Sample impressions/);
assert.doesNotMatch(dashboard,/Simulated payments only/);
assert.match(dashboard,/No live analytics yet/);

console.log('product refinement tests passed');
