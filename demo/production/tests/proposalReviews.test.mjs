import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {executionFixture,source} from './execution-helpers.mjs';

// Migration 20261116191500: a recorded human judgment names an exact proposal snapshot,
// approves nothing, and never moves the transaction.
let s,f,packetId;
const HASH='a'.repeat(64);
const packet=async()=>{const t=(await s.load()).transaction;return {version:1,playbook:'local-execution-v1',kind:'execution',id:packetId,scopeId:'execution-'+s.id,inputHash:HASH,company:{id:'c1',name:'Selected HVAC acquisition',region:'',state:'',industry:'HVAC'},data:{transactionId:s.id,revision:t.revision,purpose:'Status summary',permissionReviewed:true,passages:[{id:'source-1',source:source(f),sha256:HASH}]}};};
const judge=(user,p={})=>s.one(user,'select public.kalling_execution_review_proposal($1,$2)',[s.id,{packetId,inputHash:HASH,decision:'Reviewed',note:'Checked the claims against the fictional source passage.',...p}]);
const list=(user)=>s.one(user,'select public.kalling_execution_proposal_reviews($1)',[s.id]);

before(async()=>{s=await executionFixture();f=await s.file({kind:'Diligence'});packetId='execution-'+crypto.randomUUID();
  await s.one(s.owner,'select public.kalling_execution_file_review($1,$2)',[f.id,'Reviewed this exact nonprivileged fictional source.']);
  await s.one(s.owner,'select public.kalling_agent_enqueue($1,$2,$3)',[s.firm,'execution',JSON.stringify(await packet())]);});
after(()=>s?.db.close());

test('an advisor records a judgment; it is listed with the reviewer and never moves the transaction',async()=>{
  const before=(await s.load()).transaction.revision;
  await judge(s.owner);
  const rows=await list(s.owner);
  assert.equal(rows.length,1);assert.equal(rows[0].decision,'Reviewed');assert.equal(rows[0].packetId,packetId);assert.ok(rows[0].by.length>1);assert.ok(rows[0].at);
  assert.equal((await s.load()).transaction.revision,before,'a judgment is a record, not a transaction change');
  await judge(s.owner,{decision:'Changes needed',note:'The earnout figure needs its exact source line.'});
  assert.equal((await list(s.owner)).length,2);
  assert.equal((await list(s.viewer)).length,2,'a viewer reads judgments');
});
test('judgments name the exact snapshot and require the stated note',async()=>{
  await assert.rejects(judge(s.owner,{decision:'Changes needed',note:'x'}),/what needs to change/);
  await assert.rejects(judge(s.owner,{decision:'Approved'}),/Reviewed, Changes needed or Dismissed/);
  await assert.rejects(judge(s.owner,{inputHash:'b'.repeat(64)}),/exact proposal snapshot/);
  await assert.rejects(judge(s.owner,{packetId:'execution-'+crypto.randomUUID()}),/exact proposal snapshot/);
});
test('only brokerage staff judge; a viewer cannot write; buyer and seller see nothing',async()=>{
  await assert.rejects(judge(s.viewer),/brokerage reviewer/);
  await assert.rejects(judge(s.buyer),/brokerage reviewer/);
  await assert.rejects(list(s.buyer),/denied/);
  await assert.rejects(list(s.seller),/denied/);
  await assert.rejects(list(s.outsider),/denied/);
});
test('a stale proposal can be dismissed, not marked reviewed',async()=>{
  const rev=(await s.load()).transaction.revision;
  await s.one(s.owner,'select public.kalling_execution_timeline($1,$2,$3,$4)',[s.id,rev,'planning_date',{date:'2026-12-20'}]);
  await assert.rejects(judge(s.owner),/stale proposal can be dismissed/);
  await assert.rejects(judge(s.owner,{decision:'Changes needed',note:'Please refresh the snapshot first.'}),/stale proposal can be dismissed/);
  await judge(s.owner,{decision:'Dismissed',note:'Superseded by a newer transaction revision.'});
  assert.equal((await list(s.owner))[0].decision,'Dismissed');
});
