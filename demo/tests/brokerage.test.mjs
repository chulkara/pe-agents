import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateHvacValue,sellerDiscretionaryEarnings,money} from '../lib/hvacValuation.ts';
import * as B from '../lib/brokerage.ts';
import {localBrokerStore,ndaHash} from '../lib/brokerStore.ts';
import {sampleListings} from '../lib/brokerageSamples.ts';

const base={revenue:2500000,ownerPay:180000,netProfit:280000,addBacks:20000,maintenancePct:55,agreements:900,commercialPct:15,newConstructionPct:5,technicians:8,ownerRole:'key-relationships',topCustomerPct:6,years:18,trend:'growing',licenseHolder:'owner-and-employee'};
function kv(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}
const advisor={kind:'advisor',name:'Karan',canWrite:true};
const profile={name:'Alex Morgan',phone:'',type:'Owner-operator',company:'',funds:'$500K to $1M',financing:['SBA 7(a) loan'],experience:'Ten years running field operations for a regional mechanical contractor.',regions:['Central Jersey'],maxPrice:4000000};

test('valuation shows its work and rewards transferable, recurring businesses',()=>{
  const v=estimateHvacValue(base);
  assert.equal(v.sde,480000);assert.equal(sellerDiscretionaryEarnings(base),480000);
  assert.ok(v.low<v.mid&&v.mid<v.high);assert.ok(v.multipleLow>=2.8&&v.multipleHigh<=5.5,`${v.multipleLow}-${v.multipleHigh}`);
  assert.ok(v.adjustments.every(a=>a.why.length>10));
  const risky=estimateHvacValue({...base,maintenancePct:10,agreements:0,newConstructionPct:70,ownerRole:'runs-everything',technicians:1,topCustomerPct:35,trend:'declining',licenseHolder:'owner-only'});
  const strong=estimateHvacValue({...base,maintenancePct:80,agreements:3000,ownerRole:'manager-runs-day-to-day',technicians:12});
  assert.ok(risky.mid<v.mid&&v.mid<strong.mid);
  assert.ok(risky.adjustments.some(a=>a.label==='License continuity'&&/bona fide representative/.test(a.why)));
  assert.throws(()=>estimateHvacValue({...base,revenue:0}),/revenue/);
  assert.match(estimateHvacValue({...base,ownerPay:1500000}).warnings.join(' '),/unusual/);
  assert.equal(money(1650000),'$1.65M');assert.equal(money(620000),'$620K');
});

test('sample listings are labeled, consistent and pass the anonymity check',()=>{
  for(const l of sampleListings){assert.equal(l.sample,true);assert.ok(l.askingPrice/l.sde>2&&l.askingPrice/l.sde<5,l.number);assert.deepEqual(B.publishProblems(l),[],l.number);}
});

test('public visitors see teasers only; drafts and confidential fields stay hidden',async()=>{
  const k=kv(),adv=localBrokerStore(advisor,k),pub=localBrokerStore({kind:'public'},k);
  const id=await adv.saveListing({headline:'Draft HVAC company',confidential:{businessName:'Secret Heating Co',city:'Edison',website:'secretheating.com',details:'x'}});
  assert.ok(!(await pub.listings()).some(l=>l.id===id));
  await assert.rejects(()=>pub.listing(id),/not available/);
  const l=await pub.listing('KL-1047');assert.equal(l.confidential.businessName,'');assert.equal(l.access,'None');
  assert.deepEqual(B.filterListings(await pub.listings(),{state:'NY'}).map(x=>x.number).sort(),['KL-1029','KL-1035','KL-1041']);
  assert.equal(B.filterListings(await pub.listings(),{maxPrice:1000000})[0].number,'KL-1038');
  assert.equal(B.filterListings(await pub.listings(),{sort:'sde-desc'})[0].number,'KL-1044');
});

test('publishing blocks identifying details in the public teaser',async()=>{
  const k=kv(),adv=localBrokerStore(advisor,k);
  const id=await adv.saveListing({headline:'Edison residential HVAC company',summary:'x'.repeat(130),askingPrice:1e6,revenue:2e6,sde:3e5,highlights:['a','b','c'],confidential:{businessName:'Secret Heating Co',city:'Edison',website:'https://www.secretheating.com/',details:''}});
  await assert.rejects(()=>adv.setStatus(id,'Live'),/mentions “edison”/);
  await adv.saveListing({id,headline:'Central Jersey residential HVAC company'});await adv.setStatus(id,'Live');
  assert.equal((await localBrokerStore({kind:'public'},k).listing(id)).status,'Live');
  await assert.rejects(()=>localBrokerStore({kind:'buyer',email:'a@b.co'},k).setStatus(id,'Sold'),/advisor/);
});

test('buyer journey: profile, NDA signature, approval, questions and offers',async()=>{
  const k=kv(),adv=localBrokerStore(advisor,k),buyer=localBrokerStore({kind:'buyer',email:'alex@buyer.test'},k);
  const l=await buyer.listing('KL-1047');
  await assert.rejects(()=>buyer.requestAccess(l,'Alex Morgan',true,''),/buyer profile/);
  await assert.rejects(()=>buyer.saveProfile({...profile,experience:'short'}),/background/);
  await buyer.saveProfile(profile);
  await assert.rejects(()=>buyer.requestAccess(l,'Alex',true,''),/exactly/);
  await assert.rejects(()=>buyer.requestAccess(l,'Alex Morgan',false,''),/Agree/);
  await buyer.requestAccess(l,'alex morgan',true,'Interested in Central Jersey residential service.');
  const [req]=await adv.requests();assert.equal(req.status,'Pending');assert.equal(req.nda.textHash,await ndaHash(l));assert.equal(req.nda.version,B.ndaVersion);
  await assert.rejects(()=>buyer.ask(l.id,'How many agreements renew in Q1?'),/wait for approval/);
  assert.equal((await buyer.listing(l.id)).confidential.businessName,'');
  await adv.decide(req.id,'Approved','Welcome.');
  assert.match((await buyer.listing(l.id)).confidential.businessName,/Sample listing/);
  await buyer.ask(l.id,'How many agreements renew in Q1?');await adv.ask(l.id,'About 40%.',req.buyerId);
  assert.equal((await buyer.questions(l.id)).length,2);
  await assert.rejects(()=>buyer.offer(l.id,{kind:'Letter of intent',price:3e6,cashAtClose:2e6,sellerNote:5e5,earnout:0,financing:'SBA',closeDays:90,conditions:''}),/add up/);
  await buyer.offer(l.id,{kind:'Letter of intent',price:3e6,cashAtClose:2.5e6,sellerNote:5e5,earnout:0,financing:'SBA 7(a)',closeDays:90,conditions:'Subject to diligence'});
  const [o]=await adv.offers();await assert.rejects(()=>localBrokerStore({kind:'buyer',email:'other@x.co'},k).setOffer(o.id,'Withdrawn',''),/your own/);
  await adv.setOffer(o.id,'Accepted','Seller accepted.');
  assert.equal((await adv.listing(l.id)).status,'Under LOI');
  const me=await buyer.me();assert.equal(me.offers[0].status,'Accepted');assert.equal(me.access[0].status,'Approved');
  await buyer.toggleSaved(l.id);assert.deepEqual((await buyer.me()).buyer.saved,[l.id]);
  await adv.vet(me.buyer.id,'Restricted','Breached NDA');assert.equal((await buyer.listing(l.id)).confidential.businessName,'','restricted buyers lose access');
});

test('leads need consent, valid contact details and are rate limited per email',async()=>{
  const k=kv(),pub=localBrokerStore({kind:'public'},k),adv=localBrokerStore(advisor,k);
  const lead={name:'Pat Owner',email:'pat@hvac.test',phone:'',businessName:'',region:'North Jersey',timing:'Within a year',message:'',source:'valuation',consent:true,valuation:{sde:480000,low:1.5e6,mid:1.7e6,high:1.9e6,revenue:2.5e6}};
  await assert.rejects(()=>pub.submitLead({...lead,consent:false}),/agree/);
  await assert.rejects(()=>pub.submitLead({...lead,email:'bad'}),/valid email/);
  for(let i=0;i<3;i++)await pub.submitLead(lead);
  await assert.rejects(()=>pub.submitLead(lead),/already have your request/);
  await assert.rejects(()=>pub.leads(),/advisor/);
  const [l]=await adv.leads();assert.equal(l.status,'New');await adv.updateLead(l.id,{status:'Contacted',notes:'Called Tuesday'});
  assert.equal((await adv.leads())[0].notes,'Called Tuesday');
});
