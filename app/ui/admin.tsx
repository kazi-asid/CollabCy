'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {Activity,ArrowLeft,ArrowRight,ArrowUpRight,Building2,Flag,Handshake,Inbox,LayoutDashboard,LogOut,MessageSquare,Send,Settings as SettingsIcon,ShieldCheck,ClipboardList,Users} from 'lucide-react';
import {toast} from 'sonner';
import {useStore} from '../store';
import {ChatMessage,money} from '../data';
import {type DealVerificationEvent} from '../deals/model';
import {Avatar,Button,Empty,Field,Modal,PageTitle,Status,Textarea} from './shared';
import {Sidebar,SidebarProvider,SidebarHeader,SidebarContent,SidebarFooter,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarTrigger,useSidebar} from '@/components/ui/sidebar';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {
  listAdminActivity,
  listAdminConversations,
  listAdminOverview,
  listDealEvents,
  listMessages,
  listVerificationQueue,
  markDealDisputed,
  persistMarketplace,
  recordAdminInternalNote,
  requestPlatformRevision,
  resolveDealDispute,
  sendPlatformMessage,
  subscribeToConversationMessages,
  verifyDealPlatform,
  type AdminActivityItem,
  type AdminConversation,
  type AdminOverview,
  type VerificationQueueItem,
} from '@/lib/supabase';

const NAV:[string,string,typeof LayoutDashboard,boolean?][]=[
  ['','Overview',LayoutDashboard],
  ['queue','Verification Queue',ClipboardList],
  ['disputes','Disputes',Flag],
  ['collaborations','Collaborations',Handshake],
  ['messages','Messages',MessageSquare],
  ['activity','Audit log',Activity],
  ['users','Users',Users,true],
  ['creators','Creators',Users,true],
  ['brands','Brands',Building2,true],
  ['settings','Settings',SettingsIcon],
];

function formatStamp(value?:string|number){
  const t=typeof value==='number'?value:value?Date.parse(value):0;
  if(!t)return '—';
  return new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function waitingLabel(from?:number){
  if(!from)return '—';
  const hours=Math.max(0,Math.round((Date.now()-from)/3600000));
  if(hours<24)return `${hours}h waiting`;
  return `${Math.round(hours/24)}d waiting`;
}
function actionLabel(action:string){
  const labels:Record<string,string>={
    creator_submitted:'Creator submitted',
    brand_verified:'Brand verified',
    deal_completed:'Completed',
    brand_requested_revision:'Brand requested revision',
    platform_approved:'CollabCy decision',
    platform_verified:'CollabCy decision',
    platform_requested_revision:'CollabCy requested revision',
    dispute_opened:'Dispute opened',
    dispute_resolved:'Dispute resolved',
    platform_message_sent:'CollabCy message sent',
    admin_internal_note:'Internal note',
    deal_cancelled:'Cancelled',
  };
  return labels[action]||action.replace(/_/g,' ');
}

export function AdminWorkspace(){
  const {s,go,signOut}=useStore();
  const path=usePathname();
  const section=path.replace(/^\/admin\/?/,'').split('/')[0]||'';
  const dealId=path.startsWith('/admin/collaborations/')?path.split('/')[3]:'';
  if(!s.platformVerifier){
    return <Empty title="This console is for CollabCy platform staff." description="Your account is not authorized as a platform verifier."><Button onClick={()=>go(`/${s.role}/dashboard`)}>Back to workspace</Button></Empty>;
  }
  let content:React.ReactNode;
  if(dealId)content=<AdminDealDetail id={dealId}/>;
  else switch(section){
    case 'queue':content=<AdminQueue defaultTab="needs"/>;break;
    case 'disputes':content=<AdminQueue defaultTab="disputed"/>;break;
    case 'collaborations':content=<AdminQueue defaultTab="completed"/>;break;
    case 'messages':content=<AdminMessages/>;break;
    case 'activity':content=<AdminActivity/>;break;
    case 'users':
    case 'creators':
    case 'brands':content=<Empty title="Not available yet." description="A live user directory is not part of this phase."/>;break;
    case 'settings':content=<AdminSettings/>;break;
    default:content=<AdminOverviewPage/>;
  }
  const title=dealId?'Collaboration':NAV.find(([key])=>key===section)?.[1]||'Overview';
  return <SidebarProvider style={{'--sidebar-width':'248px'} as React.CSSProperties}>
    <AdminSidebar section={section} dealId={dealId}/>
    <div className="workspace-main admin-main">
      <header className="topbar">
        <div className="breadcrumbs">
          <SidebarTrigger className="mobile-trigger"/>
          <span>CollabCy Admin</span><span>/</span><strong>{title}</strong>
        </div>
        <div className="topbar-actions">
          <span className="admin-badge">ADMIN</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="avatar-button" aria-label="Account menu"><Avatar name="CollabCy Admin" size="small"/></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={()=>go('/admin')}>Admin dashboard</DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>go('/admin/queue')}>Verification queue</DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>go('/admin/disputes')}>Disputes</DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>go('/admin/messages')}>Messages</DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>go('/admin/activity')}>Audit log</DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>go('/admin/settings')}>Settings</DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem onSelect={()=>signOut()}><LogOut size={15}/>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="workspace-content admin-content" key={path}>{content}</main>
    </div>
  </SidebarProvider>;
}

function AdminSidebar({section,dealId}:{section:string;dealId:string}){
  const {go}=useStore();
  const {setOpenMobile}=useSidebar();
  return <Sidebar className="admin-sidebar">
    <SidebarHeader className="sidebar-header">
      <div className="admin-brand">
        <strong>CollabCy</strong>
        <span>Platform Admin</span>
        <b className="admin-badge">ADMIN</b>
      </div>
    </SidebarHeader>
    <SidebarContent className="sidebar-content">
      <span className="nav-label">OPERATIONS</span>
      <SidebarMenu>
        {NAV.map(([key,label,Icon,soon])=>(
          <SidebarMenuItem key={key||'overview'}>
            <SidebarMenuButton className="nav-item" isActive={!dealId&&section===key} onClick={()=>{go(key?`/admin/${key}`:'/admin');setOpenMobile(false)}}>
              <Icon/><span>{label}{soon?' · Soon':''}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarContent>
    <SidebarFooter className="sidebar-footer">
      <button className="sidebar-person" onClick={()=>go('/admin/settings')}>
        <Avatar name="CollabCy Admin" size="small"/>
        <span><strong>CollabCy Admin</strong><small>Platform verifier</small></span>
      </button>
    </SidebarFooter>
  </Sidebar>;
}

function AdminOverviewPage(){
  const {s,go}=useStore();
  const [overview,setOverview]=useState<AdminOverview|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!persistMarketplace(s))return;
    void listAdminOverview().then(result=>{
      setLoading(false);
      if(result.error){toast.error(result.error);return}
      if(!result.skipped)setOverview(result.overview||null);
    });
  },[s.remoteWorkspace,s.platformVerifier]);
  const stats=[
    {label:'Pending platform reviews',value:overview?.pendingReviews??0,href:'/admin/queue'},
    {label:'Open disputes',value:overview?.openDisputes??0,href:'/admin/disputes'},
    {label:'Active collaborations',value:overview?.activeCollaborations??0,href:'/admin/collaborations'},
    {label:'Completed collaborations',value:overview?.completedCollaborations??0,href:'/admin/collaborations'},
    {label:'Recently completed',value:overview?.recentlyCompleted??0,href:'/admin/collaborations'},
    {label:'Recent escalations',value:overview?.recentEscalations??0,href:'/admin/disputes'},
  ];
  return <>
    <PageTitle eyebrow="COLLABCY ADMIN" title="Platform operations" description="Review escalations, disputes, and platform decisions. Normal brand-approved collaborations complete without this queue."/>
    {loading?<Empty title="Loading live metrics." description="Reading current collaboration data from CollabCy."/>:<div className="admin-stat-grid">{stats.map(item=>(
      <button className="stat-card" key={item.label} onClick={()=>go(item.href)}>
        <div><span>{item.label}</span></div>
        <strong>{item.value}</strong>
        <small>{item.value===0?'None right now':'Live count'}</small>
      </button>
    ))}</div>}
  </>;
}

function AdminQueue({defaultTab}:{defaultTab:'needs'|'disputed'|'completed'}){
  const {s,go}=useStore();
  const [tab,setTab]=useState(defaultTab);
  const [items,setItems]=useState<VerificationQueueItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [current,setCurrent]=useState<VerificationQueueItem|null>(null);
  const [modal,setModal]=useState('');
  const [note,setNote]=useState('');
  const [internal,setInternal]=useState('');
  const [outcome,setOutcome]=useState<'completed'|'revision_requested'|'dismissed'>('completed');
  const [acting,setActing]=useState(false);
  useEffect(()=>{setTab(defaultTab)},[defaultTab]);
  async function refresh(filter=tab){
    const result=await listVerificationQueue(filter);
    setLoading(false);
    if(result.skipped)return;
    if(result.error){toast.error(result.error);return}
    setItems(result.items);
  }
  useEffect(()=>{
    if(!persistMarketplace(s)||!s.platformVerifier)return;
    setLoading(true);
    void refresh(tab);
  },[tab,s.platformVerifier,s.remoteWorkspace]);
  async function run(action:()=>Promise<{error?:string}>,success:string){
    setActing(true);
    const result=await action();
    setActing(false);
    if(result.error){toast.error(result.error);return}
    setModal('');
    setNote('');
    setInternal('');
    toast.success(success);
    await refresh();
  }
  return <>
    <PageTitle eyebrow="COLLABCY REVIEW" title={tab==='disputed'?'Disputes':tab==='completed'?'Collaborations':'Verification queue'} description={tab==='needs'?'Only escalated collaborations appear here. Brand-approved work completes without platform intervention.':tab==='disputed'?'Open disputes waiting for a recorded platform decision.':'Recently completed collaborations from live data.'}/>
    <div className="list-toolbar admin-tabs">
      {[['needs','Needs review'],['disputed','Disputes'],['completed','Recently completed']].map(([value,label])=>(
        <button key={value} className={tab===value?'active':''} onClick={()=>setTab(value as typeof tab)}>{label}</button>
      ))}
    </div>
    {loading?<Empty title="Loading the queue." description="Checking collaborations that need platform review."/>:items.length?<div className="admin-queue">{items.map(item=>{
      const deal=item.deal;
      return <article className="admin-queue-card panel" key={deal.id}>
        <div className="admin-queue-meta">
          <Status status={deal.status}/>
          {item.disputeStatus&&<span className="admin-chip">{item.disputeStatus}</span>}
          <span>{waitingLabel(deal.submittedAt)}</span>
        </div>
        <h3>{item.campaignTitle}</h3>
        <p>{item.brandName} · {item.creatorName} · {money(deal.agreedBudget)}</p>
        <p className="subtle">Submitted {formatStamp(deal.submittedAt)}{deal.brandVerifiedAt?` · Brand verified ${formatStamp(deal.brandVerifiedAt)}`:''}</p>
        {item.disputeReason&&<p className="preserve-lines">Dispute reason: {item.disputeReason}</p>}
        <div className="action-row">
          <Button variant="secondary" onClick={()=>go(`/admin/collaborations/${deal.id}`)}>Open collaboration</Button>
          {deal.submissionUrl&&<a className="text-link" href={deal.submissionUrl} target="_blank" rel="noreferrer">View submitted work <ArrowUpRight size={14}/></a>}
          {item.conversationId&&<Button variant="ghost" onClick={()=>go(`/admin/messages?id=${item.conversationId}`)}>View conversation</Button>}
          {tab!=='completed'&&<>
            {deal.status==='platform_review'&&<Button disabled={acting} onClick={()=>{setCurrent(item);setNote('');setInternal('');setModal('decide')}}>Platform decision</Button>}
            <Button variant="secondary" disabled={acting} onClick={()=>{setCurrent(item);setNote('');setModal('revision')}}>Request revision</Button>
            {deal.status!=='disputed'&&<Button variant="ghost" disabled={acting} onClick={()=>{setCurrent(item);setNote('');setModal('dispute')}}>Open dispute</Button>}
            {deal.status==='disputed'&&<Button disabled={acting} onClick={()=>{setCurrent(item);setNote('');setOutcome('completed');setModal('resolve')}}>Resolve dispute</Button>}
          </>}
        </div>
      </article>;
    })}</div>:<Empty title={tab==='disputed'?'No open disputes.':tab==='completed'?'No recent completions.':'Nothing needs platform review.'} description="Escalated collaborations and disputes will appear here. Brand-approved work does not."/>}
    <Modal open={!!modal} onClose={()=>setModal('')} title={modal==='decide'?'Platform decision':modal==='revision'?'Request a revision':modal==='dispute'?'Escalate to a dispute':'Resolve the dispute'} description={modal==='decide'?'This is a recorded CollabCy review decision, not a personal guarantee of the brand relationship. A reason is required.':'The reason is stored in the collaboration timeline.'}>
      <form onSubmit={e=>{
        e.preventDefault();
        if(!current)return;
        if(modal==='decide')void run(async()=>{
          const result=await verifyDealPlatform(current.deal.id,note);
          if(result.error)return result;
          if(internal.trim().length>=8){
            const extra=await recordAdminInternalNote(current.deal.id,internal);
            if(extra.error)return extra;
          }
          return result;
        },'Platform decision recorded.');
        if(modal==='revision')void run(()=>requestPlatformRevision(current.deal.id,note),'Revision requested.');
        if(modal==='dispute')void run(()=>markDealDisputed(current.deal.id,note),'Escalated for platform review.');
        if(modal==='resolve')void run(()=>resolveDealDispute(current.deal.id,outcome,note),'Platform decision recorded.');
      }}>
        {modal==='resolve'&&<Field label="Decision">
          <select value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}>
            <option value="completed">Complete collaboration</option>
            <option value="revision_requested">Request revision</option>
            <option value="dismissed">Dismiss and return to brand review</option>
          </select>
        </Field>}
        {modal==='decide'&&<Field label="Decision"><input value="Complete collaboration" disabled/></Field>}
        <Textarea label="Reason for decision" required minLength={8} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={4}/>
        {modal==='decide'&&<Textarea label="Internal note (optional, not shown to participants)" minLength={0} maxLength={2000} value={internal} onChange={e=>setInternal(e.target.value)} rows={3}/>}
        <div className="form-footer">
          <Button variant="secondary" type="button" onClick={()=>setModal('')}>Back</Button>
          <Button type="submit" disabled={acting}>Record decision<ArrowRight size={16}/></Button>
        </div>
      </form>
    </Modal>
  </>;
}

function AdminDealDetail({id}:{id:string}){
  const {s,go}=useStore();
  const [item,setItem]=useState<VerificationQueueItem|null>(null);
  const [events,setEvents]=useState<DealVerificationEvent[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    void Promise.all([listVerificationQueue('needs'),listVerificationQueue('disputed'),listVerificationQueue('completed')]).then(async results=>{
      const found=results.flatMap(r=>r.items).find(row=>row.deal.id===id);
      if(!cancelled)setItem(found||null);
      const timeline=await listDealEvents(id);
      if(!cancelled){
        if(timeline.error)toast.error(timeline.error);
        else setEvents(timeline.events);
        setLoading(false);
      }
    });
    return()=>{cancelled=true};
  },[id,s.remoteWorkspace]);
  if(loading)return <Empty title="Loading collaboration." description="Reading the live deal record and timeline."/>;
  if(!item)return <Empty title="This collaboration is not in the admin queue." description="Only escalated or recently completed collaborations appear here."><Button onClick={()=>go('/admin/queue')}>Back to queue</Button></Empty>;
  const deal=item.deal;
  return <>
    <button className="back-link" onClick={()=>go('/admin/queue')}><ArrowLeft size={16}/>Verification queue</button>
    <PageTitle eyebrow="PLATFORM REVIEW" title={item.campaignTitle} description={`${item.brandName} · ${item.creatorName}`}>
      <Status status={deal.status}/>
    </PageTitle>
    <div className="admin-detail-grid">
      <section className="panel">
        <h2>Collaboration</h2>
        <div className="agreement-grid">
          <div><span>Brand</span><strong>{item.brandName}</strong></div>
          <div><span>Creator</span><strong>{item.creatorName}</strong></div>
          <div><span>Agreed value</span><strong>{money(deal.agreedBudget)}</strong></div>
          <div><span>Submitted</span><strong>{formatStamp(deal.submittedAt)}</strong></div>
        </div>
        {deal.submissionUrl&&<a className="delivery-link" href={deal.submissionUrl} target="_blank" rel="noreferrer"><span><strong>Submitted work</strong><small>{deal.submissionUrl}</small></span></a>}
        {deal.submissionNote&&<blockquote>{deal.submissionNote}</blockquote>}
        {item.disputeReason&&<div className="notice-box"><Flag size={18}/>Dispute reason: {item.disputeReason}</div>}
        <div className="action-row">
          {item.conversationId&&<Button variant="secondary" onClick={()=>go(`/admin/messages?id=${item.conversationId}`)}>Open conversation</Button>}
        </div>
      </section>
      <section className="panel">
        <h2>Timeline</h2>
        <ol className="admin-timeline">
          {events.length?events.map(event=>(
            <li key={event.id} className={event.visibility==='admin'?'internal':''}>
              <strong>{actionLabel(event.action)}</strong>
              <span>{event.fromStatus} → {event.toStatus}</span>
              {event.note&&<p className="preserve-lines">{event.visibility==='admin'?'Internal: ':''}{event.note}</p>}
              <small>{formatStamp(event.createdAt)}{event.visibility==='admin'?' · Internal only':''}</small>
            </li>
          )):<p>No verification events yet.</p>}
        </ol>
      </section>
    </div>
  </>;
}

function AdminMessages(){
  const {s}=useStore();
  const params=typeof window==='undefined'?null:new URLSearchParams(window.location.search);
  const requested=params?.get('id')||'';
  const [conversations,setConversations]=useState<AdminConversation[]>([]);
  const [selected,setSelected]=useState(requested);
  const [history,setHistory]=useState<ChatMessage[]>([]);
  const [text,setText]=useState('');
  const [sending,setSending]=useState(false);
  const [mobileChat,setMobileChat]=useState(!!requested);
  const end=useRef<HTMLDivElement>(null);
  const current=conversations.find(c=>c.id===selected);
  useEffect(()=>{
    void listAdminConversations().then(result=>{
      if(result.error){toast.error(result.error);return}
      if(!result.skipped)setConversations(result.conversations);
    });
  },[s.remoteWorkspace]);
  useEffect(()=>{
    if(requested&&requested!==selected)setSelected(requested);
    else if(!selected&&conversations[0])setSelected(conversations[0].id);
  },[requested,conversations,selected]);
  useEffect(()=>{
    if(!selected){setHistory([]);return}
    let cancelled=false;
    void listMessages(selected).then(result=>{
      if(cancelled)return;
      if(result.error){toast.error(result.error);return}
      if(!result.skipped)setHistory(result.messages);
    });
    const stop=subscribeToConversationMessages(selected,message=>{
      setHistory(prev=>prev.some(m=>m.id===message.id)?prev:[...prev,message]);
    });
    return()=>{cancelled=true;stop()};
  },[selected]);
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth',block:'nearest'})},[history.length,selected]);
  function send(e:React.FormEvent){
    e.preventDefault();
    if(!text.trim()||!current||sending)return;
    const body=text.trim();
    setSending(true);
    void sendPlatformMessage(current.id,body).then(result=>{
      setSending(false);
      if(result.error||!result.message){toast.error(result.error||'Could not send this platform message.');return}
      setText('');
      setHistory(prev=>prev.some(m=>m.id===result.message!.id)?prev:[...prev,result.message!]);
    });
  }
  return <>
    <PageTitle eyebrow="PLATFORM COMMUNICATION" title="Messages" description="Conversation with both parties. Internal notes stay off this thread."/>
    <div className={`messages-layout panel admin-messages ${mobileChat?'show-chat':''}`}>
      <aside className="conversation-list">
        {conversations.map(c=>(
          <button key={c.id} className={selected===c.id?'active':''} onClick={()=>{setSelected(c.id);setMobileChat(true)}}>
            <Avatar name={c.brandName} color={c.campaignColor}/>
            <div>
              <strong>{c.brandName} · {c.creatorName}</strong>
              <small>{c.dealStatus}</small>
              <p>{c.lastMessage||'No messages yet'}</p>
            </div>
          </button>
        ))}
        {!conversations.length&&<div className="conversation-empty"><Inbox size={28}/><p>No collaboration conversations need platform review.</p></div>}
      </aside>
      <section className="chat-panel">
        {current?<>
          <header className="chat-header">
            <button className="mobile-chat-back icon-button" aria-label="Back to conversations" onClick={()=>setMobileChat(false)}><ArrowLeft size={18}/></button>
            <div>
              <strong>{current.campaignTitle}</strong>
              <span>{current.brandName} · {current.creatorName}</span>
            </div>
          </header>
          <div className="chat-deal-strip"><ShieldCheck size={16}/><Status status={current.dealStatus||'active'}/><span>You are messaging as CollabCy Admin</span></div>
          <div className="message-history">
            <span className="chat-date">This message is from CollabCy platform administration when sent with the admin composer.</span>
            {history.map(m=>(
              <div className={`message ${m.mine?'mine':''} ${m.fromPlatform?'platform':''}`} key={m.id}>
                {!m.mine&&<Avatar name={m.fromPlatform?'CollabCy Admin':current.creatorName} color={m.fromPlatform?'#211b23':current.campaignColor}/>}
                <div>
                  {m.fromPlatform&&<small className="admin-chip">CollabCy Admin · Platform Admin</small>}
                  <p>{m.body}</p>
                  <time>{m.time}</time>
                </div>
              </div>
            ))}
            <div ref={end}/>
          </div>
          <form className="message-composer" onSubmit={send}>
            <textarea aria-label="Platform message" value={text} onChange={e=>setText(e.target.value)} placeholder="Message both parties as CollabCy Admin…" maxLength={3000} rows={2} disabled={sending}/>
            <div>
              <span>Visible to the creator and the brand as CollabCy Admin</span>
              <Button type="submit" disabled={!text.trim()||sending} aria-label="Send platform message"><Send size={17}/></Button>
            </div>
          </form>
        </>:<Empty title="Select a collaboration conversation." description="Platform messages are labeled CollabCy Admin."/>}
      </section>
    </div>
  </>;
}

function AdminActivity(){
  const {s,go}=useStore();
  const [items,setItems]=useState<AdminActivityItem[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    void listAdminActivity().then(result=>{
      setLoading(false);
      if(result.error){toast.error(result.error);return}
      if(!result.skipped)setItems(result.items);
    });
  },[s.remoteWorkspace]);
  return <>
    <PageTitle eyebrow="ACTIVITY / AUDIT LOG" title="Platform audit log" description="Immutable verification events recorded for CollabCy decisions."/>
    {loading?<Empty title="Loading audit events." description="Reading platform verification history."/>:items.length?<div className="admin-audit">{items.map(item=>(
      <button className="admin-audit-row panel" key={item.id} onClick={()=>go(`/admin/collaborations/${item.dealId}`)}>
        <div>
          <strong>{actionLabel(item.action)}</strong>
          <p>{item.campaignTitle} · {item.fromStatus} → {item.toStatus}</p>
          {item.note&&<p className="preserve-lines">{item.visibility==='admin'?'Internal: ':''}{item.note}</p>}
        </div>
        <small>{formatStamp(item.createdAt)}</small>
      </button>
    ))}</div>:<Empty title="No platform events yet." description="Admin decisions, messages, and dispute resolutions will appear here."/>}
  </>;
}

function AdminSettings(){
  const {s,go,signOut}=useStore();
  return <>
    <PageTitle eyebrow="SETTINGS" title="Platform admin settings" description="Authorization is server-side through platform_verifiers. This screen does not grant access."/>
    <section className="panel">
      <h2>Signed in as</h2>
      <p>{s.profile.email||'Authenticated platform verifier'}</p>
      <p>Workspace identity in this console: CollabCy Admin. Your personal creator or brand profile is not shown to participants in platform messages.</p>
      <div className="action-row">
        <Button variant="secondary" onClick={()=>go(`/${s.role}/dashboard`)}>Open {s.role} workspace</Button>
        <Button variant="ghost" onClick={()=>signOut()}>Sign out</Button>
      </div>
    </section>
  </>;
}
