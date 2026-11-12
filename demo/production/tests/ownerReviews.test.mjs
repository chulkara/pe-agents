import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 011: owner answers, memorandum review and firm files.
let db,firm,portal;
const owner='00000000-0000-0000-0000-0000000000d1',analyst='00000000-0000-0000-0000-0000000000d2',seller='00000000-0000-0000-0000-0000000000d4',stranger='00000000-0000-0000-0000-0000000000d5';
async function as(user,sql,args=[]){await db.exec('begin;set local role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows;}catch(e){await db.exec('rollback;');throw e;}}
const one=async(u,sql,a)=>{const r=await as(u,sql,a);return r[0]?Object.values(r[0])[0]:null;};
before(async()=>{db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','011_owner_reviews.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  for(const [id,e] of [[owner,'o@k.test'],[analyst,'a@k.test'],[seller,'pat@russohvac.test'],[stranger,'x@k.test']])await db.query('insert into auth.users values($1,$2,now())',[id,e]);
  firm=await one(owner,'select public.kalling_create_firm($1,$2)',['Kalling',{firm:{name:'Kalling'},companies:[{id:'co-1',name:'Russo'}],deals:[],events:[]}]);
  const t=await one(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,'a@k.test','analyst']);await one(analyst,'select public.kalling_accept_invite($1)',[t]);
  portal=await one(analyst,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[firm,'co-1','Russo Heating & Air','Pat Russo','pat@russohvac.test',{name:'K C',email:'a@k.test'},'']);
  const tok=await one(analyst,'select public.kalling_portal_invite($1)',[portal]);await one(seller,'select public.kalling_portal_accept($1)',[tok]);});
after(async()=>db?.close());

test('only the owner writes answers; the firm reads them',async()=>{
  await assert.rejects(as(analyst,'select public.kalling_portal_save_answers($1,$2)',[portal,{history:'x'}]),/access denied/);
  await as(seller,'select public.kalling_portal_save_answers($1,$2)',[portal,{history:'Started in 2007.',afterSale:'Keep the team.'}]);
  await as(seller,'select public.kalling_portal_save_answers($1,$2)',[portal,{services:'Residential service.'}]);
  const [a]=await as(analyst,'select * from public.kalling_portal_answers where portal_id=$1',[portal]);assert.equal(a.history,'Started in 2007.');assert.equal(a.services,'Residential service.');
  assert.equal((await as(stranger,'select * from public.kalling_portal_answers')).length,0);
});
test('the firm publishes a memorandum; the owner approves or asks for changes once',async()=>{
  const sections=[{key:'summary',title:'Executive summary',text:'A residential HVAC company.'}];
  await assert.rejects(as(seller,'select public.kalling_portal_publish_review($1,$2)',[portal,{kind:'cim',version:1,title:'Memorandum v1',sections}]),/access denied/);
  const r1=await one(analyst,'select public.kalling_portal_publish_review($1,$2)',[portal,{kind:'cim',version:1,title:'Memorandum v1',sections}]);
  await assert.rejects(as(seller,'select public.kalling_portal_decide_review($1,$2,$3)',[r1,'Changes requested',[]]),/Say what/);
  await as(seller,'select public.kalling_portal_decide_review($1,$2,$3)',[r1,'Changes requested',[{section:'summary',text:'Please mention the 2019 expansion.'}]]);
  await assert.rejects(as(seller,'select public.kalling_portal_decide_review($1,$2,$3)',[r1,'Approved',[]]),/already answered/);
  const r2=await one(analyst,'select public.kalling_portal_publish_review($1,$2)',[portal,{kind:'cim',version:2,title:'Memorandum v2',sections}]);
  await as(seller,'select public.kalling_portal_decide_review($1,$2,$3)',[r2,'Approved',[]]);
  const rows=await as(seller,'select version,status,comments from public.kalling_portal_reviews where portal_id=$1 order by version',[portal]);
  assert.deepEqual(rows.map(r=>r.status),['Changes requested','Approved']);assert.equal(rows[0].comments[0].text,'Please mention the 2019 expansion.');
  assert.equal((await as(stranger,'select * from public.kalling_portal_reviews')).length,0);
});
test('firm files are PDFs reserved by firm writers only',async()=>{
  await assert.rejects(as(seller,'select public.kalling_portal_reserve_firm_file($1,$2,$3,$4,$5)',[portal,'cim.pdf','application/pdf',1000,'c'.repeat(64)]),/access denied/);
  await assert.rejects(as(analyst,'select public.kalling_portal_reserve_firm_file($1,$2,$3,$4,$5)',[portal,'cim.exe','application/octet-stream',1000,'c'.repeat(64)]),/PDFs/);
  const r=(await as(analyst,'select public.kalling_portal_reserve_firm_file($1,$2,$3,$4,$5) r',[portal,'Memorandum v2.pdf','application/pdf',1000,'c'.repeat(64)]))[0].r;
  assert.equal(r.duplicate,false);assert.equal(r.file.request_id,null);assert.equal(r.file.side,'firm');
});
