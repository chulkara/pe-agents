import {test} from 'node:test';import assert from 'node:assert/strict';
import * as H from '../lib/helpers.ts';import * as P from '../lib/portal.ts';
const firm={side:'firm',name:'Fictional Advisor',email:'advisor@k.invalid'},owner={side:'seller',name:'Fictional Owner',email:'owner@russo.invalid'},sha=c=>c.repeat(64);
function world(){
  let db=P.emptyPortalDb();const c=P.createPortal(db,firm,{firmId:'f',firmName:'Kalling',companyId:'c1',businessName:'Fictional Russo HVAC',ownerName:'Fictional Owner',ownerEmail:'owner@russo.invalid',help:{name:'Fictional Advisor',email:'a@k.invalid'}});db=c.db;
  db={...db,portals:db.portals.map(p=>({...p,status:'Active'}))};
  db=P.saveRequest(db,firm,c.id,{title:'2025 profit and loss',needed:'Full-year P&L',why:'Buyers will ask for it',sharing:'Shared with approved buyers',contact:{name:'Fictional Advisor',email:'a@k.invalid'},due:'2026-12-15'});
  db=P.saveRequest(db,firm,c.id,{title:'Customer list',needed:'Top 50 customers by revenue',why:'Buyer diligence',sharing:'After a letter of intent only',contact:{name:'Fictional Advisor',email:'a@k.invalid'},due:'2026-12-20'});
  return {db,portal:c.id,pl:db.requests[0].id,cust:db.requests[1].id};
}
const mary={email:'mary@russo.invalid',confirmed:true};

test('only the owner adds and assigns; the helper sees assigned titles and nothing about the sale',()=>{
  let {db,portal,pl,cust}=world();
  assert.throws(()=>H.addHelper(db,firm,portal,{name:'Mary',email:'mary@russo.invalid'}),/Only the business owner/);
  const add=H.addHelper(db,owner,portal,{name:'Fictional Mary',email:'Mary@russo.invalid'});db=add.db;
  assert.throws(()=>H.addHelper(db,owner,portal,{name:'Me',email:'owner@russo.invalid'}),/own email/);
  assert.throws(()=>H.acceptHelper(db,{email:'x@y.invalid',confirmed:true},add.token),/invitation was sent to/);
  db=H.acceptHelper(db,mary,add.token);
  db=H.assignRequests(db,owner,add.id,[pl]);
  const home=H.helperHome(db,mary)[0];
  assert.equal(home.requests.length,1);assert.equal(home.requests[0].title,'2025 profit and loss');
  const json=JSON.stringify(home);for(const leak of ['Buyers will ask','approved buyers','Customer list','Kalling'])assert.ok(!json.includes(leak),'helper view leaks '+leak);
  assert.throws(()=>H.helperUpload(db,mary,add.id,cust,{name:'c.pdf',mime:'application/pdf',size:10,sha256:sha('c')}),/not assigned/);
});

test('helper uploads wait for the owner; the brokerage sees nothing until approval',()=>{
  let {db,portal,pl}=world();const add=H.addHelper(db,owner,portal,{name:'Fictional Mary',email:'mary@russo.invalid'});db=H.assignRequests(H.acceptHelper(add.db,mary,add.token),owner,add.id,[pl]);
  const up=H.helperUpload(db,mary,add.id,pl,{name:'pl.pdf',mime:'application/pdf',size:100,sha256:sha('a'),note:'From QuickBooks'});db=up.db;
  assert.throws(()=>H.helperUpload(db,mary,add.id,pl,{name:'pl.pdf',mime:'application/pdf',size:100,sha256:sha('a')}),/already sent/);
  const firmView=P.bundle(db,firm,portal,[]);assert.equal(firmView.files.length,0);assert.equal(firmView.requests[0].fileIds.length,0);
  assert.throws(()=>H.decideUpload(db,firm,up.id,'Approved'),/Only the business owner/);
  db=H.decideUpload(db,owner,up.id,'Approved');
  const after=P.bundle(db,firm,portal,[]);assert.equal(after.files.length,1);assert.equal(after.requests[0].fileIds[0],up.id);assert.match(after.files[0].uploadedBy,/gathered by Fictional Mary/);
  assert.equal(H.helperHome(db,mary)[0].requests[0].uploads[0].status,'Approved');
  const up2=H.helperUpload(db,mary,add.id,pl,{name:'pl-old.pdf',mime:'application/pdf',size:100,sha256:sha('b')});db=H.decideUpload(up2.db,owner,up2.id,'Declined','Wrong year');
  assert.equal(P.bundle(db,firm,portal,[]).files.length,1);assert.equal(H.ownerHelpers(db,owner,portal)[0].uploads[0].ownerNote,'Wrong year');
});

test('removal, expiry and completed requests end the helper’s access',()=>{
  let {db,portal,pl}=world();const add=H.addHelper(db,owner,portal,{name:'Fictional Mary',email:'mary@russo.invalid',days:30});db=H.assignRequests(H.acceptHelper(add.db,mary,add.token),owner,add.id,[pl]);
  const up=H.helperUpload(db,mary,add.id,pl,{name:'pl.pdf',mime:'application/pdf',size:100,sha256:sha('a')});
  const removed=H.removeHelper(up.db,owner,add.id);assert.equal(H.helperHome(removed,mary).length,0);assert.equal(removed.helperUploads[0].status,'Withdrawn');
  const expired={...db,helpers:db.helpers.map(h=>({...h,expiresAt:new Date(Date.now()-1).toISOString()}))};
  assert.equal(H.helperHome(expired,mary)[0].requests.length,0);assert.throws(()=>H.helperUpload(expired,mary,add.id,pl,{name:'pl.pdf',mime:'application/pdf',size:100,sha256:sha('c')}),/access has ended/);
  const accepted={...db,requests:db.requests.map(r=>r.id===pl?{...r,status:'Accepted'}:r)};
  assert.throws(()=>H.helperUpload(accepted,mary,add.id,pl,{name:'pl.pdf',mime:'application/pdf',size:100,sha256:sha('d')}),/already complete/);
  const hidden={...db,portals:db.portals.map(p=>({...p,requestsHidden:true}))};assert.equal(H.helperHome(hidden,mary)[0].requests.length,0);
});
