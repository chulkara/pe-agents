import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transactionFixture,fileInput,source,advisor} from './transaction-fixture.mjs';
import {addFile,reviewFile} from '../lib/transactionFiles.ts';
import {executionPacket} from '../lib/executionDrafting.ts';
import {recordProposalReview,reviewProblems,latestJudgment,proposalDecisions} from '../lib/proposalReview.ts';

async function setup(){let {d,t}=transactionFixture();const f=fileInput(t,{kind:'Diligence',content:'Confidential'});
  d=addFile(d,t,advisor,f);d=reviewFile(d,d.transactions[0],advisor,f.id,'Reviewed this exact nonprivileged passage.');
  t=d.transactions[0];const p=await executionPacket(d,t,advisor,{purpose:'Diligence follow-up',sources:[source(f)],permissionReviewed:true});
  return {d,t,p};}
const input=(p,extra={})=>({packetId:p.id,inputHash:p.inputHash,packetRevision:p.data.revision,decision:'Reviewed',note:'Checked both claims against the source passage.',...extra});

test('a judgment is recorded with the reviewer, snapshot and time, and never moves the transaction',async()=>{
  const {d,t,p}=await setup(),before=t.revision;
  const d2=recordProposalReview(d,t,advisor,input(p));
  const r=d2.proposalReviews[0];
  assert.equal(r.decision,'Reviewed');assert.equal(r.by,'Fictional Advisor');assert.equal(r.packetId,p.id);assert.equal(r.inputHash,p.inputHash);
  assert.equal(d2.transactions[0].revision,before,'recording a judgment changes nothing on the transaction');
  assert.equal(latestJudgment(d2.proposalReviews,p.id).id,r.id);
  const d3=recordProposalReview(d2,t,advisor,input(p,{decision:'Changes needed',note:'The second quote needs the exact earnout figure.'}));
  assert.equal(d3.proposalReviews.length,2);assert.equal(latestJudgment(d3.proposalReviews,p.id).decision,'Changes needed');
});
test('changes needed requires a note; only a brokerage writer can judge; the snapshot must be named',async()=>{
  const {d,t,p}=await setup();
  assert.throws(()=>recordProposalReview(d,t,advisor,input(p,{decision:'Changes needed',note:' '})),/what needs to change/i);
  assert.throws(()=>recordProposalReview(d,t,{...advisor,role:'viewer'},input(p)),/brokerage reviewer/);
  assert.throws(()=>recordProposalReview(d,t,{kind:'seller',portalId:'p1',email:'s@x.invalid'},input(p)),/brokerage reviewer/);
  assert.throws(()=>recordProposalReview(d,t,advisor,input(p,{inputHash:'nope'})),/exact proposal snapshot/);
  assert.throws(()=>recordProposalReview(d,t,advisor,input(p,{decision:'Approved'})),/Reviewed, Changes needed or Dismissed/);
  assert.equal(proposalDecisions.length,3);
});
test('a stale proposal can be dismissed, not marked reviewed',async()=>{
  const {d,t,p}=await setup();
  const moved={...t,revision:t.revision+1};
  assert.deepEqual(reviewProblems(moved,{packetRevision:p.data.revision,decision:'Dismissed',note:''}),[]);
  assert.match(reviewProblems(moved,{packetRevision:p.data.revision,decision:'Reviewed',note:''}).join(' '),/stale proposal can be dismissed/);
  assert.match(reviewProblems(moved,{packetRevision:p.data.revision,decision:'Changes needed',note:'Needs a fresh snapshot.'}).join(' '),/Dismiss it and prepare a fresh one/);
  const d2=recordProposalReview(d,moved,advisor,input(p,{decision:'Dismissed',note:'Superseded by a new revision.'}));
  assert.equal(d2.proposalReviews[0].decision,'Dismissed');
  assert.throws(()=>recordProposalReview(d,moved,advisor,input(p)),/stale proposal can be dismissed/);
});
