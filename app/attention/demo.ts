import type {MarketplaceState,Product} from './model';

// Sample data stays in the browser and is never seeded into Supabase.
export function createDemoMarketplace(now=Date.now()):MarketplaceState{
 const samples=[
  {name:'Orbit AI',slug:'orbit-ai',category:'AI Tools',description:'Turn rough ideas into clear drafts with your everyday AI workspace.',logo:'orbit',color:'#635bff',currentBid:48},
  {name:'Framebase',slug:'framebase',category:'Design',description:'A shared canvas for brand assets, moodboards, and your next big design.',logo:'frame',color:'#ed7954',currentBid:32},
  {name:'Stakly',slug:'stakly',category:'Developer Tools',description:'Keep project notes, code snippets, and release checklists in one place.',logo:'S',color:'#14866d',currentBid:18},
  {name:'Lumarii',slug:'lumarii',category:'Productivity',description:'Plan focused days and make steady progress on the work that matters.',logo:'L',color:'#bc548d',currentBid:8},
  {name:'Nova Notes',slug:'nova-notes',category:'Productivity',description:'Capture meeting notes and turn ideas into actionable tasks.',logo:'N',color:'#7064c4',currentBid:28},
  {name:'Pixel Nest',slug:'pixel-nest',category:'Design',description:'Discover ready-to-use design resources for your next launch.',logo:'P',color:'#d76094',currentBid:26},
  {name:'CloudKit Studio',slug:'cloudkit-studio',category:'Developer Tools',description:'Build and monitor small web projects from one simple workspace.',logo:'C',color:'#387abd',currentBid:24},
  {name:'Growth Garden',slug:'growth-garden',category:'Marketing',description:'Plan campaigns and track the ideas that bring your audience closer.',logo:'G',color:'#41815b',currentBid:22},
  {name:'Task Harbor',slug:'task-harbor',category:'SaaS',description:'Organize team projects with clear priorities and shared checklists.',logo:'T',color:'#398a97',currentBid:20},
  {name:'Pocket Ledger',slug:'pocket-ledger',category:'Finance',description:'Keep everyday expenses and monthly budgets neatly organized.',logo:'P',color:'#a27939',currentBid:16},
  {name:'Learn Loop',slug:'learn-loop',category:'Education',description:'Build a daily learning habit with short lessons and progress notes.',logo:'L',color:'#7862ad',currentBid:14},
  {name:'Play Sprout',slug:'play-sprout',category:'Gaming',description:'Find bite-sized puzzle games for a refreshing creative break.',logo:'P',color:'#bc6b40',currentBid:12},
  {name:'Bright Desk',slug:'bright-desk',category:'Apps',description:'Bring your bookmarks, reminders, and daily plans into one dashboard.',logo:'B',color:'#468891',currentBid:10},
  {name:'Prompt Pilot',slug:'prompt-pilot',category:'AI Tools',description:'Save reusable prompts and organize your favorite AI workflows.',logo:'P',color:'#b75c74',currentBid:6},
 ];
 const products:Product[]=samples.map((sample,index)=>{
  const id=`demo-${sample.slug}`;
  const listingStartsAt=now-(index+1)*3600000;
  const visitTimes=Array.from({length:Math.max(2,12-index)},(_,n)=>now-n*7200000-index*60000);
  return {...sample,id,brandId:'',brandName:sample.name,websiteUrl:`https://example.com/${sample.slug}`,tags:['Demo'],clickCount:visitTimes.length,visitTimes,status:'active',listingStartsAt,listingEndsAt:0,bids:[{id:`${id}-bid`,amount:sample.currentBid,createdAt:now-index*600000},{id:`${id}-initial`,amount:2,createdAt:listingStartsAt}]};
 });
 return {version:1,products,activity:products.map(p=>({id:`${p.id}-activity`,productId:p.id,type:'bid',amount:p.currentBid,rank:products.filter(other=>other.currentBid>p.currentBid).length+1,createdAt:p.bids[0].createdAt}))};
}
