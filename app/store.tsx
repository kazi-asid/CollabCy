'use client';
import React,{createContext,useContext,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {State,Role,Profile,Deal,initialState,blankProfile,demoDeals,samples} from './data';
const KEY='gohighnet-frontend-v2';
type Store={s:State;ready:boolean;update:(fn:(s:State)=>State)=>void;go:(path:string)=>void;startDemo:(role:Role)=>void;notice:(title:string,body:string)=>void;deals:Deal[];setDeals:(fn:(d:Deal[])=>Deal[])=>void;saveProfile:(p:Profile)=>void;reset:()=>void};
const Context=createContext<Store>(null!);
export function StoreProvider({children}:{children:React.ReactNode}){const [s,setS]=useState<State>(initialState),[ready,setReady]=useState(false);const router=useRouter();
useEffect(()=>{try{const raw=localStorage.getItem(KEY);if(raw){const v=JSON.parse(raw);if(v.version===2&&v.profile&&Array.isArray(v.deals)&&Array.isArray(v.campaigns))setS({...initialState(),...v});}}catch{toast.error('Saved preview could not be loaded. Starting a fresh workspace.')}setReady(true)},[]);
useEffect(()=>{if(ready)try{localStorage.setItem(KEY,JSON.stringify(s))}catch{toast.error('Device storage is full. Your current changes may not survive a refresh.')}},[s,ready]);
const update=(fn:(s:State)=>State)=>setS(fn);const go=(path:string)=>{router.push(path);window.scrollTo({top:0,behavior:'instant'})};
const startDemo=(role:Role)=>{setS(prev=>{const p:Profile=prev.profiles[role]||{...blankProfile,name:role==='creator'?'Alex Morgan':'Orbit Studio',email:role==='creator'?'alex@example.com':'hello@example.com',bio:role==='creator'?'Exploring useful AI tools and sharing what actually works. Building a community around creativity, technology, and better everyday workflows.':'Thoughtful tools for ambitious teams. We’re building a simpler way to get great work done.',handle:role==='creator'?'@alexcreates':'',website:'https://example.com',niche:'AI & Technology',followers:4800,impressions:24600,rate:75,location:'India',platforms:['X','Instagram']};return {...prev,session:true,role,onboarded:true,profile:p,profiles:{...prev.profiles,[role]:p},deals:prev.deals.length?prev.deals:demoDeals('creator'),brandDeals:prev.brandDeals.length?prev.brandDeals:demoDeals('brand'),campaigns:prev.campaigns.length?prev.campaigns:[{...samples[0],id:'my-orbit',brand:'Orbit Studio',owner:true,status:'active',applications:3}],plan:role==='brand'&&prev.plan==='Free'?'Growth':prev.plan,planUntil:role==='brand'?Date.now()+30*86400000:prev.planUntil,notifications:prev.notifications.length?prev.notifications:[{id:'welcome',title:'Welcome to your preview workspace',body:'Explore sample campaigns, conversations, and collaborations. All activity stays on this device.',date:new Date().toISOString(),read:false}]}});go(`/${role}/dashboard`)};
const notice=(title:string,body:string)=>setS(p=>({...p,notifications:[{id:crypto.randomUUID(),title,body,date:new Date().toISOString(),read:false},...p.notifications]}));
const setDeals=(fn:(d:Deal[])=>Deal[])=>setS(p=>p.role==='creator'?{...p,deals:fn(p.deals)}:{...p,brandDeals:fn(p.brandDeals)});
const saveProfile=(profile:Profile)=>setS(p=>({...p,profile,profiles:{...p.profiles,[p.role]:profile}}));
return <Context.Provider value={{s,ready,update,go,startDemo,notice,deals:s.role==='creator'?s.deals:s.brandDeals,setDeals,saveProfile,reset:()=>{setS(initialState());localStorage.removeItem(KEY);go('/')}}}>{children}</Context.Provider>}
export const useStore=()=>useContext(Context);
