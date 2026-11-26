import test from 'node:test';import assert from 'node:assert/strict';
import {structuresFor,coverageLine,takeHome,signedFeeLetter,noteSchedule} from '../lib/offerBuilder.ts';
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
  assert.deepEqual(h.earnout,{max:100000,fee:8000,afterFee:92000},'8% of the earnout, since the minimum is already passed');
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

test('a listing above the SBA loan limit marks the loan structures as not available',()=>{
  const s=structuresFor({askingPrice:6000000,sde:1500000,sellerFinancing:true});
  const ten=s.find(x=>x.key==='sba-10');assert.match(ten.blockers.join(' '),/\$5 million SBA 7\(a\) limit/);
  assert.deepEqual(s.find(x=>x.key==='all-cash').blockers,[]);
  assert.deepEqual(structuresFor(l).flatMap(x=>x.blockers),[],'an ordinary listing has none');
  const low=structuresFor({askingPrice:3500000,sde:400000,sellerFinancing:false})[0];assert.deepEqual(low.blockers,[],'weak coverage is a warning, not a blocker');
});

test('seller-note payments follow the repayment schedule in the offer',()=>{
  const base={cashAtClose:1620000,sellerNote:180000,earnout:0,noteInterest:'6% a year',noteTerm:'5 years'};
  const io=takeHome({...base,noteRepayment:'Monthly interest-only payments, balloon at the end of year 5'});
  assert.equal(io.note.schedule,'interest only');assert.equal(io.note.monthly,900);assert.equal(io.note.total,234000);assert.match(io.note.explained,/interest only, \$900 a month[\s\S]*\$180,000 at the end of 5 years/);
  const eq=takeHome({...base,noteRepayment:'Equal monthly payments'});assert.equal(eq.note.monthly,3480);assert.equal(eq.note.total,208794);
  for(const r of ['','Quarterly payments of principal and interest','Paid from collections as they come in']){
    const h=takeHome({...base,noteRepayment:r});assert.equal(h.note.monthly,null,r);assert.equal(h.note.total,null,r);assert.match(h.note.explained,/only the principal is shown/i,r);assert.equal(h.ifAllPaid,1620000+180000);
  }
  assert.equal(noteSchedule('Quarterly interest only'),'other');assert.equal(noteSchedule('No payments while the SBA loan is outstanding (full standby)'),'standby');
});

test('the fee is charged once across closing and earnout: the minimum covers the whole sale',()=>{
  const fee={terms:{successFeePct:8,successFeeMin:50000,retainer:'none'},version:1};
  const h=takeHome({cashAtClose:300000,sellerNote:0,earnout:100000},fee);
  assert.equal(h.feeAtClose,50000);assert.deepEqual(h.earnout,{max:100000,fee:0,afterFee:100000});assert.equal(h.ifAllPaid,250000+100000,'total fee is $50,000, not $58,000');
  const past=takeHome({cashAtClose:500000,sellerNote:0,earnout:500000},fee);assert.equal(past.feeAtClose,50000);assert.equal(past.earnout.fee,30000,'8% of $1,000,000 is $80,000 in all');
  const ret=takeHome({cashAtClose:300000,sellerNote:0,earnout:500000},{terms:{successFeePct:8,successFeeMin:0,retainer:30000},version:1});
  assert.equal(ret.feeAtClose,0);assert.equal(ret.earnout.fee,64000-30000,'the unused retainer credit carries to the earnout fee');
});

test('the fee comes from the latest countersigned letter; an unsigned amendment does not hide it',()=>{
  const letter=(version,status,pct)=>({version,status,input:{ownerName:'Pat',advisorName:'Sam',terms:{successFeePct:pct,successFeeMin:0,retainer:'none'}}});
  assert.equal(signedFeeLetter([letter(1,'Countersigned',8),letter(2,'Ready to sign',6)]).version,1);
  assert.equal(takeHome({cashAtClose:1000000,sellerNote:0,earnout:0},signedFeeLetter([letter(1,'Countersigned',8),letter(2,'Ready to sign',6)])).atClose,920000);
  assert.equal(signedFeeLetter([letter(1,'Countersigned',8),letter(2,'Countersigned',6)]).terms.successFeePct,6);
  assert.equal(signedFeeLetter([letter(1,'Void',8),letter(2,'Signed by owner',6)]),undefined);
  assert.equal(signedFeeLetter([]),undefined);
});
