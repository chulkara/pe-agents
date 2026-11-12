import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from '../lib/domain.ts';
import {hydrate} from '../lib/operating.ts';
import * as D from '../lib/deals.ts';
import {localPortalStore,memoryBytes} from '../lib/portalStore.ts';
import {requestTemplates} from '../lib/portal.ts';

const w0=()=>hydrate(sample());
const lead={id:'lead-1',createdAt:'2026-11-10T12:00:00.000Z',name:'Pat Russo',email:'pat@russohvac.test',phone:'908-555-0100',businessName:'Russo Heating & Air',region:'Central Jersey',timing:'Within a year',message:'Thinking about retiring.',valuation:{sde:480000,low:1.5e6,mid:1.7e6,high:1.9e6,revenue:2.5e6},status:'New',notes:'',source:'valuation'};

test('stages map from existing records and stored stages win',()=>{
  const c=w0().companies[0];
  assert.equal(D.dealStage(c),'Lead');
  assert.equal(D.dealStage({...c,status:'Interested'}),'Qualified');
  assert.equal(D.dealStage({...c,status:'Passed'}),'Lost');
  assert.equal(D.dealStage(c,{portal:{status:'Active'}}),'Engaged');
  assert.equal(D.dealStage(c,{portal:{status:'Closed'}}),'Lead');
  assert.equal(D.dealStage(c,{listing:{status:'Draft'}}),'Preparing');
  assert.equal(D.dealStage(c,{listing:{status:'Live'}}),'Listed');
  assert.equal(D.dealStage(c,{listing:{status:'Under LOI'}}),'Under LOI');
  assert.equal(D.dealStage(c,{listing:{status:'Sold'}}),'Closed');
  assert.equal(D.dealStage({...c,sellStage:'Preparing'},{listing:{status:'Live'}}),'Preparing');
});

test('moving stages is logged; closed and lost deals reopen only as qualified',()=>{
  let w=w0();const id=w.companies[0].id;
  w=D.setStage(w,id,'Qualified','Karan');
  assert.equal(w.companies[0].sellStage,'Qualified');assert.match(w.events[0].text,/from Lead to Qualified/);
  assert.equal(D.daysInStage(w.companies[0]),0);
  assert.throws(()=>D.setStage(w,id,'Qualified','Karan'),/already Qualified/);
  w=D.setStage(w,id,'Closed','Karan');
  assert.throws(()=>D.setStage(w,id,'Listed','Karan'),/Reopen/);
  w=D.setStage(w,id,'Qualified','Karan');assert.equal(D.dealStage(w.companies[0]),'Qualified');
  for(const s of D.sellStages){assert.ok(D.stageChecklist[s].length>=2);assert.ok(D.primaryAction[s].label);}
});

test('a lead becomes an engaged company with a portal and standard requests',async()=>{
  const {workspace,companyId}=D.startEngagement(w0(),lead,'Karan');
  const c=workspace.companies.find(x=>x.id===companyId);
  assert.equal(c.name,'Russo Heating & Air');assert.equal(c.state,'NJ');assert.equal(c.owner,'Pat Russo');assert.equal(c.email,'pat@russohvac.test');
  assert.equal(D.dealStage(c),'Engaged');assert.equal(c.leadId,'lead-1');assert.equal(c.recast.inputs.revenue,2.5e6);
  assert.equal(D.recastSde(c.recast),480000);
  assert.match(c.conversations[0].body,/retiring/);
  assert.throws(()=>D.startEngagement(workspace,lead,'Karan'),/already has an engagement/);
  // The UI then drafts the portal with the standard templates.
  const m=new Map(),kv={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};
  const store=localPortalStore({actor:{side:'firm',name:'Karan',email:'k@kalling.test'},firmId:'f',firmName:'Kalling',team:['k@kalling.test'],kv,bytes:memoryBytes()});
  const portalId=await D.draftEngagementPortal(store,c,{name:'Karan',email:'k@kalling.test'});
  const b=await store.load(portalId);assert.equal(b.portal.status,'Draft');assert.equal(b.portal.ownerEmail,'pat@russohvac.test');
  assert.equal(b.requests.length,6);assert.deepEqual(b.requests.map(r=>r.title),requestTemplates.slice(0,6).map(t=>t.title));
  assert.ok(b.requests.every(r=>r.sharing.length>10&&r.contact.email==='k@kalling.test'));
});

test('add-backs feed earnings and the valuation, and need a reason',()=>{
  let w=w0();const id=w.companies[0].id;
  const inputs={...D.defaultInputs,revenue:2e6,ownerPay:150000,netProfit:200000};
  assert.throws(()=>D.saveRecast(w,id,{inputs,addBacks:[{item:'Lawsuit',amount:40000,reason:''}],askingPrice:0},'K'),/Explain why/);
  w=D.saveRecast(w,id,{inputs,addBacks:[{item:'One-time lawsuit',amount:40000,reason:'Settled in 2025, will not recur',evidence:'2025 P&L line 61'},{item:'Owner’s spouse salary',amount:60000,reason:'Spouse does not work in the business'}],askingPrice:1500000},'K');
  const r=w.companies[0].recast;assert.equal(D.recastSde(r),450000);assert.equal(D.recastInputs(r).addBacks,100000);
  const v=D.recastValuation(r);assert.equal(v.sde,450000);
  assert.equal(D.askingVersusEstimate(1500000,v).position,v.low<=1500000&&1500000<=v.high?'within':1500000<v.low?'below':'above');
  assert.equal(D.askingVersusEstimate(v.high+1,v).position,'above');assert.equal(D.askingVersusEstimate(1,v).position,'below');
  assert.match(w.events[0].text,/saved the recast/);
});

test('offer comparison puts live offers first, then price and cash',()=>{
  const o=(id,status,price,cash)=>({id,status,price,cashAtClose:cash,createdAt:'2026-11-0'+id});
  const sorted=D.compareOffers([o(1,'Declined',5e6,5e6),o(2,'Submitted',3e6,2e6),o(3,'Submitted',3e6,2.5e6),o(4,'Shared with seller',2.8e6,2e6),o(5,'Withdrawn',9e6,9e6)]);
  assert.deepEqual(sorted.map(x=>x.id),[4,3,2,1,5]);
  assert.equal(D.cashShare({price:3e6,cashAtClose:2.4e6}),80);
});
