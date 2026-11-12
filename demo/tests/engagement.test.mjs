import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sample} from '../lib/domain.ts';
import {hydrate} from '../lib/operating.ts';
import * as E from '../lib/engagement.ts';
import {dealStage} from '../lib/deals.ts';
import {localPortalStore,memoryBytes} from '../lib/portalStore.ts';

const w0=()=>hydrate(sample());
const q={hvac:true,njny:true,inRange:true,decisionMaker:true,partners:'',reason:'Retiring',timing:'Within a year',license:'Owner only',bookkeeper:true,threeYearsReturns:true,notes:'Good first call'};
const terms={successFeePct:8,successFeeMin:60000,feeBasis:E.feeBases[0],retainer:'none',exclusivityMonths:9,tailMonths:12,terminationDays:30,expenses:'Kalling pays its own expenses.'};
const input=()=>({...E.letterDefaults({id:'c',name:'Russo Heating & Air',owner:'Pat Russo',state:'NJ'},{advisorName:'Karan C',advisorEmail:'a@kalling.test',firmName:'Kalling',firmAddress:'1 Main Street, Green Brook, NJ 08812',today:'2026-11-12'}),terms:{...terms}});
function kv(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}

test('qualifying moves a lead to Qualified; not a fit needs a reason and moves it to Lost',()=>{
  let w=w0();const id=w.companies[0].id;
  assert.throws(()=>E.qualify(w,id,{...q,decisionMaker:false},'Karan'),/decision maker/);
  assert.throws(()=>E.qualify(w,id,{...q,reason:''},'Karan'),/why the owner/);
  w=E.qualify(w,id,q,'Karan');const c=w.companies[0];
  assert.equal(dealStage(c),'Qualified');assert.equal(c.qualification.outcome,'Qualified');assert.equal(c.qualification.by,'Karan');assert.match(w.events[0].text,/Lead to Qualified/);
  let w2=w0();assert.throws(()=>E.markNotFit(w2,id,'Bad reason','x y z','K'),/Choose why/);assert.throws(()=>E.markNotFit(w2,id,'Owner is not ready to sell','','K'),/note/);
  w2=E.markNotFit(w2,id,'Owner is not ready to sell','Wants to wait two years','K');assert.equal(dealStage(w2.companies[0]),'Lost');assert.equal(w2.companies[0].qualification.notFit,'Owner is not ready to sell');
});

test('the letter cannot be rendered with empty fees, and the same input gives the same text',()=>{
  const i=input();i.terms=E.emptyTerms();
  const p=E.letterProblems(i);for(const re of [/success fee percentage/,/minimum success fee/,/how the success fee/,/retainer/,/exclusivity/,/tail period/,/termination notice/,/expenses/])assert.ok(p.some(x=>re.test(x)),String(re));
  assert.throws(()=>E.renderLetter(i),/success fee/);
  const ok=input();assert.deepEqual(E.letterProblems(ok),[]);
  const t1=E.renderLetter(ok),t2=E.renderLetter(input());assert.equal(t1,t2);
  assert.match(t1,/8% of the total purchase price/);assert.match(t1,/minimum of \$60,000/);assert.match(t1,/There is no retainer/);assert.match(t1,/State of New Jersey/);assert.match(t1,/not sent to outside AI services/);assert.match(t1,new RegExp(E.LETTER_TEMPLATE_VERSION));
  assert.doesNotMatch(t1,/—|–/,'no em or en dashes');
  assert.match(E.renderLetter({...ok,terms:{...terms,retainer:5000}}),/retainer of \$5,000/);
  assert.ok(E.sameName('  pat   russo','Pat Russo'));assert.ok(!E.sameName('Pat','Pat Russo'));
});

test('prefilled requests: last full years, ten business days, region wording',()=>{
  assert.deepEqual(E.lastFullYears('2026-11-12'),[2023,2024,2025]);assert.deepEqual(E.lastFullYears('2027-01-03'),[2024,2025,2026]);
  assert.equal(E.addBusinessDays('2026-11-12',10),'2026-11-26');assert.equal(E.addBusinessDays('2026-11-14',1),'2026-11-16','Saturday to Monday');
  const r=E.prefilledRequests({today:'2026-11-12',region:'Central Jersey',contact:{name:'Karan C',email:'a@kalling.test'}});
  assert.equal(r.length,6);assert.equal(r[0].title,'Profit and loss statements for 2023, 2024 and 2025');assert.match(r[2].title,/2026/);
  assert.ok(r.every(x=>x.due==='2026-11-26'&&x.sharing===E.dataRoomSharing&&x.contact.email==='a@kalling.test'));
  assert.match(r.find(x=>x.title==='Licenses and insurance').needed,/New Jersey Master HVACR/);
  assert.match(E.licenseWording('New York City'),/FDNY/);assert.match(E.licenseWording('Long Island'),/Nassau or Suffolk/);
  assert.match(r.find(x=>x.title==='Maintenance agreement list').needed,/renewal month/);
  const all=E.hvacRequestTemplates({today:'2026-11-12'});assert.ok(['customers','equipment','lease','payroll','lossruns','vendors','warranty'].every(k=>all.find(t=>t.key===k)?.round==='Second round'));
});

test('local store: draft, ready, viewed, signed, countersigned opens the requests',async()=>{
  const k=kv(),bytes=memoryBytes();
  const firm=localPortalStore({actor:{side:'firm',name:'Karan C',email:'a@kalling.test'},firmId:'f',firmName:'Kalling',team:['a@kalling.test'],kv:k,bytes});
  const p=await firm.create({companyId:'c1',businessName:'Russo Heating & Air',ownerName:'Pat Russo',ownerEmail:'pat@russohvac.test',help:{name:'Karan C',email:'a@kalling.test'}});
  await firm.setRequestsHidden(p,true);for(const r of E.prefilledRequests({today:'2026-11-12',region:'Central Jersey',contact:{name:'Karan C',email:'a@kalling.test'}}))await firm.saveRequest(p,r);
  const text=E.renderLetter(input());const l=await firm.saveLetter(p,{templateVersion:E.LETTER_TEMPLATE_VERSION,input:input(),text});
  await assert.rejects(()=>firm.saveLetter(p,{templateVersion:'x',input:input(),text}),/already has an open/);
  const token=await firm.invite(p);const seller=localPortalStore({actor:{side:'seller',name:'Pat Russo',email:'pat@russohvac.test'},firmId:'f',firmName:'Kalling',team:['a@kalling.test'],kv:k,bytes});await seller.acceptInvite('pat@russohvac.test',token);
  let b=await seller.load(p);assert.equal(b.letters.length,0,'drafts hidden');assert.equal(b.requests.length,0,'requests hidden');
  await firm.letterReady(l);await assert.rejects(()=>firm.saveLetter(p,{id:l,templateVersion:'x',input:input(),text:text+'!'}),/Only a draft/);
  await seller.letterViewed(l);b=await seller.load(p);assert.equal(b.letters[0].status,'Viewed by owner');assert.equal(b.letters[0].textHash,createHash('sha256').update(text).digest('hex'));
  const rid=(await firm.load(p)).requests[0].id;await assert.rejects(()=>seller.sellerNote(rid,'hi'),/open after the engagement letter/);
  await assert.rejects(()=>seller.signLetter(l,'Pat R',true),/exactly/);await assert.rejects(()=>seller.signLetter(l,'Pat Russo',false),/Agree/);
  await seller.signLetter(l,'pat russo',true);await assert.rejects(()=>seller.countersignLetter(l,'Karan C',true),/firm/);
  await assert.rejects(()=>firm.countersignLetter(l,'Pat Russo',true),/advisor/);await firm.countersignLetter(l,'Karan C',true);
  b=await seller.load(p);assert.equal(b.letters[0].status,'Countersigned');assert.equal(b.requests.length,6);assert.deepEqual(b.letters[0].events.map(e=>e.status),['Draft','Ready to sign','Viewed by owner','Signed by owner','Countersigned']);
  await assert.rejects(()=>firm.voidLetter(l,'changed my mind'),/cannot be voided/);
});

test('the signed letter PDF has the letter and a certificate page with the hash',async()=>{
  const {letterPdf,pdfSafe}=await import('../lib/pdf.ts');const {PDFDocument}=await import('pdf-lib');
  const text=E.renderLetter(input()),at='2026-11-12T15:00:00.000Z';
  const l={id:'l',portalId:'p',version:1,templateVersion:E.LETTER_TEMPLATE_VERSION,input:input(),text,textHash:createHash('sha256').update(text).digest('hex'),status:'Countersigned',events:[{status:'Draft',at,by:'Karan C'},{status:'Countersigned',at,by:'a@kalling.test'}],ownerSignature:{name:'Pat Russo',email:'pat@russohvac.test',at,consent:true},firmSignature:{name:'Karan C',email:'a@kalling.test',at,consent:true},createdAt:at,updatedAt:at};
  const blob=await letterPdf(l),bytes=new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
  const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>=2);assert.equal(doc.getTitle(),'Engagement letter v1');
  assert.equal(pdfSafe('Owner’s “name” — ok…'),"Owner's \"name\" - ok...");
});
