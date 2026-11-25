import test from 'node:test';import assert from 'node:assert/strict';
import {nextTurn,applyReply,answered} from '../lib/interview.ts';

const empty={history:'',services:'',strengths:'',team:'',afterSale:''};

test('asks each question in order, then follows up once on a short answer',()=>{
  let a=empty;const fu=new Set();
  let t=nextTurn(a,fu);assert.equal(t.key,'history');assert.equal(t.followUp,false);assert.match(t.prompt,/^Let’s start at the beginning\. How did the business start/);assert.equal(t.total,5);
  a=applyReply(a,t,'My dad started it.');
  t=nextTurn(a,fu);assert.equal(t.key,'history');assert.equal(t.followUp,true);assert.match(t.prompt,/^Could you say a little more\? When it started/);
  fu.add('history');a=applyReply(a,t,'In 1998, with one truck. We added a second crew in 2010.');
  assert.equal(a.history,'My dad started it. In 1998, with one truck. We added a second crew in 2010.');
  t=nextTurn(a,fu);assert.equal(t.key,'services');assert.equal(t.index,1);
});

test('a short answer that was already followed up is accepted',()=>{
  const a={...empty,history:'Since 1998.'};
  assert.equal(nextTurn(a,new Set(['history'])).key,'services');
});

test('done when every answer is full enough; blank replies change nothing',()=>{
  const long='x'.repeat(60),a={history:long,services:long,strengths:long,team:long,afterSale:long};
  assert.equal(nextTurn(a,new Set()),null);assert.equal(answered(a),5);
  const t=nextTurn(empty,new Set());assert.equal(applyReply(empty,t,'   '),empty);
  assert.equal(applyReply(empty,t,'y'.repeat(4000)).history.length,3000);
});
