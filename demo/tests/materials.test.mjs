import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from '../lib/domain.ts';
import {hydrate} from '../lib/operating.ts';
import * as R from '../lib/recastDraft.ts';
import * as M from '../lib/materials.ts';
import * as C from '../lib/cim.ts';
import {saveRecast,recastSde,recastDiff,defaultInputs} from '../lib/deals.ts';

const L=(year,field,amount,o={})=>({year,field,label:field,amount,fileId:o.file||'pl-'+year,name:o.name||`pl-${year}.pdf`,page:1,excerpt:`${field} ${amount.toLocaleString('en-US')}`,confidence:'high',...o});
const lines=[
  L(2024,'revenue',2450000),L(2024,'netIncome',285000),L(2024,'ownerSalary',145000),L(2024,'depreciation',44000),L(2024,'interest',16000),L(2024,'taxIncome',267900,{file:'tax',name:'tax.pdf'}),
  L(2025,'revenue',2600000),L(2025,'netIncome',310000),L(2025,'ownerSalary',150000),L(2025,'ownerHealth',18000),L(2025,'depreciation',46000),L(2025,'interest',14000),L(2025,'taxIncome',306000,{file:'tax',name:'tax.pdf'}),
  L(2025,'addBack',40000,{category:'one-time legal',reason:'One-time lawsuit settlement.'}),L(2025,'addBack',52000,{category:'family payroll',reason:'Spouse does not work in the business.'}),L(2025,'addBack',9500,{category:'personal expense',reason:'Personal travel.'}),
];

test('the recast table is computed in code, with SDE and EBITDA per year and a trend',()=>{
  const t=R.recastTable(lines,[2024,2025]);const y=t.find(r=>r.year===2025);
  assert.equal(y.ownerPay,168000);assert.equal(y.addBacks,101500);assert.equal(y.sde,310000+168000+46000+14000+101500);assert.equal(y.ebitda,y.sde-168000);
  const tr=R.trend(t);assert.equal(tr.revenuePct,6.1);assert.equal(tr.label,'growing');
});
test('profit and loss figures that differ from the tax return by more than 2% are flagged with both citations',()=>{
  const m=R.mismatches(lines);assert.equal(m.length,1);assert.equal(m[0].year,2024);assert.equal(m[0].diffPct,6);assert.equal(m[0].taxCite.name,'tax.pdf');
});
test('weak add-backs ask the owner; skipped lines never reach the recast; edits are respected',()=>{
  const p=R.proposals(lines,[{kind:'pl'},{kind:'tax'}]);
  assert.equal(p.find(x=>x.item==='addBack'&&x.amount===9500)?.support??p.find(x=>x.amount===9500).support,'Ask the owner');
  assert.equal(p.find(x=>x.amount===52000).support,'Ask the owner');assert.equal(p.find(x=>x.amount===40000).support,'Supported');
  const dec=Object.fromEntries(p.map(x=>[x.id,{decision:x.amount===52000?'skip':'accept'}]));dec[p.find(x=>x.amount===9500).id]={decision:'accept',amount:9000};
  const out=R.applyProposals({inputs:{...defaultInputs},addBacks:[],askingPrice:0},p,dec);
  assert.equal(out.inputs.revenue,2600000);assert.equal(out.inputs.netProfit,310000);assert.equal(out.inputs.ownerPay,168000);
  assert.ok(!out.addBacks.some(a=>a.amount===52000),'skipped');assert.ok(out.addBacks.some(a=>a.amount===9000),'edited');
  assert.ok(out.addBacks.every(a=>/page 1/.test(a.evidence)));
  assert.equal(recastSde({inputs:out.inputs,addBacks:out.addBacks.map((a,i)=>({...a,id:String(i)}))}),310000+168000+46000+14000+40000+9000);
});
test('applying a draft makes a new recast version and keeps the old one with a diff',()=>{
  let w=hydrate(sample());const id=w.companies[0].id;
  w=saveRecast(w,id,{inputs:{...defaultInputs,revenue:2e6,netProfit:200000,ownerPay:100000},addBacks:[],askingPrice:0},'Karan');
  w=saveRecast(w,id,{inputs:{...defaultInputs,revenue:2.6e6,netProfit:310000,ownerPay:168000},addBacks:[{item:'Lawsuit',amount:40000,reason:'One-time settlement',evidence:'pl-2025.pdf, page 1'}],askingPrice:0},'Karan','draft');
  const c=w.companies[0];assert.equal(c.recast.version,2);assert.equal(c.recast.source,'draft');assert.equal(c.recastHistory.length,1);assert.equal(c.recastHistory[0].version,1);
  const d=recastDiff(c.recastHistory[0],c.recast);assert.ok(d.some(x=>/Revenue \$2,000,000 to \$2,600,000/.test(x)));assert.ok(d.some(x=>/Added Lawsuit/.test(x)));
  assert.match(w.events[0].text,/applied reviewed lines/);
});
test('drafts are recorded, go stale when inputs change, and can be used anyway with a note',()=>{
  let w=hydrate(sample());const id=w.companies[0].id;
  w=M.recordDraft(w,id,{id:'draft-teaser-x',kind:'teaser',inputHash:'a'.repeat(64)},'K');const d=M.latestDraft(M.materialsOf(w.companies[0]),'teaser');
  assert.equal(d.status,'queued');assert.ok(!M.isStale(d,'a'.repeat(64)));assert.ok(M.isStale(d,'b'.repeat(64)));
  assert.throws(()=>M.useAnyway(w,id,d.id,'no','K'),/Say why/);w=M.useAnyway(w,id,d.id,'Only the asking price changed','K');
  assert.ok(!M.isStale(M.latestDraft(M.materialsOf(w.companies[0]),'teaser'),'b'.repeat(64)));
});
test('comparable sales: validation, CSV import and closed deals',()=>{
  let w=hydrate(sample());assert.throws(()=>M.saveComp(w,{businessType:'HVAC'},'K'),/state/);
  w=M.saveComp(w,{businessType:'Residential HVAC',state:'NJ',region:'Central Jersey',year:2025,revenue:2.4e6,sde:470000,price:1650000,source:'Seller’s broker'},'K');assert.equal(M.compsOf(w).length,1);assert.equal(M.compMultiple(M.compsOf(w)[0]),3.51);
  const csv='business_type,region,state,year,revenue,sde,price,source,source_url\nResidential HVAC,Long Island,NY,2024,"$3,100,000",600000,2100000,Public report,https://example.org/r\nPlumbing,,NJ,2024,1,0,5,x,';
  const r=M.parseCompsCsv(csv,'K');assert.equal(r.comps.length,1);assert.equal(r.comps[0].revenue,3100000);assert.equal(r.errors.length,1);assert.match(r.errors[0],/Row 3/);
  assert.match(M.parseCompsCsv('a,b\n1,2','K').errors[0],/business_type/);
  const c=M.closedDealComp({name:'Russo',industry:'HVAC',state:'NJ',region:'Central Jersey',recast:{inputs:{...defaultInputs,revenue:2.6e6,netProfit:310000,ownerPay:168000,maintenancePct:55},addBacks:[{id:'1',item:'x',amount:100000,reason:'r',evidence:''}],askingPrice:0}},1.9e6,'K',2026);
  assert.equal(c.sde,578000);assert.equal(c.source,'Kalling closed deal');assert.deepEqual(M.validateComp(c),[]);
});
test('the memorandum assembles in order, cites sources, and will not release unconfirmed or private text',()=>{
  const w=hydrate(sample());const c={...w.companies[0],region:'Central Jersey',recast:{inputs:{...defaultInputs,revenue:2.6e6,netProfit:310000,ownerPay:168000},addBacks:[],askingPrice:0}};
  const sources=C.buildSources({company:c,answers:{portalId:'p',history:'Started in 2007.',services:'',strengths:'',team:'',afterSale:'Keep the team.',updatedAt:''},docs:[{fileId:'f',name:'agreements.csv',kind:'agreements',extract:{status:'ok',pages:[{page:1,text:'Comfort Club, 189'}]}}]});
  assert.ok(sources.some(s=>s.id==='Q1'&&/2007/.test(s.text)));assert.ok(sources.some(s=>s.id==='D1'));assert.ok(sources.some(s=>s.id==='F1'));
  const v=C.assembleCim({sources,company:c,actor:'K',draft:{history:[{text:'The business started in 2007 and grew steadily.',sources:['Q1'],needsConfirmation:false}],growth:[{text:'Kalling sees room to add commercial work.',sources:[],needsConfirmation:true}]}});
  assert.deepEqual(v.sections.map(s=>s.key),['cover','summary','history','services','agreements','customers','team','operations','financials','growth','transaction','disclaimers']);
  assert.match(v.sections.find(s=>s.key==='financials').paragraphs[1].text,/SDE \$478,000/);
  const ctx=C.companyContext(c,{customerNames:['Brookside Apartments']});
  assert.ok(C.releaseProblems(v,ctx).some(x=>/confirmation/.test(x)));
  // Advisor-entered financials have no file citations and require explicit confirmation.
  for(const p of v.sections.find(s=>s.key==='financials').paragraphs)if(p.needsConfirmation)p.confirmedNote='Advisor checked the financial year and figures with the owner.';
  v.sections.find(s=>s.key==='growth').paragraphs[0].confirmedNote='Discussed with the owner on the call.';
  assert.deepEqual(C.releaseProblems(v,ctx),[]);
  v.sections.find(s=>s.key==='history').paragraphs.push({text:'Brookside Apartments is the largest customer. Owner SSN 123-45-6789.',sources:['Q1'],needsConfirmation:false});
  const p=C.releaseProblems(v,ctx);assert.ok(p.some(x=>/Customer names/.test(x)));assert.ok(p.some(x=>/Social Security/.test(x)));
  assert.equal(C.canShareInDataRoom({...v,status:'Owner approved'}),false,'needs both approvals');
  assert.equal(C.canShareInDataRoom({...v,status:'Owner approved',advisorApproval:{by:'K',at:''},ownerApproval:{at:''}}),true);
  const v2=C.assembleCim({prev:v,sources,company:c,actor:'K',draft:{growth:[{text:'New text.',sources:['F1'],needsConfirmation:false}]},only:['growth']});
  assert.equal(v2.version,2);assert.match(v2.sections.find(s=>s.key==='history').paragraphs[0].text,/2007/,'other sections kept');assert.equal(v2.sections.find(s=>s.key==='growth').paragraphs[0].text,'New text.');
});
