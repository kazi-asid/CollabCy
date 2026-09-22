'use client';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {createAttentionBackend} from './backend';
import {createMarketplaceRepository,type MarketplaceRepository} from './repository';
const Context=createContext<MarketplaceRepository|null>(null);
export function AttentionProvider({children}:{children:ReactNode}){const [repository]=useState(()=>createMarketplaceRepository(undefined,createAttentionBackend()));useEffect(()=>{void repository.hydrate();const unwatch=repository.watchRemote();const timer=setInterval(()=>repository.refresh(),30000);return()=>{clearInterval(timer);unwatch();};},[repository]);return <Context.Provider value={repository}>{children}</Context.Provider>;}
export function useAttention(){const repository=useContext(Context);if(!repository)throw new Error('Missing marketplace provider');const state=useSyncExternalStore(repository.subscribe,repository.getSnapshot,repository.getSnapshot);return {state,repository};}
