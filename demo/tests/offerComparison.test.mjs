import test from 'node:test';import assert from 'node:assert/strict';
import {comparisonRows,ownerComparisonRows} from '../lib/offerComparison.ts';
const offer=(over={},terms={})=>({id:'o',version:1,label:'Buyer',status:'Shared',current:true,updatedTermsPending:false,actions:[],receivedAt:'2026-11-20T12:00:00Z',sharedAt:'',note:'',verification:{status:'Not reviewed'},
  terms:{kind:'Letter of intent',price:1000000,cashAtClose:900000,sellerNote:100000,earnout:0,financing:'',closeDays:60,conditions:'',expiresOn:'',noteInterest:'',noteTerm:'',noteRepayment:'',noteSecurity:'',earnoutPeriod:'',earnoutConditions:'',earnoutPayment:'',financingConditions:'',financingDeadline:'',transition:'',...terms},...over});
const labels=rows=>rows.map(([l])=>l);

test('owners see plain row names; advisors keep every row and their terms',()=>{
  const owner=labels(ownerComparisonRows([offer()]));
  for(const l of ['Most it could pay, with the full earnout','Price, not counting any earnout','Cash at closing','Seller note','Earnout, the most it can pay'])assert.ok(owner.includes(l),l);
  for(const l of ['Headline maximum consideration','Fixed consideration','Maximum contingent earnout'])assert.ok(!owner.includes(l),l);
  assert.equal(comparisonRows.length,labels(comparisonRows).length);assert.ok(labels(comparisonRows).includes('Headline maximum consideration'));
});

test('a row stays when any shared offer fills it in, and goes only when none does (Codex review of #40)',()=>{
  const a=offer({id:'a'},{financing:'SBA 7(a), pre-qualified',noteInterest:'6% a year'}),b=offer({id:'b'});
  const both=labels(ownerComparisonRows([a,b]));
  assert.ok(both.includes('Financing method'),'kept: offer a states it, even though b does not');
  assert.ok(both.includes('Seller-note interest'),'kept for the same reason');
  assert.ok(!both.includes('Earnout period'),'left out: no offer states it');
  assert.ok(!both.includes('Advisor note shared with you'),'left out: no note on any offer');
  const only=labels(ownerComparisonRows([b]));assert.ok(!only.includes('Financing method'),'with only b shown, its empty row goes');
  // Rows kept for one offer still read "Not provided" for the other, so nothing is hidden for either.
  const fin=ownerComparisonRows([a,b]).find(([l])=>l==='Financing method')[1];assert.equal(fin(b),'Not provided');assert.match(fin(a),/SBA/);
});
