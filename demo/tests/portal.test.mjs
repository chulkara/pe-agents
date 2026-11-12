import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../lib/portal.ts';
import {localPortalStore,memoryBytes,inviteTokenFromHash,inviteLink} from '../lib/portalStore.ts';

const firm={side:'firm',name:'Karan',email:'karan@kalling.test'};
const owner={side:'seller',name:'Dana Reyes',email:'dana@gardenstate.test'};
const help={name:'Karan Chulliparambil',email:'karan@kalling.test',phone:'555-0100'};
function kv(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}
function stores(){const shared=kv(),bytes=memoryBytes(),o={firmId:'firm-1',firmName:'Harbor Acquisition Partners',team:['karan@kalling.test'],kv:shared,bytes};return {firm:localPortalStore({...o,actor:firm}),seller:localPortalStore({...o,actor:owner}),stranger:localPortalStore({...o,actor:{side:'seller',name:'X',email:'x@else.test'}})};}
const request={title:'Profit and loss statements',needed:'Annual statements for the last three years.',why:'Buyers use these to understand earnings.',sharing:'Only the Harbor deal team. Not shared with other buyers without your approval.',contact:help,due:'2026-12-01'};
const file=(text,name='pl-2025.pdf',type='application/pdf')=>new File([text],name,{type});
async function opened(){const s=stores();const id=await s.firm.create({companyId:'co-1',businessName:'Garden State Lock & Safe',ownerName:'Dana Reyes',ownerEmail:'Dana@GardenState.test',help});await s.firm.saveRequest(id,request);const token=await s.firm.invite(id);await s.seller.acceptInvite('dana@gardenstate.test',token);return {...s,id,token};}

test('invitations are single use, email bound, and only activate the invited owner',async()=>{
  const s=stores();const id=await s.firm.create({companyId:'co-1',businessName:'Garden State Lock & Safe',ownerName:'Dana Reyes',ownerEmail:'dana@gardenstate.test',help});
  await assert.rejects(()=>s.seller.load(id),/not available/);
  const token=await s.firm.invite(id);assert.equal(inviteTokenFromHash('#portal='+token),token);assert.match(inviteLink(token,'https://k.test/app/'),/^https:\/\/k\.test\/app\/#portal=/);
  await assert.rejects(()=>s.stranger.acceptInvite('x@else.test',token),/different email/);
  await s.seller.acceptInvite('dana@gardenstate.test',token);
  await assert.rejects(()=>s.seller.acceptInvite('dana@gardenstate.test',token),/invalid or has expired/);
  assert.equal((await s.seller.load(id)).portal.status,'Active');
  await assert.rejects(()=>s.stranger.load(id),/not available/);
  await assert.rejects(()=>s.firm.create({companyId:'co-1',businessName:'Dup',ownerName:'Dana Reyes',ownerEmail:'dana@gardenstate.test',help}),/already has an open/);
});

test('requests must say what, why, who sees it and whom to contact; owners cannot edit them',async()=>{
  const s=await opened();
  for(const bad of [{...request,why:''},{...request,sharing:'x'},{...request,contact:{name:'K',email:'nope'}},{...request,needed:'short'}])await assert.rejects(()=>s.firm.saveRequest(s.id,bad));
  await assert.rejects(()=>s.seller.saveRequest(s.id,request),/firm’s team/);
  const b=await s.seller.load(s.id);const r=b.requests[0];
  assert.equal(r.why,request.why);assert.equal(r.sharing,request.sharing);assert.equal(r.contact.email,help.email);
  assert.deepEqual(b.access.seller,['dana@gardenstate.test']);assert.deepEqual(b.access.team,['karan@kalling.test']);
  assert.equal(P.requestTemplates.every(t=>t.needed.length>20&&t.why.length>20),true);
});

test('uploads save progress immediately, remember supplied documents, and avoid duplicate copies',async()=>{
  const s=await opened();await s.firm.saveRequest(s.id,{...request,title:'Business tax returns',needed:'Filed returns for three years.',why:'Confirms reported earnings.'});
  let [pl,tax]=(await s.seller.load(s.id)).requests;
  const first=await s.seller.upload(pl.id,file('2025 statement'));assert.equal(first.duplicate,false);
  let b=await s.seller.load(s.id);pl=b.requests.find(r=>r.id===pl.id);assert.equal(pl.status,'In progress');assert.equal(pl.fileIds.length,1);
  // Leaving and returning keeps the partial work.
  await s.seller.sellerNote(pl.id,'2023 statement coming from my accountant next week.');
  b=await s.seller.load(s.id);assert.equal(b.requests.find(r=>r.id===pl.id).sellerNote,'2023 statement coming from my accountant next week.');
  // The same bytes uploaded again for another request are linked, not stored twice.
  const again=await s.seller.upload(tax.id,file('2025 statement','renamed.pdf'));assert.equal(again.duplicate,true);assert.equal(again.file.id,first.file.id);
  b=await s.seller.load(s.id);assert.equal(b.files.length,1);assert.deepEqual(b.requests.find(r=>r.id===tax.id).fileIds,[first.file.id]);
  // Reusing an earlier document explicitly.
  await s.seller.unlink(tax.id,first.file.id);await s.seller.link(tax.id,first.file.id);
  assert.equal(await (await s.firm.download(first.file)).text(),'2025 statement');
  await assert.rejects(()=>s.stranger.download(first.file),/not available/);
});

test('submitting needs a document or an explanation; review drives the next state',async()=>{
  const s=await opened();const [r]=(await s.seller.load(s.id)).requests;
  await assert.rejects(()=>s.seller.submit(r.id),/Add a document, or a note/);
  await s.seller.sellerNote(r.id,'We do not have a 2023 statement; the business started in 2024.');await s.seller.submit(r.id);
  await assert.rejects(()=>s.seller.unlink(r.id,'x'),/sent for review/);
  await assert.rejects(()=>s.firm.review(r.id,'Needs changes',''),/what needs to change/);
  await s.firm.review(r.id,'Needs changes','Please add the 2024 statement.');
  let x=(await s.seller.load(s.id)).requests[0];assert.equal(x.status,'Needs changes');assert.equal(x.reviewNote,'Please add the 2024 statement.');
  await s.seller.upload(r.id,file('2024'));assert.equal((await s.seller.load(s.id)).requests[0].status,'In progress');
  await s.seller.submit(r.id);await s.firm.review(r.id,'Accepted','Thank you.');
  await assert.rejects(()=>s.seller.sellerNote(r.id,'late change'),/already complete/);
  assert.deepEqual(P.portalProgress(await s.seller.load(s.id)),{total:1,done:1,sent:0,started:0,changes:0,open:0});
});

test('buyers, next steps and messages are shared; unread counts follow each side',async()=>{
  const s=await opened();
  await s.firm.saveBuyer(s.id,{name:'Harbor Acquisition Partners',summary:'Owner-operator buyer focused on NJ locksmiths.',stage:'Under NDA'});
  await assert.rejects(()=>s.seller.saveBuyer(s.id,{name:'Me',summary:'',stage:'Interested'}),/firm’s team/);
  await s.firm.saveSteps(s.id,[{text:'Upload the last three years of statements',owner:'You',due:'2026-12-01',done:false},{text:'Introductory call with Harbor',owner:'Firm',due:'',done:true}]);
  await s.firm.message(s.id,'Welcome, Dana. Start with the statements when convenient.');
  let b=await s.seller.load(s.id);assert.equal(b.buyers[0].stage,'Under NDA');assert.equal(b.steps.length,2);assert.equal(P.unread(b),1);
  await s.seller.seen(s.id);await s.seller.message(s.id,'Thanks — will do.');b=await s.seller.load(s.id);assert.equal(P.unread(b),0);
  assert.equal(P.unread(await s.firm.load(s.id)),1);
});

test('changing the owner email revokes the earlier access and invitation',async()=>{
  const s=await opened();await s.firm.update(s.id,{ownerEmail:'new-owner@gardenstate.test'});
  await assert.rejects(()=>s.seller.load(s.id),/not available/);
  await assert.rejects(()=>s.seller.message(s.id,'hello'),/not available/);
  await s.firm.update(s.id,{close:true});assert.equal((await s.firm.load(s.id)).portal.status,'Closed');
});

test('file checks reject oversize and unsupported files before any bytes are stored',async()=>{
  const s=await opened();const [r]=(await s.seller.load(s.id)).requests;
  await assert.rejects(()=>s.seller.upload(r.id,file('x','run.exe','application/x-msdownload')),/Use PDF/);
  const big=new File([new Uint8Array(P.fileLimits.maxBytes+1)],'big.pdf',{type:'application/pdf'});await assert.rejects(()=>s.seller.upload(r.id,big),/10 MB/);
  assert.equal((await s.seller.load(s.id)).files.length,0);
});
