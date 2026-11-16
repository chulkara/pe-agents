import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executionFixture,source,completeExecution} from './execution-helpers.mjs';
async function readable(s,user,path,operation='object.get_authenticated'){
 await s.db.exec('begin;set local role authenticated');try{await s.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[user,operation]);const r=await s.db.query("select count(*)::int n from storage.objects where bucket_id='kalling-execution' and name=$1",[path]);await s.db.exec('commit');return r.rows[0].n;}catch(e){await s.db.exec('rollback');throw e;}
}
const input={name:'Fictional handover.pdf',mime:'application/pdf',size:100,sha256:'a'.repeat(64),kind:'Closing evidence',content:'Confidential',retryKey:'f'.repeat(64)};
test('file audit is reviewer-only, bounded to file events and excludes storage paths and private notes',async()=>{
 const s=await executionFixture();try{
  const f=await s.file();await s.one(s.owner,'select public.kalling_execution_file_open($1)',[f.id]);
  const rows=await s.one(s.owner,'select public.kalling_execution_file_audit($1)',[s.id]);assert.equal(rows.length,1);assert.equal(rows[0].fileId,f.id);assert.equal(rows[0].event,'opened');assert.ok(rows[0].ticket);assert.equal(rows[0].object_path,undefined);assert.equal(rows[0].note,undefined);
  for(const user of [s.buyer,s.seller,s.viewer,s.other,s.outsider])await assert.rejects(s.one(user,'select public.kalling_execution_file_audit($1)',[s.id]),/audit access denied/);
 }finally{await s.db.close();}
});
test('closing upload retries preserve the exact reservation and reject altered metadata or another uploader',async()=>{
 const s=await executionFixture();try{
  const reserve=(p=input,u=s.owner)=>s.one(u,'select public.kalling_execution_file_prepare($1,$2)',[s.id,p]);const first=await reserve(),empty=await reserve();assert.equal(first.id,empty.id);assert.equal(empty.uploaded,false);assert.equal(empty.stored,false);
  await assert.rejects(s.one(s.owner,'select public.kalling_execution_file_finish($1)',[first.id]),/reserved metadata/);
  await s.as(s.owner,"insert into storage.objects(bucket_id,name,metadata) values('kalling-execution',$1,$2)",[first.path,{size:100,mimetype:'application/pdf'}]);
  const arrived=await reserve();assert.equal(arrived.id,first.id);assert.equal(arrived.uploaded,true);assert.equal(arrived.stored,false);
  await s.one(s.owner,'select public.kalling_execution_file_finish($1)',[first.id]);const stored=await reserve();assert.equal(stored.id,first.id);assert.equal(stored.stored,true);
  for(const change of [{size:101},{sha256:'b'.repeat(64)},{content:'Restricted lender'},{family:crypto.randomUUID()}])await assert.rejects(reserve({...input,...change}),/original document/);
  const other=await reserve(input,s.buyer);assert.notEqual(other.id,first.id,'another uploader cannot claim the same reservation');
  assert.equal((await s.db.query('select count(*)::int n from kalling_private.execution_files where transaction_id=$1 and uploaded_by=$2',[s.id,s.owner])).rows[0].n,1);
 }finally{await s.db.close();}
});
test('execution metadata and bytes require current grants and a logged ticket, including after a grant is restored',async()=>{
 const s=await executionFixture();try{
  const f=await s.file({kind:'Diligence'});for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,f.path,op),0);
  await s.one(s.owner,'select public.kalling_execution_file_review($1,$2)',[f.id,'Reviewed the exact fictional document.']);
  const grant=recipients=>s.one(s.owner,'select public.kalling_execution_file_grant($1,$2,$3,$4)',[f.id,recipients,source(f),'Fictional owner permission for the exact document version.']);
  await grant(['buyer']);await s.one(s.buyer,'select public.kalling_execution_file_open($1)',[f.id]);
  for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,f.path,op),1);
  for(const op of ['object.sign','object.sign_many','object.list','',null])assert.equal(await readable(s,s.buyer,f.path,op),0);
  await grant([]);for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,f.path,op),0);
  await grant(['buyer']);for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,f.path,op),0,'a restored grant does not restore its previous ticket');
  await s.one(s.buyer,'select public.kalling_execution_file_open($1)',[f.id]);for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,f.path,op),1);
  assert.ok((await s.db.query("select count(*)::int n from kalling_private.execution_events where transaction_id=$1 and file_id=$2 and actor=$3 and event='denied'",[s.id,f.id,s.buyer])).rows[0].n>=1);
 }finally{await s.db.close();}
});
test('a closed archive accepts actual advisor evidence bytes without reopening completion or granting recipients access',async()=>{
 const s=await executionFixture();try{
  await completeExecution(s);const before=(await s.load()).transaction;
  const f=await s.one(s.owner,'select public.kalling_execution_file_prepare($1,$2)',[s.id,input]);
  await s.as(s.owner,"insert into storage.objects(bucket_id,name,metadata) values('kalling-execution',$1,$2)",[f.path,{size:100,mimetype:'application/pdf'}]);await s.one(s.owner,'select public.kalling_execution_file_finish($1)',[f.id]);
  const after=(await s.load()).transaction;assert.equal(after.state,'Closed');assert.deepEqual(after.closes,before.closes);
  for(const u of [s.buyer,s.seller,s.viewer])await assert.rejects(s.one(u,'select public.kalling_execution_file_prepare($1,$2)',[s.id,{...input,retryKey:crypto.randomUUID().replaceAll('-','').repeat(2)}]),/not permitted/);
  assert.equal((await s.one(s.buyer,'select public.kalling_execution_file_open($1)',[f.id])).allowed,false);
  await assert.rejects(s.one(s.owner,'select public.kalling_execution_file_grant($1,$2,$3,$4)',[f.id,['buyer'],{fileId:f.id,page:1,excerpt:'Fictional permission source for a reviewed original.'},'No automatic post-close permission may be created.']),/Review this document/);
 }finally{await s.db.close();}
});
