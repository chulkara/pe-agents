import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
let db,firm,portal,b1,b2,v,file,path;
const ids=Array.from({length:5},()=>crypto.randomUUID()),[owner,buyer,other,seller,viewer]=ids;
async function as(uid,sql,args=[],role='authenticated',operation='object.get_authenticated'){
 await db.exec('begin;set local role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[uid||'',operation]);const r=await db.query(sql,args);await db.exec('commit');return r.rows;}catch(e){await db.exec('rollback');throw e;}
}
const one=async(u,q,a=[],role='authenticated')=>Object.values((await as(u,q,a,role))[0]||{})[0];
const root=(q,a=[])=>(db.query(q,a));
const canRead=async(u,op='object.get_authenticated')=>(await as(u,"select count(*)::int n from storage.objects where bucket_id='kalling-buyer-proof' and name=$1",[path],'authenticated',op))[0].n;
const day=new Date().toISOString().slice(0,10),until=new Date(Date.now()+60*864e5).toISOString().slice(0,10);
const input={kind:'Proof of funds',entity:'Fictional Buyer',documentDate:day,validUntil:'',explanation:'Software fixture only.'};
const review=()=>({until,privateNote:'Private only.',message:'Evidence reviewed.',reviewed:true,fileIds:[file]});
before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','005_brokerage.sql','006_buyer_checks.sql','007_drafting_jobs.sql','008_listing_anonymity.sql','009_data_room.sql','010_engagement_letters.sql','011_owner_reviews.sql','20261113032739_kalling_dataroom_revocation.sql','20261113054256_kalling_buyer_verification.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 for(let i=0;i<ids.length;i++)await root('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[ids[i],`fictional-${i}@kalling.invalid`]);
 firm=await one(owner,'select public.kalling_create_firm($1,$2)',['Fictional Kalling',{firm:{name:'Fictional Kalling'},companies:[{id:'c1',name:'Fictional HVAC'}],deals:[],events:[]}]);await one(owner,'select public.kalling_brokerage_set_house($1)',[firm]);
 const invite=await one(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,'fictional-4@kalling.invalid','viewer']);await one(viewer,'select public.kalling_accept_invite($1)',[invite]);
 portal=await one(owner,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[firm,'c1','Fictional HVAC','Fictional Seller','fictional-3@kalling.invalid',{name:'Fictional advisor',email:'fictional-0@kalling.invalid'},'']);
 const token=await one(owner,'select public.kalling_portal_invite($1)',[portal]);await one(seller,'select public.kalling_portal_accept($1)',[token]);
 const profile={name:'Fictional Buyer',type:'Owner-operator',funds:'$500K to $1M',experience:'Fictional HVAC operator with ten years of operating experience.',regions:['Central Jersey'],maxPrice:2e6};
 b1=await one(buyer,'select public.kalling_buyer_save_profile($1)',[profile]);b2=await one(other,'select public.kalling_buyer_save_profile($1)',[{...profile,name:'Other Buyer'}]);
});
after(async()=>db?.close());
test('proof reservation is private and clients cannot attest, self-verify or overwrite bytes',async()=>{
 v=await one(buyer,'select public.kalling_verification_save($1)',[input]);
 const f=await one(buyer,'select public.kalling_verification_reserve($1,$2,$3,$4,$5)',[v.id,'fictional.pdf','application/pdf',10,'a'.repeat(64)]);file=f.id;path=f.path;
 await assert.rejects(one(other,'select public.kalling_verification_reserve($1,$2,$3,$4,$5)',[v.id,'x.pdf','application/pdf',10,'b'.repeat(64)]),/current draft/);
 await as(buyer,"insert into storage.objects(bucket_id,name,metadata) values('kalling-buyer-proof',$1,'{\"size\":10,\"mimetype\":\"application/pdf\"}')",[path]);
 assert.equal(await canRead(buyer),0,'read must be logged first');await one(buyer,'select public.kalling_verification_open($1)',[file]);assert.equal(await canRead(buyer),1);
 assert.equal(await canRead(other),0);assert.equal(await canRead(seller),0);assert.equal(await canRead(viewer),0);
 for(const op of ['object.sign','object.list'])assert.equal(await canRead(buyer,op),0);
 await assert.rejects(one(buyer,'select public.kalling_verification_attest($1,$2,$3,$4,$5)',[file,buyer,'a'.repeat(64),10,'application/pdf']),/permission denied/);
 await assert.rejects(one(buyer,'select public.kalling_verification_change($1,$2,$3)',[v.id,'Submit',{}]),/validated/);
 await one(null,'select public.kalling_verification_attest($1,$2,$3,$4,$5)',[file,buyer,'a'.repeat(64),10,'application/pdf'],'service_role');
 await one(buyer,'select public.kalling_verification_change($1,$2,$3)',[v.id,'Submit',{}]);
 await assert.rejects(one(buyer,'select public.kalling_verification_change($1,$2,$3)',[v.id,'Verified',review()]),/advisor/);
 await assert.rejects(one(viewer,'select public.kalling_verification_change($1,$2,$3)',[v.id,'Verified',review()]),/access denied/);
 await assert.rejects(as(buyer,'select * from public.kalling_verification_submissions'),/permission denied/);
 assert.equal((await as(buyer,"update storage.objects set metadata='{}' where name=$1 returning id",[path])).length,0,'proof bytes and metadata cannot be overwritten');
});
test('review is version-bound and private notes never reach the buyer',async()=>{
 await assert.rejects(one(owner,'select public.kalling_verification_change($1,$2,$3)',[v.id,'Verified',{...review(),fileIds:[]}]),/exact submitted/);
 await one(owner,'select public.kalling_verification_change($1,$2,$3)',[v.id,'Verified',review()]);
 const mine=await one(buyer,'select public.kalling_verification_list()');assert.equal(mine[0].status,'Verified');assert.equal(mine[0].privateNote,undefined);assert.equal(mine[0].files[0].object_path,undefined);
 const adv=await one(owner,'select public.kalling_verification_list($1)',[b1]);assert.equal(adv[0].privateNote,'Private only.');
 assert.deepEqual(await one(other,'select public.kalling_verification_list()'),[]);await assert.rejects(one(other,'select public.kalling_verification_list($1)',[b1]),/denied/);
 await one(owner,'select public.kalling_verification_open($1)',[file]);assert.equal(await canRead(owner),1);
 await root("update public.kalling_members set active=false where user_id=$1",[owner]);assert.equal(await canRead(owner),0,'old read ticket cannot override a removed reviewer');await root('update public.kalling_members set active=true where user_id=$1',[owner]);
 assert.equal((await root('select count(*)::int n from public.kalling_access where buyer_id=$1',[b1])).rows[0].n,0,'verification grants no NDA access');
});
test('anonymous labels and seller badges stay current without disclosing proof or identity',async()=>{
 const listing=(await root("insert into public.kalling_listings(number,status,headline,region,focus) values('KL-1999','Live','Fictional anonymous HVAC company','Central Jersey','Residential service & replacement') returning id")).rows[0].id;
 await root("insert into public.kalling_listing_private(listing_id,company_id) values($1,'c1')",[listing]);
 for(const b of [b1,b2])await root("insert into public.kalling_access(listing_id,buyer_id,status,nda) values($1,$2,'Approved','{}')",[listing,b]);
 const badges=await one(seller,'select public.kalling_portal_buyer_badges($1)',[portal]);assert.equal(badges['Buyer 1, owner-operator'].status,'Verified');assert.doesNotMatch(JSON.stringify(badges),/fictional-|entity|Private only|sha256|object_path|files/);
 await root("update public.kalling_access set status='Declined' where listing_id=$1 and buyer_id=$2",[listing,b1]);
 assert.equal((await root('select kalling_private.dataroom_label($1,$2) label',[listing,b2])).rows[0].label,'Buyer 2, owner-operator');
 const replacement=await one(buyer,'select public.kalling_verification_save($1)',[input]);assert.equal(replacement.version,2);
 assert.equal((await one(seller,'select public.kalling_portal_buyer_badges($1)',[portal]))['Buyer 1, owner-operator'].status,'Needs review');
 await assert.rejects(one(owner,'select public.kalling_verification_change($1,$2,$3)',[v.id,'Verified',review()]),/current version/);
 await one(buyer,'select public.kalling_verification_change($1,$2,$3)',[replacement.id,'Withdraw',{}]);
 assert.equal((await one(seller,'select public.kalling_portal_buyer_badges($1)',[portal]))['Buyer 1, owner-operator'].status,'Withdrawn');
});

test('only the house owner or administrator may configure the freshness policy',async()=>{assert.equal(await one(owner,'select public.kalling_verification_policy()'),90);await assert.rejects(one(buyer,'select public.kalling_verification_policy($1)',[7]),/advisor/);assert.equal(await one(owner,'select public.kalling_verification_policy($1)',[7]),7);await assert.rejects(one(owner,'select public.kalling_verification_policy($1)',[0]),/check constraint/);});
