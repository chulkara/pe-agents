import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../lib/brokerage.ts';
import * as V from '../lib/buyerVerification.ts';
import {localVerificationStore} from '../lib/verificationStore.ts';
import {memoryBytes} from '../lib/portalStore.ts';
import {LOCAL_BROKER_KEY} from '../lib/brokerStore.ts';
import {verificationFileHandler} from '../production/functions/kalling-verification-file/index.ts';
const buyer={kind:'buyer',email:'fictional@buyer.invalid'},other={kind:'buyer',email:'other@buyer.invalid'},advisor={kind:'advisor',name:'Fictional reviewer',canWrite:true};
const profile={name:'Fictional Buyer',phone:'',type:'Owner-operator',company:'',funds:'$500K to $1M',financing:[],experience:'Fictional HVAC operator, used only for software verification.',regions:['Central Jersey'],maxPrice:2e6};
const base=()=>B.registerBuyer(B.registerBuyer(B.emptyBrokerDb(),buyer.email,profile),other.email,{...profile,name:'Other Buyer'});
const input=()=>({kind:'Proof of funds',entity:'Fictional Buyer',documentDate:new Date().toISOString().slice(0,10),validUntil:'',explanation:'Fictional software test only.'});
const file=()=>new File(['%PDF-1.4\nfictional evidence\n%%EOF'],'fictional.pdf',{type:'application/pdf'});
function setup(bytes=memoryBytes()){const m=new Map([[LOCAL_BROKER_KEY,JSON.stringify(base())]]),kv={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};return {kv,bytes,read:()=>JSON.parse(m.get(LOCAL_BROKER_KEY)),buyer:localVerificationStore(buyer,{kv,bytes}),advisor:localVerificationStore(advisor,{kv,bytes}),other:localVerificationStore(other,{kv,bytes})};}
async function submitted(s){const v=await s.buyer.save(input());await s.buyer.upload(v.id,file());await s.buyer.change(v.id,'Submit');return (await s.buyer.list())[0];}
const review=v=>({decision:'Verified',until:V.reviewDefault(),message:'Evidence reviewed.',privateNote:'Private reviewer context.',reviewed:true,fileIds:v.files.map(f=>f.id)});
test('a private upload survives a reload and requires human review of its exact files',async()=>{
 const s=setup(),v=await submitted(s);assert.equal(V.verificationBadge(v).status,'Needs review');
 assert.equal((await localVerificationStore(buyer,{kv:s.kv,bytes:s.bytes}).list())[0].files.length,1);
 await assert.rejects(s.buyer.change(v.id,review(v)),/advisor/);
 await assert.rejects(s.advisor.change(v.id,{...review(v),fileIds:[]}),/exact submitted/);
 await s.advisor.change(v.id,review(v));assert.equal(V.verificationBadge((await s.buyer.list())[0]).status,'Verified');
 assert.equal((await s.buyer.list())[0].privateNote,undefined);assert.equal((await s.advisor.list())[0].privateNote,'Private reviewer context.');
 assert.deepEqual(await s.other.list(),[]);await assert.rejects(s.other.open(v.files[0].id),/access denied/);
 await assert.rejects(localVerificationStore({kind:'public'},{kv:s.kv}).list(),/access denied/);
 await assert.rejects(localVerificationStore({...advisor,canWrite:false},{kv:s.kv}).change(v.id,review(v)),/authorized Kalling reviewers/);
});
test('replacement, expiry, withdrawal and revocation never preserve an old badge',async()=>{
 const s=setup(),v=await submitted(s);await s.advisor.change(v.id,review(v));
 const verified=(await s.buyer.list())[0];assert.equal(V.verificationBadge(verified,Date.now()+92*864e5).status,'Expired');
 await s.buyer.save(input());assert.equal(V.verificationBadge((await s.buyer.list())[0]).status,'Needs review');
 await assert.rejects(s.advisor.change(v.id,review(v)),/older version/);
 const draft=(await s.buyer.list())[0];await s.buyer.upload(draft.id,file());await s.buyer.change(draft.id,'Submit');
 const v2=(await s.buyer.list())[0];await s.advisor.change(v2.id,review(v2));await s.advisor.change(v2.id,{...review(v2),decision:'Revoked',message:'The document needs an update.'});
 assert.equal(V.verificationBadge((await s.buyer.list())[0]).status,'Revoked');await s.buyer.change(v2.id,'Withdraw');assert.equal(V.verificationBadge((await s.buyer.list())[0]).status,'Withdrawn');
});
test('failed uploads resume the same reservation and identical files are deduped',async()=>{
 const inner=memoryBytes();let fail=true;const bytes={get:inner.get,async put(id,blob){if(fail){fail=false;throw Error('interrupted');}return inner.put(id,blob);}};
 const s=setup(bytes),v=await s.buyer.save(input());await assert.rejects(s.buyer.upload(v.id,file()),/interrupted/);
 await assert.rejects(s.buyer.change(v.id,'Submit'),/validated/);await s.buyer.upload(v.id,file());await s.buyer.upload(v.id,file());
 const result=(await s.buyer.list())[0];assert.equal(result.files.length,1);assert.equal(result.files[0].status,'stored');
 await s.buyer.open(result.files[0].id);assert.equal(s.read().verificationEvents.at(-1).action,'Document opened');
});
test('verification never grants NDA access and legacy status cannot manufacture review',async()=>{
 const db=base(),id=db.buyers[0].id;
 assert.throws(()=>B.vetBuyer(db,advisor,id,'Verified',''),/uploaded financing evidence/);
 const s=setup(),v=await submitted(s);await s.advisor.change(v.id,review(v));assert.equal(s.read().access.length,0);
 const d=V.saveProof(db,buyer,input());assert.throws(()=>V.saveProof(d.db,buyer,{...input(),documentDate:'2026-02-31'}),/valid document date/);
});
test('file identity validation rejects disguised, empty and oversized files',async()=>{
 const checked=await V.inspectProof(file());assert.match(checked.sha256,/^[0-9a-f]{64}$/);
 for(const f of [new File(['<html>not a pdf</html>'],'proof.pdf',{type:'application/pdf'}),new File(['%PDF-1.4 fake'],'proof.html',{type:'text/html'}),new File([],'proof.pdf'),new File([new Uint8Array(V.proofLimit+1)],'huge.pdf')])await assert.rejects(V.inspectProof(f));
});
test('trusted validator authenticates the user, checks actual bytes and only then attests',async()=>{
 const f=file(),proof=await V.inspectProof(f),calls=[],id='11111111-1111-4111-8111-111111111111';
 let corrupt=false;
 const handler=verificationFileHandler({url:'https://project.invalid',publicKey:'public-test',serverKey:'server-test'},async(url,opts)=>{
  calls.push({url,opts});if(url.endsWith('/auth/v1/user'))return Response.json({id:'server-authenticated-user',email_confirmed_at:'2026-01-01'});
  if(url.endsWith('/kalling_verification_prepare_validation'))return Response.json({id,path:'buyer/file',name:f.name,...proof,sha256:corrupt?'0'.repeat(64):proof.sha256});
  if(url.includes('/storage/'))return new Response(await f.arrayBuffer());return new Response(null,{status:204});
 });
 const req=()=>new Request('https://function.invalid',{method:'POST',headers:{Authorization:'Bearer user-test'},body:JSON.stringify({fileId:id,userId:'forged-user'})});
 assert.equal((await handler(req())).status,200);const attest=calls.find(c=>c.url.endsWith('/kalling_verification_attest'));assert.equal(JSON.parse(attest.opts.body).p_user,'server-authenticated-user');assert.equal(attest.opts.headers.Authorization,'Bearer server-test');
 calls.length=0;corrupt=true;assert.equal((await handler(req())).status,400);assert.equal(calls.some(c=>c.url.endsWith('/kalling_verification_attest')),false);
 assert.equal((await handler(new Request('https://function.invalid',{method:'POST'}))).status,401);
});
test('anonymous labels survive another buyer losing access',()=>{
 let db={...base(),listings:[{id:'L'}],access:[{id:'a',listingId:'L',buyerId:'a-buyer',status:'Approved'},{id:'b',listingId:'L',buyerId:'b-buyer',status:'Approved'}]};
 db=B.stableBuyerLabels(db);const b={id:'b-buyer',type:'Search fund'};assert.equal(B.anonymousBuyerLabel(db,b,'L'),'Buyer 2, search fund');
 db=B.decideAccess(db,advisor,'a','Declined','Withdrawn');assert.equal(B.anonymousBuyerLabel(db,b,'L'),'Buyer 2, search fund');
});

test('freshness policy is configurable and enforces the new boundary',async()=>{const s=setup(),v=await submitted(s);assert.equal(await s.advisor.policy(),90);await assert.rejects(s.buyer.policy(12),/authorized advisor/);await s.advisor.policy(7);await assert.rejects(s.advisor.change(v.id,review(v)),/freshness policy/);await s.advisor.change(v.id,{...review(v),until:V.reviewDefault(Date.now(),7)});assert.equal(V.verificationBadge((await s.buyer.list())[0]).status,'Verified');});
