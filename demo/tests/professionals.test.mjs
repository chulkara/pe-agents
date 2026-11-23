import {test} from 'node:test';import assert from 'node:assert/strict';
import * as P from '../lib/professionals.ts';import * as F from '../lib/transactionFiles.ts';
import {transactionFixture,fileInput,source,advisor} from './transaction-fixture.mjs';

function world(){
  let {d,t}=transactionFixture();const at=new Date().toISOString();
  d={...d,rooms:[{listingId:'listing-1',portalId:'portal-1',status:'Published'}],views:[],tickets:[],loiGrants:[],
    roomItems:[{id:'room-pl',listingId:'listing-1',portalId:'portal-1',fileId:'pf-1',fileName:'pl.pdf',mime:'application/pdf',displayName:'2025 profit and loss',folder:'Financials',tier:'After NDA',allowDownload:false,note:'',ownerStatus:'Approved',ownerNote:'',changedAt:at},
      {id:'room-later',listingId:'listing-1',portalId:'portal-1',fileId:'pf-2',fileName:'c.pdf',mime:'application/pdf',displayName:'Customer list',folder:'Customers',tier:'After LOI',allowDownload:false,note:'',ownerStatus:'Approved',ownerNote:'',changedAt:at}]};
  const f=fileInput(t,{content:'Confidential',name:'Signed LOI.pdf'});d=F.addFile(d,t,advisor,f);t=d.transactions[0];
  d=F.reviewFile(d,t,advisor,f.id,'Verified this exact fictional document.');t=d.transactions[0];
  d=F.grantFile(d,t,advisor,{fileId:f.id,recipients:['buyer','seller'],permission:source(f),note:'The seller instructed sharing this exact fictional version.'});
  return {d,file:f,buyer:{kind:'buyer',email:'buyer@execution.invalid'},seller:{kind:'seller',portalIds:['portal-1'],email:'seller@execution.invalid',name:'Fictional Owner'}};
}
const cpa={kind:'professional',email:'cpa@pro.invalid',confirmed:true};

test('a party sees only documents it can open itself',()=>{
  const {d,buyer,seller}=world();
  const b=P.partyDocuments(d,buyer).map(x=>x.name).sort(),s=P.partyDocuments(d,seller).map(x=>x.name).sort();
  assert.deepEqual(b,['2025 profit and loss','Signed LOI.pdf']); // the after-LOI customer list is not open to the buyer yet
  assert.deepEqual(s,['2025 profit and loss','Customer list','Signed LOI.pdf']);
});

test('invite, accept, acknowledge, then only granted documents open, and every open is logged',()=>{
  let {d,buyer,file}=world();
  const inv=P.addProfessional(d,buyer,{name:'Fictional CPA',email:'CPA@pro.invalid',firm:'Fictional & Co',role:'CPA'});d=inv.db;
  assert.throws(()=>P.addProfessional(d,buyer,{name:'Again',email:'cpa@pro.invalid',firm:'',role:'CPA'}),/already/);
  assert.throws(()=>P.acceptProfessional(d,{...cpa,email:'someone@else.invalid'},inv.token),/email address the invitation/);
  d=P.acceptProfessional(d,cpa,inv.token);assert.throws(()=>P.acceptProfessional(d,cpa,inv.token),/expired, was used/);
  assert.throws(()=>P.grantDocuments(d,buyer,inv.id,[{source:'dataroom',id:'room-pl'}],false),/bound to keep this confidential/);
  assert.throws(()=>P.grantDocuments(d,buyer,inv.id,[{source:'dataroom',id:'room-later'}],true),/only share documents you can open/);
  d=P.grantDocuments(d,buyer,inv.id,[{source:'dataroom',id:'room-pl'},{source:'transaction',id:file.id}],true);
  const g=d.proGrants.find(x=>x.docId==='room-pl');
  // Before the confidentiality acknowledgment, nothing is listed or opens.
  assert.equal(P.professionalHome(d,cpa)[0].documents.length,0);assert.equal(P.openForProfessional(d,cpa,g.id).allowed,false);
  d=P.acknowledge(d,cpa,inv.id);
  assert.equal(P.professionalHome(d,cpa)[0].documents.length,2);
  const o=P.openForProfessional(d,cpa,g.id);assert.equal(o.allowed,true);assert.equal(o.docId,'room-pl');d=o.db;
  assert.equal(P.openForProfessional(d,{...cpa,email:'intruder@x.invalid'},g.id).allowed,false);
  const log=P.partyProfessionals(d,buyer)[0];assert.equal(log.views[0].event,'opened');assert.equal(log.views[0].document,'2025 profit and loss');
});

test('revoking, removing, expiry and the party losing access all close the door',()=>{
  let {d,buyer,seller}=world();
  let inv=P.addProfessional(d,buyer,{name:'Fictional Attorney',email:'law@pro.invalid',firm:'',role:'Attorney'});d=P.acknowledge(P.acceptProfessional(inv.db,{...cpa,email:'law@pro.invalid'},inv.token),{...cpa,email:'law@pro.invalid'},inv.id);
  const law={...cpa,email:'law@pro.invalid'};d=P.grantDocuments(d,buyer,inv.id,[{source:'dataroom',id:'room-pl'}],true);const g=d.proGrants[0];
  assert.throws(()=>P.revokeGrant(d,seller,g.id),/not yours/);
  assert.equal(P.openForProfessional(P.revokeGrant(d,buyer,g.id),law,g.id).allowed,false);
  assert.equal(P.openForProfessional(P.removeProfessional(d,buyer,inv.id),law,g.id).allowed,false);
  const expired={...d,professionals:d.professionals.map(x=>({...x,expiresAt:new Date(Date.now()-1000).toISOString()}))};assert.equal(P.openForProfessional(expired,law,g.id).allowed,false);
  const restricted={...d,buyers:d.buyers.map(b=>({...b,status:'Restricted'}))};const r=P.openForProfessional(restricted,law,g.id);
  assert.equal(r.allowed,false);assert.equal(r.db.proViews.at(-1).event,'denied');
  assert.equal(P.professionalHome(restricted,law)[0].documents[0].available,false);
});

test('a seller manages their own professionals; the other side cannot touch them',()=>{
  let {d,seller,buyer}=world();const inv=P.addProfessional(d,seller,{name:'Seller CPA',email:'scpa@pro.invalid',firm:'',role:'CPA'});d=inv.db;
  assert.throws(()=>P.removeProfessional(d,buyer,inv.id),/not on your list/);
  assert.throws(()=>P.addProfessional(d,seller,{name:'Me',email:'seller@execution.invalid',firm:'',role:'CPA'}),/own email/);
  d=P.grantDocuments(d,seller,inv.id,[{source:'dataroom',id:'room-later'}],true);assert.equal(d.proGrants.length,1);
  assert.equal(P.partyProfessionals(d,buyer).length,0);assert.equal(P.partyProfessionals(d,seller)[0].grants.length,1);
  assert.match(P.professionalWatermark({name:'Seller CPA',email:'scpa@pro.invalid',role:'CPA',partyName:'Fictional Owner'}),/CPA for Fictional Owner/);
});
