import test from 'node:test';import assert from 'node:assert/strict';
import {saleStage,nextAction} from '../lib/ownerHome.ts';

const base=()=>({portal:{id:'p',businessName:'Russo Heating & Air',firmName:'Kalling',ownerName:'Pat Russo',help:{name:'Karan',email:'k@k.test'},requestsHidden:false,sellerSeenAt:'2026-11-20T00:00:00Z'},
  side:'seller',letters:[],reviews:[],requests:[],buyers:[],steps:[],messages:[],answers:undefined});
const req=(id,title,status,extra={})=>({id,title,status,why:'Buyers start here.',needed:'',reviewNote:'',...extra});

test('the tracker follows buyers and the transaction, never a stored stage',()=>{
  const b=base();assert.equal(saleStage(b,[]),0);
  b.buyers=[{stage:'Not proceeding'}];assert.equal(saleStage(b,[]),0);
  b.buyers.push({stage:'Under NDA'});assert.equal(saleStage(b,[]),1);
  b.buyers.push({stage:'Offer made'});assert.equal(saleStage(b,[]),2);
  assert.equal(saleStage(b,[{state:'Abandoned'}]),2);
  assert.equal(saleStage(b,[{state:'Planning'}]),3);
  assert.equal(saleStage(b,[{state:'Abandoned'},{state:'Closed'}]),4);
});

test('one next step, most important first',()=>{
  const b=base();
  b.letters=[{id:'l',version:1,status:'Ready to sign'}];assert.equal(nextAction(b).target,'portal-letter');
  b.letters=[{id:'l',version:1,status:'Countersigned'}];
  b.reviews=[{status:'Waiting for owner'}];assert.equal(nextAction(b).target,'portal-memo');b.reviews=[];
  b.requests=[req('a','Tax returns','Open'),req('b','P&L statements','Needs changes',{reviewNote:'Page 3 is missing.'})];
  let n=nextAction(b);assert.equal(n.title,'Update P&L statements');assert.equal(n.why,'Page 3 is missing.');assert.equal(n.target,'req-b');
  b.requests[1].status='Accepted';
  b.messages=[{side:'firm',createdAt:'2026-11-24T00:00:00Z'},{side:'firm',createdAt:'2026-11-24T01:00:00Z'}];
  assert.equal(nextAction(b).title,'Read 2 new messages from Karan');b.messages=[];
  n=nextAction(b);assert.equal(n.title,'Send your tax returns');assert.equal(n.button,'Upload it');assert.equal(n.why,'Buyers start here.');
  b.requests[0].status='Submitted';
  assert.equal(nextAction(b).title,'Answer 5 questions about your business');
  b.answers={history:'x',services:'x',strengths:'x',team:'x',afterSale:''};assert.equal(nextAction(b).title,'Answer one last question about your business');
  b.answers.afterSale='x';
  b.steps=[{text:'Call your lender',owner:'You',due:'2026-12-02',done:false},{text:'Firm thing',owner:'Firm',due:'2026-11-30',done:false}];
  assert.equal(nextAction(b).title,'Call your lender');b.steps[0].done=true;
  n=nextAction(b);assert.equal(n.yours,false);assert.match(n.why,/Karan is working on the next step/);
});

test('before the letter, the owner is told what is coming, not given work',()=>{
  const b={...base(),portal:{...base().portal,requestsHidden:true},requests:[req('a','Tax returns','Open')]};
  const n=nextAction(b);assert.equal(n.yours,false);assert.match(n.why,/engagement letter/);
});
