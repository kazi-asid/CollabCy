import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const out=mkdtempSync(join(tmpdir(),'gohighnet-attention-'));
const DEMO_NAMES=['Orbit AI','Framebase','Stakly','Lumarii','Nova AI','PixelMind','TypeFlow','Crevo','Mindly','Renderize'];
const main=async()=>{
 const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','app/attention/model.ts','app/attention/validation.ts','app/attention/repository.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 assert.equal(build.status,0,build.stdout+build.stderr);writeFileSync(join(out,'package.json'),'{"type":"commonjs"}');
 const require=createRequire(import.meta.url),m=require(join(out,'model.js')),v=require(join(out,'validation.js')),{createMarketplaceRepository}=require(join(out,'repository.js'));
 const now=Date.now();
 const product=(over={})=>{
  const currentBid=over.currentBid??10,listingStartsAt=over.listingStartsAt??now-3600000,name=over.name||'Product';
  return {id:over.id||`id-${name.toLowerCase()}`,brandId:over.brandId??'',brandName:over.brandName||`${name} Studio`,name,slug:over.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),logo:over.logo||name[0],color:over.color||'#3267e8',websiteUrl:over.websiteUrl||'https://example.com',description:over.description||`${name} description.`,category:over.category||'SaaS',tags:over.tags||[],currentBid,clickCount:over.clickCount??0,visitTimes:over.visitTimes||[],status:over.status||'active',listingStartsAt,listingEndsAt:over.listingEndsAt??now+7*86400000,bids:over.bids||[{id:`bid-${name}`,amount:currentBid,createdAt:over.lastBidAt??listingStartsAt}],campaign:over.campaign};
 };
 const rankedThree=[product({id:'a',name:'fjrsj',slug:'fjrsj',currentBid:2000,listingStartsAt:now-90000}),product({id:'b',name:'TestProduct',slug:'testproduct',currentBid:50,listingStartsAt:now-60000}),product({id:'c',name:'LowBid',slug:'lowbid',currentBid:31,listingStartsAt:now-30000})];
 assert.deepEqual(m.getRankedProducts(rankedThree,now).map(p=>p.name),['fjrsj','TestProduct','LowBid']);
 const high=product({id:'product-1',name:'High',slug:'high',currentBid:42,category:'AI Tools',tags:['Productivity'],listingStartsAt:now-24*3600000,lastBidAt:now-2*3600000});
 const low=product({id:'product-2',name:'Low',slug:'low',currentBid:38,category:'Developer Tools',tags:['SaaS','Design'],listingStartsAt:now-24*3600000,lastBidAt:now-4*3600000});
 const finance=product({id:'product-3',name:'Ledger',slug:'ledger',currentBid:31,category:'Finance',tags:['Productivity'],listingStartsAt:now-24*3600000,lastBidAt:now-6*3600000});
 const stale=product({id:'product-4',name:'Stale',slug:'stale',currentBid:12,category:'Design',listingStartsAt:now-96*3600000,lastBidAt:now-72*3600000});
 const expired=product({id:'product-archive',name:'Expired',slug:'expired',currentBid:8,status:'expired',listingStartsAt:now-14*86400000,listingEndsAt:now-86400000,lastBidAt:now-10*86400000});
 const products=[high,low,finance,stale,expired];
 assert.equal(m.getRankedProducts(products,now).length,4);
 assert.equal(m.getRankedProducts(products,now)[0].name,'High');
 assert.equal(m.getFilteredProducts(products,{query:'',category:'All',time:'48h'},now).length,3);
 assert.equal(m.getFilteredProducts(products,{query:'finance',category:'All',time:'all'},now)[0].name,'Ledger');
 assert.equal(m.getFilteredProducts(products,{query:'unfindable',category:'All',time:'all'},now).length,0);
 assert.ok(m.getFilteredProducts(products,{query:'',category:'AI Tools',time:'all'},now).every(p=>p.category==='AI Tools'||p.tags.includes('AI Tools')));
 assert.equal(m.getMinimumBidForPosition(products,'product-2',now),5);
 assert.equal(m.getMinimumBidForPosition(products,'product-1',now),1);
 assert.equal(m.getProjectedRank(products,43,'product-2',now),1);
 assert.equal(m.getProjectedRank(products,42,'product-2',now),2);
 for(const increment of [0,NaN,Infinity,1,2,3,4,4.5,100001])assert.ok(m.validateBid(products,'product-2',increment,now));
 assert.equal(m.validateBid(products,'product-2',5,now),'');
 assert.ok(m.validateBid(products,'product-archive',1000,now));
 assert.equal(m.validateBid(products,'product-1',1,now),'');
 assert.equal(m.getRankedProducts(products,now+8*86400000).length,0);
 assert.equal(m.safeWebsite('javascript:alert(1)'),null);assert.equal(m.safeWebsite('https://user:password@example.com'),null);
 assert.equal(m.safeWebsite('ftp://example.com'),null);assert.equal(m.safeWebsite('data:text/html,hi'),null);assert.equal(m.safeWebsite('file:///tmp/x'),null);
 assert.equal(m.safeWebsite('https://localhost'),null);assert.equal(m.safeWebsite('https://example.com'),'https://example.com/');
 assert.equal(v.isAttentionProductId('not-a-uuid'),false);assert.equal(v.isAttentionProductId(''),false);
 assert.equal(v.isAttentionProductId('11111111-1111-4111-8111-111111111111'),true);
 assert.equal(v.validateAttentionIncrement(0),'Enter a valid bid amount.');
 assert.equal(v.validateAttentionIncrement(4.5),'Use a whole-dollar amount.');
 assert.equal(v.validateAttentionIncrement(5),'');
 assert.ok(v.validateAttentionListing({name:'X',websiteUrl:'javascript:alert(1)',description:'A product.',category:'SaaS',initialBid:10}));
 assert.equal(v.validateAttentionListing({name:'X',websiteUrl:'https://example.com',description:'A product.',category:'SaaS',initialBid:10}),'');

 const noSeed=names=>assert.ok(names.every(name=>!DEMO_NAMES.includes(name)),`demo product leaked: ${names.join(',')}`);
 function memoryBackend(seedProducts=[],seedActivity=[]){
  const store={products:seedProducts.map(p=>({...p,bids:p.bids.map(b=>({...b})),visitTimes:[...p.visitTimes]})),activity:seedActivity.map(a=>({...a})),published:[]};
  return {
   store,
   sessionUserId:async()=>null,
   isDemoSession:async()=>false,
   load:async()=>({products:store.products.map(p=>({...p,bids:p.bids.map(b=>({...b})),visitTimes:[...p.visitTimes]})),activity:store.activity.map(a=>({...a}))}),
   async publish(listing){
    const listingError=v.validateAttentionListing(listing);
    if(listingError)throw new Error(listingError);
    if(store.products.some(p=>p.name.toLowerCase()===listing.name.trim().toLowerCase()&&p.websiteUrl===listing.websiteUrl&&now-p.listingStartsAt<45000))throw new Error('This product was just listed. Please wait before listing it again.');
    const created={id:`remote-${store.published.length+1}`,brandId:'',brandName:listing.brandName,name:listing.name,slug:listing.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'product',logo:listing.logo,color:'#3267e8',websiteUrl:listing.websiteUrl,description:listing.description,category:listing.category,tags:[],currentBid:listing.initialBid,clickCount:0,visitTimes:[],status:'active',listingStartsAt:now,listingEndsAt:now+7*86400000,bids:[{id:`list-bid-${store.published.length+1}`,amount:listing.initialBid,createdAt:now}]};
    store.products=store.products.some(p=>p.id===created.id)?store.products.map(p=>p.id===created.id?created:p):[...store.products,created];
    store.activity=[{id:`list-${created.id}`,productId:created.id,type:'listing',createdAt:now},...store.activity];
    store.published.push(created.name);
    return created;
   },
   async placeBid(id,increment){
    const error=m.validateBid(store.products,id,increment,now);
    if(error)throw new Error(error);
    const product=store.products.find(p=>p.id===id);
    const current=product.currentBid+increment;
    const rank=m.getProjectedRank(store.products,current,id,now);
    product.currentBid=current;
    product.bids=[{id:`bid-${current}`,amount:current,createdAt:now},...product.bids];
    store.activity=[{id:`act-${current}`,productId:id,type:'bid',amount:current,rank,createdAt:now},...store.activity];
    return {productId:id,bidId:`bid-${current}`,amount:current,currentBid:current,rank,createdAt:now};
   },
   async recordVisit(id){
    const product=store.products.find(p=>p.id===id);
    product.clickCount+=1;
    product.visitTimes=[now,...product.visitTimes];
    store.activity=[{id:`visit-${product.clickCount}`,productId:id,type:'visit',createdAt:now},...store.activity];
    return {clickCount:product.clickCount};
   },
   subscribe:()=>()=>{}
  };
 }

 const emptyBackend=memoryBackend();
 const empty=createMarketplaceRepository(undefined,emptyBackend);
 await empty.hydrate();
 assert.equal(empty.getProducts().length,0);
 assert.equal(empty.getActivity().length,0);
 noSeed(empty.getProducts().map(p=>p.name));

 const oneBackend=memoryBackend([product({id:'fjrsj',name:'fjrsj',slug:'fjrsj',currentBid:2000})]);
 const one=createMarketplaceRepository(undefined,oneBackend);
 await one.hydrate();
 assert.equal(one.getProducts().length,1);
 assert.equal(one.getProducts()[0].name,'fjrsj');
 assert.equal(one.getProducts()[0].currentBid,2000);
 assert.deepEqual(m.getRankedProducts(one.getProducts(),now).map(p=>p.name),['fjrsj']);
 noSeed(one.getProducts().map(p=>p.name));

 const manyBackend=memoryBackend([product({id:'a',name:'fjrsj',slug:'fjrsj',currentBid:2000}),product({id:'b',name:'Orbit AI',slug:'orbit-ai',currentBid:42}),product({id:'c',name:'Framebase',slug:'framebase',currentBid:38})]);
 const many=createMarketplaceRepository(undefined,manyBackend);
 await many.hydrate();
 assert.equal(many.getProducts().length,3);
 assert.deepEqual(m.getRankedProducts(many.getProducts(),now).map(p=>p.name),['fjrsj','Orbit AI','Framebase']);

 const errorBackend={...memoryBackend(),load:async()=>({products:[],activity:[],error:'Could not load the marketplace.'})};
 const errored=createMarketplaceRepository(undefined,errorBackend);
 await errored.hydrate();
 assert.equal(errored.getProducts().length,0);
 assert.equal(errored.getStatus(),'error');
 noSeed(errored.getProducts().map(p=>p.name));

 const persist=memoryBackend();
 const guest=createMarketplaceRepository(undefined,persist);
 await guest.hydrate();
 assert.equal(guest.getProducts().length,0);
 const listed=await guest.createProduct({brandId:'should-not-own',brandName:'Guest Co',name:'TestProduct',logo:'T',websiteUrl:'https://example.com',description:'Listed without an account.',category:'Apps',initialBid:50});
 assert.equal(listed.brandId,'');assert.equal(listed.currentBid,50);assert.equal(persist.store.published.length,1);assert.equal(persist.store.products.length,1);
 await guest.hydrate();
 assert.equal(guest.getProducts().length,1);
 assert.equal(guest.getProduct('testproduct').name,'TestProduct');
 assert.equal(guest.getActivity()[0].type,'listing');
 assert.equal(await guest.simulateBid(listed.id,5),1);
 assert.equal(guest.getProduct('testproduct').currentBid,55);
 assert.equal(persist.store.products[0].currentBid,55);
 assert.equal(guest.getBidHistory(listed.id)[0].amount,55);
 const climb=memoryBackend([
  product({id:'leader',name:'Leader',slug:'leader',currentBid:5000}),
  product({id:'fjrsj-live',name:'fjrsj',slug:'fjrsj-live',currentBid:2000}),
 ]);
 const anonBid=createMarketplaceRepository(undefined,climb);
 await anonBid.hydrate();
 assert.equal(await climb.sessionUserId(),null);
 assert.equal(await anonBid.simulateBid('fjrsj-live',3001),1);
 assert.equal(anonBid.getProduct('fjrsj-live').currentBid,5001);
 assert.equal(climb.store.products.find(p=>p.id==='fjrsj-live').currentBid,5001);
 assert.equal(anonBid.getBidHistory('fjrsj-live')[0].amount,5001);
 assert.notEqual(anonBid.getBidHistory('fjrsj-live')[0].amount,3001);
 assert.ok(anonBid.getActivity().some(a=>a.type==='bid'&&a.productId==='fjrsj-live'&&a.amount===5001));
 assert.deepEqual(m.getRankedProducts(anonBid.getProducts(),now).map(p=>`${p.name}:${p.currentBid}`),['fjrsj:5001','Leader:5000']);

 await guest.simulateVisit(listed.id);
 assert.equal(guest.getProduct('testproduct').clickCount,1);
 assert.equal(persist.store.products[0].clickCount,1);
 assert.ok(guest.getActivity().some(a=>a.type==='visit'));
 const reloaded=createMarketplaceRepository(undefined,persist);
 await reloaded.hydrate();
 assert.equal(reloaded.getProducts().length,1);
 assert.equal(reloaded.getProduct('testproduct').currentBid,55);
 assert.equal(reloaded.getProduct('testproduct').clickCount,1);
 assert.ok(reloaded.getActivity().some(a=>a.type==='listing'));
 assert.ok(reloaded.getActivity().some(a=>a.type==='bid'));
 assert.ok(reloaded.getActivity().some(a=>a.type==='visit'));
 noSeed(reloaded.getProducts().map(p=>p.name));
 assert.equal(new Set(reloaded.getProducts().map(p=>p.id)).size,reloaded.getProducts().length);

 const together=memoryBackend([product({id:'fjrsj',name:'fjrsj',slug:'fjrsj',currentBid:2000})]);
 const board=createMarketplaceRepository(undefined,together);
 await board.hydrate();
 await board.createProduct({brandId:'',brandName:'Guest Co',name:'TestProduct',logo:'T',websiteUrl:'https://example.com',description:'Second real product.',category:'Apps',initialBid:50});
 await board.hydrate();
 assert.deepEqual(m.getRankedProducts(board.getProducts(),now).map(p=>`${p.name}:${p.currentBid}`),['fjrsj:2000','TestProduct:50']);
 const afterRefresh=createMarketplaceRepository(undefined,together);
 await afterRefresh.hydrate();
 assert.deepEqual(m.getRankedProducts(afterRefresh.getProducts(),now).map(p=>`${p.name}:${p.currentBid}`),['fjrsj:2000','TestProduct:50']);
 noSeed(afterRefresh.getProducts().map(p=>p.name));

 const incrementHigh=product({id:'product-1',name:'High',slug:'high',currentBid:42});
 const incrementLow=product({id:'product-2',name:'Low',slug:'low',currentBid:38});
 const incrementBackend=memoryBackend([incrementHigh,incrementLow]);
 const incrementRepo=createMarketplaceRepository(undefined,incrementBackend);
 await incrementRepo.hydrate();
 await assert.rejects(()=>Promise.resolve(incrementRepo.simulateBid('product-2',4)));
 assert.equal(incrementRepo.getProduct('low').currentBid,38);
 assert.equal(await incrementRepo.simulateBid('product-2',5),1);
 assert.equal(incrementRepo.getProduct('low').currentBid,43);
 const leaderBackend=memoryBackend([product({id:'product-1',name:'High',slug:'high',currentBid:42})]);
 const leader=createMarketplaceRepository(undefined,leaderBackend);
 await leader.hydrate();
 assert.equal(await leader.simulateBid('product-1',1),1);
 assert.equal(leader.getProduct('high').currentBid,43);

 let failed=0;
 const failing={...memoryBackend(),publish:async()=>{failed+=1;throw new Error('Could not publish this listing.');},load:async()=>({products:[],activity:[]})};
 const blocked=createMarketplaceRepository(undefined,failing);
 await blocked.hydrate();
 await assert.rejects(()=>blocked.createProduct({brandId:'',brandName:'Guest Studio',name:'QA Product',logo:'Q',websiteUrl:'https://example.com',description:'A preview product.',category:'SaaS',initialBid:10}));
 assert.equal(failed,1);assert.equal(blocked.getProduct('qa-product'),undefined);assert.equal(blocked.getProducts().length,0);

 const invalidUrl=createMarketplaceRepository(undefined,persist);
 await assert.rejects(()=>invalidUrl.createProduct({brandId:'',brandName:'Guest',name:'Bad URL',logo:'B',websiteUrl:'javascript:alert(1)',description:'Should not publish.',category:'SaaS',initialBid:10}));
 await assert.rejects(()=>invalidUrl.createProduct({brandId:'',brandName:'Guest',name:'Bad URL',logo:'B',websiteUrl:'https://user:pass@example.com',description:'Should not publish.',category:'SaaS',initialBid:10}));
 assert.equal(persist.store.published.length,1);

 const dup=createMarketplaceRepository(undefined,persist);
 await assert.rejects(()=>dup.createProduct({brandId:'',brandName:'Guest Co',name:'TestProduct',logo:'T',websiteUrl:'https://example.com',description:'Listed without an account.',category:'Apps',initialBid:50}));
 assert.equal(persist.store.products.length,1);

 await assert.rejects(()=>Promise.resolve(incrementRepo.simulateBid('product-2',4.5)));
 const raceBackend=memoryBackend([product({id:'product-1',name:'High',slug:'high',currentBid:42}),product({id:'product-2',name:'Low',slug:'low',currentBid:38})]);
 const race=createMarketplaceRepository(undefined,raceBackend);
 await race.hydrate();
 assert.equal(await race.simulateBid('product-2',5),1);
 assert.equal(raceBackend.store.products.find(p=>p.id==='product-2').currentBid,43);
 assert.equal(await race.simulateBid('product-2',1),1);
 assert.equal(race.getProduct('low').currentBid,44);

 const visitFail={...memoryBackend([product({id:'p1',name:'Keep',slug:'keep',currentBid:10})]),recordVisit:async()=>{throw new Error('Could not record this visit.');}};
 const visitRepo=createMarketplaceRepository(undefined,visitFail);
 await visitRepo.hydrate();
 await assert.rejects(()=>visitRepo.simulateVisit('p1'));
 assert.equal(visitRepo.getProduct('keep').clickCount,0);

 const seededStart=createMarketplaceRepository();
 assert.equal(seededStart.getProducts().length,0);
 noSeed(seededStart.getProducts().map(p=>p.name));
 assert.ok(!persist.store.published.some(name=>DEMO_NAMES.includes(name)));

 console.log('PASS: empty supabase returns no products, no seed injection, real products rank together, guest listing/bid/visit persist, increment bidding, refresh reads supabase state, duplicates and demo inserts are rejected.');
};
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{rmSync(out,{recursive:true,force:true});});
