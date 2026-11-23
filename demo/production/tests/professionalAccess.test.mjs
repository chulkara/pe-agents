import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {executionFixture,source} from './execution-helpers.mjs';
let s,f,token,proId;
before(async()=>{s=await executionFixture();f=await s.file({kind:'Diligence'});
 await s.one(s.owner,'select public.kalling_execution_file_review($1,$2)',[f.id,'Reviewed the current fictional annual statement.']);
 await s.one(s.owner,'select public.kalling_execution_file_grant($1,$2,$3,$4)',[f.id,['buyer','seller'],source(f),'The owner instructed sharing this exact version with both parties.']);});
after(()=>s?.db.close());
async function storage(user,path,operation='object.get_authenticated'){await s.db.exec('begin;set local role authenticated');try{await s.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[user,operation]);const r=(await s.db.query('select name from storage.objects where name=$1',[path])).rows;await s.db.exec('commit');return r;}catch(e){await s.db.exec('rollback');throw e;}}
const pro=()=>s.outsider; // fictional-5@marketplace.invalid plays the buyer's CPA

test('the buyer invites their CPA; only the invited, confirmed email can accept, once',async()=>{
 token=await s.one(s.buyer,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['buyer','Fictional CPA','Fictional-5@marketplace.invalid','Fictional & Co','CPA',90]);
 await assert.rejects(s.one(s.buyer,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['buyer','Again','fictional-5@marketplace.invalid','','CPA',90]),/already has an invitation/);
 await assert.rejects(s.one(s.buyer,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['buyer','Me','fictional-1@marketplace.invalid','','CPA',90]),/own email/);
 await assert.rejects(s.one(s.outsider,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['buyer','X','x@pro.invalid','','CPA',90]),/Sign in with your buyer account/);
 await assert.rejects(s.one(s.other,'select public.kalling_pro_accept($1)',[token]),/email address the invitation/);
 await s.one(pro(),'select public.kalling_pro_accept($1)',[token]);
 await assert.rejects(s.one(pro(),'select public.kalling_pro_accept($1)',[token]),/expired, was used/);
 const list=await s.one(s.buyer,'select public.kalling_pro_party_list($1)',['buyer']);assert.equal(list.length,1);assert.equal(list[0].professional.status,'Active');proId=list[0].professional.id;
 assert.equal((await s.db.query('select count(*)::int n from kalling_private.pro_invites where token_hash=$1',[token])).rows[0].n,0,'tokens are stored only as hashes');
});

test('the buyer shares only what the buyer can open, with the NDA confirmation',async()=>{
 const docs=await s.one(s.buyer,'select public.kalling_pro_party_documents($1)',['buyer']);assert.ok(docs.some(d=>d.source==='transaction'&&d.id===f.id));
 await assert.rejects(s.one(s.buyer,'select public.kalling_pro_grant($1,$2,$3)',[proId,[{source:'transaction',id:f.id}],false]),/bound to keep this confidential/);
 await assert.rejects(s.one(s.buyer,'select public.kalling_pro_grant($1,$2,$3)',[proId,[{source:'transaction',id:crypto.randomUUID()}],true]),/only share documents you can open/);
 await assert.rejects(s.one(s.seller,'select public.kalling_pro_grant($1,$2,$3)',[proId,[{source:'transaction',id:f.id}],true]),/not on your list/);
 await s.one(s.buyer,'select public.kalling_pro_grant($1,$2,$3)',[proId,[{source:'transaction',id:f.id}],true]);
});

test('nothing opens before the confidentiality acknowledgment; then a logged, short-lived, non-signable read',async()=>{
 const before=await s.one(pro(),'select public.kalling_pro_home()');assert.equal(before[0].documents.length,0);
 const g=(await s.one(s.buyer,'select public.kalling_pro_party_list($1)',['buyer']))[0].grants[0];
 assert.equal((await s.one(pro(),'select public.kalling_pro_open($1)',[g.id])).allowed,false);
 await assert.rejects(s.one(s.other,'select public.kalling_pro_acknowledge($1)',[proId]),/invited professional/);
 await s.one(pro(),'select public.kalling_pro_acknowledge($1)',[proId]);
 const home=await s.one(pro(),'select public.kalling_pro_home()');assert.equal(home[0].documents[0].available,true);
 const o=await s.one(pro(),'select public.kalling_pro_open($1)',[g.id]);assert.equal(o.allowed,true);assert.equal(o.bucket,'kalling-execution');assert.match(o.watermark,/CPA for Fictional Buyer/);
 assert.equal((await storage(pro(),o.path)).length,1);
 assert.equal((await storage(pro(),o.path,'object.sign')).length,0,'no signed URLs');
 assert.equal((await storage(s.other,o.path)).length,0,'another user cannot reuse the ticket');
 assert.equal((await s.one(s.other,'select public.kalling_pro_open($1)',[g.id])).allowed,false);
 const views=(await s.one(s.buyer,'select public.kalling_pro_party_list($1)',['buyer']))[0].views;assert.equal(views[0].event,'opened');
});

test('revoking, the party losing access, or removal closes the door at once',async()=>{
 const g=(await s.one(s.buyer,'select public.kalling_pro_party_list($1)',['buyer']))[0].grants[0];
 const o=await s.one(pro(),'select public.kalling_pro_open($1)',[g.id]);
 await s.db.query("update public.kalling_buyers set status='Restricted' where id=$1",[s.b1]);
 assert.equal((await storage(pro(),o.path)).length,0,'a restricted buyer’s professional loses the open ticket');
 assert.equal((await s.one(pro(),'select public.kalling_pro_open($1)',[g.id])).allowed,false);
 await s.db.query("update public.kalling_buyers set status='Registered' where id=$1",[s.b1]);
 await assert.rejects(s.one(s.seller,'select public.kalling_pro_revoke($1)',[g.id]),/not yours/);
 const o2=await s.one(pro(),'select public.kalling_pro_open($1)',[g.id]);assert.equal(o2.allowed,true);
 await s.one(s.buyer,'select public.kalling_pro_revoke($1)',[g.id]);
 assert.equal((await storage(pro(),o2.path)).length,0);assert.equal((await s.one(pro(),'select public.kalling_pro_open($1)',[g.id])).allowed,false);
 assert.ok((await s.db.query("select count(*)::int n from kalling_private.pro_events where professional_id=$1 and event='denied'",[proId])).rows[0].n>=2);
 await s.one(s.buyer,'select public.kalling_pro_remove($1)',[proId]);assert.equal((await s.one(pro(),'select public.kalling_pro_home()')).length,0);
 assert.equal((await s.one(s.buyer,'select public.kalling_pro_party_list($1)',['buyer'])).length,0);
});

test('the seller keeps a separate list and shares closing documents from their side',async()=>{
 const t=await s.one(s.seller,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['seller','Fictional Seller Attorney','fictional-5@marketplace.invalid','','Attorney',30]);
 assert.equal((await s.one(s.buyer,'select public.kalling_pro_party_list($1)',['buyer'])).length,0);
 const id=(await s.one(s.seller,'select public.kalling_pro_party_list($1)',['seller']))[0].professional.id;
 await s.one(pro(),'select public.kalling_pro_accept($1)',[t]);await s.one(pro(),'select public.kalling_pro_acknowledge($1)',[id]);
 await s.one(s.seller,'select public.kalling_pro_grant($1,$2,$3)',[id,[{source:'transaction',id:f.id}],true]);
 const home=await s.one(pro(),'select public.kalling_pro_home()');assert.equal(home[0].professional.role,'Attorney');assert.equal(home[0].documents[0].available,true);
 const o=await s.one(pro(),'select public.kalling_pro_open($1)',[home[0].documents[0].grantId]);assert.equal(o.allowed,true);assert.match(o.watermark,/Attorney for Fictional Seller/);
});

test('clients cannot read the professional tables directly',async()=>{
 for(const t of ['pro_people','pro_invites','pro_grants','pro_events','pro_tickets'])await assert.rejects(s.as(s.buyer,`select * from kalling_private.${t}`),/permission denied/);
});

test('data-room documents follow the buyer’s own tier; the seller can share their own uploads',async()=>{
 const pf=async(name,c)=>{const id=crypto.randomUUID(),path=`${s.portal}/${id}.pdf`;await s.db.query("insert into public.kalling_portal_files(id,portal_id,name,mime,size,sha256,object_path,status,uploaded_by,uploader_name,side) values($1,$2,$3,'application/pdf',100,$4,$5,'stored',$6,'Fictional Seller','seller')",[id,s.portal,name,c.repeat(64),path,s.seller]);await s.db.query("insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,'{}')",[path]);return {id,path};};
 const pl=await pf('pl.pdf','b'),cust=await pf('customers.pdf','c');
 await s.db.query("insert into public.kalling_dataroom_rooms(listing_id,portal_id,status) values($1,$2,'Published')",[s.l,s.portal]);
 const it=async(file,name,tier)=>(await s.db.query("insert into public.kalling_dataroom_items(listing_id,portal_id,file_id,display_name,folder,tier,owner_status) values($1,$2,$3,$4,'Financials',$5,'Approved') returning id",[s.l,s.portal,file.id,name,tier])).rows[0].id;
 const plItem=await it(pl,'2025 profit and loss','After NDA'),custItem=await it(cust,'Customer list','After LOI');
 const t=await s.one(s.buyer,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['buyer','Fictional Attorney','fictional-5@marketplace.invalid','','Attorney',30]);
 const id=(await s.one(s.buyer,'select public.kalling_pro_party_list($1)',['buyer']))[0].professional.id;await s.one(pro(),'select public.kalling_pro_accept($1)',[t]);await s.one(pro(),'select public.kalling_pro_acknowledge($1)',[id]);
 const docs=await s.one(s.buyer,'select public.kalling_pro_party_documents($1)',['buyer']);
 assert.ok(docs.some(d=>d.id===plItem));assert.ok(!docs.some(d=>d.id===custItem),'the after-LOI folder is not the buyer’s to share yet');
 await assert.rejects(s.one(s.buyer,'select public.kalling_pro_grant($1,$2,$3)',[id,[{source:'dataroom',id:custItem}],true]),/only share documents you can open/);
 await s.one(s.buyer,'select public.kalling_pro_grant($1,$2,$3)',[id,[{source:'dataroom',id:plItem}],true]);
 const g=(await s.one(pro(),'select public.kalling_pro_home()')).find(h=>h.professional.id===id).documents[0];
 const o=await s.one(pro(),'select public.kalling_pro_open($1)',[g.grantId]);assert.equal(o.bucket,'kalling-portal');assert.equal((await storage(pro(),o.path)).length,1);
 await s.db.query("update public.kalling_dataroom_rooms set status='Unpublished' where listing_id=$1",[s.l]);
 assert.equal((await storage(pro(),o.path)).length,0,'unpublishing the room ends the professional’s read too');
 assert.equal((await s.one(pro(),'select public.kalling_pro_open($1)',[g.grantId])).allowed,false);
 const sellerDocs=await s.one(s.seller,'select public.kalling_pro_party_documents($1)',['seller']);
 assert.ok(sellerDocs.some(d=>d.id===custItem)&&sellerDocs.some(d=>d.id===plItem),'the seller can share their own documents regardless of buyer tiers');
});
