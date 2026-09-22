import {
  canCancelDeal,
  dealTransitionError,
  isDealStatus,
  isPlatformQueueStatus,
  nextDealStatus,
  type CollaborationDeal,
  type DealAction,
  type DealActor,
  type DealDispute,
  type DealLifecycleStatus,
  type DealSubmission,
  type DealVerificationEvent,
} from './model';

export type DealNotice = {
  id:string;
  userId:string;
  type:
    |'deal_submitted'
    |'deal_revision_requested'
    |'deal_completed'
    |'deal_cancelled'
    |'deal_brand_verified'
    |'deal_platform_verified'
    |'deal_platform_revision'
    |'deal_needs_verification'
    |'deal_disputed'
    |'deal_dispute_resolved';
  title:string;
  body:string;
  connectionId:string;
  conversationId?:string;
};

export type DealConversation = {id:string;connectionId:string;brandId:string;creatorId:string};

export type DealConnection = {
  id:string;
  campaignId:string;
  creatorId:string;
  brandId:string;
  deliverable?:string;
  requirements?:string;
  agreedBudget?:number;
  deadline?:string;
};

function now(){return Date.now()}
function nextId(prefix:string){return `${prefix}-${Math.random().toString(36).slice(2,10)}`}
function copyDeal(deal:CollaborationDeal):CollaborationDeal{return {...deal}}

export function dealActorFor(deal:CollaborationDeal,userId:string,verifiers:Set<string>=new Set()):DealActor|undefined{
  if(userId===deal.creatorId)return 'creator';
  if(userId===deal.brandId)return 'brand';
  if(verifiers.has(userId))return 'platform';
  return undefined;
}

export function canReadDeal(deal:CollaborationDeal,userId:string,verifiers:Set<string>=new Set()){
  if(userId===deal.creatorId||userId===deal.brandId)return true;
  return verifiers.has(userId)&&(isPlatformQueueStatus(deal.status)||deal.status==='completed');
}

export function validateDealSubmission(note:string,url:string){
  const trimmedNote=note.trim();
  const trimmedUrl=url.trim();
  if(trimmedNote.length>2000)return 'Keep the submission note under 2,000 characters.';
  if(trimmedUrl){
    try{
      const parsed=new URL(trimmedUrl);
      if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return 'Enter a complete http or https delivery link.';
      if(parsed.username||parsed.password||/\s/.test(trimmedUrl))return 'Enter a complete http or https delivery link.';
    }catch{
      return 'Enter a complete http or https delivery link.';
    }
  }
  if(!trimmedNote&&!trimmedUrl)return 'Add a submission note or a delivery link.';
  return '';
}

const blankDeal=(connection:DealConnection):CollaborationDeal=>{
  const stamp=now();
  return {
    id:nextId('deal'),
    connectionId:connection.id,
    campaignId:connection.campaignId,
    creatorId:connection.creatorId,
    brandId:connection.brandId,
    status:'active',
    deliverable:connection.deliverable||'',
    requirements:connection.requirements||'',
    agreedBudget:Math.max(0,connection.agreedBudget||0),
    deadline:connection.deadline||'',
    creatorNote:'',
    brandNote:'',
    submissionUrl:'',
    submissionNote:'',
    revisionNote:'',
    createdAt:stamp,
    updatedAt:stamp,
    startedAt:stamp,
    submittedAt:0,
    completedAt:0,
    cancelledAt:0,
    brandVerifiedAt:0,
    brandVerifiedBy:'',
    brandVerificationNote:'',
    platformVerifiedAt:0,
    platformVerifiedBy:'',
    platformVerificationNote:'',
    revisionRequestedBy:'',
    revisionRequestedAt:0,
  };
};

export function createDealLifecycle(){
  const deals=new Map<string,CollaborationDeal>();
  const conversations=new Map<string,DealConversation>();
  const notices:DealNotice[]=[];
  const events:DealVerificationEvent[]=[];
  const submissions:DealSubmission[]=[];
  const disputes:DealDispute[]=[];
  const verifiers=new Set<string>();

  function listFor(userId:string){
    return [...deals.values()].filter(deal=>canReadDeal(deal,userId,verifiers)).map(copyDeal);
  }

  function getFor(userId:string,dealId:string){
    const deal=deals.get(dealId);
    if(!deal||!canReadDeal(deal,userId,verifiers))return undefined;
    return copyDeal(deal);
  }

  function ensureConversation(connection:DealConnection){
    const existing=[...conversations.values()].find(item=>item.connectionId===connection.id);
    if(existing)return existing;
    const created:DealConversation={
      id:nextId('convo'),
      connectionId:connection.id,
      brandId:connection.brandId,
      creatorId:connection.creatorId,
    };
    conversations.set(created.id,created);
    return created;
  }

  function ensureDeal(connection:DealConnection){
    const existing=[...deals.values()].find(item=>item.connectionId===connection.id);
    if(existing)return copyDeal(existing);
    const created=blankDeal(connection);
    deals.set(created.id,created);
    ensureConversation(connection);
    return copyDeal(created);
  }

  function notify(deal:CollaborationDeal,recipientId:string,type:DealNotice['type'],title:string,body:string){
    if(!recipientId||recipientId===deal.creatorId&&type===undefined)return;
    const conversation=[...conversations.values()].find(item=>item.connectionId===deal.connectionId);
    const duplicate=notices.some(item=>item.connectionId===deal.connectionId&&item.type===type&&item.userId===recipientId&&item.body===body);
    if(duplicate)return;
    notices.push({
      id:nextId('notice'),
      userId:recipientId,
      type,
      title,
      body,
      connectionId:deal.connectionId,
      conversationId:conversation?.id,
    });
  }

  function notifyPlatform(deal:CollaborationDeal,actorId:string,type:DealNotice['type'],title:string,body:string){
    for(const userId of verifiers){
      if(userId===actorId)continue;
      notify(deal,userId,type,title,body);
    }
  }

  function record(deal:CollaborationDeal,actorId:string,actor:DealActor,action:string,from:string,to:string,note=''){
    events.push({
      id:nextId('event'),
      dealId:deal.id,
      actorId,
      actorRole:actor,
      action,
      fromStatus:from,
      toStatus:to,
      note,
      visibility:'public',
      createdAt:now(),
    });
  }

  function openDispute(deal:CollaborationDeal,userId:string,reason:string){
    if(disputes.some(item=>item.dealId===deal.id&&(item.status==='open'||item.status==='under_review'))){
      throw new Error('This collaboration already has an open dispute');
    }
    const created:DealDispute={
      id:nextId('disp'),
      dealId:deal.id,
      openedBy:userId,
      reason,
      status:'open',
      resolutionNote:'',
      resolvedBy:'',
      createdAt:now(),
      resolvedAt:0,
    };
    disputes.push(created);
    return created;
  }

  function mutate(userId:string,dealId:string,action:DealAction,payload:{note?:string;url?:string}={}){
    const deal=deals.get(dealId);
    if(!deal)throw new Error('Deal not found');
    const actor=dealActorFor(deal,userId,verifiers);
    if(!actor)throw new Error('Not allowed');
    if(action==='brand_verify'&&deal.status==='completed'&&deal.brandVerifiedBy===userId){
      return copyDeal(deal);
    }
    if(action==='brand_verify'&&(deal.status==='platform_review'||deal.status==='brand_verified')&&deal.brandVerifiedBy===userId){
      return copyDeal(deal);
    }
    if(action==='platform_verify'){
      if(actor!=='platform')throw new Error('Not allowed');
      if((payload.note||'').trim().length<8)throw new Error('Add a reason for this platform decision.');
      if(deal.status==='completed')return copyDeal(deal);
    }
    if(action==='mark_disputed'&&deal.status==='disputed')return copyDeal(deal);
    const error=dealTransitionError(deal.status,action,actor);
    if(error)throw new Error(error);
    const stamp=now();
    const from=deal.status;
    const next=copyDeal(deal);
    next.status=nextDealStatus(deal.status,action,actor);
    next.updatedAt=stamp;
    const note=(payload.note||'').trim();

    if(action==='submit'){
      const invalid=validateDealSubmission(payload.note||'',payload.url||'');
      if(invalid)throw new Error(invalid);
      next.submissionNote=note;
      next.submissionUrl=(payload.url||'').trim();
      next.creatorNote=next.submissionNote;
      next.submittedAt=stamp;
      submissions.push({id:nextId('sub'),dealId:next.id,submittedBy:userId,note:next.submissionNote,url:next.submissionUrl,createdAt:stamp});
      record(next,userId,'creator','creator_submitted',from,next.status,note);
      notify(next,next.brandId,'deal_submitted','Work submitted','Your creator submitted work for review.');
    }
    if(action==='request_revision'){
      if(note.length<8)throw new Error('Explain the revision you need.');
      next.revisionNote=note;
      next.brandNote=note;
      next.revisionRequestedBy=userId;
      next.revisionRequestedAt=stamp;
      record(next,userId,'brand','brand_requested_revision',from,next.status,note);
      notify(next,next.creatorId,'deal_revision_requested','Revision requested','The brand asked for changes on your submission.');
    }
    if(action==='brand_verify'){
      next.brandVerifiedAt=stamp;
      next.brandVerifiedBy=userId;
      next.brandVerificationNote=note;
      next.completedAt=stamp;
      record(next,userId,'brand','brand_verified',from,'brand_verified',note);
      record(next,userId,'brand','deal_completed','brand_verified',next.status,note);
      notify(next,next.creatorId,'deal_completed','Brand approved your work','The brand verified this submission. The collaboration is complete.');
    }
    if(action==='platform_verify'){
      if(note.length<8)throw new Error('Add a reason for this platform decision.');
      next.completedAt=stamp;
      next.platformVerifiedAt=stamp;
      next.platformVerifiedBy=userId;
      next.platformVerificationNote=note;
      record(next,userId,'platform','platform_approved',from,next.status,note);
      notify(next,next.creatorId,'deal_platform_verified','Platform decision recorded','CollabCy recorded a platform decision on this collaboration. Reason: '+note.slice(0,280));
      notify(next,next.brandId,'deal_platform_verified','Platform decision recorded','CollabCy recorded a platform decision on this collaboration. Reason: '+note.slice(0,280));
    }
    if(action==='platform_revision'){
      if(note.length<8)throw new Error('Explain the revision you need.');
      next.revisionNote=note;
      next.revisionRequestedBy=userId;
      next.revisionRequestedAt=stamp;
      record(next,userId,'platform','platform_requested_revision',from,next.status,note);
      notify(next,next.creatorId,'deal_platform_revision','CollabCy requested a revision','CollabCy asked for changes before this collaboration can be completed.');
      notify(next,next.brandId,'deal_platform_revision','CollabCy requested a revision','CollabCy asked for changes before this collaboration can be completed.');
    }
    if(action==='open_dispute'||action==='mark_disputed'){
      if(note.length<8)throw new Error('Explain the issue so CollabCy can review it.');
      openDispute(next,userId,note);
      record(next,userId,actor,'dispute_opened',from,next.status,note);
      if(action==='open_dispute'){
        const other=userId===next.brandId?next.creatorId:next.brandId;
        notify(next,other,'deal_disputed','A dispute was opened','This collaboration has been escalated for platform review.');
        notifyPlatform(next,userId,'deal_disputed','Collaboration disputed','A participant opened a dispute that needs CollabCy review.');
      }else{
        notify(next,next.creatorId,'deal_disputed','CollabCy opened a dispute','This collaboration has been escalated for platform review.');
        notify(next,next.brandId,'deal_disputed','CollabCy opened a dispute','This collaboration has been escalated for platform review.');
      }
    }
    if(action==='resolve_completed'||action==='resolve_revision'||action==='resolve_dismissed'){
      if(note.length<8)throw new Error('Add a reason for this platform decision.');
      const open=disputes.find(item=>item.dealId===next.id&&(item.status==='open'||item.status==='under_review'));
      if(!open)throw new Error('No open dispute to resolve');
      open.status=action==='resolve_dismissed'?'dismissed':'resolved';
      open.resolutionNote=note;
      open.resolvedBy=userId;
      open.resolvedAt=stamp;
      if(action==='resolve_completed'){
        next.completedAt=stamp;
        next.platformVerifiedAt=stamp;
        next.platformVerifiedBy=userId;
        next.platformVerificationNote=note;
      }
      if(action==='resolve_revision'){
        next.revisionNote=note;
        next.revisionRequestedBy=userId;
        next.revisionRequestedAt=stamp;
      }
      record(next,userId,'platform','dispute_resolved',from,next.status,note);
      notify(next,next.creatorId,'deal_dispute_resolved','Platform decision recorded','CollabCy recorded a platform decision on this dispute. Reason: '+note.slice(0,280));
      notify(next,next.brandId,'deal_dispute_resolved','Platform decision recorded','CollabCy recorded a platform decision on this dispute. Reason: '+note.slice(0,280));
    }
    if(action==='cancel'){
      next.cancelledAt=stamp;
      record(next,userId,actor,'deal_cancelled',from,next.status,note);
      const other=userId===next.brandId?next.creatorId:next.brandId;
      notify(next,other,'deal_cancelled','Collaboration cancelled','The other participant cancelled this collaboration.');
    }
    deals.set(next.id,next);
    return copyDeal(next);
  }

  return {
    listFor,
    getFor,
    ensureDeal,
    ensureConversation,
    grantVerifier:(userId:string)=>{verifiers.add(userId)},
    submit:(userId:string,dealId:string,note='',url='')=>mutate(userId,dealId,'submit',{note,url}),
    requestRevision:(userId:string,dealId:string,note:string)=>mutate(userId,dealId,'request_revision',{note}),
    brandVerify:(userId:string,dealId:string,note='')=>mutate(userId,dealId,'brand_verify',{note}),
    platformVerify:(userId:string,dealId:string,note='')=>mutate(userId,dealId,'platform_verify',{note}),
    sendPlatformMessage:(userId:string,dealId:string,body:string)=>{
      const deal=deals.get(dealId);
      if(!deal)throw new Error('Deal not found');
      if(!verifiers.has(userId))throw new Error('Not allowed');
      const trimmed=(body||'').trim();
      if(!trimmed)throw new Error('Please write a message before sending.');
      record(deal,userId,'platform','platform_message_sent',deal.status,deal.status,trimmed.slice(0,280));
      const last=events[events.length-1];
      last.visibility='admin';
      notify(deal,deal.creatorId,'deal_needs_verification','Message from CollabCy Admin','This message is from CollabCy platform administration.');
      notify(deal,deal.brandId,'deal_needs_verification','Message from CollabCy Admin','This message is from CollabCy platform administration.');
      return {fromPlatform:true,senderId:userId,displayName:'CollabCy Admin',body:trimmed};
    },
    platformRevision:(userId:string,dealId:string,note:string)=>mutate(userId,dealId,'platform_revision',{note}),
    openDispute:(userId:string,dealId:string,reason:string)=>mutate(userId,dealId,'open_dispute',{note:reason}),
    markDisputed:(userId:string,dealId:string,reason:string)=>mutate(userId,dealId,'mark_disputed',{note:reason}),
    resolveDispute:(userId:string,dealId:string,outcome:'completed'|'revision_requested'|'dismissed',note:string)=>{
      const action=outcome==='completed'?'resolve_completed':outcome==='revision_requested'?'resolve_revision':'resolve_dismissed';
      return mutate(userId,dealId,action,{note});
    },
    cancel:(userId:string,dealId:string)=>mutate(userId,dealId,'cancel'),
    notices:()=>notices.map(item=>({...item})),
    conversations:()=>[...conversations.values()].map(item=>({...item})),
    events:()=>events.map(item=>({...item})),
    submissions:()=>submissions.map(item=>({...item})),
    disputes:()=>disputes.map(item=>({...item})),
    all:()=>[...deals.values()].map(copyDeal),
  };
}

export function isOpenDealStatus(status:DealLifecycleStatus|string){
  return status==='active'||status==='submitted'||status==='revision_requested'||status==='platform_review'||status==='brand_verified'||status==='disputed';
}

export {canCancelDeal,isDealStatus,isPlatformQueueStatus};
