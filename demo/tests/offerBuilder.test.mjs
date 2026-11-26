import test from 'node:test';import assert from 'node:assert/strict';
import {structuresFor,coverageLine,takeHome} from '../lib/offerBuilder.ts';
import {sbaCheck,sbaDefaults} from '../lib/sba.ts';
import {validateTerms} from '../lib/offerVersions.ts';

const l={askingPrice:1800000,sde:463000,sellerFinancing:true};

test('structures come from the SBA check, add up, and only offer seller notes when the seller will consider them',()=>{
  const s=structuresFor(l);assert.deepEqual(s.map(x=>x.key),['sba-10','sba-standby-note','sba-paid-note','all-cash']);
  assert.deepEqual(structuresFor({...l,sellerFinancing:false}).map(x=>x.key),['sba-10','all-cash']);
  for(const x of s){
    assert.equal(x.buyerCash+x.loan+x.sellerNote,1800000,x.key);
    assert.equal(x.sellerCashAtClose,1800000-x.sellerNote);
    assert.equal(x.terms.price,1800000);assert.equal(x.terms.cashAtClose+x.terms.sellerNote+x.terms.earnout,x.terms.price,'headline price adds up');
    assert.doesNotThrow(()=>validateTerms(x.terms),x.key);
  }
  const ten=s[0];assert.equal(ten.buyerCash,180000);assert.equal(ten.yearlyPayments,sbaCheck({...sbaDefaults(1800000,463000),buyerCashPct:10}).debtService);
  assert.match(coverageLine(ten),/^Earnings cover the payments 1\.\d\d times; lenders usually want at least 1\.25\.$/);
  assert.equal(coverageLine(s[3]),'No loan payments.');
  assert.match(s[1].terms.noteRepayment,/standby/);
});

test('a price the earnings cannot carry says so',()=>{
  const s=structuresFor({askingPrice:3500000,sde:400000,sellerFinancing:false})[0];
  assert.equal(s.meetsCoverage,false);assert.match(coverageLine(s),/may not be approved/);
});

test('take-home uses the signed letter: fee on cash and note at closing, minimum, retainer credit',()=>{
  const t={cashAtClose:1620000,sellerNote:180000,earnout:100000,noteInterest:'6% a year',noteTerm:'5 years',noteRepayment:'Equal monthly payments'};
  const h=takeHome(t,{terms:{successFeePct:8,successFeeMin:50000,retainer:'none'},version:2});
  assert.equal(h.feeAtClose,144000);assert.equal(h.atClose,1476000);
  assert.equal(h.note.monthly,3480);assert.equal(h.note.total,208794);
  assert.deepEqual(h.earnout,{max:100000,afterFee:92000});
  assert.equal(h.ifAllPaid,1476000+208794+92000);assert.equal(h.fee.source,'Your signed engagement letter, version 2');
  assert.equal(takeHome({...t,cashAtClose:300000,sellerNote:0},{terms:{successFeePct:8,successFeeMin:50000,retainer:'none'},version:1}).feeAtClose,50000,'minimum fee applies');
  assert.equal(takeHome(t,{terms:{successFeePct:8,successFeeMin:0,retainer:10000},version:1}).feeAtClose,134000,'retainer is credited');
  assert.match(h.caveat,/Before taxes, paying off any business debt, and closing adjustments/);
});

test('without a signed letter, or with unstated note terms, nothing is guessed',()=>{
  const h=takeHome({cashAtClose:1500000,sellerNote:200000,earnout:0,noteInterest:'',noteTerm:'',noteRepayment:''});
  assert.equal(h.fee,null);assert.equal(h.feeAtClose,0);assert.match(h.caveat,/not signed yet/);
  assert.equal(h.note.total,null);assert.match(h.note.explained,/only the principal is shown/);assert.equal(h.ifAllPaid,1700000);
  const sb=takeHome({cashAtClose:1710000,sellerNote:90000,earnout:0,noteInterest:'6% a year',noteTerm:'10 years',noteRepayment:'No payments while the SBA loan is outstanding (full standby)'});
  assert.equal(sb.note.standby,true);assert.equal(sb.note.monthly,null);assert.match(sb.note.explained,/No payments while it is outstanding/);
});
