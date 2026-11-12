import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 007: new drafting assignment types, size limits per type, the worker version gate and private document text.
let db,firm;
const owner='00000000-0000-0000-0000-0000000000f1',analyst='00000000-0000-0000-0000-0000000000f2',viewer='00000000-0000-0000-0000-0000000000f3',seller='00000000-0000-0000-0000-0000000000f4',outsider='00000000-0000-0000-0000-0000000000f5';
const workspace={firm:{name:'Kalling'},companies:[{id:'co-1',name:'Russo Heating & Air'}],deals:[],events:[]};
let n=0;const packet=(kind,extra={})=>JSON.stringify({version:1,playbook:'local-'+kind+'-v1',id:'assign-'+kind+'-'+(++n),company:{id:'co-1',name:'Russo Heating & Air'},...extra});
async function inRole(role,user,fn){await db.exec(`begin;set local role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await fn();await db.exec('commit;');return r;}catch(e){await db.exec('rollback;');throw e;}}
const one=async(sql,args)=>{const r=(await db.query(sql,args)).rows;return r[0]?Object.values(r[0])[0]:null;};
const as=(user,sql,args=[])=>inRole('authenticated',user,()=>one(sql,args));
const rows=(user,sql,args=[])=>inRole('authenticated',user,async()=>(await db.query(sql,args)).rows);
const anon=(sql,args=[])=>inRole('anon',null,()=>one(sql,args));
async function pair(version){const code=await as(owner,'select public.kalling_agent_create_pairing($1,$2)',[firm,'Mac '+version]);const p=await anon('select public.kalling_worker_pair($1,$2)',[code,version]);await anon('select public.kalling_worker_heartbeat($1,$2,$3,$4,$5)',[p.token,'ready','ok',version,'qwen3:4b']);return p.token;}

before(async()=>{
  db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','007_drafting_jobs.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  for(const [id,email] of [[owner,'o@k.test'],[analyst,'a@k.test'],[viewer,'v@k.test'],[seller,'pat@russohvac.test'],[outsider,'x@k.test']])await db.query('insert into auth.users values($1,$2,now())',[id,email]);
  firm=await as(owner,'select public.kalling_create_firm($1,$2)',['Kalling',workspace]);
  for(const [u,e,r] of [[analyst,'a@k.test','analyst'],[viewer,'v@k.test','viewer']]){const t=await as(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,e,r]);await as(u,'select public.kalling_accept_invite($1)',[t]);}
});
after(async()=>db?.close());

test('each drafting type enqueues with its own playbook; viewers cannot enqueue',async()=>{
  for(const k of ['recast','teaser','cim','comps']){const j=await as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,k,packet(k)]);assert.ok(j);}
  await assert.rejects(as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'cim',packet('teaser')]),/playbook does not match/);
  await assert.rejects(as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'valuation',packet('recast')]),/Unsupported/);
  await assert.rejects(as(viewer,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'recast',packet('recast')]),/access denied/);
  assert.ok(await as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'research',JSON.stringify({version:1,playbook:'local-research-v1',id:'assign-research-1',company:{id:'co-1'},sources:[]})]),'older types work as before');
  await db.query('delete from public.kalling_agent_jobs');
});

test('packet size limits hold per type',async()=>{
  const big=x=>packet('recast',{text:'x'.repeat(x)}).replace('recast','KIND');
  assert.ok(await as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'cim',big(500000).replace('KIND','cim')]),'cim takes up to 600 KB');
  await assert.rejects(as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'cim',big(610000).replace('KIND','cim')]),/under 600 KB/);
  await assert.rejects(as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'teaser',big(130000).replace('KIND','teaser')]),/under 120 KB/);
  await assert.rejects(as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'research',JSON.stringify({version:1,playbook:'local-research-v1',id:'assign-r-big',company:{id:'co-1'},text:'x'.repeat(130000)})]),/under 120 KB/);
  await db.query('delete from public.kalling_agent_jobs');
});

test('an old worker never claims drafting work; a current worker does and can return a large result',async()=>{
  const old=await pair('kalling-worker-1');const cur=await pair('kalling-worker-2');
  const id=await as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'cim',packet('cim')]);
  assert.equal(await anon('select public.kalling_worker_claim($1)',[old]),null,'old worker skips it');
  const claim=await anon('select public.kalling_worker_claim($1)',[cur]);assert.equal(claim.id,id);assert.equal(claim.kind,'cim');
  const assignment=JSON.parse(claim.packet).id,res=JSON.stringify({executionPolicy:'local-only-required-v2',version:1,id:assignment,sections:'y'.repeat(200000)});
  assert.equal(await anon('select public.kalling_worker_finish($1,$2,$3,$4)',[cur,id,claim.lease_token,res]),'ok');
  assert.equal(await one('select status from public.kalling_agent_jobs where id=$1',[id]),'succeeded');
});

test('document text is private to the firm',async()=>{
  const p=await as(analyst,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[firm,'co-1','Russo Heating & Air','Pat Russo','pat@russohvac.test',{name:'K C',email:'a@k.test'},'']);
  const r=await as(analyst,'select public.kalling_portal_save_request($1,$2)',[p,{title:'P&L',needed:'Annual statements.',why:'Buyers need them.',sharing:'Kalling advisors only.',contact:{name:'K C',email:'a@k.test'},due:''}]);
  const res=await as(analyst,'select public.kalling_portal_reserve_file($1,$2,$3,$4,$5)',[r,'pl.pdf','application/pdf',1000,'a'.repeat(64)]);
  await db.query("update public.kalling_portal_files set status='stored' where id=$1",[res.file.id]);
  const ex={status:'ok',pages:[{page:1,text:'Net income 310,000'}],textHash:'b'.repeat(64),extractor:'kalling-extract-1',note:''};
  await assert.rejects(as(viewer,'select public.kalling_portal_save_text($1,$2)',[res.file.id,ex]),/access denied/);
  await as(analyst,'select public.kalling_portal_save_text($1,$2)',[res.file.id,ex]);await as(analyst,'select public.kalling_portal_save_text($1,$2)',[res.file.id,{...ex,note:'again'}]);
  assert.equal((await rows(viewer,'select * from public.kalling_portal_file_text')).length,1,'viewers can read');
  const token=await as(analyst,'select public.kalling_portal_invite($1)',[p]);await as(seller,'select public.kalling_portal_accept($1)',[token]);
  assert.equal((await rows(seller,'select * from public.kalling_portal_file_text')).length,0,'the owner never sees extracted text');
  assert.equal((await rows(outsider,'select * from public.kalling_portal_file_text')).length,0);
  await assert.rejects(inRole('anon',null,()=>db.query('select * from public.kalling_portal_file_text')),/permission denied/);
});
