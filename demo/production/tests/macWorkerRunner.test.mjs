import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {runMacWorker,cleanupWorkerRun} from '../../scripts/hosted-worker.mjs';
import {WorkerError} from '../../scripts/worker-core.mjs';
import {deployedCloudProject} from '../../lib/cloudProject.ts';
import {executionPacket} from '../../lib/executionDrafting.ts';
import {emptyBrokerDb} from '../../lib/brokerage.ts';

import {fixture,localModel} from './mac-worker-helpers.mjs';
const timing={idle:10,heartbeat:10,renew:40,modelOk:60000,modelRetry:20};

test('the Mac pilot uses the actual worker and queue, observes one simulated model call, leaves a review-only result and revokes its own token',async()=>{
 const s=await fixture();try{const model=localModel(),manifest={},checks=[],before=(await s.load()).transaction;
  const transport=await runMacWorker(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,(pass,name)=>{assert.ok(pass,name);checks.push(name);},manifest,{makeClient:s.sdk.makeClient,request:model.request,workerCloudFactory:s.cloudFactory,stateDir:s.dir,pollMs:5,timeoutMs:10000,workerTiming:timing});
  assert.equal(checks.length,18);assert.equal(model.chats,1);assert.equal(transport.actualAuthenticatedTransport,false);assert.equal(transport.actualLocalInference,false);assert.equal(manifest.proposal.status,'Pending human review');assert.equal(manifest.workerRevoked,true);assert.equal(manifest.oldWorkerTokenRefused,true);assert.equal(manifest.workerStopped,true);assert.equal(manifest.signedOut,true);
  await s.sdk.idle();const job=(await s.db.query('select * from public.kalling_agent_jobs where id=$1',[manifest.job])).rows[0];assert.equal(job.status,'succeeded');assert.equal(job.worker_id,manifest.worker);assert.equal(JSON.parse(job.result).proposalOnly,true);assert.equal(JSON.parse(job.result).metrics.apiCostUSD,0);assert.deepEqual((await s.load()).transaction,before);
  assert.equal((await s.db.query('select count(*)::int n from kalling_private.worker_tokens')).rows[0].n,0);assert.equal((await s.db.query('select count(*)::int n from public.kalling_agent_workers where revoked_at is null')).rows[0].n,0);assert.equal(s.sdk.signedOut.length,1);
  const config=JSON.parse(await readFile(join(s.dir,'worker.json'),'utf8'));assert.ok(config.cloud.token);assert.ok(!JSON.stringify(manifest).includes(config.cloud.token),'the report never contains the worker credential');
 }finally{await s.close();}
});
test('a model outage stops before sign-in or queue writes; an invalid cited model result never passes acceptance',async()=>{
 const s=await fixture();try{const offline=localModel({ready:false}),m={};await assert.rejects(runMacWorker(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,()=>{},m,{makeClient:s.sdk.makeClient,request:offline.request,stateDir:s.dir}),/cloud features/);assert.equal(offline.chats,0);assert.equal(s.sdk.signedOut.length,0);assert.equal((await s.db.query('select count(*)::int n from public.kalling_agent_jobs')).rows[0].n,0);
  const invalid=localModel({invalid:true}),manifest={};await assert.rejects(runMacWorker(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,(pass,name)=>assert.ok(pass,name),manifest,{makeClient:s.sdk.makeClient,request:invalid.request,workerCloudFactory:s.cloudFactory,stateDir:s.dir,pollMs:5,timeoutMs:3000,workerTiming:timing}),/did not finish|worker stopped/i);assert.ok(invalid.chats>=1);
  assert.equal(manifest.workerRevoked,true);assert.equal(manifest.oldWorkerTokenRefused,true);assert.equal(manifest.signedOut,true);assert.equal(manifest.proposal,undefined);await s.sdk.idle();const job=(await s.db.query('select status,result from public.kalling_agent_jobs where id=$1',[manifest.job])).rows[0];assert.notEqual(job.status,'succeeded');assert.equal(job.result,null);
 }finally{await s.close();}
});
test('cleanup after an interrupted process cancels only its own job and refuses another worker identifier',async()=>{
 const s=await fixture();try{const manifest={runId:randomUUID(),firm:s.firm,transaction:s.id};manifest.assignment='mac-worker-'+manifest.runId;
  const code=await s.one(s.owner,'select public.kalling_agent_create_pairing($1,$2)',[s.firm,'Fictional Mac worker check '+manifest.runId.slice(0,8)]),paired=await s.sdk.anonymousRpc('kalling_worker_pair',{p_code:code,p_version:'kalling-worker-3'});manifest.worker=paired.data.worker_id;
  const b=await s.load(),packet=await executionPacket({...emptyBrokerDb(),executionFiles:b.files,transactions:[b.transaction]},b.transaction,{kind:'advisor',id:s.owner,name:'Fictional Advisor',role:'owner'},{purpose:'Status summary',sources:b.transaction.closes[0].evidence,permissionReviewed:true});packet.id=manifest.assignment;manifest.job=await s.one(s.owner,'select public.kalling_agent_enqueue($1,$2,$3)',[s.firm,'execution',JSON.stringify(packet)]);
  const expectedJob=manifest.job,expectedWorker=manifest.worker;delete manifest.job;delete manifest.worker;await s.db.exec('update kalling_private.brokerage_settings set intake_open=true');
  const report={project:deployedCloudProject.url,mode:'mac-worker',status:'failed',fixtureManifest:manifest};await cleanupWorkerRun(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,report,{makeClient:s.sdk.makeClient});assert.equal(manifest.workerRevoked,true);assert.equal(manifest.signedOut,true);assert.equal(manifest.job,expectedJob);assert.equal(manifest.worker,expectedWorker);assert.equal(manifest.workerRecoveredByName,true);
  assert.equal((await s.db.query('select status from public.kalling_agent_jobs where id=$1',[manifest.job])).rows[0].status,'cancelled');
  const otherCode=await s.one(s.owner,'select public.kalling_agent_create_pairing($1,$2)',[s.firm,'Unrelated fictional worker']),other=await s.sdk.anonymousRpc('kalling_worker_pair',{p_code:otherCode,p_version:'kalling-worker-3'});manifest.worker=other.data.worker_id;
  await assert.rejects(cleanupWorkerRun(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,report,{makeClient:s.sdk.makeClient}),/its own pilot worker/);assert.equal((await s.db.query('select revoked_at from public.kalling_agent_workers where id=$1',[other.data.worker_id])).rows[0].revoked_at,null);
 }finally{await s.close();}
});
test('a different assignment returned during claim is withheld from the model and only this pilot is cleaned up',async()=>{
 const s=await fixture();try{const model=localModel(),manifest={};const factory=config=>{const real=s.cloudFactory(config);return {...real,claim:async token=>{const j=await real.claim(token);return j?{...j,id:randomUUID()}:j;}};};
  await assert.rejects(runMacWorker(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,(pass,name)=>assert.ok(pass,name),manifest,{makeClient:s.sdk.makeClient,request:model.request,workerCloudFactory:factory,stateDir:s.dir,pollMs:5,timeoutMs:3000,workerTiming:timing}),/different assignment/);
  assert.equal(model.chats,0);assert.equal(manifest.unexpectedJobBlocked,true);assert.equal(manifest.workerRevoked,true);assert.equal(manifest.jobSettled,true);assert.equal(manifest.signedOut,true);
 }finally{await s.close();}
});
test('a lost enqueue reply still locates and cancels the committed pilot job',async()=>{
 const s=await fixture();try{const model=localModel(),manifest={},makeClient=()=>{const c=s.sdk.makeClient(),call=c.rpc;c.rpc=async(name,args)=>{const r=await call(name,args);return name==='kalling_agent_enqueue'&&!r.error?{data:null,error:{message:'Simulated enqueue response interrupted.'}}:r;};return c;};
  await assert.rejects(runMacWorker(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,(pass,name)=>assert.ok(pass,name),manifest,{makeClient,request:model.request,workerCloudFactory:s.cloudFactory,stateDir:s.dir}),/enqueue response interrupted/);
  assert.equal(model.chats,0);assert.equal(manifest.jobSettled,true);assert.ok(manifest.job);assert.equal((await s.db.query('select status from public.kalling_agent_jobs where id=$1',[manifest.job])).rows[0].status,'cancelled');assert.equal(manifest.signedOut,true);
 }finally{await s.close();}
});
test('a lost pairing reply still finds and revokes the newly created pilot credential',async()=>{
 const s=await fixture();try{const model=localModel(),manifest={},factory=config=>{const c=s.cloudFactory(config);return {...c,pair:async code=>{await c.pair(code);throw new WorkerError('Simulated pairing response interrupted.');}};};
  await assert.rejects(runMacWorker(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,(pass,name)=>assert.ok(pass,name),manifest,{makeClient:s.sdk.makeClient,request:model.request,workerCloudFactory:factory,stateDir:s.dir,workerTiming:timing}),/pairing response interrupted/);
  assert.equal(model.chats,0);assert.equal(manifest.workerRecoveredByName,true);assert.equal(manifest.workerRevoked,true);assert.equal(manifest.signedOut,true);await s.sdk.idle();assert.equal((await s.db.query('select count(*)::int n from kalling_private.worker_tokens')).rows[0].n,0);
 }finally{await s.close();}
});
test('cancellation while recording an inference attempt prevents the actual local chat request',async()=>{
 const s=await fixture();try{const model=localModel(),manifest={},controller=new AbortController();
  await assert.rejects(runMacWorker(deployedCloudProject,{...s.accounts.owner_a},s.foundation,s.handover,(pass,name)=>assert.ok(pass,name),manifest,{makeClient:s.sdk.makeClient,request:model.request,workerCloudFactory:s.cloudFactory,stateDir:s.dir,pollMs:5,timeoutMs:3000,workerTiming:timing,signal:controller.signal,persist:async()=>{if(manifest.observedLocalChatRequests)controller.abort();}}),/interrupted|unavailable/);
  assert.equal(model.chats,0);assert.equal(manifest.jobSettled,true);assert.equal(manifest.workerRevoked,true);assert.equal(manifest.signedOut,true);
 }finally{await s.close();}
});
