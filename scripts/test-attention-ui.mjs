import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const out=mkdtempSync(join(tmpdir(),'collabcy-ui-'));
const read=path=>readFileSync(path,'utf8');
try{
  const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','app/attention/presentation.ts','app/attention/share-card.ts','app/attention/site-visit-counter.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  writeFileSync(join(out,'package.json'),'{"type":"commonjs"}');
  const require=createRequire(import.meta.url);
  const {marketplacePlacement,shareWebsite,productLogoSource}=require(join(out,'attention/presentation.js'));
  const {getRankedProducts}=require(join(out,'attention/model.js'));
  const {paintCard,paintWebsite}=require(join(out,'attention/share-card.js'));
  const {createSiteVisitCounter}=require(join(out,'attention/site-visit-counter.js'));
  // Explicit test-only inputs. They are never inserted into the marketplace.
  const fixture=(id,bid)=>({id,name:'UI test',brandName:'Renderer test',slug:'test',websiteUrl:'https://example.com/path?q=1',logo:'',description:'Test only',category:'SaaS',tags:[],currentBid:bid,clickCount:0,visitTimes:[],status:'active',listingStartsAt:1,listingEndsAt:0,bids:[{amount:bid,createdAt:2}]});
  const products=[fixture('b',9),fixture('a',10),fixture('c',9)];
  const before=JSON.stringify(products),ranked=getRankedProducts(products);
  assert.deepEqual(ranked.map(p=>p.id),['a','b','c']);
  assert.deepEqual(ranked.map(p=>marketplacePlacement(ranked,p.id)),[{crown:true,position:1},{crown:false,position:1},{crown:false,position:2}]);
  assert.equal(JSON.stringify(products),before,'Presentation must not mutate bid data');
  assert.deepEqual(marketplacePlacement([], 'missing'),{crown:false,position:0});
  assert.equal(marketplacePlacement(ranked,'c').position,2,'Filtering must not renumber existing ranks');
  assert.equal(productLogoSource('https://example.com/logo.png'),'https://example.com/logo.png');
  assert.equal(productLogoSource('javascript:alert(1)'),null);
  assert.equal(productLogoSource(''),null);
  assert.equal(shareWebsite('example.com').href,'https://example.com/');
  assert.equal(shareWebsite('http://example.com/path').origin,'http://example.com');
  assert.equal(shareWebsite('javascript:alert(1)'),null);

  function canvas(){
    const calls=[];const gradient={addColorStop(){}};
    const ctx={font:'',fillStyle:'',letterSpacing:'0px',textAlign:'left',save(){},restore(){},beginPath(){},roundRect(){},fill(){},stroke(){},strokeRect(){},fillRect(){},clip(){},drawImage(){calls.push({image:true});},createLinearGradient(){return gradient;},createRadialGradient(){return gradient;},measureText(text){return {width:text.length*(parseFloat(this.font.match(/(\d+)px/)?.[1]||'20')*.61+parseFloat(this.letterSpacing))};},fillText(text,x,y){calls.push({text,x,y,width:this.measureText(text).width,font:this.font});}};
    return {width:0,height:0,getContext:()=>ctx,calls,ctx};
  }
  for(const url of ['https://example.com/path?q=1','http://example.com/',`https://${'a'.repeat(60)}.${'b'.repeat(60)}.com/${'long-path/'.repeat(60)}`]){
    const c=canvas();await paintCard(c,{...fixture('b',9),websiteUrl:url},2);
    assert.equal(c.width,1200);assert.equal(c.height,630);
    const address=c.calls.filter(call=>call.x===720);
    assert.ok(address.some(call=>call.text==='WEBSITE'));
    assert.ok(address.some(call=>/^https?:\/\//.test(call.text)));
    assert.ok(address.every(call=>call.width<=414),'Address must fit the reserved right-hand region');
    assert.ok(c.calls.some(call=>call.text==='#1 · Regular leaderboard'));
  }
  const missing=canvas();paintWebsite(missing.ctx,'');assert.equal(missing.calls.length,0);
  const leader=canvas();await paintCard(leader,fixture('a',10),1);assert.ok(leader.calls.some(c=>c.text==='#1 · The Crown Jewel'));
  globalThis.Image=class {async decode(){throw new Error('Broken logo');}};
  const failed=canvas();await paintCard(failed,{...fixture('a',10),logo:'https://example.com/missing.png'},1);
  assert.ok(failed.calls.some(call=>call.text==='U'),'Broken logos render the actual product initial');

  let time=0,resolveRequest;const requests=[];
  const counter=createSiteVisitCounter({now:()=>time,visitId:()=> 'same-session',request:(method,id)=>{requests.push({method,id});return new Promise(resolve=>{resolveRequest=resolve;});}});
  const first=counter.refresh();const strictMode=counter.refresh();assert.equal(first,strictMode);assert.equal(requests.length,1);
  resolveRequest({totalVisits:'42',trackingBeganAt:'2026-10-09T00:00:00Z'});await first;
  assert.equal(counter.getSnapshot().total,'42');await counter.refresh();assert.equal(requests.length,1);
  time=30000;const refresh=counter.refresh();assert.deepEqual(requests[1],{method:'GET',id:undefined});resolveRequest({totalVisits:'43'});await refresh;assert.equal(counter.getSnapshot().total,'43');
  let attempts=0;const retryIds=[];
  const retry=createSiteVisitCounter({now:()=>time,visitId:()=> 'stable-id',request:async(method,id)=>{retryIds.push(id);if(attempts++===0)throw Error('Unavailable');return {totalVisits:'0'};}});
  await retry.refresh();assert.equal(retry.getSnapshot().status,'unavailable');assert.equal(retry.getSnapshot().total,null);
  time+=30000;await retry.refresh();assert.deepEqual(retryIds,['stable-id','stable-id']);assert.equal(retry.getSnapshot().total,'0');

  const audience=read('app/attention/audience.tsx'),pages=read('app/attention/pages.tsx'),share=read('app/attention/share.tsx'),logos=read('app/attention/components.tsx'),styles=read('app/collabcy.css');
  const markup=audience.slice(audience.indexOf('return <div className="audience-pulse"'));
  assert.ok(markup.indexOf('audience-pulse-live')<markup.indexOf('audience-pulse-visits'));
  assert.ok(markup.indexOf('audience-pulse-visits')<markup.indexOf('<ActivityTicker'));
  assert.doesNotMatch(audience,/preview-visits|visits in this browser/);
  assert.match(pages,/regular=filtered.filter\(product=>product.id!==leader\?\.id\)/);
  assert.match(pages,/Crown Jewel featured category/);assert.match(pages,/<ProductLogo product=\{product\}\/>/);
  assert.match(logos,/onError=\{\(\)=>setFailed\(source\)\}/);
  assert.match(logos,/className="fixed-bid-dialog"/);
  assert.match(logos,/className="bid-dialog-layout"/);
  assert.match(logos,/fetch\('\/api\/attention\/checkout'/,'Bid dialog must retain the production checkout handler');
  assert.doesNotMatch(logos,/simulateBid/,'Bid dialog must not introduce simulated bidding');
  assert.match(styles,/@media\(max-width:640px\)[\s\S]*\.attention-dialog\.fixed-bid-dialog\{[^}]*100vw[^}]*safe-area-inset-left[^}]*safe-area-inset-right/);
  assert.match(styles,/\.attention-dialog\.fixed-bid-dialog\{[^}]*left:50%!important[^}]*top:50%!important[^}]*translate:-50% -50%!important[^}]*transform:none!important/);
  assert.doesNotMatch(styles,/\.attention-dialog\.fixed-bid-dialog\{[^}]*transform:translate\(-50%,-50%\)/,'Bid dialog must not stack transform centering on the shared translate utility');
  assert.match(styles,/@media\(max-width:640px\)[\s\S]*\.fixed-bid-dialog \.bid-dialog-layout\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*overflow-x:hidden[^}]*overflow-y:auto/);
  assert.match(styles,/\.fixed-bid-dialog \.attention-dialog-actions \.btn\{[^}]*min-width:0/);
  assert.match(audience,/total visits<span className="audience-total-suffix"> in CollabCy<\/span>/,'Mobile may shorten the label without changing the global metric');
  assert.match(styles,/@media\(max-width:700px\)[\s\S]*grid-template-columns:max-content minmax\(90px,max-content\) minmax\(0,1fr\)/,'Mobile audience bar must reserve readable space for all three items');
  assert.match(styles,/@media\(max-width:700px\)[\s\S]*\.audience-pulse>\.audience-pulse-visits\{[^}]*min-width:90px[^}]*white-space:nowrap/,'Persisted visit total must remain visible on one line');
  assert.match(styles,/@media\(max-width:700px\)[\s\S]*\.audience-total-suffix\{display:none\}/,'Mobile must use the compact total-visits label');
  assert.match(styles,/@media\(max-width:700px\)[\s\S]*\.audience-dock \.audience-ticker\{[^}]*min-width:0[^}]*overflow:hidden/,'Latest activity must truncate without displacing the visit total');
  assert.match(share,/paintCard\(frame,product,rank\)/);assert.match(share,/context.drawImage\(frame,0,0\)/);assert.match(share,/canvas.toBlob/);
  assert.match(share,/safeWebsite\(product.websiteUrl\)/);assert.match(share,/\/discover\/product\//);
  const sql=read('supabase/migrations/20261011000000_collabcy_site_visits.sql');
  assert.match(sql,/on conflict \(visit_id\) do nothing/);assert.match(sql,/if inserted = 1/);assert.match(sql,/total=total\+1/);
  assert.match(sql,/enable row level security/);assert.match(sql,/from public, anon, authenticated/);assert.match(sql,/to service_role/);
  assert.doesNotMatch(sql,/attention_products|attention_bids|dodo/i);
  // Execute the real endpoint's localhost gate without any database access.
  const ts=require('typescript');const serverModule={exports:{}};
  const compiled=ts.transpileModule(read('lib/site-visits.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let dbCalls=0;new Function('require','module','exports',compiled)(()=>({getSupabaseAdmin(){dbCalls++;throw Error('Must not call');}}),serverModule,serverModule.exports);
  const previous=process.env.COLLABCY_SITE_VISITS_ENABLED;
  const productionVisit=()=>new Request('https://collabcy.app/api/site-visits',{method:'POST',headers:{origin:'https://collabcy.app','content-type':'application/json'},body:JSON.stringify({visitId:'550e8400-e29b-41d4-a716-446655440000'})});
  delete process.env.COLLABCY_SITE_VISITS_ENABLED;
  const absent=await serverModule.exports.siteVisitsResponse(productionVisit());
  assert.equal(absent.status,503);assert.equal(dbCalls,0);
  process.env.COLLABCY_SITE_VISITS_ENABLED='false';
  const disabled=await serverModule.exports.siteVisitsResponse(productionVisit());
  assert.equal(disabled.status,503);assert.equal(dbCalls,0);
  process.env.COLLABCY_SITE_VISITS_ENABLED='true';
  const local=await serverModule.exports.siteVisitsResponse(new Request('http://localhost:5173/api/site-visits',{method:'POST'}));
  assert.equal(local.status,503);assert.equal(dbCalls,0);
  const badOrigin=await serverModule.exports.siteVisitsResponse(new Request('https://collabcy.app/api/site-visits',{method:'POST',headers:{origin:'https://example.com'}}));assert.equal(badOrigin.status,403);assert.equal(dbCalls,0);
  if(previous===undefined)delete process.env.COLLABCY_SITE_VISITS_ENABLED;else process.env.COLLABCY_SITE_VISITS_ENABLED=previous;
  console.log('Attention UI, share renderer, site-visit refresh/deduplication and security tests passed.');
}finally{rmSync(out,{recursive:true,force:true});}
