import test from 'node:test';import assert from 'node:assert/strict';
import {seedSample,memoryKV} from '../lib/sample.ts';
import {saleReadyReport} from '../lib/saleReady.ts';

test('the sample portal seeds a believable mid-sale owner view, in memory only',async()=>{
  const kv=memoryKV(),{id,owner}=await seedSample(kv);
  const b=await owner.load(id);
  assert.equal(b.portal.businessName,'Russo Heating & Air');
  assert.equal(b.requests.length,6);
  assert.equal(b.requests.filter(r=>r.status==='Accepted').length,4);
  assert.match(b.answers.history,/Edison/);assert.equal(b.answers.team,'');
  assert.deepEqual(b.buyers.map(x=>x.stage).sort(),['Offer made','Reviewing information']);
  assert.equal(b.steps.length,3);
  assert.equal(b.saleReady.length,1);
  const r=saleReadyReport(b.saleReady[0].input);
  assert.deepEqual([r.readiness.done,r.readiness.total],[4,6]);
  assert.equal(r.drags[0].key,'license');
  assert.match(b.saleReady[0].note,/Four of six records are in/);
  assert.equal(b.saleReady[0].input.buyerFit.total,9);
});

test('every visit starts fresh',async()=>{
  const a=memoryKV(),b=memoryKV();await seedSample(a);
  assert.equal(b.getItem('kalling-portal-demo-v1'),null);
});
