// One bounded, fictional hosted queue job, executed by the actual Mac worker and local Qwen.
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rename,open} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {cloudAgentBackend} from '../lib/agentJobs.ts';
import {cloudExecutionStore} from '../lib/executionStore.ts';
import {emptyBrokerDb} from '../lib/brokerage.ts';
import {executionPacket,validateExecutionOutput} from '../lib/executionDrafting.ts';
import {createWorker,cloudClient,workerVersion,WorkerError} from './worker-core.mjs';
import {localModel,localRequest,assertLocalOnly} from './local-agent-runner.mjs';
import {validateTarget,fictionalEmails,readHiddenPassword} from './hosted-validation.mjs';
import {loadFoundationReport,validateFoundationReport} from './hosted-owner-uploads.mjs';

const ok=(value,message)=>{if(!value)throw Error(message);};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshot=b=>sha({...b,files:[...b.files].sort((a,z)=>a.id.localeCompare(z.id)),transaction:{...b.transaction,participants:[...b.transaction.participants].sort((a,z)=>a.id.localeCompare(z.id))}});
const model='qwen3:4b',active=['queued','running','retry'];
const workerName=m=>'Fictional Mac worker check '+m.runId.slice(0,8);
const notAborted=signal=>ok(!signal?.aborted,'Mac worker validation interrupted. Temporary access is being removed.');
const boundedFetch=(url,init={})=>fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
const makeHostedClient=config=>createClient(config.url,config.publishableKey,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(c,name,args={}){const r=await c.rpc(name,args);if(r.error)throw Error(name+': '+(r.error.code||'request_failed'));return r.data;}
async function row(c,table,id){const r=await c.from(table).select('*').eq('id',id).single();ok(!r.error&&r.data,'The fictional '+table+' record is unavailable.');return r.data;}
async function json(path,label){try{return JSON.parse(await readFile(resolve(path),'utf8'));}catch{throw Error('Cannot read '+label+' as JSON. Its contents are not printed.');}}
export async function reserveWorkerReport(path,report){
  let file;try{file=await open(resolve(path),'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('That Mac worker report already exists. Preserve it; use cleanup for an interrupted run or choose a new output filename.');throw e;}
  try{await file.writeFile(JSON.stringify(report,null,2)+'\n');}finally{await file.close();}
}
export function validateWorkerContext(foundation,handover){
  const base=validateFoundationReport(foundation),m=handover?.fixtureManifest;
  ok(handover?.project===deployedCloudProject.url&&handover.mode==='handover'&&handover.status==='passed'&&handover.transport?.actualAuthenticatedTransport===true&&handover.checks?.length===90&&handover.checks.every(c=>c.status==='passed'),'Complete all 90 authenticated handover checks first.');
  ok(uuid(m?.fixture)&&m.firm===base.firmA&&uuid(m.listing)&&uuid(m.transaction)&&uuid(m.portal)&&uuid(m.buyer)&&m.company==='fictional-handover-'+m.fixture&&m.fixtureClosed===true&&m.portalClosed===true&&m.memberRevoked===true&&m.buyerRestricted===true,'Use the completed, closed fictional handover fixture.');
  return {firm:m.firm,company:m.company,listing:m.listing,transaction:m.transaction,portal:m.portal,buyer:m.buyer,handoverFixture:m.fixture,foundationFixture:foundation.fixtureManifest.fixture};
}
async function ownerLogin(c,account){
  ok(account?.email===fictionalEmails.owner_a&&typeof account.password==='string'&&account.password.length>=24,'Use the existing fictional owner_a account.');
  const login=await c.auth.signInWithPassword(account);ok(!login.error&&login.data.session,'Fictional owner sign-in failed. No credentials are printed.');const current=await c.auth.getUser();
  ok(!current.error&&current.data.user?.email_confirmed_at&&current.data.user.email===fictionalEmails.owner_a,'The confirmed fictional owner identity does not match.');return current.data.user;
}
async function verifyOwner(c,context,user){
  const firm=await row(c,'kalling_firms',context.firm);
  ok(firm.created_by===user.id&&firm.name==='Fictional hosted validation A '+context.foundationFixture,'The fictional foundation owner does not match.');
}
async function verifyContext(c,context,user){
  await verifyOwner(c,context,user);const listing=await row(c,'kalling_listings',context.listing),status=await rpc(c,'kalling_brokerage_status');
  const bundles=await cloudExecutionStore(c).list(),b=bundles.find(x=>x.transaction.id===context.transaction),w=await c.from('kalling_workspaces').select('data').eq('firm_id',context.firm).single();
  ok(status.firmId===context.firm&&status.intakeOpen===false&&listing.sample===true&&listing.status==='Sold'&&listing.headline==='Sample HVAC closing-file validation'&&b?.transaction.fictional===true&&b.transaction.state==='Closed'&&b.transaction.companyId===context.company&&b.transaction.listingId===context.listing&&b.transaction.portalId===context.portal&&b.transaction.buyerId===context.buyer&&b.transaction.closes.length===1&&!w.error&&w.data.data.companies.every(x=>x.sample===true)&&w.data.data.companies.some(x=>x.id===context.company&&x.name==='Fictional HVAC handover validation'),'The closed sample or paused private brokerage changed.');
  const portal=await row(c,'kalling_portals',context.portal),buyer=await row(c,'kalling_buyers',context.buyer),members=await c.from('kalling_members').select('user_id,role,active').eq('firm_id',context.firm);
  ok(portal.status==='Closed'&&portal.company_id===context.company&&buyer.status==='Restricted'&&!members.error&&members.data.filter(x=>x.active).every(x=>x.user_id===user.id&&x.role==='owner')&&b.transaction.participants.every(x=>x.status==='Revoked')&&b.transaction.cases.every(x=>x.status!=='Published')&&b.transaction.comparables.length===0,'The prior acceptance access cleanup must remain in place for this isolated pilot.');
  return b;
}
async function settlePilotJob(c,context,m){
  const backend=cloudAgentBackend(c,context.firm);let j;
  if(m.job)j=await row(c,'kalling_agent_jobs',m.job);
  else if(m.assignment){const matches=await backend.jobs([m.assignment]);ok(matches.length<=1,'The pilot assignment is ambiguous.');if(matches.length)j=await row(c,'kalling_agent_jobs',matches[0].id);}
  if(!j){m.jobNotQueued=true;return;}
  ok(j.firm_id===context.firm&&j.company_id===context.company&&j.assignment_id===m.assignment,'The report does not identify its own pilot job.');m.job=j.id;if(active.includes(j.status))await backend.cancel({id:j.id});
}
async function revokePilotWorker(c,context,m,owner){
  let w;if(m.worker)w=await row(c,'kalling_agent_workers',m.worker);
  else{const r=await c.from('kalling_agent_workers').select('*').eq('firm_id',context.firm).eq('name',workerName(m));ok(!r.error&&r.data.length<=1,'The pilot worker could not be located unambiguously.');if(r.data.length){w=r.data[0];m.worker=w.id;m.workerRecoveredByName=true;}}
  if(!w){m.workerNotPaired=true;return;}
  ok(w.firm_id===context.firm&&w.name===workerName(m)&&w.created_by===owner.id,'The report does not identify its own pilot worker.');if(!w.revoked_at)await cloudAgentBackend(c,context.firm).revoke(w.id);
}
export async function runMacWorker(config,account,foundation,handover,check,manifest,{makeClient=makeHostedClient,request=localRequest,workerCloudFactory=cloudClient,stateDir,signal,persist=async()=>{},progress=()=>{},pollMs=1500,timeoutMs=720000,workerTiming}={}){
  validateTarget(config);const context=validateWorkerContext(foundation,handover);notAborted(signal);Object.assign(manifest,{...context,runId:randomUUID(),workerVersion,model});
  const digest=await localModel(model,signal,request);manifest.modelDigest=digest;check(true,'Local qwen3:4b is installed and the running Ollama confirms cloud features are disabled');
  const c=makeClient(config);let backend,worker,workerToken,workerClient,owner,verified=false,result,chatRequests=0,ownWorkerId,ownJob;const cleanupErrors=[];
  try{
    const user=owner=await ownerLogin(c,account);notAborted(signal);check(true,'Confirmed hosted fictional owner_a identity');
    const bundle=await verifyContext(c,context,user),baseline=snapshot(bundle);verified=true;backend=cloudAgentBackend(c,context.firm);
    check(true,'The exact closed fictional HVAC transaction and paused brokerage match');
    const computers=await backend.listComputers(),waiting=await c.from('kalling_agent_jobs').select('id,status').eq('firm_id',context.firm).in('status',active);
    ok(!waiting.error&&computers.length===0&&waiting.data.length===0,'This fictional firm has another connected computer or unfinished job. Preserve it and review before this isolated run.');check(true,'The fictional queue is empty and no other computer is connected');
    const source=bundle.transaction.closes[0].evidence.find(s=>bundle.files.some(f=>f.id===s.fileId&&f.kind==='Closing evidence'&&f.content==='Confidential'&&f.review));
    ok(source?.excerpt.startsWith('Fictional signed agreement.')&&source.excerpt.includes('Cash consideration USD 2,400,000'),'Use the reviewed fictional completion passage, never a real or restricted document.');
    const packet=await executionPacket({...emptyBrokerDb(),executionFiles:bundle.files,transactions:[bundle.transaction]},bundle.transaction,{kind:'advisor',id:user.id,name:'Fictional Advisor',role:'owner'},{purpose:'Status summary',sources:[source],permissionReviewed:true});
    packet.id='mac-worker-'+manifest.runId;manifest.assignment=packet.id;manifest.inputHash=packet.inputHash;
    check(packet.data.passages.length===1,'Only one reviewed fictional excerpt enters the model packet');
    await persist();notAborted(signal);const queued=await backend.submit('execution',packet);manifest.job=ownJob=queued.id;await persist();check(queued.status==='queued','The app queue accepts the cited proposal and retains it for the worker');
    if(!stateDir){const root=join(homedir(),'.kalling-agent');await mkdir(root,{recursive:true,mode:0o700});stateDir=await mkdtemp(join(root,'mac-validation-'));}manifest.stateDir=stateDir;await persist();
    const observedRequest=async(path,body,abort)=>{notAborted(signal);if(path==='/api/chat'){ok(body.model===model,'The pilot may use only local qwen3:4b.');chatRequests++;manifest.observedLocalChatRequests=chatRequests;await persist();}notAborted(signal);const combined=signal&&abort?AbortSignal.any([signal,abort]):signal||abort;return request(path,body,combined);};
    const guardedFactory=project=>{const real=workerCloudFactory(project);workerClient=real;return {...real,pair:async code=>{notAborted(signal);const p=await real.pair(code);ok(p.firm_id===context.firm&&uuid(p.worker_id),'The computer paired to a different firm.');manifest.worker=ownWorkerId=p.worker_id;workerToken=p.token;await persist();return p;},claim:async token=>{if(signal?.aborted)return null;const job=await real.claim(token);if(job?.id&&job.id!==ownJob){manifest.unexpectedJobBlocked=true;throw new WorkerError('A different assignment was withheld from the model. Stop and review the queue.',{denied:true});}return job;}};};
    worker=createWorker({stateDir,model,request:observedRequest,cloudFactory:guardedFactory,log:()=>{},...(workerTiming?{timing:workerTiming}:{})});await worker.start();
    notAborted(signal);manifest.pairingRequested=true;await persist();const code=await backend.createPairing(workerName(manifest));await worker.pair(code);
    check(uuid(ownWorkerId),'A separate worker credential pairs only to the fictional firm');
    const began=Date.now(),end=began+timeoutMs;let job,last='',lastMessage=0,claimed=false;
    while(Date.now()<end){
      if(signal?.aborted)throw Error('Mac worker validation interrupted. Temporary access is being removed.');
      [job]=await backend.jobs([packet.id]);ok(job?.id===ownJob,'The queued fictional assignment is unavailable.');
      const label=job.status+' '+(job.progress.label||job.progress.stage||'');if(label!==last||Date.now()-lastMessage>=20000){progress(label+' ('+Math.round((Date.now()-began)/1000)+' seconds)');last=label;lastMessage=Date.now();}
      if(manifest.unexpectedJobBlocked)throw Error('A different assignment was withheld from inference. Review the queue.');
      if(worker.state.model.checkedAt>0&&!worker.status().model.ready)throw Error('Local-only Qwen is unavailable: '+worker.status().model.detail);
      if(worker.status().cloud.status==='revoked')throw Error('The temporary worker lost authorization. It will not reconnect automatically.');
      if(job.status==='running')claimed=true;
      if(job.status==='succeeded')break;
      if(['failed','cancelled'].includes(job.status))throw Error('The worker stopped: '+(job.error||job.status));
      await pause(pollMs);
    }
    ok(job?.status==='succeeded','The local job did not finish within twelve minutes. Preserve the report and checkpoint; cleanup removes its temporary access.');
    const stored=await row(c,'kalling_agent_jobs',ownJob);check(stored.worker_id===ownWorkerId&&stored.kind==='execution'&&(claimed||stored.started_at),'The paired Mac claims and completes this exact hosted assignment');
    const r=job.result;ok(r?.version===1&&r.id===packet.id&&r.inputHash===packet.inputHash&&r.scopeId===packet.scopeId&&r.playbook==='local-execution-v1'&&r.kind==='execution'&&r.proposalOnly===true&&r.executionPolicy==='local-only-required-v2'&&r.provider==='Ollama local'&&r.model===model&&r.modelDigest===digest,'The result must match this exact local-only model and input snapshot.');check(true,'The hosted result belongs to this input and the required local-only worker');
    const proposal=validateExecutionOutput({claims:r.claims.map(x=>({sourceId:x.sourceId,quote:x.quote})),questions:r.questions},packet);
    ok(proposal.claims.length>0&&proposal.questions.length>0,'The model returned no useful cited proposal or follow-up question. It remains unaccepted.');check(true,'Every proposed claim quotes the permitted source and follow-up questions remain proposals');
    ok(r.metrics?.apiCostUSD===0&&Number.isInteger(r.metrics.calls)&&r.metrics.calls>=1&&r.metrics.calls<=2&&chatRequests===r.metrics.calls,'The job must observe one or two local model requests with zero model API charges.');check(true,'The Mac made a real local model request and recorded zero model API charges');
    await assertLocalOnly(signal,request);check(await localModel(model,signal,request)===digest,'Ollama still confirms cloud features disabled and the same local model digest');
    const persisted=(await backend.jobs([packet.id]))[0];check(persisted.status==='succeeded'&&sha(persisted.result)===sha(r),'The proposal persists in Supabase and can be read again');
    check((await cloudExecutionStore(c).packets(context.transaction)).some(p=>p.id===packet.id),'The normal deal workspace can discover this returned proposal');
    const current=await verifyContext(c,context,user);check(snapshot(current)===baseline,'The transaction, financial record, handover permissions and source versions stay unchanged');
    manifest.metrics=r.metrics;manifest.proposal={status:'Pending human review',claims:proposal.claims.map(x=>({sourceId:x.sourceId,fileId:x.source.fileId,page:x.source.page,quote:x.quote})),questions:proposal.questions};await persist();
    check((await rpc(c,'kalling_brokerage_status')).intakeOpen===false,'Public registration remains paused');
    result={actualAuthenticatedTransport:makeClient===makeHostedClient,actualLocalInference:request===localRequest&&process.platform==='darwin',workerVersion,model,modelDigest:digest,observedLocalChatRequests:chatRequests,reviewStatus:'Pending human review',notCovered:['Launchd installation and login restart','Browser click-to-review interaction','Real-world research accuracy','Complete hosted mobile sale rehearsal','Attorney review, licensing, fees, SMTP or public launch']};
  }finally{
    const cleanup=async(name,action)=>{try{await action();manifest[name]=true;}catch{manifest[name]=false;cleanupErrors.push(name);}try{await persist();}catch{cleanupErrors.push('reportWriteFailed');}};
    if(verified&&manifest.assignment)await cleanup('jobSettled',()=>settlePilotJob(c,context,manifest));
    if(worker)await cleanup('workerStopped',async()=>{await worker.stop();ok(!worker.state.active,'The worker has not stopped its active request yet.');});
    if(verified&&manifest.pairingRequested)await cleanup('workerRevoked',()=>revokePilotWorker(c,context,manifest,owner));
    if(verified&&workerClient&&workerToken&&manifest.workerRevoked)await cleanup('oldWorkerTokenRefused',async()=>{try{await workerClient.heartbeat(workerToken,'ready','Fictional revoked-token check',model);throw Error('Revoked worker token still accepted.');}catch(e){ok(e instanceof WorkerError&&e.denied===true,'Revoked token was not refused by current authorization.');}});
    await cleanup('signedOut',async()=>{const signed=await c.auth.signOut({scope:'global'});ok(!signed.error,'Fictional owner sign-out failed.');});
    delete account.password;
  }
  ok(cleanupErrors.length===0,'The proposal returned but cleanup needs review: '+cleanupErrors.join(', '));
  check(manifest.workerStopped&&manifest.workerRevoked&&manifest.oldWorkerTokenRefused,'The test worker stops and its original credential loses access immediately');
  check(manifest.signedOut,'The fictional owner session is signed out');return result;
}

export async function cleanupWorkerRun(config,account,foundation,handover,report,{makeClient=makeHostedClient}={}){
  validateTarget(config);const context=validateWorkerContext(foundation,handover),m=report?.fixtureManifest;
  ok(report?.project===config.url&&report.mode==='mac-worker'&&uuid(m?.runId)&&m.firm===context.firm&&m.transaction===context.transaction&&m.assignment==='mac-worker-'+m.runId,'Use the saved report for this exact fictional pilot.');
  const c=makeClient(config);try{const user=await ownerLogin(c,account);await verifyOwner(c,context,user);
    await settlePilotJob(c,context,m);m.jobSettled=true;await revokePilotWorker(c,context,m,user);m.workerRevoked=true;
  }finally{const r=await c.auth.signOut({scope:'global'});m.signedOut=!r.error;delete account.password;}return report;
}

// Shared by the persistent service acceptance and the read-only proposal review command.
export {makeHostedClient,ownerLogin,verifyOwner,verifyContext,snapshot,rpc,row};

async function main(){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;},mode=process.argv[2],output=arg('--output');let canWrite=false,report={project:deployedCloudProject.url,at:new Date().toISOString(),mode:'mac-worker',status:'pending',checks:[],fixtureManifest:{}};
  const save=async()=>{if(output&&canWrite){const p=resolve(output),tmp=p+'.tmp-'+process.pid+'-'+randomUUID();await writeFile(tmp,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(tmp,p);}};
  const check=(pass,name)=>{report.checks.push({name,status:pass?'passed':'failed'});ok(pass,name);console.log('PASS: '+name);};
  try{
    if(mode==='doctor'){ok(process.platform==='darwin','Run this pilot on your Mac.');const digest=await localModel(model);console.log('Ready: local-only qwen3:4b, digest '+digest+'. No inference request was made.');return;}
    ok(['run','cleanup'].includes(mode)&&process.argv.includes('--confirm-fictional')&&process.argv.includes('--prompt')&&arg('--foundation-report')&&arg('--handover-report')&&output,'Use run (or cleanup) --confirm-fictional --prompt --foundation-report PATH --handover-report PATH --output PATH.');
    const foundation=await loadFoundationReport(arg('--foundation-report')),handover=await json(arg('--handover-report'),'the completed handover report');validateWorkerContext(foundation,handover);
    if(mode==='run'){ok(process.platform==='darwin','Run the real inference check on your Mac.');await localModel(model);}
    if(mode==='cleanup'){report=await json(output,'the interrupted Mac worker report');ok(report.project===deployedCloudProject.url&&report.mode==='mac-worker'&&uuid(report.fixtureManifest?.runId),'Use the existing Mac worker acceptance report.');canWrite=true;}
    else{await reserveWorkerReport(output,report);canWrite=true;}
    const account={email:fictionalEmails.owner_a,password:await readHiddenPassword('Password for '+fictionalEmails.owner_a+': ')};const controller=new AbortController(),interrupt=()=>controller.abort();process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
    try{if(mode==='cleanup'){report=await cleanupWorkerRun(deployedCloudProject,account,foundation,handover,report);report.cleanupCompleted=true;console.log('Temporary pilot worker access removed. No inference request was made.');}
      else{report.transport=await runMacWorker(deployedCloudProject,account,foundation,handover,check,report.fixtureManifest,{signal:controller.signal,persist:save,progress:message=>console.log('Progress: '+message)});report.status='passed';console.log('\nProposed excerpts for review:');for(const c of report.fixtureManifest.proposal.claims)console.log('Page '+c.page+': '+JSON.stringify(c.quote));for(const q of report.fixtureManifest.proposal.questions)console.log('Question: '+JSON.stringify(q));}}
    finally{delete account.password;process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
  }catch(e){report.status='failed';report.error=String(e.message||e);process.exitCode=1;console.error('BLOCKED: '+report.error);}
  await save();if(mode==='run')console.log(report.status==='passed'?'Finished '+report.checks.length+' Mac worker checks. The local-model proposal is waiting for human review.':'Mac worker acceptance is incomplete. Preserve the report; cleanup status is recorded.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
