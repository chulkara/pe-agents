import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

// Migration 010 against real PostgreSQL: the letter gate, signatures and the frozen text hash.
let db,firm,n=0;
const owner='00000000-0000-0000-0000-0000000000e1',analyst='00000000-0000-0000-0000-0000000000e2',viewer='00000000-0000-0000-0000-0000000000e3',seller='00000000-0000-0000-0000-0000000000e4',stranger='00000000-0000-0000-0000-0000000000e5';
const help={name:'Karan C',email:'a@kalling.test'};
const request={title:'Profit and loss statements for 2023, 2024 and 2025',needed:'Annual statements for three years.',why:'Buyers use these to understand earnings.',sharing:'Kalling advisors see this now.',contact:help,due:'2026-12-01'};
const body='ENGAGEMENT LETTER\n'+'Kalling will represent the Owner in the sale of the Business. '.repeat(6);
const input={ownerName:'Pat Russo',advisorName:'Karan C',state:'NJ'};
async function as(user,sql,args=[]){await db.exec('begin;set local role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows;}catch(e){await db.exec('rollback;');throw e;}}
const one=async(user,sql,args)=>{const r=await as(user,sql,args);return r[0]?Object.values(r[0])[0]:null;};
async function gatedPortal(){
  const id=await one(analyst,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[firm,'co-'+(++n),'Russo Heating & Air','Pat Russo','pat@russohvac.test',help,'Welcome']);
  await one(analyst,'select public.kalling_portal_set_gate($1,$2)',[id,true]);
  await one(analyst,'select public.kalling_portal_save_request($1,$2)',[id,request]);
  const token=await one(analyst,'select public.kalling_portal_invite($1)',[id]);await one(seller,'select public.kalling_portal_accept($1)',[token]);
  return id;
}

before(async()=>{
  db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','010_engagement_letters.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  for(const [id,email] of [[owner,'o@kalling.test'],[analyst,'a@kalling.test'],[viewer,'v@kalling.test'],[seller,'pat@russohvac.test'],[stranger,'x@else.test']])await db.query('insert into auth.users values($1,$2,now())',[id,email]);
  firm=await one(owner,'select public.kalling_create_firm($1,$2)',['Kalling',{firm:{name:'Kalling'},companies:[1,2,3,4].map(i=>({id:'co-'+i,name:'Co '+i})),deals:[],events:[]}]);
  for(const [u,e,r] of [[analyst,'a@kalling.test','analyst'],[viewer,'v@kalling.test','viewer']]){const t=await one(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,e,r]);await one(u,'select public.kalling_accept_invite($1)',[t]);}
});
after(async()=>db?.close());

test('requests stay hidden from the owner until the letter is countersigned',async()=>{
  const p=await gatedPortal();
  assert.equal((await as(seller,'select * from public.kalling_portal_requests where portal_id=$1',[p])).length,0,'hidden from the owner');
  assert.equal((await as(analyst,'select * from public.kalling_portal_requests where portal_id=$1',[p])).length,1,'the firm still sees drafts');
  const r=(await as(analyst,'select id from public.kalling_portal_requests where portal_id=$1',[p]))[0].id;
  await assert.rejects(as(seller,'select public.kalling_portal_seller_note($1,$2)',[r,'hello']),/open after the engagement letter/);
  const l=await one(analyst,'select public.kalling_letter_save($1,$2)',[p,{templateVersion:'test-v1',input,text:body}]);
  assert.equal((await as(seller,'select * from public.kalling_portal_letters where portal_id=$1',[p])).length,0,'drafts are private');
  await assert.rejects(one(viewer,'select public.kalling_letter_ready($1)',[l]),/access denied/);
  await assert.rejects(one(analyst,'select public.kalling_portal_set_gate($1,$2)',[p,false]),/countersigned/);
  await one(analyst,'select public.kalling_letter_ready($1)',[l]);
  await assert.rejects(one(analyst,'select public.kalling_letter_save($1,$2)',[p,{id:l,templateVersion:'test-v1',input,text:body+' changed'}]),/Only a draft/);
  await one(seller,'select public.kalling_letter_viewed($1)',[l]);
  const [row]=await as(seller,'select status,text_hash,body from public.kalling_portal_letters where id=$1',[l]);
  assert.equal(row.status,'Viewed by owner');assert.equal(row.text_hash,createHash('sha256').update(body).digest('hex'),'hash of the exact text');
  await assert.rejects(one(seller,'select public.kalling_letter_sign($1,$2,$3)',[l,'Pat Russo',false]),/Agree/);
  await assert.rejects(one(seller,'select public.kalling_letter_sign($1,$2,$3)',[l,'Pat',true]),/exactly as it appears/);
  await assert.rejects(one(stranger,'select public.kalling_letter_sign($1,$2,$3)',[l,'Pat Russo',true]),/access denied/);
  await assert.rejects(one(analyst,'select public.kalling_letter_countersign($1,$2,$3)',[l,'Karan C',true]),/not signed yet/);
  await one(seller,'select public.kalling_letter_sign($1,$2,$3)',[l,'  pat   RUSSO ',true]);
  await assert.rejects(one(analyst,'select public.kalling_letter_countersign($1,$2,$3)',[l,'Someone Else',true]),/advisor/);
  await one(analyst,'select public.kalling_letter_countersign($1,$2,$3)',[l,'Karan C',true]);
  const [done]=await as(seller,'select status,owner_signature,firm_signature,events from public.kalling_portal_letters where id=$1',[l]);
  assert.equal(done.status,'Countersigned');assert.equal(done.owner_signature.name,'pat RUSSO');assert.equal(done.owner_signature.email,'pat@russohvac.test');assert.equal(done.firm_signature.email,'a@kalling.test');
  assert.deepEqual(done.events.map(e=>e.status),['Draft','Ready to sign','Viewed by owner','Signed by owner','Countersigned']);
  assert.ok(!('ip' in done.owner_signature),'no IP stored');
  assert.equal((await as(seller,'select * from public.kalling_portal_requests where portal_id=$1',[p])).length,1,'requests open after countersigning');
  await assert.rejects(one(analyst,'select public.kalling_letter_void($1,$2)',[l,'Changed terms']),/cannot be voided/);
});

test('voiding allows a new version; only one open letter at a time',async()=>{
  const p=await gatedPortal();
  const l1=await one(analyst,'select public.kalling_letter_save($1,$2)',[p,{templateVersion:'test-v1',input,text:body}]);
  await assert.rejects(one(analyst,'select public.kalling_letter_save($1,$2)',[p,{templateVersion:'test-v1',input,text:body}]),/already has an open/);
  await assert.rejects(one(analyst,'select public.kalling_letter_void($1,$2)',[l1,'no']),/Say why/);
  await one(analyst,'select public.kalling_letter_void($1,$2)',[l1,'Fee terms changed']);
  const l2=await one(analyst,'select public.kalling_letter_save($1,$2)',[p,{templateVersion:'test-v1',input,text:body}]);
  assert.equal((await as(analyst,'select version from public.kalling_portal_letters where id=$1',[l2]))[0].version,2);
  await assert.rejects(as(stranger,'select public.kalling_letter_save($1,$2)',[p,{templateVersion:'test-v1',input,text:body}]),/access denied/);
  assert.equal((await as(stranger,'select * from public.kalling_portal_letters')).length,0);
  await db.exec('begin;set local role anon;');await assert.rejects(db.query('select * from public.kalling_portal_letters'),/permission denied/);await db.exec('rollback;');
});
