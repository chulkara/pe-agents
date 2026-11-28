import test from 'node:test';import assert from 'node:assert/strict';
import {carriedValueInputs} from '../lib/hvacValuation.ts';
const D={revenue:2000000,ownerPay:150000,netProfit:220000,addBacks:0,maintenancePct:45,agreements:600,commercialPct:15,newConstructionPct:5,technicians:6,ownerRole:'key-relationships',topCustomerPct:8,years:15,trend:'flat',licenseHolder:'owner-only'};
const q=s=>new URLSearchParams(s);

test('the detailed estimate keeps the quick estimate’s earnings exactly (Codex review of #36)',()=>{
  const a=carriedValueInputs(q('revenue=900000&ownerPay=55500&netProfit=0&service=40'),D);
  assert.equal(a.ownerPay+a.netProfit,55500);assert.equal(a.revenue,900000);assert.equal(a.maintenancePct,40);
  // An older link with only the total still adds up to that total, even below the default owner pay.
  const b=carriedValueInputs(q('revenue=900000&earnings=55500&service=40'),D);
  assert.equal(b.ownerPay+b.netProfit,55500);assert.ok(b.netProfit>=0);
  const c=carriedValueInputs(q('earnings=600000'),D);assert.equal(c.ownerPay,150000);assert.equal(c.netProfit,450000);
});

test('without carried answers, the typical company stays as the starting point',()=>{
  assert.deepEqual(carriedValueInputs(q(''),D),D);
  assert.deepEqual(carriedValueInputs(q('revenue=abc&earnings=-5'),D),D,'unreadable values are ignored');
});
