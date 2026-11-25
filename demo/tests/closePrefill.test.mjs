import test from 'node:test';import assert from 'node:assert/strict';
import {closePrefill} from '../lib/closePrefill.ts';
import {cents} from '../lib/transactions.ts';

const tx=(over={})=>({offerVersion:2,planningClose:'2027-02-15',closes:[],lois:[{version:1,structure:'Asset purchase'},{version:2,structure:'Asset purchase of substantially all assets'}],
  terms:{kind:'Letter of intent',price:1900000,cashAtClose:1500000,sellerNote:400000,earnout:150000,financing:'SBA 7(a)',closeDays:75,conditions:'',noteTerm:'5 years',noteInterest:'6%',earnoutPeriod:'2 years'},...over});

test('drafts the close from the chosen offer and the latest LOI, with a source for every value',()=>{
  const d=closePrefill(tx());
  assert.deepEqual([d.values.date,d.values.basis,d.values.cash,d.values.sellerNote,d.values.fixed,d.values.earnoutMax,d.values.earnoutRealized],['2027-02-15','Asset consideration','1500000','400000','1900000','150000','0']);
  for(const k of Object.keys(d.values))assert.ok(d.from[k],k);
  assert.equal(d.from.cash,'Offer version 2, cash at close');assert.equal(d.from.basis,'LOI version 2 structure');
  assert.match(d.values.basisNote,/^Per offer version 2, reflected in LOI version 2 \(Asset purchase of substantially all assets\): \$1,500,000 cash at close, \$400,000 seller note \(5 years, 6%\), and up to \$150,000 in earnout over 2 years\./);
  assert.ok(d.values.basisNote.length>=30);
  for(const k of ['cash','sellerNote','fixed','earnoutMax'])assert.doesNotThrow(()=>cents(d.values[k]),k);
  assert.equal(d.checks.length,1,'only the closing-statement reminder');assert.equal(d.values.buyerDebt,undefined,'borrowing is never guessed');
});

test('flags what it cannot know instead of guessing',()=>{
  const d=closePrefill(tx({planningClose:undefined,lois:[],terms:{...tx().terms,price:2000000}}));
  assert.equal(d.values.date,undefined);assert.match(d.checks[0],/actual closing date/);
  assert.match(d.checks[1],/headline price \(\$2,000,000\) is not cash plus seller note \(\$1,900,000\)/);
  assert.match(d.from.basis,/no LOI structure/);
  assert.equal(closePrefill(tx({lois:[{version:3,structure:'Purchase of all membership interests'}]})).values.basis,'Equity consideration');
});

test('a correction starts from the record it corrects',()=>{
  const amounts={currency:'USD',basis:'Asset consideration',cash:150000000,sellerNote:40000000,otherFixed:0,fixed:190000000,earnoutMax:15000000,earnoutRealized:0,workingCapital:5000050,inventory:0,realEstate:0,buyerDebt:120000000,basisNote:'Per offer version 2: all assets, no real estate.'};
  const d=closePrefill(tx({closes:[{version:1,date:'2027-02-14',amounts}]}));
  assert.equal(d.values.cash,'1500000');assert.equal(d.values.workingCapital,'50000.50');assert.equal(d.values.buyerDebt,'1200000');assert.deepEqual(d.from,{});assert.match(d.summary,/closing version 1/);
  assert.doesNotThrow(()=>cents('50000.50'));
});
