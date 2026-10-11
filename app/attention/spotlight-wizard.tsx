'use client';
import {useState,useRef} from 'react';
import {ArrowRight,ArrowLeft,Crown,Check,Sparkles,Upload,Loader2} from 'lucide-react';
import {Button,Field,Textarea,Pick} from '../ui/shared';
import Link from '../ui/app-link';
import {useStore} from '../store';
import {useAttention} from './store';
import {attentionCategories,safeWebsite,websiteHost,MIN_INITIAL_BID,MAX_INITIAL_BID,getProjectedRank,findExistingListingByWebsite} from './model';
import {ALREADY_LISTED_MESSAGE,alreadyListedBidPath} from '@/lib/attention-payments';
import {money} from '../data';

export function SpotlightWizard({onCancel}:{onCancel?:()=>void}){
  const {go}=useStore();
  const {state,repository,isDemo}=useAttention();
  const [step,setStep]=useState(0),[name,setName]=useState(''),[url,setUrl]=useState(''),[description,setDescription]=useState(''),[category,setCategory]=useState('AI Tools'),[bid,setBid]=useState(String(MIN_INITIAL_BID)),[logo,setLogo]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[existingPath,setExistingPath]=useState('');
  const submitting=useRef(false);
  const close=()=>onCancel?onCancel():go('/');
  const bidValue=Number(bid);
  const bidOk=Number.isInteger(bidValue)&&bidValue>=MIN_INITIAL_BID&&bidValue<=MAX_INITIAL_BID;
  const projected=bidOk?getProjectedRank(state.products,bidValue):null;
  async function next(){
    setError('');
    if(step===0){
      if(!name.trim()||!safeWebsite(url)){setError('Add your product name and a valid website.');return;}
      const existing=findExistingListingByWebsite(state.products,url);
      if(existing){setError(ALREADY_LISTED_MESSAGE);setExistingPath(alreadyListedBidPath(existing.slug));return;}
      setExistingPath('');
      setStep(1);
      return;
    }
    if(step===1){
      if(!bidOk){setError(`Choose a whole-dollar bid from $${MIN_INITIAL_BID} to $${MAX_INITIAL_BID.toLocaleString()}.`);return;}
      setStep(2);
      return;
    }
    if(submitting.current)return;
    submitting.current=true;
    setBusy(true);
    try{
      if(isDemo){const product=await repository.createProduct({brandId:'',brandName:name.trim(),name,websiteUrl:safeWebsite(url)||url,description:description.trim(),category,logo:logo||name[0],initialBid:bidValue});go('/discover/product/'+product.slug);return;}
      const response=await fetch('/api/attention/listing-checkout',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          increment:bidValue,
          listing:{name,websiteUrl:safeWebsite(url)||url,description:description.trim(),category,logo:logo||undefined,brandName:name.trim()},
        }),
      });
      const payload=await response.json().catch(()=>({})) as {checkout_url?:unknown;error?:unknown;already_listed?:unknown;bid_path?:unknown};
      if(payload.already_listed===true){
        setError(typeof payload.error==='string'&&payload.error?payload.error:ALREADY_LISTED_MESSAGE);
        if(typeof payload.bid_path==='string'&&payload.bid_path.startsWith('/discover/product/'))setExistingPath(payload.bid_path);
        return;
      }
      if(!response.ok||typeof payload.checkout_url!=='string'||!payload.checkout_url){
        setError(typeof payload.error==='string'&&payload.error?payload.error:'Could not start checkout.');
        return;
      }
      window.location.assign(payload.checkout_url);
    }catch{
      setError('Could not start checkout.');
    }finally{
      submitting.current=false;
      setBusy(false);
    }
  }
  return <div className="spotlight-wizard"><aside className="wizard-preview"><div className="wizard-orbit"/><span className="wizard-kicker"><Sparkles size={14}/> YOUR NEXT BIG MOMENT</span><Crown className="wizard-crown" size={48}/><h2>Small brand.<br/><em>Big spotlight.</em></h2><p>Great ideas deserve a place to shine.</p><div className="wizard-brand-preview"><span>{logo?<img src={logo} alt="Your logo preview"/>:name[0]?.toUpperCase()||'✦'}</span><strong>{name||'Your brand, right here'}</strong><small>{category} · from ${bid||MIN_INITIAL_BID}</small></div><span className="wizard-preview-foot">YOUR BRAND. NEW POSSIBILITIES.</span></aside><div className="wizard-main">
    <nav className="wizard-steps" aria-label="Listing progress">{['Your brand','Placement','Review'].map((label,i)=><span key={label} className={i===step?'current':i<step?'complete':''} aria-current={i===step?'step':undefined}><b>{i<step?<Check size={12}/>:i+1}</b>{label}</span>)}</nav><form onSubmit={e=>{e.preventDefault();void next();}}><div className="wizard-step" key={step}><span className="wizard-kicker">STEP 0{step+1} / 03</span><h2>{['Let’s meet your brand.','Choose your spotlight.','Ready for your big moment?'][step]}</h2><p className="wizard-subtitle">{['A name, a link, and the idea behind it.','Your initial bid is paid through Dodo and sets your starting position.','Review your spotlight bid, then pay to claim it.'][step]}</p>
      {step===0?<><Field label="Brand name" placeholder="Your next big thing" required maxLength={60} value={name} onChange={e=>setName(e.target.value)}/><Field label="Website URL" placeholder="yourbrand.com" type="text" inputMode="url" autoComplete="url" required value={url} onChange={e=>setUrl(e.target.value)}/><Textarea label="Short description" placeholder="What makes your brand worth discovering?" rows={2} maxLength={240} value={description} onChange={e=>setDescription(e.target.value)}/></>:step===1?<><label className="wizard-upload"><span>{logo?<img src={logo} alt="Brand logo"/>:<Upload size={20}/>}</span><div><strong>Add your brand logo</strong><small>Optional · PNG, JPG, WebP · up to 500 KB</small></div><input aria-label="Upload brand logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>500000){setError('Choose a PNG, JPG, or WebP under 500 KB.');return;}const reader=new FileReader();reader.onload=()=>setLogo(String(reader.result));reader.onerror=()=>setError('Could not read the logo. Please try again.');reader.readAsDataURL(f);}}/></label><div className="field"><span>Category</span><Pick label="Brand category" value={category} onChange={setCategory} options={attentionCategories}/></div><Field label="Initial bid · USD" type="number" required min={MIN_INITIAL_BID} max={MAX_INITIAL_BID} step={1} value={bid} onChange={e=>setBid(e.target.value)}/><div className="wizard-note"><Crown size={16}/>Minimum bid {money(MIN_INITIAL_BID)}. Pay the amount you enter — nothing is added automatically.</div><p className="bid-projection" role="status">{bidOk&&projected?`Your ${money(bidValue)} bid would place you at #${projected}.`:`Enter a whole-dollar bid from ${money(MIN_INITIAL_BID)} to preview your position.`}</p></>:<><div className="wizard-review"><strong>{name}</strong><small>{websiteHost(url)} · {category}</small><p>{description}</p></div><dl className="wizard-receipt"><div><dt>Spotlight placement</dt><dd>Initial bid</dd></div><div><dt>Initial bid</dt><dd>{money(bidOk?bidValue:0)}</dd></div>{projected!=null&&<div><dt>Projected position</dt><dd>#{projected}</dd></div>}</dl><div className="wizard-note"><Check size={16}/>{isDemo?'This demo listing is created in your preview only. No payment needed.':'You pay this initial bid through Dodo Payments. The listing goes live after payment is confirmed.'}</div></>}
    </div><div className="wizard-error" role="status">{error}{existingPath&&<p><Link className="btn btn-secondary" href={existingPath}>Bid more on the existing listing</Link></p>}</div><footer className="wizard-footer"><Button type="button" variant="ghost" disabled={busy} onClick={()=>step?setStep(step-1):close()}>{step?<><ArrowLeft size={15}/>Back</>:'Cancel'}</Button><Button className="spotlight-button" type="submit" disabled={busy}>{busy?<><Loader2 className="wizard-spinner" size={16}/>Starting checkout…</>:<>{step===2?(isDemo?'Create demo listing':'Claim your spotlight'):'Continue'}<ArrowRight size={16}/></>}</Button></footer></form>
  </div></div>;
}
