import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 004 against real PostgreSQL. The invited owner is an ordinary authenticated
// account that is never a firm member.
let db,firm,firm2;
const owner='00000000-0000-0000-0000-0000000000c1',analyst='00000000-0000-0000-0000-0000000000c2',viewer='00000000-0000-0000-0000-0000000000c3',seller='00000000-0000-0000-0000-0000000000c4',stranger='00000000-0000-0000-0000-0000000000c5',unconfirmed='00000000-0000-0000-0000-0000000000c6',other='00000000-0000-0000-0000-0000000000c7';
const ws={firm:{name:'Harbor Acquisition Partners'},companies:[{id:'co-1',name:'Garden State Lock & Safe'},{id:'co-2',name:'Second'}],deals:[],events:[]};
const help={name:'Karan C',email:'karan@harbor.test'};
const request={title:'Profit and loss statements',needed:'Annual statements for three years.',why:'Buyers use these to understand earnings.',sharing:'Only the Harbor deal team can open these.',contact:help,due:'2026-12-01'};
const sha=c=>c.repeat(64);
async function as(user,sql,args=[]){await db.exec('begin;set local role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows;}catch(e){await db.exec('rollback;');throw e;}}
const one=async(user,sql,args)=>{const r=await as(user,sql,args);return r[0]?Object.values(r[0])[0]:null;};
async function portal(company='co-1'){const id=await one(analyst,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[firm,company,'Garden State Lock & Safe','Dana Reyes','Dana@GardenState.test',help,'Welcome']);await one(analyst,'select public.kalling_portal_save_request($1,$2)',[id,request]);const token=await one(analyst,'select public.kalling_portal_invite($1)',[id]);return {id,token};}


before(async()=>{
  db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  for(const [id,email,ok] of [[owner,'o@harbor.test',1],[analyst,'a@harbor.test',1],[viewer,'v@harbor.test',1],[seller,'dana@gardenstate.test',1],[stranger,'x@else.test',1],[unconfirmed,'dana2@gardenstate.test',0],[other,'other@firm.test',1]])await db.query('insert into auth.users values($1,$2,$3)',[id,email,ok?new Date():null]);
  firm=await one(owner,'select public.kalling_create_firm($1,$2)',['Harbor Acquisition Partners',ws]);firm2=await one(other,'select public.kalling_create_firm($1,$2)',['Other',ws]);
  for(const [u,e,r] of [[analyst,'a@harbor.test','analyst'],[viewer,'v@harbor.test','viewer']]){const t=await one(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,e,r]);await one(u,'select public.kalling_accept_invite($1)',[t]);}
});
after(async()=>db?.close());

test('only the invited, confirmed owner can accept; the token is single use and hashed',async()=>{
  const {id,token}=await portal();
  assert.equal((await as(seller,'select * from public.kalling_portals where id=$1',[id])).length,0,'not visible before accepting');
  await assert.rejects(one(stranger,'select public.kalling_portal_accept($1)',[token]),/different email/);
  await assert.rejects(one(unconfirmed,'select public.kalling_portal_accept($1)',[token]),/Confirm your email/);
  await assert.rejects(one(viewer,'select public.kalling_portal_invite($1)',[id]),/access denied/);
  assert.equal(await one(seller,'select public.kalling_portal_accept($1)',[token]),id);
  await assert.rejects(one(seller,'select public.kalling_portal_accept($1)',[token]),/invalid or has expired/);
  assert.equal((await db.query('select count(*)::int n from kalling_private.portal_invites where token_hash=$1',[token])).rows[0].n,0);
  await assert.rejects(as(seller,'select * from kalling_private.portal_invites'),/permission denied/);
});

test('the owner sees only their portal and never the firm workspace, audit or other portals',async()=>{
  const p2=await portal('co-2');
  for(const t of ['kalling_workspaces','kalling_members','kalling_audit','kalling_documents','kalling_agent_jobs','kalling_firms'])assert.equal((await as(seller,`select * from public.${t}`)).length,0,t);
  const mine=await as(seller,'select id,business_name from public.kalling_portals');assert.equal(mine.length,1);assert.notEqual(mine[0].id,p2.id);
  assert.equal((await as(stranger,'select * from public.kalling_portal_requests')).length,0);
  assert.equal((await as(other,'select * from public.kalling_portals')).length,0,'other firm sees nothing');
  assert.ok((await as(viewer,'select * from public.kalling_portals')).length>=2,'firm viewers can watch');
  const access=await one(seller,'select public.kalling_portal_access($1)',[mine[0].id]);
  assert.deepEqual(access.seller,['dana@gardenstate.test']);assert.ok(access.team.includes('a@harbor.test'));
  await assert.rejects(one(seller,'select public.kalling_portal_save_request($1,$2)',[mine[0].id,request]),/access denied/);
  await assert.rejects(as(seller,"update public.kalling_portal_requests set status='Accepted'"),/permission denied/);
});

test('uploads reserve, resume, finish against stored metadata and dedupe identical bytes',async()=>{
  const p=(await as(seller,'select id from public.kalling_portals'))[0].id;
  const [r]=await as(seller,'select id from public.kalling_portal_requests where portal_id=$1',[p]);
  const a=await one(seller,'select public.kalling_portal_reserve_file($1,$2,$3,$4,$5)',[r.id,'pl.pdf','application/pdf',4,sha('a')]);
  assert.equal(a.duplicate,false);assert.equal(a.uploaded,false);
  const again=await one(seller,'select public.kalling_portal_reserve_file($1,$2,$3,$4,$5)',[r.id,'pl.pdf','application/pdf',4,sha('a')]);
  assert.equal(again.file.id,a.file.id,'an interrupted upload resumes the same reservation');
  await assert.rejects(as(stranger,"insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,$2)",[a.file.object_path,{size:4,mimetype:'application/pdf'}]),/row-level security/);
  await assert.rejects(one(seller,'select public.kalling_portal_finish_file($1)',[a.file.id]),/did not arrive completely/);
  await as(seller,"insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,$2)",[a.file.object_path,{size:4,mimetype:'application/pdf'}]);
  assert.equal((await one(seller,'select public.kalling_portal_reserve_file($1,$2,$3,$4,$5)',[r.id,'pl.pdf','application/pdf',4,sha('a')])).uploaded,true,'bytes already arrived; only finishing is needed');
  const done=await one(seller,'select public.kalling_portal_finish_file($1)',[a.file.id]);assert.equal(done.status,'stored');
  let req=(await as(seller,'select * from public.kalling_portal_requests where id=$1',[r.id]))[0];assert.equal(req.status,'In progress');assert.deepEqual(req.file_ids,[a.file.id]);
  const dup=await one(seller,'select public.kalling_portal_reserve_file($1,$2,$3,$4,$5)',[r.id,'copy.pdf','application/pdf',4,sha('a')]);assert.equal(dup.duplicate,true);assert.equal(dup.file.id,a.file.id);assert.equal(dup.file.object_path,undefined);
  assert.equal(await one(seller,'select count(*)::int from storage.objects where name=$1',[a.file.object_path]),1,'owner can download');
  assert.equal(await one(viewer,'select count(*)::int from storage.objects where name=$1',[a.file.object_path]),1,'firm can download');
  assert.equal(await one(stranger,'select count(*)::int from storage.objects where name=$1',[a.file.object_path]),0);
  for(const bad of [['x.exe','application/x-msdownload',4],['big.pdf','application/pdf',20000000]])await assert.rejects(one(seller,'select public.kalling_portal_reserve_file($1,$2,$3,$4,$5)',[r.id,bad[0],bad[1],bad[2],sha('b')]),/Use PDF|10 MB/);
});

test('notes save progress, submission needs content, and review is firm only',async()=>{
  const p=(await as(seller,'select id from public.kalling_portals'))[0].id;
  await one(analyst,'select public.kalling_portal_save_request($1,$2)',[p,{...request,title:'Lease'}]);
  const [r]=await as(seller,"select id from public.kalling_portal_requests where portal_id=$1 and title='Lease'",[p]);
  await assert.rejects(one(seller,'select public.kalling_portal_submit($1)',[r.id]),/Add a document, or a note/);
  await one(seller,'select public.kalling_portal_seller_note($1,$2)',[r.id,'We own the building; no lease exists.']);
  assert.equal((await as(seller,'select status from public.kalling_portal_requests where id=$1',[r.id]))[0].status,'In progress');
  await one(seller,'select public.kalling_portal_submit($1)',[r.id]);
  await assert.rejects(one(seller,'select public.kalling_portal_review($1,$2,$3)',[r.id,'Accepted','']),/access denied/);
  await assert.rejects(one(analyst,'select public.kalling_portal_review($1,$2,$3)',[r.id,'Needs changes','']),/what needs to change/);
  await one(analyst,'select public.kalling_portal_review($1,$2,$3)',[r.id,'Accepted','Thanks']);
  await assert.rejects(one(seller,'select public.kalling_portal_seller_note($1,$2)',[r.id,'edit']),/already complete/);
});

test('messages, buyers and steps flow both ways with correct authorship',async()=>{
  const p=(await as(seller,'select id from public.kalling_portals'))[0].id;
  await one(analyst,'select public.kalling_portal_save_buyer($1,$2)',[p,{name:'Harbor Acquisition Partners',summary:'Owner-operator buyer',stage:'Under NDA'}]);
  await assert.rejects(one(analyst,'select public.kalling_portal_save_buyer($1,$2)',[p,{name:'Bad',stage:'Married'}]));
  await one(analyst,'select public.kalling_portal_save_steps($1,$2)',[p,[{text:'Upload statements',owner:'You',due:'2026-12-01',done:false}]]);
  await one(analyst,'select public.kalling_portal_message($1,$2)',[p,'Welcome Dana']);await one(seller,'select public.kalling_portal_message($1,$2)',[p,'Thank you']);
  await assert.rejects(one(viewer,'select public.kalling_portal_message($1,$2)',[p,'viewer']),/access denied/);
  const m=await as(seller,'select side,author from public.kalling_portal_messages where portal_id=$1 order by created_at',[p]);
  assert.deepEqual(m.map(x=>[x.side,x.author]),[['firm','a@harbor.test'],['seller','Dana Reyes']]);
  assert.equal((await as(seller,'select stage from public.kalling_portal_buyers where portal_id=$1',[p]))[0].stage,'Under NDA');
  await one(seller,'select public.kalling_portal_seen($1)',[p]);
});

test('changing the owner email or closing the portal removes the earlier owner’s access at once',async()=>{
  const p=(await as(seller,'select id from public.kalling_portals'))[0].id;
  const [file]=await as(seller,'select object_path from public.kalling_portal_files where portal_id=$1',[p]).then(()=>db.query('select object_path from public.kalling_portal_files where portal_id=$1 and status=$2',[p,'stored'])).then(r=>r.rows);
  await one(analyst,'select public.kalling_portal_update($1,$2)',[p,{ownerEmail:'buyer-new@gardenstate.test'}]);
  assert.equal((await as(seller,'select * from public.kalling_portals')).length,0);
  assert.equal(await one(seller,'select count(*)::int from storage.objects where name=$1',[file.object_path]),0);
  await assert.rejects(one(seller,'select public.kalling_portal_message($1,$2)',[p,'still here?']),/access denied/);
  await one(analyst,'select public.kalling_portal_update($1,$2)',[p,{close:true}]);
  assert.equal((await as(analyst,'select status from public.kalling_portals where id=$1',[p]))[0].status,'Closed');
});
