import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Executes migrations 001 + 003 against real PostgreSQL (PGlite). Worker calls run as the
// anonymous role, exactly as the Mac does through PostgREST with the public key.
let db, firm, firm2;
const owner = '00000000-0000-0000-0000-0000000000a1', analyst = '00000000-0000-0000-0000-0000000000a2', viewer = '00000000-0000-0000-0000-0000000000a3', outsider = '00000000-0000-0000-0000-0000000000a4', admin = '00000000-0000-0000-0000-0000000000a5';
const workspace = { firm: { name: 'Agent Firm' }, companies: [{ id: 'co-1', name: 'Garden State Locksmith' }, { id: 'co-2', name: 'Second Co' }], deals: [], events: [] };
const packet = (id, company = 'co-1', playbook = 'local-research-v1', extra = {}) => JSON.stringify({ version: 1, playbook, id, scopeId: 'scope-1', company: { id: company, name: 'Garden State Locksmith' }, sources: [], ...extra });
const result = (id, extra = {}) => JSON.stringify({ executionPolicy: 'local-only-required-v2', version: 1, id, claims: [], ...extra });

async function inRole(role, user, fn) { await db.exec(`begin;set local role ${role};`); await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || '']); try { const r = await fn(); await db.exec('commit;'); return r; } catch (e) { await db.exec('rollback;'); throw e; } }
const one = async (sql, args) => Object.values((await db.query(sql, args)).rows[0])[0];
const as = (user, sql, args = []) => inRole('authenticated', user, () => one(sql, args));
const anon = (sql, args = []) => inRole('anon', null, () => one(sql, args));
const job = async (id) => (await db.query('select * from public.kalling_agent_jobs where id=$1', [id])).rows[0];
// Each scenario starts with no connected computers so the five-computer pilot cap is not shared across tests.
const fresh = () => db.query('update public.kalling_agent_workers set revoked_at=now() where revoked_at is null');
async function pair(by = owner, f = firm, name = 'Karan MacBook') { const code = await as(by, 'select public.kalling_agent_create_pairing($1,$2)', [f, name]); return anon('select public.kalling_worker_pair($1,$2)', [code, 'test']); }

before(async () => {
  db = new PGlite();
  await db.exec(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
  for (const f of ['001_foundation.sql', '20261108215809_kalling_invitation_rls.sql', '003_agent_workers.sql']) await db.exec(await readFile(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  for (const [id, email] of [[owner, 'o@t.example'], [analyst, 'a@t.example'], [viewer, 'v@t.example'], [outsider, 'x@t.example'], [admin, 'd@t.example']]) await db.query('insert into auth.users values($1,$2,now())', [id, email]);
  firm = await as(owner, 'select public.kalling_create_firm($1,$2)', ['Agent Firm', workspace]);
  firm2 = await as(outsider, 'select public.kalling_create_firm($1,$2)', ['Other Firm', workspace]);
  for (const [user, email, role] of [[analyst, 'a@t.example', 'analyst'], [viewer, 'v@t.example', 'viewer'], [admin, 'd@t.example', 'admin']]) { const t = await as(owner, 'select public.kalling_invite_member($1,$2,$3)', [firm, email, role]); await as(user, 'select public.kalling_accept_invite($1)', [t]); }
});
after(async () => db?.close());

test('only owners and admins create connection codes; codes are single use and expire', async () => {
  await assert.rejects(as(analyst, 'select public.kalling_agent_create_pairing($1,$2)', [firm, 'Mac']), /access denied/);
  await assert.rejects(as(outsider, 'select public.kalling_agent_create_pairing($1,$2)', [firm, 'Mac']), /access denied/);
  const code = await as(owner, 'select public.kalling_agent_create_pairing($1,$2)', [firm, 'Studio Mac']);
  assert.match(code, /^[0-9A-F]{6}(-[0-9A-F]{6}){3}$/);
  const paired = await anon('select public.kalling_worker_pair($1,$2)', [code.toLowerCase(), 'v1']);
  assert.equal(paired.firm_id, firm); assert.equal(paired.token.length, 64); assert.equal(paired.firm_name, 'Agent Firm');
  await assert.rejects(anon('select public.kalling_worker_pair($1,$2)', [code, 'v1']), /invalid or expired/);
  const stale = await as(owner, 'select public.kalling_agent_create_pairing($1,$2)', [firm, 'Old Mac']);
  await db.query("update kalling_private.worker_pairings set expires_at=now()-interval '1 second' where code_hash=kalling_private.hash_secret($1)", [stale]);
  await assert.rejects(anon('select public.kalling_worker_pair($1,$2)', [stale, 'v1']), /invalid or expired/);
  assert.equal(await one("select count(*)::int from kalling_private.worker_tokens where token_hash=$1", [paired.token]), 0, 'tokens are hashed at rest');
});

test('anonymous callers cannot read queue tables, secrets, or call member entrypoints', async () => {
  await assert.rejects(anon('select count(*) from public.kalling_agent_jobs'), /permission denied/);
  await assert.rejects(anon('select count(*) from kalling_private.worker_tokens'), /permission denied/);
  await assert.rejects(anon('select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('anon-attempt-1')]), /permission denied/);
  await assert.rejects(as(owner, 'select count(*) from kalling_private.worker_pairings'), /permission denied/);
  await assert.rejects(anon('select public.kalling_worker_claim($1)', ['0'.repeat(64)]), /Computer access denied/);
  await assert.rejects(anon('select public.kalling_worker_heartbeat($1,$2)', ['short', 'ready']), /Computer access denied/);
});

test('members enqueue idempotently; viewers and outsiders cannot; packets are checked', async () => {
  const a = await as(analyst, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-1')]);
  assert.equal(await as(analyst, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-1')]), a);
  await assert.rejects(as(viewer, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-viewer-1')]), /access denied/);
  await assert.rejects(as(outsider, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-outsider-1')]), /access denied/);
  await assert.rejects(as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'outreach', packet('assign-mismatch-1')]), /playbook does not match/);
  await assert.rejects(as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-missing-1', 'nope')]), /Company not in this firm/);
  await assert.rejects(as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-big-0001', 'co-1', 'local-research-v1', { pad: 'x'.repeat(125000) })]), /120 KB/);
  assert.equal(await as(viewer, 'select count(*)::int from public.kalling_agent_jobs where firm_id=$1', [firm]), 1, 'viewers can watch progress');
  assert.equal(await as(outsider, 'select count(*)::int from public.kalling_agent_jobs where firm_id=$1', [firm]), 0);
  await as(owner, 'select public.kalling_agent_cancel($1)', [a]);
});

test('a paired computer claims only its firm, reports progress, and completes with fencing', async () => {
  await fresh();
  const mac = await pair();
  const other = await pair(outsider, firm2, 'Other Mac');
  const id = await as(analyst, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-2')]);
  assert.equal(await anon('select public.kalling_worker_claim($1)', [other.token]), null, 'other firm sees nothing');
  const hb = await anon('select public.kalling_worker_heartbeat($1,$2,$3,$4,$5)', [mac.token, 'ready', 'Qwen ready', 'v2', 'qwen3:4b']);
  assert.equal(hb.waiting, 1);
  const claim = await anon('select public.kalling_worker_claim($1)', [mac.token]);
  assert.equal(claim.id, id); assert.equal(claim.kind, 'research'); assert.equal(JSON.parse(claim.packet).id, 'assign-research-2'); assert.equal(claim.attempts, 1);
  assert.equal(await anon('select public.kalling_worker_progress($1,$2,$3,$4)', [other.token, id, claim.lease_token, { step: 'x' }]), 'lost');
  assert.equal(await anon('select public.kalling_worker_progress($1,$2,$3,$4)', [mac.token, id, crypto.randomUUID(), { step: 'x' }]), 'lost');
  assert.equal(await anon('select public.kalling_worker_progress($1,$2,$3,$4)', [mac.token, id, claim.lease_token, { step: 'extract:source-1', calls: 1 }]), 'ok');
  assert.equal((await job(id)).progress.step, 'extract:source-1');
  await assert.rejects(anon('select public.kalling_worker_finish($1,$2,$3,$4)', [mac.token, id, claim.lease_token, result('different-assignment')]), /does not belong/);
  await assert.rejects(anon('select public.kalling_worker_finish($1,$2,$3,$4)', [mac.token, id, claim.lease_token, result('assign-research-2', { executionPolicy: 'cloud' })]), /local-only/);
  assert.equal(await anon('select public.kalling_worker_finish($1,$2,$3,$4)', [mac.token, id, claim.lease_token, result('assign-research-2')]), 'ok');
  const done = await job(id);
  assert.equal(done.status, 'succeeded'); assert.equal(JSON.parse(done.result).id, 'assign-research-2'); assert.equal(done.progress.stage, 'ready-for-review');
  assert.equal(await anon('select public.kalling_worker_finish($1,$2,$3,$4)', [mac.token, id, claim.lease_token, result('assign-research-2')]), 'lost', 'no double completion');
  const seen = await as(viewer, 'select state from public.kalling_agent_workers where id=$1', [mac.worker_id]);
  assert.equal(seen, 'ready');
});

test('a restarted computer resumes its own lease; a crashed one loses it after expiry', async () => {
  await fresh();
  const mac = await pair(owner, firm, 'Crashy Mac'), spare = await pair(owner, firm, 'Spare Mac');
  const id = await as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'outreach', packet('assign-outreach-1', 'co-2', 'local-outreach-v1')]);
  const first = await anon('select public.kalling_worker_claim($1)', [mac.token]);
  assert.equal(first.id, id);
  const again = await anon('select public.kalling_worker_claim($1)', [mac.token]);
  assert.equal(again.id, id); assert.equal(again.lease_token, first.lease_token); assert.equal(again.attempts, 1, 'resume does not spend an attempt');
  assert.equal(await anon('select public.kalling_worker_claim($1)', [spare.token]), null, 'held work is not double claimed');
  await db.query("update public.kalling_agent_jobs set lease_until=now()-interval '1 second' where id=$1", [id]);
  const taken = await anon('select public.kalling_worker_claim($1)', [spare.token]);
  assert.equal(taken.id, id); assert.equal(taken.attempts, 2); assert.notEqual(taken.lease_token, first.lease_token);
  assert.equal(await anon('select public.kalling_worker_finish($1,$2,$3,$4)', [mac.token, id, first.lease_token, result('assign-outreach-1')]), 'lost', 'stale computer is fenced');
  assert.equal(await anon('select public.kalling_worker_finish($1,$2,$3,$4)', [spare.token, id, taken.lease_token, result('assign-outreach-1')]), 'ok');
});

test('retryable failures back off, terminal failures stop, and people can retry', async () => {
  await fresh();
  const mac = await pair(owner, firm, 'Retry Mac');
  const id = await as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-3')]);
  const c1 = await anon('select public.kalling_worker_claim($1)', [mac.token]);
  assert.equal(await anon('select public.kalling_worker_finish($1,$2,$3,null,$4,true)', [mac.token, id, c1.lease_token, 'Ollama is not running']), 'ok');
  let row = await job(id);
  assert.equal(row.status, 'retry'); assert.equal(row.progress.stage, 'waiting'); assert.ok(new Date(row.available_at) > new Date());
  assert.equal(await anon('select public.kalling_worker_claim($1)', [mac.token]), null, 'backoff respected');
  await db.query("update public.kalling_agent_jobs set available_at=now()-interval '1 second' where id=$1", [id]);
  const c2 = await anon('select public.kalling_worker_claim($1)', [mac.token]);
  assert.equal(c2.attempts, 2);
  await anon('select public.kalling_worker_finish($1,$2,$3,null,$4,false)', [mac.token, id, c2.lease_token, 'Export a new assignment']);
  row = await job(id); assert.equal(row.status, 'failed'); assert.equal(row.last_error, 'Export a new assignment');
  await assert.rejects(as(viewer, 'select public.kalling_agent_retry($1)', [id]), /access denied/);
  await as(analyst, 'select public.kalling_agent_retry($1)', [id]);
  row = await job(id); assert.equal(row.status, 'queued'); assert.equal(row.attempts, 0);
  await assert.rejects(as(analyst, 'select public.kalling_agent_retry($1)', [id]), /Only a failed/);
  await as(analyst, 'select public.kalling_agent_cancel($1)', [id]);
});

test('repeated crashes exhaust attempts instead of looping forever', async () => {
  await fresh();
  const mac = await pair(owner, firm, 'Loop Mac');
  const id = await as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-4')]);
  for (let n = 0; n < 4; n++) { const c = await anon('select public.kalling_worker_claim($1)', [mac.token]); assert.equal(c.id, id); await db.query("update public.kalling_agent_jobs set lease_until=now()-interval '1 second' where id=$1", [id]); }
  assert.equal(await anon('select public.kalling_worker_claim($1)', [mac.token]), null);
  assert.equal((await job(id)).status, 'failed');
});

test('cancellation reaches a running computer and blocks its result', async () => {
  await fresh();
  const mac = await pair(owner, firm, 'Cancel Mac');
  const id = await as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-5')]);
  const c = await anon('select public.kalling_worker_claim($1)', [mac.token]);
  await as(analyst, 'select public.kalling_agent_cancel($1)', [id]);
  assert.equal(await anon('select public.kalling_worker_progress($1,$2,$3,$4)', [mac.token, id, c.lease_token, { step: 'x' }]), 'cancelled');
  assert.equal(await anon('select public.kalling_worker_finish($1,$2,$3,$4)', [mac.token, id, c.lease_token, result('assign-research-5')]), 'cancelled');
  assert.equal((await job(id)).result, null);
});

test('disconnecting a computer revokes it immediately and frees its work', async () => {
  await fresh();
  const mac = await pair(owner, firm, 'Revoked Mac'), spare = await pair(owner, firm, 'Backup Mac');
  const id = await as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-6')]);
  const c = await anon('select public.kalling_worker_claim($1)', [mac.token]);
  await assert.rejects(as(analyst, 'select public.kalling_agent_revoke_worker($1,$2)', [firm, mac.worker_id]), /access denied/);
  await assert.rejects(as(outsider, 'select public.kalling_agent_revoke_worker($1,$2)', [firm2, mac.worker_id]), /not found/);
  await as(owner, 'select public.kalling_agent_revoke_worker($1,$2)', [firm, mac.worker_id]);
  await assert.rejects(anon('select public.kalling_worker_heartbeat($1,$2)', [mac.token, 'ready']), /Computer access denied/);
  await assert.rejects(anon('select public.kalling_worker_finish($1,$2,$3,$4)', [mac.token, id, c.lease_token, result('assign-research-6')]), /Computer access denied/);
  const taken = await anon('select public.kalling_worker_claim($1)', [spare.token]);
  assert.equal(taken.id, id);
  await anon('select public.kalling_worker_finish($1,$2,$3,$4)', [spare.token, id, taken.lease_token, result('assign-research-6')]);
});

test('a computer loses authority when its administrator does, and requester revocation cancels work', async () => {
  await fresh();
  const mac = await pair(admin, firm, 'Admin Mac');
  await anon('select public.kalling_worker_heartbeat($1,$2)', [mac.token, 'ready']);
  const id = await as(analyst, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-research-7')]);
  await as(owner, 'select public.kalling_set_member($1,$2,$3,$4)', [firm, analyst, 'analyst', false]);
  const spare = await pair(owner, firm, 'Owner Mac');
  assert.equal(await anon('select public.kalling_worker_claim($1)', [spare.token]), null);
  assert.equal((await job(id)).status, 'cancelled');
  await as(owner, 'select public.kalling_set_member($1,$2,$3,$4)', [firm, admin, 'viewer', true]);
  await assert.rejects(anon('select public.kalling_worker_claim($1)', [mac.token]), /Computer access denied/);
});

test('pilot limits bound waiting work and connected computers', async () => {
  for (let i = 0; i < 10; i++) await as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-limit-' + String(i).padStart(3, '0'))]);
  await assert.rejects(as(owner, 'select public.kalling_agent_enqueue($1,$2,$3)', [firm, 'research', packet('assign-limit-overflow')]), /Ten assignments/);
  await assert.rejects((async () => { await db.query('update public.kalling_agent_workers set revoked_at=now()'); for (let i = 0; i < 6; i++) await pair(outsider, firm2, 'Extra ' + i); })(), /Five connected computers|Too many unused/);
});
