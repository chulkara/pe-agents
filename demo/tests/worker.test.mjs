import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {sample} from '../lib/domain.ts';
import {hydrate} from '../lib/operating.ts';
import {manualResearch} from '../lib/researchFlow.ts';
import {createResearchAssignment,importResearchResult,agentRuns} from '../lib/researchAgent.ts';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {createWorker,createLocalApi,classifyError,describeProgress,cloudClient} from '../scripts/worker-core.mjs';

// The Mac worker is exercised against the real queue SQL (PGlite) through a PostgREST-shaped
// fetch, and against a simulated local-only Ollama. No network or model is used.
const owner='00000000-0000-0000-0000-0000000000b1',analyst='00000000-0000-0000-0000-0000000000b2';
let db,firm,dirs=[];
let queue=Promise.resolve();
const locked=fn=>{const r=queue.then(fn,fn);queue=r.catch(()=>{});return r;};
async function inRole(role,user,sql,args=[]){return locked(async()=>{await db.exec(`begin;set local role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows[0]?Object.values(r.rows[0])[0]:null;}catch(e){await db.exec('rollback;');throw e;}});}
const as=(user,sql,args)=>inRole('authenticated',user,sql,args);
const raw=(sql,args=[])=>locked(()=>db.query(sql,args)).then(r=>r.rows);
const jobRow=async id=>{const r=(await raw('select * from public.kalling_agent_jobs where id=$1',[id]))[0];return r&&{...r,result:r.result&&JSON.parse(r.result)};};
async function rest(url,init){
  const fn=new URL(url).pathname.replace('/rest/v1/rpc/','');assert.match(fn,/^kalling_worker_/,'the computer may only call worker entrypoints');
  assert.equal(init.headers.apikey,deployedCloudProject.publishableKey);assert.equal(init.headers.Authorization,undefined);
  const body=JSON.parse(init.body),keys=Object.keys(body);
  try{const v=await inRole('anon',null,`select public.${fn}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) as v`,keys.map(k=>body[k]));return new Response(JSON.stringify(v),{status:200});}
  catch(e){return new Response(JSON.stringify({message:e.message,code:e.code}),{status:e.code==='42501'?403:400});}
}
const cloudFactory=project=>cloudClient({...project,fetchImpl:rest});
function setup(){let w=hydrate(sample());w.companies=[{...w.companies[0],id:'real-company',name:'Test Company',website:'https://company.co/',sample:false,evidence:[],documents:[],conversations:[]}];return manualResearch(w,w.companies[0],{url:'https://company.co/',title:'Services',excerpt:'Our locksmith technicians install access control systems for commercial customers in New Jersey.'});}
function ollama({ready=true,delay}={}){const state={ready,chats:0,delay};return {state,request:async(path,body,signal)=>{
  if(path==='/api/status')return {cloud:{disabled:state.ready}};
  if(path==='/api/tags')return {models:[{name:'qwen3:4b',size:2500000000,digest:'a'.repeat(64)}]};
  if(path==='/api/show')return {modelfile:'FROM /local/weights'};
  state.chats++;if(state.delay)await Promise.race([state.delay(),new Promise((_,no)=>{if(signal?.aborted)no(Error('Stopped. Completed checkpoints are retained.'));signal?.addEventListener('abort',()=>no(Error('Stopped. Completed checkpoints are retained.')),{once:true});})]);const input=JSON.parse(body.messages[1].content);
  if(input.passages)return {done:true,done_reason:'stop',prompt_eval_count:200,eval_count:100,message:{content:JSON.stringify({claims:[{topic:'service_mix',value:'Source reports commercial services.',passageId:input.passages[0].id}],questions:['Which services are recurring?']})}};
  return {done:true,done_reason:'stop',prompt_eval_count:1,eval_count:1,message:{content:JSON.stringify({comparisons:[]})}};}};}
async function until(check,ms=5000){const end=Date.now()+ms;for(;;){const v=await check();if(v)return v;if(Date.now()>end)throw Error('Timed out waiting for condition');await new Promise(r=>setTimeout(r,15));}}
async function tmp(){const d=await mkdtemp(join(tmpdir(),'kalling-worker-'));dirs.push(d);return d;}
const fast={idle:15,heartbeat:0,renew:40,modelOk:60000,modelRetry:30};
async function worker(opts={}){const w=createWorker({stateDir:opts.dir||await tmp(),cloudFactory,timing:fast,request:ollama().request,log:m=>{if(process.env.WORKER_DEBUG)console.error('[worker]',m);},...opts});await w.start();return w;}
async function pairCode(){return as(owner,'select public.kalling_agent_create_pairing($1,$2)',[firm,'Karan MacBook']);}
async function enqueue(w=setup()){const out=await createResearchAssignment(w,w.companies[0],'Analyst');const id=await as(analyst,'select public.kalling_agent_enqueue($1,$2,$3)',[firm,'research',JSON.stringify(out.packet)]);return {...out,id};}

before(async()=>{
  db=new PGlite();
  await db.exec(await readFile(new URL('../production/tests/bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql'])await db.exec(await readFile(new URL('../production/migrations/'+f,import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())',[owner,'o@w.example',analyst,'a@w.example']);
  firm=await as(owner,'select public.kalling_create_firm($1,$2)',['Worker Firm',{firm:{name:'Worker Firm'},companies:[{id:'real-company',name:'Test Company'}],deals:[],events:[]}]);
  const t=await as(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,'a@w.example','analyst']);await as(analyst,'select public.kalling_accept_invite($1)',[t]);
});
after(async()=>{await db?.close();for(const d of dirs)await rm(d,{recursive:true,force:true});});

test('pairing stores only a computer token and rejects bad codes before any request',async()=>{
  const dir=await tmp(),w=await worker({dir});
  await assert.rejects(()=>w.pair('not-a-code'),/full connection code/);
  await assert.rejects(()=>w.pair('AAAAAA-AAAAAA-AAAAAA-AAAAAA'),/invalid or expired/);
  const s=await w.pair(await pairCode());
  assert.equal(s.cloud.firmName,'Worker Firm');
  const cfg=JSON.parse(await readFile(join(dir,'worker.json'),'utf8'));
  assert.equal(cfg.cloud.token.length,64);assert.equal(cfg.cloud.url,deployedCloudProject.url);assert.ok(!JSON.stringify(cfg).includes('sb_secret'));
  await until(()=>w.state.cloud.status==='online');
  assert.equal((await raw('select state from public.kalling_agent_workers where id=$1',[cfg.cloud.workerId]))[0].state,'ready');
  await w.stop();
});

test('a queued assignment is claimed, run locally, reported and imported as proposals for review',async()=>{
  const model=ollama(),w=await worker({request:model.request});await w.pair(await pairCode());
  const {workspace,id}=await enqueue();
  const row=await until(async()=>{const r=await jobRow(id);return r.status==='succeeded'&&r;});
  assert.equal(row.progress.stage,'ready-for-review');assert.equal(row.attempts,1);
  assert.equal(row.result.executionPolicy,'local-only-required-v2');assert.equal(row.result.metrics.apiCostUSD,0);
  const next=await importResearchResult(workspace,workspace.companies[0],row.result);
  assert.equal(agentRuns(next,next.companies[0])[0].status,'In review');assert.equal(next.companies[0].evidence.length,0,'nothing is accepted automatically');
  assert.ok((await raw("select count(*)::int n from public.kalling_audit where event='agent.succeeded'"))[0].n>=1);
  await w.stop();
});

test('work waits while local Qwen is unavailable and starts once it is ready',async()=>{
  await raw("update public.kalling_agent_workers set revoked_at=now() where revoked_at is null");
  const model=ollama({ready:false}),w=await worker({request:model.request});await w.pair(await pairCode());
  const {id}=await enqueue();
  await until(async()=>(await raw("select state from public.kalling_agent_workers where revoked_at is null"))[0]?.state==='model-unavailable');
  assert.equal((await jobRow(id)).status,'queued');assert.equal(model.state.chats,0);
  assert.equal(w.status().model.ready,false);assert.match(w.status().model.detail,/cloud features/);
  model.state.ready=true;
  await until(async()=>(await jobRow(id)).status==='succeeded');
  await w.stop();
});

test('cancelling in Kalling stops the computer and its result is never stored',async()=>{
  await raw("update public.kalling_agent_workers set revoked_at=now() where revoked_at is null");
  let release;const gate=new Promise(r=>release=r);const model=ollama({delay:()=>gate}),w=await worker({request:model.request});await w.pair(await pairCode());
  const {id}=await enqueue();
  await until(()=>model.state.chats>0);
  await as(analyst,'select public.kalling_agent_cancel($1)',[id]);
  await until(()=>!w.state.active,3000).catch(()=>{});release();
  await until(()=>!w.state.active);
  const row=await jobRow(id);assert.equal(row.status,'cancelled');assert.equal(row.result,null);
  await w.stop();
});

test('a computer restart resumes its held assignment from the saved checkpoint',async()=>{
  await raw("update public.kalling_agent_workers set revoked_at=now() where revoked_at is null");
  const dir=await tmp();let release;const gate=new Promise(r=>release=r);
  let w=await worker({dir,request:ollama({delay:()=>gate}).request});await w.pair(await pairCode());
  const {id}=await enqueue();
  await until(async()=>(await jobRow(id)).status==='running'&&w.state.active);
  await w.stop();release();
  assert.equal((await jobRow(id)).status,'running','shutdown does not report failure');
  const model=ollama();w=await worker({dir,request:model.request});
  const row=await until(async()=>{const r=await jobRow(id);return r.status==='succeeded'&&r;});
  assert.equal(row.attempts,1,'resuming its own lease does not spend an attempt');
  assert.equal(row.result.metrics.resumed,true);
  await w.stop();
});

test('a disconnected computer stops claiming and reports that it needs to be connected again',async()=>{
  await raw("update public.kalling_agent_workers set revoked_at=now() where revoked_at is null");
  const model=ollama(),w=await worker({request:model.request});await w.pair(await pairCode());
  await until(()=>w.state.cloud.status==='online');
  await as(owner,'select public.kalling_agent_revoke_worker($1,$2)',[firm,w.state.config.cloud.workerId]);
  await until(()=>w.state.cloud.status==='revoked');
  const {id}=await enqueue();await new Promise(r=>setTimeout(r,150));
  assert.equal((await jobRow(id)).status,'queued');assert.equal(model.state.chats,0);
  await as(analyst,'select public.kalling_agent_cancel($1)',[id]);
  await w.stop();
});

test('the local demo API accepts only Kalling pages on loopback and completes assignments',async()=>{
  const model=ollama(),w=await worker({request:model.request}),api=createLocalApi(w,{port:0}),port=await api.listen(),base=`http://127.0.0.1:${port}`;
  const kalling={Origin:'https://chulkara.github.io','Content-Type':'application/json'};
  const pre=await fetch(base+'/v1/jobs',{method:'OPTIONS',headers:{Origin:'https://chulkara.github.io','Access-Control-Request-Private-Network':'true'}});
  assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-private-network'),'true');assert.equal(pre.headers.get('access-control-allow-origin'),'https://chulkara.github.io');
  assert.equal((await fetch(base+'/v1/status',{headers:{Origin:'https://evil.example'}})).status,403);
  const {packet}=await createResearchAssignment(setup(),setup().companies[0],'Analyst');
  assert.equal((await fetch(base+'/v1/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packet})})).status,403,'no origin, no write');
  assert.equal((await fetch(base+'/v1/jobs',{method:'POST',headers:{...kalling,'Content-Type':'text/plain'},body:JSON.stringify({packet})})).status,415);
  assert.equal((await fetch(base+'/v1/jobs',{method:'POST',headers:kalling,body:JSON.stringify({packet:{...packet,pad:'x'.repeat(660000)}})})).status,413);
  assert.equal((await fetch(base+'/v1/jobs',{method:'POST',headers:kalling,body:JSON.stringify({packet:{...packet,pad:'x'.repeat(140000)}})})).status,400,'research assignments stay under 120 KB');
  const status=await (await fetch(base+'/v1/status',{headers:kalling})).json();assert.equal(status.app,'kalling-worker');
  const sub=await fetch(base+'/v1/jobs',{method:'POST',headers:kalling,body:JSON.stringify({packet})});assert.equal(sub.status,202);
  const done=await until(async()=>{const j=await (await fetch(base+'/v1/jobs/'+packet.id,{headers:kalling})).json();return j.status==='succeeded'&&j;});
  assert.equal(done.result.id,packet.id);assert.equal(done.progress.stage,'ready-for-review');
  const again=await (await fetch(base+'/v1/jobs',{method:'POST',headers:kalling,body:JSON.stringify({packet})})).json();assert.equal(again.status,'succeeded','resubmission is idempotent');
  assert.equal((await (await fetch(base+'/v1/jobs/unknown-assignment',{headers:kalling})).json()).status,'missing');
  await api.close();await w.stop();
});

test('local demo jobs survive a restart and can be cancelled',async()=>{
  const dir=await tmp();let release;const gate=new Promise(r=>release=r);
  let w=await worker({dir,request:ollama({delay:()=>gate}).request});
  const {packet}=await createResearchAssignment(setup(),setup().companies[0],'Analyst');
  await w.submitLocal(packet);await until(()=>w.state.active);
  await w.stop();release();
  w=await worker({dir,request:ollama().request});
  await until(()=>w.localJob(packet.id)?.status==='succeeded');
  const p2=(await createResearchAssignment(setup(),setup().companies[0],'Analyst')).packet;
  let hold;const g2=new Promise(r=>hold=r);await w.stop();w=await worker({dir,request:ollama({delay:()=>g2}).request});
  await w.submitLocal(p2);await until(()=>w.state.active);
  assert.equal((await w.cancelLocal(p2.id)).status,'cancelled');hold();
  await until(()=>!w.state.active);assert.equal(w.localJob(p2.id).status,'cancelled');
  await w.stop();
});

test('errors are classified so model outages wait and broken assignments stop',()=>{
  assert.deepEqual(classifyError(Error('Cannot verify that the running Ollama has cloud features disabled.')),{retryable:true,model:true});
  assert.deepEqual(classifyError(Error('The bounded retry/call allowance is exhausted. Review the failure and export a new assignment.')),{retryable:false,model:false});
  assert.deepEqual(classifyError(Error('The local model returned invalid JSON. No proposals were accepted.')),{retryable:true,model:false});
  assert.equal(classifyError(Error('The installed model changed. Export a new assignment to preserve reproducibility.')).retryable,false);
  const packet={sources:[{id:'s1'},{id:'s2'}]},counter={done:0,calls:0,label:''};
  assert.equal(describeProgress('research',packet,{step:'source:s2:passages-v1',status:'Running',calls:2},counter).label,'Reading source 2 of 2');
  assert.equal(describeProgress('research',packet,{step:'source:s2:passages-v1',status:'Checkpoint saved'},counter).done,1);
  assert.equal(describeProgress('research',packet,{step:'compare',status:'Running',calls:3},counter).total,3);
  assert.equal(describeProgress('outreach',{},{step:'compose:business-correspondence-v1',status:'Running',calls:1},{done:0,calls:0}).label,'Writing the introduction');
  assert.throws(()=>cloudClient({url:'https://evil.example',publishableKey:'sb_publishable_x'}),/Supabase project/);
  assert.throws(()=>cloudClient({url:deployedCloudProject.url,publishableKey:'sb_secret_x'}),/never a secret/);
});
