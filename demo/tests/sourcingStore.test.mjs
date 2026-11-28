import assert from 'node:assert/strict';
import {test} from 'node:test';
import {OPT_OUT} from '../lib/sourcing.ts';
import {cloudSourcingStore,localSourcingStore} from '../lib/sourcingStore.ts';

const license='19HC001000';
const letter='Dear Fictional Owner,\n\n'+OPT_OUT+'\n';
const at='2026-11-27T18:00:00.000Z';

test('local sourcing decisions stay in one store instance and snapshots cannot change them',async()=>{
  const store=localSourcingStore('Fictional Advisor');
  assert.equal(store.mode,'local');
  assert.deepEqual(await store.list(),{decisions:{},doNotContact:[]});
  const decided=await store.decide(' 19hc001000 ',{status:'Do not contact',note:'Fictional owner opted out.'});
  assert.equal(decided.updatedBy,'Fictional Advisor');
  decided.status='New';
  const snapshot=await store.list();
  assert.equal(snapshot.decisions[license].status,'Do not contact');
  assert.deepEqual(snapshot.doNotContact,[license]);
  snapshot.doNotContact.pop();
  delete snapshot.decisions[license];
  await assert.rejects(store.decide(license,{status:'Letter drafted',letter}),/asked not to be contacted/);
  assert.deepEqual((await store.list()).doNotContact,[license]);
  assert.deepEqual(await localSourcingStore('Fictional Advisor').list(),{decisions:{},doNotContact:[]});
});

test('local sourcing uses forward transitions and retains the exact approved letter',async()=>{
  const store=localSourcingStore('Fictional Advisor');
  await assert.rejects(store.decide(license,{status:'Mailed'}),/Approve the letter/);
  await assert.rejects(store.decide(license,{status:'Letter approved',letter:'A fictional draft.'}),/opt-out sentence/);
  await store.decide(license,{status:'Letter drafted',letter,note:'A fictional note.'});
  const approved=await store.decide(license,{status:'Letter approved',approvedBy:'Ignored alternate identity'});
  assert.equal(approved.letter,letter);
  assert.equal(approved.note,'A fictional note.');
  assert.equal(approved.approvedBy,'Fictional Advisor');
  assert.ok(approved.approvedAt);
  await assert.rejects(store.decide(license,{status:'Mailed',letter:'Changed letter.'}),/can only change when drafting or approving/);
  const mailed=await store.decide(license,{status:'Mailed'});
  assert.equal(mailed.letter,letter);
  assert.equal(mailed.approvedAt,approved.approvedAt);
  assert.ok(mailed.mailedAt);
  await assert.rejects(store.decide(license,{status:'Letter drafted',letter}),/only move forward/);
});

test('simultaneous local actions cannot approve a prospect after an opt-out',async()=>{
  const store=localSourcingStore('Fictional Advisor');
  const [optOut,approval]=await Promise.allSettled([
    store.decide(license,{status:'Do not contact'}),
    store.decide(license,{status:'Letter approved',letter}),
  ]);
  assert.equal(optOut.status,'fulfilled');
  assert.equal(approval.status,'rejected');
  assert.match(approval.reason.message,/asked not to be contacted/);
  assert.equal((await store.list()).decisions[license].status,'Do not contact');
});

test('cloud sourcing uses server decisions and sends no approval identity',async()=>{
  const calls=[];
  const approved={
    license_no:license,status:'Letter approved',letter,approved_by:'Signed-in Advisor',
    approved_at:at,mailed_at:null,note:'Fictional note.',updated_by:'Signed-in Advisor',updated_at:at,
  };
  const optedOut={
    license_no:'19HC001013',status:'Do not contact',letter:null,approved_by:null,
    approved_at:null,mailed_at:null,note:null,updated_by:'Other Advisor',updated_at:at,
  };
  const store=cloudSourcingStore({async rpc(...args){
    calls.push(args);
    return {data:args[0]==='kalling_sourcing_list'?[approved,optedOut]:approved,error:null};
  }});
  assert.equal(store.mode,'cloud');
  const snapshot=await store.list();
  assert.deepEqual(snapshot.doNotContact,['19HC001013']);
  assert.equal(snapshot.decisions['19HC001013'].letter,undefined);
  assert.equal(snapshot.decisions['19HC001013'].approvedBy,undefined);
  assert.deepEqual(snapshot.decisions[license],{
    status:'Letter approved',letter,approvedBy:'Signed-in Advisor',approvedAt:at,
    mailedAt:undefined,note:'Fictional note.',updatedBy:'Signed-in Advisor',updatedAt:at,
  });
  assert.deepEqual(await store.decide(license,{status:'Letter approved',letter,approvedBy:'Ignored alternate identity'}),snapshot.decisions[license]);
  assert.deepEqual(calls,[
    ['kalling_sourcing_list'],
    ['kalling_sourcing_decide',{p_license:license,p_status:'Letter approved',p_letter:letter,p_note:null}],
  ]);
});

test('cloud refusals are surfaced without a local fallback',async()=>{
  const reason='This owner asked not to be contacted.';
  const denied=cloudSourcingStore({async rpc(){return {data:null,error:{message:reason}};}});
  await assert.rejects(denied.list(),{message:reason});
  await assert.rejects(denied.decide(license,{status:'Letter drafted',letter}),{message:reason});
  const noResponse=cloudSourcingStore({async rpc(){return {data:null,error:null};}});
  await assert.rejects(noResponse.list(),/Could not load saved sourcing decisions/);
  await assert.rejects(noResponse.decide(license,{status:'Do not contact'}),/Could not confirm/);
  const unavailable=cloudSourcingStore({async rpc(){return {data:null,error:{code:'PGRST202',message:'Missing function'}};}});
  await assert.rejects(unavailable.list(),/Saved sourcing decisions are not available yet/);
});
