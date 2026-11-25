import test from 'node:test';import assert from 'node:assert/strict';
import {orderNeeds,waitingDays,saleReadyNeed} from '../lib/needs.ts';

test('closing-critical kinds come first, then the longest wait, then undated items',()=>{
  const items=[
    {id:'a',date:'2026-11-20',kind:'Buyer question',text:'',action:''},
    {id:'b',date:'2026-11-23',kind:'Diligence review',text:'',action:''},
    {id:'c',date:'2026-11-10',kind:'Diligence review',text:'',action:''},
    {id:'d',date:'',kind:'AI draft',text:'',action:''},
    {id:'e',date:'2026-11-01',kind:'Something new',text:'',action:''},
    {id:'f',date:'2026-11-22',kind:'Seller inquiry',text:'',action:''},
  ];
  assert.deepEqual(orderNeeds(items).map(i=>i.id),['c','b','f','a','d','e']);
});

test('waiting days',()=>{
  const now=new Date('2026-11-24T12:00:00Z');
  assert.equal(waitingDays('2026-11-21T12:00:00Z',now),3);assert.equal(waitingDays('',now),null);assert.equal(waitingDays('2026-12-01',now),0);
});

test('sale-ready reminders: first share, changed recast, monthly',()=>{
  const now=new Date('2026-11-24T12:00:00Z'),base={ownerName:'Pat Russo',businessName:'Russo Heating & Air',portalActive:true};
  assert.equal(saleReadyNeed({...base,portalActive:false,recastUpdatedAt:'2026-11-20'},now),null);
  assert.equal(saleReadyNeed({...base},now),null);
  assert.match(saleReadyNeed({...base,recastUpdatedAt:'2026-11-20'},now).text,/first sale-ready page with Pat/);
  assert.match(saleReadyNeed({...base,recastUpdatedAt:'2026-11-22',lastSharedAt:'2026-11-21'},now).text,/changed since Pat's last/);
  assert.equal(saleReadyNeed({...base,recastUpdatedAt:'2026-11-20',lastSharedAt:'2026-11-21'},now),null);
  const due=saleReadyNeed({...base,recastUpdatedAt:'2026-10-01',lastSharedAt:'2026-10-02T00:00:00Z'},now);
  assert.match(due.text,/Monthly sale-ready update/);assert.equal(due.date,'2026-11-01T00:00:00.000Z');
});
