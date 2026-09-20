import type {MarketplaceState,Product} from './model';
export function createDemoState(now=Date.now()):MarketplaceState{
 const entries:[string,string,string,string,string[],number,number,number,string][]=[
 ['Orbit AI','Your AI copilot for modern work.','AI Tools','#132d53',['Productivity'],42,184,2,'orbit'],
 ['Framebase','Turn ideas into beautiful sites.','Developer Tools','#161e2e',['SaaS','Design'],38,142,4,'frame'],
 ['Stakly','The modern finance stack.','Finance','#40c777',['Productivity'],31,97,6,'S'],
 ['Lumarii','Create content with AI.','AI Tools','#536dfe',['Marketing'],28,84,8,'L'],
 ['Nova AI','Build the next generation.','AI Tools','#3267e8',['Developer Tools'],24,76,12,'N'],
 ['PixelMind','AI images for creators.','Design','#7896bd',['AI Tools'],21,62,14,'P'],
 ['TypeFlow','Write. Edit. Publish. Faster.','Productivity','#9786df',['Marketing'],18,58,18,'T'],
 ['Crevo','Your creative operating system.','Marketing','#ec397a',['Apps'],16,49,24,'C'],
 ['Mindly','A calmer, sharper you.','Apps','#152c4b',['Education','Productivity'],14,43,60,'M'],
 ['Renderize','3D content, simplified.','Design','#f08bbe',['Gaming','Developer Tools'],12,38,72,'R']];
 const products:Product[]=entries.map(([name,description,category,color,tags,currentBid,clickCount,hours,logo],i)=>({id:`product-${i+1}`,brandId:`demo-brand-${i+1}`,brandName:`${name} Studio`,name,slug:name.toLowerCase().replace(/ /g,'-'),logo,color,websiteUrl:`https://example.com/?product=${encodeURIComponent(name)}`,description,category,tags,currentBid,clickCount,visitTimes:Array.from({length:Math.min(clickCount,12+i)},(_,j)=>now-j*180000),status:'active',listingStartsAt:now-(i<4?24:96)*3600000,listingEndsAt:now+7*86400000,bids:[{id:`seed-${i}-a`,amount:currentBid,createdAt:now-hours*3600000},{id:`seed-${i}-b`,amount:Math.max(1,currentBid-5),createdAt:now-(hours+8)*3600000}],...(i===0?{campaign:{title:'Make everyday work a little smarter.',description:'Share an original workflow with your community.',requirements:'An engaged audience interested in useful AI tools.',budget:250,existingCampaignId:'orbit'}}:{})}));
 products.push({...products[9],id:'product-archive',slug:'renderize-early-access',name:'Renderize Early Access',status:'expired',listingStartsAt:now-14*86400000,listingEndsAt:now-86400000,visitTimes:[],bids:[{id:'archive-bid',amount:8,createdAt:now-10*86400000}],currentBid:8});
 return {version:1,products,activity:products.filter(p=>p.status==='active').map(p=>({id:`activity-${p.id}`,productId:p.id,type:'bid' as const,amount:p.currentBid,createdAt:p.bids[0].createdAt})).sort((a,b)=>b.createdAt-a.createdAt)};
}
