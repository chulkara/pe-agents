import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 005 against real PostgreSQL. Anonymous visitors, buyers and advisors are separate roles.
let db,house;
const owner='00000000-0000-0000-0000-0000000000d1',analyst='00000000-0000-0000-0000-0000000000d2',buyer='00000000-0000-0000-0000-0000000000d3',buyer2='00000000-0000-0000-0000-0000000000d4',outsider='00000000-0000-0000-0000-0000000000d5';
const hash='a'.repeat(64);
async function run(role,user,sql,args=[]){await db.exec(`begin;set local role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows;}catch(e){await db.exec('rollback;');throw e;}}
const as=(u,sql,a)=>run('authenticated',u,sql,a),anon=(sql,a)=>run('anon',null,sql,a);
const one=async(p)=>{const r=await p;return r[0]?Object.values(r[0])[0]:null;};
const profile={name:'Alex Morgan',type:'Owner-operator',funds:'$500K to $1M',financing:['SBA 7(a) loan'],experience:'Ten years running field operations for a mechanical contractor.',regions:['Central Jersey'],maxPrice:4000000};
const lead={name:'Pat Russo',email:'Pat@RussoHVAC.test',region:'Central Jersey',consent:true,source:'valuation',valuation:{sde:480000,low:1500000,high:1900000}};

before(async()=>{
  db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','005_brokerage.sql','006_buyer_checks.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  for(const [id,e] of [[owner,'o@kalling.test'],[analyst,'a@kalling.test'],[buyer,'alex@buyer.test'],[buyer2,'sam@buyer.test'],[outsider,'x@else.test']])await db.query('insert into auth.users values($1,$2,now())',[id,e]);
  house=await one(as(owner,'select public.kalling_create_firm($1,$2)',['Kalling',{firm:{name:'Kalling'},companies:[],deals:[],events:[]}]));
  const t=await one(as(owner,'select public.kalling_invite_member($1,$2,$3)',[house,'a@kalling.test','analyst']));await as(analyst,'select public.kalling_accept_invite($1)',[t]);
});
after(async()=>db?.close());

test('leads wait for a house firm, then arrive privately and are rate limited',async()=>{
  await assert.rejects(anon('select public.kalling_submit_lead($1)',[lead]),/not open yet/);
  await assert.rejects(as(outsider,'select public.kalling_brokerage_set_house($1)',[house]),/Only the firm owner/);
  await as(owner,'select public.kalling_brokerage_set_house($1)',[house]);
  await assert.rejects(as(owner,'select public.kalling_brokerage_set_house($1)',[house]),/already set/);
  await assert.rejects(anon('select public.kalling_submit_lead($1)',[{...lead,consent:false}]),/agree/);
  await assert.rejects(anon('select public.kalling_submit_lead($1)',[{...lead,region:'Mars'}]),/where the business/);
  for(let i=0;i<3;i++)await anon('select public.kalling_submit_lead($1)',[lead]);
  await assert.rejects(anon('select public.kalling_submit_lead($1)',[lead]),/already have your request/);
  await assert.rejects(anon('select * from public.kalling_leads'),/permission denied/);
  assert.equal((await as(outsider,'select * from public.kalling_leads')).length,0);
  const rows=await as(analyst,'select * from public.kalling_leads');assert.equal(rows.length,3);assert.equal(rows[0].email,'pat@russohvac.test');
});

test('anonymous visitors see published teasers but never confidential details or drafts',async()=>{
  const id=await one(as(analyst,'select public.kalling_listing_save($1)',[{headline:'Edison residential HVAC company',region:'Central Jersey',summary:'x'.repeat(130),askingPrice:1e6,revenue:2e6,sde:3e5,highlights:['a','b','c'],confidential:{businessName:'Russo Heating',city:'Edison',website:'https://www.russoheating.test/x'}}]));
  assert.equal((await anon('select * from public.kalling_listings where id=$1',[id])).length,0,'drafts are hidden');
  await assert.rejects(as(analyst,'select public.kalling_listing_set_status($1,$2)',[id,'Live']),/mentions “edison”/);
  await as(analyst,'select public.kalling_listing_save($1)',[{id,headline:'Central Jersey residential HVAC company'}]);await as(analyst,'select public.kalling_listing_set_status($1,$2)',[id,'Live']);
  const pub=await anon('select number,status from public.kalling_listings order by number');assert.ok(pub.some(l=>l.status==='Live'&&l.number.startsWith('KL-11')));assert.ok(pub.some(l=>l.number==='KL-1047'));
  await assert.rejects(anon('select * from public.kalling_listing_private'),/permission denied/);
  assert.equal((await as(outsider,'select * from public.kalling_listing_private')).length,0);
  await assert.rejects(as(buyer,'select public.kalling_listing_save($1)',[{headline:'hack'}]),/advisor/);
  await assert.rejects(as(analyst,'select public.kalling_listing_save($1)',[{id:(await anon("select id from public.kalling_listings where number='KL-1047'"))[0].id,headline:'changed'}]),/Sample/);
});

test('buyers sign the NDA, wait for approval, then see details, ask and offer',async()=>{
  const l=(await anon("select id from public.kalling_listings where number='KL-1047'"))[0].id;
  await assert.rejects(as(buyer,'select public.kalling_buyer_request_access($1,$2,$3,$4,$5)',[l,'Alex Morgan',true,'',hash]),/buyer profile/);
  await assert.rejects(as(buyer,'select public.kalling_buyer_save_profile($1)',[{...profile,experience:'short'}]));
  const b=await one(as(buyer,'select public.kalling_buyer_save_profile($1)',[profile]));
  await as(buyer2,'select public.kalling_buyer_save_profile($1)',[{...profile,name:'Sam Lee'}]);
  await assert.rejects(as(buyer,'select public.kalling_buyer_request_access($1,$2,$3,$4,$5)',[l,'Alex',true,'',hash]),/exactly/);
  await as(buyer,'select public.kalling_buyer_request_access($1,$2,$3,$4,$5)',[l,'alex morgan',true,'Fits my buy box',hash]);
  assert.equal((await as(buyer,'select * from public.kalling_listing_private where listing_id=$1',[l])).length,0,'nothing before approval');
  await assert.rejects(as(buyer,'select public.kalling_listing_ask($1,$2)',[l,'Renewals?']),/wait for approval/);
  assert.equal((await as(buyer2,'select * from public.kalling_access')).length,0,'buyers see only their own requests');
  assert.equal((await as(buyer2,'select * from public.kalling_buyers')).length,1);
  const [req]=await as(analyst,'select id,nda from public.kalling_access');assert.equal(req.nda.textHash,hash);
  await assert.rejects(as(buyer,'select public.kalling_access_decide($1,$2,$3)',[req.id,'Approved','']),/advisor/);
  await as(analyst,'select public.kalling_access_decide($1,$2,$3)',[req.id,'Approved','Welcome']);
  assert.match((await as(buyer,'select business_name from public.kalling_listing_private where listing_id=$1',[l]))[0].business_name,/Sample/);
  assert.equal((await as(buyer2,'select * from public.kalling_listing_private where listing_id=$1',[l])).length,0);
  await as(buyer,'select public.kalling_listing_ask($1,$2)',[l,'How many renew in Q1?']);await as(analyst,'select public.kalling_listing_ask($1,$2,$3)',[l,'About 40%.',b]);
  assert.equal((await as(buyer,'select * from public.kalling_listing_questions')).length,2);assert.equal((await as(buyer2,'select * from public.kalling_listing_questions')).length,0);
  await assert.rejects(as(buyer,'select public.kalling_buyer_offer($1,$2)',[l,{kind:'Letter of intent',price:3e6,cashAtClose:2e6,sellerNote:1,earnout:0,financing:'SBA',closeDays:90}]),/add up/);
  await as(buyer,'select public.kalling_buyer_offer($1,$2)',[l,{kind:'Letter of intent',price:3e6,cashAtClose:2.5e6,sellerNote:5e5,earnout:0,financing:'SBA',closeDays:90,conditions:''}]);
  const [o]=await as(analyst,'select id from public.kalling_offers');
  await assert.rejects(as(buyer2,'select public.kalling_offer_update($1,$2,$3)',[o.id,'Withdrawn','']),/your own/);
  await as(analyst,'select public.kalling_offer_update($1,$2,$3)',[o.id,'Accepted','Seller accepted']);
  assert.equal((await anon('select status from public.kalling_listings where id=$1',[l]))[0].status,'Under LOI');
  await as(analyst,'select public.kalling_buyer_vet($1,$2,$3)',[b,'Restricted','NDA breach']);
  assert.equal((await as(buyer,'select * from public.kalling_listing_private where listing_id=$1',[l])).length,0,'restricted buyers lose access');
  await assert.rejects(as(buyer,'select public.kalling_listing_ask($1,$2)',[l,'Still there?']),/wait for approval/);
});

test('advisor buyer checks stay private to the firm and need an advisor',async()=>{
  const b=(await as(analyst,"select id from public.kalling_buyers where email='alex@buyer.test'"))[0].id;
  await assert.rejects(as(buyer,'select public.kalling_buyer_check($1,$2,$3)',[b,'Lender pre-qualified','']),/advisor/);
  await assert.rejects(anon('select public.kalling_buyer_check($1,$2,$3)',[b,'Lender pre-qualified','']),/permission denied/);
  await assert.rejects(as(analyst,'select public.kalling_buyer_check($1,$2,$3)',[b,'Rich','']),/verification status/);
  await as(analyst,'select public.kalling_buyer_check($1,$2,$3)',[b,'Requested','Asked for a bank letter']);
  await as(owner,'select public.kalling_buyer_check($1,$2,$3)',[b,'Lender pre-qualified','SBA pre-qualification letter from the lender, $1.2M']);
  const rows=await as(analyst,'select * from public.kalling_buyer_checks');assert.equal(rows.length,1);assert.equal(rows[0].funds,'Lender pre-qualified');assert.equal(rows[0].checked_by_email,'o@kalling.test');
  assert.equal((await as(buyer,'select * from public.kalling_buyer_checks')).length,0,'buyers never see advisor checks');
  await assert.rejects(anon('select * from public.kalling_buyer_checks'),/permission denied/);
});
