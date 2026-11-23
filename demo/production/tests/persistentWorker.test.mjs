import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {fixture,localModel} from './mac-worker-helpers.mjs';
import {runMacWorker} from '../../scripts/hosted-worker.mjs';
import {setupPersistentWorker,verifyPersistentLogin,cleanupPersistentWorker,validatePriorWorkerReport,waitForService} from '../../scripts/persistent-worker.mjs';
import {exportWorkerReview} from '../../scripts/review-worker-proposal.mjs';
import {createWorker} from '../../scripts/worker-core.mjs';
import {servicePaths,serviceReceipt} from '../../scripts/worker-service.mjs';
import {deployedCloudProject as config} from '../../lib/cloudProject.ts';
const timing={idle:5,heartbeat:10,renew:40,modelOk:60000,modelRetry:10},check=(pass,name)=>assert.ok(pass,name);

async function prior(s){const model=localModel(),m={},checks=[];await runMacWorker(config,{...s.accounts.owner_a},s.foundation,s.handover,(pass,name)=>{check(pass,name);checks.push({name,status:'passed'});},m,{makeClient:s.sdk.makeClient,request:model.request,workerCloudFactory:s.cloudFactory,stateDir:join(s.dir,'temporary'),pollMs:5,timeoutMs:10000,workerTiming:timing});
 // This represents the user's accepted prior report, not new hosted evidence from this test.
 return {project:config.url,mode:'mac-worker',status:'passed',checks,fixtureManifest:m,transport:{actualAuthenticatedTransport:true,actualLocalInference:true}};}
function fakeService(s,paths,model){let worker,pid=100,instance,localChats=0,installed=false,boot=10,installationId;const runtime={digest:'b'.repeat(64),script:join(paths.root,'releases','b'.repeat(64),'scripts','kalling-worker.mjs')};
 async function start(){pid++;instance=randomUUID();localChats=0;worker=createWorker({stateDir:paths.stateDir,model:'qwen3:4b',request:async(path,body,signal)=>{if(path==='/api/chat')localChats++;return model.request(path,body,signal);},cloudFactory:s.cloudFactory,timing});await worker.start();}
 return {get chats(){return localChats;},get worker(){return worker;},reboot(){boot=20;return this.restart();},boot:async()=>boot,
  install:async(_paths,options)=>{installationId=options.installationId;installed=true;await start();return {runtime};},inspect:async()=>({installed,managed:installed,registered:installed,fresh:installed,runtime,installationId,receipt:worker?serviceReceipt(worker,paths,{pid,instance,localChatRequests:localChats}):null}),
  restart:async()=>{assert.equal(worker.state.active,null);await worker.stop();await start();},uninstall:async()=>{await worker?.stop();installed=false;},stop:()=>worker?.stop(),
  pair:async code=>{const p=createWorker({stateDir:paths.stateDir,cloudFactory:s.cloudFactory});await p.pair(code,undefined,{activate:false});return p.state.config.cloud.workerId;}};
}

test('persistent controller preserves identity across process restart, requires an actual later boot and leaves only reviewed proposals',async()=>{
 const s=await fixture();let service;try{
  const previous=await prior(s),paths=servicePaths({home:s.dir,profile:'pilot'}),model=localModel(),m={},checks=[];service=fakeService(s,paths,model);const before=(await s.load()).transaction;
  const transport=await setupPersistentWorker(config,{...s.accounts.owner_a},s.foundation,s.handover,previous,(pass,name)=>{check(pass,name);checks.push(name);},m,{paths,home:s.dir,makeClient:s.sdk.makeClient,request:model.request,service,pair:service.pair,pollMs:5,timeoutMs:10000});
  assert.equal(checks.length,17);assert.equal(transport.actualAuthenticatedTransport,false);assert.equal(transport.actualLocalInference,false);assert.equal(transport.login,'pending');assert.equal(m.restartPassed,true);assert.equal(m.signedOut,true);assert.notEqual(m.beforeRestart.pid,m.afterRestart.pid);assert.equal(m.beforeRestart.cloud.workerId,m.afterRestart.cloud.workerId);assert.equal(m.proposal.status,'Pending human review');assert.equal(service.chats,1);assert.deepEqual((await s.load()).transaction,before);
  const credentials=JSON.parse(await readFile(join(paths.stateDir,'worker.json'),'utf8'));assert.ok(!JSON.stringify(m).includes(credentials.cloud.token));const report={project:config.url,mode:'persistent-worker',fixtureManifest:m};
  const signouts=s.sdk.signedOut.length;await assert.rejects(verifyPersistentLogin(config,{...s.accounts.owner_a},s.foundation,s.handover,report,check,{paths,home:s.dir,service,makeClient:s.sdk.makeClient,request:model.request,pollMs:5}),/has not rebooted/);assert.equal(s.sdk.signedOut.length,signouts,'no Auth is attempted until a later boot');
  await service.reboot();await verifyPersistentLogin(config,{...s.accounts.owner_a},s.foundation,s.handover,report,check,{paths,home:s.dir,service,makeClient:s.sdk.makeClient,request:model.request,pollMs:5});assert.equal(m.loginStatus,'Passed');assert.equal(service.chats,0,'login check does not make a model request');
  await s.db.exec('update kalling_private.brokerage_settings set intake_open=true');
  await cleanupPersistentWorker(config,{...s.accounts.owner_a},s.foundation,s.handover,report,{paths,makeClient:s.sdk.makeClient,service});assert.equal(m.cleanupCompleted,true);assert.equal((await s.db.query('select count(*)::int n from kalling_private.worker_tokens')).rows[0].n,0);assert.equal((await service.inspect()).installed,false);
  await s.db.exec('update kalling_private.brokerage_settings set intake_open=false');
  const second={};await setupPersistentWorker(config,{...s.accounts.owner_a},s.foundation,s.handover,previous,check,second,{paths,home:s.dir,makeClient:s.sdk.makeClient,request:model.request,service,pair:service.pair,pollMs:5,timeoutMs:10000});
  assert.notEqual(second.worker,m.worker);assert.ok(second.archivedState);assert.ok((await readFile(join(second.archivedState,'worker.json'),'utf8')).includes(credentials.cloud.token));
  await assert.rejects(cleanupPersistentWorker(config,{...s.accounts.owner_a},s.foundation,s.handover,report,{paths,makeClient:s.sdk.makeClient,service}),/different service/);assert.equal((await service.inspect()).installed,true,'an old report cannot stop a later pilot');
  await cleanupPersistentWorker(config,{...s.accounts.owner_a},s.foundation,s.handover,{project:config.url,mode:'persistent-worker',fixtureManifest:second},{paths,makeClient:s.sdk.makeClient,service});
 }finally{await service?.stop();await s.close();}
});
test('failed post-install setup revokes its own recovered credential, removes only its service and keeps the prior proposal',async()=>{
 const s=await fixture();let service;try{const previous=await prior(s),paths=servicePaths({home:s.dir,profile:'pilot'}),model=localModel(),m={};service=fakeService(s,paths,model);
  await assert.rejects(setupPersistentWorker(config,{...s.accounts.owner_a},s.foundation,s.handover,previous,check,m,{paths,home:s.dir,makeClient:s.sdk.makeClient,request:model.request,service,pair:async(code,p)=>{await service.pair(code,p);throw Error('Simulated pairing reply lost');},pollMs:5,timeoutMs:2000}),/pairing reply lost/);
  assert.equal(m.failureCleanedUp,true);assert.equal(m.workerRevoked,true);assert.equal(m.loginItemRemoved,true);assert.equal((await s.db.query('select count(*)::int n from kalling_private.worker_tokens')).rows[0].n,0);assert.equal((await s.db.query('select status from public.kalling_agent_jobs where id=$1',[previous.fixtureManifest.job])).rows[0].status,'succeeded');assert.equal(service.chats,0);
 }finally{await service?.stop();await s.close();}
});
test('read-only review exports current logged source bytes alongside the proposal and refuses stale or overwritten folders',async()=>{
 const s=await fixture();try{const previous=await prior(s);
  const blobBytes=s.completionBytes;
  const folder=join(s.dir,'proposal-review'),before=(await s.load()).transaction;
  const exported=await exportWorkerReview(config,{...s.accounts.owner_a},s.foundation,s.handover,previous,folder,{makeClient:s.sdk.makeClient});assert.equal(exported.modelRequests,0);assert.equal(exported.proposalStatus,'Pending human review');assert.equal((await stat(join(folder,'review.txt'))).mode&0o077,0);assert.ok((await readFile(join(folder,'source-1.pdf'))).equals(blobBytes));assert.match(await readFile(join(folder,'review.txt'),'utf8'),/PROPOSED QUESTIONS/);assert.deepEqual((await s.load()).transaction,before);
  await assert.rejects(exportWorkerReview(config,{...s.accounts.owner_a},s.foundation,s.handover,previous,folder,{makeClient:s.sdk.makeClient}),/EEXIST/);assert.ok(await readFile(join(folder,'review.txt')));
  await s.db.query("update kalling_private.execution_transactions set data=jsonb_set(data,'{revision}',to_jsonb(((data->>'revision')::int+1))) where id=$1",[s.id]);await assert.rejects(exportWorkerReview(config,{...s.accounts.owner_a},s.foundation,s.handover,previous,join(s.dir,'stale-review'),{makeClient:s.sdk.makeClient}),/stale/);
 }finally{await s.close();}
});
test('an unverified prior report is rejected and stale service receipts cannot prove a restart',async()=>{
 assert.throws(()=>validatePriorWorkerReport({}, {}, {}));const controller=new AbortController();controller.abort();await assert.rejects(waitForService({},()=>true,{signal:controller.signal,inspect:()=>{throw Error('Must not inspect');}}),/interrupted/);
});
