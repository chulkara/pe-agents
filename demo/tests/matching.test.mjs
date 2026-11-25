import test from 'node:test';import assert from 'node:assert/strict';
import {fit,matchBuyers,matchListings,cashNeeded,fitSummary} from '../lib/matching.ts';

const listing=(o={})=>({id:'l1',number:'KL-1',status:'Live',sample:true,headline:'Residential HVAC',region:'Central Jersey',focus:'Residential service & replacement',askingPrice:1800000,revenue:2600000,sde:463000,established:2007,employees:9,technicians:6,agreements:420,recurringPct:30,residentialPct:85,vehicles:7,realEstate:'Leased facility',sellerFinancing:true,reason:'',summary:'',highlights:[],growth:[],confidential:{businessName:'',city:'',website:'',details:''},createdAt:'2026-11-01',publishedAt:'2026-11-02',updatedAt:'2026-11-02',...o});
const buyer=(o={})=>({id:'b-'+(o.name||'x'),email:'x@x.test',name:'Maria',phone:'',type:'Owner-operator',company:'',funds:'$250K to $500K',financing:['SBA 7(a) loan'],experience:'Twelve years as an HVAC service manager, EPA 608 certified.',regions:['Central Jersey'],maxPrice:2500000,status:'Registered',advisorNote:'',saved:[],alerts:false,createdAt:'2026-11-01',...o});

test('a buyer who fits on every count is a strong fit, with a reason built from the facts',()=>{
  const f=fit(buyer(),listing());
  assert.equal(f.tier,'Strong fit');assert.equal(f.score,96);
  assert.equal(f.reason,'Buys in Central Jersey, would run it day to day and has HVAC experience.');
  assert.equal(f.buyerReason,'In your Central Jersey region, it is sized for an owner who runs it and it uses your HVAC background.');
});

test('hard limits: over the maximum price, restricted, or wrong state and short of cash',()=>{
  assert.equal(fit(buyer({maxPrice:1500000}),listing()).tier,'Not a fit');
  assert.match(fit(buyer({maxPrice:1500000}),listing()).reason,/asking is above their \$1\.5M maximum\.$/);
  assert.equal(fit(buyer({maxPrice:1700000}),listing()).tier!=='Not a fit',true,'within 10% over stays in play');
  const r=fit(buyer({status:'Restricted'}),listing());assert.equal(r.tier,'Not a fit');assert.equal(r.reason,'Restricted by the advisor.');
  assert.equal(fit(buyer({regions:['Long Island'],funds:'Under $250K',financing:['Cash']}),listing()).tier,'Not a fit');
});

test('cash needed follows how the buyer pays',()=>{
  const l=listing();
  assert.equal(cashNeeded({financing:['SBA 7(a) loan']},l),180000);
  assert.equal(cashNeeded({financing:['Investor capital']},l),450000);
  assert.equal(cashNeeded({financing:['Cash','Seller note']},l),1440000);
  assert.equal(cashNeeded({financing:['Cash']},{...l,sellerFinancing:false}),1800000);
  const f=fit(buyer({funds:'Under $250K',financing:['Cash']}),listing());
  assert.match(f.reason,/likely short of the roughly \$1\.8M needed at close/);
  assert.equal(fit(buyer(),listing(),{funds:'Lender pre-qualified'}).factors.find(x=>x.key==='funds').seller,'funds checked (lender pre-qualified)');
  assert.equal(fit(buyer(),listing(),{funds:'Not sufficient'}).factors.find(x=>x.key==='funds').points,0);
});

test('buyer type is judged against the size of the business',()=>{
  const big=listing({sde:1500000,askingPrice:5000000});
  assert.match(fit(buyer({maxPrice:6e6,funds:'$500K to $1M'}),big).reason,/may find it large to run alone/);
  assert.match(fit(buyer({type:'Search fund',experience:'MBA and consultant, searching.'}),listing({sde:300000,askingPrice:1000000})).buyerReason,/it is smaller than most search funds target/);
  assert.match(fit(buyer({type:'Strategic HVAC operator',experience:'We run trucks.'}),listing()).reason,/^Buys in Central Jersey, already runs an HVAC company/);
});

test('two-way lists: best buyers for a listing, best listings for a buyer',()=>{
  const l=listing(),db={buyers:[buyer({name:'A',regions:['North Jersey']}),buyer({name:'B'}),buyer({name:'C',status:'Restricted'}),buyer({name:'D',maxPrice:900000})],checks:[],access:[{listingId:'l1',buyerId:'b-B',status:'Pending'}]};
  const m=matchBuyers(db,l);
  assert.deepEqual(m.map(x=>x.buyer.name),['B','A']);assert.equal(m[0].access,'Pending');
  assert.deepEqual(fitSummary(m),{total:2,strong:1,byType:{'Owner-operator':2}});
  const ls=[listing({id:'a',region:'Long Island'}),listing({id:'b'}),listing({id:'c',status:'Sold'}),listing({id:'d',askingPrice:9e6})];
  assert.deepEqual(matchListings(buyer(),ls).map(x=>x.listing.id),['b','a']);
  assert.deepEqual(matchListings(buyer(),ls,{exclude:['b']}).map(x=>x.listing.id),['a']);
});

test('owner-safe buyer fit: counts by type, from the listing or, before listing, the estimate',async()=>{
  const {buyerFitFor,describeTypes}=await import('../lib/matching.ts');
  assert.equal(describeTypes({'Owner-operator':4,'Strategic HVAC operator':3,'Search fund':2}),'4 owner-operators, 3 HVAC companies and 2 search funds');
  assert.equal(describeTypes({'Private equity / family office':1}),'1 investment firm');
  const db={buyers:[buyer({name:'A'}),buyer({name:'B',type:'Strategic HVAC operator',funds:'$1M to $5M'}),buyer({name:'C',maxPrice:900000})],checks:[],access:[],listings:[]};
  const est=buyerFitFor(db,{id:'co',region:'Central Jersey'},{price:1800000,sde:463000});
  assert.deepEqual(est,{total:2,strong:2,byType:{'Owner-operator':1,'Strategic HVAC operator':1},basis:'estimate'});
  assert.equal(JSON.stringify(est).includes('Maria'),false,'no names');
  assert.equal(buyerFitFor(db,{id:'co'},{price:1800000,sde:463000}),null,'no region, nothing to match on');
  const listed=buyerFitFor({...db,listings:[listing({companyId:'co',askingPrice:850000})]},{id:'co',region:'Central Jersey'},{price:1800000,sde:463000});
  assert.equal(listed.basis,'listing');assert.equal(listed.total,3,'the cheaper listing fits buyer C too');
});
