export type Role='creator'|'brand';
export type Campaign={id:string;brand:string;title:string;description:string;category:string;budget:number;maxBudget:number;platform:string;deliverable:string;color:string;letter:string;featured:boolean;days:number;status?:string;requirements?:string;applications?:number;created:number;expires:number;owner?:boolean;};
export const categories=['All categories','AI & Technology','Productivity','Design & Creative','Business & SaaS'];
export function campaignLetter(name:string){
  const ch=(name||'').trim().charAt(0);
  return /[a-z]/i.test(ch)?ch.toLowerCase():'c';
}
export type Creator={id:string;name:string;handle:string;initials:string;bio:string;niche:string;platform:string;followers:number;impressions:number;rate:number;rating:number;reviews:number;available:boolean;color:string;location:string;engagement:number;avatar?:string;platforms?:string[];website?:string;portfolio?:string[];};
export type SocialAccount={id:string;platform:string;handle:string;url:string;followers:number;impressions:number;engagement:number;verified:boolean;};
export type Profile={name:string;email:string;bio:string;handle:string;website:string;niche:string;platforms:string[];followers:number;impressions:number;rate:number;location:string;available:boolean;avatar?:string;portfolio:string[];};
export type DealStatus='pending'|'negotiating'|'awaiting-funds'|'in-progress'|'in-review'|'revision'|'completed'|'declined'|'disputed'|'active'|'submitted'|'revision_requested'|'cancelled'|'brand_verified'|'platform_review';
export type Deal={id:string;campaignId:string;title:string;partner:string;initials:string;color:string;price:number;status:DealStatus;incoming:boolean;terms:string;deadline:string;delivery:string;messages:{id:string;body:string;mine:boolean;time:string}[];rating?:number;review?:string;kind?:'application'|'connection';handle?:string;avatar?:string;niche?:string;followers?:number;impressions?:number;createdAt?:number;updatedAt?:number;applicationStatus?:ApplicationStatus;connectionStatus?:ConnectionStatus;dealId?:string;dealStatus?:string;deliverable?:string;requirements?:string;submissionNote?:string;revisionNote?:string;};
export type ApplicationStatus='pending'|'accepted'|'rejected'|'withdrawn';
export type ConnectionStatus='active'|'closed';
export type CampaignApplication={id:string;campaignId:string;campaignTitle:string;campaignBrand:string;campaignColor:string;creatorId:string;creatorName:string;creatorAvatar?:string;creatorHandle:string;creatorRate:number;creatorNiche:string;creatorFollowers:number;creatorImpressions:number;message:string;proposedRate:number;status:ApplicationStatus;created:number;initiatedBy:'creator'|'brand';};
export type Connection={id:string;campaignId:string;applicationId?:string;brandId:string;creatorId:string;status:ConnectionStatus;created:number;campaignTitle:string;campaignBrand:string;campaignColor:string;partnerName:string;partnerHandle:string;partnerAvatar?:string;proposedRate:number;message:string;conversationId?:string;};
export type NotificationType='new_message'|'application_received'|'application_accepted'|'application_rejected'|'connection_created'|'deal_submitted'|'deal_revision_requested'|'deal_completed'|'deal_cancelled'|'deal_brand_verified'|'deal_platform_verified'|'deal_platform_revision'|'deal_needs_verification'|'deal_disputed'|'deal_dispute_resolved';
export type Notice={id:string;title:string;body:string;read:boolean;date:string;type?:NotificationType;conversationId?:string;connectionId?:string;messageId?:string;};
export type Conversation={id:string;connectionId:string;campaignId:string;brandId:string;creatorId:string;campaignTitle:string;campaignBrand:string;campaignColor:string;partnerName:string;partnerHandle:string;partnerAvatar?:string;lastMessage?:string;lastMessageAt?:number;lastMessageSenderId?:string;unreadCount:number;closed:boolean;created:number;};
export type ChatMessage={id:string;conversationId:string;senderId:string;body:string;mine:boolean;time:string;created:number;readAt?:number;fromPlatform?:boolean;};
export type State={version:2;authUserId:string;session:boolean;role:Role;onboarded:boolean;profile:Profile;profiles:Partial<Record<Role,Profile>>;saved:string[];shortlist:string[];deals:Deal[];brandDeals:Deal[];workspaceDeals:import('./deals/model').CollaborationDeal[];campaigns:Campaign[];publishedCampaigns:Campaign[];directoryCreators:Creator[];socialAccounts:SocialAccount[];applications:CampaignApplication[];connections:Connection[];conversations:Conversation[];remoteWorkspace:boolean;platformVerifier:boolean;plan:string;planUntil:number;notifications:Notice[];notifyEmail:boolean;notifyBrowser:boolean;billingCycle:'monthly'|'yearly';invoices:{id:string;label:string;amount:number;date:string}[];};
export const blankProfile:Profile={name:'',email:'',bio:'',handle:'',website:'',niche:'',platforms:[],followers:0,impressions:0,rate:0,location:'',available:true,portfolio:[]};
export function initialState():State{return {version:2,authUserId:'',session:false,role:'creator',onboarded:false,profile:{...blankProfile},profiles:{},saved:[],shortlist:[],deals:[],brandDeals:[],workspaceDeals:[],campaigns:[],publishedCampaigns:[],directoryCreators:[],socialAccounts:[],applications:[],connections:[],conversations:[],remoteWorkspace:false,platformVerifier:false,plan:'Free',planUntil:0,notifications:[],notifyEmail:true,notifyBrowser:false,billingCycle:'monthly',invoices:[]}}
export function roleConflictNotice(existing:Role){
  if(existing==='brand')return {
    title:"You’re already registered as a Brand.",
    body:"This email is already registered as a Brand account. Please use a different email address for a Creator account.",
  };
  return {
    title:"You’re already registered as a Creator.",
    body:"This email is already registered as a Creator account. Please use a different email address for a Brand account.",
  };
}
export function canonicalMarketplaceRole(profiles:{role:Role;created?:number}[]=[]):Role|null{
  return [...profiles].sort((a,b)=>(a.created||0)-(b.created||0)||a.role.localeCompare(b.role))[0]?.role||null;
}
export function brandCanBrowseCreators(role:Role,campaigns:Pick<Campaign,'id'>[]=[]):boolean{
  return role==='brand'&&campaigns.length>0;
}
export const CREATOR_USER_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(value:string){
  return typeof value==='string'&&CREATOR_USER_ID.test(value);
}
export function isCreatorUserId(value:string){
  return isUuid(value);
}
export function realDirectoryCreators(list:Creator[]=[]){
  return list.filter(creator=>isCreatorUserId(creator.id));
}
export function brandCreatorRelationship(creatorId:string,applications:Pick<CampaignApplication,'creatorId'|'status'|'initiatedBy'|'id'|'campaignId'>[]=[],connections:Pick<Connection,'creatorId'|'status'|'id'|'campaignId'|'applicationId'>[]=[]){
  const active=connections.find(c=>c.creatorId===creatorId&&c.status==='active');
  if(active)return {kind:'connected' as const,connectionId:active.id,campaignId:active.campaignId};
  const pending=applications.find(a=>a.creatorId===creatorId&&a.status==='pending');
  if(pending)return {kind:'pending' as const,applicationId:pending.id,campaignId:pending.campaignId,initiatedBy:pending.initiatedBy};
  const closed=connections.find(c=>c.creatorId===creatorId&&c.status==='closed');
  if(closed)return {kind:'closed' as const,connectionId:closed.id,campaignId:closed.campaignId};
  const rejected=applications.find(a=>a.creatorId===creatorId&&a.status==='rejected');
  if(rejected)return {kind:'rejected' as const,applicationId:rejected.id,campaignId:rejected.campaignId};
  return {kind:'none' as const};
}
export const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
export const compact=(n:number)=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
function initialsFrom(name:string){return name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()||'Y'}
export function collaborationsFromMarketplace(role:Role,applications:CampaignApplication[],connections:Connection[],deals:import('./deals/model').CollaborationDeal[]=[]):Deal[]{
  const connected=new Set(connections.map(c=>`${c.campaignId}:${c.creatorId}`));
  const dealByConnection=new Map(deals.map(deal=>[deal.connectionId,deal]));
  const fromApps=applications.filter(app=>app.status!=='accepted'||!connected.has(`${app.campaignId}:${app.creatorId}`)).map((app):Deal=>{
    const partner=role==='brand'?app.creatorName:app.campaignBrand;
    const incoming=app.initiatedBy==='brand'?role==='creator':role==='brand';
    return {id:app.id,campaignId:app.campaignId,title:app.campaignTitle,partner,initials:initialsFrom(partner),color:app.campaignColor||'#e8edff',price:app.proposedRate,status:app.status==='pending'?'pending':'declined',incoming,terms:app.message,deadline:'',delivery:'',messages:app.message?[{id:'application',body:app.message,mine:app.initiatedBy==='brand'?role==='brand':role==='creator',time:new Date(app.created).toLocaleDateString('en-US',{month:'short',day:'numeric'})}]:[],kind:'application',handle:app.creatorHandle,avatar:role==='brand'?app.creatorAvatar:undefined,niche:app.creatorNiche,followers:app.creatorFollowers,impressions:app.creatorImpressions,createdAt:app.created,applicationStatus:app.status};
  });
  const fromConnections=connections.map((conn):Deal=>{
    const deal=dealByConnection.get(conn.id);
    const partner=role==='brand'?conn.partnerName:conn.campaignBrand;
    const status:DealStatus=deal?deal.status:conn.status==='closed'?'completed':'in-progress';
    const deadline=deal?.deadline&&Number.isFinite(Date.parse(deal.deadline))?new Date(Date.parse(deal.deadline)).toISOString().slice(0,10):'';
    return {id:conn.id,campaignId:conn.campaignId,title:conn.campaignTitle,partner,initials:initialsFrom(partner),color:conn.campaignColor||'#e8edff',price:deal?.agreedBudget??conn.proposedRate,status,incoming:false,terms:deal?.requirements||deal?.deliverable||conn.message,deadline,delivery:deal?.submissionUrl||'',messages:conn.message?[{id:'connection',body:conn.message,mine:false,time:new Date(conn.created).toLocaleDateString('en-US',{month:'short',day:'numeric'})}]:[],kind:'connection',handle:conn.partnerHandle,avatar:role==='brand'?conn.partnerAvatar:undefined,createdAt:conn.created,updatedAt:deal?.updatedAt,connectionStatus:conn.status,dealId:deal?.id,dealStatus:deal?.status,deliverable:deal?.deliverable,requirements:deal?.requirements,submissionNote:deal?.submissionNote,revisionNote:deal?.revisionNote};
  });
  return [...fromApps,...fromConnections].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
}
