'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from './ui/app-link';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, CircleAlert, Clock3, ExternalLink, Image as ImageIcon, LoaderCircle, MapPin, Search, Send, Sparkles, UserRound } from 'lucide-react';
import { PublicFooter, PublicHeader } from './ui/public';
import { Button, Field } from './ui/shared';
import { attentionCategories } from './attention/model';
import { CREATOR_NICHES, type PublicCreator, xProfileUrl } from '@/lib/creator-profiles';
import { launchPhase, type LaunchEventRecord, youtubeEmbed } from '@/lib/launch-events';
import { getSupabase } from '@/lib/supabase';

type ApiState<T> = { loading: boolean; data: T | null; error: string };
const empty = <T,>(): ApiState<T> => ({ loading: true, data: null, error: '' });
const dateText = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
async function json<T>(response: Response): Promise<T | null> { return await response.json().catch(() => null) as T | null; }

function Shell({ children }: { children: React.ReactNode }) { return <><PublicHeader/><main className="stitch-page">{children}</main><PublicFooter/></>; }
function Notice({ children }: { children: React.ReactNode }) { return <p className="stitch-notice"><CircleAlert size={16}/>{children}</p>; }
function Avatar({ creator }: { creator: PublicCreator }) { return creator.avatar_url ? <img className="creator-avatar" src={creator.avatar_url} alt=""/> : <span className="creator-avatar creator-avatar-fallback" aria-hidden="true">{creator.display_name.slice(0, 1).toUpperCase()}</span>; }

function LaunchCard({ launch }: { launch: LaunchEventRecord }) {
  const phase = launchPhase(launch);
  return <article className="launch-card">
    <div className="launch-card-media">{launch.banner_url ? <img src={launch.banner_url} alt=""/> : launch.logo ? <img className="launch-logo" src={launch.logo} alt=""/> : <Sparkles/>}</div>
    <div className="launch-card-body"><div className="stitch-meta"><span className={`launch-phase ${phase}`}>{phase}</span><span>{dateText(launch.launch_at)}</span></div><h3>{launch.product_name}</h3><p>{launch.description}</p><div className="launch-card-foot"><span>{launch.category}</span><Link href={`/launch/${launch.slug}`}>View launch <ArrowUpRight size={15}/></Link></div></div>
  </article>;
}

export function LaunchEventHub({ initialMode = 'browse' }: { initialMode?: 'browse' | 'create' }) {
  const [state, setState] = useState<ApiState<LaunchEventRecord[]>>(empty); const [mode, setMode] = useState(initialMode);
  useEffect(() => { let active = true; fetch('/api/launch-events', { cache: 'no-store' }).then(async r => ({ ok: r.ok, body: await json<{ launches?: LaunchEventRecord[]; error?: string }>(r) })).then(result => active && setState({ loading: false, data: result.body?.launches || [], error: result.ok ? '' : result.body?.error || 'Could not load launches.' })).catch(() => active && setState({ loading: false, data: [], error: 'Could not load launches.' })); return () => { active = false; }; }, []);
  if (mode === 'create') return <Shell><LaunchEventForm onCancel={() => setMode('browse')}/></Shell>;
  const launches = state.data || []; const featured = launches.find(l => launchPhase(l) === 'live') || launches[0];
  return <Shell><section className="stitch-hero launch-hero"><div><span className="stitch-kicker"><Sparkles size={13}/> COLLABCY LAUNCHEVENT</span><h1>Make your launch<br/><em>matter.</em></h1><p>Plan a public launch, tell your product story, and meet the people ready to discover it.</p><div className="stitch-actions"><Button onClick={() => setMode('create')}>Create a LaunchEvent <ArrowRight size={16}/></Button><a className="btn btn-secondary" href="#launches">Explore launches</a></div><p className="stitch-fine">Launch drafts stay private until publication is configured.</p></div><div className="launch-hero-panel">{featured ? <><LaunchMedia launch={featured}/><div><span className="stitch-kicker">FEATURED LAUNCH</span><h2>{featured.product_name}</h2><p>{featured.description}</p><Link href={`/launch/${featured.slug}`}>Explore launch <ArrowRight size={15}/></Link></div></> : <div className="launch-hero-empty"><CalendarDays/><strong>Your launch can be next.</strong><span>Create a private draft in a few minutes.</span></div>}</div></section><section className="stitch-section" id="launches"><div className="stitch-heading"><div><span className="stitch-kicker">LAUNCH RADAR</span><h2>Upcoming & live launches</h2></div><Button variant="secondary" onClick={() => setMode('create')}>Create a launch <ArrowUpRight size={16}/></Button></div>{state.loading ? <Loading label="Loading launch radar…"/> : state.error ? <Notice>{state.error}</Notice> : launches.length ? <div className="launch-grid">{launches.map(launch => <LaunchCard key={launch.id} launch={launch}/>)}</div> : <div className="stitch-empty"><Sparkles/><h3>The launch radar is waiting.</h3><p>Be the first company to save a LaunchEvent draft.</p><Button onClick={() => setMode('create')}>Create a LaunchEvent</Button></div>}</section></Shell>;
}

/** A public, data-backed slice used on the marketplace home. It never falls
 * back to invented launches: a missing table or no published campaigns is a
 * deliberate empty state. */
export function LaunchEventTeaser() {
  const [state, setState] = useState<ApiState<LaunchEventRecord[]>>(empty);
  useEffect(() => {
    let active = true;
    fetch('/api/launch-events', { cache: 'no-store' })
      .then(async response => ({ ok: response.ok, body: await json<{ launches?: LaunchEventRecord[]; error?: string }>(response) }))
      .then(result => active && setState({ loading: false, data: result.body?.launches || [], error: result.ok ? '' : result.body?.error || 'LaunchEvent is not available yet.' }))
      .catch(() => active && setState({ loading: false, data: [], error: 'LaunchEvent is not available yet.' }));
    return () => { active = false; };
  }, []);
  const launches = (state.data || []).slice(0, 3);
  return <section className="market-launch-teaser" aria-labelledby="market-launch-title">
    <div className="market-launch-heading"><div><span className="stitch-kicker"><Sparkles size={13}/> LAUNCHEVENT</span><h2 id="market-launch-title">A moment worth watching.</h2><p>Upcoming products, real launch stories, and the people building them.</p></div><Link href="/launches" className="market-launch-link">Explore LaunchEvent <ArrowUpRight size={16}/></Link></div>
    {state.loading ? <div className="market-launch-loading">Loading launch radar…</div> : launches.length ? <div className="market-launch-grid">{launches.map(launch => <LaunchCard key={launch.id} launch={launch}/>)}</div> : <div className="market-launch-empty"><CalendarDays size={22}/><span>{state.error || 'No public launches are scheduled yet.'}</span><Link href="/launches/new">Plan a LaunchEvent <ArrowRight size={15}/></Link></div>}
  </section>;
}

function LaunchMedia({ launch }: { launch: LaunchEventRecord }) {
  const youtube = youtubeEmbed(launch.video_url);
  if (youtube) return <div className="launch-media"><iframe src={youtube} title={`${launch.product_name} video`} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>;
  if (launch.video_url) return <video className="launch-media" controls preload="metadata" src={launch.video_url}/>;
  if (launch.banner_url) return <img className="launch-media" src={launch.banner_url} alt={`${launch.product_name} launch`}/>;
  return <div className="launch-media launch-media-fallback">{launch.logo ? <img src={launch.logo} alt=""/> : <Sparkles size={36}/>}<span>{launch.product_name}</span></div>;
}

function LaunchEventForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter(); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [form, setForm] = useState({ product_name: '', website_url: '', description: '', category: attentionCategories[0], launch_at: '', duration_days: '7', logo: '', banner_url: '', video_url: '', screenshots: '' });
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); const response = await fetch('/api/launch-events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, screenshots: form.screenshots.split('\n').map(v => v.trim()).filter(Boolean), duration_days: Number(form.duration_days) }) }); const payload = await json<{ error?: string; manage_path?: string }>(response); setSaving(false); if (!response.ok || !payload?.manage_path) { setError(payload?.error || 'Could not save your launch draft.'); return; } router.push(payload.manage_path); };
  return <section className="launch-form-wrap"><Link href="/launches" className="back-link"><ArrowLeft size={15}/>Back to LaunchEvent</Link><div className="launch-form-head"><span className="stitch-kicker">NEW LAUNCHEVENT</span><h1>Plan your public launch.</h1><p>Build a private campaign draft first. Publishing and any paid plan stay unavailable until checkout is configured.</p></div><form className="stitch-form" onSubmit={submit}><Field label="Product name"><input value={form.product_name} maxLength={80} onChange={e => set('product_name', e.target.value)} required/></Field><Field label="Website URL"><input type="url" placeholder="https://yourproduct.com" value={form.website_url} onChange={e => set('website_url', e.target.value)} required/></Field><Field label="Category"><select value={form.category} onChange={e => set('category', e.target.value)}>{attentionCategories.map(category => <option key={category}>{category}</option>)}</select></Field><Field label="Launch date"><input type="datetime-local" value={form.launch_at} onChange={e => set('launch_at', e.target.value)} required/></Field><Field label="Duration"><select value={form.duration_days} onChange={e => set('duration_days', e.target.value)}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></Field><Field label="Product description"><textarea rows={4} maxLength={500} value={form.description} onChange={e => set('description', e.target.value)} required/></Field><div className="form-rule"><ImageIcon size={17}/><div><strong>Media links are optional</strong><span>Use secure HTTPS links for a logo, banner, screenshots, or an MP4/WebM, YouTube, or Vimeo promotional video.</span></div></div><Field label="Logo URL"><input type="url" placeholder="https://…" value={form.logo} onChange={e => set('logo', e.target.value)}/></Field><Field label="Banner URL"><input type="url" placeholder="https://…" value={form.banner_url} onChange={e => set('banner_url', e.target.value)}/></Field><Field label="Promotional video URL"><input type="url" placeholder="YouTube, Vimeo, MP4 or WebM" value={form.video_url} onChange={e => set('video_url', e.target.value)}/></Field><Field label="Screenshot URLs"><textarea rows={3} placeholder="One HTTPS image URL per line" value={form.screenshots} onChange={e => set('screenshots', e.target.value)}/></Field>{error && <Notice>{error}</Notice>}<div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16}/>Saving…</> : <>Save private draft <ArrowRight size={16}/></>}</Button></div></form></section>;
}

export function LaunchDetail({ slug, manage = false }: { slug: string; manage?: boolean }) {
  const [state, setState] = useState<ApiState<LaunchEventRecord>>(empty); const [message, setMessage] = useState('');
  const load = () => fetch(`/api/launch-events/${encodeURIComponent(slug)}`, { cache: 'no-store' }).then(async response => ({ ok: response.ok, body: await json<{ launch?: LaunchEventRecord; error?: string }>(response) })).then(result => setState({ loading: false, data: result.body?.launch || null, error: result.ok ? '' : result.body?.error || 'Launch not found.' })).catch(() => setState({ loading: false, data: null, error: 'Could not load this launch.' }));
  useEffect(() => { load(); }, [slug]);
  const requestPublication = async () => { const response = await fetch(`/api/launch-events/${encodeURIComponent(slug)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_publication: true }) }); const payload = await json<{ error?: string }>(response); setMessage(payload?.error || (response.ok ? 'Publication requested.' : 'Could not update launch.')); };
  if (state.loading) return <Shell><Loading label="Loading launch…"/></Shell>; if (!state.data) return <Shell><section className="stitch-section"><Notice>{state.error}</Notice><Link className="btn btn-secondary" href="/launches">Explore LaunchEvent</Link></section></Shell>;
  const launch = state.data; const phase = launchPhase(launch); return <Shell><section className="launch-detail"><Link href="/launches" className="back-link"><ArrowLeft size={15}/>All LaunchEvents</Link><div className="launch-detail-grid"><div><span className={`launch-phase ${phase}`}>{phase}</span><h1>{launch.product_name}</h1><p className="launch-lede">{launch.description}</p><div className="launch-detail-meta"><span><CalendarDays size={15}/>{dateText(launch.launch_at)}</span><span><Clock3 size={15}/>{launch.duration_days} days</span><span>{launch.category}</span></div><a className="btn btn-primary" href={launch.website_url} target="_blank" rel="noreferrer">Visit website <ExternalLink size={16}/></a>{manage && <div className="launch-manage-box"><strong>This is your private launch draft.</strong><p>Publishing requires a configured LaunchEvent payment plan. Nothing is charged or published from this page.</p><Button variant="secondary" onClick={requestPublication}>Review publication</Button>{message && <Notice>{message}</Notice>}</div>}</div><LaunchMedia launch={launch}/></div>{launch.screenshots.length > 0 && <div className="launch-screenshots">{launch.screenshots.map((source, index) => <img key={source} src={source} alt={`${launch.product_name} screenshot ${index + 1}`}/>)}</div>}</section></Shell>;
}

function Loading({ label }: { label: string }) { return <div className="stitch-loading" role="status"><LoaderCircle className="spin"/><span>{label}</span></div>; }

export function CreatorDirectory() {
  const [query, setQuery] = useState(''); const [niche, setNiche] = useState('All Creators'); const [sort, setSort] = useState('newest'); const [offset, setOffset] = useState(0); const [state, setState] = useState<ApiState<{ creators: PublicCreator[]; has_more: boolean }>>(empty);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => { fetch(`/api/creators?q=${encodeURIComponent(query)}&niche=${encodeURIComponent(niche)}&sort=${sort}&offset=${offset}`, { signal: controller.signal, cache: 'no-store' }).then(async response => ({ ok: response.ok, body: await json<{ creators?: PublicCreator[]; has_more?: boolean; error?: string }>(response) })).then(result => setState({ loading: false, data: { creators: result.body?.creators || [], has_more: !!result.body?.has_more }, error: result.ok ? '' : result.body?.error || 'Could not load creators.' })).catch(error => { if (error.name !== 'AbortError') setState({ loading: false, data: { creators: [], has_more: false }, error: 'Could not load creators.' }); }); }, 180); return () => { controller.abort(); window.clearTimeout(timer); }; }, [query, niche, sort, offset]);
  return <Shell><section className="stitch-section creator-directory"><div className="directory-hero"><span className="stitch-kicker">CREATOR ATTENTION NETWORK</span><h1>Discover <em>Creators</em></h1><p>Find public creator profiles for your next product launch or attention campaign.</p></div><div className="creator-search"><label><Search size={17}/><input value={query} placeholder="Search by name, @handle, or niche…" onChange={e => { setQuery(e.target.value); setOffset(0); }}/></label><select value={sort} onChange={e => { setSort(e.target.value); setOffset(0); }}><option value="newest">Recently added</option><option value="name">Name</option></select></div><div className="creator-chips">{['All Creators', ...CREATOR_NICHES].map(value => <button key={value} className={niche === value ? 'active' : ''} onClick={() => { setNiche(value); setOffset(0); }}>{value}</button>)}</div>{state.loading ? <Loading label="Loading public creators…"/> : state.error ? <Notice>{state.error}</Notice> : !state.data?.creators.length ? <div className="stitch-empty"><UserRound/><h3>No matching public creators yet.</h3><p>Try another search or return when creators have published profiles.</p></div> : <><div className="creator-grid">{state.data.creators.map(creator => <CreatorCard key={creator.id} creator={creator}/>)}</div><div className="directory-pagination"><Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))}>Previous</Button><Button variant="secondary" disabled={!state.data.has_more} onClick={() => setOffset(offset + 12)}>Load more</Button></div></>}</section></Shell>;
}

function CreatorCard({ creator }: { creator: PublicCreator }) { return <article className="creator-card-public"><div className="creator-card-cover"><Avatar creator={creator}/><span className={creator.available ? 'available' : 'unavailable'}>{creator.available ? 'Available' : 'Unavailable'}</span></div><div className="creator-card-body"><span className="stitch-kicker">{creator.niche}</span><h3>{creator.display_name}</h3>{creator.x_handle && <a href={xProfileUrl(creator.x_handle)} target="_blank" rel="noreferrer">@{creator.x_handle}</a>}<p>{creator.bio || 'Public creator profile on CollabCy.'}</p>{creator.location && <span className="creator-location"><MapPin size={14}/>{creator.location}</span>}<div className="creator-card-foot">{creator.starting_rate !== null && <span>From ${creator.starting_rate.toLocaleString()}</span>}<Link href={`/creators/${creator.handle}`}>View profile <ArrowUpRight size={15}/></Link></div></div></article>; }

export function CreatorProfile({ handle }: { handle: string }) {
  const [state, setState] = useState<ApiState<PublicCreator>>(empty); useEffect(() => { fetch(`/api/creators/${encodeURIComponent(handle)}`, { cache: 'no-store' }).then(async response => ({ ok: response.ok, body: await json<{ creator?: PublicCreator; error?: string }>(response) })).then(result => setState({ loading: false, data: result.body?.creator || null, error: result.ok ? '' : result.body?.error || 'Creator not found.' })).catch(() => setState({ loading: false, data: null, error: 'Could not load creator.' })); }, [handle]);
  if (state.loading) return <Shell><Loading label="Loading creator profile…"/></Shell>; if (!state.data) return <Shell><section className="stitch-section"><Notice>{state.error}</Notice></section></Shell>; const creator = state.data; const contact = xProfileUrl(creator.x_handle);
  return <Shell><section className="creator-profile"><Link href="/creators" className="back-link"><ArrowLeft size={15}/>Creator Directory</Link><div className="creator-profile-head"><Avatar creator={creator}/><div><span className="stitch-kicker">{creator.available ? 'AVAILABLE FOR CAMPAIGNS' : 'CREATOR PROFILE'}</span><h1>{creator.display_name}</h1>{creator.x_handle && <span>@{creator.x_handle}</span>}<p>{creator.bio || 'This creator has not added a public bio yet.'}</p><div className="creator-profile-tags"><span>{creator.niche}</span>{creator.location && <span><MapPin size={13}/>{creator.location}</span>}{creator.available && <span>Available</span>}</div></div>{contact && <a className="btn btn-primary" href={contact} target="_blank" rel="noreferrer">Contact on X <ArrowUpRight size={16}/></a>}</div><div className="creator-profile-grid"><section><span className="stitch-kicker">PUBLIC PROFILE</span><h2>Built for real collaborations.</h2><p>Only creator-provided public details appear here. CollabCy does not invent follower counts, engagement metrics, response times, or verification badges.</p>{creator.platforms.length > 0 && <div className="creator-platforms">{creator.platforms.map(platform => <span key={platform}>{platform}</span>)}</div>}</section><aside><span className="stitch-kicker">COLLABORATION</span><h2>{creator.available ? 'Open to hear about your launch.' : 'Not currently available.'}</h2>{creator.starting_rate !== null && <p>Starting from <strong>${creator.starting_rate.toLocaleString()}</strong>.</p>}{contact ? <a href={contact} target="_blank" rel="noreferrer">Start on X <ArrowRight size={15}/></a> : <p>This creator has not shared a public contact link.</p>}</aside></div></section></Shell>;
}

async function authHeader(): Promise<Record<string, string>> {
  const client = getSupabase();
  if (!client) return {};
  const { data } = await client.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
export function CreatorSignIn() { const [email, setEmail] = useState(''); const [status, setStatus] = useState(''); const send = async (event: FormEvent) => { event.preventDefault(); const client = getSupabase(); if (!client) { setStatus('Creator sign-in is unavailable until the public Supabase client is configured.'); return; } const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/creator/dashboard` } }); setStatus(error ? error.message : 'Check your email for a secure sign-in link.'); };
  return <Shell><section className="auth-card"><span className="stitch-kicker">CREATOR ACCESS</span><h1>Manage your creator profile.</h1><p>Creator accounts use Supabase authentication. Companies can create public LaunchEvent drafts without signing in.</p><form onSubmit={send}><Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} required/></Field><Button>Send secure sign-in link <Send size={16}/></Button>{status && <Notice>{status}</Notice>}</form></section></Shell>; }

export function CreatorDashboard() {
  const [state, setState] = useState<ApiState<{ creator: PublicCreator | null; email: string }>>(empty);
  const [form, setForm] = useState<Partial<PublicCreator>>({});
  const [platformsText, setPlatformsText] = useState('');
  const [message, setMessage] = useState('');
  const set = <K extends keyof PublicCreator>(key: K, value: PublicCreator[K]) => setForm(current => ({ ...current, [key]: value }));
  const load = async () => {
    const response = await fetch('/api/creator/me', { headers: await authHeader(), cache: 'no-store' });
    const body = await json<{ creator?: PublicCreator | null; email?: string; error?: string }>(response);
    const data = body?.creator !== undefined && typeof body.email === 'string' ? { creator: body.creator, email: body.email } : null;
    setState({ loading: false, data: response.ok ? data : null, error: response.ok ? '' : body?.error || 'Could not load your creator account.' });
    if (body?.creator) { setForm(body.creator); setPlatformsText(body.creator.platforms.join(', ')); }
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...form, platforms: platformsText.split(',').map(value => value.trim()).filter(Boolean) };
    const response = await fetch('/api/creator/me', { method: 'PUT', headers: { ...await authHeader(), 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await json<{ creator?: PublicCreator; error?: string }>(response);
    if (!response.ok || !body?.creator) { setMessage(body?.error || 'Could not save profile.'); return; }
    setForm(body.creator); setPlatformsText(body.creator.platforms.join(', ')); setMessage('Your public creator profile is saved.');
  };
  if (state.loading) return <Shell><Loading label="Checking creator access…"/></Shell>;
  if (!state.data) return <Shell><section className="stitch-section"><Notice>{state.error}</Notice><Link href="/creator/sign-in" className="btn btn-primary">Sign in as a creator</Link></section></Shell>;
  return <Shell><section className="creator-dashboard"><span className="stitch-kicker">CREATOR DASHBOARD</span><h1>Your public creator profile.</h1><p>Signed in as {state.data.email}. Only you can edit this profile.</p><form className="stitch-form" onSubmit={save}><Field label="Display name"><input value={form.display_name || ''} onChange={e => set('display_name', e.target.value)} required/></Field><Field label="Public handle"><input value={form.handle || ''} onChange={e => set('handle', e.target.value)} required/></Field><Field label="X handle"><input value={form.x_handle || ''} onChange={e => set('x_handle', e.target.value)}/></Field><Field label="Niche"><select value={form.niche || 'Other'} onChange={e => set('niche', e.target.value)}>{CREATOR_NICHES.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Location"><input value={form.location || ''} onChange={e => set('location', e.target.value)}/></Field><Field label="Avatar URL"><input type="url" value={form.avatar_url || ''} onChange={e => set('avatar_url', e.target.value)}/></Field><Field label="Starting rate (USD, optional)"><input type="number" min="0" value={form.starting_rate ?? ''} onChange={e => set('starting_rate', e.target.value === '' ? null : Number(e.target.value))}/></Field><Field label="Platforms"><input value={platformsText} placeholder="X, YouTube, Instagram" onChange={e => setPlatformsText(e.target.value)}/></Field><Field label="Bio"><textarea rows={4} value={form.bio || ''} onChange={e => set('bio', e.target.value)}/></Field><label className="availability-control"><input type="checkbox" checked={form.available !== false} onChange={e => set('available', e.target.checked)}/> Available for campaigns</label>{message && <Notice>{message}</Notice>}<div className="form-actions"><Button>Save profile <Check size={16}/></Button>{form.handle && <Link href={`/creators/${form.handle}`} className="btn btn-secondary">View public profile</Link>}</div></form></section></Shell>;
}
import { useRouter } from 'next/navigation';
