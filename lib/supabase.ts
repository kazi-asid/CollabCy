import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { toast } from "sonner";
import type { ActivityEvent, Bid, Product } from "@/app/attention/model";
import { isActive, LISTING_DAYS, safeWebsite } from "@/app/attention/model";
import { isAttentionProductId, validateAttentionIncrement, validateAttentionListing } from "@/app/attention/validation";
import { blankProfile, brandCanBrowseCreators, campaignLetter, canonicalMarketplaceRole, isCreatorUserId, isUuid, realDirectoryCreators, roleConflictNotice, type Campaign, type CampaignApplication, type ChatMessage, type Connection, type ConnectionStatus, type Conversation, type Creator, type Notice, type NotificationType, type Profile, type Role, type SocialAccount, type State, type ApplicationStatus } from "@/app/data";
import { isDealStatus, type CollaborationDeal, type DealVerificationEvent } from "@/app/deals/model";

function publicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  return import.meta.env[name] || (typeof process !== "undefined" ? process.env[name] : undefined);
}

// Public Supabase URL + anon key only. Never put the Google client secret here.
const url = publicEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = publicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (client !== undefined) return client;
  if (!url || !anonKey) {
    client = null;
    return null;
  }
  client = createClient(url, anonKey);
  return client;
}

const OAUTH_INTENT_KEY = "collabcy-oauth-intent";

export type OAuthIntent = {
  role: Role;
  next?: string | null;
};

export function saveOAuthIntent(intent: OAuthIntent) {
  sessionStorage.setItem(OAUTH_INTENT_KEY, JSON.stringify(intent));
}

export function readOAuthIntent(): OAuthIntent | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: unknown; next?: string | null };
    if (parsed.role !== "creator" && parsed.role !== "brand") return null;
    return { role: parsed.role, next: parsed.next };
  } catch {
    return null;
  }
}

export function clearOAuthIntent() {
  sessionStorage.removeItem(OAUTH_INTENT_KEY);
}

function firstHttpUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  }
  return undefined;
}

function isCustomUpload(avatar?: string) {
  return !!avatar && avatar.startsWith("data:");
}

export function identityFromSupabaseUser(user: User): {
  name: string;
  email: string;
  avatar?: string;
} {
  const meta = user.user_metadata ?? {};
  const identityData =
    user.identities?.find((item) => item.provider === "google")?.identity_data ??
    user.identities?.[0]?.identity_data ??
    {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.email ||
    "Google user";
  const avatar = firstHttpUrl(
    meta.avatar_url,
    meta.picture,
    identityData.avatar_url,
    identityData.picture,
  );
  return { name, email: user.email || "", avatar };
}

export function persistMarketplace(state: { session?: boolean; remoteWorkspace?: boolean }) {
  return !!state.session && !!state.remoteWorkspace;
}

export function postAuthPath(role: Role, onboarded: boolean, next?: string | null, platformVerifier = false): string {
  if (platformVerifier && onboarded && next !== "promote") return "/admin";
  if (onboarded) {
    return role === "brand" && next === "promote"
      ? "/brand/products/new"
      : `/${role}/dashboard`;
  }
  return role === "brand" && next === "promote"
    ? "/onboarding?next=promote"
    : "/onboarding";
}

export function applyProviderSignIn(
  prev: State,
  role: Role,
  identity: { name: string; email: string; avatar?: string },
): State {
  const profile = {
    ...blankProfile,
    name: identity.name,
    email: identity.email,
    avatar: identity.avatar,
  };
  return {
    ...prev,
    session: true,
    role,
    profile,
    profiles: { [role]: profile },
    onboarded: false,
  };
}

type ProfileRow = {
  user_id: string;
  role: Role;
  name: string;
  email: string;
  bio: string;
  handle: string;
  website: string;
  niche: string;
  platforms: string[] | null;
  followers: number | null;
  impressions: number | null;
  rate: number | null;
  location: string;
  available: boolean | null;
  avatar: string | null;
  portfolio: string[] | null;
  created_at?: string;
};

type ProfileFetchResult =
  | { status: "found"; profile: Profile; role: Role; created: number }
  | { status: "missing" }
  | { status: "error" }
  | { status: "skipped" };

const PROFILE_COLUMNS =
  "user_id, role, name, email, bio, handle, website, niche, platforms, followers, impressions, rate, location, available, avatar, portfolio, created_at";

function asRole(value: unknown): Role | null {
  return value === "brand" || value === "creator" ? value : null;
}

function ownedProfileFromRow(row: ProfileRow): { role: Role; profile: Profile; created: number } | null {
  const role = asRole(row.role);
  if (!role) return null;
  return {
    role,
    profile: rowToProfile(row),
    created: Date.parse(row.created_at || "") || 0,
  };
}

export async function listOwnProfiles(): Promise<{
  profiles: { role: Role; profile: Profile; created: number }[];
  error?: string;
  skipped?: boolean;
}> {
  const supabase = getSupabase();
  if (!supabase) return { profiles: [], skipped: true };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { profiles: [], error: sessionError.message };
  if (!sessionData.session?.user) return { profiles: [], skipped: true };
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", sessionData.session.user.id);
  if (error) return { profiles: [], error: error.message };
  return {
    profiles: ((data as ProfileRow[] | null) ?? [])
      .map(ownedProfileFromRow)
      .filter((row): row is { role: Role; profile: Profile; created: number } => !!row)
      .sort((a, b) => a.created - b.created || a.role.localeCompare(b.role)),
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    name: row.name || "",
    email: row.email || "",
    bio: row.bio || "",
    handle: row.handle || "",
    website: row.website || "",
    niche: row.niche || blankProfile.niche,
    platforms: asStringArray(row.platforms),
    followers: asNumber(row.followers, 0),
    impressions: asNumber(row.impressions, 0),
    rate: asNumber(row.rate, blankProfile.rate),
    location: row.location || "",
    available: row.available !== false,
    avatar: row.avatar || undefined,
    portfolio: asStringArray(row.portfolio),
  };
}

function profileWritePayload(userId: string, role: Role, profile: Profile) {
  return {
    user_id: userId,
    role,
    name: profile.name || "",
    email: profile.email || "",
    bio: profile.bio || "",
    handle: profile.handle || "",
    website: profile.website || "",
    niche: profile.niche || "",
    platforms: profile.platforms || [],
    followers: asNumber(profile.followers, 0),
    impressions: asNumber(profile.impressions, 0),
    rate: asNumber(profile.rate, blankProfile.rate),
    location: profile.location || "",
    available: profile.available !== false,
    avatar: profile.avatar || null,
    portfolio: profile.portfolio || [],
  };
}

function mergeIdentityIntoProfile(
  profile: Profile,
  identity: { name: string; email: string; avatar?: string },
): Profile {
  return {
    ...profile,
    email: identity.email || profile.email,
    name: profile.name || identity.name,
    avatar: isCustomUpload(profile.avatar)
      ? profile.avatar
      : profile.avatar || identity.avatar,
  };
}

export function applyAuthenticatedProfile(
  prev: State,
  role: Role,
  identity: { name: string; email: string; avatar?: string },
  remote: Profile | null,
): State {
  if (remote) {
    const profile = mergeIdentityIntoProfile(remote, identity);
    return {
      ...prev,
      session: true,
      role,
      profile,
      profiles: { [role]: profile },
      onboarded: true,
    };
  }
  const applied = applyProviderSignIn(prev, role, identity);
  if (!applied.onboarded) {
    return { ...applied, profiles: { [role]: applied.profile } };
  }
  return {
    ...applied,
    profiles: { [role]: applied.profile },
  };
}

export async function fetchOwnProfile(role: Role): Promise<ProfileFetchResult> {
  const owned = await listOwnProfiles();
  if (owned.skipped) return { status: "skipped" };
  if (owned.error) return { status: "error" };
  const match = owned.profiles.find((item) => item.role === role);
  if (!match) return { status: "missing" };
  return { status: "found", profile: match.profile, role: match.role, created: match.created };
}

function showRoleConflict(existing: Role) {
  const copy = roleConflictNotice(existing);
  toast.error(copy.title, { description: copy.body });
  return `${copy.title} ${copy.body}`;
}

export async function persistAuthenticatedProfile(role: Role, profile: Profile): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return;
  const owned = await listOwnProfiles();
  if (owned.error) {
    const mapped = publicErrorMessage(owned.error, "Could not save your profile.");
    toast.error(mapped);
    return mapped;
  }
  const existing = canonicalMarketplaceRole(owned.profiles);
  if (existing && existing !== role) {
    return showRoleConflict(existing);
  }
  const { error } = await supabase
    .from("profiles")
    .upsert(profileWritePayload(user.id, role, profile), { onConflict: "user_id,role" });
  if (error) {
    const mapped = publicErrorMessage(error, "Could not save your profile.");
    toast.error(mapped);
    return mapped;
  }
}

export async function resolveAuthenticatedState(
  prev: State,
  role: Role,
  identity: { name: string; email: string; avatar?: string },
): Promise<State> {
  const owned = await listOwnProfiles();
  const canonical = canonicalMarketplaceRole(owned.profiles);
  const resolvedRole = canonical || role;
  if (canonical && canonical !== role) showRoleConflict(canonical);
  const remote = owned.profiles.find((item) => item.role === resolvedRole)?.profile || null;
  const next = applyAuthenticatedProfile(prev, resolvedRole, identity, remote);
  const withCampaigns = await hydrateCampaigns(next);
  return hydrateMarketplace(await hydrateSocialAccounts(withCampaigns));
}

type CampaignStatus = "draft" | "active" | "paused";

type CampaignRow = {
  id: string;
  user_id: string;
  brand_name: string;
  title: string;
  description: string;
  category: string;
  platform: string;
  deliverable: string;
  requirements: string;
  budget: number | null;
  max_budget: number | null;
  color: string;
  letter: string;
  featured: boolean | null;
  days: number | null;
  status: string;
  applications: number | null;
  created_at: string;
  expires_at: string | null;
};

const CAMPAIGN_COLUMNS =
  "id, user_id, brand_name, title, description, category, platform, deliverable, requirements, budget, max_budget, color, letter, featured, days, status, applications, created_at, expires_at";

function asCampaignStatus(value: unknown): CampaignStatus {
  return value === "active" || value === "paused" ? value : "draft";
}

function rowToCampaign(row: CampaignRow, owner: boolean): Campaign {
  return {
    id: row.id,
    brand: row.brand_name || "",
    title: row.title || "",
    description: row.description || "",
    category: row.category || "",
    budget: asNumber(row.budget, 0),
    maxBudget: asNumber(row.max_budget, 0),
    platform: row.platform || "",
    deliverable: row.deliverable || "",
    color: row.color || "#e8edff",
    letter: row.letter || campaignLetter(row.brand_name),
    featured: row.featured === true,
    days: asNumber(row.days, 7),
    status: asCampaignStatus(row.status),
    requirements: row.requirements || "",
    applications: asNumber(row.applications, 0),
    created: Date.parse(row.created_at) || Date.now(),
    expires: row.expires_at ? Date.parse(row.expires_at) || 0 : 0,
    owner,
  };
}

function campaignExpiresAt(campaign: Campaign) {
  return campaign.expires > 0 ? new Date(campaign.expires).toISOString() : null;
}

function campaignWriteFields(campaign: Campaign) {
  return {
    brand_name: campaign.brand || "",
    title: campaign.title || "",
    description: campaign.description || "",
    category: campaign.category || "",
    platform: campaign.platform || "",
    deliverable: campaign.deliverable || "",
    requirements: campaign.requirements || "",
    budget: asNumber(campaign.budget, 0),
    max_budget: asNumber(campaign.maxBudget, 0),
    color: campaign.color || "#e8edff",
    letter: campaign.letter || campaignLetter(campaign.brand),
    featured: campaign.featured === true,
    days: asNumber(campaign.days, 7),
    status: asCampaignStatus(campaign.status),
    applications: asNumber(campaign.applications, 0),
    expires_at: campaignExpiresAt(campaign),
  };
}

async function requireAuthenticatedUser(): Promise<{
  supabase: SupabaseClient | null;
  user: User | null;
  skipped: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) return { supabase: null, user: null, skipped: true };
  const { data, error } = await supabase.auth.getSession();
  if (error) return { supabase, user: null, skipped: false, error: error.message };
  if (!data.session?.user) return { supabase, user: null, skipped: true };
  return { supabase, user: data.session.user, skipped: false };
}

export async function listMyCampaigns(): Promise<{ campaigns: Campaign[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { campaigns: [], error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { campaigns: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) return { campaigns: [], error: error.message };
  return { campaigns: (data as CampaignRow[] | null)?.map((row) => rowToCampaign(row, true)) ?? [] };
}

export async function listPublishedCampaigns(): Promise<{ campaigns: Campaign[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { campaigns: [], error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { campaigns: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return { campaigns: [], error: error.message };
  const now = Date.now();
  return {
    campaigns: (data as CampaignRow[] | null)
      ?.map((row) => rowToCampaign(row, false))
      .filter((campaign) => campaign.status === "active" && campaign.expires > now) ?? [],
  };
}

export async function createCampaign(campaign: Campaign): Promise<{ campaign?: Campaign; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to save this campaign." };
  const { data, error } = await auth.supabase
    .from("campaigns")
    .insert({
      id: campaign.id,
      user_id: auth.user.id,
      ...campaignWriteFields(campaign),
      created_at: new Date(campaign.created || Date.now()).toISOString(),
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error) return { error: error.message };
  return { campaign: rowToCampaign(data as CampaignRow, true) };
}

export async function updateCampaign(campaign: Campaign): Promise<{ campaign?: Campaign; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to update this campaign." };
  const { data, error } = await auth.supabase
    .from("campaigns")
    .update(campaignWriteFields(campaign))
    .eq("id", campaign.id)
    .eq("user_id", auth.user.id)
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Campaign could not be updated." };
  return { campaign: rowToCampaign(data as CampaignRow, true) };
}

export async function deleteCampaign(id: string): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to delete this campaign." };
  const { error } = await auth.supabase.from("campaigns").delete().eq("id", id).eq("user_id", auth.user.id);
  if (error) return { error: publicErrorMessage(error, "Could not delete this campaign.") };
  return {};
}

export async function hydrateCampaigns(state: State): Promise<State> {
  if (!state.session) return { ...state, remoteWorkspace: false };
  if (state.role === "brand") {
    const result = await listMyCampaigns();
    if (result.skipped) return { ...state, remoteWorkspace: false };
    if (result.error) {
      toast.error(result.error);
      return { ...state, remoteWorkspace: true };
    }
    return { ...state, remoteWorkspace: true, campaigns: result.campaigns };
  }
  const result = await listPublishedCampaigns();
  if (result.skipped) return { ...state, remoteWorkspace: false };
  if (result.error) {
    toast.error(result.error);
    return { ...state, remoteWorkspace: true };
  }
  return { ...state, remoteWorkspace: true, publishedCampaigns: result.campaigns };
}

type SocialAccountRow = {
  id: string;
  user_id: string;
  platform: string;
  handle: string;
  url: string;
  followers: number | null;
  impressions: number | null;
  engagement: number | string | null;
  verified: boolean | null;
};

const SOCIAL_COLUMNS = "id, user_id, platform, handle, url, followers, impressions, engagement, verified";

const CREATOR_DIRECTORY_COLORS = ["#e7edff", "#e5f2ed", "#f2e9ff", "#fff0dc", "#fde8ef", "#e1effa"];

type PublicCreatorRow = {
  user_id: string;
  role: Role;
  name: string;
  bio: string;
  handle: string;
  website: string;
  niche: string;
  platforms: string[] | null;
  followers: number | null;
  impressions: number | null;
  rate: number | null;
  location: string;
  available: boolean | null;
  avatar: string | null;
  portfolio: string[] | null;
  created_at: string;
};

function colorFromId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % CREATOR_DIRECTORY_COLORS.length;
  return CREATOR_DIRECTORY_COLORS[hash] || CREATOR_DIRECTORY_COLORS[0];
}

function initialsFromName(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");
  return (letters || "Y").toUpperCase();
}

function rowToSocialAccount(row: SocialAccountRow): SocialAccount {
  return {
    id: row.id,
    platform: row.platform || "",
    handle: row.handle || "",
    url: row.url || "",
    followers: asNumber(row.followers, 0),
    impressions: asNumber(row.impressions, 0),
    engagement: asNumber(row.engagement, 0),
    verified: row.verified === true,
  };
}

function applySocialAccountsToProfile(profile: Profile, accounts: SocialAccount[]): Profile {
  if (!accounts.length) return profile;
  return {
    ...profile,
    platforms: accounts.map((account) => account.platform).filter(Boolean),
    handle: profile.handle || accounts[0]?.handle || "",
    followers: profile.followers || accounts.reduce((max, account) => Math.max(max, account.followers), 0),
    impressions: profile.impressions || accounts.reduce((max, account) => Math.max(max, account.impressions), 0),
  };
}

export async function hydrateSocialAccounts(state: State): Promise<State> {
  if (!state.session || state.role !== "creator") return state;
  const result = await listMySocialAccounts();
  if (result.skipped) return state;
  if (result.error) {
    toast.error(result.error);
    return state;
  }
  const profile = applySocialAccountsToProfile(state.profile, result.accounts);
  return {
    ...state,
    socialAccounts: result.accounts,
    profile,
    profiles: { ...state.profiles, creator: profile },
  };
}

export async function listMySocialAccounts(): Promise<{
  accounts: SocialAccount[];
  error?: string;
  skipped?: boolean;
}> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { accounts: [], error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { accounts: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("social_accounts")
    .select(SOCIAL_COLUMNS)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });
  if (error) return { accounts: [], error: error.message };
  return { accounts: (data as SocialAccountRow[] | null)?.map(rowToSocialAccount) ?? [] };
}

export async function upsertSocialAccount(
  account: Omit<SocialAccount, "id"> & { id?: string },
): Promise<{ account?: SocialAccount; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to save this social account." };
  const payload = {
    user_id: auth.user.id,
    platform: account.platform || "",
    handle: account.handle || "",
    url: account.url || "",
    followers: asNumber(account.followers, 0),
    impressions: asNumber(account.impressions, 0),
    engagement: asNumber(account.engagement, 0),
    verified: account.verified === true,
  };
  const { data, error } = await auth.supabase
    .from("social_accounts")
    .upsert(payload, { onConflict: "user_id,platform" })
    .select(SOCIAL_COLUMNS)
    .single();
  if (error) return { error: error.message };
  return { account: rowToSocialAccount(data as SocialAccountRow) };
}

export async function deleteSocialAccount(id: string): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to remove this social account." };
  const { error } = await auth.supabase
    .from("social_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) return { error: error.message };
  return {};
}

export async function syncMySocialAccounts(
  profile: Profile,
): Promise<{ accounts: SocialAccount[]; error?: string; skipped?: boolean }> {
  const existing = await listMySocialAccounts();
  if (existing.error || existing.skipped) return existing;
  const wanted = new Set(profile.platforms || []);
  const byPlatform = new Map(existing.accounts.map((account) => [account.platform, account]));
  for (const platform of profile.platforms || []) {
    const current = byPlatform.get(platform);
    const result = await upsertSocialAccount({
      platform,
      handle: profile.handle || current?.handle || "",
      url: current?.url || "",
      followers: asNumber(profile.followers, current?.followers || 0),
      impressions: asNumber(profile.impressions, current?.impressions || 0),
      engagement: current?.engagement || 0,
      verified: current?.verified === true,
    });
    if (result.error) return { accounts: [], error: result.error };
  }
  for (const account of existing.accounts) {
    if (wanted.has(account.platform)) continue;
    const result = await deleteSocialAccount(account.id);
    if (result.error) return { accounts: [], error: result.error };
  }
  return listMySocialAccounts();
}

async function currentBrandHasCampaign(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ allowed: boolean; error?: string }> {
  const { count, error } = await supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) return { allowed: false, error: publicErrorMessage(error, "Could not load campaigns.") };
  return { allowed: (count || 0) > 0 };
}

export async function listPublicCreatorSocialAccounts(userIds?: string[]): Promise<{
  accountsByUser: Record<string, SocialAccount[]>;
  error?: string;
  skipped?: boolean;
}> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { accountsByUser: {}, error: auth.error };
  if (auth.skipped || !auth.supabase || !auth.user) return { accountsByUser: {}, skipped: true };
  const eligible = await currentBrandHasCampaign(auth.supabase, auth.user.id);
  if (eligible.error) return { accountsByUser: {}, error: eligible.error };
  if (!eligible.allowed) return { accountsByUser: {} };
  if (userIds && !userIds.length) return { accountsByUser: {} };
  let query = auth.supabase.from("social_accounts").select(SOCIAL_COLUMNS);
  if (userIds?.length) query = query.in("user_id", userIds);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) return { accountsByUser: {}, error: error.message };
  const accountsByUser: Record<string, SocialAccount[]> = {};
  for (const row of (data as SocialAccountRow[] | null) || []) {
    const list = accountsByUser[row.user_id] || (accountsByUser[row.user_id] = []);
    list.push(rowToSocialAccount(row));
  }
  return { accountsByUser };
}

function publicRowToCreator(row: PublicCreatorRow, socials: SocialAccount[]): Creator {
  const platforms = asStringArray(row.platforms);
  const socialPlatforms = socials.map((account) => account.platform).filter(Boolean);
  const allPlatforms = platforms.length ? platforms : socialPlatforms;
  const name = row.name || "";
  const socialFollowers = socials.reduce((max, account) => Math.max(max, account.followers), 0);
  const socialImpressions = socials.reduce((max, account) => Math.max(max, account.impressions), 0);
  return {
    id: row.user_id,
    name,
    handle: row.handle || socials[0]?.handle || "",
    initials: initialsFromName(name),
    bio: row.bio || "",
    niche: row.niche || "",
    platform: allPlatforms[0] || "",
    followers: asNumber(row.followers, 0) || socialFollowers,
    impressions: asNumber(row.impressions, 0) || socialImpressions,
    rate: asNumber(row.rate, 0),
    rating: 0,
    reviews: 0,
    available: row.available !== false,
    color: colorFromId(row.user_id),
    location: row.location || "",
    engagement: Number(
      socials.reduce((max, account) => Math.max(max, account.engagement), 0).toFixed(1),
    ),
    avatar: row.avatar || undefined,
    platforms: allPlatforms,
    website: row.website || "",
    portfolio: asStringArray(row.portfolio),
  };
}

export async function listPublicCreators(): Promise<{
  creators: Creator[];
  error?: string;
  skipped?: boolean;
  gated?: boolean;
}> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { creators: [], error: publicErrorMessage(auth.error, "Could not load creators.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { creators: [], skipped: true };
  const eligible = await currentBrandHasCampaign(auth.supabase, auth.user.id);
  if (eligible.error) return { creators: [], error: eligible.error };
  if (!eligible.allowed) return { creators: [], gated: true };
  const { data, error } = await auth.supabase
    .from("public_creators")
    .select(
      "user_id, role, name, bio, handle, website, niche, platforms, followers, impressions, rate, location, available, avatar, portfolio, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) return { creators: [], error: publicErrorMessage(error, "Could not load creators.") };
  const rows = ((data as PublicCreatorRow[] | null) ?? []).filter((row) => isCreatorUserId(row.user_id));
  const social = await listPublicCreatorSocialAccounts(rows.map((row) => row.user_id));
  if (social.error) return { creators: [], error: social.error };
  return {
    creators: rows.map((row) => publicRowToCreator(row, social.accountsByUser[row.user_id] || [])).filter((creator) => isCreatorUserId(creator.id)),
  };
}

function isMissingRelation(error: unknown) {
  const raw = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as { message?: string }).message || "") : "";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
  const msg = raw.toLowerCase();
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find the function");
}

function publicErrorMessage(error: unknown, fallback: string) {
  const raw = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as { message?: string }).message || "") : "";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
  const msg = raw.toLowerCase();
  if (msg.includes("already registered as a brand") || msg.includes("already registered as a creator")) {
    const copy = roleConflictNotice(msg.includes("brand account") || msg.includes("as a brand") ? "brand" : "creator");
    return `${copy.title} ${copy.body}`;
  }
  if (msg.includes("brand to brand")) return "Brand to Brand connections are not allowed.";
  if (msg.includes("creator to creator")) return "Creator to Creator connections are not allowed.";
  if (msg.includes("must be between a brand and a creator")) return "Connections must be between a Brand and a Creator.";
  if (msg.includes("already have a pending") || msg.includes("already connected")) {
    return msg.includes("connected")
      ? "You’re already connected with this creator on this campaign."
      : "You already have a pending request with this creator.";
  }
  if (code === "23505" || msg.includes("duplicate") || msg.includes("unique") || msg.includes("already applied")) {
    return "You already applied to this campaign.";
  }
  if (msg.includes("choose a creator") || msg.includes("creator not found")) return "Choose a creator to connect with.";
  if (msg.includes("write a short message")) return "Please write a short message before sending.";
  if (msg.includes("valid proposed rate")) return "Enter a valid proposed rate.";
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission") || msg.includes("not allowed")) {
    return "You don’t have permission to do that.";
  }
  if (msg.includes("jwt") || msg.includes("not authenticated") || msg.includes("session expired") || msg.includes("invalid claim")) {
    return "Your session expired. Please sign in again.";
  }
  if (msg.includes("not pending")) return "This application is no longer pending.";
  if (msg.includes("application not found")) return "That application is no longer available.";
  if (msg.includes("connection not found")) return "That collaboration is no longer available.";
  if (msg.includes("invalid message") || (msg.includes("check constraint") && msg.includes("body"))) return "Please write a short message before sending.";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch")) return "Connection issue. Please try again.";
  if (msg.includes("expired") || msg.includes("not open") || msg.includes("open for applications")) {
    return "This campaign is no longer open for applications.";
  }
  if (msg.includes("violates foreign key") || msg.includes("restrict") || msg.includes("still referenced")) {
    return "This campaign has collaboration history and can’t be deleted.";
  }
  if (
    msg.includes("deal not found") ||
    msg.includes("cannot be submitted") ||
    msg.includes("revisions can only") ||
    msg.includes("only submitted work") ||
    msg.includes("no longer be cancelled") ||
    msg.includes("no longer be changed") ||
    msg.includes("delivery link") ||
    msg.includes("submission note") ||
    msg.includes("revision you need") ||
    msg.includes("cancellation note") ||
    msg.includes("only collabcy") ||
    msg.includes("brand verification first") ||
    msg.includes("verified by the brand") ||
    msg.includes("open dispute") ||
    msg.includes("disputed collaboration") ||
    msg.includes("dispute resolution") ||
    msg.includes("platform review") ||
    msg.includes("verification note")
  ) {
    return raw.replace(/^.*:\s*/, "") || fallback;
  }
  return fallback;
}

const APPLICATION_COLUMNS =
  "id, campaign_id, creator_id, creator_name, creator_avatar, creator_handle, creator_rate, creator_niche, creator_followers, creator_impressions, campaign_title, campaign_brand, campaign_color, message, proposed_rate, status, initiated_by, created_at";

const CONNECTION_COLUMNS = "id, campaign_id, application_id, brand_id, creator_id, status, created_at";

type ApplicationRow = {
  id: string;
  campaign_id: string;
  creator_id: string;
  creator_name: string;
  creator_avatar: string | null;
  creator_handle: string;
  creator_rate: number | null;
  creator_niche: string;
  creator_followers: number | null;
  creator_impressions: number | null;
  campaign_title: string;
  campaign_brand: string;
  campaign_color: string;
  message: string;
  proposed_rate: number | null;
  status: string;
  initiated_by?: string | null;
  created_at: string;
};

type ConnectionRow = {
  id: string;
  campaign_id: string;
  application_id: string | null;
  brand_id: string;
  creator_id: string;
  status: string;
  created_at: string;
  campaigns?: { title?: string; brand_name?: string; color?: string } | { title?: string; brand_name?: string; color?: string }[] | null;
  campaign_applications?: {
    creator_name?: string;
    creator_handle?: string;
    creator_avatar?: string | null;
    proposed_rate?: number | null;
    message?: string;
    campaign_title?: string;
    campaign_brand?: string;
    campaign_color?: string;
  } | {
    creator_name?: string;
    creator_handle?: string;
    creator_avatar?: string | null;
    proposed_rate?: number | null;
    message?: string;
    campaign_title?: string;
    campaign_brand?: string;
    campaign_color?: string;
  }[] | null;
};

function asApplicationStatus(value: unknown): ApplicationStatus {
  return value === "accepted" || value === "rejected" || value === "withdrawn" ? value : "pending";
}

function asApplicationInitiatedBy(value: unknown): "creator" | "brand" {
  return value === "brand" ? "brand" : "creator";
}

function asConnectionStatus(value: unknown): ConnectionStatus {
  return value === "closed" ? "closed" : "active";
}

function oneEmbed<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function rowToApplication(row: ApplicationRow): CampaignApplication {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title || "",
    campaignBrand: row.campaign_brand || "",
    campaignColor: row.campaign_color || "#e8edff",
    creatorId: row.creator_id,
    creatorName: row.creator_name || "",
    creatorAvatar: row.creator_avatar || undefined,
    creatorHandle: row.creator_handle || "",
    creatorRate: asNumber(row.creator_rate, 0),
    creatorNiche: row.creator_niche || "",
    creatorFollowers: asNumber(row.creator_followers, 0),
    creatorImpressions: asNumber(row.creator_impressions, 0),
    message: row.message || "",
    proposedRate: asNumber(row.proposed_rate, 0),
    status: asApplicationStatus(row.status),
    initiatedBy: asApplicationInitiatedBy(row.initiated_by),
    created: Date.parse(row.created_at) || Date.now(),
  };
}

function rowToConnection(row: ConnectionRow): Connection {
  const campaign = oneEmbed(row.campaigns);
  const application = oneEmbed(row.campaign_applications);
  return {
    id: row.id,
    campaignId: row.campaign_id,
    applicationId: row.application_id || undefined,
    brandId: row.brand_id,
    creatorId: row.creator_id,
    status: asConnectionStatus(row.status),
    created: Date.parse(row.created_at) || Date.now(),
    campaignTitle: campaign?.title || application?.campaign_title || "",
    campaignBrand: campaign?.brand_name || application?.campaign_brand || "",
    campaignColor: campaign?.color || application?.campaign_color || "#e8edff",
    partnerName: application?.creator_name || "",
    partnerHandle: application?.creator_handle || "",
    partnerAvatar: application?.creator_avatar || undefined,
    proposedRate: asNumber(application?.proposed_rate, 0),
    message: application?.message || "",
  };
}

export async function listMyApplications(): Promise<{
  applications: CampaignApplication[];
  error?: string;
  skipped?: boolean;
}> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { applications: [], error: publicErrorMessage(auth.error, "Could not load applications.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { applications: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("campaign_applications")
    .select(APPLICATION_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) return { applications: [], error: publicErrorMessage(error, "Could not load applications.") };
  return { applications: (data as ApplicationRow[] | null)?.map(rowToApplication) ?? [] };
}

export async function listCampaignApplications(
  campaignId: string,
): Promise<{ applications: CampaignApplication[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { applications: [], error: publicErrorMessage(auth.error, "Could not load applications.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { applications: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("campaign_applications")
    .select(APPLICATION_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) return { applications: [], error: publicErrorMessage(error, "Could not load applications.") };
  return { applications: (data as ApplicationRow[] | null)?.map(rowToApplication) ?? [] };
}

export async function createCampaignApplication(input: {
  campaign: Campaign;
  profile: Profile;
  message: string;
  proposedRate: number;
}): Promise<{ application?: CampaignApplication; error?: string }> {
  if (input.campaign.status !== "active" || input.campaign.expires <= Date.now()) {
    return { error: "This campaign is no longer open for applications." };
  }
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not send your application.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to apply to this campaign." };
  const { data, error } = await auth.supabase
    .from("campaign_applications")
    .insert({
      campaign_id: input.campaign.id,
      creator_id: auth.user.id,
      creator_name: input.profile.name || "",
      creator_avatar: input.profile.avatar || null,
      creator_handle: input.profile.handle || "",
      creator_rate: asNumber(input.profile.rate, 0),
      creator_niche: input.profile.niche || "",
      creator_followers: asNumber(input.profile.followers, 0),
      creator_impressions: asNumber(input.profile.impressions, 0),
      campaign_title: input.campaign.title || "",
      campaign_brand: input.campaign.brand || "",
      campaign_color: input.campaign.color || "#e8edff",
      message: input.message.trim(),
      proposed_rate: asNumber(input.proposedRate, 0),
      status: "pending",
      initiated_by: "creator",
    })
    .select(APPLICATION_COLUMNS)
    .single();
  if (error) return { error: publicErrorMessage(error, "Could not send your application.") };
  return { application: rowToApplication(data as ApplicationRow) };
}

export async function inviteCreatorToCampaign(input: {
  campaignId: string;
  creatorId: string;
  message: string;
  proposedRate: number;
}): Promise<{ application?: CampaignApplication; error?: string }> {
  if (!isCreatorUserId(input.creatorId)) return { error: "Choose a creator to connect with." };
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not send this request.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to connect with this creator." };
  const { data, error } = await auth.supabase.rpc("invite_creator_to_campaign", {
    p_campaign_id: input.campaignId,
    p_creator_id: input.creatorId,
    p_message: input.message.trim(),
    p_proposed_rate: asNumber(input.proposedRate, 0),
  });
  if (error) return { error: publicErrorMessage(error, "Could not send this request.") };
  if (!data) return { error: "Could not send this request." };
  return { application: rowToApplication(data as ApplicationRow) };
}

export async function withdrawCampaignApplication(id: string): Promise<{ application?: CampaignApplication; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not withdraw this application.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to withdraw this application." };
  const { data, error } = await auth.supabase
    .from("campaign_applications")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .eq("status", "pending")
    .select(APPLICATION_COLUMNS)
    .maybeSingle();
  if (error) return { error: publicErrorMessage(error, "Could not withdraw this application.") };
  if (!data) return { error: "Only a pending application can be withdrawn." };
  return { application: rowToApplication(data as ApplicationRow) };
}

export async function updateApplicationStatus(
  applicationId: string,
  status: Exclude<ApplicationStatus, "pending">,
): Promise<{ application?: CampaignApplication; connection?: Connection; error?: string }> {
  if (status === "accepted") return acceptCampaignApplication(applicationId);
  if (status === "withdrawn") return withdrawCampaignApplication(applicationId);
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not update this application.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to update this application." };
  const { data, error } = await auth.supabase
    .from("campaign_applications")
    .update({ status: "rejected" })
    .eq("id", applicationId)
    .eq("status", "pending")
    .select(APPLICATION_COLUMNS)
    .maybeSingle();
  if (error) return { error: publicErrorMessage(error, "Could not update this application.") };
  if (!data) return { error: "This application could not be updated." };
  return { application: rowToApplication(data as ApplicationRow) };
}

export async function acceptCampaignApplication(
  applicationId: string,
): Promise<{ application?: CampaignApplication; connection?: Connection; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not accept this application.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to accept this application." };
  const { error } = await auth.supabase.rpc("accept_campaign_application", { application_id: applicationId });
  if (error) return { error: publicErrorMessage(error, "Could not accept this application.") };
  const [apps, conns] = await Promise.all([listMyApplications(), listMyConnections()]);
  if (apps.error) return { error: apps.error };
  if (conns.error) return { error: conns.error };
  return {
    application: apps.applications.find((item) => item.id === applicationId),
    connection: conns.connections.find((item) => item.applicationId === applicationId),
  };
}

export async function listMyConnections(): Promise<{
  connections: Connection[];
  error?: string;
  skipped?: boolean;
}> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { connections: [], error: publicErrorMessage(auth.error, "Could not load collaborations.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { connections: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("connections")
    .select(
      `${CONNECTION_COLUMNS}, campaigns ( title, brand_name, color ), campaign_applications ( creator_name, creator_handle, creator_avatar, proposed_rate, message, campaign_title, campaign_brand, campaign_color )`,
    )
    .order("created_at", { ascending: false });
  if (error) return { connections: [], error: publicErrorMessage(error, "Could not load collaborations.") };
  return { connections: (data as ConnectionRow[] | null)?.map(rowToConnection) ?? [] };
}

export async function createConnection(input: {
  campaignId: string;
  applicationId?: string;
  creatorId: string;
}): Promise<{ connection?: Connection; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not create this connection.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to create this connection." };
  const { data, error } = await auth.supabase
    .from("connections")
    .upsert(
      {
        campaign_id: input.campaignId,
        application_id: input.applicationId || null,
        brand_id: auth.user.id,
        creator_id: input.creatorId,
        status: "active",
      },
      { onConflict: "campaign_id,creator_id", ignoreDuplicates: true },
    )
    .select(
      `${CONNECTION_COLUMNS}, campaigns ( title, brand_name, color ), campaign_applications ( creator_name, creator_handle, creator_avatar, proposed_rate, message, campaign_title, campaign_brand, campaign_color )`,
    )
    .maybeSingle();
  if (error) return { error: publicErrorMessage(error, "Could not create this connection.") };
  if (data) return { connection: rowToConnection(data as ConnectionRow) };
  const existing = await listMyConnections();
  if (existing.error) return { error: existing.error };
  return {
    connection: existing.connections.find(
      (item) => item.campaignId === input.campaignId && item.creatorId === input.creatorId,
    ),
  };
}

export async function closeConnection(id: string): Promise<{ connection?: Connection; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not close this collaboration.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to close this collaboration." };
  const { data, error } = await auth.supabase
    .from("connections")
    .update({ status: "closed" })
    .eq("id", id)
    .select(
      `${CONNECTION_COLUMNS}, campaigns ( title, brand_name, color ), campaign_applications ( creator_name, creator_handle, creator_avatar, proposed_rate, message, campaign_title, campaign_brand, campaign_color )`,
    )
    .maybeSingle();
  if (error) return { error: publicErrorMessage(error, "Could not close this collaboration.") };
  if (!data) return { error: "This collaboration could not be updated." };
  return { connection: rowToConnection(data as ConnectionRow) };
}

const DEAL_COLUMNS =
  "id, connection_id, campaign_id, creator_id, brand_id, status, deliverable, requirements, agreed_budget, deadline, creator_note, brand_note, submission_url, submission_note, revision_note, created_at, updated_at, started_at, submitted_at, completed_at, cancelled_at, brand_verified_at, brand_verified_by, brand_verification_note, platform_verified_at, platform_verified_by, platform_verification_note, revision_requested_by, revision_requested_at";

type DealRow = {
  id: string;
  connection_id: string;
  campaign_id: string;
  creator_id: string;
  brand_id: string;
  status: string;
  deliverable: string | null;
  requirements: string | null;
  agreed_budget: number | null;
  deadline: string | null;
  creator_note: string | null;
  brand_note: string | null;
  submission_url: string | null;
  submission_note: string | null;
  revision_note: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  brand_verified_at?: string | null;
  brand_verified_by?: string | null;
  brand_verification_note?: string | null;
  platform_verified_at?: string | null;
  platform_verified_by?: string | null;
  platform_verification_note?: string | null;
  revision_requested_by?: string | null;
  revision_requested_at?: string | null;
};

function parseStamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowToDeal(row: DealRow): CollaborationDeal {
  return {
    id: row.id,
    connectionId: row.connection_id,
    campaignId: row.campaign_id,
    creatorId: row.creator_id,
    brandId: row.brand_id,
    status: isDealStatus(row.status) ? row.status : "active",
    deliverable: row.deliverable || "",
    requirements: row.requirements || "",
    agreedBudget: Math.max(0, Number(row.agreed_budget) || 0),
    deadline: row.deadline || "",
    creatorNote: row.creator_note || "",
    brandNote: row.brand_note || "",
    submissionUrl: row.submission_url || "",
    submissionNote: row.submission_note || "",
    revisionNote: row.revision_note || "",
    createdAt: parseStamp(row.created_at),
    updatedAt: parseStamp(row.updated_at),
    startedAt: parseStamp(row.started_at),
    submittedAt: parseStamp(row.submitted_at),
    completedAt: parseStamp(row.completed_at),
    cancelledAt: parseStamp(row.cancelled_at),
    brandVerifiedAt: parseStamp(row.brand_verified_at),
    brandVerifiedBy: row.brand_verified_by || "",
    brandVerificationNote: row.brand_verification_note || "",
    platformVerifiedAt: parseStamp(row.platform_verified_at),
    platformVerifiedBy: row.platform_verified_by || "",
    platformVerificationNote: row.platform_verification_note || "",
    revisionRequestedBy: row.revision_requested_by || "",
    revisionRequestedAt: parseStamp(row.revision_requested_at),
  };
}

function jsonToDeal(value: unknown): CollaborationDeal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.connection_id !== "string") return undefined;
  return rowToDeal({
    id: row.id,
    connection_id: row.connection_id,
    campaign_id: String(row.campaign_id || ""),
    creator_id: String(row.creator_id || ""),
    brand_id: String(row.brand_id || ""),
    status: String(row.status || "active"),
    deliverable: typeof row.deliverable === "string" ? row.deliverable : "",
    requirements: typeof row.requirements === "string" ? row.requirements : "",
    agreed_budget: typeof row.agreed_budget === "number" ? row.agreed_budget : 0,
    deadline: typeof row.deadline === "string" ? row.deadline : null,
    creator_note: typeof row.creator_note === "string" ? row.creator_note : "",
    brand_note: typeof row.brand_note === "string" ? row.brand_note : "",
    submission_url: typeof row.submission_url === "string" ? row.submission_url : "",
    submission_note: typeof row.submission_note === "string" ? row.submission_note : "",
    revision_note: typeof row.revision_note === "string" ? row.revision_note : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    submitted_at: typeof row.submitted_at === "string" ? row.submitted_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    cancelled_at: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    brand_verified_at: typeof row.brand_verified_at === "string" ? row.brand_verified_at : null,
    brand_verified_by: typeof row.brand_verified_by === "string" ? row.brand_verified_by : null,
    brand_verification_note: typeof row.brand_verification_note === "string" ? row.brand_verification_note : "",
    platform_verified_at: typeof row.platform_verified_at === "string" ? row.platform_verified_at : null,
    platform_verified_by: typeof row.platform_verified_by === "string" ? row.platform_verified_by : null,
    platform_verification_note: typeof row.platform_verification_note === "string" ? row.platform_verification_note : "",
    revision_requested_by: typeof row.revision_requested_by === "string" ? row.revision_requested_by : null,
    revision_requested_at: typeof row.revision_requested_at === "string" ? row.revision_requested_at : null,
  });
}

export async function ensureMyDeals(): Promise<{ error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not prepare collaborations.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { skipped: true };
  const { error } = await auth.supabase.rpc("ensure_my_deals");
  if (error && isMissingRelation(error)) return { skipped: true };
  if (error) return { error: publicErrorMessage(error, "Could not prepare collaborations.") };
  return {};
}

export async function listMyDeals(): Promise<{ deals: CollaborationDeal[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { deals: [], error: publicErrorMessage(auth.error, "Could not load collaborations.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { deals: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .or(`brand_id.eq.${auth.user.id},creator_id.eq.${auth.user.id}`)
    .order("updated_at", { ascending: false });
  if (error && isMissingRelation(error)) return { deals: [], skipped: true };
  if (error) return { deals: [], error: publicErrorMessage(error, "Could not load collaborations.") };
  return { deals: (data as DealRow[] | null)?.map(rowToDeal) ?? [] };
}

async function callDealRpc(
  name:
    | "submit_deal"
    | "request_deal_revision"
    | "complete_deal"
    | "cancel_deal"
    | "verify_deal_brand"
    | "verify_deal_platform"
    | "request_platform_revision"
    | "open_deal_dispute"
    | "mark_deal_disputed"
    | "resolve_deal_dispute"
    | "record_admin_internal_note",
  args: Record<string, unknown>,
  fallback: string,
): Promise<{ deal?: CollaborationDeal; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, fallback) };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to update this collaboration." };
  const { data, error } = await auth.supabase.rpc(name, args);
  if (error) return { error: publicErrorMessage(error, fallback) };
  const deal = jsonToDeal(data);
  if (!deal) return { error: fallback };
  return { deal };
}

export function submitDeal(dealId: string, note: string, url: string) {
  return callDealRpc("submit_deal", { p_deal_id: dealId, p_note: note, p_url: url }, "Could not submit this work.");
}

export function requestDealRevision(dealId: string, note: string) {
  return callDealRpc("request_deal_revision", { p_deal_id: dealId, p_note: note }, "Could not request a revision.");
}

export function verifyDealBrand(dealId: string, note = "") {
  return callDealRpc("verify_deal_brand", { p_deal_id: dealId, p_note: note }, "Could not verify this submission.");
}

export function verifyDealPlatform(dealId: string, note = "") {
  return callDealRpc("verify_deal_platform", { p_deal_id: dealId, p_note: note }, "Could not record this platform decision.");
}

export function requestPlatformRevision(dealId: string, note: string) {
  return callDealRpc("request_platform_revision", { p_deal_id: dealId, p_note: note }, "Could not request a revision.");
}

export function openDealDispute(dealId: string, reason: string) {
  return callDealRpc("open_deal_dispute", { p_deal_id: dealId, p_reason: reason }, "Could not open this dispute.");
}

export function markDealDisputed(dealId: string, reason: string) {
  return callDealRpc("mark_deal_disputed", { p_deal_id: dealId, p_reason: reason }, "Could not mark this dispute.");
}

export function resolveDealDispute(dealId: string, outcome: "completed" | "revision_requested" | "dismissed", note: string) {
  return callDealRpc(
    "resolve_deal_dispute",
    { p_deal_id: dealId, p_outcome: outcome, p_note: note },
    "Could not resolve this dispute.",
  );
}

export function recordAdminInternalNote(dealId: string, note: string) {
  return callDealRpc("record_admin_internal_note", { p_deal_id: dealId, p_note: note }, "Could not save this internal note.");
}

export function cancelDeal(dealId: string, note = "") {
  return callDealRpc("cancel_deal", { p_deal_id: dealId, p_note: note }, "Could not cancel this collaboration.");
}

export async function isPlatformVerifier(): Promise<{ verifier: boolean; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { verifier: false, error: publicErrorMessage(auth.error, "Could not check verification access.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { verifier: false, skipped: true };
  const { data, error } = await auth.supabase.rpc("is_platform_verifier", { p_user_id: auth.user.id });
  if (error && isMissingRelation(error)) return { verifier: false, skipped: true };
  if (error) return { verifier: false, error: publicErrorMessage(error, "Could not check verification access.") };
  return { verifier: data === true };
}

export type VerificationQueueItem = {
  deal: CollaborationDeal;
  campaignTitle: string;
  campaignBrand: string;
  campaignColor: string;
  creatorName: string;
  creatorHandle: string;
  brandName: string;
  disputeId?: string;
  disputeStatus?: string;
  disputeReason?: string;
  disputeOpenedAt?: number;
  conversationId?: string;
};

export async function listVerificationQueue(
  filter: "needs" | "disputed" | "completed" = "needs",
): Promise<{ items: VerificationQueueItem[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { items: [], error: publicErrorMessage(auth.error, "Could not load the verification queue.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { items: [], skipped: true };
  const { data, error } = await auth.supabase.rpc("list_verification_queue", { p_filter: filter });
  if (error && isMissingRelation(error)) return { items: [], skipped: true };
  if (error) return { items: [], error: publicErrorMessage(error, "Could not load the verification queue.") };
  const rows = Array.isArray(data) ? data : [];
  const items: VerificationQueueItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const deal = jsonToDeal(record.deal);
    if (!deal) continue;
    items.push({
      deal,
      campaignTitle: typeof record.campaign_title === "string" ? record.campaign_title : "Collaboration",
      campaignBrand: typeof record.campaign_brand === "string" ? record.campaign_brand : "Brand",
      campaignColor: typeof record.campaign_color === "string" ? record.campaign_color : "#e8edff",
      creatorName: typeof record.creator_name === "string" ? record.creator_name : "Creator",
      creatorHandle: typeof record.creator_handle === "string" ? record.creator_handle : "",
      brandName: typeof record.brand_name === "string" ? record.brand_name : "Brand",
      disputeId: typeof record.dispute_id === "string" ? record.dispute_id : undefined,
      disputeStatus: typeof record.dispute_status === "string" ? record.dispute_status : undefined,
      disputeReason: typeof record.dispute_reason === "string" ? record.dispute_reason : undefined,
      disputeOpenedAt: typeof record.dispute_opened_at === "string" ? parseStamp(record.dispute_opened_at) : undefined,
      conversationId: typeof record.conversation_id === "string" ? record.conversation_id : undefined,
    });
  }
  return { items };
}

export type AdminOverview = {
  pendingReviews: number;
  openDisputes: number;
  activeCollaborations: number;
  completedCollaborations: number;
  recentlyCompleted: number;
  recentEscalations: number;
};

export async function listAdminOverview(): Promise<{ overview?: AdminOverview; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not load admin overview.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { skipped: true };
  const { data, error } = await auth.supabase.rpc("list_admin_overview");
  if (error && isMissingRelation(error)) return { skipped: true };
  if (error) return { error: publicErrorMessage(error, "Could not load admin overview.") };
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const num = (key: string) => (typeof row[key] === "number" ? row[key] as number : Number(row[key]) || 0);
  return {
    overview: {
      pendingReviews: num("pending_reviews"),
      openDisputes: num("open_disputes"),
      activeCollaborations: num("active_collaborations"),
      completedCollaborations: num("completed_collaborations"),
      recentlyCompleted: num("recently_completed"),
      recentEscalations: num("recent_escalations"),
    },
  };
}

export type AdminActivityItem = {
  id: string;
  dealId: string;
  actorId: string;
  actorRole: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  note: string;
  visibility: string;
  createdAt: number;
  campaignTitle: string;
};

export async function listAdminActivity(): Promise<{ items: AdminActivityItem[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { items: [], error: publicErrorMessage(auth.error, "Could not load the audit log.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { items: [], skipped: true };
  const { data, error } = await auth.supabase.rpc("list_admin_activity");
  if (error && isMissingRelation(error)) return { items: [], skipped: true };
  if (error) return { items: [], error: publicErrorMessage(error, "Could not load the audit log.") };
  const rows = Array.isArray(data) ? data : [];
  const items: AdminActivityItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.deal_id !== "string") continue;
    items.push({
      id: record.id,
      dealId: record.deal_id,
      actorId: typeof record.actor_id === "string" ? record.actor_id : "",
      actorRole: typeof record.actor_role === "string" ? record.actor_role : "",
      action: typeof record.action === "string" ? record.action : "",
      fromStatus: typeof record.from_status === "string" ? record.from_status : "",
      toStatus: typeof record.to_status === "string" ? record.to_status : "",
      note: typeof record.note === "string" ? record.note : "",
      visibility: typeof record.visibility === "string" ? record.visibility : "public",
      createdAt: typeof record.created_at === "string" ? parseStamp(record.created_at) : 0,
      campaignTitle: typeof record.campaign_title === "string" ? record.campaign_title : "Collaboration",
    });
  }
  return { items };
}

export type AdminConversation = {
  id: string;
  connectionId: string;
  campaignId: string;
  brandId: string;
  creatorId: string;
  campaignTitle: string;
  campaignBrand: string;
  campaignColor: string;
  creatorName: string;
  brandName: string;
  lastMessage?: string;
  lastMessageAt?: number;
  dealId?: string;
  dealStatus?: string;
  agreedBudget?: number;
};

export async function listAdminConversations(): Promise<{ conversations: AdminConversation[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { conversations: [], error: publicErrorMessage(auth.error, "Could not load conversations.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { conversations: [], skipped: true };
  const { data, error } = await auth.supabase.rpc("list_admin_conversations");
  if (error && isMissingRelation(error)) return { conversations: [], skipped: true };
  if (error) return { conversations: [], error: publicErrorMessage(error, "Could not load conversations.") };
  const rows = Array.isArray(data) ? data : [];
  const conversations: AdminConversation[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    conversations.push({
      id: record.id,
      connectionId: typeof record.connection_id === "string" ? record.connection_id : "",
      campaignId: typeof record.campaign_id === "string" ? record.campaign_id : "",
      brandId: typeof record.brand_id === "string" ? record.brand_id : "",
      creatorId: typeof record.creator_id === "string" ? record.creator_id : "",
      campaignTitle: typeof record.campaign_title === "string" ? record.campaign_title : "Collaboration",
      campaignBrand: typeof record.campaign_brand === "string" ? record.campaign_brand : "Brand",
      campaignColor: typeof record.campaign_color === "string" ? record.campaign_color : "#e8edff",
      creatorName: typeof record.creator_name === "string" ? record.creator_name : "Creator",
      brandName: typeof record.brand_name === "string" ? record.brand_name : "Brand",
      lastMessage: typeof record.last_message_body === "string" ? record.last_message_body : undefined,
      lastMessageAt: typeof record.last_message_at === "string" ? parseStamp(record.last_message_at) : undefined,
      dealId: typeof record.deal_id === "string" ? record.deal_id : undefined,
      dealStatus: typeof record.deal_status === "string" ? record.deal_status : undefined,
      agreedBudget: typeof record.agreed_budget === "number" ? record.agreed_budget : undefined,
    });
  }
  return { conversations };
}

export async function sendPlatformMessage(
  conversationId: string,
  body: string,
): Promise<{ message?: ChatMessage; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Please write a message before sending." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { error: "That message is too long." };
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not send this platform message.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to send a platform message." };
  const { data, error } = await auth.supabase.rpc("send_platform_message", {
    p_conversation_id: conversationId,
    p_body: trimmed,
  });
  if (error) return { error: publicErrorMessage(error, "Could not send this platform message.") };
  if (!data || typeof data !== "object") return { error: "Could not send this platform message." };
  const row = data as MessageRow;
  return { message: rowToChatMessage({ ...row, from_platform: true }, auth.user.id) };
}

export async function listDealEvents(dealId: string): Promise<{ events: DealVerificationEvent[]; error?: string; skipped?: boolean }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { events: [], error: publicErrorMessage(auth.error, "Could not load this timeline.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { events: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("deal_verification_events")
    .select("id, deal_id, actor_id, actor_role, action, from_status, to_status, note, visibility, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });
  if (error && isMissingRelation(error)) return { events: [], skipped: true };
  if (error) return { events: [], error: publicErrorMessage(error, "Could not load this timeline.") };
  const events: DealVerificationEvent[] = [];
  for (const row of (data as Record<string, unknown>[] | null) ?? []) {
    if (typeof row.id !== "string" || typeof row.deal_id !== "string") continue;
    events.push({
      id: row.id,
      dealId: row.deal_id,
      actorId: typeof row.actor_id === "string" ? row.actor_id : "",
      actorRole: row.actor_role === "brand" || row.actor_role === "platform" ? row.actor_role : "creator",
      action: typeof row.action === "string" ? row.action : "",
      fromStatus: typeof row.from_status === "string" ? row.from_status : "",
      toStatus: typeof row.to_status === "string" ? row.to_status : "",
      note: typeof row.note === "string" ? row.note : "",
      visibility: row.visibility === "admin" ? "admin" : "public",
      createdAt: typeof row.created_at === "string" ? parseStamp(row.created_at) : 0,
    });
  }
  return { events };
}

export function subscribeToMyDeals(userId: string, onChange: (deal: CollaborationDeal) => void): () => void {
  const supabase = getSupabase();
  if (!supabase || !userId) return () => {};
  const handle = (payload: { new?: unknown; old?: unknown }) => {
    const row = (payload.new || payload.old) as DealRow | undefined;
    if (!row?.id) return;
    onChange(rowToDeal(row));
  };
  const channel = supabase
    .channel(`deals:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `brand_id=eq.${userId}` }, handle)
    .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `creator_id=eq.${userId}` }, handle)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function hydrateMarketplace(state: State): Promise<State> {
  if (!state.session || !state.remoteWorkspace) {
    return {
      ...state,
      applications: state.applications || [],
      connections: state.connections || [],
      conversations: state.conversations || [],
      workspaceDeals: [],
      platformVerifier: false,
    };
  }
  await ensureMyDeals();
  const [apps, conns, convos, notes, dealRows, verifier] = await Promise.all([
    listMyApplications(),
    listMyConnections(),
    listMyConversations(),
    listMyNotifications(),
    listMyDeals(),
    isPlatformVerifier(),
  ]);
  if (apps.skipped && conns.skipped) return { ...state, workspaceDeals: [], platformVerifier: false };
  if (apps.error || conns.error) {
    toast.error(apps.error || conns.error || "Could not load collaborations.");
    return state;
  }
  const applications = apps.applications;
  const connections = conns.connections.map((connection) => ({
    ...connection,
    conversationId: (convos.skipped || convos.error ? state.conversations : convos.conversations).find(
      (item) => item.connectionId === connection.id,
    )?.id,
  }));
  const campaigns =
    state.role === "brand"
      ? state.campaigns.map((campaign) => ({
          ...campaign,
          applications: applications.filter((item) => item.campaignId === campaign.id).length,
        }))
      : state.campaigns;
  const next: State = { ...state, applications, connections, campaigns, workspaceDeals: [], platformVerifier: verifier.skipped || verifier.error ? false : verifier.verifier };
  if (!convos.skipped && !convos.error) next.conversations = convos.conversations;
  if (!notes.skipped && !notes.error) next.notifications = notes.notifications;
  if (!dealRows.skipped && !dealRows.error) next.workspaceDeals = dealRows.deals;
  if (state.role === "brand") {
    if (brandCanBrowseCreators(state.role, state.campaigns)) {
      const directory = await listPublicCreators();
      if (directory.error) toast.error(directory.error);
      next.directoryCreators = directory.error || directory.gated || directory.skipped ? [] : realDirectoryCreators(directory.creators);
    } else {
      next.directoryCreators = [];
    }
  }
  return next;
}

export const MAX_MESSAGE_LENGTH = 3000;

const CONVERSATION_COLUMNS =
  "id, connection_id, brand_id, creator_id, campaign_id, campaign_title, campaign_brand, campaign_color, creator_name, creator_handle, creator_avatar, brand_name, last_message_at, last_message_body, last_message_sender_id, created_at";

const MESSAGE_COLUMNS = "id, conversation_id, sender_id, body, from_platform, created_at, read_at";

const NOTIFICATION_COLUMNS =
  "id, user_id, type, title, body, conversation_id, connection_id, message_id, read, created_at";

type ConversationRow = {
  id: string;
  connection_id: string;
  brand_id: string;
  creator_id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_brand: string;
  campaign_color: string;
  creator_name: string;
  creator_handle: string;
  creator_avatar: string | null;
  brand_name: string;
  last_message_at: string | null;
  last_message_body: string;
  last_message_sender_id: string | null;
  created_at: string;
  connections?: { status?: string } | { status?: string }[] | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  from_platform?: boolean | null;
};

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  conversation_id: string | null;
  connection_id: string | null;
  message_id: string | null;
  read: boolean | null;
  created_at: string;
};

function asNotificationType(value: unknown): NotificationType | undefined {
  return value === "new_message" ||
    value === "application_received" ||
    value === "application_accepted" ||
    value === "application_rejected" ||
    value === "connection_created" ||
    value === "deal_submitted" ||
    value === "deal_revision_requested" ||
    value === "deal_completed" ||
    value === "deal_cancelled" ||
    value === "deal_brand_verified" ||
    value === "deal_platform_verified" ||
    value === "deal_platform_revision" ||
    value === "deal_needs_verification" ||
    value === "deal_disputed" ||
    value === "deal_dispute_resolved"
    ? value
    : undefined;
}

function formatMessageTime(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  if (Date.now() - t < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function rowToConversation(row: ConversationRow, userId: string, unreadCount = 0): Conversation {
  const mineIsBrand = userId === row.brand_id;
  const partnerName = mineIsBrand ? row.creator_name || "Creator" : row.brand_name || row.campaign_brand || "Brand";
  const connection = oneEmbed(row.connections);
  return {
    id: row.id,
    connectionId: row.connection_id,
    campaignId: row.campaign_id,
    brandId: row.brand_id,
    creatorId: row.creator_id,
    campaignTitle: row.campaign_title || "",
    campaignBrand: row.campaign_brand || row.brand_name || "",
    campaignColor: row.campaign_color || "#e8edff",
    partnerName,
    partnerHandle: mineIsBrand ? row.creator_handle || "" : "",
    partnerAvatar: mineIsBrand ? row.creator_avatar || undefined : undefined,
    lastMessage: row.last_message_body || undefined,
    lastMessageAt: row.last_message_at ? Date.parse(row.last_message_at) || undefined : undefined,
    lastMessageSenderId: row.last_message_sender_id || undefined,
    unreadCount,
    closed: connection?.status === "closed",
    created: Date.parse(row.created_at) || Date.now(),
  };
}

function rowToChatMessage(row: MessageRow, userId: string): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body || "",
    mine: row.sender_id === userId,
    time: formatMessageTime(row.created_at),
    created: Date.parse(row.created_at) || Date.now(),
    readAt: row.read_at ? Date.parse(row.read_at) || undefined : undefined,
    fromPlatform: row.from_platform === true,
  };
}

function rowToNotice(row: NotificationRow): Notice {
  return {
    id: row.id,
    title: row.title || "",
    body: row.body || "",
    read: row.read === true,
    date: row.created_at,
    type: asNotificationType(row.type),
    conversationId: row.conversation_id || undefined,
    connectionId: row.connection_id || undefined,
    messageId: row.message_id || undefined,
  };
}

async function unreadCountsByConversation(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
  conversationIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (!conversationIds.length) return counts;
  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", conversationIds)
    .is("read_at", null)
    .neq("sender_id", userId);
  if (error || !data) return counts;
  for (const row of data as { conversation_id: string }[]) {
    counts[row.conversation_id] = (counts[row.conversation_id] || 0) + 1;
  }
  return counts;
}

export async function listMyConversations(): Promise<{
  conversations: Conversation[];
  error?: string;
  skipped?: boolean;
}> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { conversations: [], error: publicErrorMessage(auth.error, "Could not load messages.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { conversations: [], skipped: true };
  const synced = await auth.supabase.rpc("sync_my_conversations");
  if (synced.error) {
    if (isMissingRelation(synced.error)) return { conversations: [], skipped: true };
    return { conversations: [], error: publicErrorMessage(synced.error, "Could not load messages.") };
  }
  const { data, error } = await auth.supabase
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, connections ( status )`)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) {
    if (isMissingRelation(error)) return { conversations: [], skipped: true };
    return { conversations: [], error: publicErrorMessage(error, "Could not load messages.") };
  }
  const rows = (data as ConversationRow[] | null) ?? [];
  const unread = await unreadCountsByConversation(
    auth.supabase,
    auth.user.id,
    rows.map((row) => row.id),
  );
  return {
    conversations: rows
      .filter((row) => isUuid(row.id) && isUuid(row.brand_id) && isUuid(row.creator_id))
      .map((row) => rowToConversation(row, auth.user!.id, unread[row.id] || 0)),
  };
}

export async function getConversation(
  conversationId: string,
): Promise<{ conversation?: Conversation; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not load this conversation.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to view this conversation." };
  const { data, error } = await auth.supabase
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, connections ( status )`)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) return { error: publicErrorMessage(error, "Could not load this conversation.") };
  if (!data) return { error: "This conversation isn’t available." };
  const unread = await unreadCountsByConversation(auth.supabase, auth.user.id, [conversationId]);
  return { conversation: rowToConversation(data as ConversationRow, auth.user.id, unread[conversationId] || 0) };
}

export async function ensureConversation(
  connectionId: string,
): Promise<{ conversation?: Conversation; error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not open this conversation.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to open this conversation." };
  const { data, error } = await auth.supabase.rpc("ensure_conversation", { target_connection_id: connectionId });
  if (error) return { error: publicErrorMessage(error, "Could not open this conversation.") };
  const conversationId = typeof data === "string" ? data : undefined;
  if (!conversationId) return { error: "Could not open this conversation." };
  return getConversation(conversationId);
}

export async function listMessages(
  conversationId: string,
): Promise<{ messages: ChatMessage[]; error?: string; skipped?: boolean }> {
  if (!isUuid(conversationId)) return { messages: [], error: "This conversation isn’t available." };
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { messages: [], error: publicErrorMessage(auth.error, "Could not load messages.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { messages: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error && /from_platform/i.test(error.message || "")) {
    const fallback = await auth.supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at, read_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (fallback.error) {
      if (isMissingRelation(fallback.error)) return { messages: [], skipped: true };
      return { messages: [], error: publicErrorMessage(fallback.error, "Could not load messages.") };
    }
    return { messages: (fallback.data as MessageRow[] | null)?.map((row) => rowToChatMessage(row, auth.user!.id)) ?? [] };
  }
  if (error) {
    if (isMissingRelation(error)) return { messages: [], skipped: true };
    return { messages: [], error: publicErrorMessage(error, "Could not load messages.") };
  }
  return { messages: (data as MessageRow[] | null)?.map((row) => rowToChatMessage(row, auth.user!.id)) ?? [] };
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<{ message?: ChatMessage; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Please write a message before sending." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { error: "That message is too long." };
  if (!isUuid(conversationId)) return { error: "This conversation isn’t available." };
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not send your message.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to send a message." };
  const { data, error } = await auth.supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: auth.user.id,
      body: trimmed,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) return { error: publicErrorMessage(error, "Could not send your message.") };
  return { message: rowToChatMessage(data as MessageRow, auth.user.id) };
}

export async function markMessageRead(messageId: string): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not update this message.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to update this message." };
  const { error } = await auth.supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .neq("sender_id", auth.user.id)
    .is("read_at", null);
  if (error) return { error: publicErrorMessage(error, "Could not update this message.") };
  return {};
}

export async function markConversationRead(conversationId: string): Promise<{ error?: string }> {
  if (!isUuid(conversationId)) return { error: "This conversation isn’t available." };
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not mark this conversation as read.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to mark this conversation as read." };
  const { error } = await auth.supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", auth.user.id)
    .is("read_at", null);
  if (error) return { error: publicErrorMessage(error, "Could not mark this conversation as read.") };
  return {};
}

export async function markConversationNotificationsRead(conversationId: string): Promise<{ error?: string }> {
  if (!isUuid(conversationId)) return { error: "This conversation isn’t available." };
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not update notifications.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to update notifications." };
  const { error } = await auth.supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", auth.user.id)
    .eq("conversation_id", conversationId)
    .eq("read", false);
  if (error) return { error: publicErrorMessage(error, "Could not update notifications.") };
  return {};
}

export async function listMyNotifications(): Promise<{
  notifications: Notice[];
  error?: string;
  skipped?: boolean;
}> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { notifications: [], error: publicErrorMessage(auth.error, "Could not load notifications.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { notifications: [], skipped: true };
  const { data, error } = await auth.supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingRelation(error)) return { notifications: [], skipped: true };
    return { notifications: [], error: publicErrorMessage(error, "Could not load notifications.") };
  }
  return { notifications: (data as NotificationRow[] | null)?.map(rowToNotice) ?? [] };
}

export async function markNotificationRead(notificationId: string): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not update this notification.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to update this notification." };
  const { data, error } = await auth.supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: publicErrorMessage(error, "Could not update this notification.") };
  if (!data) return { error: "That notification could not be updated." };
  return {};
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return { error: publicErrorMessage(auth.error, "Could not update notifications.") };
  if (auth.skipped || !auth.supabase || !auth.user) return { error: "Sign in to update notifications." };
  const { error } = await auth.supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", auth.user.id)
    .eq("read", false);
  if (error) return { error: publicErrorMessage(error, "Could not update notifications.") };
  return {};
}

export function subscribeToConversationMessages(
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase || !isUuid(conversationId)) return () => {};
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        void (async () => {
          const auth = await requireAuthenticatedUser();
          if (!auth.user) return;
          const message = rowToChatMessage(payload.new as MessageRow, auth.user.id);
          if (message.conversationId !== conversationId) return;
          onMessage(message);
        })();
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToInbox(
  userId: string,
  handlers: {
    onInsert?: (notice: Notice) => void;
    onUpdate?: (notice: Notice) => void;
  },
): () => void {
  const supabase = getSupabase();
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`inbox:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => handlers.onInsert?.(rowToNotice(payload.new as NotificationRow)),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => handlers.onUpdate?.(rowToNotice(payload.new as NotificationRow)),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

type AttentionProductRow = {
  id: string;
  owner_id: string | null;
  brand_name: string;
  name: string;
  slug: string;
  logo: string | null;
  color: string | null;
  website_url: string;
  description: string;
  category: string;
  tags: string[] | null;
  status: string;
  listing_starts_at: string | null;
  listing_ends_at: string | null;
  current_bid: number | string;
  click_count: number | string;
  campaign_title: string | null;
  campaign_description: string | null;
  campaign_requirements: string | null;
  campaign_budget: number | string | null;
  created_at: string;
};

type AttentionBidRow = {
  id: string;
  product_id: string;
  amount: number | string;
  created_at: string;
};

type AttentionActivityRow = {
  id: string;
  product_id: string;
  type: string;
  amount: number | string | null;
  rank: number | string | null;
  created_at: string;
};

export type AttentionListingWrite = {
  brandName: string;
  name: string;
  logo: string;
  websiteUrl: string;
  description: string;
  category: string;
  initialBid: number;
  campaign?: { title: string; description: string; requirements: string; budget: number };
};

export type AttentionBidResult = {
  productId: string;
  bidId: string;
  amount: number;
  currentBid: number;
  rank: number;
  createdAt: number;
};

const ATTENTION_PRODUCT_COLUMNS =
  "id, owner_id, brand_name, name, slug, logo, color, website_url, description, category, tags, status, listing_starts_at, listing_ends_at, current_bid, click_count, campaign_title, campaign_description, campaign_requirements, campaign_budget, created_at";

function asEpoch(value: string | null | undefined) {
  if (!value) return 0;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function supabaseErrorParts(error: unknown) {
  if (typeof error === "string") return { message: error, code: "", details: "", hint: "" };
  if (!error || typeof error !== "object") return { message: "", code: "", details: "", hint: "" };
  const value = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  return {
    message: typeof value.message === "string" ? value.message : "",
    code: typeof value.code === "string" ? value.code : "",
    details: typeof value.details === "string" ? value.details : "",
    hint: typeof value.hint === "string" ? value.hint : "",
  };
}

function isViteDev() {
  return Boolean(import.meta.env?.DEV);
}

function attentionClientError(error: unknown, fallback: string) {
  const parts = supabaseErrorParts(error);
  console.error("[attention]", { message: parts.message, code: parts.code, details: parts.details, hint: parts.hint });
  const mapped = attentionErrorMessage(error, fallback);
  if (!isViteDev() || mapped !== fallback) return mapped;
  const extras = [parts.code && `[${parts.code}]`, parts.message, parts.details, parts.hint].filter(Boolean).join(" ");
  return extras ? `${fallback} ${extras}` : fallback;
}

function attentionErrorMessage(error: unknown, fallback: string) {
  const raw = supabaseErrorParts(error).message;
  if (!raw) return fallback;
  if (raw.includes("Enter at least $")) return raw;
  if (raw.includes("expired and cannot receive")) return "This listing has expired and cannot receive bids.";
  if (raw.includes("valid bid amount")) return "Enter a valid bid amount.";
  if (raw.includes("whole-dollar")) return "Use a whole-dollar amount.";
  if (raw.includes("Initial bid must")) return "Initial bid must be a whole dollar between $1 and $100,000.";
  if (raw.includes("$100,000")) return "Demo bids must be $100,000 or less.";
  if (raw.includes("creator opportunity")) return "Complete the optional creator opportunity, including its budget.";
  if (raw.includes("product name, description") || raw.includes("valid website")) return "Add a product name, description, category, and valid website.";
  if (raw.includes("just listed")) return "This product was just listed. Please wait before listing it again.";
  if (raw.includes("Please wait a moment")) return "Please wait a moment before trying again.";
  if (raw.includes("Product not found")) return "Product not found.";
  if (raw.includes("failed to fetch") || raw.includes("Failed to fetch") || raw.includes("network")) return "Connection issue. Please try again.";
  return fallback;
}

function rowToBid(row: AttentionBidRow): Bid {
  return {
    id: row.id,
    amount: asNumber(row.amount, 0),
    createdAt: asEpoch(row.created_at),
  };
}

function rowToActivity(row: AttentionActivityRow): ActivityEvent | null {
  const type = row.type === "bid" || row.type === "listing" || row.type === "visit" ? row.type : null;
  if (!type) return null;
  return {
    id: row.id,
    productId: row.product_id,
    type,
    createdAt: asEpoch(row.created_at),
    amount: row.amount == null ? undefined : asNumber(row.amount, 0),
    rank: row.rank == null ? undefined : asNumber(row.rank, 0),
  };
}

function rowToAttentionProduct(
  row: AttentionProductRow,
  bids: Bid[],
  visitTimes: number[],
  now = Date.now(),
): Product {
  const listingStartsAt = asEpoch(row.listing_starts_at);
  const listingEndsAt = asEpoch(row.listing_ends_at);
  const product: Product = {
    id: row.id,
    brandId: row.owner_id || "",
    brandName: row.brand_name,
    name: row.name,
    slug: row.slug,
    logo: row.logo || row.name.slice(0, 1) || "P",
    color: row.color || "#3267e8",
    websiteUrl: row.website_url,
    description: row.description,
    category: row.category,
    tags: asStringArray(row.tags),
    currentBid: asNumber(row.current_bid, 0),
    clickCount: asNumber(row.click_count, 0),
    visitTimes,
    status: row.status === "active" ? "active" : "expired",
    listingStartsAt,
    listingEndsAt,
    bids,
  };
  if (row.campaign_title && row.campaign_description && row.campaign_requirements && row.campaign_budget != null) {
    product.campaign = {
      title: row.campaign_title,
      description: row.campaign_description,
      requirements: row.campaign_requirements,
      budget: asNumber(row.campaign_budget, 0),
    };
  }
  if (!isActive(product, now)) product.status = "expired";
  return product;
}

function isAttentionProductRow(value: unknown): value is AttentionProductRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AttentionProductRow>;
  return typeof row.id === "string" && (row.owner_id == null || typeof row.owner_id === "string") && typeof row.slug === "string" && typeof row.website_url === "string";
}

export async function getAttentionSessionUser(): Promise<{ id: string; email: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;
  return { id: data.session.user.id, email: data.session.user.email || "" };
}

export async function loadAttentionMarketplace(): Promise<{
  products: Product[];
  activity: ActivityEvent[];
  skipped?: boolean;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) return { products: [], activity: [], skipped: true };
  const { data: productData, error: productError } = await supabase
    .from("attention_products")
    .select(ATTENTION_PRODUCT_COLUMNS);
  if (productError) {
    return {
      products: [],
      activity: [],
      skipped: isMissingRelation(productError),
      error: isMissingRelation(productError) ? undefined : attentionClientError(productError, "Could not load the marketplace."),
    };
  }
  const productRows = (productData || []).filter(isAttentionProductRow);
  const productIds = productRows.map((row) => row.id);
  const [{ data: bidData, error: bidError }, { data: activityData, error: activityError }] = await Promise.all([
    productIds.length
      ? supabase.from("attention_bids").select("id, product_id, amount, created_at").in("product_id", productIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as AttentionBidRow[], error: null }),
    supabase.from("attention_activity").select("id, product_id, type, amount, rank, created_at").order("created_at", { ascending: false }).limit(120),
  ]);
  if (bidError && !isMissingRelation(bidError)) {
    return { products: [], activity: [], error: attentionClientError(bidError, "Could not load bid history.") };
  }
  if (activityError && !isMissingRelation(activityError)) {
    return { products: [], activity: [], error: attentionClientError(activityError, "Could not load marketplace activity.") };
  }
  const bidsByProduct = new Map<string, Bid[]>();
  for (const row of (bidData || []) as AttentionBidRow[]) {
    if (!row?.id || !row.product_id) continue;
    const list = bidsByProduct.get(row.product_id) || [];
    list.push(rowToBid(row));
    bidsByProduct.set(row.product_id, list);
  }
  const activity = ((activityData || []) as AttentionActivityRow[]).map(rowToActivity).filter((event): event is ActivityEvent => !!event);
  const visitTimes = new Map<string, number[]>();
  for (const event of activity) {
    if (event.type !== "visit") continue;
    const list = visitTimes.get(event.productId) || [];
    list.push(event.createdAt);
    visitTimes.set(event.productId, list);
  }
  const now = Date.now();
  return {
    products: productRows.map((row) => rowToAttentionProduct(row, bidsByProduct.get(row.id) || [], visitTimes.get(row.id) || [], now)),
    activity,
  };
}

export async function placeAttentionBid(productId: string, increment: number): Promise<{ result?: AttentionBidResult; error?: string; skipped?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { skipped: true };
  if (!isAttentionProductId(productId)) return { error: "Product not found." };
  const incrementError = validateAttentionIncrement(increment);
  if (incrementError) return { error: incrementError };
  const { data, error } = await supabase.rpc("place_attention_bid", { p_product_id: productId, p_increment: increment });
  if (error) {
    return { error: attentionClientError(error, "Could not place this bid.") };
  }
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const productIdOut = typeof row?.product_id === "string" ? row.product_id : "";
  const bidId = typeof row?.bid_id === "string" ? row.bid_id : "";
  const bidAmount = asNumber(row?.amount, 0);
  const currentBid = asNumber(row?.current_bid, bidAmount);
  const rank = asNumber(row?.resulting_rank, 0);
  const createdAt = typeof row?.created_at === "string" ? asEpoch(row.created_at) : Date.now();
  if (!productIdOut || !bidId || !Number.isInteger(bidAmount) || bidAmount < 1 || rank < 1) {
    console.error("[attention]", { message: "Unexpected place_attention_bid payload", data });
    return {
      error: isViteDev()
        ? `Could not place this bid. Unexpected RPC payload: ${JSON.stringify(data)}`
        : "Could not place this bid.",
    };
  }
  return { result: { productId: productIdOut, bidId, amount: bidAmount, currentBid, rank, createdAt } };
}

export async function recordAttentionVisit(productId: string): Promise<{ clickCount?: number; error?: string; skipped?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { skipped: true };
  if (!isAttentionProductId(productId)) return { error: "Product not found." };
  const { data, error } = await supabase.rpc("record_attention_visit", { p_product_id: productId });
  if (error) {
    return { error: attentionClientError(error, "Could not record this visit.") };
  }
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const clickCount = asNumber(row?.click_count, 0);
  if (!Number.isInteger(clickCount) || clickCount < 0) return { error: "Could not record this visit." };
  return { clickCount };
}

export async function publishAttentionListing(input: AttentionListingWrite): Promise<{ product?: Product; error?: string; skipped?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { skipped: true };
  const listingError = validateAttentionListing(input);
  if (listingError) return { error: listingError };
  const website = safeWebsite(input.websiteUrl);
  if (!website) return { error: "Add a product name, description, category, and valid website." };
  const { data, error } = await supabase.rpc("publish_attention_listing", {
    p_name: input.name.trim(),
    p_website_url: website,
    p_description: input.description.trim(),
    p_category: input.category,
    p_logo: input.logo || input.name.trim().slice(0, 1),
    p_color: "#3267e8",
    p_initial_bid: input.initialBid,
    p_brand_name: input.brandName.trim(),
    p_campaign_title: input.campaign?.title.trim() || null,
    p_campaign_description: input.campaign?.description.trim() || null,
    p_campaign_requirements: input.campaign?.requirements.trim() || null,
    p_campaign_budget: input.campaign ? input.campaign.budget : null,
  });
  if (error) {
    return { error: attentionClientError(error, "Could not publish this listing.") };
  }
  if (!isAttentionProductRow(data)) return { error: "Could not publish this listing." };
  const now = Date.now();
  const listingStartsAt = asEpoch(data.listing_starts_at) || now;
  const product = rowToAttentionProduct(
    data,
    [{ id: crypto.randomUUID(), amount: asNumber(data.current_bid, input.initialBid), createdAt: listingStartsAt }],
    [],
    now,
  );
  if (!product.listingEndsAt) product.listingEndsAt = listingStartsAt + LISTING_DAYS * 86400000;
  return { product };
}

export function subscribeToAttentionMarketplace(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("attention-marketplace")
    .on("postgres_changes", { event: "*", schema: "public", table: "attention_products" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "attention_bids" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "attention_activity" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
