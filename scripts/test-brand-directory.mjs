import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root=process.cwd();
const read=(rel)=>readFileSync(join(root,rel),'utf8');
const out=mkdtempSync(join(tmpdir(),'gohighnet-brand-directory-'));
const main=()=>{
 const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','app/data.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 assert.equal(build.status,0,build.stdout+build.stderr);
 writeFileSync(join(out,'package.json'),'{"type":"commonjs"}');
 const require=createRequire(import.meta.url);
 const {brandCanBrowseCreators,isCreatorUserId,realDirectoryCreators}=require(join(out,'data.js'));

 assert.equal(brandCanBrowseCreators('brand',[]),false);
 assert.equal(brandCanBrowseCreators('brand',[{id:'draft'}]),true);
 assert.equal(brandCanBrowseCreators('brand',[{id:'one',status:'paused'},{id:'two',status:'draft'}]),true);
 assert.equal(brandCanBrowseCreators('creator',[{id:'owned'}]),false);
 assert.equal(brandCanBrowseCreators('creator',[]),false);
 assert.equal(isCreatorUserId('maya'),false);
 assert.equal(isCreatorUserId('Temp'),false);
 assert.equal(isCreatorUserId(''),false);
 assert.equal(isCreatorUserId('11111111-1111-4111-8111-111111111111'),true);
 assert.deepEqual(realDirectoryCreators([{id:'maya',name:'Maya'},{id:'11111111-1111-4111-8111-111111111111',name:'Real'}]).map(c=>c.id),['11111111-1111-4111-8111-111111111111']);
 const {brandCreatorRelationship}=require(join(out,'data.js'));
 assert.equal(brandCreatorRelationship('c1',[],[]).kind,'none');
 assert.equal(brandCreatorRelationship('c1',[{creatorId:'c1',status:'pending',initiatedBy:'brand',id:'a1',campaignId:'camp'}],[]).kind,'pending');
 assert.equal(brandCreatorRelationship('c1',[],[{creatorId:'c1',status:'active',id:'n1',campaignId:'camp'}]).kind,'connected');
 assert.equal(brandCreatorRelationship('c1',[{creatorId:'c1',status:'rejected',initiatedBy:'brand',id:'a2',campaignId:'camp'}],[]).kind,'rejected');
 assert.equal(brandCreatorRelationship('c1',[],[{creatorId:'c1',status:'closed',id:'n2',campaignId:'camp'}]).kind,'closed');

 const discovery=read('app/ui/discovery.tsx');
 assert.match(discovery,/brandCanBrowseCreators\(s\.role,s\.campaigns\)/);
 assert.doesNotMatch(discovery,/s\.plan!=='Free'&&s\.planUntil>Date\.now\(\)/);
 assert.match(discovery,/inviteCreatorToCampaign/);
 assert.match(discovery,/Connect with creator/);
 assert.doesNotMatch(discovery,/Invitation saved in your preview workspace/);
 assert.doesNotMatch(discovery,/Invite to campaign/);
 assert.match(discovery,/\/brand\/campaigns\/new/);
 assert.match(discovery,/Free to get started/);
 assert.doesNotMatch(discovery,/Explore listing plans/);
 assert.doesNotMatch(discovery,/Activate a campaign plan/);
 assert.match(discovery,/access&&live\?realDirectoryCreators\(s\.directoryCreators\):\[\]/);
 assert.match(discovery,/inviteCreatorToCampaign\(\{campaignId:c\.id,creatorId:selected\.id/);
 assert.match(discovery,/isCreatorUserId\(selected\.id\)/);
 assert.match(discovery,/isCreatorUserId\(c\.id\)/);
 assert.match(discovery,/No creators available yet/);
 assert.match(discovery,/Creator profiles will appear here as creators join CollabCy/);
 assert.doesNotMatch(discovery,/Sample profiles/);
 assert.doesNotMatch(discovery,/fictional sample data/);
 assert.doesNotMatch(discovery,/demo creator/i);
 assert.doesNotMatch(discovery,/remoteDirectory\?s\.directoryCreators:creators/);
 assert.doesNotMatch(discovery,/access\?\(remoteDirectory\?s\.directoryCreators:creators\):\[\]/);

 const dashboard=read('app/ui/dashboard.tsx');
 assert.match(dashboard,/Your creator directory is waiting/);
 assert.match(dashboard,/Create your first campaign to start discovering creators/);

 const marketplace=read('app/marketplace.tsx');
 assert.match(marketplace,/directoryLocked/);
 assert.match(marketplace,/Discover creators/);
 assert.doesNotMatch(marketplace,/attention_products/);

 const migration=read('supabase/migrations/20260921240000_brand_directory_campaign_gate.sql');
 assert.match(migration,/current_brand_can_browse_creators/);
 assert.match(migration,/current_user_is_brand\(\)/);
 assert.match(migration,/from public\.campaigns/);
 assert.match(migration,/public_creators/);
 assert.doesNotMatch(migration,/place_attention_bid/);

 const attentionFn=read('supabase/migrations/20260921100000_social_accounts.sql');
 assert.match(attentionFn,/create or replace function public\.current_user_is_brand\(\)/);
 assert.doesNotMatch(attentionFn,/current_brand_can_browse_creators/);

 const invites=read('supabase/migrations/20260921250000_brand_creator_invites.sql');
 assert.match(invites,/invite_creator_to_campaign/);
 assert.match(invites,/initiated_by = 'brand'/);
 assert.match(invites,/application_received/);
 assert.doesNotMatch(invites,/place_attention_bid/);

 const dealsUi=read('app/ui/deals.tsx');
 assert.match(dealsUi,/application\.initiatedBy==='brand'/);

 const client=read('lib/supabase.ts');
 assert.match(client,/currentBrandHasCampaign/);
 assert.match(client,/gated: true/);
 assert.match(client,/inviteCreatorToCampaign/);
 assert.match(client,/from\("public_creators"\)/);
 assert.match(client,/if \(!isCreatorUserId\(input\.creatorId\)\) return \{ error: "Choose a creator to connect with\." \}/);
 assert.match(client,/realDirectoryCreators\(directory\.creators\)/);
 assert.doesNotMatch(client,/sampleCreators|mockCreators|demoCreators|SAMPLE_PROFILES/);

 console.log('PASS: brand creator directory unlocks after a campaign; authenticated brands see only real public_creators; brand invites persist through Supabase; Attention Marketplace stays unchanged.');
};
try{main()}finally{rmSync(out,{recursive:true,force:true})}
