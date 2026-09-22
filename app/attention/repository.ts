import type {ActivityEvent,MarketplaceState,Product} from './model';
import {getMarketplaceStats,getProjectedRank,isActive,safeWebsite,validateBid,LISTING_DAYS} from './model';
import {validateAttentionIncrement,validateAttentionListing} from './validation';
export type ListingInput=Pick<Product,'brandId'|'brandName'|'name'|'logo'|'websiteUrl'|'description'|'category'|'campaign'>&{initialBid:number};
export type AttentionLoadResult={products:Product[];activity:ActivityEvent[];error?:string;unavailable?:boolean};
export type AttentionBackend={
 sessionUserId():Promise<string|null>;
 isDemoSession():Promise<boolean>;
 load():Promise<AttentionLoadResult>;
 placeBid(productId:string,amount:number):Promise<{productId:string;bidId:string;amount:number;currentBid:number;rank:number;createdAt:number}>;
 recordVisit(productId:string):Promise<{clickCount:number}>;
 publish(input:ListingInput):Promise<Product>;
 subscribe(onChange:()=>void):()=>void;
};
const emptyState=():MarketplaceState=>({version:1,products:[],activity:[]});
export function createMarketplaceRepository(initial=emptyState(),backend?:AttentionBackend){
 let state=initial;let ownerId:string|null=null;let hydrated=false;let status:'loading'|'ready'|'error'=backend?'loading':'ready';let lastError:string|undefined;const listeners=new Set<()=>void>();const visitLock=new Map<string,number>();
 function emit(){listeners.forEach(fn=>fn());}
 function applyRemote(products:Product[],activity:ActivityEvent[]){hydrated=true;state={version:1,products,activity};emit();}
 async function pullRemote(){if(!backend)return;ownerId=await backend.sessionUserId();const remote=await backend.load();if(remote.unavailable||remote.error){lastError=remote.error||'Could not load the marketplace.';status='error';console.error('[attention]',lastError);if(!hydrated)applyRemote([],[]);else emit();return;}lastError=undefined;status='ready';applyRemote(remote.products,remote.activity);}
 function localBid(id:string,increment:number){const now=Date.now();const product=state.products.find(p=>p.id===id);const error=validateBid(state.products,id,increment,now);if(error||!product)throw new Error(error||'This listing has expired and cannot receive bids.');const nextBid=product.currentBid+increment;const rank=getProjectedRank(state.products,nextBid,id,now);state={...state,products:state.products.map(p=>p.id===id?{...p,currentBid:nextBid,bids:[{id:crypto.randomUUID(),amount:nextBid,createdAt:now},...p.bids]}:p),activity:[{id:crypto.randomUUID(),productId:id,type:'bid',amount:nextBid,rank,createdAt:now},...state.activity]};emit();return rank;}
 function localVisit(id:string){const now=Date.now();state={...state,products:state.products.map(p=>p.id===id?{...p,clickCount:p.clickCount+1,visitTimes:[now,...p.visitTimes]}:p)};emit();}
 function localCreate(input:ListingInput){const listingError=validateAttentionListing(input);if(listingError)throw new Error(listingError);const now=Date.now(),id=crypto.randomUUID();const base=input.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'product';const slug=state.products.some(p=>p.slug===base)?`${base}-${id.slice(0,8)}`:base;const product:Product={...input,id,slug,name:input.name.trim(),description:input.description.trim(),color:'#3267e8',tags:[],websiteUrl:safeWebsite(input.websiteUrl)!,currentBid:input.initialBid,clickCount:0,visitTimes:[],status:'active',listingStartsAt:now,listingEndsAt:now+LISTING_DAYS*86400000,bids:[{id:crypto.randomUUID(),amount:input.initialBid,createdAt:now}]};state={...state,products:[...state.products,product],activity:[{id:crypto.randomUUID(),productId:id,type:'listing',createdAt:now},...state.activity]};emit();return product;}
 return {
 subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};},getSnapshot:()=>state,getStatus:()=>status,getError:()=>lastError,
 initialize(){},
 hydrate(){return pullRemote();},
 refresh(){if(backend){void pullRemote();return;}state={...state};emit();},
 watchRemote(){if(!backend)return ()=>{};let timer:ReturnType<typeof setTimeout>|undefined;const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{void pullRemote();},200);};const stop=backend.subscribe(schedule);return ()=>{clearTimeout(timer);stop();};},
 getOwnerBrandId(_profileName:string){return ownerId||'';},
 getProducts:()=>state.products,getProduct:(slug:string)=>state.products.find(p=>p.slug===slug),getActivity:()=>state.activity,getBidHistory:(id:string)=>state.products.find(p=>p.id===id)?.bids??[],getMarketplaceStats:()=>getMarketplaceStats(state.products),
 simulateBid(id:string,increment:number){const incrementError=validateAttentionIncrement(increment);if(incrementError){if(backend)return Promise.reject(new Error(incrementError));throw new Error(incrementError);}if(backend){return (async()=>{const result=await backend.placeBid(id,increment);state={...state,products:state.products.map(p=>p.id===id?{...p,currentBid:result.currentBid,bids:[{id:result.bidId,amount:result.amount,createdAt:result.createdAt},...p.bids]}:p),activity:[{id:result.bidId,productId:id,type:'bid',amount:result.amount,rank:result.rank,createdAt:result.createdAt},...state.activity]};emit();await pullRemote();return result.rank;})();}return localBid(id,increment);},
 simulateVisit(id:string){if(backend){return (async()=>{const now=Date.now();if(now-(visitLock.get(id)||0)<5000)return;visitLock.set(id,now);try{const result=await backend.recordVisit(id);state={...state,products:state.products.map(p=>p.id===id?{...p,clickCount:result.clickCount,visitTimes:[now,...p.visitTimes]}:p),activity:[{id:crypto.randomUUID(),productId:id,type:'visit',createdAt:now},...state.activity]};emit();await pullRemote();}catch(error){visitLock.delete(id);throw error;}})();}localVisit(id);},
 createProduct(input:ListingInput){const listingError=validateAttentionListing(input);if(listingError){if(backend)return Promise.reject(new Error(listingError));throw new Error(listingError);}if(backend){return (async()=>{const product=await backend.publish(input);const listing:ActivityEvent={id:crypto.randomUUID(),productId:product.id,type:'listing',createdAt:product.listingStartsAt};applyRemote(state.products.some(p=>p.id===product.id)?state.products.map(p=>p.id===product.id?product:p):[...state.products,product],[listing,...state.activity]);await pullRemote();return product;})();}return localCreate(input);},
 isActive:(id:string)=>{const p=state.products.find(p=>p.id===id);return !!p&&isActive(p);}
 };
}
export type MarketplaceRepository=ReturnType<typeof createMarketplaceRepository>;
