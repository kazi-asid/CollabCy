'use client';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {createMarketplaceRepository,type MarketplaceRepository} from './repository';
const Context=createContext<MarketplaceRepository|null>(null);
export function AttentionProvider({children}:{children:ReactNode}){const [repository]=useState(()=>createMarketplaceRepository());useEffect(()=>{repository.initialize();const sync=(e:StorageEvent)=>{if(e.key==='gohighnet-attention-v1')repository.initialize();};window.addEventListener('storage',sync);const timer=setInterval(()=>repository.refresh(),30000);return()=>{clearInterval(timer);window.removeEventListener('storage',sync);};},[repository]);return <Context.Provider value={repository}>{children}</Context.Provider>;}
export function useAttention(){const repository=useContext(Context);if(!repository)throw new Error('Missing marketplace provider');const state=useSyncExternalStore(repository.subscribe,repository.getSnapshot,repository.getSnapshot);return {state,repository};}
