'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowLeft,ArrowRight,ArrowUpRight,Send,MessageSquare,CalendarDays,Check,CheckCircle2,ShieldCheck,FileText,ExternalLink,Download,Flag,RotateCcw,Star,Handshake,Wallet} from 'lucide-react';
import {toast} from 'sonner';
import {useStore} from '../store';
import {Deal,ChatMessage,Conversation,collaborationsFromMarketplace,compact,money} from '../data';
import {canCancelDeal,type CollaborationDeal,type DealVerificationEvent} from '../deals/model';
import {Avatar,Button,PageTitle,ViewTabs,SearchBox,Empty,Status,Modal,Field,Textarea,DemoNote,Rating,Confirm,download,validURL,statusLabels} from './shared';
import {cancelDeal,closeConnection,ensureConversation,listDealEvents,listMessages,listMyApplications,listMyConnections,listMyConversations,listMyDeals,markConversationNotificationsRead,markConversationRead,openDealDispute,persistMarketplace,requestDealRevision,sendMessage,submitDeal,subscribeToConversationMessages,updateApplicationStatus,verifyDealBrand} from '@/lib/supabase';

function formatStamp(value?:string|number){
  const t=typeof value==='number'?value:value?Date.parse(value):0;
  if(!t)return '';
  return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

async function refreshCollaborationWorkspace(update:(fn:(s:any)=>any)=>void){
  const [apps,conns,convos,deals]=await Promise.all([listMyApplications(),listMyConnections(),listMyConversations(),listMyDeals()]);
  if(apps.skipped||conns.skipped)return;
  if(apps.error){toast.error(apps.error);return}
  if(conns.error){toast.error(conns.error);return}
  if(convos.error)toast.error(convos.error);
  if(deals.error)toast.error(deals.error);
  update((p:any)=>({
    ...p,
    applications:apps.applications,
    connections:conns.connections.map((c:any)=>({...c,conversationId:(convos.error||convos.skipped?p.conversations:convos.conversations).find((x:any)=>x.connectionId===c.id)?.id})),
    conversations:convos.skipped||convos.error?p.conversations:convos.conversations,
    workspaceDeals:deals.skipped||deals.error?p.workspaceDeals:deals.deals,
    campaigns:p.role==='brand'?p.campaigns.map((c:any)=>({...c,applications:apps.applications.filter((a:any)=>a.campaignId===c.id).length})):p.campaigns,
  }));
}

export function Collaborations(){
  const {s,go,update}=useStore();
  const remote=persistMarketplace(s);
  const [tab,setTab]=useState('all');
  const [q,setQ]=useState('');
  useEffect(()=>{
    if(!remote)return;
    let cancelled=false;
    void refreshCollaborationWorkspace(fn=>{if(!cancelled)update(fn)});
    return()=>{cancelled=true};
  },[s.remoteWorkspace,s.profile.email,s.role]);
  const items=collaborationsFromMarketplace(s.role,s.applications,s.connections,s.workspaceDeals);
  const matches=(d:Deal)=>{
    if(!(`${d.partner} ${d.title}`.toLowerCase().includes(q.toLowerCase())))return false;
    if(tab==='all')return true;
    if(tab==='requests')return d.status==='pending';
    if(tab==='active')return ['active','in-progress','negotiating','awaiting-funds','in-review','revision'].includes(d.status);
    if(tab==='submitted')return d.status==='submitted';
    if(tab==='revision')return d.status==='revision_requested'||d.status==='revision';
    if(tab==='review')return d.status==='platform_review'||d.status==='disputed';
    if(tab==='disputed')return d.status==='disputed';
    if(tab==='completed')return d.status==='completed'||d.connectionStatus==='closed';
    if(tab==='cancelled')return d.status==='cancelled';
    return true;
  };
  const filtered=items.filter(matches);
  const tabs=[{value:'all',label:'All'},{value:'requests',label:`Requests (${items.filter(d=>d.status==='pending').length})`},{value:'active',label:'Active'},{value:'submitted',label:'Submitted'},{value:'revision',label:'Revision requested'},{value:'review',label:'CollabCy review'},{value:'disputed',label:'Disputed'},{value:'completed',label:'Completed'},{value:'cancelled',label:'Cancelled'}];
  return <>
    <PageTitle eyebrow="GOOD WORK HAPPENS TOGETHER" title="Your collaborations" description="Every introduction, conversation, and next big thing—in one place."/>
    <div className="mini-stat-grid">
      <div><span>Active collaborations</span><strong>{items.filter(d=>['active','submitted','revision_requested','in-progress','negotiating','awaiting-funds','in-review','revision','platform_review','brand_verified','disputed'].includes(d.status)).length}</strong></div>
      <div><span>Connection requests</span><strong>{items.filter(d=>d.status==='pending').length}</strong></div>
      <div><span>Completed</span><strong>{items.filter(d=>d.status==='completed').length}</strong></div>
      <div><span>{s.role==='creator'?'Agreed value':'Campaign value'}</span><strong>{money(items.filter(d=>d.status==='completed').reduce((a,d)=>a+d.price,0))}</strong></div>
    </div>
    <div className="list-toolbar">
      <ViewTabs value={tab} onChange={setTab} options={tabs}/>
      <SearchBox value={q} onChange={setQ} placeholder="Search collaborations…"/>
    </div>
    {filtered.length?<div className="deal-list">{filtered.map(d=>{
      const when=formatStamp(d.updatedAt)||formatStamp(d.createdAt)||(d.deadline?formatStamp(d.deadline+'T12:00:00'):'Date to be agreed');
      const badge=d.kind==='application'?d.applicationStatus||d.status:d.status;
      return <button className="deal-list-card panel" key={d.id} onClick={()=>go(`/${s.role}/collaborations/${d.id}`)}>
        <Avatar name={d.partner} image={d.avatar} color={d.color}/>
        <div>
          <div className="deal-partner">{d.partner}{d.status==='pending'&&<span className="request-direction">{d.incoming?'Incoming request':'Request sent'}</span>}</div>
          <h3>{d.title}</h3>
          <span className="subtle"><CalendarDays size={13}/>{when}{d.deadline&&d.kind==='connection'?<> · Due {formatStamp(d.deadline)}</>:null}</span>
        </div>
        <div className="deal-list-end">
          <Status status={badge}/>
          <strong>{money(d.price)}</strong>
          <ArrowUpRight size={18}/>
        </div>
      </button>;
    })}</div>:<Empty title={items.length?'No collaborations in this view.':'No collaborations yet.'} description={items.length?'Try another filter or search term.':s.role==='creator'?'Find a campaign you love and send your first proposal.':'Create a campaign and invite a creator to work with you.'}><Button onClick={()=>go(s.role==='creator'?'/creator/discover':'/brand/campaigns/new')}>{s.role==='creator'?'Explore campaigns':'Create a campaign'}<ArrowRight size={16}/></Button></Empty>}
    <DemoNote>{remote?'Accepted connections become collaborations here. Payments are still coming.':'All requests, deals, and delivery actions are local frontend simulations.'}</DemoNote>
  </>;
}

function upsertDeal(update:(fn:(s:any)=>any)=>void,deal:CollaborationDeal){
  update((p:any)=>{
    const exists=p.workspaceDeals.some((item:CollaborationDeal)=>item.id===deal.id);
    return {...p,workspaceDeals:exists?p.workspaceDeals.map((item:CollaborationDeal)=>item.id===deal.id?deal:item):[deal,...p.workspaceDeals]};
  });
}

function RemoteDealDetail({id}:{id:string}){
  const {s,go,update}=useStore();
  const application=s.applications.find(a=>a.id===id);
  const connection=s.connections.find(c=>c.id===id)||s.connections.find(c=>c.applicationId===id);
  const deal=s.workspaceDeals.find(d=>d.connectionId===connection?.id||d.connectionId===id||d.id===id);
  const [modal,setModal]=useState('');
  const [note,setNote]=useState('');
  const [delivery,setDelivery]=useState(deal?.submissionUrl||'');
  const [acting,setActing]=useState(false);
  const [opening,setOpening]=useState(false);
  const [events,setEvents]=useState<DealVerificationEvent[]>([]);
  useEffect(()=>{
    let cancelled=false;
    void refreshCollaborationWorkspace(fn=>{if(!cancelled)update(fn)});
    return()=>{cancelled=true};
  },[id,s.remoteWorkspace,s.profile.email,s.role]);
  useEffect(()=>{
    if(!deal?.id)return;
    let cancelled=false;
    void listDealEvents(deal.id).then(result=>{
      if(cancelled||result.skipped)return;
      if(result.error)return;
      setEvents(result.events);
    });
    return()=>{cancelled=true};
  },[deal?.id,deal?.status,deal?.updatedAt]);
  const brand=s.role==='brand';
  const pending=application?.status==='pending';
  const partner=brand?(application?.creatorName||connection?.partnerName||'Creator'):(application?.campaignBrand||connection?.campaignBrand||'Brand');
  const title=application?.campaignTitle||connection?.campaignTitle||'Collaboration';
  const rate=deal?.agreedBudget??application?.proposedRate??connection?.proposedRate??0;
  const color=application?.campaignColor||connection?.campaignColor||'#e8edff';
  async function run(action:()=>Promise<{deal?:CollaborationDeal;error?:string}|{error?:string}>,success:string){
    setActing(true);
    const result=await action();
    setActing(false);
    if('error' in result && result.error){toast.error(result.error);return}
    if('deal' in result && result.deal)upsertDeal(update,result.deal);
    await refreshCollaborationWorkspace(update);
    setModal('');
    setNote('');
    toast.success(success);
  }
  if(!application&&!connection){
    return <Empty title="This collaboration isn’t in your workspace." description="It may belong to your other role, or have been removed."><Button onClick={()=>go(`/${s.role}/collaborations`)}>Back to collaborations</Button></Empty>;
  }
  const status=deal?.status||application?.status||connection?.status||'pending';
  const stage=deal?.status==='completed'?3:deal?.status==='cancelled'?0:['submitted','revision_requested','platform_review','brand_verified','disputed'].includes(deal?.status||'')?2:connection||application?.status==='accepted'?1:0;
  const conversation=s.conversations.find(c=>c.connectionId===(connection?.id||deal?.connectionId));
  return <>
    <button className="back-link" onClick={()=>go(`/${s.role}/collaborations`)}><ArrowLeft size={16}/>All collaborations</button>
    <PageTitle eyebrow="COLLABORATION WORKSPACE" title={title} description={`With ${partner}`}>
      <Status status={status}/>
      {connection&&<Button variant="secondary" disabled={opening} onClick={()=>{setOpening(true);void ensureConversation(connection.id).then(result=>{setOpening(false);if(result.error||!result.conversation){toast.error(result.error||'Could not open this conversation.');return}update(p=>({...p,conversations:[result.conversation!,...p.conversations.filter(c=>c.id!==result.conversation!.id)]}));go(`/${s.role}/messages?id=${result.conversation.id}`)})}}><MessageSquare size={17}/>Open conversation</Button>}
    </PageTitle>
    {deal&&<div className="deal-progress panel">{['Connect','Create','Review','Complete'].map((x,i)=><div className={i<=stage?'reached':''} key={x}><span>{i<stage?<Check size={15}/>:i+1}</span><strong>{x}</strong></div>)}</div>}
    <div className="deal-layout">
      <main>
        <section className="panel deal-action-panel">
          <div className="section-heading">
            <h2>{pending?'An introduction worth exploring.':deal?.status==='active'?'Time to make something great.':deal?.status==='submitted'?'Your work, ready for a second look.':deal?.status==='revision_requested'?'A little refinement goes a long way.':deal?.status==='brand_verified'?'Brand verified. Waiting for completion.':deal?.status==='platform_review'?'CollabCy review required.':deal?.status==='disputed'?'This collaboration has been escalated for platform review.':deal?.status==='completed'?'Collaboration completed.':deal?.status==='cancelled'?'This collaboration was cancelled.':application?.status==='accepted'||connection?.status==='active'?'You’re connected.':application?.status==='rejected'?'This application was declined.':application?.status==='withdrawn'?'This application was withdrawn.':'This collaboration is closed.'}</h2>
          </div>
          {application&&<blockquote>{application.message||'No message included.'}</blockquote>}
          {pending&&application&&<div className="action-row">{application.initiatedBy==='brand'?(brand?<Button variant="secondary" disabled={acting} onClick={()=>run(()=>updateApplicationStatus(application.id,'withdrawn'),'Request withdrawn.')}>Withdraw request</Button>:<><Button disabled={acting} onClick={()=>run(()=>updateApplicationStatus(application.id,'accepted'),'You’re connected.')}>Accept connection <Check size={17}/></Button><Button variant="secondary" disabled={acting} onClick={()=>run(()=>updateApplicationStatus(application.id,'rejected'),'Request declined.')}>Decline</Button></>):(brand?<><Button disabled={acting} onClick={()=>run(()=>updateApplicationStatus(application.id,'accepted'),'Application accepted.')}>Accept connection <Check size={17}/></Button><Button variant="secondary" disabled={acting} onClick={()=>run(()=>updateApplicationStatus(application.id,'rejected'),'Application declined.')}>Decline</Button></>:<Button variant="secondary" disabled={acting} onClick={()=>run(()=>updateApplicationStatus(application.id,'withdrawn'),'Application withdrawn.')}>Withdraw application</Button>)}</div>}
          {deal?.status==='active'&&!brand&&<><p>Submit your draft or live post when it’s ready. The brand will review it here.</p><Button disabled={acting} onClick={()=>{setDelivery(deal.submissionUrl);setNote(deal.submissionNote);setModal('delivery')}}>Submit work <ArrowRight size={17}/></Button></>}
          {deal?.status==='revision_requested'&&!brand&&<><p>{deal.revisionNote||'The brand asked for a revision.'}</p><Button disabled={acting} onClick={()=>{setDelivery(deal.submissionUrl);setNote('');setModal('delivery')}}>Resubmit work <RotateCcw size={17}/></Button></>}
          {deal?.status==='submitted'&&!brand&&<>
            <p>Waiting for brand verification. You’ll see the next update here.</p>
            {deal.submissionUrl&&<a className="delivery-link" href={deal.submissionUrl} target="_blank" rel="noreferrer"><FileText size={23}/><span><strong>Submitted work</strong><small>{deal.submissionUrl}</small></span><ExternalLink size={18}/></a>}
            {deal.submissionNote&&<blockquote>{deal.submissionNote}</blockquote>}
          </>}
          {deal?.status==='brand_verified'&&<p>Brand verified. Waiting for completion.</p>}
          {deal?.status==='platform_review'&&<div className="notice-box"><ShieldCheck size={22}/>CollabCy review required. This collaboration has been escalated for platform review.</div>}
          {deal?.status==='disputed'&&<div className="notice-box"><Flag size={22}/>CollabCy review required. This collaboration has been escalated for platform review.</div>}
          {deal?.status==='active'&&brand&&<p>Your creator is working on the agreed deliverable. Use the conversation for questions.</p>}
          {deal?.status==='revision_requested'&&brand&&<p>Waiting on a revised submission from your creator.</p>}
          {deal&&['submitted','revision_requested','platform_review','brand_verified'].includes(deal.status)&&!brand&&<div className="action-row"><Button variant="ghost" disabled={acting} onClick={()=>setModal('dispute')}>Open dispute</Button></div>}
          {deal&&['revision_requested','platform_review','brand_verified'].includes(deal.status)&&brand&&<div className="action-row"><Button variant="ghost" disabled={acting} onClick={()=>setModal('dispute')}>Open dispute</Button></div>}
          {deal?.status==='submitted'&&brand&&<>
            {deal.submissionUrl&&<a className="delivery-link" href={deal.submissionUrl} target="_blank" rel="noreferrer"><FileText size={23}/><span><strong>Submitted work</strong><small>{deal.submissionUrl}</small></span><ExternalLink size={18}/></a>}
            {deal.submissionNote&&<blockquote>{deal.submissionNote}</blockquote>}
            <div className="action-row">
              <Button disabled={acting} onClick={()=>run(()=>verifyDealBrand(deal.id),'Submission verified. This collaboration is complete.')}>Approve / Verify <CheckCircle2 size={17}/></Button>
              <Button variant="secondary" disabled={acting} onClick={()=>setModal('revision')}>Request revision</Button>
              <Button variant="ghost" disabled={acting} onClick={()=>setModal('dispute')}>Open dispute</Button>
            </div>
          </>}
          {deal?.status==='completed'&&<div className="completion-mark"><CheckCircle2 size={42}/><div><strong>{deal.platformVerifiedAt?'A platform decision completed this collaboration.':'Brand verified. Collaboration complete.'}</strong><p>{money(deal.agreedBudget)} agreed value. No payment was collected.</p></div></div>}
          {deal?.status==='cancelled'&&<div className="notice-box"><Flag size={22}/>This collaboration was cancelled. The conversation remains available.</div>}
          {deal&&canCancelDeal(deal.status)&&<div className="action-row"><Button variant="ghost" disabled={acting} onClick={()=>setModal('cancel')}>Cancel deal</Button></div>}
          {!deal&&connection?.status==='active'&&<div className="action-row"><Button variant="secondary" disabled={acting} onClick={()=>{setActing(true);void closeConnection(connection.id).then(async result=>{setActing(false);if(result.error){toast.error(result.error);return}await refreshCollaborationWorkspace(update);toast.success('Collaboration closed.')})}}>Close collaboration</Button></div>}
          <DemoNote>Payments and escrow are not part of this phase.</DemoNote>
        </section>
        {deal&&<section className="panel detail-block agreement-panel">
          <div className="section-heading"><h2>Collaboration brief</h2></div>
          <div className="agreement-grid">
            <div><span>Agreed value</span><strong>{money(deal.agreedBudget)}</strong></div>
            <div><span>Deadline</span><strong>{formatStamp(deal.deadline)||'To be agreed'}</strong></div>
          </div>
          <h4>Deliverable</h4>
          <p className="preserve-lines">{deal.deliverable||'—'}</p>
          <h4>Requirements</h4>
          <p className="preserve-lines">{deal.requirements||'—'}</p>
          {deal.submissionUrl&&<a className="text-link" href={deal.submissionUrl} target="_blank" rel="noreferrer">View submitted work <ExternalLink size={15}/></a>}
          {deal.revisionNote&&<><h4>Revision note</h4><p className="preserve-lines">{deal.revisionNote}</p></>}
        </section>}
        {deal&&<section className="panel detail-block">
          <div className="section-heading"><h2>Timeline</h2></div>
          <div className="agreement-grid">
            <div><span>Started</span><strong>{formatStamp(deal.startedAt)||formatStamp(deal.createdAt)||'—'}</strong></div>
            <div><span>Submitted</span><strong>{formatStamp(deal.submittedAt)||'—'}</strong></div>
            <div><span>Brand verified</span><strong>{formatStamp(deal.brandVerifiedAt)||'—'}</strong></div>
            <div><span>Completed</span><strong>{formatStamp(deal.completedAt)||'—'}</strong></div>
            <div><span>Last updated</span><strong>{formatStamp(deal.updatedAt)||'—'}</strong></div>
          </div>
          {events.length>0&&<ol className="admin-timeline">{events.filter(e=>e.visibility!=='admin').map(event=>(
            <li key={event.id}>
              <strong>{event.action==='creator_submitted'?'Creator submitted':event.action==='brand_verified'?'Brand verified':event.action==='deal_completed'?'Completed':event.action==='brand_requested_revision'?'Brand requested revision':event.action==='platform_approved'||event.action==='platform_verified'?'CollabCy decision':event.action==='platform_requested_revision'?'CollabCy requested revision':event.action==='dispute_opened'?'Dispute opened':event.action==='dispute_resolved'?'CollabCy decision':event.action.replace(/_/g,' ')}</strong>
              {event.note&&<p className="preserve-lines">{event.action==='platform_approved'||event.action==='dispute_resolved'||event.action==='platform_verified'?`Reason for decision: ${event.note}`:event.note}</p>}
              <small>{formatStamp(event.createdAt)}</small>
            </li>
          ))}</ol>}
          {deal.platformVerificationNote&&<p className="preserve-lines"><strong>Platform decision</strong><br/>Reason for decision: {deal.platformVerificationNote}</p>}
        </section>}
      </main>
      <aside>
        <div className="panel partner-panel">
          <Avatar name={partner} image={brand?(application?.creatorAvatar||connection?.partnerAvatar):undefined} color={color} size="lg"/>
          <h3>{partner}</h3>
          <span>{brand?application?.creatorHandle||connection?.partnerHandle||'Creator':application?.campaignBrand||connection?.campaignBrand||'Brand'}</span>
          {brand&&application&&<div className="creator-stats"><div><strong>{compact(application.creatorFollowers)}</strong><small>Followers</small></div><div><strong>{compact(application.creatorImpressions)}</strong><small>Impressions</small></div><div><strong>{money(rate)}</strong><small>Agreed value</small></div></div>}
          <div className="partner-payment"><ShieldCheck size={19}/><div><strong>Agreed value</strong><p>{money(rate)} · No payment collected</p></div></div>
          {conversation&&<Button variant="secondary" onClick={()=>go(`/${s.role}/messages?id=${conversation.id}`)}>Open existing conversation <MessageSquare size={16}/></Button>}
        </div>
      </aside>
    </div>
    <Modal open={modal==='delivery'||modal==='revision'||modal==='cancel'||modal==='dispute'} onClose={()=>setModal('')} title={modal==='delivery'?'Ready for a closer look.':modal==='revision'?'What would make this even better?':modal==='dispute'?'What needs a CollabCy review?':'Cancel this collaboration?'} description={modal==='delivery'?'Share a note and an optional delivery link.':modal==='revision'?'Tell the creator what to change.':modal==='dispute'?'This pauses verification until CollabCy reviews the issue.':'This ends the collaboration workflow. The conversation stays available.'}>
      <form onSubmit={e=>{
        e.preventDefault();
        if(!deal)return;
        if(modal==='delivery'){
          if(delivery.trim()&&!validURL(delivery.trim())){toast.error('Enter a complete http or https delivery link.');return}
          void run(()=>submitDeal(deal.id,note,delivery),'Work submitted.');
        }
        if(modal==='revision')void run(()=>requestDealRevision(deal.id,note),'Revision requested.');
        if(modal==='dispute')void run(()=>openDealDispute(deal.id,note),'Dispute opened.');
        if(modal==='cancel')void run(()=>cancelDeal(deal.id,note),'Collaboration cancelled.');
      }}>
        {modal==='delivery'&&<><Field label="Draft or live-post URL" type="url" value={delivery} onChange={e=>setDelivery(e.target.value)} placeholder="https://"/><Textarea label="A note for the brand" value={note} onChange={e=>setNote(e.target.value)} rows={4} maxLength={2000}/></>}
        {modal==='revision'&&<Textarea label="Requested changes" required minLength={8} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={5}/>}
        {modal==='dispute'&&<Textarea label="What happened" required minLength={8} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={5}/>}
        {modal==='cancel'&&<Textarea label="Cancellation note (optional)" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={4}/>}
        <div className="form-footer">
          <Button variant="secondary" type="button" onClick={()=>setModal('')}>Back</Button>
          <Button type="submit" disabled={acting}>{modal==='delivery'?'Submit work':modal==='revision'?'Request revision':modal==='dispute'?'Open dispute':'Cancel deal'}<ArrowRight size={16}/></Button>
        </div>
      </form>
    </Modal>
  </>;
}

export function DealDetail({id}:{id:string}){
  return <RemoteDealDetail id={id}/>;
}
export function Messages(){return <RemoteMessages/>}
function bumpConversation(conversations:Conversation[],id:string,patch:Partial<Conversation>){
  const next=conversations.map(c=>c.id===id?{...c,...patch}:c);
  const hit=next.find(c=>c.id===id);
  return hit?[hit,...next.filter(c=>c.id!==id)]:next;
}
function RemoteMessages(){
  const {s,go,update}=useStore();
  const router=useRouter();
  const params=useSearchParams();
  const requested=params.get('id')||'';
  const conversations=s.conversations;
  const current=conversations.find(c=>c.id===requested||c.connectionId===requested)||(!requested?conversations[0]:undefined);
  const selected=current?.id||'';
  const selectedRef=useRef(selected);
  selectedRef.current=selected;
  const [q,setQ]=useState('');
  const [text,setText]=useState('');
  const [mobileChat,setMobileChat]=useState(!!requested);
  const [sending,setSending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [history,setHistory]=useState<ChatMessage[]>([]);
  const end=useRef<HTMLDivElement>(null);
  const currentDeal=current?s.workspaceDeals.find(d=>d.connectionId===current.connectionId):undefined;
  function openConversation(id:string,mode:'push'|'replace'='push'){
    if(!id)return;
    if(id===selected&&requested===id){setMobileChat(true);return}
    const href=`/${s.role}/messages?id=${encodeURIComponent(id)}`;
    if(mode==='replace')router.replace(href);
    else router.push(href);
    setText('');
    setSending(false);
    setMobileChat(true);
  }
  useEffect(()=>{
    let cancelled=false;
    void listMyConversations().then(result=>{
      if(cancelled)return;
      setLoading(false);
      if(result.skipped)return;
      if(result.error){toast.error(result.error);return}
      update(p=>({...p,conversations:result.conversations,connections:p.connections.map(c=>({...c,conversationId:result.conversations.find(x=>x.connectionId===c.id)?.id}))}));
    });
    return()=>{cancelled=true};
  },[s.remoteWorkspace,s.profile.email,s.role]);
  useEffect(()=>{
    if(loading)return;
    if(current&&requested&&requested!==current.id){
      openConversation(current.id,'replace');
      return;
    }
    if(!requested&&conversations[0])openConversation(conversations[0].id,'replace');
  },[loading,requested,current?.id,conversations[0]?.id,s.role]);
  useEffect(()=>{
    if(!selected){setHistory([]);setHistoryLoading(false);return}
    const conversationId=selected;
    setHistory([]);
    setHistoryLoading(true);
    setSending(false);
    let cancelled=false;
    void listMessages(conversationId).then(result=>{
      if(cancelled||selectedRef.current!==conversationId)return;
      setHistoryLoading(false);
      if(result.error){toast.error(result.error);return}
      if(!result.skipped)setHistory(result.messages);
    });
    void markConversationRead(conversationId).then(result=>{
      if(result.error||cancelled||selectedRef.current!==conversationId)return;
      update(p=>({...p,conversations:p.conversations.map(c=>c.id===conversationId?{...c,unreadCount:0}:c)}));
    });
    void markConversationNotificationsRead(conversationId).then(result=>{
      if(result.error||cancelled)return;
      update(p=>({...p,notifications:p.notifications.map(n=>n.conversationId===conversationId?{...n,read:true}:n)}));
    });
    const stop=subscribeToConversationMessages(conversationId,message=>{
      if(message.conversationId!==conversationId||selectedRef.current!==conversationId)return;
      setHistory(prev=>prev.some(m=>m.id===message.id)?prev:[...prev,message]);
      if(!message.mine)void markConversationRead(conversationId);
      update(p=>({...p,conversations:bumpConversation(p.conversations,conversationId,{lastMessage:message.body,lastMessageAt:message.created,lastMessageSenderId:message.senderId,unreadCount:0})}));
    });
    return()=>{cancelled=true;stop()};
  },[selected]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth',block:'nearest'})},[history.length,selected]);
  function send(e:React.FormEvent){
    e.preventDefault();
    if(!text.trim()||!current||sending||current.closed)return;
    const conversationId=current.id;
    const body=text.trim();
    setSending(true);
    void sendMessage(conversationId,body).then(result=>{
      if(selectedRef.current===conversationId)setSending(false);
      if(result.error||!result.message){toast.error(result.error||'Could not send your message.');return}
      if(result.message.conversationId!==conversationId)return;
      if(selectedRef.current===conversationId){
        setText('');
        setHistory(prev=>prev.some(m=>m.id===result.message!.id)?prev:[...prev,result.message!]);
      }
      update(p=>({...p,conversations:bumpConversation(p.conversations,conversationId,{lastMessage:result.message!.body,lastMessageAt:result.message!.created,lastMessageSenderId:result.message!.senderId})}));
    });
  }
  const filtered=conversations.filter(c=>`${c.partnerName} ${c.partnerHandle} ${c.campaignTitle} ${c.campaignBrand}`.toLowerCase().includes(q.toLowerCase()));
  return <><PageTitle eyebrow="GREAT PARTNERSHIPS START WITH A CONVERSATION" title="Messages" description="All your collaboration conversations, together."/><div className={`messages-layout panel ${mobileChat?'show-chat':''}`}><aside className="conversation-list"><div className="conversation-search"><SearchBox value={q} onChange={setQ} placeholder="Search conversations…"/></div>{loading&&!conversations.length?<div className="conversation-empty"><p>Loading conversations…</p></div>:filtered.map(c=><button type="button" key={c.id} className={`${selected===c.id?'active':''}${c.unreadCount?' unread':''}`} onClick={()=>openConversation(c.id)}><Avatar name={c.partnerName} image={c.partnerAvatar} color={c.campaignColor}/><div><strong>{c.partnerName||'Participant'}</strong><small>{c.lastMessageAt?new Date(c.lastMessageAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</small><span className="conversation-campaign">{[c.partnerHandle,c.campaignTitle||c.campaignBrand].filter(Boolean).join(' · ')}</span><p>{c.lastMessage||'Start the conversation'}</p></div>{c.unreadCount>0&&<i className="unread-dot"/>}</button>)}{!conversations.length&&!loading&&<div className="conversation-empty"><MessageSquare size={28}/><p>No conversations yet.</p><Button variant="ghost" onClick={()=>go(`/${s.role}/collaborations`)}>View requests <ArrowRight size={15}/></Button></div>}</aside><section className="chat-panel">{current?<><header className="chat-header"><button className="mobile-chat-back icon-button" aria-label="Back to conversations" onClick={()=>setMobileChat(false)}><ArrowLeft size={18}/></button><Avatar name={current.partnerName} image={current.partnerAvatar} color={current.campaignColor}/><div><strong>{current.partnerName||'Participant'}</strong><span>{current.campaignTitle||current.campaignBrand}</span></div><Button variant="secondary" onClick={()=>go(`/${s.role}/collaborations/${current.connectionId}`)}>View deal <ArrowUpRight size={16}/></Button></header><div className="chat-deal-strip"><Handshake size={16}/><Status status={currentDeal?.status||(current.closed?'closed':'active')}/><span>{current.campaignBrand}</span><span>{current.closed?'Conversation closed to new messages':'Live conversation'}</span></div><div className="message-history"><span className="chat-date">Your collaboration conversation</span>{historyLoading&&!history.length?<p className="conversation-empty">Loading messages…</p>:history.length?history.map(m=><div className={`message ${m.mine?'mine':''} ${m.fromPlatform?'platform':''}`} key={m.id}>{!m.mine&&<Avatar name={m.fromPlatform?'CollabCy Admin':current.partnerName} image={m.fromPlatform?undefined:current.partnerAvatar} color={m.fromPlatform?'#211b23':current.campaignColor}/>}<div>{m.fromPlatform&&<small className="admin-chip">CollabCy Admin · Platform Admin</small>}{m.fromPlatform&&!m.mine&&<p className="platform-notice">This message is from CollabCy platform administration.</p>}<p>{m.body}</p><time>{m.time}{m.mine&&<Check size={12}/>}</time></div></div>):<p className="conversation-empty">No messages yet. Say hello to start this collaboration.</p>}<div ref={end}/></div>{current.closed?<div className="message-composer"><div><span>This collaboration is closed. You can still read the history.</span></div></div>:<form className="message-composer" onSubmit={send}><textarea aria-label="Your message" value={text} onChange={e=>setText(e.target.value)} placeholder={`Message ${current.partnerName||'this participant'}…`} maxLength={3000} rows={2} disabled={sending} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(text.trim())send(e as any)}}}/><div><span>Enter to send · Shift + Enter for a new line</span><Button type="submit" disabled={!text.trim()||sending} aria-label="Send message"><Send size={17}/></Button></div></form>}</>:<Empty title="A little hello can go a long way." description={loading?'Loading your conversations.':'No conversations yet.'}/>}</section></div></>
}
