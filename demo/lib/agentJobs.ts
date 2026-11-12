// Connected research computer: one interface for the cloud queue (signed-in firms) and the
// loopback worker (local browser demo). The browser never talks to Ollama directly.
import type {SupabaseClient} from '@supabase/supabase-js';

export type AgentKind='research'|'outreach';
export type JobStatus='queued'|'running'|'retry'|'succeeded'|'failed'|'cancelled'|'missing';
export type JobProgress={stage?:string;label?:string;done?:number;total?:number;calls?:number;maxCalls?:number;at?:string;reason?:string;worker?:string};
export type JobView={id:string;assignmentId:string;kind:AgentKind;status:JobStatus;progress:JobProgress;attempts:number;maxAttempts:number;error:string;createdAt:string;updatedAt:string;result?:unknown};
export type ComputerState='online'|'busy'|'model-unavailable'|'offline'|'not-connected'|'unreachable'|'checking';
export type ComputerView={state:ComputerState;name:string;detail:string;lastSeen?:string;count:number};
export type Computer={id:string;name:string;state:string;detail:string|null;last_seen_at:string|null;created_at:string;version:string|null;model:string|null};
export interface AgentBackend{
  mode:'cloud'|'local';
  computer():Promise<ComputerView>;
  submit(kind:AgentKind,packet:{id:string}):Promise<JobView>;
  jobs(assignmentIds:string[]):Promise<JobView[]>;
  cancel(job:JobView):Promise<void>;
  retry(job:JobView,packet:{id:string}):Promise<void>;
}
export const onlineWindowMs=75000;
export const localWorkerUrl='http://127.0.0.1:47311';
export const activeStatuses:JobStatus[]=['queued','running','retry'];

/** Summarize paired computers: online means a heartbeat within the last 75 seconds. */
export function summarizeComputers(list:Computer[],now=Date.now()):ComputerView{
  if(!list.length)return {state:'not-connected',name:'',detail:'No research computer is connected to this firm.',count:0};
  const live=list.filter(c=>c.last_seen_at&&now-new Date(c.last_seen_at).getTime()<onlineWindowMs);
  const pick=live.find(c=>c.state==='ready')||live.find(c=>c.state==='busy')||live[0];
  if(!pick){const last=list.map(c=>c.last_seen_at).filter(Boolean).sort().at(-1)||undefined;return {state:'offline',name:list[0].name,detail:'Your research computer is offline or asleep. Work waits and starts automatically when it reconnects.',lastSeen:last,count:list.length};}
  const state:ComputerState=pick.state==='busy'?'busy':pick.state==='model-unavailable'?'model-unavailable':pick.state==='ready'?'online':'online';
  return {state,name:pick.name,detail:state==='model-unavailable'?'Online, but local Qwen is not ready on this computer. Work waits until it is.':state==='busy'?'Working on an assignment now.':'Ready.',lastSeen:pick.last_seen_at||undefined,count:list.length};
}

type Row={id:string;assignment_id:string;kind:AgentKind;status:JobStatus;progress:JobProgress|null;attempts:number;max_attempts:number;last_error:string|null;created_at:string;updated_at:string;result:string|null};
export function jobFromRow(r:Row):JobView{
  let result:unknown;if(r.result){try{result=JSON.parse(r.result);}catch{result=undefined;}}
  return {id:r.id,assignmentId:r.assignment_id,kind:r.kind,status:r.status,progress:r.progress||{},attempts:r.attempts,maxAttempts:r.max_attempts,error:r.last_error||'',createdAt:r.created_at,updatedAt:r.updated_at,result};
}
async function call<T>(c:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await c.rpc(name,args);if(error)throw Error(error.message);return data as T;}

export function cloudAgentBackend(client:SupabaseClient,firmId:string){
  const columns='id,assignment_id,kind,status,progress,attempts,max_attempts,last_error,created_at,updated_at,result';
  const backend={
    mode:'cloud' as const,
    async listComputers():Promise<Computer[]>{const {data,error}=await client.from('kalling_agent_workers').select('id,name,state,detail,last_seen_at,created_at,version,model').eq('firm_id',firmId).is('revoked_at',null).order('created_at');if(error)throw Error(error.message);return (data||[]) as Computer[];},
    async computer():Promise<ComputerView>{try{return summarizeComputers(await backend.listComputers());}catch(e){const m=e instanceof Error?e.message:'';if(/kalling_agent_workers|does not exist|schema cache/i.test(m))return {state:'not-connected',name:'',detail:'Connected research is not set up for this cloud project yet. An administrator must apply database migration 003.',count:0};throw e;}},
    async submit(kind:AgentKind,packet:{id:string}){const id=await call<string>(client,'kalling_agent_enqueue',{p_firm:firmId,p_kind:kind,p_packet:JSON.stringify(packet)});const [j]=await backend.jobs([packet.id]);if(!j||j.id!==id)throw Error('The assignment was queued but could not be read back. Refresh to see its status.');return j;},
    async jobs(ids:string[]){if(!ids.length)return [];const {data,error}=await client.from('kalling_agent_jobs').select(columns).eq('firm_id',firmId).in('assignment_id',ids.slice(0,50));if(error)throw Error(error.message);return (data as Row[]).map(jobFromRow);},
    async cancel(job:JobView){await call(client,'kalling_agent_cancel',{p_job:job.id});},
    async retry(job:JobView){await call(client,'kalling_agent_retry',{p_job:job.id});},
    async createPairing(name:string){return call<string>(client,'kalling_agent_create_pairing',{p_firm:firmId,p_name:name});},
    async revoke(id:string){await call(client,'kalling_agent_revoke_worker',{p_firm:firmId,p_worker:id});},
  };
  return backend;
}

type LocalStatus={app:string;version:string;model:{ready:boolean;name:string;detail:string};cloud:{status:string;firmName:string;name:string};active:null|{kind:string;company:string;progress:JobProgress};local:{queued:number}};
export function localAgentBackend(base=localWorkerUrl,fetchImpl:typeof fetch=(...a)=>fetch(...a)){
  async function request<T>(path:string,init?:RequestInit,timeout=4000):Promise<T>{
    let r:Response;
    try{r=await fetchImpl(base+path,{...init,headers:init?.body?{'Content-Type':'application/json'}:undefined,signal:AbortSignal.timeout(timeout)});}
    catch{throw Error('This browser cannot reach the Kalling research computer on this Mac. Make sure it is running, and allow local network access if your browser asks.');}
    const body=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(body.error||'The research computer rejected the request.'),{status:r.status});return body as T;
  }
  const toJob=(j:{id:string;kind:AgentKind;status:JobStatus;progress:JobProgress;error:string;attempts:number;createdAt:string;updatedAt?:string;result?:unknown}):JobView=>({id:j.id,assignmentId:j.id,kind:j.kind,status:j.status,progress:j.progress||{},attempts:j.attempts||0,maxAttempts:4,error:j.error||'',createdAt:j.createdAt,updatedAt:j.updatedAt||j.createdAt,result:j.result});
  const backend={
    mode:'local' as const,
    async status(){return request<LocalStatus>('/v1/status',undefined,2500);},
    async computer():Promise<ComputerView>{
      try{const s=await backend.status();if(s.app!=='kalling-worker')throw Error();const name='This Mac';
        if(!s.model.ready)return {state:'model-unavailable',name,detail:'The research computer is running, but local Qwen is not ready: '+s.model.detail,count:1};
        return {state:s.active?'busy':'online',name,detail:s.active?'Working on '+s.active.company+'.':'Ready · '+s.model.name+' on this Mac',count:1};}
      catch{return {state:'unreachable',name:'',detail:'The Kalling research computer is not reachable from this browser.',count:0};}
    },
    async submit(_kind:AgentKind,packet:{id:string}){return toJob(await request('/v1/jobs',{method:'POST',body:JSON.stringify({packet})},10000));},
    async jobs(ids:string[]){const out:JobView[]=[];for(const id of ids.slice(0,20)){try{out.push(toJob(await request('/v1/jobs/'+encodeURIComponent(id))));}catch(e){if((e as {status?:number}).status===404)out.push({id,assignmentId:id,kind:'research',status:'missing',progress:{},attempts:0,maxAttempts:4,error:'',createdAt:'',updatedAt:''});else throw e;}}return out;},
    async cancel(job:JobView){await request('/v1/jobs/'+encodeURIComponent(job.id)+'/cancel',{method:'POST',body:'{}'});},
    async retry(_job:JobView,packet:{id:string}){await request('/v1/jobs',{method:'POST',body:JSON.stringify({packet})},10000);},
    async pair(code:string){return request<LocalStatus>('/v1/pair',{method:'POST',body:JSON.stringify({code})},25000);},
  };
  return backend;
}

/** What a person needs to know right now, in plain language. */
export function describeJob(job:JobView|undefined,computer:ComputerView,kind:AgentKind):{tone:'neutral'|'progress'|'waiting'|'done'|'problem';title:string;detail:string}{
  const thing=kind==='research'?'research':'introduction';
  if(!job)return {tone:'neutral',title:'Not started',detail:''};
  const away=['offline','not-connected','unreachable'].includes(computer.state),noModel=computer.state==='model-unavailable';
  switch(job.status){
    case 'queued':return away||noModel?{tone:'waiting',title:'Waiting for the research computer',detail:(noModel?'The computer is online but local Qwen is not ready. ':computer.state==='not-connected'?'No research computer is connected yet. ':'The research computer is offline. ')+'This starts automatically once it is available. You can close this page.'}:{tone:'progress',title:'Starting',detail:'The research computer will pick this up in a few seconds.'};
    case 'running':{const p=job.progress,stale=away;return {tone:stale?'waiting':'progress',title:stale?'Paused — the research computer went offline':p.label||'Working',detail:stale?'It resumes from its last saved step when the computer reconnects.':[p.total?`Step ${Math.min((p.done||0)+1,p.total)} of ${p.total}`:'',job.attempts>1?`attempt ${job.attempts} of ${job.maxAttempts}`:''].filter(Boolean).join(' · ')};}
    case 'retry':return {tone:'waiting',title:'Interrupted — retrying automatically',detail:(job.progress.reason||job.error||'The last attempt did not finish.')+' Saved steps are kept.'};
    case 'succeeded':return {tone:'done',title:kind==='research'?'Research returned for your review':'Draft returned for your review',detail:'Nothing has been accepted or sent. Check it below.'};
    case 'failed':return {tone:'problem',title:`The ${thing} could not finish`,detail:job.error||'The research computer stopped after several attempts.'};
    case 'cancelled':return {tone:'neutral',title:'Cancelled',detail:'No result will be imported.'};
    case 'missing':return {tone:'problem',title:'This computer no longer has the assignment',detail:'Send it again to restart from any saved steps.'};
  }
}
export function progressFraction(job:JobView|undefined){if(!job)return 0;if(job.status==='succeeded')return 1;const p=job.progress;if(!p.total)return job.status==='running'?0.08:0;return Math.max(0.08,Math.min(0.95,(p.done||0)/p.total));}
