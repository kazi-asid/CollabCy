'use client';
import {useState} from 'react';
import Link from './app-link';
import {ArrowUpRight,MessageSquare,Search,ShieldCheck} from 'lucide-react';
import {Accordion,AccordionItem,AccordionTrigger,AccordionContent} from '@/components/ui/accordion';
import {PageTitle,Empty,DemoNote,SearchBox} from './shared';
import {PublicHeader,PublicFooter} from './public';
import {MIN_INITIAL_BID} from '../attention/model';

const faq=[
  ['What is the Attention Marketplace?', 'A public board where brands list products for discovery. Visitors can browse listings, open product pages, and visit websites. Your cumulative bid determines your position among active products.'],
  ['How much does it cost to list a product?', `There is no separate listing fee. You choose an initial spotlight bid from $${MIN_INITIAL_BID}. That amount is paid through Dodo, and it becomes your listing’s current bid after payment is confirmed.`],
  ['How do payments work?', 'Your initial spotlight bid and later bid increases both use Dodo Payments. Rankings update only after payment confirmation; returning from checkout alone does not change your rank.'],
  ['Do I need an account?', 'No. Browsing, visiting a website, listing a product, and placing a bid do not require a CollabCy account.'],
  ['How does ranking work?', 'Products with higher current bids rank higher. When bids are equal, the earlier bid keeps its position.'],
];

export function Help(){
  const [q,setQ]=useState('');
  const items=faq.filter(([a,b])=>(a+' '+b).toLowerCase().includes(q.toLowerCase()));
  return <><PublicHeader/><main className="public-container public-section help-public resource-help"><div className="resource-mark" aria-hidden="true"><MessageSquare size={25}/></div>
    <PageTitle eyebrow="A LITTLE GUIDANCE GOES A LONG WAY" title="How can we help" description="Clear answers for the Attention Marketplace."/>
    <div className="help-search"><SearchBox value={q} onChange={setQ} placeholder="Search questions about bids, listings, and payments…"/></div>
    <div className="help-categories">
      <div><Search size={26}/><h3>Discover products</h3><p>Browse the live board, visit websites, and find your next favorite.</p></div>
      <div><MessageSquare size={26}/><h3>Claim a spotlight</h3><p>Pay your initial bid through Dodo. The listing goes live after payment is confirmed.</p></div>
      <div><ShieldCheck size={26}/><h3>Know where you stand</h3><p>Higher bids rank higher. Equal bids keep the earlier position.</p></div>
    </div>
    <section className="panel faq-panel"><h2>Frequently asked questions</h2>
      <Accordion type="single" collapsible>{items.map(([a,b],i)=><AccordionItem key={a} value={`${i}`}><AccordionTrigger>{a}</AccordionTrigger><AccordionContent>{b}</AccordionContent></AccordionItem>)}</Accordion>
      {!items.length&&<Empty title="No matching answers." description="Try a shorter keyword, such as bids or listings."/>}
    </section>
    <section className="panel" id="contact"><h2>Contact CollabCy</h2><p>Email <a href="mailto:admin@collabcy.app">admin@collabcy.app</a> for privacy questions, data deletion requests, or to report a marketplace or content concern.</p></section>
  </main><PublicFooter/></>;
}

export function Legal({kind}:{kind:'privacy'|'terms'}){
  return <><PublicHeader/><main className="public-container public-section legal resource-sheet"><div className="resource-mark" aria-hidden="true"><ShieldCheck size={25}/></div>
    <span className="eyebrow">{kind==='privacy'?'PRIVACY POLICY':'TERMS OF SERVICE'}</span>
    <h1>{kind==='privacy'?'How CollabCy uses your information.':'A few things to know.'}</h1>
    {kind==='privacy'?<PrivacyCopy/>:<TermsCopy/>}
  </main><PublicFooter/></>;
}

function PrivacyCopy(){
  return <>
    <p className="lead">This page describes how CollabCy currently processes information. CollabCy is an Attention Marketplace at /, /discover/product pages, /listings, and /brand/products/new.</p>
    <h2>Attention Marketplace</h2>
    <p>Listings and related marketplace information are publicly visible. Information submitted may include product or brand name, description, website URL, category, tags, logo or image, listing details, bid amounts, public ranking and activity information, and visit or click metrics.</p>
    <h2>Use without an account</h2>
    <p>The Attention Marketplace currently allows browsing, website visits, listing a product, and placing a bid without creating an account. There is no separate listing fee. Initial bids and bid add-ons are paid through Dodo checkout. CollabCy may still process the public listing or bid information you submit, along with technical request information used for security and abuse prevention.</p>
    <h2>Security and abuse prevention</h2>
    <p>CollabCy may process technical request information, including IP-related information, to operate the service, limit abuse, and apply rate limiting.</p>
    <h2>Browser storage</h2>
    <p>CollabCy uses essential browser storage to remember marketplace presence and visit counts on a device. These are not advertising or tracking cookies.</p>
    <h2>Services we use</h2>
    <p>CollabCy currently uses Supabase for database and related backend services. Hosting and infrastructure providers process requests needed to deliver the website. Dodo Payments processes Attention Marketplace bid checkout. CollabCy does not currently use in-app analytics, advertising pixels, or session replay.</p>
    <h2>Anonymous marketplace records</h2>
    <p>Anonymous Attention Marketplace listings and paid bids are not currently tied to an authenticated CollabCy account. CollabCy does not automatically delete anonymous marketplace listings, because they may not be linked to an account.</p>
    <h2>Contact</h2>
    <p>Privacy and data-deletion requests: <a href="mailto:admin@collabcy.app">admin@collabcy.app</a>.</p>
  </>;
}

function TermsCopy(){
  return <>
    <p className="lead">These Terms describe how to use CollabCy today. Attention Marketplace initial bids and bid add-ons are paid through Dodo Payments. There is no separate listing fee.</p>
    <h2>Using CollabCy</h2>
    <p>CollabCy is an Attention Marketplace for product discovery and paid spotlight bids.</p>
    <h2>Attention Marketplace</h2>
    <p>Visitors can discover public listings, submit listings, and place bids without an account. Ranking changes after a paid bid is confirmed. Returning from checkout is not itself proof of payment and does not apply the bid.</p>
    <h2>Public information</h2>
    <p>Information submitted to the public Attention Marketplace may be displayed publicly, including names, descriptions, logos or images, website URLs, bid amounts, ranking, and activity.</p>
    <h2>Prohibited use</h2>
    <p>Do not use CollabCy for unlawful activity, impersonation, spam, malicious activity, attacks on the platform, or attempts to manipulate marketplace ranking.</p>
    <h2>Platform role</h2>
    <p>CollabCy does not guarantee listing performance, traffic, ranking outcomes, or commercial results.</p>
    <h2>Changes</h2>
    <p>CollabCy may update these Terms as the product changes. The updated version will be published on this page.</p>
    <h2>Contact</h2>
    <p>Questions about these Terms: <a href="mailto:admin@collabcy.app">admin@collabcy.app</a>.</p>
  </>;
}

export function DataDeletion(){
  return <><PublicHeader/><main className="public-container public-section legal resource-sheet"><div className="resource-mark" aria-hidden="true"><ShieldCheck size={25}/></div>
    <span className="eyebrow">DATA DELETION</span>
    <h1>Data Deletion</h1>
    <p className="lead">You can request deletion of personal data associated with CollabCy.</p>
    <p>To request deletion, email <a href="mailto:admin@collabcy.app">admin@collabcy.app</a>.</p>
    <h2>Anonymous Attention Marketplace content</h2>
    <p>Anonymous Attention Marketplace listings and paid bids are not currently tied to an authenticated account. A deletion request for anonymous marketplace content may need additional information so the relevant listing can be identified.</p>
    <div className="hero-actions">
      <Link className="btn btn-secondary" href="/privacy">Privacy Policy</Link>
      <Link className="btn btn-secondary" href="/terms">Terms of Service</Link>
      <a className="btn btn-primary" href="mailto:admin@collabcy.app">Email CollabCy <ArrowUpRight size={16}/></a>
    </div>
  </main><PublicFooter/></>;
}
