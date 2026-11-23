// Fictional hosted acceptance for the real macOS login agent. Never restarts the Mac.
import {randomUUID,createHash} from 'node:crypto';
import {readFile,lstat,rename} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {cloudAgentBackend} from '../lib/agentJobs.ts';
import {emptyBrokerDb} from '../lib/brokerage.ts';
import {executionPacket,validateExecutionOutput} from '../lib/executionDrafting.ts';
import {createWorker} from './worker-core.mjs';
import {localModel} from './local-agent-runner.mjs';
import {fictionalEmails,readHiddenPassword} from './hosted-validation.mjs';
import {validateWorkerContext,reserveWorkerReport,makeHostedClient,ownerLogin,verifyContext,verifyOwner,snapshot,row} from './hosted-worker.mjs';
import {servicePaths,installService,inspectService,restartService,uninstallService,privateJson,readJson,bootTime} from './worker-service.mjs';

const ok=(v,m)=>{if(!v)throw Error(m);},active=['queued','running','retry'],model='qwen3:4b';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const workerName=m=>'Fictional persistent pilot '+m.runId.slice(0,8);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const read=async p=>JSON.parse(await readFile(resolve(p),'utf8'));

export function validatePriorWorkerReport(foundation,handover,prior){
  const context=validateWorkerContext(foundation,handover),m=prior?.fixtureManifest;
  ok(prior?.project===deployedCloudProject.url&&prior.mode==='mac-worker'&&prior.status==='passed'&&prior.checks?.length===18&&prior.checks.every(x=>x.status==='passed')&&prior.transport?.actualAuthenticatedTransport===true&&prior.transport?.actualLocalInference===true&&m?.firm===context.firm&&m.transaction===context.transaction&&m.workerRevoked===true&&m.oldWorkerTokenRefused===true&&m.signedOut===true,'Use the passed 18-check Mac worker report for this exact closed fictional fixture.');
  return context;
}
export function validatePersistentReport(context,report){
  const m=report?.fixtureManifest;
  ok(report?.mode==='persistent-worker'&&report.project===deployedCloudProject.url&&/^[a-f0-9-]{36}$/.test(m?.runId||'')&&m.firm===context.firm&&m.transaction===context.transaction&&m.profile==='pilot'&&m.workerName===workerName(m),'Use this pilot installation’s saved report.');return m;
}
export async function originalWorkerFingerprint(home){
  const p=servicePaths({home,profile:'default'}),files=[join(p.stateDir,'worker.json'),p.plist],hashes=[];
  for(const file of files){try{ok(!(await lstat(file)).isSymbolicLink(),'The existing worker configuration is a symbolic link. Leave it untouched.');hashes.push(digest(await readFile(file)));}catch(e){if(e.code==='ENOENT')hashes.push(null);else throw e;}}
  return hashes;
}
export async function waitForService(paths,predicate,{inspect=inspectService,timeoutMs=180000,pollMs=1500,signal,progress=()=>{}}={}){
  const end=Date.now()+timeoutMs;let last=0;
  while(Date.now()<end){ok(!signal?.aborted,'Persistent worker check interrupted. Use cleanup with this report to remove its own pilot connection.');const s=await inspect(paths);
    if(s.managed&&s.registered&&s.fresh&&predicate(s.receipt))return s;
    if(Date.now()-last>=20000){progress('Waiting for pilot service: '+(s.receipt?.cloud.status||'starting')+', local model '+(s.receipt?.model.ready?'ready':'waiting'));last=Date.now();}
    await pause(pollMs);
  }
  throw Error('The pilot service did not become ready. Check its private log and Login Items setting; the report preserves cleanup identifiers.');
}

async function ownWorker(c,context,m,user){
  const r=await c.from('kalling_agent_workers').select('*').eq('firm_id',context.firm).eq('name',workerName(m));ok(!r.error&&r.data.length<=1,'The pilot worker identity is ambiguous.');
  const w=r.data[0];if(w)ok(w.created_by===user.id&&(!m.worker||w.id===m.worker),'The saved pilot credential belongs to a different worker.');return w;
}
async function quietQueue(c,context,m){
  const workers=await cloudAgentBackend(c,context.firm).listComputers(),jobs=await c.from('kalling_agent_jobs').select('id,status').eq('firm_id',context.firm).in('status',active);
  ok(!jobs.error&&workers.every(w=>w.id===m.worker)&&jobs.data.length===0,'Another connected computer or unfinished assignment exists in this fictional firm. It was left untouched.');
}
async function pairedConfig(paths,m){
  const config=await readJson(join(paths.stateDir,'worker.json'));
  ok(config?.cloud?.workerId===m.worker&&config.cloud.firmId===m.firm&&config.cloud.url===deployedCloudProject.url&&config.cloud.token,'The private pilot connection does not match this report.');return digest(await readFile(join(paths.stateDir,'worker.json')));
}
function ready(m,d){return d.model.ready&&d.model.name===model&&d.model.digest===m.modelDigest&&d.cloud.status==='online'&&d.cloud.workerId===m.worker&&d.cloud.firmId===m.firm&&!d.active&&Date.now()-Date.parse(d.cloud.lastContact)<45000&&d.model.models.execution===model;}

export async function setupPersistentWorker(config,account,foundation,handover,prior,check,m,{paths=servicePaths({profile:'pilot'}),sourceRoot,makeClient=makeHostedClient,request,service={install:installService,inspect:inspectService,restart:restartService,boot:bootTime},pair,signal,persist=async()=>{},progress=()=>{},pollMs=1500,timeoutMs=720000,home}={}){
  const context=validatePriorWorkerReport(foundation,handover,prior);Object.assign(m,{...context,runId:randomUUID(),profile:'pilot'});m.workerName=workerName(m);await persist();
  const existing=await service.inspect(paths),previousConfig=await readJson(join(paths.stateDir,'worker.json'));ok(!existing.installed&&!existing.registered,'A pilot profile already exists. Preserve it; use its report for verify-login or cleanup instead of replacing it.');
  m.originalWorker=await originalWorkerFingerprint(home);m.bootBefore=await service.boot();m.modelDigest=await localModel(model,signal,request);check(true,'Local-only qwen3:4b and the original worker configuration are checked before installation');
  const c=makeClient(config);let user;
  try{
    user=await ownerLogin(c,account);check(true,'Confirmed the existing fictional owner identity');
    const bundle=await verifyContext(c,context,user);m.baseline=snapshot(bundle);await quietQueue(c,context,m);check(true,'The closed fictional transaction and empty private queue match the completed acceptance');
    if(previousConfig){
      const old=await row(c,'kalling_agent_workers',previousConfig.cloud?.workerId);
      ok(old.revoked_at&&old.created_by===user.id&&old.firm_id===context.firm&&old.name.startsWith('Fictional persistent pilot ')&&previousConfig.cloud?.firmId===context.firm&&previousConfig.cloud?.url===config.url,'This pilot configuration is not a revoked fictional installation. Use its own report for cleanup first.');
      m.archivedState=join(paths.root,'retired-state-'+m.runId);await persist();await rename(paths.stateDir,m.archivedState);
    }
    const previous=await row(c,'kalling_agent_jobs',prior.fixtureManifest.job);ok(previous.status==='succeeded'&&previous.firm_id===context.firm&&previous.company_id===context.company&&previous.worker_id===prior.fixtureManifest.worker,'The prior local-model job is unavailable.');check(true,'The prior real local-model proposal remains persisted and unmodified');
    ok(!signal?.aborted,'Setup interrupted before installation.');m.installRequested=true;m.installationId=m.runId;await persist();
    const installed=await service.install(paths,{sourceRoot,model,installationId:m.installationId});m.runtime=installed.runtime;m.installed=true;await persist();check(true,'A standalone private runtime is installed outside Downloads in a separate pilot profile');
    await waitForService(paths,d=>!d.active,{inspect:service.inspect,signal,progress,pollMs});check(true,'macOS launchd starts the dedicated pilot process');
    m.pairingRequested=true;await persist();const backend=cloudAgentBackend(c,context.firm),code=await backend.createPairing(m.workerName);
    if(pair)m.worker=await pair(code,paths);else{const worker=createWorker({stateDir:paths.stateDir,model});await worker.pair(code,undefined,{activate:false});m.worker=worker.state.config.cloud.workerId;}
    await persist();const registered=await ownWorker(c,context,m,user);ok(registered&&!registered.revoked_at,'The pilot did not pair with this fictional owner.');m.configHash=await pairedConfig(paths,m);check(true,'The persistent computer has its own credential; the pairing command makes no model request');
    const before=await waitForService(paths,d=>ready(m,d),{inspect:service.inspect,signal,progress,pollMs});m.beforeRestart=before.receipt;await persist();check(true,'The login service reports a fresh hosted heartbeat and a verified local-only model');
    await quietQueue(c,context,m);await service.restart(paths);check(true,'Only the idle pilot process is asked to stop gracefully');
    const after=await waitForService(paths,d=>ready(m,d)&&d.pid!==m.beforeRestart.pid&&d.instance!==m.beforeRestart.instance,{inspect:service.inspect,signal,progress,pollMs});m.afterRestart=after.receipt;
    check(await pairedConfig(paths,m)===m.configHash,'macOS replaces the process and preserves the exact paired credential without re-pairing');
    const source=bundle.transaction.closes[0].evidence.find(s=>bundle.files.some(f=>f.id===s.fileId&&f.kind==='Closing evidence'&&f.content==='Confidential'&&f.review));
    ok(source?.excerpt.startsWith('Fictional signed agreement.'),'Only the reviewed fictional completion excerpt may enter this model check.');
    const packet=await executionPacket({...emptyBrokerDb(),executionFiles:bundle.files,transactions:[bundle.transaction]},bundle.transaction,{kind:'advisor',id:user.id,name:'Fictional Advisor',role:'owner'},{purpose:'Status summary',sources:[source],permissionReviewed:true});
    packet.id='persistent-worker-'+m.runId;m.assignment=packet.id;m.inputHash=packet.inputHash;await persist();const queued=await backend.submit('execution',packet);m.job=queued.id;await persist();check(true,'One sourced fictional assignment enters the normal app queue after restart');
    const end=Date.now()+timeoutMs;let job,last='',lastAt=0;
    while(Date.now()<end){ok(!signal?.aborted,'Interrupted. Use cleanup to settle this report’s assignment and revoke its pilot worker.');[job]=await backend.jobs([packet.id]);ok(job?.id===m.job,'The queued pilot assignment is unavailable.');
      const label=job.status+' '+(job.progress.label||job.progress.stage||'');if(label!==last||Date.now()-lastAt>=20000){progress(label);last=label;lastAt=Date.now();}
      if(job.status==='succeeded')break;ok(!['failed','cancelled'].includes(job.status),'The pilot assignment stopped: '+(job.error||job.status));await pause(pollMs);
    }
    ok(job?.status==='succeeded','The assignment did not complete within twelve minutes. Preserve this report and use cleanup.');
    const stored=await row(c,'kalling_agent_jobs',m.job),r=job.result;
    ok(stored.worker_id===m.worker&&r?.id===packet.id&&r.inputHash===packet.inputHash&&r.scopeId===packet.scopeId&&r.model===model&&r.modelDigest===m.modelDigest&&r.provider==='Ollama local'&&r.executionPolicy==='local-only-required-v2'&&r.proposalOnly===true,'The result does not match this exact worker and local-only input.');
    const proposal=validateExecutionOutput({claims:r.claims.map(x=>({sourceId:x.sourceId,quote:x.quote})),questions:r.questions},packet);check(proposal.claims.length>0&&proposal.questions.length>0,'The restarted service returns exact permitted quotations and proposed follow-up questions');
    const finished=await waitForService(paths,d=>ready(m,d)&&d.instance===m.afterRestart.instance&&d.localChatRequests>m.afterRestart.localChatRequests,{inspect:service.inspect,signal,progress,pollMs});
    check(r.metrics?.calls>=1&&r.metrics.calls<=2&&r.metrics.calls===finished.receipt.localChatRequests-m.afterRestart.localChatRequests&&r.metrics.apiCostUSD===0,'The new process records real local inference with zero model API charges');
    check(await localModel(model,signal,request)===m.modelDigest,'Ollama still confirms cloud features disabled and the same local model');
    m.metrics=r.metrics;m.proposal={status:'Pending human review',claims:proposal.claims.map(x=>({sourceId:x.sourceId,fileId:x.source.fileId,page:x.source.page,quote:x.quote})),questions:proposal.questions};m.restartPassed=true;m.loginStatus='Awaiting reboot and sign-in';m.lastReceipt=finished.receipt;
    check(snapshot(await verifyContext(c,context,user))===m.baseline,'The closed transaction, figures, handover access and public pause remain unchanged');
    check(JSON.stringify(await originalWorkerFingerprint(home))===JSON.stringify(m.originalWorker),'The original Mac worker credentials and login item remain unchanged');
    check(await pairedConfig(paths,m)===m.configHash,'The persistent pilot remains paired and idle for the later login check');await persist();
    return {actualAuthenticatedTransport:makeClient===makeHostedClient,actualLocalInference:!request&&process.platform==='darwin',restart:'passed',login:'pending',notCovered:['Automatic startup after a real reboot and sign-in','Interrupted active-job recovery in launchd','Browser proposal review','Hosted mobile sale rehearsal','Public launch']};
  }catch(e){
    if(m.installRequested){try{await cleanupPersistentWorker(config,{...account},foundation,handover,{project:config.url,mode:'persistent-worker',fixtureManifest:m},{paths,makeClient,service:{inspect:service.inspect,uninstall:service.uninstall||uninstallService}});m.failureCleanedUp=true;}
      catch{m.cleanupRequired=true;e.message+=' Preserve this report and run cleanup before retrying; the pilot may still be connected.';}}
    throw e;
  }finally{const out=await c.auth.signOut({scope:'global'});m.signedOut=!out.error;delete account.password;await persist();ok(m.signedOut,'The fictional owner session could not sign out.');}
}

export async function verifyPersistentLogin(config,account,foundation,handover,report,check,{paths=servicePaths({profile:'pilot'}),makeClient=makeHostedClient,service={inspect:inspectService,boot:bootTime},request,progress=()=>{},signal,pollMs=1500,home}={}){
  const context=validateWorkerContext(foundation,handover),m=validatePersistentReport(context,report);
  ok(m.restartPassed===true&&m.installed===true&&m.worker&&m.configHash,'Complete the persistent restart check first.');
  const boot=await service.boot();ok(boot>m.bootBefore,'This Mac has not rebooted since setup. Save your work, restart it, sign in normally, then run verify-login. No model request was made.');check(true,'A real reboot occurred after the service was installed');
  const s=await waitForService(paths,d=>ready(m,d)&&d.instance!==m.afterRestart.instance&&Date.parse(d.startedAt)>=boot*1000,{inspect:service.inspect,signal,progress,pollMs});
  check(await pairedConfig(paths,m)===m.configHash,'The login agent starts after reboot using the unchanged worker identity');check(await localModel(model,signal,request)===m.modelDigest,'Local-only Ollama and qwen3:4b recover after sign-in');
  const c=makeClient(config);try{const user=await ownerLogin(c,account);const w=await ownWorker(c,context,m,user);ok(w&&!w.revoked_at,'The persisted computer was revoked.');await quietQueue(c,context,m);check(s.receipt.cloud.status==='online'&&snapshot(await verifyContext(c,context,user))===m.baseline,'The same pilot reconnects to its fictional firm without changing the transaction');
    check(JSON.stringify(await originalWorkerFingerprint(home))===JSON.stringify(m.originalWorker),'The original worker configuration remains unchanged after reboot');m.loginStatus='Passed';m.loginReceipt=s.receipt;m.bootAfter=boot;
  }finally{const out=await c.auth.signOut({scope:'global'});m.signedOut=!out.error;delete account.password;ok(m.signedOut,'The fictional owner session could not sign out.');}
}

export async function cleanupPersistentWorker(config,account,foundation,handover,report,{paths=servicePaths({profile:'pilot'}),makeClient=makeHostedClient,service={inspect:inspectService,uninstall:uninstallService}}={}){
  const context=validateWorkerContext(foundation,handover),m=validatePersistentReport(context,report),c=makeClient(config);
  try{const user=await ownerLogin(c,account);await verifyOwner(c,context,user);const w=await ownWorker(c,context,m,user),backend=cloudAgentBackend(c,context.firm);
    if(m.assignment){const jobs=await backend.jobs([m.assignment]);ok(jobs.length<=1,'The cleanup assignment is ambiguous.');if(jobs[0]){const j=await row(c,'kalling_agent_jobs',jobs[0].id);ok(j.firm_id===context.firm&&j.company_id===context.company&&j.assignment_id==='persistent-worker-'+m.runId,'Cleanup will not touch another assignment.');if(active.includes(j.status))await backend.cancel({id:j.id});}}
    if(w&&!w.revoked_at)await backend.revoke(w.id);m.workerRevoked=true;if(w)m.worker=w.id;
    const s=await service.inspect(paths);if(s.installed){ok(s.installationId===m.installationId,'A different service is installed in this profile; it was left untouched.');if(w)await pairedConfig(paths,m);if(s.registered)await waitForService(paths,d=>!d.active,{inspect:service.inspect,timeoutMs:60000});await service.uninstall(paths);}m.loginItemRemoved=true;m.cleanupCompleted=true;
  }finally{const out=await c.auth.signOut({scope:'global'});m.signedOut=!out.error;delete account.password;}
}

async function main(){
  const args=process.argv.slice(2),mode=args[0],arg=n=>args[args.indexOf(n)+1],output=args.includes('--output')?arg('--output'):null;let reserved=false,report;
  const save=async()=>{if(reserved)await privateJson(resolve(output),report);};
  try{
    ok(process.platform==='darwin','Run the persistent login check on your Mac.');
    ok(['setup','verify-login','cleanup'].includes(mode)&&args.includes('--confirm-fictional')&&args.includes('--prompt')&&output&&args.includes('--foundation-report')&&args.includes('--handover-report'),'Use setup, verify-login or cleanup --confirm-fictional --prompt --foundation-report PATH --handover-report PATH --worker-report PATH --output PATH.');
    const foundation=await read(arg('--foundation-report')),handover=await read(arg('--handover-report')),context=validateWorkerContext(foundation,handover);let prior;
    if(mode==='setup'){ok(args.includes('--worker-report'),'Supply the passed Mac worker report.');prior=await read(arg('--worker-report'));validatePriorWorkerReport(foundation,handover,prior);await localModel(model);report={project:deployedCloudProject.url,mode:'persistent-worker',at:new Date().toISOString(),status:'pending',checks:[],fixtureManifest:{}};await reserveWorkerReport(output,report);reserved=true;}
    else{report=await read(output);validatePersistentReport(context,report);reserved=true;if(mode==='verify-login')ok(await bootTime()>report.fixtureManifest.bootBefore,'Restart the Mac and sign in before running verify-login. No sign-in or model request was made.');}
    const account={email:fictionalEmails.owner_a,password:await readHiddenPassword('Password for '+fictionalEmails.owner_a+': ')},controller=new AbortController(),interrupt=()=>controller.abort();process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
    const check=(pass,name)=>{ok(pass,name);report.checks.push({name,status:'passed',phase:mode});console.log('PASS: '+name);},options={signal:controller.signal,progress:s=>console.log('Progress: '+s)};
    try{
      if(mode==='setup'){report.transport=await setupPersistentWorker(deployedCloudProject,account,foundation,handover,prior,check,report.fixtureManifest,{...options,persist:save,sourceRoot:resolve(dirname(fileURLToPath(import.meta.url)),'..')});report.status='restart-passed-login-pending';delete report.error;console.log('Restart passed. The pilot stays running. Reboot and sign in when convenient, then run verify-login.');}
      else if(mode==='verify-login'){await verifyPersistentLogin(deployedCloudProject,account,foundation,handover,report,check,options);report.transport.login='passed';report.status='passed';delete report.error;console.log('Persistent startup and restart passed. The pilot remains connected; proposals still need human review.');}
      else{await cleanupPersistentWorker(deployedCloudProject,account,foundation,handover,report);report.status='stopped';delete report.error;console.log('Only this report’s pilot login item and hosted credential were stopped. Private checkpoints remain.');}
    }finally{delete account.password;process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
  }catch(e){console.error('BLOCKED: '+String(e.message||e));process.exitCode=1;if(reserved){report.error=String(e.message||e);if(!report.fixtureManifest?.restartPassed)report.status='incomplete';}}
  await save();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
