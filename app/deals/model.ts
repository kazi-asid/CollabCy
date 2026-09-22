export const DEAL_STATUSES = [
  'active',
  'submitted',
  'revision_requested',
  'brand_verified',
  'platform_review',
  'disputed',
  'completed',
  'cancelled',
] as const;
export type DealLifecycleStatus = (typeof DEAL_STATUSES)[number];
export type DealActor = 'creator'|'brand'|'platform';
export type DealAction =
  |'submit'
  |'request_revision'
  |'brand_verify'
  |'platform_verify'
  |'platform_revision'
  |'open_dispute'
  |'mark_disputed'
  |'resolve_completed'
  |'resolve_revision'
  |'resolve_dismissed'
  |'cancel';

export type CollaborationDeal = {
  id:string;
  connectionId:string;
  campaignId:string;
  creatorId:string;
  brandId:string;
  status:DealLifecycleStatus;
  deliverable:string;
  requirements:string;
  agreedBudget:number;
  deadline:string;
  creatorNote:string;
  brandNote:string;
  submissionUrl:string;
  submissionNote:string;
  revisionNote:string;
  createdAt:number;
  updatedAt:number;
  startedAt:number;
  submittedAt:number;
  completedAt:number;
  cancelledAt:number;
  brandVerifiedAt:number;
  brandVerifiedBy:string;
  brandVerificationNote:string;
  platformVerifiedAt:number;
  platformVerifiedBy:string;
  platformVerificationNote:string;
  revisionRequestedBy:string;
  revisionRequestedAt:number;
};

export type DealDispute = {
  id:string;
  dealId:string;
  openedBy:string;
  reason:string;
  status:'open'|'under_review'|'resolved'|'dismissed';
  resolutionNote:string;
  resolvedBy:string;
  createdAt:number;
  resolvedAt:number;
};

export type DealVerificationEvent = {
  id:string;
  dealId:string;
  actorId:string;
  actorRole:DealActor;
  action:string;
  fromStatus:string;
  toStatus:string;
  note:string;
  visibility:'public'|'admin';
  createdAt:number;
};

export type DealSubmission = {
  id:string;
  dealId:string;
  submittedBy:string;
  note:string;
  url:string;
  createdAt:number;
};

export function isDealStatus(value:string):value is DealLifecycleStatus{
  return (DEAL_STATUSES as readonly string[]).includes(value);
}

export function isPlatformQueueStatus(status:DealLifecycleStatus|string){
  return status==='platform_review'||status==='disputed';
}

export function dealTransitionError(status:DealLifecycleStatus,action:DealAction,actor:DealActor){
  if(status==='completed'||status==='cancelled')return 'This deal can no longer be changed.';
  if(action==='submit'){
    if(actor!=='creator')return 'Only the creator can submit work.';
    if(status!=='active'&&status!=='revision_requested')return 'This deal cannot be submitted from its current status';
    return '';
  }
  if(action==='request_revision'){
    if(actor!=='brand')return 'Only the brand can request a revision.';
    if(status!=='submitted')return 'Revisions can only be requested on submitted work';
    return '';
  }
  if(action==='brand_verify'){
    if(actor!=='brand')return 'Only the brand can verify this submission.';
    if(status==='platform_review'||status==='brand_verified')return '';
    if(status!=='submitted')return 'Only submitted work can be verified by the brand';
    return '';
  }
  if(action==='platform_verify'){
    if(actor!=='platform')return 'Not allowed';
    if(status==='disputed')return 'Resolve the dispute instead of completing it from verification.';
    if(status!=='platform_review')return 'This collaboration is not in platform review';
    return '';
  }
  if(action==='platform_revision'){
    if(actor!=='platform')return 'Not allowed';
    if(status!=='platform_review'&&status!=='disputed')return 'CollabCy can only request a revision during platform review';
    return '';
  }
  if(action==='open_dispute'){
    if(actor!=='creator'&&actor!=='brand')return 'Not allowed';
    if(status!=='submitted'&&status!=='revision_requested'&&status!=='brand_verified'&&status!=='platform_review')return 'A dispute cannot be opened from this status';
    return '';
  }
  if(action==='mark_disputed'){
    if(actor!=='platform')return 'Not allowed';
    if(status==='disputed')return '';
    if(status!=='submitted'&&status!=='revision_requested'&&status!=='platform_review'&&status!=='brand_verified')return 'CollabCy can only mark a dispute during review';
    return '';
  }
  if(action==='resolve_completed'||action==='resolve_revision'||action==='resolve_dismissed'){
    if(actor!=='platform')return 'Not allowed';
    if(status!=='disputed')return 'Only a disputed collaboration can be resolved';
    return '';
  }
  if(action==='cancel'){
    if(actor!=='creator'&&actor!=='brand')return 'Not allowed';
    if(status!=='active'&&status!=='submitted'&&status!=='revision_requested')return 'This deal can no longer be cancelled';
    return '';
  }
  return 'Invalid deal action.';
}

export function nextDealStatus(status:DealLifecycleStatus,action:DealAction,actor:DealActor):DealLifecycleStatus{
  const error=dealTransitionError(status,action,actor);
  if(error)throw new Error(error);
  if(action==='submit')return 'submitted';
  if(action==='request_revision'||action==='platform_revision'||action==='resolve_revision')return 'revision_requested';
  if(action==='brand_verify')return status==='platform_review'||status==='brand_verified'?status:'completed';
  if(action==='platform_verify'||action==='resolve_completed')return 'completed';
  if(action==='open_dispute'||action==='mark_disputed')return 'disputed';
  if(action==='resolve_dismissed')return 'submitted';
  return 'cancelled';
}

export function canCancelDeal(status:DealLifecycleStatus){
  return status==='active'||status==='submitted'||status==='revision_requested';
}

export function mapDealToListStatus(status:DealLifecycleStatus){
  return status;
}
