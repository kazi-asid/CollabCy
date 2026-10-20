'use client';
import React,{useEffect} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {ArrowRight} from 'lucide-react';
import {Toaster} from 'sonner';
import {StoreProvider,useStore} from './store';
import {Logo,Button,Empty} from './ui/shared';
import {AttentionProvider} from './attention/store';
import {AttentionMarketplace,AttentionProduct,SpotlightAbout} from './attention/pages';
import {BrandProducts} from './attention/listing';
import {SpotlightFAQ} from './attention/faq';
import {PublicHeader,PublicFooter} from './ui/public';
import {Help,Legal,DataDeletion} from './ui/legal';
import {CreatorDashboard,CreatorDirectory,CreatorProfile,CreatorSignIn,LaunchDetail,LaunchEventHub} from './launch-creator-pages';

function AppRouter(){
  const {ready,go}=useStore();
  const path=usePathname();
  const router=useRouter();
  useEffect(()=>{
    if(path==='/login'||path==='/signup'||path==='/login/5221'||path==='/signup/5221'){router.replace('/creator/sign-in');return}
    if(path==='/discover'){router.replace('/');return}
  },[path,router]);
  if(!ready)return <div className="app-loading"><Logo/><span className="loader"/><p>Making room for your next big thing.</p></div>;
  if(path==='/login'||path==='/signup'||path==='/login/5221'||path==='/signup/5221'||path==='/discover')return <div className="app-loading"><Logo/><span className="loader"/><p>Making room for your next big thing.</p></div>;
  if(path==='/')return <AttentionMarketplace/>;
  if(path==='/listings')return <AttentionMarketplace view="listings"/>;
  if(path==='/about')return <SpotlightAbout/>;
  if(path==='/faq')return <SpotlightFAQ/>;
  if(path==='/launches')return <LaunchEventHub/>;
  if(path==='/launches/new')return <LaunchEventHub initialMode="create"/>;
  if(path.startsWith('/launch/manage/'))return <LaunchDetail manage slug={path.split('/')[3]||''}/>;
  if(path.startsWith('/launch/'))return <LaunchDetail slug={path.split('/')[2]||''}/>;
  if(path==='/creators')return <CreatorDirectory/>;
  if(path==='/creator/sign-in')return <CreatorSignIn/>;
  if(path==='/creator/dashboard')return <CreatorDashboard/>;
  if(path.startsWith('/creators/'))return <CreatorProfile handle={path.split('/')[2]||''}/>;
  if(path.startsWith('/discover/product/'))return <AttentionProduct key={path} slug={path.split('/')[3]}/>;
  if(path==='/help')return <Help/>;
  if(path==='/privacy'||path==='/terms')return <Legal kind={path.slice(1) as 'privacy'|'terms'}/>;
  if(path==='/data-deletion')return <DataDeletion/>;
  if(path==='/brand/products/new')return <><PublicHeader/><main className="public-container attention-detail"><BrandProducts creating/></main><PublicFooter/></>;
  return <div className="not-found"><Logo/><Empty title="This path hasn’t found its people yet." description="Let’s get you back to somewhere familiar."><Button onClick={()=>go('/')}>Back to home <ArrowRight size={16}/></Button></Empty></div>;
}

export default function Marketplace(){
  return <StoreProvider><AttentionProvider><AppRouter/><Toaster position="bottom-right" richColors closeButton/></AttentionProvider></StoreProvider>;
}
