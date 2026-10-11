'use client';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {createAttentionBackend} from './backend';
import {createMarketplaceRepository,type MarketplaceRepository} from './repository';
import {createDemoMarketplace} from './demo';
const Context=createContext<{repository:MarketplaceRepository;isDemo:boolean}|null>(null);
export function AttentionProvider({children}:{children:ReactNode}){
 const [session,setSession]=useState(()=>({repository:createMarketplaceRepository(),isDemo:false}));
 useEffect(()=>{
  const mode=new URLSearchParams(window.location.search).get('demo');
  const isDemo=mode==='1'||(mode!=='0'&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname));
  const repository=isDemo?createMarketplaceRepository(createDemoMarketplace()):createMarketplaceRepository(undefined,createAttentionBackend());
  setSession({repository,isDemo});
  void repository.hydrate();
  const unwatch=repository.watchRemote();
  const timer=setInterval(()=>repository.refresh(),30000);
  return()=>{clearInterval(timer);unwatch();};
 },[]);
 return <Context.Provider value={session}>{session.isDemo&&<div role="status" style={{padding:'10px 20px',background:'#fff3cf',color:'#493500',textAlign:'center',fontSize:14}}>Demo mode · 14 sample brands · Bids and listings are simulated, no payment needed. Reload to reset. <a href="?demo=0">Use live data</a></div>}{children}</Context.Provider>;
}
export function useAttention(){const context=useContext(Context);if(!context)throw new Error('Missing marketplace provider');const {repository,isDemo}=context;const state=useSyncExternalStore(repository.subscribe,repository.getSnapshot,repository.getSnapshot);return {state,repository,isDemo};}
