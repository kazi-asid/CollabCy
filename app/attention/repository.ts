import type {MarketplaceState,Product} from './model';
import {getMarketplaceStats,getProjectedRank,isActive,safeWebsite,validateBid,attentionCategories,LISTING_DAYS} from './model';
import {createDemoState} from './seed';
export type ListingInput=Pick<Product,'brandId'|'brandName'|'name'|'logo'|'websiteUrl'|'description'|'category'|'campaign'>&{initialBid:number};
export function createMarketplaceRepository(initial=createDemoState()){
 let state=initial;const listeners=new Set<()=>void>();const key='gohighnet-attention-v1';
 function emit(){listeners.forEach(fn=>fn());}
 function commit(next:MarketplaceState){state=next;try{localStorage.setItem(key,JSON.stringify(state));}catch{/* Preview remains usable when storage is unavailable. */}emit();}
 return {
 subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};},getSnapshot:()=>state,
 initialize(){try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(parsed.version===1&&Array.isArray(parsed.products)&&Array.isArray(parsed.activity)&&parsed.products.every((p:Product)=>p.id&&p.slug&&Array.isArray(p.tags)&&Array.isArray(p.bids)&&Array.isArray(p.visitTimes)&&safeWebsite(p.websiteUrl)&&Number.isFinite(p.currentBid)&&Number.isFinite(p.listingEndsAt))){state=parsed;emit();}}}catch{/* Fall back to the deterministic demo. */}},
 refresh(){state={...state};emit();},
 getProducts:()=>state.products,getProduct:(slug:string)=>state.products.find(p=>p.slug===slug),getActivity:()=>state.activity,getBidHistory:(id:string)=>state.products.find(p=>p.id===id)?.bids??[],getMarketplaceStats:()=>getMarketplaceStats(state.products),
 simulateBid(id:string,amount:number){const now=Date.now();const error=validateBid(state.products,id,amount,now);if(error)throw new Error(error);const rank=getProjectedRank(state.products,amount,id,now);commit({...state,products:state.products.map(p=>p.id===id?{...p,currentBid:amount,bids:[{id:crypto.randomUUID(),amount,createdAt:now},...p.bids]}:p),activity:[{id:crypto.randomUUID(),productId:id,type:'bid',amount,rank,createdAt:now},...state.activity]});return rank;},
 simulateVisit(id:string){const now=Date.now();commit({...state,products:state.products.map(p=>p.id===id?{...p,clickCount:p.clickCount+1,visitTimes:[now,...p.visitTimes]}:p)});},
 createProduct(input:ListingInput){if(!input.name.trim()||!input.description.trim()||!safeWebsite(input.websiteUrl)||!attentionCategories.includes(input.category))throw new Error('Add a product name, description, category, and valid website.');if(!Number.isInteger(input.initialBid)||input.initialBid<1||input.initialBid>100000)throw new Error('Initial bid must be a whole dollar between $1 and $100,000.');if(input.campaign&&(!input.campaign.title.trim()||!input.campaign.description.trim()||!input.campaign.requirements.trim()||!Number.isFinite(input.campaign.budget)||input.campaign.budget<1))throw new Error('Complete the optional creator opportunity, including its budget.');const now=Date.now(),id=crypto.randomUUID();const base=input.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'product';const slug=state.products.some(p=>p.slug===base)?`${base}-${id.slice(0,8)}`:base;const product:Product={...input,id,slug,name:input.name.trim(),description:input.description.trim(),color:'#3267e8',tags:[],websiteUrl:safeWebsite(input.websiteUrl)!,currentBid:input.initialBid,clickCount:0,visitTimes:[],status:'active',listingStartsAt:now,listingEndsAt:now+LISTING_DAYS*86400000,bids:[{id:crypto.randomUUID(),amount:input.initialBid,createdAt:now}]};commit({...state,products:[...state.products,product],activity:[{id:crypto.randomUUID(),productId:id,type:'listing',createdAt:now},...state.activity]});return product;},
 isActive:(id:string)=>{const p=state.products.find(p=>p.id===id);return !!p&&isActive(p);}
 };
}
export type MarketplaceRepository=ReturnType<typeof createMarketplaceRepository>;
