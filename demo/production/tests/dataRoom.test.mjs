import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 009: a file cannot be read without a log row, and the owner sees anonymous labels only.
let db,firm,portal,listing,cim,lease,b1,b2;
const owner='00000000-0000-0000-0000-0000000000e1',analyst='00000000-0000-0000-0000-0000000000e2',seller='00000000-0000-0000-0000-0000000000e3',alex='00000000-0000-0000-0000-0000000000e4',sam='00000000-0000-0000-0000-0000000000e5';
async function as(user,sql,args=[]){await db.exec('begin;set local role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows;}catch(e){await db.exec('rollback;');throw e;}}
const one=async(u,sql,a)=>{const r=await as(u,sql,a);return r[0]?Object.values(r[0])[0]:null;};
const sup=async(sql,a)=>(await db.query(sql,a)).rows;
const sha=c=>c.repeat(64);
const canRead=async(user,path)=>(await as(user,"select count(*)::int n from storage.objects where bucket_id='kalling-portal' and name=$1",[path]))[0].n===1;

before(async()=>{db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','005_brokerage.sql','006_buyer_checks.sql','011_owner_reviews.sql','009_data_room.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  for(const [id,e] of [[owner,'o@k.test'],[analyst,'a@k.test'],[seller,'pat@russohvac.test'],[alex,'alex@buyer.test'],[sam,'sam@buyer.test']])await db.query('insert into auth.users values($1,$2,now())',[id,e]);
  firm=await one(owner,'select public.kalling_create_firm($1,$2)',['Kalling',{firm:{name:'Kalling'},companies:[{id:'co-1',name:'Russo'}],deals:[],events:[]}]);
  await as(owner,'select public.kalling_brokerage_set_house($1)',[firm]);
  const t=await one(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,'a@k.test','analyst']);await one(analyst,'select public.kalling_accept_invite($1)',[t]);
  portal=await one(analyst,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[firm,'co-1','Russo Heating & Air','Pat Russo','pat@russohvac.test',{name:'K C',email:'a@k.test'},'']);
  const tok=await one(analyst,'select public.kalling_portal_invite($1)',[portal]);await one(seller,'select public.kalling_portal_accept($1)',[tok]);
  // Fixtures written directly: a live listing, two buyers (one approved), and two stored owner files.
  [{id:listing}]=await sup("insert into public.kalling_listings(number,status,headline,region,focus) values('KL-1101','Live','Central Jersey residential HVAC company','Central Jersey','Residential service & replacement') returning id");
  await sup("insert into public.kalling_listing_private(listing_id,business_name,city,company_id) values($1,'Russo Heating & Air','Edison','co-1')",[listing]);
  const exp='Ten years running field operations for a mechanical contractor.';
  [{id:b1}]=await sup("insert into public.kalling_buyers(user_id,email,name,type,funds,experience) values($1,'alex@buyer.test','Alex Morgan','Owner-operator','$500K to $1M',$2) returning id",[alex,exp]);
  [{id:b2}]=await sup("insert into public.kalling_buyers(user_id,email,name,type,funds,experience) values($1,'sam@buyer.test','Sam Lee','Search fund','$1M to $5M',$2) returning id",[sam,exp]);
  await sup("insert into public.kalling_access(listing_id,buyer_id,status,nda) values($1,$2,'Approved','{}'),($1,$3,'Pending','{}')",[listing,b1,b2]);
  for(const [name,c] of [['memorandum.pdf','a'],['lease.pdf','b'],['draft.pdf','c']]){
    const [{id,object_path}]=await sup("insert into public.kalling_portal_files(portal_id,name,mime,size,sha256,object_path,status,uploaded_by,uploader_name,side) values($1,$2,'application/pdf',10,$3,$4,$5,$6,'a@k.test','firm') returning id,object_path",[portal,name,sha(c),portal+'/'+name,c==='c'?'reserved':'stored',analyst]);
    await sup("insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,'{}')",[object_path]);
    if(c==='a')cim={file:id,path:object_path};else if(c==='b')lease={file:id,path:object_path};
  }
});
after(async()=>db?.close());

const item=o=>({listingId:listing,portalId:portal,fileId:cim.file,displayName:'Confidential memorandum',folder:'Overview',tier:'After NDA',allowDownload:false,note:'',...o});
test('advisors add owner documents; the room opens only after the owner approves each one',async()=>{
  await assert.rejects(as(alex,'select public.kalling_dataroom_save_item($1)',[item()]),/advisor/);
  await assert.rejects(as(analyst,'select public.kalling_dataroom_save_item($1)',[item({fileId:(await sup("select id from public.kalling_portal_files where name='draft.pdf'"))[0].id})]),/Choose a document/);
  cim.item=await one(analyst,'select public.kalling_dataroom_save_item($1)',[item()]);
  await assert.rejects(as(analyst,'select public.kalling_dataroom_save_item($1)',[item()]),/already in the data room/);
  lease.item=await one(analyst,'select public.kalling_dataroom_save_item($1)',[item({fileId:lease.file,displayName:'Facility lease',folder:'Legal and licenses',tier:'After LOI'})]);
  await as(analyst,'select public.kalling_dataroom_set_status($1,$2)',[listing,'Proposed']);
  await assert.rejects(as(analyst,'select public.kalling_dataroom_set_status($1,$2)',[listing,'Published']),/owner must approve/);
  await assert.rejects(as(alex,'select public.kalling_dataroom_owner_decide($1,$2,$3)',[[cim.item],'Approved','']),/not in your data room/);
  await assert.rejects(as(analyst,'select public.kalling_dataroom_owner_decide($1,$2,$3)',[[cim.item],'Approved','']),/not in your data room/);
  const rooms=await one(seller,'select public.kalling_dataroom_owner()');assert.equal(rooms[0].items.length,2);
  await as(seller,'select public.kalling_dataroom_owner_decide($1,$2,$3)',[[cim.item,lease.item],'Approved','']);
  await as(analyst,'select public.kalling_dataroom_set_status($1,$2)',[listing,'Published']);
  assert.equal((await as(alex,'select * from public.kalling_dataroom_items')).length,0,'buyers never read the table directly');
});
test('a file cannot be read without a log row, and the ticket lasts two minutes',async()=>{
  assert.equal(await canRead(alex,cim.path),false,'no ticket yet');
  const before=(await sup('select count(*)::int n from public.kalling_dataroom_events'))[0].n;
  const r=await one(alex,'select public.kalling_dataroom_open($1)',[cim.item]);
  assert.ok(r.ticket);assert.match(r.watermark,/^Alex Morgan, alex@buyer.test, \d{4}-\d{2}-\d{2}\. Confidential, Kalling data room$/);
  const ev=await sup('select * from public.kalling_dataroom_events order by id desc limit 1');assert.equal(ev[0].event,'opened');assert.equal(ev[0].ticket,r.ticket);
  assert.equal((await sup('select count(*)::int n from public.kalling_dataroom_events'))[0].n,before+1);
  assert.equal(await canRead(alex,cim.path),true);assert.equal(await canRead(sam,cim.path),false,'the ticket belongs to one user');
  assert.equal(await canRead(alex,lease.path),false,'one ticket opens one file');
  await sup("update kalling_private.dataroom_tickets set created_at=now()-interval '3 minutes' where id=$1",[r.ticket]);
  assert.equal(await canRead(alex,cim.path),false,'expired');
});
test('denied opens are logged and keep their log row',async()=>{
  const r=await one(alex,'select public.kalling_dataroom_open($1)',[lease.item]);assert.match(r.error,/do not have access/);assert.equal(r.ticket,undefined);
  const d=await one(alex,'select public.kalling_dataroom_download($1)',[cim.item]);assert.match(d.error,/viewed but not downloaded/);
  assert.equal((await sup("select count(*)::int n from public.kalling_dataroom_events where event='denied'"))[0].n,2);
  const s=await one(sam,'select public.kalling_dataroom_open($1)',[cim.item]);assert.match(s.error,/do not have access/);
  const v=await one(sam,'select public.kalling_dataroom_buyer($1)',[listing]);assert.equal(v.tier,0);assert.deepEqual(v.items,[]);
  await assert.rejects(as(analyst,'select public.kalling_dataroom_grant_loi($1,$2,$3)',[listing,b1,'ok']),/Add a note/);
  await as(analyst,'select public.kalling_dataroom_grant_loi($1,$2,$3)',[listing,b1,'Signed LOI received on Nov 10.']);
  assert.ok((await one(alex,'select public.kalling_dataroom_open($1)',[lease.item])).ticket);
});
test('page events need the buyer’s own ticket and are capped',async()=>{
  const r=await one(alex,'select public.kalling_dataroom_open($1)',[cim.item]);
  await as(alex,'select public.kalling_dataroom_events($1,$2)',[r.ticket,[{page:1,seconds:30},{page:2,seconds:9999}]]);
  assert.deepEqual((await sup("select page,seconds from public.kalling_dataroom_events where ticket=$1 and event='page' order by id",[r.ticket])).map(x=>[x.page,x.seconds]),[[1,30],[2,600]]);
  await assert.rejects(as(sam,'select public.kalling_dataroom_events($1,$2)',[r.ticket,[{page:1,seconds:1}]]),/not yours/);
  await assert.rejects(as(alex,'select public.kalling_dataroom_events($1,$2)',[r.ticket,Array(51).fill({page:1,seconds:1})]),/at most 50/);
});
test('the owner sees anonymous labels; the advisor sees names; the buyer sees their history',async()=>{
  const [room]=await one(seller,'select public.kalling_dataroom_owner()');
  assert.doesNotMatch(JSON.stringify(room.log),/Alex|alex@/);
  assert.equal(room.log.find(x=>x.item==='Confidential memorandum').entries[0].label,'Buyer 1, owner-operator');
  assert.match(room.summary,/^Data room this week:\nConfidential memorandum: Buyer 1, owner-operator \(2 opens\)/);
  await as(seller,'select public.kalling_dataroom_weekly($1,$2)',[listing,true]);
  await assert.rejects(as(alex,'select public.kalling_dataroom_weekly($1,$2)',[listing,true]),/not found/);
  const a=await one(analyst,'select public.kalling_dataroom_advisor($1)',[listing]);assert.equal(a.buyers[0].name,'Alex Morgan');assert.ok(a.events.length>=5);assert.equal(a.room.weekly_summary,true);
  await assert.rejects(as(seller,'select public.kalling_dataroom_advisor($1)',[listing]),/advisor/);
  const h=await one(alex,'select public.kalling_dataroom_history()');assert.equal(h[0].listing,'KL-1101');assert.equal((await one(sam,'select public.kalling_dataroom_history()')).length,0);
  await as(alex,'select public.kalling_dataroom_ask($1,$2,$3)',[cim.item,3,'What drove the 2024 margin change on page 3?']);
  const [q]=await as(analyst,'select item_id,page from public.kalling_listing_questions where item_id is not null');assert.equal(q.page,3);
});
test('a change, a removal or a restriction ends access at once',async()=>{
  await as(analyst,'select public.kalling_dataroom_save_item($1)',[item({id:cim.item,allowDownload:true})]);
  assert.equal((await sup('select owner_status from public.kalling_dataroom_items where id=$1',[cim.item]))[0].owner_status,'Pending');
  assert.match((await one(alex,'select public.kalling_dataroom_open($1)',[cim.item])).error,/do not have access/);
  await as(seller,'select public.kalling_dataroom_owner_decide($1,$2,$3)',[[cim.item],'Approved','']);
  assert.ok((await one(alex,'select public.kalling_dataroom_download($1)',[cim.item])).ticket,'download allowed now');
  await sup("update public.kalling_buyers set status='Restricted' where id=$1",[b1]);
  assert.match((await one(alex,'select public.kalling_dataroom_open($1)',[cim.item])).error,/do not have access/);
  await sup("update public.kalling_buyers set status='Registered' where id=$1",[b1]);
  await as(analyst,'select public.kalling_dataroom_set_status($1,$2)',[listing,'Unpublished']);
  assert.equal((await one(alex,'select public.kalling_dataroom_buyer($1)',[listing])).tier,0);
});
