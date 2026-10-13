'use client';
import {useAttention} from './store';
import {safeWebsite,type Product} from './model';
import {readOnlyLocalMode} from '../../lib/supabase';

export function useWebsiteVisit(){
  const {repository}=useAttention();
  return (product:Product)=>{
    const href=safeWebsite(product.websiteUrl);
    if(!href)return;
    if(!readOnlyLocalMode)void Promise.resolve(repository.simulateVisit(product.id)).catch(error=>console.error('[attention] Could not record website click',error));
    window.open(href,'_blank','noopener,noreferrer');
  };
}
