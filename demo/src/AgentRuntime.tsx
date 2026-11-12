import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Cpu,Loader2,Check,AlertTriangle,Clock3,X,RotateCcw,Play,PlugZap,Laptop} from 'lucide-react';
import {activeStatuses,describeJob,progressFraction,cloudAgentBackend,localAgentBackend,type AgentBackend,type AgentKind,type ComputerView,type JobView,type Computer} from '../lib/agentJobs';
import './agent-runtime.css';

type CloudBackend=ReturnType<typeof cloudAgentBackend>;type LocalBackend=ReturnType<typeof localAgentBackend>;
export type AgentRuntime={backend:AgentBackend|null;role:string;cloud?:CloudBackend;local?:LocalBackend};
const Ctx=createContext<AgentRuntime>({backend:null,role:'owner'});
export function AgentRuntimeProvider({value,children}:{value:AgentRuntime;children:ReactNode}){return <Ctx.Provider value={value}>{children}</Ctx.Provider>;}
export const useAgentRuntime=()=>useContext(Ctx);

export function useComputer(backend:AgentBackend|null,busy=false){
  const [view,setView]=useState<ComputerView>({state:'checking',name:'',detail:'Checking the research computer…',count:0});
  const refresh=useCallback(async()=>{if(!backend)return;try{setView(await backend.computer());}catch(e){setView({state:'unreachable',name:'',detail:e instanceof Error?e.message:'Status unavailable.',count:0});}},[backend]);
  useEffect(()=>{if(!backend)return;let live=true;const go=()=>{if(live&&document.visibilityState!=='hidden')void refresh();};go();const t=setInterval(go,busy?5000:view.state==='unreachable'?60000:12000);return()=>{live=false;clearInterval(t);};},[backend,busy,refresh,view.state==='unreachable']);// eslint-disable-line react-hooks/exhaustive-deps
  return {view,refresh};
}
export function useJobs(backend:AgentBackend|null,ids:string[]){
  const [jobs,setJobs]=useState<Record<string,JobView>>({}),[error,setError]=useState('');const key=ids.join('|');
  const refresh=useCallback(async()=>{if(!backend||!ids.length){setJobs({});return;}try{const list=await backend.jobs(ids);setJobs(Object.fromEntries(list.map(j=>[j.assignmentId,j])));setError('');}catch(e){setError(e instanceof Error?e.message:'Could not read progress.');}},[backend,key]);// eslint-disable-line react-hooks/exhaustive-deps
  const active=Object.values(jobs).some(j=>activeStatuses.includes(j.status));
  useEffect(()=>{let live=true;const go=()=>{if(live&&document.visibilityState!=='hidden')void refresh();};go();const t=setInterval(go,active?3000:15000);return()=>{live=false;clearInterval(t);};},[refresh,active]);
  return {jobs,error,refresh,active};
}

export function ComputerStatus({view,compact=false}:{view:ComputerView;compact?:boolean}){
  const tone=view.state==='online'||view.state==='busy'?'online':view.state==='checking'?'checking':view.state==='model-unavailable'?'warn':'offline';
  const label={online:'Research computer online',busy:'Research computer working',['model-unavailable']:'Research computer needs attention',offline:'Research computer offline',['not-connected']:'No research computer connected',unreachable:'Research computer not reachable',checking:'Checking research computer'}[view.state];
  return <div className={'computer-status '+tone+(compact?' compact':'')} role="status" aria-live="polite"><span className="computer-dot" aria-hidden="true"/><div><strong>{label}{view.name&&view.state!=='not-connected'?' · '+view.name:''}</strong>{!compact&&<small>{view.detail}{view.lastSeen&&view.state==='offline'?' Last seen '+new Date(view.lastSeen).toLocaleString()+'.':''}</small>}</div></div>;
}

type PanelProps={
  kind:AgentKind;startLabel:string;canStart:boolean;blocker?:string;locked:boolean;readOnly?:boolean;
  assignments:{id:string;status:string;createdAt:string}[];
  start:()=>Promise<{id:string}>;packetFor:(id:string)=>Promise<{id:string}>;importResult:(id:string,result:unknown)=>Promise<void>;
  onCancelled:(id:string)=>Promise<void>;
  children?:ReactNode;
};
/** One button to run research or drafting on the connected computer, with live status and automatic import. */
export function AgentRunPanel(p:PanelProps){
  const rt=useAgentRuntime(),backend=rt.backend;
  const exported=p.assignments.filter(a=>a.status==='Exported'),latest=p.assignments[0];
  const ids=[...new Set([...exported.map(a=>a.id),...(latest?[latest.id]:[])])];
  const {jobs,error:pollError,refresh,active}=useJobs(backend,ids),{view,refresh:refreshComputer}=useComputer(backend,active);
  const [working,setWorking]=useState(false),[error,setError]=useState('');
  const refreshRef=useRef(refresh);refreshRef.current=refresh;
  const importing=useRef(new Set<string>());
  const job=latest?jobs[latest.id]:undefined,pending=latest?.status==='Exported';
  // Results import as soon as they arrive, while this page is open. Import validates and only proposes.
  useEffect(()=>{if(p.readOnly||p.locked)return;for(const a of exported){const j=jobs[a.id];if(j?.status==='succeeded'&&j.result&&!importing.current.has(a.id)){importing.current.add(a.id);void p.importResult(a.id,j.result).catch(e=>{const m=e instanceof Error?e.message:'unknown error';if(/changed|not saved|save/i.test(m)&&!/assignment changed|sources? changed/i.test(m))importing.current.delete(a.id);setError('The result arrived but could not be brought in: '+m);});}}},[jobs,p.readOnly,p.locked]);// eslint-disable-line react-hooks/exhaustive-deps
  // Saved-but-unsent work goes out on its own as soon as the computer is reachable again.
  const sending=useRef(new Set<string>());
  useEffect(()=>{if(p.readOnly||!backend||!pending||!latest||(job&&job.status!=='missing'))return;if(!['online','busy','model-unavailable','offline','not-connected'].includes(view.state)||backend.mode==='local'&&!['online','busy','model-unavailable'].includes(view.state))return;if(sending.current.has(latest.id))return;sending.current.add(latest.id);void p.packetFor(latest.id).then(pk=>backend.submit(p.kind,pk)).then(()=>refreshRef.current()).then(()=>setError('')).catch(()=>{sending.current.delete(latest.id);});},[view.state,job?.status,latest?.id,pending]);// eslint-disable-line react-hooks/exhaustive-deps
  async function act(fn:()=>Promise<void>){setWorking(true);setError('');try{await fn();await new Promise(r=>setTimeout(r,0));await refreshRef.current();await refreshComputer();}catch(e){setError(e instanceof Error?e.message:'Could not complete this step.');}finally{setWorking(false);}}
  const locked=p.locked||working||!backend;
  const state=pending&&!job?{tone:'waiting' as const,title:'Waiting for the research computer',detail:'Saved here. It is sent automatically as soon as the research computer is reachable. Nothing has run yet.'}:job?describeJob(job,view,p.kind):null;
  const showState=!!state&&(pending||job&&['failed','retry','running','queued'].includes(job.status));
  const fraction=progressFraction(job);
  function action(){
    const b=backend!;
    if(pending&&(!job||job.status==='missing'))return <button className="btn primary" disabled={locked} onClick={()=>void act(async()=>{await b.submit(p.kind,await p.packetFor(latest.id));})}><Play size={15}/>Send to research computer</button>;
    if(pending&&job&&activeStatuses.includes(job.status))return <button className="btn" disabled={locked} onClick={()=>void act(async()=>{await b.cancel(job);await p.onCancelled(latest.id);})}><X size={15}/>Cancel</button>;
    if(pending&&job?.status==='failed')return <button className="btn primary" disabled={locked} onClick={()=>void act(async()=>{await b.retry(job,await p.packetFor(latest.id));})}><RotateCcw size={15}/>Try again</button>;
    if(pending&&job?.status==='succeeded')return <span className="agent-run-importing"><Loader2 size={15} className="spin"/>Bringing the result in…</span>;
    return <button className="btn primary" disabled={locked||!p.canStart} onClick={()=>void act(async()=>{const packet=await p.start();await b.submit(p.kind,packet);})}>{working?<Loader2 size={15} className="spin"/>:<Cpu size={15}/>}{p.startLabel}</button>;
  }
  return <div className="agent-run">
    <div className="agent-run-bar"><ComputerStatus view={view}/>
      {!p.readOnly&&<div className="agent-run-actions">{action()}</div>}
    </div>
    {!p.canStart&&p.blocker&&!pending&&<p className="agent-run-blocker">{p.blocker}</p>}
    {(error||pollError)&&<p className="error-banner" role="alert">{error||pollError}</p>}
    {showState&&state&&<div className={'agent-run-state '+state.tone} role="status" aria-live="polite">
      <span className="agent-run-icon">{state.tone==='progress'?<Loader2 size={18} className="spin"/>:state.tone==='waiting'?<Clock3 size={18}/>:state.tone==='problem'?<AlertTriangle size={18}/>:<Check size={18}/>}</span>
      <div><strong>{state.title}</strong>{state.detail&&<p>{state.detail}</p>}{job&&['running','queued','retry'].includes(job.status)&&<div className="agent-run-progress" aria-hidden="true"><span style={{width:Math.round(fraction*100)+'%'}}/></div>}</div>
    </div>}
    {['not-connected','unreachable'].includes(view.state)&&!p.readOnly&&<ConnectComputer/>}
    {p.children}
  </div>;
}

/** Owners connect the pilot Mac once. With the worker running on this Mac, no Terminal step is needed. */
export function ConnectComputer({open=false}:{open?:boolean}){
  const rt=useAgentRuntime(),admin=['owner','admin'].includes(rt.role);
  const [name,setName]=useState('Karan’s Mac'),[code,setCode]=useState(''),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[computers,setComputers]=useState<Computer[]>([]);
  const load=useCallback(async()=>{if(rt.cloud)setComputers(await rt.cloud.listComputers().catch(()=>[]));},[rt.cloud]);
  useEffect(()=>{void load();},[load]);
  if(rt.local&&!rt.cloud)return <details className="agent-connect" open={open}><summary><Laptop size={15}/>Set up the research computer for this demo</summary>
    <p>This demo keeps records in this browser and sends research to the Kalling research computer running on this Mac. It runs Qwen locally through Ollama; nothing is sent to a hosted model.</p>
    <p>One-time setup by the pilot administrator, from the repository’s <strong>demo</strong> folder:</p><code>node --experimental-strip-types scripts/kalling-worker.mjs install</code>
    <p>After that it starts automatically at login. If your browser asks to let this site access apps on this device, allow it. Safari may block this connection; use Chrome, or sign in to a cloud workspace.</p></details>;
  if(!rt.cloud)return null;
  async function connect(){setWorking(true);setError('');setMessage('');try{
    const c=await rt.cloud!.createPairing(name);setCode(c);
    try{const s=await localAgentBackend().pair(c);setMessage(`Connected ${s.cloud.name||'this Mac'} to ${s.cloud.firmName}. It will pick up waiting work within a few seconds.`);setCode('');}
    catch{setMessage('This browser could not reach a research computer on this Mac. On the computer that runs Qwen, finish setup with the code below (valid 15 minutes).');}
    await load();}catch(e){setError(e instanceof Error?e.message:'Could not create a connection code.');}finally{setWorking(false);}}
  return <details className="agent-connect" open={open||!computers.length}><summary><PlugZap size={15}/>Research computers for this firm{computers.length?` · ${computers.length} connected`:''}</summary>
    {computers.map(c=><div className="agent-connect-row" key={c.id}><span><strong>{c.name}</strong><small>{c.last_seen_at?'Last seen '+new Date(c.last_seen_at).toLocaleString():'Not seen yet'}{c.model?' · '+c.model:''}</small></span>{admin&&<button className="text-link" disabled={working} onClick={()=>void (async()=>{setWorking(true);try{await rt.cloud!.revoke(c.id);await load();}catch(e){setError((e as Error).message);}finally{setWorking(false);}})()}>Disconnect</button>}</div>)}
    {admin?<div className="agent-connect-form"><label className="field"><span>Computer name</span><input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><button className="btn" disabled={working||name.trim().length<2} onClick={()=>void connect()}><PlugZap size={15}/>Connect this Mac</button></div>
    :<p>Ask a firm owner or administrator to connect the research computer.</p>}
    {message&&<p className="studio-notice" role="status">{message}</p>}{error&&<p className="error-banner" role="alert">{error}</p>}
    {code&&<div className="agent-connect-code"><p>Connection code</p><strong>{code}</strong><code>node --experimental-strip-types scripts/kalling-worker.mjs pair {code}</code></div>}
    <p className="agent-connect-note">The computer receives only assignments for this firm, through a revocable credential. It runs Qwen locally; there is no hosted model or API charge. Install it once with <code>scripts/kalling-worker.mjs install</code>.</p>
  </details>;
}
