'use client';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from '../ui/app-link';
import {ArrowUpRight,ArrowRight,ArrowLeft,Check,Trophy,Layers,TrendingUp,Users,ChevronRight,Search,Heart,BarChart3,Crown,Sparkles,Globe as GlobeIcon,ShieldCheck as ShieldIcon} from 'lucide-react';
import {PublicHeader,PublicFooter} from '../ui/public';
import {Button,SearchBox,Empty,DemoNote,Modal} from '../ui/shared';
import {BrandProducts} from './listing';
import {AudiencePulse,BrandClicks} from './audience';
import {BrandLink} from './brand-link';
import {useWebsiteVisit} from './website-visit';
import {ShareListing} from './share';
import {marketplacePlacement} from './presentation';
import {useStore} from '../store';
import {money} from '../data';
import {useAttention} from './store';
import {attentionCategories,getRankedProducts,getFilteredProducts,isActive,timeAgo,websiteHost,MIN_INITIAL_BID,type MarketplaceFilters,type Product} from './model';
import {ProductLogo,LiveBadge,ActivityList,BidDialog,ProductMetrics} from './components';

export function usePromote(){
  const {go}=useStore();
  return ()=>{go('/brand/products/new');};
}

export function AttentionMarketplace({view='discover'}:{view?:'discover'|'listings'}){
  const {state,repository}=useAttention();
  const params=useSearchParams();
  const paidReturn=params.get('paid')==='1';
  const promote=usePromote();
  const [filters,setFilters]=useState<MarketplaceFilters>({query:'',category:'All',time:'all'});
  const [pagination,setPagination]=useState({key:'',page:1});
  const leaderboardHeading=useRef<HTMLHeadingElement>(null);
  const openWebsite=useWebsiteVisit();
  const [bid,setBid]=useState<string|null>(null);
  const [allActivity,setAllActivity]=useState(false);
  const [spotlight,setSpotlight]=useState(false);
  useEffect(()=>{if(paidReturn)repository.refresh();},[paidReturn,repository]);
  const ranked=getRankedProducts(state.products);
  const filtered=getFilteredProducts(state.products,filters);
  const setCategory=(category:string)=>setFilters(v=>({...v,category}));
  const loading=repository.getStatus()==='loading';
  const leader=ranked[0];
  const regular=filtered.filter(product=>product.id!==leader?.id);
  const filterKey=JSON.stringify(filters);
  const pageCount=Math.max(1,Math.ceil(regular.length/5));
  const page=Math.min(pagination.key===filterKey?pagination.page:1,pageCount);
  const visibleProducts=regular.slice((page-1)*5,page*5);
  function changePage(next:number){
    setPagination({key:filterKey,page:Math.max(1,Math.min(next,pageCount))});
    leaderboardHeading.current?.focus({preventScroll:true});
    leaderboardHeading.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  return <>
    <PublicHeader/>
    <main className={`attention-page attention-editorial spotlight-page ${view==='listings'?'spotlight-listings':''}`}><div className="audience-dock public-container"><AudiencePulse/></div>
      {paidReturn&&<div className="attention-success public-container" role="status"><h3>Checkout complete. Your spotlight is confirming.</h3><p>Returning from Dodo does not publish the listing or apply the bid by itself. Rankings update after payment is confirmed.</p></div>}
      {view==='listings'&&<div className="listing-scene" aria-hidden="true"><div className="listing-glow glow-pink"/><div className="listing-glow glow-gold"/><Crown className="listing-sky-crown" strokeWidth={1}/><div className="listing-royal-seal"><Crown size={90} strokeWidth={1}/><span>GOOD IDEAS<br/>DESERVE A SPOTLIGHT</span><Sparkles size={30}/></div>{[0,1,2,3,4,5].map(i=><span key={i} className={`listing-confetti confetti-${i}`}>{i%2?<Sparkles size={22} strokeWidth={1}/>:<i/>}</span>)}</div>}
      {view==='discover'&&<section className="attention-hero brands-hero-scene">
        <div className="brands-ambient" aria-hidden="true"><span className="brands-ambient-glow"/><Crown className="brands-ambient-crown" strokeWidth={1}/><Sparkles className="brands-ambient-star"/><i/><i/></div>
        <div className="public-container">
          <div className="attention-hero-grid">
            <div className="editorial-hero-copy">
              <div className="attention-eyebrow"><LiveBadge/><span>BRANDS ARE COMPETING FOR ATTENTION</span></div>
              <section className="mobile-claim-strip" aria-label="Claim the number one spot"><span className="mobile-claim-rank" aria-hidden="true">#1</span><div className="mobile-claim-copy"><small>{leader?'Claim the top spot':'Start the leaderboard'}</small><strong>{money(leader?leader.currentBid+1:MIN_INITIAL_BID)}<span> to lead</span></strong></div><Button onClick={()=>leader?setBid(leader.id):promote()}>{leader?'Place bid':'List product'}<ArrowUpRight size={14}/></Button></section>
              <h1>Make your brand<span>standout</span></h1>
              <p>Big ideas deserve to be seen. Meet remarkable products, discover your next favorite, and put your brand in the spotlight.</p>
              <div className="hero-actions">
                <button className="btn btn-primary spotlight-button" type="button" onClick={()=>setSpotlight(true)}><span>Spotlight your brand</span><ArrowRight size={17}/></button>
                <Link className="btn btn-secondary" href="/listings">View all listings <ArrowRight size={16}/></Link>
              </div>
              <div className="attention-trust">
                <span><Search size={15}/>Product discovery</span>
                <span><BarChart3 size={15}/>Listings from ${MIN_INITIAL_BID}</span>
                <span><Heart size={15}/>Find your next favorite</span>
              </div>
            </div>
            <HeroStage products={ranked.slice(0,4)} loading={loading} onBid={setBid}/>
          </div>
        </div>
      </section>}
      <section className="public-container attention-market" id="products" aria-label="Product marketplace">
        <div className="attention-market-grid">
          <div className="attention-board">
            <div className="attention-board-head compact-board-head">
              {view==='listings'?<h1>All listings<span className="editorial-period">.</span></h1>:<h2>Who’s in the spotlight<span className="editorial-period">.</span></h2>}
              <div className="attention-time" data-period={filters.time} role="group" aria-label="Activity period"><span className="time-slide-indicator" aria-hidden="true"/>
                <button type="button" aria-pressed={filters.time==='all'} onClick={()=>setFilters(v=>({...v,time:'all'}))}>All time</button>
                <button type="button" aria-label="Last 24 hours" aria-pressed={filters.time==='24h'} onClick={()=>setFilters(v=>({...v,time:'24h'}))}>24h</button>
              </div>
            </div>
            <div className="attention-toolbar">
              <div className="attention-controls board-search-controls">
                <div id="market-search"><SearchBox placeholder="Search products, brands, or categories…" value={filters.query} onChange={query=>setFilters(v=>({...v,query}))}/></div>
              </div>
              <CategoryChips value={filters.category} onChange={setCategory}/>
            </div>
            {view==='listings'&&leader&&filtered.some(product=>product.id===leader.id)&&<CrownJewel product={leader} loading={loading} onBid={setBid}/>}
            {filtered.length
              ? <><div className="regular-board-heading"><h3 ref={leaderboardHeading} tabIndex={-1} style={{scrollMarginTop:100}}>Regular leaderboard</h3><span>Ranked independently of the Crown Jewel</span></div><div className={view==='listings'?'listing-directory':'attention-products'} role="list" aria-label="Regular leaderboard">
                  {visibleProducts.map(product=>{
                    const rank=marketplacePlacement(ranked,product.id).position;
                    return view==='listings'?<ListingRow key={product.id} product={product} rank={rank} onVisit={()=>openWebsite(product)} onBid={()=>setBid(product.id)}/>:<LeaderboardRow key={product.id} product={product} rank={rank} onVisit={()=>openWebsite(product)} onBid={()=>setBid(product.id)}/>;
                  })}
                </div>{pageCount>1&&<nav className="leaderboard-pagination" aria-label="Leaderboard pages">
                  <button type="button" className="leaderboard-page-button page-previous" disabled={page===1} onClick={()=>changePage(page-1)}><span className="page-button-icon"><ArrowLeft size={17}/></span><span>Previous</span></button>
                  <div className="leaderboard-page-info" role="status" aria-live="polite" aria-atomic="true"><div className="leaderboard-page-count"><span>PAGE</span><strong key={page}>{String(page).padStart(2,'0')}</strong><span>/ {String(pageCount).padStart(2,'0')}</span></div><span className="leaderboard-page-range">{(page-1)*5+1}–{Math.min(page*5,regular.length)} of {regular.length} brands</span><span className="leaderboard-page-track" aria-hidden="true"><i style={{width:`${100/pageCount}%`,transform:`translateX(${(page-1)*100}%)`}}/></span></div>
                  <button type="button" className="leaderboard-page-button page-next" disabled={page===pageCount} onClick={()=>changePage(page+1)}><span>Next</span><span className="page-button-icon"><ArrowRight size={17}/></span></button>
                </nav>}{!regular.length&&<p className="regular-board-note">No regular listings match this view. The featured Crown Jewel has its own place above.</p>}</>
              : loading
                ? view==='listings'?<div className="listing-loading" role="status" aria-label="Loading listings">{[0,1,2].map(i=><div className="listing-skeleton" key={i}><span/><div><b/><i/></div><em/></div>)}</div>:null
                : !ranked.length
                  ? view==='listings'?<ListingsEmpty onList={()=>setSpotlight(true)}/>:<BoardEmpty onList={promote}/>
                  : <div className="attention-filter-empty">
                      <span><Search size={18}/></span>
                      <div><strong>No matching products.</strong><p>Try another search or category.</p></div>
                      <Button variant="secondary" onClick={()=>setFilters({query:'',category:'All',time:'all'})}>Clear filters</Button>
                    </div>}
          </div>
          <aside className="attention-sidebar">
            <ClaimSpot leader={leader} onBid={()=>leader&&setBid(leader.id)} onList={promote}/>
            <section className="attention-side-card activity-card">
              <div className="attention-side-title">
                <h2><i/>Live activity</h2>
                <button onClick={()=>setAllActivity(v=>!v)}>{allActivity?'Show less':'View all'}</button>
              </div>
              <ActivityList events={state.activity} limit={allActivity?state.activity.length:5}/>
            </section>
          </aside>
        </div>
      </section>
      <section className="public-container attention-how" id="marketplace-how">
        <div className="center-heading">
          <span className="editorial-kicker">02 / FROM LISTED TO DISCOVERED</span>
          <h2>How the Attention Marketplace works</h2>
          <p>A simple and transparent way to get discovered.</p>
        </div>
        <div className="attention-steps">
          {[
            {icon:Layers,title:'List your product',text:'Introduce your product and pay the initial spotlight bid you choose. That bid determines your starting rank.'},
            {icon:TrendingUp,title:'Add to your bid',text:'Increase your position by paying only the add-on through Dodo Payments checkout. The bid is applied after payment is confirmed.'},
            {icon:Users,title:'Move up the ranking',text:'Climb as your cumulative bid grows.'},
            {icon:Trophy,title:'Get discovered',text:'Creators explore and find your product.'},
          ].map(({icon:Icon,title,text},index)=><div key={title}><span>{String(index+1).padStart(2,'0')}</span><Icon/><h3>{title}</h3><p>{text}</p></div>)}
        </div>
      </section>
      <section className="public-container">
        <div className="attention-cta">
          <div><span>READY TO GET DISCOVERED?</span><h2>List your product today.</h2><p>Join the Attention Marketplace and get in front of creators.</p></div>
          <Button variant="secondary" onClick={promote}>List your product <ArrowUpRight size={18}/></Button>
        </div>
      </section>

    </main>
    <PublicFooter/>
    <Modal open={spotlight} onClose={()=>setSpotlight(false)} title="Your next moment in the spotlight" description="Introduce your brand, choose your initial bid, and claim your spotlight." wide><div className="spotlight-form"><BrandProducts creating onCancel={()=>setSpotlight(false)}/></div></Modal>

    <BidDialog productId={bid} onClose={()=>setBid(null)}/>
  </>;
}

function CategoryChips({value,onChange}:{value:string;onChange:(category:string)=>void}){
  const scroller=useRef<HTMLDivElement>(null);
  const [overflows,setOverflows]=useState(false);
  const [canScrollMore,setCanScrollMore]=useState(false);
  useEffect(()=>{
    const el=scroller.current;
    if(!el)return;
    const update=()=>{
      const extra=el.scrollWidth-el.clientWidth;
      setOverflows(extra>4);
      const last=el.querySelector('button:last-of-type');
      if(!last){setCanScrollMore(false);return;}
      const edge=el.getBoundingClientRect().right-36;
      setCanScrollMore(last.getBoundingClientRect().right>edge+1);
    };
    update();
    el.addEventListener('scroll',update,{passive:true});
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);
    observer?.observe(el);
    window.addEventListener('resize',update);
    return()=>{
      el.removeEventListener('scroll',update);
      observer?.disconnect();
      window.removeEventListener('resize',update);
    };
  },[]);
  const scrollRight=()=>{
    const el=scroller.current;
    if(!el)return;
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({left:Math.max(Math.round(el.clientWidth*.62),180),behavior:reduce?'auto':'smooth'});
  };
  return <div className={`attention-chip-strip${overflows?' is-overflowing':''}${canScrollMore?' has-more':''}`}>
    <div ref={scroller} className="attention-chips" role="group" aria-label="Product categories">
      {['All',...attentionCategories].map(category=><button type="button" key={category} aria-pressed={value===category} onClick={()=>onChange(category)}>{category}</button>)}
    </div>
    <button type="button" className="attention-chip-next" aria-label="Scroll categories right" disabled={!canScrollMore} tabIndex={overflows?0:-1} onClick={scrollRight}><ArrowRight size={16} aria-hidden="true"/></button>
  </div>;
}

function Breadcrumb({name}:{name?:string}){
  return <nav className="attention-breadcrumb" aria-label="Breadcrumb">
    <Link href="/">Home</Link>
    <ChevronRight size={13}/>
    {name?<><Link href="/">Discover</Link><ChevronRight size={13}/><span aria-current="page">{name}</span></>:<span aria-current="page">Discover</span>}
  </nav>;
}

function HeroStage({products,loading,onBid}:{products:Product[];loading:boolean;onBid:(id:string)=>void}){
  return <div className="spotlight-stage" aria-label="Top ranked products">
    <div className="spotlight-orbit orbit-one"/><div className="spotlight-orbit orbit-two"/>
    <span className="spotlight-star star-one"><Sparkles/></span><span className="spotlight-star star-two"><Sparkles size={16}/></span>
    <CrownJewel product={products[0]} loading={loading} onBid={onBid}/>
    <div className="spotlight-stage-label"><span/> REGULAR LEADERBOARD · TOP THREE</div>
    {[0,1,2].map(index=>{const product=products[index+1];const rank=index+1;return <div key={product?.id||index} className={`royal-brand royal-brand-${index+1}`}>{product&&<BrandLink brandId={product.id} className="brand-card-link" href={`/discover/product/${product.slug}`} aria-label={`Open regular leaderboard #${rank} ${product.name}`}/>}

      <span className="royal-position">#{rank}</span>
      {product?<ProductLogo product={product}/>:<span className="royal-placeholder"><Crown size={22}/></span>}
      <div className="royal-brand-copy"><small>{index===0?'FIRST IN LINE':index===1?'ON THE RISE':'ONE TO WATCH'}</small><strong>{product?.name||(loading?'Finding the leaders…':'Your brand could be here')}</strong><span>{product?`${product.brandName} · ${money(product.currentBid)} current bid`:'A little ambition. A lot of possibility.'}</span>{product&&<BrandPageClicks product={product}/>}</div>
      {product&&<div className="royal-brand-actions"><ShareListing product={product}/><BrandLink brandId={product.id} href={`/discover/product/${product.slug}`} aria-label={`Explore ${product.name}`}><ArrowUpRight size={18}/></BrandLink></div>}
    </div>})}
    <div className="royal-stage-foot"><TrendingUp size={14}/>Ranked live. Built to be discovered.</div>
  </div>;
}

export function CrownJewel({product,loading,onBid}:{product?:Product;loading:boolean;onBid:(id:string)=>void}){
  const openWebsite=useWebsiteVisit();
  return <section className="crown-jewel" aria-label="Crown Jewel featured category"><div className="crown-jewel-inner">
    {product&&<BrandLink brandId={product.id} className="brand-card-link" href={`/discover/product/${product.slug}`} aria-label={`Open Crown Jewel #1 ${product.name}`}/>}
    <span className="crown-product-identity">{product?<ProductLogo product={product}/>:<span className="crown-jewel-icon"><Sparkles size={24}/></span>}<span className="crown-decoration" aria-hidden="true"><Crown size={16}/></span></span>
    <div><small>THE CROWN JEWEL · #1</small><strong>{product?<BrandLink brandId={product.id} href={`/discover/product/${product.slug}`}>{product.name}</BrandLink>:(loading?'Finding the standout…':'A place for something extraordinary.')}</strong><p>{product?`${product.brandName} · ${money(product.currentBid)} leading bid`:'The brightest brand earns the crown.'}</p>{product&&<BrandPageClicks product={product}/>}</div>
    {product&&<div className="crown-actions"><Button id={`bid-${product.id}`} onClick={()=>onBid(product.id)} aria-label={`Place a bid for ${product.name}`}>Bid <TrendingUp size={13}/></Button><button type="button" id={`visit-${product.id}`} onClick={()=>openWebsite(product)} aria-label={`Visit ${product.name}`}>Visit <ArrowUpRight size={13}/></button><ShareListing product={product}/></div>}</div></section>;
}

export function SpotlightAbout(){
  const promote=usePromote();
  return <><PublicHeader/><main className="attention-editorial spotlight-page spotlight-about"><section className="public-container about-intro"><span className="editorial-kicker">A LITTLE ABOUT COLLABCY</span><h1>Great brands.<br/><span>Brighter possibilities.</span></h1><p>We believe the next great thing deserves a chance to be discovered. CollabCy brings independent brands, curious people, and ambitious creators together in one shared spotlight.</p><Link href="/listings" className="btn btn-primary spotlight-button">Find your next favorite <ArrowUpRight size={18}/></Link><div className="about-values"><article><GlobeIcon/><span>01 / DISCOVER</span><h2>Ideas worth your attention.</h2><p>Explore products across AI, design, developer tools, and beyond. Get to know the people and brands behind them.</p></article><article><Crown/><span>02 / STAND OUT</span><h2>A spotlight you can earn.</h2><p>Active products are ranked by their current bids. Higher bids move up; equal bids keep the earlier position.</p></article><article><Heart/><span>03 / CONNECT</span><h2>Your next favorite starts here.</h2><p>Visit a brand, explore its product, and discover something that fits the way you work and create.</p></article></div></section><section className="public-container about-process"><span className="editorial-kicker">YOUR BRAND’S NEXT CHAPTER</span><h2>From an idea to the spotlight.</h2><div className="about-process-steps"><p><b>01</b><strong>Introduce your brand</strong><span>Add your product name, description, website, and category.</span></p><p><b>02</b><strong>Choose your placement</strong><span>Review your initial bid and projected position.</span></p><p><b>03</b><strong>Claim your spotlight</strong><span>Pay your initial bid through Dodo. The listing goes live after payment is confirmed.</span></p></div><div className="about-payment-note"><ShieldIcon/><p>There is no separate listing fee. Your initial spotlight bid is paid through Dodo Payments and goes live after payment confirmation. Listings stay active until they are removed.</p></div><Button className="spotlight-button" onClick={promote}>Spotlight your brand <ArrowRight size={17}/></Button></section></main><PublicFooter/></>;
}

function ClaimSpot({leader,onBid,onList}:{leader:Product|undefined;onBid:()=>void;onList:()=>void}){
  const claim=leader?leader.currentBid+1:null;
  return <section className="claim-card">
    <div className="claim-card-top">
      <span className="claim-crown"><Crown size={18}/></span>
      {leader?<span className="claim-new">New</span>:null}
    </div>
    <h2>Claim the #1 spot</h2>
    {leader&&claim!=null
      ? <>
          <p>Currently, the #1 product has a bid of {money(leader.currentBid)}.</p>
          <strong>Bid {money(claim)} to claim the #1 spot.</strong>
          <Button onClick={onBid}>Place your bid <ArrowRight size={16}/></Button>
          <ul>
            <li><Check size={15}/> Get the #1 position on the leaderboard</li>
            <li><Check size={15}/> Increase your visibility anytime</li>
            <li><Check size={15}/> Pay only the difference</li>
          </ul>
        </>
      : <>
          <p>Be the first product to compete for attention.</p>
          <Button onClick={onList}>List your product <ArrowRight size={16}/></Button>
        </>}
  </section>;
}

function BoardEmpty({onList}:{onList:()=>void}){
  return <div className="attention-board-empty">
    <div className="board-empty-box" aria-hidden="true">
      <span className="box-spark spark-a"><Sparkles size={14}/></span>
      <span className="box-spark spark-b"><Sparkles size={10}/></span>
      <div className="open-box"><b/><i/><em/></div>
    </div>
    <h3>No products listed yet</h3>
    <p>Be the first to list your product and start competing for attention from thousands of creators.</p>
    <Button onClick={onList}>List your product first <ArrowRight size={16}/></Button>
  </div>;
}

function ListingsEmpty({onList}:{onList:()=>void}){
  return <div className="listing-empty"><span className="listing-empty-crown"><Crown size={34} strokeWidth={1.4}/><Sparkles size={16}/></span><span className="listing-empty-eyebrow">THE NEXT GREAT THING COULD BE YOURS</span><h2>A little spotlight.<br/>A world of possibility.</h2><p>The board is ready for its first brand. Introduce what you’re building and claim your place from ${MIN_INITIAL_BID}.</p><Button className="spotlight-button" onClick={onList}><span>Spotlight your brand</span><ArrowUpRight size={17}/></Button><small>Stay listed · Listings from ${MIN_INITIAL_BID}</small></div>;
}

export function ListingRow({product,rank,onVisit,onBid}:{product:Product;rank:number;onVisit:()=>void;onBid:()=>void}){
  return <article className={`listing-row listing-position-${rank}${rank===1?' listing-row-leader':''}`} role="listitem" style={{animationDelay:`${Math.min(rank-1,8)*55}ms`}}>
    <BrandLink brandId={product.id} className="brand-card-link" href={`/discover/product/${product.slug}`} aria-label={`Open ${product.name} details`}/><span className="listing-rank" aria-label={`Regular leaderboard rank ${rank}`}>#{rank}</span>
    <BrandLink brandId={product.id} className="listing-logo-link" href={`/discover/product/${product.slug}`} aria-label={`View ${product.name}`}><ProductLogo product={product}/></BrandLink>
    <div className="listing-story"><div className="listing-story-title"><BrandLink brandId={product.id} href={`/discover/product/${product.slug}`}>{product.name}</BrandLink>{rank===1&&<span className="listing-leader-badge"><Sparkles size={10}/> IN THE SPOTLIGHT</span>}<span className="listing-category">{product.category}</span></div><p>{product.description}</p><span className="listing-host">{websiteHost(product.websiteUrl)}</span><BrandPageClicks product={product}/></div>
    <div className="listing-row-details"><button className="listing-bid" type="button" onClick={onBid} aria-label={`Raise bid for ${product.name}, current bid ${money(product.currentBid)}`} title="Raise this product’s bid">{money(product.currentBid)}<TrendingUp size={13}/></button><div className="listing-stats"><span>{timeAgo(product.listingStartsAt)}</span></div><div className="listing-row-social"><ShareListing product={product}/><button className="listing-visit" type="button" onClick={onVisit} aria-label={`Visit ${product.name}`}>Visit <ArrowUpRight size={13}/></button></div></div>
  </article>;
}

function BrandPageClicks({product}:{product:Product}){
  return <BrandClicks count={product.clickCount} kind="website"/>;
}

export function LeaderboardRow({product,rank,onVisit,onBid}:{product:Product;rank:number;onVisit:()=>void;onBid:()=>void}){
  const row=useRef<HTMLElement>(null);
  const previous=useRef<{rank:number;top:number}|null>(null);
  useLayoutEffect(()=>{
    const element=row.current;
    if(!element)return;
    const top=element.offsetTop;
    const before=previous.current;
    previous.current={rank,top};
    if(before&&before.rank!==rank&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      const animation=element.animate([{translate:`0 ${before.top-top}px`},{translate:'0 0'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
      return()=>animation.cancel();
    }
  },[rank]);
  return <article ref={row} className={`attention-product brand-glass-card refined-brand-card ${rank===1?'is-leader':''}`} role="listitem">
    <BrandLink brandId={product.id} className="brand-card-link" href={`/discover/product/${product.slug}`} aria-label={`Open ${product.name} details`}/>
    <span className={`product-rank rank-${rank}`} aria-label={`Regular leaderboard rank ${rank}`}><span key={rank} className="rank-value"><small>#</small>{rank}</span></span><ProductLogo product={product}/>
    <div className="product-story"><div className="product-story-top"><BrandLink brandId={product.id} href={`/discover/product/${product.slug}`}>{product.name}</BrandLink><span>{product.category}</span></div><span className="refined-brand-domain">{websiteHost(product.websiteUrl)}</span><p>{product.description}</p><div className="refined-brand-meta"><BrandPageClicks product={product}/><span className="refined-last-bid">Last bid · {timeAgo(product.bids[0]?.createdAt||product.listingStartsAt)}</span></div></div>
    <div className="brand-card-side"><div className="product-list-stat bid-stat"><strong key={product.currentBid}>{money(product.currentBid)}</strong><small>Total bid</small></div><div className="brand-card-actions"><Button className="bid-cta" id={`bid-${product.id}`} onClick={onBid} aria-label={`Increase bid for ${product.name}`}>Increase bid <TrendingUp size={13}/></Button><button className="product-visit" type="button" id={`visit-${product.id}`} onClick={onVisit} aria-label={`Visit ${product.name}`}>Visit <ArrowUpRight size={13}/></button><ShareListing product={product}/></div></div>
  </article>;
}
export function AttentionProduct({slug}:{slug:string}){
  const {state,repository}=useAttention();
  const params=useSearchParams();
  const p=state.products.find(product=>product.slug===slug);
  const openWebsite=useWebsiteVisit();
  const [bid,setBid]=useState<string|null>(null);
  const paidReturn=params.get('paid')==='1';
  const bidParam=params.get('bid');
  const intendedBid=Number(bidParam);
  const initialIncrement=Number.isInteger(intendedBid)&&intendedBid>=MIN_INITIAL_BID?intendedBid:undefined;
  useEffect(()=>{
    if(paidReturn) repository.refresh();
  },[paidReturn,repository]);
  useEffect(()=>{
    if(!p||paidReturn||bidParam==null||bidParam==='')return;
    setBid(p.id);
  },[p?.id,paidReturn,bidParam]);
  if(!p)return repository.getStatus()==='loading'
    ? <><PublicHeader/><main className="public-container attention-detail"/><PublicFooter/></>
    : <><PublicHeader/><main className="public-container attention-detail"><Empty title="This product hasn’t arrived yet." description="Explore the marketplace to find something new."><Link href="/" className="btn btn-primary">Explore products</Link></Empty></main><PublicFooter/></>;
  const ranked=getRankedProducts(state.products);
  const isLeader=ranked[0]?.id===p.id;
  return <>
    <PublicHeader/>
    <main className="public-container attention-detail brand-profile-page" style={{'--brand-accent':p.color} as CSSProperties}>
      <div className="audience-dock"><AudiencePulse/></div>

      {paidReturn&&<div className="attention-success" role="status"><h3>Checkout complete. Your bid is confirming.</h3><p>Returning from Dodo does not apply the bid by itself. Rankings update after payment is confirmed.</p></div>}
      <div className="profile-moving-backdrop" aria-hidden="true"><i className="backdrop-ring ring-a"/><i className="backdrop-ring ring-b"/><i className="backdrop-glow"/><Sparkles className="backdrop-spark spark-left" size={32}/><Sparkles className="backdrop-spark spark-right" size={25}/></div><article className="brand-profile-sheet">
        <header className="profile-intro"><div className="profile-art" aria-hidden="true"><span className="profile-art-orbit"/><span className="profile-art-orbit orbit-offset"/><span className="profile-art-monogram">{p.name.slice(0,1).toUpperCase()}</span><Sparkles className="profile-art-star" size={28}/><span className="profile-art-caption">INDEPENDENT BRAND · BIG POSSIBILITIES</span></div>
          <div className="profile-topline"><div className="profile-navigation"><Link href="/#products" className="profile-back" aria-label="Back to marketplace" title="Back to marketplace"><ArrowLeft size={19}/></Link><span><Sparkles size={14}/> THE BRAND SPOTLIGHT</span></div><span className="profile-status"><i/>{isActive(p)?'Active listing':'Inactive listing'}</span></div>
          <div className="profile-identity"><ProductLogo product={p}/><div><span className="profile-maker">By {p.brandName}</span><h1>{p.name}</h1><div className="attention-tags"><span>{p.category}</span>{p.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div></div>
          <p className="profile-description">{p.description}</p>
          <div className="profile-action-row">
            <Button id={`visit-${p.id}`} onClick={()=>openWebsite(p)}>Visit website <ArrowUpRight size={18}/></Button>
            <Button variant="secondary" id={`bid-${p.id}`} disabled={!isActive(p)} onClick={()=>setBid(p.id)}>Place a bid <TrendingUp size={16}/></Button>
            <ShareListing product={p}/>
            <button type="button" className="profile-domain" onClick={()=>openWebsite(p)} aria-label={`Visit ${p.name} website`}><GlobeIcon size={14}/>{websiteHost(p.websiteUrl)}<ArrowUpRight size={13}/></button>
          </div>
        </header>
        <div className="profile-stats"><ProductMetrics product={p}/></div>
        <div className="profile-body">
          <div className="profile-story">
            <section className="profile-section"><span className="profile-section-label">01 / THE IDEA</span><h2>A little more about {p.name}.</h2><p>{p.description}</p><p>Made by {p.brandName}. Take a closer look at the website to explore what they’re building.</p><button type="button" className="profile-website-link" onClick={()=>openWebsite(p)}>Explore {websiteHost(p.websiteUrl)} <ArrowUpRight size={16}/></button></section>
            <section className="profile-section">
              <span className="profile-section-label">02 / BID HISTORY</span>
              <h2>How this bid grew.</h2>
              <ol className="attention-bid-history">{p.bids.map(bidItem=><li key={bidItem.id}><span><TrendingUp size={16}/> {money(bidItem.amount)}</span><time dateTime={new Date(bidItem.createdAt).toISOString()}>{timeAgo(bidItem.createdAt)}</time></li>)}</ol>
            </section>
          </div>
          <aside className="profile-sidebar">
            <div className="profile-rank-note"><span className="profile-rank-emblem"><ProductLogo product={p} small/><span className="profile-rank-crown"><Crown size={12}/></span></span><div><strong>{isLeader?'#1 · The Crown Jewel':'In the spotlight'}</strong><p>{isLeader?'Leading the board. Setting the pace.':'Good ideas deserve to be seen.'}</p></div></div>
            <section className="profile-section">
              <span className="profile-section-label">LATEST ACTIVITY</span>
              <h2>What’s happening.</h2>
              <ActivityList events={state.activity.filter(event=>event.productId===p.id)} limit={20}/>
            </section>
          </aside>
        </div>
        <footer className="profile-footnote"><DemoNote>Website visits are open to everyone. Bid increases use Dodo Payments checkout. The bid is applied only after payment is confirmed. Returning from Dodo does not apply the bid by itself.</DemoNote></footer>
      </article>
    </main>
    <PublicFooter/>

    <BidDialog productId={bid} onClose={()=>setBid(null)} initialIncrement={initialIncrement}/>
  </>;
}
