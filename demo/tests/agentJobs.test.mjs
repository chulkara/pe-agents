import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeComputers,describeJob,progressFraction,jobFromRow,localAgentBackend} from '../lib/agentJobs.ts';

const now=Date.parse('2026-11-12T12:00:00Z'),ago=s=>new Date(now-s*1000).toISOString();
const computer=(o={})=>({id:'w1',name:'Karan Mac',state:'ready',detail:null,last_seen_at:ago(10),created_at:ago(999),version:'v',model:'qwen3:4b',...o});
const job=(o={})=>({id:'j',assignmentId:'a',kind:'research',status:'queued',progress:{},attempts:0,maxAttempts:4,error:'',createdAt:'',updatedAt:'',...o});

test('computer status distinguishes online, busy, model trouble, offline and not connected',()=>{
  assert.equal(summarizeComputers([],now).state,'not-connected');
  assert.equal(summarizeComputers([computer()],now).state,'online');
  assert.equal(summarizeComputers([computer({state:'busy'})],now).state,'busy');
  assert.equal(summarizeComputers([computer({state:'model-unavailable'})],now).state,'model-unavailable');
  const off=summarizeComputers([computer({last_seen_at:ago(300)})],now);
  assert.equal(off.state,'offline');assert.match(off.detail,/starts automatically/);assert.equal(off.lastSeen,ago(300));
  assert.equal(summarizeComputers([computer({last_seen_at:ago(300)}),computer({id:'w2',name:'Spare',state:'busy'})],now).name,'Spare');
});

test('waiting work says plainly why it is waiting and that the page can close',()=>{
  const offline={state:'offline',name:'Mac',detail:'',count:1},online={state:'online',name:'Mac',detail:'',count:1};
  const w=describeJob(job(),offline,'research');assert.equal(w.tone,'waiting');assert.match(w.detail,/offline/);assert.match(w.detail,/close this page/);
  assert.equal(describeJob(job(),online,'research').tone,'progress');
  assert.match(describeJob(job(),{state:'model-unavailable',name:'',detail:'',count:1},'research').detail,/Qwen is not ready/);
  const r=describeJob(job({status:'running',attempts:2,progress:{label:'Reading source 1 of 2',done:0,total:3}}),online,'research');
  assert.equal(r.title,'Reading source 1 of 2');assert.match(r.detail,/Step 1 of 3 · attempt 2 of 4/);
  assert.match(describeJob(job({status:'running'}),offline,'research').title,/went offline/);
  assert.equal(describeJob(job({status:'retry',error:'Ollama is not running'}),online,'outreach').tone,'waiting');
  assert.match(describeJob(job({status:'succeeded'}),online,'outreach').detail,/Nothing has been accepted or sent/);
  assert.equal(describeJob(job({status:'failed',error:'Boom'}),online,'research').detail,'Boom');
  assert.equal(progressFraction(job({status:'running',progress:{done:1,total:2}})),0.5);
  assert.equal(progressFraction(job({status:'succeeded'})),1);
});

test('stored results are parsed from verbatim text and bad text is ignored',()=>{
  const row={id:'j',assignment_id:'a',kind:'research',status:'succeeded',progress:null,attempts:1,max_attempts:4,last_error:null,created_at:'x',updated_at:'y',result:'{"id":"a","b":1}'};
  assert.deepEqual(jobFromRow(row).result,{id:'a',b:1});
  assert.equal(jobFromRow({...row,result:'{'}).result,undefined);
});

test('local backend reports an unreachable computer instead of throwing, and maps missing jobs',async()=>{
  const down=localAgentBackend('http://127.0.0.1:1',async()=>{throw TypeError('fetch failed');});
  assert.equal((await down.computer()).state,'unreachable');
  await assert.rejects(()=>down.submit('research',{id:'abcdefgh'}),/cannot reach/);
  const up=localAgentBackend('http://x',async url=>String(url).endsWith('/v1/status')?new Response(JSON.stringify({app:'kalling-worker',model:{ready:false,name:'qwen3:4b',detail:'Ollama not running'},cloud:{},active:null,local:{queued:0}})):new Response(JSON.stringify({error:'Assignment not found on this computer.'}),{status:404}));
  assert.equal((await up.computer()).state,'model-unavailable');
  assert.equal((await up.jobs(['missing-1']))[0].status,'missing');
});
