'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowUpRight,MousePointer2} from 'lucide-react';
import {getSupabase} from '../../lib/supabase';
import {activityTickerText,type ActivityEvent,type Product} from './model';
import {useAttention} from './store';
import {useSiteVisits} from './site-visits';

const TICKER_LIMIT=12;
const TICKER_MS=4000;

function recentTickerItems(activity:ActivityEvent[],products:Product[]){
  const names=new Map(products.map(product=>[product.id,product.name]));
  const items:{id:string;text:string}[]=[];
  for(const event of activity){
    const name=names.get(event.productId);
    if(!name)continue;
    items.push({id:event.id,text:activityTickerText(event,name)});
    if(items.length>=TICKER_LIMIT)break;
  }
  return items;
}

function ActivityTicker({items}:{items:{id:string;text:string}[]}){
  const newestId=items[0]?.id||'';
  const [index,setIndex]=useState(0);
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>setIndex(0));return()=>window.cancelAnimationFrame(frame);},[newestId]);
  useEffect(()=>{
    if(items.length<2)return;
    const timer=window.setInterval(()=>setIndex(current=>(current+1)%items.length),TICKER_MS);
    return()=>window.clearInterval(timer);
  },[items.length,newestId]);
  const item=items.length?items[index%items.length]:null;
  return <span className="audience-ticker" aria-live="polite" aria-atomic="true" aria-label="Latest marketplace activity">
    {item
      ? <span className="audience-ticker-copy" key={`${item.id}:${index}`} title={item.text}><em>{item.text}</em><ArrowUpRight size={12} aria-hidden="true"/></span>
      : <span className="audience-ticker-copy">Waiting for live activity…</span>}
  </span>;
}

export function AudiencePulse(){
  const {state}=useAttention();
  const tickerItems=useMemo(()=>recentTickerItems(state.activity,state.products),[state.activity,state.products]);
  const [live,setLive]=useState<number|null>(null);
  const visits=useSiteVisits();
  const [online,setOnline]=useState(false);
  useEffect(()=>{
    const tabId=crypto.randomUUID();
    let visitor:string;
    try{visitor=localStorage.getItem('collabcy-visitor')||crypto.randomUUID();localStorage.setItem('collabcy-visitor',visitor);}catch{visitor=crypto.randomUUID();}
    const peers=new Map<string,number>();
    const bc=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('collabcy-audience'):null;
    let remoteLive=false;
    const localCount=()=>{
      for(const [key,at] of peers)if(Date.now()-at>18000)peers.delete(key);
      return Math.max(1,peers.size);
    };
    const ping=()=>{
      peers.set(tabId,Date.now());
      bc?.postMessage({id:tabId,at:Date.now()});
      if(!remoteLive)setLive(localCount());
    };
    if(bc)bc.onmessage=e=>{
      if(typeof e.data?.id!=='string')return;
      if(e.data.left)peers.delete(e.data.id);
      else if(typeof e.data.at==='number')peers.set(e.data.id,e.data.at);
      if(!remoteLive)setLive(localCount());
    };
    ping();
    const timer=setInterval(ping,5000);
    const client=getSupabase();
    const channel=client?.channel('collabcy-public-audience',{config:{presence:{key:tabId}}});
    const syncLive=()=>{
      if(!channel)return;
      const count=Object.keys(channel.presenceState()).length;
      remoteLive=true;
      setLive(Math.max(1,count));
      setOnline(true);
    };
    channel?.on('presence',{event:'sync'},syncLive)
      .on('presence',{event:'join'},syncLive)
      .on('presence',{event:'leave'},syncLive)
      .subscribe(status=>{
        if(status==='SUBSCRIBED')void channel.track({tab:tabId,visitor,joinedAt:Date.now()});
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          remoteLive=false;
          setOnline(false);
          setLive(localCount());
        }
      });
    const onHide=()=>{
      if(document.visibilityState==='hidden'){
        if(channel)void channel.untrack();
      }else if(channel){
        void channel.track({tab:tabId,visitor,joinedAt:Date.now()});
      }
    };
    document.addEventListener('visibilitychange',onHide);
    return()=>{
      clearInterval(timer);
      document.removeEventListener('visibilitychange',onHide);
      bc?.postMessage({id:tabId,left:true});
      bc?.close();
      if(channel){
        void channel.untrack();
        if(client)void client.removeChannel(channel);
      }
    };
  },[]);
  return <div className="audience-pulse" aria-label="Marketplace audience">
    <span className="audience-pulse-live"><i/><strong key={live}>{live===null?'—':live}</strong> live {online?'now':'here'}</span>
    <span className="audience-pulse-visits" title={visits.trackingBeganAt?`Site visits since ${new Date(visits.trackingBeganAt).toLocaleDateString()}. One visit per browser-tab session.`:'Site-wide tracking must be enabled before a lifetime count is available.'}><ArrowUpRight size={14}/><strong>{visits.status==='ready'&&visits.total!==null?BigInt(visits.total).toLocaleString():'—'}</strong><span className="audience-total-label">total visits in CollabCy{visits.status!=='ready'&&<small>{visits.status==='loading'?'Loading…':'Currently unavailable'}</small>}</span></span>
    <ActivityTicker items={tickerItems}/>
  </div>;
}

export function BrandClicks({count,kind='website'}:{count:number;kind?:'website'|'brand'}){
  return <span className="brand-clicks"><MousePointer2 size={12}/><strong key={count}>{count.toLocaleString()}</strong> {kind} clicks</span>;
}
