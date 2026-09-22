import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const out=mkdtempSync(join(tmpdir(),'gohighnet-deals-'));
const main=()=>{
  const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','app/deals/model.ts','app/deals/lifecycle.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
  assert.equal(build.status,0,build.stdout+build.stderr);
  writeFileSync(join(out,'package.json'),'{"type":"commonjs"}');
  const require=createRequire(import.meta.url);
  const model=require(join(out,'model.js'));
  const {createDealLifecycle,canReadDeal,validateDealSubmission}=require(join(out,'lifecycle.js'));

  const brand='brand-1';
  const creator='creator-1';
  const outsider='outsider-1';
  const admin='admin-1';
  const connection={
    id:'conn-1',
    campaignId:'camp-1',
    creatorId:creator,
    brandId:brand,
    deliverable:'1 original thread',
    requirements:'Include #ad and keep live 30 days.',
    agreedBudget:150,
    deadline:new Date(Date.now()+7*86400000).toISOString(),
  };

  const life=createDealLifecycle();
  life.grantVerifier(admin);
  assert.equal(life.all().length,0,'no seed or mock deals');

  const first=life.ensureDeal(connection);
  assert.equal(life.ensureDeal(connection).id,first.id);
  assert.equal(life.all().length,1);
  const convoA=life.ensureConversation(connection);
  assert.equal(life.ensureConversation(connection).id,convoA.id);

  assert.equal(life.listFor(creator).length,1);
  assert.equal(life.listFor(brand).length,1);
  assert.equal(life.listFor(outsider).length,0);
  assert.ok(canReadDeal(first,creator));
  assert.ok(canReadDeal(first,brand));
  assert.equal(life.getFor(outsider,first.id),undefined);

  assert.throws(()=>life.submit(brand,first.id,'Ready','https://x.com/post'),/Only the creator/);
  assert.throws(()=>life.brandVerify(creator,first.id),/Only the brand/);
  assert.throws(()=>life.platformVerify(creator,first.id,'Creator cannot complete this.'),/Not allowed/);
  assert.throws(()=>life.platformVerify(outsider,first.id,'Outsider cannot complete this.'),/Not allowed/);
  assert.ok(validateDealSubmission('',''));
  assert.equal(validateDealSubmission('Draft is live','https://x.com/post'),'');

  const submitted=life.submit(creator,first.id,'Draft is live','https://x.com/post');
  assert.equal(submitted.status,'submitted');
  assert.equal(life.listFor(brand)[0].status,'submitted');
  assert.equal(life.submissions().length,1);
  assert.throws(()=>life.submit(creator,first.id,'Again','https://x.com/post'),/cannot be submitted/);
  assert.throws(()=>life.platformVerify(admin,first.id,'Admin override after review.'),/not in platform review/);
  assert.equal(life.notices().filter(n=>n.type==='deal_submitted').length,1);

  const brandVerified=life.brandVerify(brand,first.id,'Looks good');
  assert.equal(brandVerified.status,'completed');
  assert.ok(brandVerified.brandVerifiedAt>0);
  assert.ok(brandVerified.completedAt>0);
  assert.equal(brandVerified.brandVerifiedBy,brand);
  assert.equal(life.brandVerify(brand,first.id,'Looks good').status,'completed');
  assert.equal(life.notices().filter(n=>n.type==='deal_completed').length,1);
  assert.equal(life.notices().filter(n=>n.type==='deal_needs_verification'&&n.userId===admin).length,0);
  assert.throws(()=>life.platformVerify(creator,first.id,'Not allowed for creators.'),/Not allowed/);
  assert.throws(()=>life.platformVerify(brand,first.id,'Not allowed for brands.'),/Not allowed/);
  assert.throws(()=>life.platformVerify(outsider,first.id,'Not allowed for outsiders.'),/Not allowed/);
  assert.throws(()=>life.submit(creator,first.id,'Too late','https://x.com/x'),/no longer be changed/);
  assert.throws(()=>life.cancel(brand,first.id),/no longer be changed/);
  assert.throws(()=>life.openDispute(creator,first.id,'This delivery does not match the brief.'),/no longer be changed/);
  assert.ok(life.events().some(e=>e.action==='brand_verified'));
  assert.ok(life.events().some(e=>e.action==='deal_completed'));
  assert.ok(!life.events().some(e=>e.toStatus==='platform_review'));

  const revisionLife=createDealLifecycle();
  const rev=revisionLife.ensureDeal({...connection,id:'conn-rev'});
  revisionLife.submit(creator,rev.id,'First','https://example.com/one');
  const revised=revisionLife.requestRevision(brand,rev.id,'Please change the hook and add a clearer CTA.');
  assert.equal(revised.status,'revision_requested');
  const resubmitted=revisionLife.submit(creator,rev.id,'Updated draft','https://example.com/two');
  assert.equal(resubmitted.status,'submitted');
  assert.equal(revisionLife.submissions().length,2);

  const cancelLife=createDealLifecycle();
  const cancellable=cancelLife.ensureDeal({...connection,id:'conn-2'});
  assert.equal(cancelLife.cancel(creator,cancellable.id).status,'cancelled');
  assert.throws(()=>cancelLife.submit(creator,cancellable.id,'Nope','https://x.com/x'),/no longer be changed/);

  const disputeLife=createDealLifecycle();
  disputeLife.grantVerifier(admin);
  const disputed=disputeLife.ensureDeal({...connection,id:'conn-disp'});
  disputeLife.submit(creator,disputed.id,'Ready','https://example.com');
  assert.throws(()=>disputeLife.resolveDispute(admin,disputed.id,'completed','Looks fine after review.'),/disputed collaboration/);
  assert.throws(()=>disputeLife.openDispute(outsider,disputed.id,'This delivery does not match the brief.'),/Not allowed/);
  assert.equal(disputeLife.openDispute(creator,disputed.id,'This delivery does not match the brief.').status,'disputed');
  assert.throws(()=>disputeLife.openDispute(brand,disputed.id,'This delivery does not match the brief.'),/already has an open dispute|cannot be opened/);
  assert.throws(()=>disputeLife.resolveDispute(creator,disputed.id,'completed','Looks fine after review.'),/Not allowed/);
  assert.throws(()=>disputeLife.resolveDispute(outsider,disputed.id,'completed','Looks fine after review.'),/Not allowed/);
  const dismissed=disputeLife.resolveDispute(admin,disputed.id,'dismissed','No policy issue after review.');
  assert.equal(dismissed.status,'submitted');
  assert.equal(disputeLife.disputes()[0].status,'dismissed');

  const brandDispute=createDealLifecycle();
  brandDispute.grantVerifier(admin);
  const bd=brandDispute.ensureDeal({...connection,id:'conn-bd'});
  brandDispute.submit(creator,bd.id,'Ready','https://example.com');
  assert.equal(brandDispute.openDispute(brand,bd.id,'The live post was taken down early.').status,'disputed');
  assert.ok(model.isPlatformQueueStatus(brandDispute.getFor(admin,bd.id).status));
  assert.throws(()=>brandDispute.platformVerify(admin,bd.id,'Complete after platform review.'),/Resolve the dispute/);
  assert.throws(()=>brandDispute.resolveDispute(admin,bd.id,'completed','short'),/reason for this platform decision/);
  const resolved=brandDispute.resolveDispute(admin,bd.id,'completed','Live post confirmed after review.');
  assert.equal(resolved.status,'completed');
  assert.ok(resolved.platformVerifiedAt>0);
  assert.ok(brandDispute.events().some(e=>e.action==='dispute_resolved'&&e.note.includes('Live post confirmed')));
  assert.equal(brandDispute.getFor(admin,bd.id).status,'completed');

  const escalateLife=createDealLifecycle();
  escalateLife.grantVerifier(admin);
  const esc=escalateLife.ensureDeal({...connection,id:'conn-esc'});
  escalateLife.submit(creator,esc.id,'Ready','https://example.com');
  escalateLife.markDisputed(admin,esc.id,'Brand did not approve and the brief is contested.');
  assert.equal(escalateLife.getFor(admin,esc.id).status,'disputed');
  const adminMsg=escalateLife.sendPlatformMessage(admin,esc.id,'We are reviewing both sides of this collaboration.');
  assert.equal(adminMsg.fromPlatform,true);
  assert.equal(adminMsg.displayName,'CollabCy Admin');
  assert.throws(()=>escalateLife.sendPlatformMessage(brand,esc.id,'I am not admin.'),/Not allowed/);
  assert.ok(escalateLife.events().some(e=>e.action==='platform_message_sent'&&e.visibility==='admin'));

  const completedStay=createDealLifecycle();
  completedStay.grantVerifier(admin);
  const stay=completedStay.ensureDeal({...connection,id:'conn-stay'});
  completedStay.submit(creator,stay.id,'Ready','https://example.com');
  const alreadyDone=completedStay.brandVerify(brand,stay.id,'Looks good');
  assert.equal(alreadyDone.status,'completed');
  assert.equal(completedStay.brandVerify(brand,stay.id,'Looks good').status,'completed');
  assert.equal(completedStay.platformVerify(admin,stay.id,'Completed deals stay completed after review.').status,'completed');
  assert.equal(completedStay.getFor(creator,stay.id).status,'completed');

  assert.equal(model.nextDealStatus('active','submit','creator'),'submitted');
  assert.equal(model.nextDealStatus('submitted','brand_verify','brand'),'completed');
  assert.equal(model.nextDealStatus('platform_review','platform_verify','platform'),'completed');
  assert.equal(model.nextDealStatus('submitted','request_revision','brand'),'revision_requested');
  assert.throws(()=>model.nextDealStatus('submitted','platform_verify','platform'));
  assert.throws(()=>model.nextDealStatus('completed','cancel','brand'));
  assert.ok(model.dealTransitionError('submitted','brand_verify','creator'));
  assert.equal(model.dealTransitionError('submitted','brand_verify','brand'),'');
  assert.ok(!model.isPlatformQueueStatus('completed'));
  assert.ok(!model.isPlatformQueueStatus('brand_verified'));
  assert.ok(model.isPlatformQueueStatus('platform_review'));
  assert.ok(model.isPlatformQueueStatus('disputed'));

  assert.ok(!life.all().some(d=>String(d.id).startsWith('demo-')));
  assert.ok(!life.events().some(e=>e.id.startsWith('localStorage')));
  console.log('deal lifecycle tests passed');
};

try{
  main();
}finally{
  rmSync(out,{recursive:true,force:true});
}
