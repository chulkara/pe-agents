import {test} from 'node:test';import assert from 'node:assert/strict';import * as S from '../lib/sba.ts';
test('payments amortize monthly and match a standard loan table',()=>{
 // $1,000,000 at 10.5% for 10 years: about $13,493.5 a month.
 assert.ok(Math.abs(S.annualPayment(1_000_000,10.5,10)/12-13493.5)<1);
 assert.equal(S.annualPayment(0,10,10),0);assert.equal(S.annualPayment(120000,0,10),12000);
});
test('a typical HVAC deal: 10% down, standby seller note, coverage and cash after debt',()=>{
 const c=S.sbaCheck({...S.sbaDefaults(1_100_000,370_000),buyerCashPct:10,sellerNotePct:5,sellerNoteStandby:true});
 assert.equal(c.loan,935000);assert.equal(c.buyerCash,110000);assert.equal(c.sellerNotePayment,0);
 assert.equal(c.cashFlowForDebt,280000);assert.ok(c.dscr>1.25&&c.meetsCoverage);assert.deepEqual(c.issues,[]);
 assert.equal(c.afterDebt,c.cashFlowForDebt-c.debtService);
});
test('2025 equity rules: 10% minimum, a seller note counts only on full standby and for at most half',()=>{
 assert.match(S.sbaCheck({...S.sbaDefaults(1e6,300000),buyerCashPct:5,sellerNotePct:5,sellerNoteStandby:false}).issues.join(' '),/full standby/);
 assert.deepEqual(S.sbaCheck({...S.sbaDefaults(1e6,300000),buyerCashPct:5,sellerNotePct:5,sellerNoteStandby:true}).issues,[]);
 assert.match(S.sbaCheck({...S.sbaDefaults(1e6,300000),buyerCashPct:2,sellerNotePct:15,sellerNoteStandby:true}).issues.join(' '),/at least 5% in cash/);
 assert.match(S.sbaCheck({...S.sbaDefaults(1e6,300000),buyerCashPct:8}).issues.join(' '),/at least 10% equity/);
});
test('weak coverage, a paying seller note and the loan limit are flagged',()=>{
 const weak=S.sbaCheck(S.sbaDefaults(2_000_000,300000));assert.equal(weak.meetsCoverage,false);assert.match(weak.issues.join(' '),/Coverage is/);
 const paying=S.sbaCheck({...S.sbaDefaults(1e6,400000),buyerCashPct:10,sellerNotePct:10,sellerNoteStandby:false});assert.ok(paying.sellerNotePayment>0);
 assert.match(S.sbaCheck(S.sbaDefaults(6_000_000,2_000_000)).issues.join(' '),/\$5 million/);
 assert.throws(()=>S.sbaCheck({...S.sbaDefaults(1e6,1e5),buyerCashPct:60,sellerNotePct:50}),/cannot exceed/);
});
test('the price that keeps coverage at 1.25x',()=>{
 const i=S.sbaDefaults(1_100_000,370_000),max=S.maxPriceAtCoverage(i);
 assert.ok(S.sbaCheck({...i,price:max}).dscr>=1.25);assert.ok(S.sbaCheck({...i,price:max+50000}).dscr<1.25);assert.equal(max%25000,0);
});
