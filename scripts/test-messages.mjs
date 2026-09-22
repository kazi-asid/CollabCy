import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.cwd();
const read=(rel)=>readFileSync(join(root,rel),'utf8');

const deals=read('app/ui/deals.tsx');
const remoteStart=deals.indexOf('function RemoteMessages(');
assert.notEqual(remoteStart,-1);
const remote=deals.slice(remoteStart);
assert.match(deals,/export function Messages\(\)\{return <RemoteMessages\/>\}/);
assert.doesNotMatch(deals,/DemoMessages/);
assert.doesNotMatch(deals,/DemoDealDetail/);
assert.match(deals,/No conversations yet/);
assert.match(remote,/c\.id===requested\|\|c\.connectionId===requested/);
assert.match(remote,/openConversation\(c\.id\)/);
assert.match(remote,/messages\?id=\$\{encodeURIComponent\(id\)\}/);
assert.match(remote,/key=\{c\.id\}/);
assert.match(remote,/conversation-campaign/);
assert.match(remote,/listMessages\(conversationId\)/);
assert.match(remote,/sendMessage\(conversationId,body\)/);
assert.match(remote,/subscribeToConversationMessages\(conversationId/);
assert.match(remote,/markConversationRead\(conversationId\)/);
assert.match(remote,/markConversationNotificationsRead\(conversationId\)/);
assert.match(remote,/message\.conversationId!==conversationId/);
assert.match(remote,/result\.message\.conversationId!==conversationId/);
assert.match(remote,/cancelled=true;stop\(\)/);
assert.match(remote,/collaborations\/\$\{current\.connectionId\}/);
assert.match(remote,/No messages yet/);
assert.doesNotMatch(remote,/setSelected\(c\.id\)/);
assert.doesNotMatch(remote,/if\(found&&found\.id!==selected\)setSelected\(found\.id\)/);
assert.doesNotMatch(remote,/All messages are local previews/);

const client=read('lib/supabase.ts');
assert.match(client,/sync_my_conversations/);
assert.match(client,/ensure_conversation/);
assert.match(client,/from\("conversations"\)/);
assert.match(client,/from\("messages"\)/);
assert.match(client,/if \(!isUuid\(conversationId\)\)/);
assert.match(client,/channel\(`conversation:\$\{conversationId\}`\)/);
assert.match(client,/removeChannel\(channel\)/);
assert.match(client,/filter: `conversation_id=eq\.\$\{conversationId\}`/);
assert.doesNotMatch(client,/sampleConversations|demoMessages|mockMessages/);

const store=read('app/store.tsx');
assert.match(store,/version:3/);
assert.match(store,/authUserId/);
assert.doesNotMatch(store,/v\.conversations/);

const migration=read('supabase/migrations/20260921140000_messaging_notifications.sql');
assert.match(migration,/connection_id uuid not null unique/);
assert.match(migration,/conversations_select_party/);
assert.match(migration,/messages_select_participant/);
assert.match(migration,/messages_insert_own/);
assert.match(migration,/auth\.uid\(\) = sender_id/);
assert.match(migration,/is_conversation_participant/);
assert.match(migration,/internal_ensure_conversation/);
assert.doesNotMatch(migration,/place_attention_bid/);

const data=read('app/data.ts');
assert.match(data,/export function isUuid/);

console.log('PASS: authenticated messages stay on conversation.id and subscribe per conversation UUID.');
