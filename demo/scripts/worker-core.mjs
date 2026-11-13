import {runLocalExecution} from './local-execution.mjs';
// Kalling research computer: claims connected assignments, runs them with local Qwen,
// reports progress, retries safely and serves the local demo on 127.0.0.1 only.
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,rename,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {runLocalResearch,runLocalOutreach,localModel,localRequest,localRunnerVersion,localSafetyPolicy} from './local-agent-runner.mjs';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {runLocalDraft} from './local-drafting.mjs';
import {localModels} from '../lib/agentProtocol.ts';

export const workerVersion='kalling-worker-3';
export const localApiPort=47311;
export const allowedOrigins=Object.freeze(['https://chulkara.github.io','http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173']);
const playbooks={'local-research-v1':'research','local-outreach-v1':'outreach','local-recast-v1':'recast','local-teaser-v1':'teaser','local-cim-v1':'cim','local-comps-v1':'comps','local-execution-v1':'execution'};
const maxPacketBytes=(kind)=>kind==='recast'||kind==='cim'?600000:120000;

export class WorkerError extends Error{constructor(message,{status=0,denied=false}={}){super(message);this.status=status;this.denied=denied;}}

/** Token-gated PostgREST calls using the public project key. No service-role key exists here. */
export function cloudClient({url,publishableKey,fetchImpl=fetch,timeoutMs=20000}){
  if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url||''))throw new WorkerError('Only a Supabase project URL is accepted.');
  if(!/^(sb_publishable_|eyJ)/.test(publishableKey||'')||/^sb_secret_/.test(publishableKey))throw new WorkerError('Use the public project key, never a secret key.');
  async function call(fn,args){
    let r;try{r=await fetchImpl(`${url}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});}
    catch(e){throw new WorkerError('Kalling cloud is unreachable: '+String(e.message||e).slice(0,160));}
    const text=await r.text();let body=null;try{body=text?JSON.parse(text):null;}catch{body=text;}
    if(!r.ok){const message=String(body?.message||body||'Request failed').slice(0,300);throw new WorkerError(message,{status:r.status,denied:/access denied|invalid or expired/i.test(message)});}
    return body;
  }
  return {
    pair:(code)=>call('kalling_worker_pair',{p_code:code,p_version:workerVersion}),
    heartbeat:(token,state,detail,model)=>call('kalling_worker_heartbeat',{p_token:token,p_state:state,p_detail:detail||null,p_version:workerVersion,p_model:model||null}),
    claim:(token)=>call('kalling_worker_claim',{p_token:token}),
    progress:(token,job,lease,progress)=>call('kalling_worker_progress',{p_token:token,p_job:job,p_lease:lease,p_progress:progress}),
    finish:(token,job,lease,result,error,retryable)=>call('kalling_worker_finish',{p_token:token,p_job:job,p_lease:lease,p_result:result==null?null:JSON.stringify(result),p_error:error??null,p_retryable:retryable??true}),
  };
}

async function atomic(path,value){const tmp=path+'.tmp-'+process.pid+'-'+Math.random().toString(36).slice(2);await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await rename(tmp,path);}
async function readJson(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}

/** Model failures pause claiming; packet/checkpoint problems should not be retried automatically. */
export function classifyError(e){
  const m=String(e?.message||e);
  if(/Ollama|cloud features|Install the local model|local model first|Cannot verify|timed out|ECONNREFUSED|fetch failed|cloud-backed/i.test(m)&&!/changed/i.test(m))return {retryable:true,model:true};
  if(/export a new assignment|was cancelled|snapshot was changed|assignment changed|Unsupported|exceeds|smaller than|older or unknown/i.test(m))return {retryable:false,model:false};
  return {retryable:true,model:false};
}

/** Human-readable progress derived from the runner's step keys. */
export function describeProgress(kind,packet,event,counter){
  const n=kind==='research'?packet.sources?.length||0:1,total=kind==='research'?n+(n>1?1:0):1;
  if(event.status==='Checkpoint saved')counter.done=Math.min(total,counter.done+1);
  if(event.status==='Ready for human review')return {stage:'finishing',label:'Checking the result before it returns',done:total,total,calls:counter.calls};
  if(event.calls)counter.calls=event.calls;
  if(event.label){counter.label=event.label;return {stage:'running',label:event.label,done:counter.done,calls:counter.calls};}
  let label=counter.label||(kind==='research'?'Starting research':'Starting the draft');
  const key=String(event.step||'');
  if(key.startsWith('source:')){const id=key.split(':')[1],i=Math.max(0,(packet.sources||[]).findIndex(s=>s.id===id));label=`Reading source ${i+1} of ${n}`;}
  else if(key==='compare')label='Comparing statements across sources';
  else if(key.startsWith('compose:'))label='Writing the introduction';
  counter.label=label;
  return {stage:'running',label,done:counter.done,total,calls:counter.calls,maxCalls:kind==='research'?14:2};
}

export function createWorker({stateDir,configPath=join(stateDir,'worker.json'),model='qwen3:4b',request=localRequest,cloudFactory=cloudClient,runners={research:runLocalResearch,outreach:runLocalOutreach,recast:runLocalDraft,teaser:runLocalDraft,cim:runLocalDraft,comps:runLocalDraft,execution:runLocalExecution},log=()=>{},timing={}}={}){
  if(localSafetyPolicy!=='local-only-required-v2'||localRunnerVersion!=='local-playbooks-v2')throw Error('Worker safety versions do not match. Update the repository before starting.');
  const t={idle:5000,heartbeat:20000,renew:45000,modelOk:60000,modelRetry:15000,...timing};
  const localDir=join(stateDir,'local-jobs');
  const state={config:{},configMtime:0,model:{ready:false,detail:'Checking local Qwen…',checkedAt:0,digest:''},cloud:{status:'not-connected',detail:'',lastContact:0,waiting:0},active:null,local:new Map(),started:Date.now(),beat:0,stopped:false};
  let timer=null,loop=Promise.resolve(),cloud=null;
  /** A larger local model can be set per kind in worker.json, for example {"models":{"cim":"qwen3:14b"}}. */
  const modelFor=(kind)=>{const m=state.config?.models?.[kind];return typeof m==='string'&&localModels.includes(m)?m:model;};

  async function loadConfig(force=false){
    let s;try{s=await stat(configPath);}catch(e){if(e.code!=='ENOENT')throw e;state.config={};cloud=null;return;}
    if(!force&&s.mtimeMs===state.configMtime)return;
    const before=state.config.cloud?.token;state.configMtime=s.mtimeMs;state.config=await readJson(configPath)||{};
    const c=state.config.cloud;cloud=c?.token?cloudFactory({url:c.url,publishableKey:c.publishableKey}):null;
    if(!cloud)state.cloud={status:'not-connected',detail:'',lastContact:0,waiting:0};
    else if(c.token!==before){state.cloud={status:'connecting',detail:'',lastContact:0,waiting:0};state.beat=0;}
  }
  async function saveConfig(next){await mkdir(stateDir,{recursive:true,mode:0o700});await atomic(configPath,next);await loadConfig(true);}
  async function loadLocal(){
    await mkdir(localDir,{recursive:true,mode:0o700});
    for(const f of await readdir(localDir)){if(!f.endsWith('.json'))continue;const j=await readJson(join(localDir,f)).catch(()=>null);if(!j?.id)continue;
      if(j.status==='running'){j.status='queued';j.progress={stage:'waiting',label:'Resuming after the research computer restarted',at:new Date().toISOString()};await atomic(join(localDir,f),j);}
      state.local.set(j.id,j);}
  }
  // Writes are serialized so a late progress update can never overwrite a cancellation.
  let writes=Promise.resolve();
  function saveLocal(j){j.updatedAt=new Date().toISOString();state.local.set(j.id,j);const snapshot=JSON.parse(JSON.stringify(j));writes=writes.catch(()=>{}).then(()=>atomic(join(localDir,encodeURIComponent(j.id)+'.json'),snapshot));return writes;}

  async function checkModel(){
    try{const digest=await localModel(model,AbortSignal.timeout(15000),request);if(!state.model.ready)log('Local Qwen ready ('+model+').');state.model={ready:true,detail:'Local '+model+' ready · cloud features disabled',checkedAt:Date.now(),digest};}
    catch(e){if(state.model.ready||state.model.detail!==e.message)log('Local Qwen unavailable: '+e.message);state.model={ready:false,detail:String(e.message||e).slice(0,280),checkedAt:Date.now(),digest:''};}
  }
  function workerState(){return state.active?'busy':state.model.ready?'ready':'model-unavailable';}
  function cloudFailure(e){
    if(e.denied){state.cloud={status:'revoked',detail:'This computer was disconnected from Kalling. Connect it again from Settings.',lastContact:state.cloud.lastContact,waiting:0};log('Cloud access revoked: '+e.message);}
    else{if(state.cloud.status!=='offline')log('Cloud unreachable: '+e.message);state.cloud={...state.cloud,status:'offline',detail:e.message};}
  }
  async function heartbeat(){
    if(!cloud||state.cloud.status==='revoked')return;
    try{const r=await cloud.heartbeat(state.config.cloud.token,workerState(),state.active?state.active.progress?.label:state.model.detail,model);state.cloud={status:'online',detail:'',lastContact:Date.now(),waiting:Number(r?.waiting)||0,firmName:r?.firm_name,name:r?.name};state.beat=Date.now();}
    catch(e){cloudFailure(e);}
  }

  async function run(source,job){
    const kind=job.kind,packet=job.packet,ac=new AbortController(),counter={done:0,calls:0,label:''};
    const active=state.active={source,id:job.id,kind,company:packet.company?.name||'',startedAt:Date.now(),progress:{stage:'starting',label:kind==='research'?'Starting research':'Starting the draft'},outcome:'',abort:()=>ac.abort()};
    log(`Started ${kind} for ${active.company} (${source}).`);
    let chain=Promise.resolve();
    const report=(progress)=>{active.progress={...progress,at:new Date().toISOString()};
      if(source==='local'){const j=state.local.get(job.id);if(j){j.progress=active.progress;chain=chain.then(()=>saveLocal(j)).catch(()=>{});}return chain;}
      chain=chain.then(async()=>{try{const s=await cloud.progress(state.config.cloud.token,job.id,job.lease_token,active.progress);if(s==='cancelled'||s==='lost'){active.outcome=s;ac.abort();}}catch(e){if(e.denied){active.outcome='lost';ac.abort();}cloudFailure(e);}});return chain;};
    const renew=setInterval(()=>void report(active.progress),t.renew);
    if(source==='local'){const j=state.local.get(job.id);j.status='running';j.attempts=(j.attempts||0)+1;await saveLocal(j);}
    void report(active.progress);
    try{
      const out=await runners[kind](packet,{model:modelFor(kind),stateDir,signal:ac.signal,request,onProgress:e=>void report(describeProgress(kind,packet,e,counter))});
      await chain;
      if(source==='cloud'){
        for(let n=0;;n++){try{const s=await cloud.finish(state.config.cloud.token,job.id,job.lease_token,out.result,null,true);log(`Finished ${kind} for ${active.company}: ${s==='ok'?'returned for review':s}.`);break;}
          catch(e){cloudFailure(e);if(e.denied||n>=4)break;await new Promise(r=>setTimeout(r,2000*2**n));}}
      }else{const j=state.local.get(job.id);if(j.status!=='cancelled'){j.status='succeeded';j.result=out.result;j.error='';j.progress={stage:'ready-for-review',label:'Ready for review',at:new Date().toISOString()};await saveLocal(j);}log(`Finished local ${kind} for ${active.company}.`);}
    }catch(e){
      await chain;const c=classifyError(e),message=String(e.message||e).slice(0,480);
      if(c.model){state.model={ready:false,detail:message,checkedAt:Date.now(),digest:''};}
      if(source==='cloud'){
        if(state.stopped&&!active.outcome)log(`Paused ${kind} for ${active.company}; it resumes from its checkpoint when the computer restarts.`);
        else if(active.outcome)log(`Stopped ${kind} for ${active.company}: ${active.outcome==='cancelled'?'cancelled in Kalling':'assignment moved to another computer'}.`);
        else{log(`Attempt failed for ${active.company}: ${message}`);try{await cloud.finish(state.config.cloud.token,job.id,job.lease_token,null,message,c.retryable);}catch(err){cloudFailure(err);}}
      }else{const j=state.local.get(job.id);
        if(j.status==='cancelled'){}
        else if(state.stopped){j.status='queued';j.progress={stage:'waiting',label:'Paused while the research computer restarts'};}
        else if(c.retryable&&(j.attempts||0)<4){j.status='queued';j.availableAt=Date.now()+30000*2**((j.attempts||1)-1);j.error=message;j.progress={stage:'waiting',label:c.model?'Waiting for local Qwen to be ready':'Retrying shortly after an interruption',reason:message};}
        else{j.status='failed';j.error=message;j.progress={stage:'failed',label:'Could not finish',reason:message};}
        await saveLocal(j);log(`Local ${kind} for ${active.company}: ${j.status} (${message}).`);}
    }finally{clearInterval(renew);state.active=null;void heartbeat();}
  }

  async function tick(){
    if(state.stopped)return;
    await loadConfig().catch(e=>log('Configuration unreadable: '+e.message));
    const due=state.model.ready?t.modelOk:t.modelRetry;
    if(!state.active&&Date.now()-state.model.checkedAt>=due)await checkModel();
    if(cloud&&(Date.now()-state.beat>=t.heartbeat||state.cloud.status!=='online'))await heartbeat();
    if(state.active||!state.model.ready||state.stopped)return;
    const local=[...state.local.values()].filter(j=>j.status==='queued'&&(j.availableAt||0)<=Date.now()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
    if(local){void run('local',local);return;}
    if(cloud&&state.cloud.status==='online'){
      try{const job=await cloud.claim(state.config.cloud.token);if(job?.id){try{if(typeof job.packet==='string')job.packet=JSON.parse(job.packet);}catch{job.packet=null;}if(!playbooks[job.packet?.playbook]||playbooks[job.packet.playbook]!==job.kind){await cloud.finish(state.config.cloud.token,job.id,job.lease_token,null,'This computer does not support that assignment type. Update the worker.',false);return;}void run('cloud',job);}}
      catch(e){cloudFailure(e);}
    }
  }
  function schedule(){if(state.stopped)return;timer=setTimeout(()=>{loop=loop.then(tick).catch(e=>log('Worker loop error: '+e.message)).finally(schedule);},state.active?Math.max(t.idle,1000):t.idle);}

  const api={
    state,
    async start(){await mkdir(stateDir,{recursive:true,mode:0o700});await loadConfig(true);await loadLocal();log(`Kalling research computer started (${workerVersion}).`);loop=loop.then(tick).catch(e=>log('Worker loop error: '+e.message)).finally(schedule);return api;},
    async stop(){state.stopped=true;clearTimeout(timer);state.active?.abort();await loop;for(let i=0;i<100&&state.active;i++)await new Promise(r=>setTimeout(r,50));},
    tick:()=>loop=loop.then(tick),
    async idle(){await loop;while(state.active)await new Promise(r=>setTimeout(r,10));},
    status(){
      const queued=[...state.local.values()].filter(j=>j.status==='queued').length;
      return {app:'kalling-worker',version:workerVersion,startedAt:new Date(state.started).toISOString(),
        model:{ready:state.model.ready,name:model,detail:state.model.detail,models:Object.fromEntries(['recast','teaser','cim','comps','execution'].map(k=>[k,modelFor(k)]))},kinds:Object.values(playbooks),
        cloud:{status:state.cloud.status,firmName:state.config.cloud?.firmName||state.cloud.firmName||'',name:state.config.cloud?.name||'',waiting:state.cloud.waiting,detail:state.cloud.detail,lastContact:state.cloud.lastContact?new Date(state.cloud.lastContact).toISOString():null},
        active:state.active?{source:state.active.source,kind:state.active.kind,company:state.active.company,progress:state.active.progress,startedAt:new Date(state.active.startedAt).toISOString()}:null,
        local:{queued}};
    },
    async pair(code,project=deployedCloudProject){
      if(!/^[0-9A-Fa-f]{6}(-[0-9A-Fa-f]{6}){3}$/.test(String(code||'').trim()))throw new WorkerError('Enter the full connection code shown in Kalling.');
      const client=cloudFactory(project),r=await client.pair(String(code).trim().toUpperCase());
      if(!r?.token||!r?.worker_id)throw new WorkerError('Kalling did not return a computer credential.');
      await saveConfig({...state.config,cloud:{url:project.url,publishableKey:project.publishableKey,token:r.token,workerId:r.worker_id,firmId:r.firm_id,firmName:r.firm_name,name:r.name,pairedAt:new Date().toISOString()}});
      state.beat=0;log(`Connected to ${r.firm_name} as ${r.name}.`);void api.tick();return api.status();
    },
    async unpair(){const {cloud:_,...rest}=state.config;await saveConfig(rest);state.cloud={status:'not-connected',detail:'',lastContact:0,waiting:0};return api.status();},
    async submitLocal(packet){
      const kind=playbooks[packet?.playbook];
      if(!packet||typeof packet!=='object'||JSON.stringify(packet).length>maxPacketBytes(kind))throw new WorkerError(`Assignment must be a JSON object under ${maxPacketBytes(kind)/1000} KB.`,{status:400});if(!kind||typeof packet.id!=='string'||!/^[\w-]{8,120}$/.test(packet.id))throw new WorkerError('Unsupported assignment.',{status:400});
      const existing=state.local.get(packet.id);
      if(existing&&!['failed','cancelled'].includes(existing.status))return publicJob(existing);
      if([...state.local.values()].filter(j=>['queued','running'].includes(j.status)).length>=10)throw new WorkerError('Ten assignments are already waiting on this computer.',{status:429});
      if(state.local.size>=50){const old=[...state.local.values()].filter(j=>['succeeded','failed','cancelled'].includes(j.status)).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt))[0];if(old)state.local.delete(old.id);}
      const j={id:packet.id,kind,packet,status:'queued',attempts:0,progress:{stage:'queued',label:'Waiting to start'},result:null,error:'',createdAt:new Date().toISOString()};
      await saveLocal(j);void api.tick();return publicJob(j);
    },
    localJob(id){const j=state.local.get(id);return j?publicJob(j,true):null;},
    async cancelLocal(id){const j=state.local.get(id);if(!j)return null;if(['queued','running'].includes(j.status)){j.status='cancelled';j.progress={stage:'cancelled',label:'Cancelled'};await saveLocal(j);if(state.active?.id===id&&state.active.source==='local')state.active.abort();}return publicJob(j);},
  };
  function publicJob(j,withResult=false){return {id:j.id,kind:j.kind,status:j.status,progress:j.progress,error:j.error||'',attempts:j.attempts||0,createdAt:j.createdAt,updatedAt:j.updatedAt,...(withResult&&j.status==='succeeded'?{result:j.result}:{})};}
  return api;
}

/** Loopback HTTP API for the local browser demo. Bound to 127.0.0.1 and limited to Kalling origins. */
export function createLocalApi(worker,{port=localApiPort,origins=allowedOrigins}={}){
  const server=createServer(async(req,res)=>{
    const origin=req.headers.origin,host=String(req.headers.host||'');
    const send=(status,body)=>{const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      if(origin&&origins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Private-Network':'true','Access-Control-Max-Age':'600'});
      res.writeHead(status,headers);res.end(status===204?undefined:JSON.stringify(body));};
    // Reject DNS-rebinding hosts and websites other than Kalling. Browsers cannot forge Origin.
    const port_=server.address()?.port;
    if(host!==`127.0.0.1:${port_}`&&host!==`localhost:${port_}`)return send(403,{error:'Unexpected host.'});
    if(origin&&!origins.includes(origin))return send(403,{error:'This website may not use the Kalling research computer.'});
    const path=new URL(req.url||'/','http://127.0.0.1').pathname;
    if(req.method==='OPTIONS')return send(204);
    if(!origin&&!(req.method==='GET'&&path==='/v1/status'))return send(403,{error:'Open Kalling to use this computer.'});
    try{
      let body=null;
      if(req.method==='POST'){
        if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'Use JSON.'});
        const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>650000)return send(413,{error:'Assignment too large.'});chunks.push(c);}
        body=size?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
      }
      const m=path.match(/^\/v1\/jobs\/([\w-]{8,120})(\/cancel)?$/);
      if(req.method==='GET'&&path==='/v1/status')return send(200,worker.status());
      if(req.method==='POST'&&path==='/v1/jobs')return send(202,await worker.submitLocal(body?.packet));
      // Unknown assignments answer 200 with status missing so browsers do not log polling as errors.
      if(req.method==='GET'&&m&&!m[2]){const j=worker.localJob(m[1]);return send(200,j||{id:m[1],status:'missing',progress:{},error:'',attempts:0});}
      if(req.method==='POST'&&m&&m[2]){const j=await worker.cancelLocal(m[1]);return j?send(200,j):send(404,{error:'Assignment not found on this computer.'});}
      if(req.method==='POST'&&path==='/v1/pair')return send(200,await worker.pair(body?.code));
      return send(404,{error:'Not found.'});
    }catch(e){return send(e.status&&e.status<500?e.status:e instanceof SyntaxError?400:e instanceof WorkerError?400:500,{error:String(e.message||'Request failed').slice(0,300)});}
  });
  return {server,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address().port);});}),close:()=>new Promise(r=>server.close(()=>r()))};
}
