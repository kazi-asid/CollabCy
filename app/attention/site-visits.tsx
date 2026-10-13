'use client';
import {useEffect,useSyncExternalStore} from 'react';
import {createSiteVisitCounter,initialVisitSnapshot} from './site-visit-counter';

let memoryVisitId:string|undefined;
function visitId(){
  if(memoryVisitId)return memoryVisitId;
  try{
    const key='collabcy-site-visit-id';
    memoryVisitId=sessionStorage.getItem(key)||crypto.randomUUID();
    sessionStorage.setItem(key,memoryVisitId);
  }catch{memoryVisitId=crypto.randomUUID();}
  return memoryVisitId;
}
const counter=createSiteVisitCounter({visitId,request:async(method,id)=>{
  const response=await fetch('/api/site-visits',{method,headers:method==='POST'?{'Content-Type':'application/json'}:undefined,body:method==='POST'?JSON.stringify({visitId:id}):undefined,cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Site visits unavailable');
  return response.json();
}});
const readOnlyLocalMode=import.meta.env.NEXT_PUBLIC_COLLABCY_LOCAL_READ_ONLY_MODE==='true';

export function SiteVisitTracker(){
  useEffect(()=>{
    if(readOnlyLocalMode)return;
    const refresh=()=>{if(document.visibilityState==='visible')void counter.refresh();};
    refresh();const timer=setInterval(refresh,30000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  return null;
}
export function useSiteVisits(){return useSyncExternalStore(counter.subscribe,counter.getSnapshot,()=>initialVisitSnapshot);}
