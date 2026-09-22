'use client';
import React,{createContext,useContext,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {State,Role,Profile,Deal,initialState} from './data';
import {clearOAuthIntent,getSupabase,identityFromSupabaseUser,listMyConversations,persistAuthenticatedProfile,persistMarketplace,postAuthPath,readOAuthIntent,resolveAuthenticatedState,subscribeToInbox,subscribeToMyDeals,syncMySocialAccounts} from '@/lib/supabase';
import type {User} from '@supabase/supabase-js';
const KEY='gohighnet-frontend-v2';
type ProviderIdentity={name:string;email:string;avatar?:string};
type UserPrefs={saved:string[];shortlist:string[];notifyEmail:boolean;notifyBrowser:boolean};
type DeviceStore={version:3;userId:string|null;prefs:Record<string,UserPrefs>};
type Store={s:State;ready:boolean;update:(fn:(s:State)=>State)=>void;go:(path:string)=>void;notice:(title:string,body:string)=>void;deals:Deal[];setDeals:(fn:(d:Deal[])=>Deal[])=>void;saveProfile:(p:Profile)=>Promise<boolean>;signInFromProvider:(role:Role,identity:ProviderIdentity,next?:string|null)=>void;signOut:()=>void;reset:()=>void};
const Context=createContext<Store>(null!);
function oauthErrorFromLocation(){
  const params=new URLSearchParams(window.location.search);
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
  return params.get('error_description')||params.get('error')||hash.get('error_description')||hash.get('error');
}
function hasOAuthCallbackParams(){
  const params=new URLSearchParams(window.location.search);
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
  return params.has('code')||params.has('state')||params.has('error')||hash.has('access_token')||hash.has('error');
}
function emptyPrefs():UserPrefs{return {saved:[],shortlist:[],notifyEmail:true,notifyBrowser:false}}
function emptyDeviceStore():DeviceStore{return {version:3,userId:null,prefs:{}}}
function readDeviceStore():DeviceStore{
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw)return emptyDeviceStore();
    const v=JSON.parse(raw);
    if(v?.version===3&&v.prefs&&typeof v.prefs==='object'){
      return {version:3,userId:typeof v.userId==='string'?v.userId:null,prefs:v.prefs};
    }
  }catch{toast.error('Saved preferences could not be loaded.')}
  return emptyDeviceStore();
}
function writeDeviceStore(store:DeviceStore){
  try{localStorage.setItem(KEY,JSON.stringify({version:3,userId:store.userId,prefs:store.prefs}))}catch{toast.error('Device storage is full. Your current changes may not survive a refresh.')}
}
function persistDevicePrefs(s:State){
  const store=readDeviceStore();
  if(!s.session||!s.authUserId){
    writeDeviceStore({version:3,userId:null,prefs:store.prefs});
    return;
  }
  writeDeviceStore({
    version:3,
    userId:s.authUserId,
    prefs:{...store.prefs,[s.authUserId]:{saved:s.saved,shortlist:s.shortlist,notifyEmail:s.notifyEmail,notifyBrowser:s.notifyBrowser}},
  });
}
function stateFromPrefs(userId:string,store:DeviceStore):State{
  const prefs=store.prefs[userId]||emptyPrefs();
  return {...initialState(),authUserId:userId,saved:Array.isArray(prefs.saved)?prefs.saved:[],shortlist:Array.isArray(prefs.shortlist)?prefs.shortlist:[],notifyEmail:prefs.notifyEmail!==false,notifyBrowser:prefs.notifyBrowser===true};
}
export function StoreProvider({children}:{children:React.ReactNode}){const [s,setS]=useState<State>(initialState),[ready,setReady]=useState(false);const router=useRouter();
const stateRef=React.useRef(s);stateRef.current=s;
async function hydrateFromUser(user:User,preferredRole:Role,device=readDeviceStore()){
  const identity=identityFromSupabaseUser(user);
  const next=await resolveAuthenticatedState(stateFromPrefs(user.id,device),preferredRole,identity);
  return {...next,authUserId:user.id,session:true};
}
function clearLocalSession(){
  const store=readDeviceStore();
  writeDeviceStore({version:3,userId:null,prefs:store.prefs});
  setS(initialState());
}
useEffect(()=>{let cancelled=false;(async()=>{
  const oauthError=oauthErrorFromLocation();if(oauthError)toast.error(decodeURIComponent(oauthError.replace(/\+/g,' ')));
  let dest:string|null=null;
  let next=initialState();
  const supabase=getSupabase();
  if(supabase){
    const {data,error}=await supabase.auth.getSession();
    if(error)toast.error(error.message);
    if(!cancelled&&data.session?.user){
      const intent=readOAuthIntent();
      next=await hydrateFromUser(data.session.user,intent?.role||'creator');
      if(intent){dest=postAuthPath(next.role,next.onboarded,intent.next,next.platformVerifier);clearOAuthIntent();}
    }else if(!cancelled){
      const store=readDeviceStore();
      writeDeviceStore({version:3,userId:null,prefs:store.prefs});
      next=initialState();
    }
  }else{
    const store=readDeviceStore();
    writeDeviceStore({version:3,userId:null,prefs:store.prefs});
    next=initialState();
  }
  if(hasOAuthCallbackParams())window.history.replaceState({},'',window.location.pathname);
  if(!cancelled){setS(next);setReady(true);if(dest){router.push(dest);window.scrollTo({top:0,behavior:'instant'});}}
})();return()=>{cancelled=true}},[]);
useEffect(()=>{if(ready)persistDevicePrefs(s)},[ready,s.authUserId,s.session,s.saved,s.shortlist,s.notifyEmail,s.notifyBrowser]);
useEffect(()=>{if(!ready)return;const supabase=getSupabase();if(!supabase)return;const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){clearLocalSession();return}
  if(event!=='SIGNED_IN'||!session?.user)return;
  const current=stateRef.current;
  const intent=readOAuthIntent();
  if(current.session&&current.authUserId===session.user.id&&!intent)return;
  const identity=identityFromSupabaseUser(session.user);
  void (async()=>{
    const next=await hydrateFromUser(session.user,intent?.role||current.role);
    const dest=intent?postAuthPath(next.role,next.onboarded,intent.next,next.platformVerifier):null;
    if(intent)clearOAuthIntent();
    setS(next);
    if(dest)queueMicrotask(()=>{router.push(dest);window.scrollTo({top:0,behavior:'instant'})});
  })();
});return()=>subscription.unsubscribe()},[ready,router]);
useEffect(()=>{if(!ready||!persistMarketplace(s)||!s.authUserId)return;const supabase=getSupabase();if(!supabase)return;let cancelled=false;let unsubscribe=()=>{};void (async()=>{
  const userId=s.authUserId;if(!userId||cancelled)return;
  const stopInbox=subscribeToInbox(userId,{onInsert:notice=>{setS(p=>{if(!persistMarketplace(p)||p.authUserId!==userId||p.notifications.some(n=>n.id===notice.id))return p;return{...p,notifications:[notice,...p.notifications]}});if(notice.type==='new_message')void listMyConversations().then(result=>{if(result.error||result.skipped)return;setS(p=>persistMarketplace(p)&&p.authUserId===userId?{...p,conversations:result.conversations}:p)})},onUpdate:notice=>{setS(p=>persistMarketplace(p)&&p.authUserId===userId?{...p,notifications:p.notifications.map(n=>n.id===notice.id?notice:n)}:p)}});
  const stopDeals=subscribeToMyDeals(userId,deal=>{setS(p=>{if(!persistMarketplace(p)||p.authUserId!==userId)return p;const exists=p.workspaceDeals.some(item=>item.id===deal.id);return{...p,workspaceDeals:exists?p.workspaceDeals.map(item=>item.id===deal.id?deal:item):[deal,...p.workspaceDeals]}})});
  unsubscribe=()=>{stopInbox();stopDeals()};if(cancelled)unsubscribe();
})();return()=>{cancelled=true;unsubscribe()}},[ready,s.remoteWorkspace,s.session,s.authUserId]);
const update=(fn:(s:State)=>State)=>setS(fn);const go=(path:string)=>{router.push(path);window.scrollTo({top:0,behavior:'instant'})};
const signInFromProvider=(role:Role,_identity:ProviderIdentity,next?:string|null)=>{void (async()=>{
  const supabase=getSupabase();
  const {data}=await supabase?.auth.getSession()||{data:{session:null}};
  const user=data.session?.user;
  if(!user){clearLocalSession();go('/login');return}
  const applied=await hydrateFromUser(user,role);
  setS(applied);
  go(postAuthPath(applied.role,applied.onboarded,next,applied.platformVerifier));
})()};
const signOut=()=>{clearLocalSession();void getSupabase()?.auth.signOut();go('/login')};
const notice=(title:string,body:string)=>setS(p=>({...p,notifications:[{id:crypto.randomUUID(),title,body,date:new Date().toISOString(),read:false},...p.notifications]}));
const setDeals=(fn:(d:Deal[])=>Deal[])=>setS(p=>p.role==='creator'?{...p,deals:fn(p.deals)}:{...p,brandDeals:fn(p.brandDeals)});
const saveProfile=async(profile:Profile)=>{const role=s.role;if(!s.session||!s.remoteWorkspace){toast.error('Sign in to save your profile.');return false}const error=await persistAuthenticatedProfile(role,profile);if(error)return false;let socialAccounts=stateRef.current.socialAccounts;if(role==='creator'){const synced=await syncMySocialAccounts(profile);if(synced.error)toast.error(synced.error);else if(!synced.skipped)socialAccounts=synced.accounts}setS(p=>({...p,profile,profiles:{...p.profiles,[role]:profile},socialAccounts}));return true};
const reset=()=>{localStorage.removeItem(KEY);setS(initialState());void getSupabase()?.auth.signOut();go('/')};
return <Context.Provider value={{s,ready,update,go,notice,deals:s.role==='creator'?s.deals:s.brandDeals,setDeals,saveProfile,signInFromProvider,signOut,reset}}>{children}</Context.Provider>}
export const useStore=()=>useContext(Context);
