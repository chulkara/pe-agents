import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {marketplaceFixture} from './marketplace-helpers.mjs';

let s,n=0;
const help={name:'Fictional Advisor',email:'fictional-0@marketplace.invalid'};
const request={title:'Fictional annual statement',needed:'A fictional annual statement for upload testing.',why:'Confirm private upload and review permissions.',sharing:'Only the invited seller and current firm team.',contact:help};
const hash=c=>c.repeat(64);
before(async()=>{
  s=await marketplaceFixture();
  await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,1,{firm:{name:'Fictional brokerage'},companies:Array.from({length:8},(_,i)=>({id:'upload-'+i,name:'Fictional HVAC '+i})),deals:[],events:[]},'Fictional upload test companies']);
});
after(async()=>s?.db.close());
async function portal(hidden=false){
  const id=await s.one(s.owner,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[s.firm,'upload-'+n++,'Fictional HVAC','Fictional Seller','fictional-3@marketplace.invalid',help,'Fictional software test only.']);
  const r=await s.one(s.owner,'select public.kalling_portal_save_request($1,$2)',[id,request]);
  const token=await s.one(s.owner,'select public.kalling_portal_invite($1)',[id]);
  await s.one(s.seller,'select public.kalling_portal_accept($1)',[token]);
  await s.one(s.owner,'select public.kalling_portal_set_gate($1,$2)',[id,hidden]);
  return {id,r};
}
const reserve=(who,r,c='a',extra={})=>s.one(who,'select public.kalling_portal_reserve_file($1,$2,$3,$4,$5)',[r,extra.name||'fictional.txt',extra.mime||'text/plain',extra.size??4,hash(c)]);
async function bytes(who,f){await s.as(who,"insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,$2)",[f.file.object_path,{size:f.file.size,mimetype:f.file.mime}]);}
const finish=(who,f)=>s.one(who,'select public.kalling_portal_finish_file($1)',[f.file.id]);
const q=async(sql,args=[])=> (await s.db.query(sql,args)).rows;
async function reads(who,path,operation='object.get_authenticated'){
  await s.db.exec('begin;set local role authenticated');
  try{
    await s.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[who,operation]);
    const rows=await s.db.query('select count(*)::int n from storage.objects where name=$1',[path]);await s.db.exec('commit');return rows.rows[0].n;
  }catch(e){await s.db.exec('rollback');throw e;}
}

test('an unsigned seller cannot reserve, link, discover or read known original files',async()=>{
  const p=await portal(true),f=await reserve(s.owner,p.r);
  await bytes(s.owner,f);await finish(s.owner,f);
  await assert.rejects(reserve(s.seller,p.r,'b'),/engagement|signed/i);
  await assert.rejects(s.one(s.seller,'select public.kalling_portal_link($1,$2)',[p.r,f.file.id]),/engagement|signed/i);
  assert.equal((await s.as(s.seller,'select id from public.kalling_portal_files where portal_id=$1',[p.id])).length,0);
  await assert.rejects(s.one(s.seller,'select public.kalling_portal_file_path($1)',[f.file.id]),/engagement|signed|denied/i);
  assert.equal(await reads(s.seller,f.file.object_path),0);
  assert.equal(await reads(s.owner,f.file.object_path),1,'firm can prepare files while the gate is closed');
});
test('closing the engagement gate blocks an existing reservation and finalisation until it reopens',async()=>{
  const p=await portal(),f=await reserve(s.seller,p.r);
  await s.one(s.owner,'select public.kalling_portal_set_gate($1,$2)',[p.id,true]);
  await assert.rejects(bytes(s.seller,f),/row-level security/);
  await s.db.query("insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,$2)",[f.file.object_path,{size:4,mimetype:'text/plain'}]);
  await assert.rejects(finish(s.seller,f),/engagement|signed/i);
  assert.equal((await q('select status from public.kalling_portal_files where id=$1',[f.file.id]))[0].status,'reserved');
  await s.one(s.owner,'select public.kalling_portal_set_gate($1,$2)',[p.id,false]);
  const resumed=await reserve(s.seller,p.r);assert.equal(resumed.file.id,f.file.id);assert.equal(resumed.uploaded,true);
  assert.equal((await finish(s.seller,resumed)).status,'stored');
});
test('retries preserve one stored original and reject inconsistent metadata even for matching hashes',async()=>{
  const p=await portal(),f=await reserve(s.seller,p.r);
  await assert.rejects(finish(s.seller,f),/did not arrive completely/);
  const resumed=await reserve(s.seller,p.r);assert.equal(resumed.file.id,f.file.id);assert.equal(resumed.uploaded,false);
  await assert.rejects(reserve(s.seller,p.r,'a',{size:5}),/match|fingerprint/i);
  await bytes(s.seller,f);await finish(s.seller,f);await finish(s.seller,f);
  const duplicate=await reserve(s.seller,p.r);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.file.id,f.file.id);
  await assert.rejects(reserve(s.seller,p.r,'a',{name:'fictional.exe'}),/Use PDF/);
  await assert.rejects(reserve(s.seller,p.r,'a',{size:20000000}),/10 MB/);
  await assert.rejects(reserve(s.seller,p.r,'a',{mime:'application/pdf',name:'fictional.pdf'}),/match|fingerprint/i);
  assert.equal((await q("select count(*)::int n from public.kalling_portal_files where portal_id=$1 and status='stored'",[p.id]))[0].n,1);
});
test('changed attachments reopen an accepted request while identical retries preserve its review',async()=>{
  const p=await portal(),first=await reserve(s.seller,p.r);await bytes(s.seller,first);await finish(s.seller,first);
  await s.one(s.seller,'select public.kalling_portal_submit($1)',[p.r]);await s.one(s.owner,'select public.kalling_portal_review($1,$2,$3)',[p.r,'Accepted','Reviewed the original file.']);
  const other=await s.one(s.owner,'select public.kalling_portal_save_request($1,$2)',[p.id,{...request,title:'Fictional revised statement'}]);
  const revised=await reserve(s.seller,other,'b');await bytes(s.seller,revised);await finish(s.seller,revised);
  await s.one(s.owner,'select public.kalling_portal_link($1,$2)',[p.r,revised.file.id]);
  let r=(await q('select * from public.kalling_portal_requests where id=$1',[p.r]))[0];
  assert.equal(r.status,'In progress');assert.equal(r.review_note,'');assert.equal(r.submitted_at,null);
  assert.deepEqual(new Set(r.file_ids),new Set([first.file.id,revised.file.id]));
  await s.one(s.seller,'select public.kalling_portal_submit($1)',[p.r]);await s.one(s.owner,'select public.kalling_portal_review($1,$2,$3)',[p.r,'Accepted','Reviewed both exact files.']);
  await s.one(s.owner,'select public.kalling_portal_link($1,$2)',[p.r,revised.file.id]);
  r=(await q('select * from public.kalling_portal_requests where id=$1',[p.r]))[0];assert.equal(r.status,'Accepted');assert.equal(r.review_note,'Reviewed both exact files.');
});
test('original downloads require current access and cannot mint reusable signed URLs',async()=>{
  const p=await portal(),f=await reserve(s.seller,p.r);await bytes(s.seller,f);await finish(s.seller,f);
  for(const who of [s.owner,s.seller,s.viewer]){
    assert.equal(await reads(who,f.file.object_path),1);
    for(const op of ['object.sign','object.sign_many','object.list','object.get_authenticated_info',''])assert.equal(await reads(who,f.file.object_path,op),0);
  }
  for(const who of [s.buyer,s.other,s.outsider])assert.equal(await reads(who,f.file.object_path),0);
});
test('firm PDF retries reuse the reservation and recognise bytes that arrived before acknowledgement',async()=>{
  const p=await portal();
  const reserveFirm=()=>s.one(s.owner,'select public.kalling_portal_reserve_firm_file($1,$2,$3,$4,$5)',[p.id,'Fictional memorandum.pdf','application/pdf',4,hash('c')]);
  const f=await reserveFirm();assert.equal((await reserveFirm()).file.id,f.file.id);
  await bytes(s.owner,f);const resumed=await reserveFirm();assert.equal(resumed.file.id,f.file.id);assert.equal(resumed.uploaded,true);
  await finish(s.owner,resumed);assert.equal((await reserveFirm()).duplicate,true);
  assert.equal((await q('select count(*)::int n from public.kalling_portal_files where portal_id=$1',[p.id]))[0].n,1);
});
