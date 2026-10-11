import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const out=mkdtempSync(join(tmpdir(),'gohighnet-attention-'));
const root=process.cwd();
const DEMO_NAMES=['Orbit AI','Framebase','Stakly','Lumarii','Nova AI','PixelMind','TypeFlow','Crevo','Mindly','Renderize'];
const main=async()=>{
 const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','app/attention/model.ts','app/attention/validation.ts','app/attention/repository.ts','app/attention/demo.ts','--outDir',out,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 assert.equal(build.status,0,build.stdout+build.stderr);writeFileSync(join(out,'package.json'),'{"type":"commonjs"}');
 const payOut=join(out,'pay');
 const payBuild=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/attention-payments.ts','lib/attention-reconciliation.ts','app/attention/model.ts','app/attention/validation.ts','--rootDir',root,'--outDir',payOut,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 assert.equal(payBuild.status,0,payBuild.stdout+payBuild.stderr);writeFileSync(join(payOut,'package.json'),'{"type":"commonjs"}');
 const require=createRequire(import.meta.url),m=require(join(out,'model.js')),v=require(join(out,'validation.js')),{createMarketplaceRepository}=require(join(out,'repository.js')),pay=require(join(payOut,'lib/attention-payments.js')),recon=require(join(payOut,'lib/attention-reconciliation.js'));
 const {createDemoMarketplace}=require(join(out,'demo.js'));
 const demo=createMarketplaceRepository(createDemoMarketplace());
 assert.equal(demo.getProducts().length,14);
 assert.equal(new Set(demo.getProducts().map(p=>p.id)).size,14);
 assert.equal(m.getRankedProducts(demo.getProducts()).length,14);
 assert.equal(demo.simulateBid('demo-lumarii',50),1);
 assert.equal(demo.getProduct('lumarii').currentBid,58);
 const visits=demo.getProduct('lumarii').clickCount;
 demo.simulateVisit('demo-lumarii');
 assert.equal(demo.getProduct('lumarii').clickCount,visits+1);
 await demo.hydrate();
 demo.refresh();
 assert.equal(demo.getProduct('lumarii').currentBid,58);
 assert.equal(createDemoMarketplace().products.find(p=>p.slug==='lumarii').currentBid,8);
 const DodoPayments=require('dodopayments').DodoPayments;
 const dodoEnvOut=join(out,'dodo-env');
 const dodoEnvBuild=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/dodo-environment.ts','--outDir',dodoEnvOut,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 assert.equal(dodoEnvBuild.status,0,dodoEnvBuild.stdout+dodoEnvBuild.stderr);writeFileSync(join(dodoEnvOut,'package.json'),'{"type":"commonjs"}');
 const dodoEnv=require(join(dodoEnvOut,'dodo-environment.js'));
 const liveSdk=new DodoPayments({bearerToken:'placeholder',environment:'live_mode',baseURL:null});
 const testSdk=new DodoPayments({bearerToken:'placeholder',environment:'test_mode',baseURL:null});
 assert.equal(liveSdk.baseURL,'https://live.dodopayments.com');
 assert.ok(!liveSdk.baseURL.includes('test.dodopayments.com'));
 assert.equal(testSdk.baseURL,'https://test.dodopayments.com');
 assert.equal(dodoEnv.dodoPaymentsEnvironmentFromValue('live_mode'),'live_mode');
 assert.equal(dodoEnv.dodoPaymentsBaseUrlFor('live_mode'),liveSdk.baseURL);
 assert.doesNotMatch(dodoEnv.dodoPaymentsBaseUrlFor('live_mode'),/test\.dodopayments\.com/);
 assert.equal(dodoEnv.dodoPaymentsEnvironmentFromValue('test_mode'),'test_mode');
 assert.equal(dodoEnv.dodoPaymentsBaseUrlFor('test_mode'),testSdk.baseURL);
 assert.equal(dodoEnv.dodoPaymentsEnvironmentFromValue(' live_mode '),'live_mode');
 assert.throws(()=>dodoEnv.dodoPaymentsEnvironmentFromValue('live'));
 assert.throws(()=>dodoEnv.dodoPaymentsEnvironmentFromValue('production'));
 assert.throws(()=>dodoEnv.dodoPaymentsEnvironmentFromValue(undefined));
 assert.throws(()=>dodoEnv.dodoPaymentsEnvironmentFromValue(''));
 const now=Date.now();
 const product=(over={})=>{
  const currentBid=over.currentBid??10,listingStartsAt=over.listingStartsAt??now-3600000,name=over.name||'Product';
  const slug=over.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return {id:over.id||`id-${name.toLowerCase()}`,brandId:over.brandId??'',brandName:over.brandName||`${name} Studio`,name,slug,logo:over.logo||name[0],color:over.color||'#3267e8',websiteUrl:over.websiteUrl||`https://${slug||'product'}.example.com`,description:over.description||`${name} description.`,category:over.category||'SaaS',tags:over.tags||[],currentBid,clickCount:over.clickCount??0,visitTimes:over.visitTimes||[],status:over.status||'active',listingStartsAt,listingEndsAt:over.listingEndsAt??0,bids:over.bids||[{id:`bid-${name}`,amount:currentBid,createdAt:over.lastBidAt??listingStartsAt}],campaign:over.campaign};
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
 assert.equal(m.getFilteredProducts(products,{query:'',category:'All',time:'24h'},now).length,3);
 assert.equal(m.getFilteredProducts(products,{query:'finance',category:'All',time:'all'},now)[0].name,'Ledger');
 assert.equal(m.getFilteredProducts(products,{query:'unfindable',category:'All',time:'all'},now).length,0);
 assert.ok(m.getFilteredProducts(products,{query:'',category:'AI Tools',time:'all'},now).every(p=>p.category==='AI Tools'||p.tags.includes('AI Tools')));
 assert.equal(m.getMinimumBidForPosition(products,'product-2',now),5);
 assert.equal(m.getMinimumBidForPosition(products,'product-1',now),1);
 assert.equal(m.getProjectedRank(products,43,'product-2',now),1);
 assert.equal(m.getProjectedRank(products,42,'product-2',now),2);
 for(const increment of [0,NaN,Infinity,1,4.5,100001])assert.ok(m.validateBid(products,'product-2',increment,now));
 assert.equal(m.validateBid(products,'product-2',2,now),'');
 assert.equal(m.validateBid(products,'product-2',3,now),'');
 assert.equal(m.validateBid(products,'product-2',5,now),'');
 assert.ok(m.validateBid(products,'product-archive',1000,now));
 assert.equal(m.validateBid(products,'product-1',1,now),'Enter at least $2.');
 assert.equal(m.recommendedIncrementToLead(products,'product-2',now),5);
 assert.equal(m.recommendedIncrementToLead(products,'product-1',now),2);
 assert.equal(m.getProjectedRank(products,40,'product-2',now),2);
 const overtake=[product({id:'lead',name:'Lead',currentBid:8}),product({id:'chase',name:'Chase',currentBid:4})];
 assert.equal(m.recommendedIncrementToLead(overtake,'chase',now),5);
 assert.equal(m.validateBid(overtake,'chase',2,now),'');
 assert.equal(m.getProjectedRank(overtake,6,'chase',now),2);
 assert.equal(m.getProjectedRank(overtake,9,'chase',now),1);
 const alreadyLead=[product({id:'a',name:'A',currentBid:5}),product({id:'b',name:'B',currentBid:4})];
 assert.equal(m.recommendedIncrementToLead(alreadyLead,'b',now),2);
 assert.equal(m.getProjectedRank(alreadyLead,6,'b',now),1);
 assert.equal(m.getProjectedRank(products,50),1);
 assert.equal(m.getProjectedRank(products,2),5);
 assert.equal(m.getRankedProducts(products,now+8*86400000).length,4);
 assert.equal(m.getRankedProducts([product({listingEndsAt:now-1})],now).length,0);
 assert.ok(m.isActive(product({listingEndsAt:0}),now+365*86400000));
 assert.equal(m.safeWebsite('javascript:alert(1)'),null);assert.equal(m.safeWebsite('https://user:password@example.com'),null);
 assert.equal(m.safeWebsite('ftp://example.com'),null);assert.equal(m.safeWebsite('data:text/html,hi'),null);assert.equal(m.safeWebsite('file:///tmp/x'),null);
 assert.equal(m.safeWebsite('https://localhost'),null);assert.equal(m.safeWebsite('https://example.com'),'https://example.com/');
 assert.equal(m.normalizeWebsiteInput('example.com'),'https://example.com');
 assert.equal(m.normalizeWebsiteInput('www.example.com'),'https://www.example.com');
 assert.equal(m.normalizeWebsiteInput('https://example.com'),'https://example.com');
 assert.equal(m.normalizeWebsiteInput('http://example.com'),'http://example.com');
 assert.equal(m.normalizeWebsiteInput(' https://example.com '),'https://example.com');
 assert.equal(m.safeWebsite('example.com'),'https://example.com/');
 assert.equal(m.safeWebsite('www.example.com'),'https://www.example.com/');
 assert.equal(m.safeWebsite('http://example.com'),'http://example.com/');
 assert.equal(m.safeWebsite('https://example.com'),'https://example.com/');
 assert.ok(!String(m.safeWebsite('https://example.com')).includes('https://https://'));
 assert.equal(m.safeWebsite('not a domain'),null);
 assert.equal(m.safeWebsite(''),null);
 assert.equal(m.activityTickerText({type:'listing'},'ydtydyfdfu'),'ydtydyfdfu joined');
 assert.equal(m.activityTickerText({type:'visit'},'boob'),'boob received a visit');
 assert.equal(m.activityTickerText({type:'bid',rank:2},'hdeg'),'hdeg moved to #2');
 assert.equal(m.activityTickerText({type:'bid'},'takeme'),'takeme updated bid');
 assert.equal(v.isAttentionProductId('not-a-uuid'),false);assert.equal(v.isAttentionProductId(''),false);
 assert.equal(v.isAttentionProductId('11111111-1111-4111-8111-111111111111'),true);
 assert.equal(v.validateAttentionIncrement(0),'Enter a valid bid amount.');
 assert.equal(v.validateAttentionIncrement(4.5),'Use a whole-dollar amount.');
 assert.equal(v.validateAttentionIncrement(5),'');
 assert.equal(pay.validatePaidBidIncrement(1),'Enter at least $2.');
 assert.equal(pay.validatePaidBidIncrement(2),'');
 assert.equal(pay.amountCentsFromIncrement(5),500);
 assert.deepEqual(pay.parseCheckoutBody({product_id:'11111111-1111-4111-8111-111111111111',increment:5}),{product_id:'11111111-1111-4111-8111-111111111111',increment:5});
 assert.equal(pay.parseCheckoutBody({product_id:'11111111-1111-4111-8111-111111111111',increment:5,user_id:'x'}).error,'Enter a valid bid amount.');
 assert.equal(pay.parseCheckoutBody({product_id:'11111111-1111-4111-8111-111111111111',increment:1}).error,'Enter at least $2.');
 assert.equal(pay.parseListingCheckoutBody({increment:15,listing:{name:'X',websiteUrl:'https://example.com',description:'A product.',category:'SaaS'}}).increment,15);
 assert.equal(pay.parseListingCheckoutBody({increment:2,listing:{name:'X',websiteUrl:'https://example.com',description:'A product.',category:'SaaS'}}).increment,2);
 assert.equal(pay.parseListingCheckoutBody({increment:2,listing:{name:'X',websiteUrl:'example.com',description:'',category:'SaaS'}}).listing.websiteUrl,'https://example.com/');
 assert.equal(pay.parseListingCheckoutBody({increment:2,listing:{name:'X',websiteUrl:'example.com',description:'',category:'SaaS'}}).listing.description,'');
 assert.equal(pay.parseListingCheckoutBody({product_id:'11111111-1111-4111-8111-111111111111',increment:15,listing:{name:'X'}}).error,'Enter a valid bid amount.');
 assert.equal(pay.listingCheckoutReturnPath(),'/?paid=1');
 assert.ok(pay.browserReturnDoesNotApplyBid('1'));
 assert.equal(pay.checkoutReturnPath('fjrsj'),'/discover/product/fjrsj?paid=1');
 assert.equal(typeof pay.bidLoginPath,'undefined');
 assert.equal(pay.isPaymentSucceededEvent('payment.succeeded'),true);
 assert.equal(pay.isPaymentSucceededEvent('payment.processing'),false);
 assert.equal(pay.fulfillmentAction({eventType:'payment.processing',paymentStatus:'pending',webhookId:'wh_1',existingWebhookId:null,dodoPaymentId:'pay_1',existingDodoPaymentId:null,amountCents:500,paidAmount:500,currency:'USD',metadataMatch:true}),'ignore_event');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'applied',webhookId:'wh_1',existingWebhookId:'wh_1',dodoPaymentId:'pay_1',existingDodoPaymentId:'pay_1',amountCents:500,paidAmount:500,currency:'USD',metadataMatch:true}),'already_applied');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'paid',webhookId:'wh_2',existingWebhookId:'wh_1',dodoPaymentId:'pay_1',existingDodoPaymentId:'pay_1',amountCents:500,paidAmount:500,currency:'USD',metadataMatch:true}),'continue_apply');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'pending',webhookId:'wh_1',existingWebhookId:null,dodoPaymentId:'pay_1',existingDodoPaymentId:null,amountCents:500,paidAmount:400,currency:'USD',metadataMatch:true}),'reject_mismatch');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'pending',webhookId:'wh_1',existingWebhookId:null,dodoPaymentId:'pay_1',existingDodoPaymentId:null,amountCents:500,paidAmount:500,currency:'USD',metadataMatch:true}),'mark_paid_and_apply');
 assert.equal(pay.paidAmountMatches(200,200,'USD'),true);
 assert.equal(pay.paidAmountMatches(200,400,'USD'),false);
 assert.equal(pay.paidAmountMatches(200,23762,'INR'),false);
 assert.equal(pay.paidAmountMatches(200,23762,'INR',{amount:236,currency:'USD'}),true);
 assert.equal(pay.classifyPaidAmount(300,300,'USD'),'usd_match');
 assert.equal(pay.classifyPaidAmount(300,272,'GBP',{amount:272,currency:'GBP'}),'converted');
 assert.equal(pay.paidAmountMatches(300,272,'GBP',{amount:272,currency:'GBP'}),false);
 assert.equal(pay.classifyPaidAmount(300,272,'GBP'),'converted');
 assert.equal(pay.classifyPaidAmount(300,0,'GBP'),'mismatch');
 assert.equal(pay.classifyPaidAmount(300,272,''),'mismatch');
 assert.equal(pay.classifyPaidAmount(200,23762,'INR'),'converted');
 assert.equal(pay.classifyPaidAmount(200,23762,'INR',{amount:236,currency:'USD'}),'usd_settlement');
 const gbpMeta={payment_id:'ead97d2d-ea48-4d65-8bb6-b5a46abc3617',product_id:'bc1d0cae-b355-42c4-b239-b3367ceb09ac',increment:'3'};
 const gbpPayment={payment_id:'pay_gbp',status:'succeeded',checkout_session_id:'cks_gbp',currency:'GBP',total_amount:272,metadata:gbpMeta,product_cart:[{product_id:'pdt_attention'}]};
 const webhookCart=[{product_id:'pdt_attention'}];
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:gbpPayment}),true);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,status:'processing'}}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,total_amount:0}}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_other',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:gbpPayment}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:{...gbpMeta,increment:'99'},dodoProductId:'pdt_attention',payment:gbpPayment}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,product_cart:[{product_id:'pdt_other'}]},webhookProductCart:webhookCart}),false);
 const {product_cart: _omitCart,...gbpWithoutCart}=gbpPayment;
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:gbpWithoutCart}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:gbpWithoutCart,webhookProductCart:webhookCart}),true);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,product_cart:null},webhookProductCart:webhookCart}),true);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,product_cart:[]},webhookProductCart:webhookCart}),true);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,product_cart:null},webhookProductCart:[]}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,product_cart:null},webhookProductCart:[{product_id:'pdt_other'}]}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,payment_id:'pay_other'},webhookProductCart:webhookCart}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,metadata:{...gbpMeta,product_id:'00000000-0000-4000-8000-000000000000'}}}),false);
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_gbp',checkoutSessionId:'cks_gbp',metadata:gbpMeta,dodoProductId:'pdt_attention',payment:{...gbpPayment,status:'failed'}}),false);
 const eurPayment={payment_id:'pay_eur',status:'succeeded',checkout_session_id:'cks_eur',currency:'EUR',total_amount:278,metadata:{payment_id:'11111111-1111-4111-8111-111111111111',product_id:'22222222-2222-4222-8222-222222222222',increment:'3'},product_cart:[{product_id:'pdt_attention'}]};
 assert.equal(pay.classifyPaidAmount(300,278,'EUR',{amount:278,currency:'EUR'}),'converted');
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_eur',checkoutSessionId:'cks_eur',metadata:eurPayment.metadata,dodoProductId:'pdt_attention',payment:eurPayment}),true);
 const inrConvertedPayment={payment_id:'pay_inr',status:'succeeded',checkout_session_id:'cks_inr',currency:'INR',total_amount:23762,metadata:{payment_id:'7082899b-474a-40a4-b1f4-da4f7d1e8a52',product_id:'0389d9bf-09de-4364-97b2-026eb2327d10',increment:'2'}};
 assert.equal(pay.classifyPaidAmount(200,23762,'INR'),'converted');
 assert.equal(pay.convertedPaymentMatches({dodoPaymentId:'pay_inr',checkoutSessionId:'cks_inr',metadata:inrConvertedPayment.metadata,dodoProductId:'pdt_attention',payment:inrConvertedPayment,webhookProductCart:webhookCart}),true);
 const gbpExtract=pay.extractPaymentSucceeded({type:'payment.succeeded',data:{...gbpPayment}});
 assert.deepEqual(gbpExtract.product_cart,[{product_id:'pdt_attention'}]);
 const ts=require('typescript');
 const webhookSrc=readFileSync(join(root,'lib/attention-webhook.ts'),'utf8').replace(/from ["']@\/lib\/([^"']+)["']/g,'from "./$1"');
 const webhookJs=ts.transpileModule(webhookSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const webhookModule={exports:{}};
 Function('require','exports','module',webhookJs)((name)=>{
  if(name==='./attention-payments')return pay;
  if(name==='./dodo')return {attentionBidProductId:()=>'pdt_attention',dodoWebhookKey:()=>'whsec_test',getDodoClient:()=>{throw new Error('default client unused');}};
  if(name==='./supabase-admin')return {getSupabaseAdmin:()=>{throw new Error('default admin unused');}};
  return require(name);
 },webhookModule.exports,webhookModule);
 const gbpEvent={type:'payment.succeeded',data:{payment_id:'pay_gbp',checkout_session_id:'cks_gbp',total_amount:272,currency:'GBP',settlement_amount:272,settlement_currency:'GBP',metadata:gbpMeta,product_cart:[{product_id:'pdt_attention'}]}};
 const postWebhook=async(event,runtime)=>webhookModule.exports.handleDodoWebhook(new Request('https://example.com/api/webhooks/dodo',{method:'POST',headers:{'webhook-id':'wh_dup','content-type':'application/json'},body:JSON.stringify(event)}),runtime);
 const claimApplyRuntime=(retrievePayment,event=gbpEvent)=>{
  const calls=[];
  let claimed=false;
  return {calls,runtime:{unwrap:()=>event,retrievePayment,dodoProductId:()=>'pdt_attention',rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='claim_paid_attention_bid_payment'){
    if(claimed)return {data:{ok:true,reason:'already_applied'},error:null};
    claimed=true;
    return {data:{ok:true,reason:'marked_paid'},error:null};
   }
   if(name==='apply_paid_attention_bid')return {data:{ok:true,reason:'applied'},error:null};
   return {data:null,error:{code:'unknown'}};
  }}};
 };
 const retrieveFail=await postWebhook(gbpEvent,{unwrap:()=>gbpEvent,retrievePayment:async()=>{throw new Error('dodo down');},dodoProductId:()=>'pdt_attention',rpc:async()=>({data:null,error:null})});
 assert.equal(retrieveFail.status,503);
 const retrieveBad=await postWebhook(gbpEvent,{unwrap:()=>gbpEvent,retrievePayment:async()=>({...gbpPayment,status:'failed'}),dodoProductId:()=>'pdt_attention',rpc:async()=>({data:null,error:null})});
 assert.equal(retrieveBad.status,400);
 const conflictCart=await postWebhook(gbpEvent,{unwrap:()=>gbpEvent,retrievePayment:async()=>({...gbpPayment,product_cart:[{product_id:'pdt_other'}]}),dodoProductId:()=>'pdt_attention',rpc:async()=>({data:null,error:null})});
 assert.equal(conflictCart.status,400);
 const bothMissing=await postWebhook({...gbpEvent,data:{...gbpEvent.data,product_cart:null}},{unwrap:()=>({...gbpEvent,data:{...gbpEvent.data,product_cart:null}}),retrievePayment:async()=>({...gbpPayment,product_cart:[]}),dodoProductId:()=>'pdt_attention',rpc:async()=>({data:null,error:null})});
 assert.equal(bothMissing.status,400);
 const fallbackOk=claimApplyRuntime(async()=>({...gbpPayment,product_cart:null}));
 const fallbackRes=await postWebhook(gbpEvent,fallbackOk.runtime);
 assert.equal(fallbackRes.status,200);
 assert.equal((await fallbackRes.json()).result,'applied');
 const usdEvent={type:'payment.succeeded',data:{payment_id:'pay_usd',checkout_session_id:'cks_usd',total_amount:300,currency:'USD',metadata:{payment_id:'33333333-3333-4333-8333-333333333333',product_id:'44444444-4444-4444-8444-444444444444',increment:'3'}}};
 const usdPath=claimApplyRuntime(async()=>{throw new Error('usd should not retrieve');},usdEvent);
 const usdRes=await postWebhook(usdEvent,usdPath.runtime);
 assert.equal(usdRes.status,200);
 const eurEvent={type:'payment.succeeded',data:{payment_id:'pay_eur',checkout_session_id:'cks_eur',total_amount:278,currency:'EUR',settlement_amount:278,settlement_currency:'EUR',metadata:eurPayment.metadata,product_cart:[{product_id:'pdt_attention'}]}};
 const eurPath=claimApplyRuntime(async()=>eurPayment,eurEvent);
 const eurRes=await postWebhook(eurEvent,eurPath.runtime);
 assert.equal(eurRes.status,200);
 const inrEventPayload={type:'payment.succeeded',data:{payment_id:'pay_inr',checkout_session_id:'cks_inr',total_amount:23762,currency:'INR',metadata:inrConvertedPayment.metadata,product_cart:[{product_id:'pdt_attention'}]}};
 const inrPath=claimApplyRuntime(async()=>({...inrConvertedPayment,product_cart:null}),inrEventPayload);
 const inrRes=await postWebhook(inrEventPayload,inrPath.runtime);
 assert.equal(inrRes.status,200);
 const duplicatePath=claimApplyRuntime(async()=>gbpPayment);
 const first=await postWebhook(gbpEvent,duplicatePath.runtime);
 assert.equal(first.status,200);
 assert.equal((await first.json()).result,'applied');
 const duplicate=await postWebhook(gbpEvent,duplicatePath.runtime);
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).result,'already_applied');
 assert.deepEqual(duplicatePath.calls.map(c=>c.name),['claim_paid_attention_bid_payment','apply_paid_attention_bid','claim_paid_attention_bid_payment']);
 assert.equal(duplicatePath.calls[0].args.p_amount_cents,300);
 assert.equal(duplicatePath.calls[0].args.p_currency,'USD');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'pending',webhookId:'wh_1',existingWebhookId:null,dodoPaymentId:'pay_1',existingDodoPaymentId:null,amountCents:300,paidAmount:272,currency:'GBP',metadataMatch:true,settlement:{amount:272,currency:'GBP'}}),'reject_mismatch');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'pending',webhookId:'wh_1',existingWebhookId:null,dodoPaymentId:'pay_1',existingDodoPaymentId:null,amountCents:300,paidAmount:272,currency:'GBP',metadataMatch:true,settlement:{amount:272,currency:'GBP'},convertedConfirmed:true}),'mark_paid_and_apply');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'pending',webhookId:'wh_1',existingWebhookId:null,dodoPaymentId:'pay_1',existingDodoPaymentId:null,amountCents:300,paidAmount:272,currency:'GBP',metadataMatch:false,convertedConfirmed:true}),'reject_mismatch');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'applied',webhookId:'wh_1',existingWebhookId:'wh_1',dodoPaymentId:'pay_1',existingDodoPaymentId:'pay_1',amountCents:300,paidAmount:272,currency:'GBP',metadataMatch:true,settlement:{amount:272,currency:'GBP'},convertedConfirmed:true}),'already_applied');
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'paid',webhookId:'wh_2',existingWebhookId:'wh_1',dodoPaymentId:'pay_1',existingDodoPaymentId:'pay_1',amountCents:300,paidAmount:272,currency:'GBP',metadataMatch:true,settlement:{amount:272,currency:'GBP'},convertedConfirmed:true}),'continue_apply');
 const inrEvent=pay.extractPaymentSucceeded({type:'payment.succeeded',data:{payment_id:'pay_test',checkout_session_id:'cks_test',total_amount:23762,currency:'INR',settlement_amount:236,settlement_currency:'USD',metadata:{payment_id:'7082899b-474a-40a4-b1f4-da4f7d1e8a52',product_id:'0389d9bf-09de-4364-97b2-026eb2327d10',increment:'2'}}});
 assert.equal(inrEvent.currency,'INR');
 assert.equal(inrEvent.total_amount,23762);
 assert.equal(inrEvent.settlement_currency,'USD');
 assert.equal(inrEvent.settlement_amount,236);
 assert.equal(inrEvent.metadata.user_id,undefined);
 assert.equal(pay.paidAmountMatches(Number(inrEvent.metadata.increment)*100,inrEvent.total_amount,inrEvent.currency,{amount:inrEvent.settlement_amount,currency:inrEvent.settlement_currency}),true);
 assert.equal(pay.fulfillmentAction({eventType:'payment.succeeded',paymentStatus:'pending',webhookId:'wh_1',existingWebhookId:null,dodoPaymentId:'pay_1',existingDodoPaymentId:null,amountCents:200,paidAmount:23762,currency:'INR',metadataMatch:true,settlement:{amount:236,currency:'USD'}}),'mark_paid_and_apply');
 const meta=pay.checkoutMetadata({payment_id:'p',product_id:'prod',increment:5});
 assert.equal(typeof meta.increment,'string');
 assert.equal(meta.user_id,undefined);
 assert.ok(pay.metadataMatchesPending({id:'p',user_id:null,product_id:'prod',increment:5},{payment_id:'p',product_id:'prod',increment:'5'}));
 assert.ok(v.validateAttentionListing({name:'X',websiteUrl:'javascript:alert(1)',description:'A product.',category:'SaaS',initialBid:10}));
 assert.ok(v.validateAttentionListing({name:'X',websiteUrl:'https://example.com',description:'A product.',category:'SaaS',initialBid:1}));
 assert.equal(v.validateAttentionListing({name:'X',websiteUrl:'https://example.com',description:'A product.',category:'SaaS',initialBid:2}),'');
 assert.equal(v.validateAttentionListing({name:'X',websiteUrl:'https://example.com',description:'A product.',category:'SaaS',initialBid:10}),'');
 assert.equal(v.validateAttentionListing({name:'X',websiteUrl:'example.com',description:'',category:'SaaS',initialBid:2}),'');
 assert.equal(v.validateAttentionListing({name:'X',websiteUrl:'www.example.com',description:'  ',category:'SaaS',initialBid:2}),'');
 assert.ok(v.validateAttentionListing({name:'X',websiteUrl:'not a domain',description:'',category:'SaaS',initialBid:2}));
 assert.ok(v.validateAttentionListing({name:'X',websiteUrl:'javascript:alert(1)',description:'',category:'SaaS',initialBid:2}));
 assert.equal(m.websiteListingKey('https://www.Example.com/path/?q=1#hash'),m.websiteListingKey('example.com'));
 assert.equal(m.websiteListingKey('http://example.com/'),m.websiteListingKey('https://example.com'));
 assert.notEqual(m.websiteListingKey('https://app.example.com'),m.websiteListingKey('https://example.com'));
 assert.notEqual(m.websiteListingKey('https://example.org'),m.websiteListingKey('https://example.com'));
 assert.equal(pay.ALREADY_LISTED_MESSAGE,'Already listed — this website is already on CollabCy. Bid more on the existing listing to increase its position.');
 assert.equal(pay.alreadyListedBidPath('octopusx'),'/discover/product/octopusx?bid=1');
 const liveDup=product({id:'live-site',name:'Live',slug:'live',websiteUrl:'https://octopusx.ai/?utm=x',currentBid:3});
 assert.equal(m.findExistingListingByWebsite([liveDup],'https://www.octopusx.ai/about',now)?.id,'live-site');
 assert.equal(m.findExistingListingByWebsite([product({...liveDup,status:'expired'})],'https://octopusx.ai',now),null);
 const reconOk=recon.planOctopusXReconciliation({
  products:[{id:recon.OCTOPUS_CANONICAL_LISTING_ID,status:'active',current_bid:3},{id:recon.OCTOPUS_SIX_DOLLAR_LISTING_ID,status:'active',current_bid:6},{id:recon.OCTOPUS_THIRD_DRAFT_LISTING_ID,status:'draft',current_bid:0}],
  payments:[
   {id:recon.OCTOPUS_THREE_DOLLAR_PAYMENT_ID,product_id:recon.OCTOPUS_CANONICAL_LISTING_ID,increment:3,amount_cents:300,status:'applied',kind:'listing',dodo_payment_id:recon.OCTOPUS_THREE_DODO_PAYMENT_ID},
   {id:recon.OCTOPUS_SIX_DOLLAR_PAYMENT_ID,product_id:recon.OCTOPUS_SIX_DOLLAR_LISTING_ID,increment:6,amount_cents:600,status:'applied',kind:'listing',dodo_payment_id:recon.OCTOPUS_SIX_DODO_PAYMENT_ID},
   {id:recon.OCTOPUS_THIRD_PAYMENT_ID,product_id:recon.OCTOPUS_THIRD_DRAFT_LISTING_ID,increment:6,amount_cents:600,status:'pending',kind:'listing',dodo_payment_id:null},
  ],
 });
 assert.equal(reconOk.safe,true);
 assert.equal(reconOk.combinedBid,9);
 assert.deepEqual(reconOk.hideListingIds,[recon.OCTOPUS_SIX_DOLLAR_LISTING_ID,recon.OCTOPUS_THIRD_DRAFT_LISTING_ID]);
 const reconBlock=recon.planOctopusXReconciliation({products:reconOk&&[],payments:[{id:recon.OCTOPUS_THIRD_PAYMENT_ID,product_id:recon.OCTOPUS_THIRD_DRAFT_LISTING_ID,increment:6,amount_cents:600,status:'applied',kind:'listing',dodo_payment_id:'pay_other'}]});
 assert.equal(reconBlock.safe,false);
 assert.ok(reconBlock.blockers.includes('third_checkout_has_successful_payment'));

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
    const existing=m.findExistingListingByWebsite(store.products,listing.websiteUrl,now);
    if(existing)throw new Error('Already listed — this website is already on CollabCy. Bid more on the existing listing to increase its position.');
    if(store.products.some(p=>p.name.toLowerCase()===listing.name.trim().toLowerCase()&&p.websiteUrl===listing.websiteUrl&&now-p.listingStartsAt<45000))throw new Error('This product was just listed. Please wait before listing it again.');
    const created={id:`remote-${store.published.length+1}`,brandId:'',brandName:listing.brandName,name:listing.name,slug:listing.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'product',logo:listing.logo,color:'#3267e8',websiteUrl:listing.websiteUrl,description:listing.description,category:listing.category,tags:[],currentBid:listing.initialBid,clickCount:0,visitTimes:[],status:'active',listingStartsAt:now,listingEndsAt:0,bids:[{id:`list-bid-${store.published.length+1}`,amount:listing.initialBid,createdAt:now}]};
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
 const blankListed=createMarketplaceRepository().createProduct({brandId:'',brandName:'Guest Co',name:'NoDescProduct',logo:'N',websiteUrl:'example.com',description:'',category:'Apps',initialBid:2});
 assert.equal(blankListed.description,'');
 assert.equal(blankListed.websiteUrl,'https://example.com/');
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
 await assert.rejects(()=>Promise.resolve(incrementRepo.simulateBid('product-2',1)));
 assert.equal(incrementRepo.getProduct('low').currentBid,38);
 assert.equal(await incrementRepo.simulateBid('product-2',2),2);
 assert.equal(incrementRepo.getProduct('low').currentBid,40);
 assert.equal(await incrementRepo.simulateBid('product-2',5),1);
 assert.equal(incrementRepo.getProduct('low').currentBid,45);
 const leaderBackend=memoryBackend([product({id:'product-1',name:'High',slug:'high',currentBid:42})]);
 const leader=createMarketplaceRepository(undefined,leaderBackend);
 await leader.hydrate();
 assert.equal(await leader.simulateBid('product-1',2),1);
 assert.equal(leader.getProduct('high').currentBid,44);

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
 await assert.rejects(()=>dup.createProduct({brandId:'',brandName:'Other Co',name:'OtherName',logo:'O',websiteUrl:'https://www.example.com/about?x=1',description:'Same site.',category:'Apps',initialBid:6}));
 assert.equal(persist.store.products.length,1);

 await assert.rejects(()=>Promise.resolve(incrementRepo.simulateBid('product-2',4.5)));
 const raceBackend=memoryBackend([product({id:'product-1',name:'High',slug:'high',currentBid:42}),product({id:'product-2',name:'Low',slug:'low',currentBid:38})]);
 const race=createMarketplaceRepository(undefined,raceBackend);
 await race.hydrate();
 assert.equal(await race.simulateBid('product-2',5),1);
 assert.equal(raceBackend.store.products.find(p=>p.id==='product-2').currentBid,43);
 assert.equal(await race.simulateBid('product-2',2),1);
 assert.equal(race.getProduct('low').currentBid,45);

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
