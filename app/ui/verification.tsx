'use client';
import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,Flag,RotateCcw,ShieldCheck} from 'lucide-react';
import {toast} from 'sonner';
import {useStore} from '../store';
import {money} from '../data';
import {Avatar,Button,Empty,Field,Modal,PageTitle,Status,Textarea,ViewTabs} from './shared';
import {listVerificationQueue,markDealDisputed,persistMarketplace,requestPlatformRevision,resolveDealDispute,verifyDealPlatform,type VerificationQueueItem} from '@/lib/supabase';

function formatStamp(value?:string|number){
  const t=typeof value==='number'?value:value?Date.parse(value):0;
  if(!t)return '—';
  return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

export function VerificationQueue(){
  const {s}=useStore();
  const [tab,setTab]=useState<'needs'|'disputed'|'completed'>('needs');
  const [items,setItems]=useState<VerificationQueueItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState('');
  const [note,setNote]=useState('');
  const [outcome,setOutcome]=useState<'completed'|'revision_requested'|'dismissed'>('completed');
  const [current,setCurrent]=useState<VerificationQueueItem|null>(null);
  const [acting,setActing]=useState(false);

  async function refresh(filter=tab){
    const result=await listVerificationQueue(filter);
    setLoading(false);
    if(result.skipped)return;
    if(result.error){toast.error(result.error);return}
    setItems(result.items);
  }

  useEffect(()=>{
    if(!persistMarketplace(s)||!s.platformVerifier)return;
    let cancelled=false;
    setLoading(true);
    void refresh(tab).then(()=>{if(cancelled)return});
    return()=>{cancelled=true};
  },[tab,s.platformVerifier,s.remoteWorkspace]);

  if(!s.platformVerifier){
    return <Empty title="This queue is for CollabCy verification." description="Only authorized platform verifiers can review collaborations here."/>;
  }

  async function run(action:()=>Promise<{error?:string}>,success:string){
    if(!current)return;
    setActing(true);
    const result=await action();
    setActing(false);
    if(result.error){toast.error(result.error);return}
    setModal('');
    setNote('');
    toast.success(success);
    await refresh();
  }

  return <>
    <PageTitle eyebrow="COLLABCY REVIEW" title="Verification queue" description="Brand-verified collaborations wait here until CollabCy confirms the work."/>
    <div className="list-toolbar">
      <ViewTabs value={tab} onChange={v=>setTab(v as typeof tab)} options={[
        {value:'needs',label:'Needs verification'},
        {value:'disputed',label:'Disputed'},
        {value:'completed',label:'Recently completed'},
      ]}/>
    </div>
    {loading?<Empty title="Loading the review queue." description="Checking collaborations that need CollabCy verification."/>:items.length?<div className="deal-list">{items.map(item=>{
      const deal=item.deal;
      return <article className="deal-list-card panel" key={deal.id}>
        <Avatar name={item.creatorName} color={item.campaignColor}/>
        <div>
          <div className="deal-partner">{item.creatorName} · {item.brandName}</div>
          <h3>{item.campaignTitle}</h3>
          <span className="subtle">Submitted {formatStamp(deal.submittedAt)}{deal.brandVerifiedAt?` · Brand verified ${formatStamp(deal.brandVerifiedAt)}`:''}</span>
        </div>
        <div className="deal-list-end">
          <Status status={deal.status}/>
          <strong>{money(deal.agreedBudget)}</strong>
        </div>
        <div className="action-row" style={{gridColumn:'1 / -1',marginTop:8}}>
          {deal.submissionUrl&&<a className="text-link" href={deal.submissionUrl} target="_blank" rel="noreferrer">View submission</a>}
          {tab!=='completed'&&<>
            {deal.status!=='disputed'&&<Button disabled={acting} onClick={()=>{setCurrent(item);setNote('');setModal('verify')}}>Verify & complete <CheckCircle2 size={16}/></Button>}
            <Button variant="secondary" disabled={acting} onClick={()=>{setCurrent(item);setNote('');setModal('revision')}}>Request revision <RotateCcw size={16}/></Button>
            {deal.status!=='disputed'&&<Button variant="ghost" disabled={acting} onClick={()=>{setCurrent(item);setNote('');setModal('dispute')}}>Open dispute <Flag size={16}/></Button>}
            {deal.status==='disputed'&&<Button disabled={acting} onClick={()=>{setCurrent(item);setNote('');setOutcome('completed');setModal('resolve')}}>Resolve dispute <ShieldCheck size={16}/></Button>}
          </>}
        </div>
        {item.disputeReason&&<p className="preserve-lines" style={{gridColumn:'1 / -1'}}>{item.disputeStatus}: {item.disputeReason}</p>}
      </article>;
    })}</div>:<Empty title={tab==='disputed'?'No open disputes.':tab==='completed'?'No recent completions.':'Nothing waiting for CollabCy.'} description="When a brand verifies a submission, it will appear here."/>}
    <Modal open={!!modal} onClose={()=>setModal('')} title={modal==='verify'?'Verify this collaboration?':modal==='revision'?'Request a CollabCy revision':modal==='dispute'?'Mark this as disputed':'Resolve the dispute'} description={modal==='verify'?'This completes the collaboration. No payment is collected.':'Add a note the participants can see.'}>
      <form onSubmit={e=>{
        e.preventDefault();
        if(!current)return;
        if(modal==='verify')void run(()=>verifyDealPlatform(current.deal.id,note),'Collaboration completed by CollabCy.');
        if(modal==='revision')void run(()=>requestPlatformRevision(current.deal.id,note),'Revision requested.');
        if(modal==='dispute')void run(()=>markDealDisputed(current.deal.id,note),'Marked as disputed.');
        if(modal==='resolve')void run(()=>resolveDealDispute(current.deal.id,outcome,note),'Dispute updated.');
      }}>
        {modal==='resolve'&&<Field label="Resolution">
          <select value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}>
            <option value="completed">Verify and complete</option>
            <option value="revision_requested">Request revision</option>
            <option value="dismissed">Dismiss and return to review</option>
          </select>
        </Field>}
        <Textarea label={modal==='verify'?'Note (optional)':'Note'} required={modal!=='verify'} minLength={modal==='verify'?0:8} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={4}/>
        <div className="form-footer">
          <Button variant="secondary" type="button" onClick={()=>setModal('')}>Back</Button>
          <Button type="submit" disabled={acting}>{modal==='verify'?'Verify & complete':modal==='resolve'?'Save resolution':'Submit'}<ArrowRight size={16}/></Button>
        </div>
      </form>
    </Modal>
  </>;
}
