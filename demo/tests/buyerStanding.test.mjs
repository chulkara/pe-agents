import test from 'node:test';import assert from 'node:assert/strict';
import {buyerStanding} from '../lib/buyerStanding.ts';

const buyer={name:'Buyer 1, owner-operator',stage:'Offer made'},other={name:'Buyer 2, strategic',stage:'Offer made'};
const tx=(state,label='Buyer 1, owner-operator',extra={})=>({buyerLabel:label,state,createdAt:'2026-11-24T10:00:00Z',closes:[],...extra});

test('without a transaction the stored stage and its help stay',()=>{
  assert.deepEqual(buyerStanding(buyer,[],'help'),{label:'Offer made',help:'help',tone:'green'});
  assert.equal(buyerStanding({name:'x',stage:'Under NDA'},[],'h').tone,'peri');
});
test('the selected buyer reads as working toward closing; others keep their stage',()=>{
  assert.equal(buyerStanding(buyer,[tx('LOI reviewed')],'h').label,'Working toward closing');
  assert.equal(buyerStanding(other,[tx('LOI reviewed')],'h').label,'Offer made');
});
test('after a close the acquirer bought the business and every other buyer reads sale closed',()=>{
  const closed=tx('Closed','Buyer 1, owner-operator',{closes:[{date:'2026-11-22'}]});
  const s=buyerStanding(buyer,[closed],'h');
  assert.equal(s.label,'Bought the business');assert.match(s.help,/Nov 22, 2026/);
  assert.equal(buyerStanding(other,[closed],'h').label,'Sale closed');
});
test('an abandoned attempt does not change the card',()=>{
  assert.equal(buyerStanding(buyer,[tx('Abandoned')],'h').label,'Offer made');
  assert.equal(buyerStanding(other,[tx('Abandoned','Buyer 2, strategic'),tx('Closed')],'h').label,'Sale closed');
});

test('owners see plain words for buyer stages',()=>{
  assert.equal(buyerStanding({name:'x',stage:'Under NDA'},[],'h').label,'Signed confidentiality agreement');
  assert.equal(buyerStanding({name:'x',stage:'Reviewing information'},[],'h').label,'Reviewing your information');
  assert.equal(buyerStanding({name:'x',stage:'Offer made'},[],'h').label,'Offer made');
});
