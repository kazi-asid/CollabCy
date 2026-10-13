'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import Link from './app-link';
import {ArrowUpRight,Menu,Plus,Search} from 'lucide-react';
import {Logo,Instagram,Facebook} from './shared';

export function PublicHeader(){
 const [open,setOpen]=useState(false);
 const headerRef=useRef<HTMLElement>(null);
 const path=usePathname();
 const discover=path==='/'||path==='/discover'||path.startsWith('/discover/');
 const marketplaceHome=path==='/'||path==='/discover'||path==='/listings';
 const listings=path==='/listings';
 const about=path==='/about';
 const faqPage=path==='/faq';
 useEffect(()=>{
  let frame=0;
  const syncScroll=()=>{
   frame=0;
   const progress=Math.min(1,Math.max(0,window.scrollY/140));
   headerRef.current?.style.setProperty('--nav-scroll',String(progress));
  };
  const onScroll=()=>{if(!frame)frame=window.requestAnimationFrame(syncScroll);};
  syncScroll();
  window.addEventListener('scroll',onScroll,{passive:true});
  return()=>{window.removeEventListener('scroll',onScroll);window.cancelAnimationFrame(frame);};
 },[]);
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);document.getElementById('public-menu-toggle')?.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[open]);
 return <header ref={headerRef} className={`public-header floating-header${open?' menu-is-open':''}`}><div className="public-container nav-row"><Logo/><nav id="public-navigation" className={open?'open':''} aria-label="Main navigation">
  <Link onClick={()=>setOpen(false)} href="/" className={discover?'nav-active':undefined} aria-current={discover?'page':undefined}>Discover</Link>
  <Link onClick={()=>setOpen(false)} href="/listings" className={listings?'nav-active':undefined} aria-current={listings?'page':undefined}>Listings</Link>
  <Link onClick={()=>setOpen(false)} href="/about" className={about?'nav-active':undefined} aria-current={about?'page':undefined}>About</Link>
  <Link onClick={()=>setOpen(false)} href="/faq" className={faqPage?'nav-active':undefined} aria-current={faqPage?'page':undefined}>FAQ</Link>
 </nav><div className="nav-actions"><a className="nav-search" href={marketplaceHome?'#products':'/#products'} aria-label="Search products" onClick={event=>{if(!marketplaceHome)return;event.preventDefault();document.getElementById('products')?.scrollIntoView({behavior:'smooth',block:'start'});(document.querySelector('#market-search input') as HTMLInputElement|null)?.focus();}}><Search size={18}/></a><Link onClick={()=>setOpen(false)} href="/brand/products/new" className="btn navbar-cta"><span>Get Started</span><ArrowUpRight size={17}/></Link><button id="public-menu-toggle" className="mobile-menu" aria-label={open?'Close navigation':'Open navigation'} aria-controls="public-navigation" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<Plus style={{transform:'rotate(45deg)'}}/>:<Menu/>}</button></div></div></header>;
}
export function PublicFooter(){return <footer className="public-footer"><div className="public-container"><div className="footer-invitation"><div><span>YOUR NEXT DISCOVERY STARTS HERE</span><h2>Small brands. <em>Big possibilities.</em></h2></div><Link href="/listings" className="footer-explore">Explore the board <ArrowUpRight size={18}/></Link></div><div className="footer-top"><div><Logo/><p>Good brands. Great products.<br/>A spotlight you can earn.</p></div><div><h4>Platform</h4>
  <Link href="/">Discover</Link><Link href="/listings">Listings</Link><Link href="/about">About</Link><Link href="/faq">FAQ</Link></div><div><h4>Resources</h4><Link href="/#marketplace-how">How it works</Link><Link href="/help">Help center</Link><Link href="/help#trust">Trust & safety</Link></div><div><h4>Stay in the loop</h4><p>Built for independent brands<br/>that deserve to be seen.</p><div className="social-labels"><span>𝕏</span><Instagram size={18}/><Facebook size={18}/></div></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} CollabCy. All rights reserved.</span><span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/data-deletion">Data Deletion</Link></span></div></div></footer>}
