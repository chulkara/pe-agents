import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as D from '../lib/drafting.ts';
import {extractText} from '../lib/extract.ts';
import {runLocalDraft} from '../scripts/local-drafting.mjs';
import {fakeRequest} from '../e2e/fake-model.mjs';
import {workerVersion} from '../scripts/worker-core.mjs';

const pdf=()=>import('pdfjs-dist/legacy/build/pdf.mjs');
const company={id:'co-russo',name:'Russo Heating & Air',region:'Central Jersey',state:'NJ',industry:'HVAC'};
async function docs(){const out=[];for(const [n,kind] of [['pl-2023.pdf','pl'],['pl-2024.pdf','pl'],['pl-2025.pdf','pl'],['tax-returns.pdf','tax']]){const e=await extractText(n,new Uint8Array(await readFile(new URL('../e2e/fixtures/'+n,import.meta.url))),n,'application/pdf',{pdf});out.push({fileId:n,name:n,kind,textHash:e.textHash,pages:e.pages});}return out;}
async function temp(fn){const d=await mkdtemp(join(tmpdir(),'kalling-draft-'));try{return await fn(d);}finally{await rm(d,{recursive:true,force:true});}}

test('packets have stable ids and fingerprints; validation checks type, ids and size',async()=>{
  const a=await D.makePacket('teaser',company,{facts:{region:'Central Jersey'}}),b=await D.makePacket('teaser',company,{facts:{region:'Central Jersey'}});
  assert.equal(a.id,b.id);assert.equal(a.inputHash,b.inputHash);assert.notEqual((await D.makePacket('teaser',company,{facts:{region:'North Jersey'}})).inputHash,a.inputHash);
  assert.equal(D.stable({b:1,a:[{d:2,c:1}]}),'{"a":[{"c":1,"d":2}],"b":1}');
  assert.throws(()=>D.validateDraftPacket({...a,playbook:'local-cim-v1'}),/does not match/);
  assert.throws(()=>D.validateDraftPacket({...a,data:{x:'y'.repeat(130000)}}),/too large/);
  assert.ok(D.validateDraftPacket({...(await D.makePacket('cim',company,{x:'y'.repeat(300000)}))}));
  assert.equal(D.packetLimit('recast'),600000);assert.equal(D.packetLimit('teaser'),120000);
});

test('the worker is new enough for drafting, and older versions are refused',()=>{
  assert.equal(workerVersion,'kalling-worker-2');assert.ok(D.supportsDrafting(workerVersion));assert.ok(!D.supportsDrafting('kalling-worker-1'));assert.ok(!D.supportsDrafting(undefined));
  assert.match(D.workerUpdateCommand,/kalling-worker\.mjs install/);
});

test('documents split into page groups within the context budget',async()=>{
  const big=[{fileId:'f',name:'big.pdf',kind:'pl',textHash:'h',pages:Array.from({length:12},(_,i)=>({page:i+1,text:'x'.repeat(6000)}))}];
  const g=D.pageGroups(big,8000);assert.ok(g.length>=3);assert.ok(g.every(x=>x.pages.reduce((n,p)=>n+p.text.length,0)<=8000*3.2));
  assert.deepEqual(g.flatMap(x=>x.pages.map(p=>p.page)),Array.from({length:12},(_,i)=>i+1));
});

test('recast draft reads the fixtures and keeps only cited figures',async()=>temp(async dir=>{
  const p=await D.makePacket('recast',company,{documents:await docs(),years:[2023,2024,2025]});
  const labels=[];const {result}=await runLocalDraft(p,{stateDir:dir,request:fakeRequest(),onProgress:e=>e.label&&labels.push(e.label)});
  assert.equal(result.kind,'recast');assert.equal(result.executionPolicy,'local-only-required-v2');
  const find=(y,f)=>result.lines.filter(l=>l.year===y&&l.field===f);
  assert.equal(find(2025,'revenue')[0].amount,2600000);assert.equal(find(2025,'ownerSalary')[0].amount,150000);assert.equal(find(2024,'taxIncome').length,1);
  assert.ok(find(2025,'addBack').some(l=>l.amount===40000&&l.category==='one-time legal'));
  assert.ok(result.rejected>=3,'the planted wrong amounts are dropped');assert.ok(!result.lines.some(l=>l.amount===9999999));
  assert.ok(result.lines.every(l=>l.excerpt&&l.page>=1&&l.fileId));
  assert.ok(labels.some(l=>/Reading pl-2024\.pdf, page 1/.test(l)));
}));

test('invalid JSON is retried with the error, then fails plainly',async()=>temp(async dir=>{
  const base=fakeRequest();let chats=0;const request=async(path,body,s)=>{if(path==='/api/chat'&&++chats===1)return {done:true,done_reason:'stop',prompt_eval_count:1,eval_count:1,message:{content:'not json'}};if(path==='/api/chat')assert.match(body.messages.at(-1).content,/rejected/);return base(path,body,s);};
  const p=await D.makePacket('teaser',company,{facts:{region:'Central Jersey',agreements:850,technicians:4,years:18,recurringPct:55,reason:'Retiring'}});
  const {result}=await runLocalDraft(p,{stateDir:dir,request});assert.equal(chats,2);assert.match(result.teaser.headline,/Central Jersey/);
  const p2=await D.makePacket('teaser',company,{facts:{region:'North Jersey'}});const bad=async(path,body,s)=>path==='/api/chat'?{done:true,done_reason:'stop',prompt_eval_count:1,eval_count:1,message:{content:'{}'}}:base(path,body,s);
  await assert.rejects(()=>runLocalDraft(p2,{stateDir:dir,request:bad}),/after three tries/);
}));

test('memorandum sections cite supplied sources; paragraphs without sources need confirmation',async()=>temp(async dir=>{
  const sources=[{id:'F1',label:'Fact',text:'Region: Central Jersey'},{id:'Q1',label:'Owner answer',text:'Founded in 2007 by Pat Russo. Residential service and replacement.'},{id:'D1',label:'agreements.csv',text:'Comfort Club, 189, renews automatically'}];
  const p=await D.makePacket('cim',company,{sources,sections:['history','growth']});
  const {result}=await runLocalDraft(p,{stateDir:dir,request:fakeRequest()});
  assert.ok(result.sections.history[0].sources.length>0);assert.equal(result.sections.history[0].needsConfirmation,false);
  assert.equal(result.sections.growth[0].needsConfirmation,true);
  assert.deepEqual(D.validateCimSection({paragraphs:[{text:'A paragraph that cites a source that does not exist.',sources:['Z9']}]},sources)[0].sources,[]);
}));

test('comparable sales: ranking is deterministic and fewer than three gives a plain message',async()=>temp(async dir=>{
  const mk=(id,o={})=>({id,businessType:'Residential HVAC',region:'Central Jersey',state:'NJ',year:2025,revenue:2500000,sde:480000,price:1700000,notes:'',source:'Kalling closed deal',recordedAt:'2026-01-01',recordedBy:'K',status:'confirmed',...o});
  const subject={businessType:'Residential HVAC',region:'Central Jersey',state:'NJ',revenue:2600000,sde:500000,year:2026};
  const lib=[mk('c1'),mk('c2',{region:'Long Island',state:'NY'}),mk('c3',{revenue:400000,sde:90000,price:250000}),mk('c4',{businessType:'Plumbing'}),mk('c5',{status:'candidate'})];
  const r=D.rankComps(subject,lib);assert.equal(r[0].comp.id,'c1');assert.ok(!r.some(x=>x.comp.id==='c5'),'unconfirmed comps never count');
  assert.equal(D.compMultiple({price:1700000,sde:480000}),3.54);assert.equal(D.compMultiple({price:1,sde:0}),null);
  const few=await D.makePacket('comps',company,{subject,ranked:r.slice(0,2)});const out=await runLocalDraft(few,{stateDir:dir,request:fakeRequest()});assert.equal(out.result.commentary,D.fewCompsMessage);
  const ranked=r.map(x=>({...x,multiple:D.compMultiple(x.comp)}));const full=await D.makePacket('comps',company,{subject,ranked});const o2=await runLocalDraft(full,{stateDir:dir,request:fakeRequest()});
  assert.ok(o2.result.cited.every(id=>ranked.some(x=>x.comp.id===id)));
  const page={url:'https://example.org/sold',text:'Sold listings. Residential HVAC company in Monmouth County, NJ sold in 2024 for $1,650,000 on $2,400,000 revenue and $470,000 SDE.'};
  const ex=await runLocalDraft(await D.makePacket('comps',company,{mode:'extract',page}),{stateDir:dir,request:fakeRequest()});
  assert.equal(ex.result.candidates.length,1);assert.equal(ex.result.candidates[0].price,1650000);
  assert.equal(D.validateCompCandidates({candidates:[{businessType:'HVAC',price:999,excerpt:'not on the page at all'}]},page).length,0);
}));

test('amounts are matched exactly, including M and K',()=>{
  assert.ok(D.amountIn('Net income before tax 310,000',310000));assert.ok(!D.amountIn('Net income before tax 310,000',31000));
  assert.ok(D.amountIn('sold for $1.65M',1650000));assert.ok(D.amountIn('about 90K',90000));
});
