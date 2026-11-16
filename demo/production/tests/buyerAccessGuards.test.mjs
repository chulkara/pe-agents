import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {marketplaceFixture} from './marketplace-helpers.mjs';
import {ndaText} from '../../lib/brokerage.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
async function readable(s,user,bucket,path,operation){
  await s.db.exec('begin;set local role authenticated');
  try{await s.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[user,operation]);
    const r=await s.db.query('select count(*)::int n from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);await s.db.exec('commit');return r.rows[0].n;
  }catch(e){await s.db.exec('rollback');throw e;}
}
test('private broker provisioning never opens public intake and cannot be claimed by an application user',async()=>{
  const s=await marketplaceFixture({intakeOpen:false});try{
    const status=await s.one(null,'select public.kalling_brokerage_status()',[],'anon');assert.deepEqual(status,{configured:true,intakeOpen:false,firmId:null});
    for(const user of [s.owner,s.outsider,s.buyer])await assert.rejects(s.one(user,'select public.kalling_brokerage_set_house($1)',[s.firm]),/permission denied/);
    await assert.rejects(s.one(s.outsider,'select public.kalling_buyer_save_profile($1)',[{name:'Fictional Uninvited Buyer',type:'Owner-operator',funds:'Under $250K',experience:'Fictional software validation only with no actual buyer.'}]),/registration is not open/);
    const lead={name:'Fictional Seller',email:'fictional@marketplace.invalid',region:'Central Jersey',consent:true,source:'contact'};
    await assert.rejects(s.one(null,'select public.kalling_submit_lead($1)',[lead],'anon'),/not open yet/);
    assert.equal((await s.db.query('select count(*)::int n from public.kalling_leads')).rows[0].n,0);
    assert.equal((await s.one(s.owner,'select public.kalling_brokerage_status()')).firmId,s.firm);
    await s.db.exec('update kalling_private.brokerage_settings set intake_open=true');await s.one(null,'select public.kalling_submit_lead($1)',[lead],'anon');
    assert.equal((await s.db.query('select count(*)::int n from public.kalling_leads')).rows[0].n,1);
  }finally{await s.db.close();}
});
test('the exact listing NDA text is required at signing and approval, and changed text needs a new review',async()=>{
  const s=await marketplaceFixture();try{
    const listing=(await s.db.query("select * from public.kalling_listings where number='KL-1047'")).rows[0],digest=hash(ndaText(listing));
    assert.equal((await s.db.query("select encode(sha256(convert_to(kalling_private.nda_text(l),'UTF8')),'hex') digest from public.kalling_listings l where id=$1",[listing.id])).rows[0].digest,digest);
    const request=h=>s.one(s.buyer,'select public.kalling_buyer_request_access($1,$2,$3,$4,$5)',[listing.id,'Fictional Buyer',true,'Fictional software test only.',h]);
    await assert.rejects(request('a'.repeat(64)),/fingerprint/);await request(digest);await request(digest);
    let rows=(await s.db.query('select * from public.kalling_access where buyer_id=$1',[s.b1])).rows;assert.equal(rows.length,1);const first=rows[0].id;
    await assert.rejects(s.one(s.buyer,'select public.kalling_access_decide($1,$2,$3)',[first,'Approved','Self approval']),/advisor/);
    await s.db.query("update public.kalling_listings set headline='Changed fictional listing headline' where id=$1",[listing.id]);
    await assert.rejects(s.one(s.owner,'select public.kalling_access_decide($1,$2,$3)',[first,'Approved','Reviewed']),/current signed agreement/);
    const current=(await s.db.query('select * from public.kalling_listings where id=$1',[listing.id])).rows[0];await request(hash(ndaText(current)));
    rows=(await s.db.query('select * from public.kalling_access where buyer_id=$1 order by created_at',[s.b1])).rows;assert.equal(rows.length,2);assert.equal(rows.find(x=>x.id===first).status,'Withdrawn');
    const pending=rows.find(x=>x.status==='Pending');await s.one(s.owner,'select public.kalling_access_decide($1,$2,$3)',[pending.id,'Approved','Reviewed current signed text']);
    assert.equal((await s.db.query('select status from public.kalling_access where id=$1',[pending.id])).rows[0].status,'Approved');
  }finally{await s.db.close();}
});
test('proof metadata for a reviewer needs the same current role and successful log as bytes',async()=>{
  const s=await marketplaceFixture();try{
    const v=await s.one(s.buyer,'select public.kalling_verification_save($1)',[{kind:'Proof of funds',entity:'Fictional Buyer',documentDate:new Date().toISOString().slice(0,10),validUntil:'',explanation:'Fictional only.'}]);
    const f=await s.one(s.buyer,'select public.kalling_verification_reserve($1,$2,$3,$4,$5)',[v.id,'fictional.pdf','application/pdf',10,'a'.repeat(64)]);
    await s.as(s.buyer,"insert into storage.objects(bucket_id,name,metadata) values('kalling-buyer-proof',$1,'{\"size\":10,\"mimetype\":\"application/pdf\"}')",[f.path]);
    assert.equal(await readable(s,s.buyer,'kalling-buyer-proof',f.path,'object.get_authenticated_info'),1,'buyer can recover an interrupted upload');
    assert.equal(await readable(s,s.buyer,'kalling-buyer-proof',f.path,'object.get_authenticated'),0,'bytes still require a log');
    for(const user of [s.owner,s.seller,s.viewer,s.other,s.outsider])for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,user,'kalling-buyer-proof',f.path,op),0);
    for(const user of [s.seller,s.viewer,s.other,s.outsider])await assert.rejects(s.one(user,'select public.kalling_verification_open($1)',[f.id]),/Document access denied/);
    await s.one(s.owner,'select public.kalling_verification_open($1)',[f.id]);
    for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.owner,'kalling-buyer-proof',f.path,op),1);
    for(const op of ['object.sign','object.sign_many','object.list','',null])assert.equal(await readable(s,s.owner,'kalling-buyer-proof',f.path,op),0);
    await s.db.query("update kalling_private.verification_events set action='Denied' where file_id=$1",[f.id]);
    for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.owner,'kalling-buyer-proof',f.path,op),0);
    await s.db.query("update kalling_private.verification_events set action='Document opened' where file_id=$1",[f.id]);
    await s.one(s.owner,'select public.kalling_set_member($1,$2,$3,$4)',[s.firm,s.viewer,'analyst',true]);await s.one(s.viewer,'select public.kalling_verification_open($1)',[f.id]);
    await s.one(s.owner,'select public.kalling_set_member($1,$2,$3,$4)',[s.firm,s.viewer,'viewer',true]);
    for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.viewer,'kalling-buyer-proof',f.path,op),0,'a previous reviewer ticket cannot bypass a downgrade');
  }finally{await s.db.close();}
});
test('buyer metadata and bytes share the exact ticket, current file and live approval conditions',async()=>{
  const s=await marketplaceFixture();try{
    const p=await s.one(s.owner,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[s.firm,'c1','Fictional HVAC','Fictional Seller','fictional-3@marketplace.invalid',{name:'Fictional Advisor',email:'fictional-0@marketplace.invalid'},'Fictional only.']);
    const l=(await s.db.query("select id from public.kalling_listings where number='KL-1047'")).rows[0].id,path=p+'/'+randomUUID()+'/'+randomUUID();
    const f=(await s.db.query("insert into public.kalling_portal_files(portal_id,name,mime,size,sha256,object_path,status,uploaded_by,uploader_name,side) values($1,'fictional.pdf','application/pdf',10,$2,$3,'stored',$4,'Fictional Advisor','firm') returning id",[p,'a'.repeat(64),path,s.owner])).rows[0].id;
    await s.db.query("insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,'{}')",[path]);
    await s.db.query("insert into public.kalling_dataroom_rooms(listing_id,portal_id,status) values($1,$2,'Published')",[l,p]);
    const item=(await s.db.query("insert into public.kalling_dataroom_items(listing_id,portal_id,file_id,display_name,folder,tier,allow_download,owner_status) values($1,$2,$3,'Fictional original','Financials','After NDA',true,'Approved') returning id",[l,p,f])).rows[0].id;
    await s.db.query("insert into public.kalling_access(listing_id,buyer_id,status,nda) values($1,$2,'Approved','{}')",[l,s.b1]);
    for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,'kalling-portal',path,op),0);
    const opened=await s.one(s.buyer,'select public.kalling_dataroom_open($1)',[item]);assert.ok(opened.ticket);
    for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,'kalling-portal',path,op),1);
    for(const op of ['object.sign','object.sign_many','object.list','',null])assert.equal(await readable(s,s.buyer,'kalling-portal',path,op),0);
    for(const [off,on,args] of [
      ["update public.kalling_access set status='Declined' where listing_id=$1 and buyer_id=$2","update public.kalling_access set status='Approved' where listing_id=$1 and buyer_id=$2",[l,s.b1]],
      ["update public.kalling_buyers set status='Restricted' where id=$1","update public.kalling_buyers set status='Registered' where id=$1",[s.b1]],
      ["update public.kalling_dataroom_items set owner_status='Pending' where id=$1","update public.kalling_dataroom_items set owner_status='Approved' where id=$1",[item]],
      ["update public.kalling_dataroom_rooms set status='Unpublished' where listing_id=$1","update public.kalling_dataroom_rooms set status='Published' where listing_id=$1",[l]],
      ["update public.kalling_dataroom_events set event='denied' where ticket=$1","update public.kalling_dataroom_events set event='opened' where ticket=$1",[opened.ticket]],
    ]){await s.db.query(off,args);for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,'kalling-portal',path,op),0,off);await s.db.query(on,args);}
    await s.db.query("update kalling_private.dataroom_tickets set created_at=now()-interval '3 minutes' where id=$1",[opened.ticket]);
    for(const op of ['object.get_authenticated_info','object.get_authenticated'])assert.equal(await readable(s,s.buyer,'kalling-portal',path,op),0);
  }finally{await s.db.close();}
});
