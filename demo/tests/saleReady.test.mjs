import test from 'node:test';import assert from 'node:assert/strict';
import {saleReadyReport,draftNote} from '../lib/saleReady.ts';
import {estimateHvacValue} from '../lib/hvacValuation.ts';

const inputs={revenue:2600000,ownerPay:168000,netProfit:243000,addBacks:0,maintenancePct:30,agreements:120,commercialPct:15,newConstructionPct:20,technicians:3,ownerRole:'runs-everything',topCustomerPct:18,years:10,trend:'growing',licenseHolder:'owner-only'};
const input=(over={})=>({businessName:'Russo Heating & Air',inputs,addBacks:[{item:'One-time settlement',amount:40000,evidence:'pl-2025.pdf, page 1'},{item:'Personal vehicle',amount:12000,evidence:''}],basisSources:{revenue:'pl-2025.pdf, page 1'},requests:[{title:'Profit and loss statements',status:'Accepted'},{title:'Tax returns',status:'Submitted'},{title:'Licenses',status:'Not applicable'},{title:'Team overview',status:'Open'}],asOf:'2026-11-24',...over});

test('the value uses the itemised add-backs, not the input field',()=>{
  const r=saleReadyReport(input({inputs:{...inputs,addBacks:999999}}));
  assert.equal(r.valuation.sde,168000+243000+52000);
  assert.deepEqual(r.valuation,estimateHvacValue({...inputs,addBacks:52000}));
});

test('every drag is a positive, code-computed change in the mid estimate, largest first',()=>{
  const r=saleReadyReport(input());
  assert.ok(r.drags.length>=5);
  for(const d of r.drags){assert.ok(d.gainMid>0,d.key);assert.ok(d.assumption.length>10);}
  assert.deepEqual(r.drags.map(d=>d.gainMid),[...r.drags.map(d=>d.gainMid)].sort((a,b)=>b-a));
  const lic=r.drags.find(d=>d.key==='license');
  assert.equal(lic.gainMid,estimateHvacValue({...inputs,addBacks:52000,licenseHolder:'owner-and-employee'}).mid-r.valuation.mid);
});

test('a well-run business shows no invented drags',()=>{
  const clean={...inputs,maintenancePct:70,agreements:900,newConstructionPct:0,technicians:9,ownerRole:'manager-runs-day-to-day',topCustomerPct:5,licenseHolder:'employee'};
  const r=saleReadyReport(input({inputs:clean,addBacks:[{item:'Settlement',amount:40000,evidence:'tax-returns.pdf, page 2'}]}));
  assert.deepEqual(r.drags,[]);
});

test('undocumented add-backs show the value at risk',()=>{
  const r=saleReadyReport(input()),d=r.drags.find(x=>x.key==='addbacks');
  assert.match(d.title,/\$12,000 of add-backs/);
  assert.equal(d.gainMid,r.valuation.mid-estimateHvacValue({...inputs,addBacks:40000}).mid);
});

test('readiness counts accepted and not-applicable requests',()=>{
  const r=saleReadyReport(input());
  assert.deepEqual(r.readiness,{done:2,total:4,pct:50,missing:['Tax returns','Team overview']});
  assert.equal(r.basis[0].source,'pl-2025.pdf, page 1');
  assert.equal(r.basis[3].source,'2 items, 1 documented');
});

test('the drafted note states the range, the top fix and the next record, and says it is an estimate',()=>{
  const r=saleReadyReport(input()),n=draftNote(r,'Pat');
  assert.match(n,/^Pat, here is where/);assert.match(n,/2 of 4 records are in\. Next up: Tax returns\./);
  assert.match(n,/not an appraisal or an offer\.$/);
  const later=saleReadyReport(input({inputs:{...inputs,licenseHolder:'owner-and-employee'}}));
  assert.match(draftNote(later,'Pat',r),/That is up \$/);
});
