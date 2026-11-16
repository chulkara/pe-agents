import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {executionFixture,completeExecution} from './execution-helpers.mjs';
import {hostedClientFixture} from './hosted-client-fixture.mjs';
import {runMacWorker,cleanupWorkerRun} from '../../scripts/hosted-worker.mjs';
import {cloudClient,WorkerError} from '../../scripts/worker-core.mjs';
import {roles,fictionalEmails} from '../../scripts/hosted-validation.mjs';
import {deployedCloudProject} from '../../lib/cloudProject.ts';
import {executionPacket} from '../../lib/executionDrafting.ts';
import {emptyBrokerDb} from '../../lib/brokerage.ts';

async function fixture(){
 const s=await executionFixture(),dir=await mkdtemp(join(tmpdir(),'kalling-mac-worker-'));
 const completionFile=await s.file({kind:'Closing evidence'});await s.one(s.owner,'select public.kalling_execution_file_review($1,$2)',[completionFile.id,'Reviewed the exact fictional completion evidence.']);await completeExecution(s,{completionFile});
 const ids={owner_a:s.owner,owner_b:s.outsider,member:s.viewer,seller:s.seller,buyer:s.buyer,specialist:s.other},accounts=Object.fromEntries(roles.map(r=>[r,{email:fictionalEmails[r],password:'Fictional-worker-protocol-password-12345'}]));
 for(const r of roles)await s.db.query('update auth.users set email=$1 where id=$2',[accounts[r].email,ids[r]]);
 const base=randomUUID(),run=randomUUID(),company='fictional-handover-'+run,name='Fictional hosted validation A '+base,workspace={firm:{name},companies:[{id:company,name:'Fictional HVAC handover validation',sample:true}],deals:[],events:[]};
 const version=(await s.db.query('select version from public.kalling_workspaces where firm_id=$1',[s.firm])).rows[0].version;await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,version,workspace,'Fictional worker validation']);
 const otherFirm=await s.one(s.outsider,'select public.kalling_create_firm($1,$2)',['Fictional hosted validation B '+base,{...workspace,firm:{name:'Fictional hosted validation B '+base}}]);
 await s.db.query("update public.kalling_listings set headline='Sample HVAC closing-file validation' where id=$1",[s.l]);await s.db.query("update public.kalling_listing_private set company_id=$2,business_name='Fictional HVAC handover validation' where listing_id=$1",[s.l,company]);await s.db.query("update kalling_private.execution_transactions set data=jsonb_set(data,'{companyId}',to_jsonb($2::text)) where id=$1",[s.id,company]);await s.db.exec('update kalling_private.brokerage_settings set intake_open=false');
 await s.db.query('update public.kalling_portals set company_id=$2 where id=$1',[s.portal,company]);await s.one(s.owner,'select public.kalling_portal_update($1,$2)',[s.portal,{close:true}]);await s.one(s.owner,'select public.kalling_buyer_vet($1,$2,$3)',[s.b1,'Restricted','Fictional handover cleanup.']);await s.one(s.owner,'select public.kalling_set_member($1,$2,$3,$4)',[s.firm,s.viewer,'viewer',false]);
 const foundation={project:deployedCloudProject.url,mode:'run',status:'passed',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:24},()=>({status:'passed'})),fixtureManifest:{project:deployedCloudProject.url,fixture:base,firms:[s.firm,otherFirm]}};
 const handover={project:deployedCloudProject.url,mode:'handover',status:'passed',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:90},()=>({status:'passed'})),fixtureManifest:{fixture:run,firm:s.firm,company,listing:s.l,transaction:s.id,portal:s.portal,buyer:s.b1,fixtureClosed:true,portalClosed:true,memberRevoked:true,buyerRestricted:true}};
 const sdk=hostedClientFixture(s,accounts,ids),cloudFactory=config=>cloudClient({...config,fetchImpl:async(url,init)=>{assert.ok(new URL(url).pathname.startsWith('/rest/v1/rpc/kalling_worker_'));assert.equal(init.headers.Authorization,undefined);const result=await sdk.anonymousRpc(new URL(url).pathname.split('/').at(-1),JSON.parse(init.body));return new Response(JSON.stringify(result.error?{message:result.error.message}:result.data),{status:result.error?result.status:200});}});
 const close=async()=>{await sdk.idle();await s.db.close();await rm(dir,{recursive:true,force:true});};return {...s,dir,accounts,foundation,handover,sdk,cloudFactory,close};
}
function localModel({ready=true,invalid=false}={}){let chats=0;return {get chats(){return chats;},request:async(path,body)=>{if(path==='/api/status')return {cloud:{disabled:ready}};if(path==='/api/tags')return {models:[{name:'qwen3:4b',size:2500000000,digest:'a'.repeat(64)}]};if(path==='/api/show')return {modelfile:'FROM /local/weights'};assert.equal(path,'/api/chat');assert.equal(body.model,'qwen3:4b');chats++;const input=JSON.parse(body.messages[1].content);return {done:true,done_reason:'stop',prompt_eval_count:250,eval_count:80,message:{content:JSON.stringify({claims:[{sourceId:input.passages[0].id,quote:invalid?'This quote was invented.':input.passages[0].text}],questions:['Which remaining items should the advisor confirm before archiving?']})}};}};}
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
