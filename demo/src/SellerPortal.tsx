import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Check,ChevronDown,CircleHelp,Download,FileText,Lock,Mail,MessageSquare,Phone,Send,Upload,Users,X,Loader2,ListChecks,FolderOpen,AlertTriangle,Paperclip} from 'lucide-react';
import {possessive,portalProgress,privacyReminder,requestOrder,unread,type DocRequest,type PortalBundle,type PortalFile,type Buyer} from '../lib/portal';
import type {PortalStore} from '../lib/portalStore';
import './portal.css';

// In-page links must not change the URL hash, which selects the app.
const jump=(e:{preventDefault():void;currentTarget:HTMLAnchorElement})=>{e.preventDefault();document.getElementById(e.currentTarget.getAttribute('href')!.slice(1))?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
export const fmtDate=(d?:string)=>d?new Date(d.length===10?d+'T12:00:00':d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
export const fmtSize=(n:number)=>n<1024*1024?Math.max(1,Math.round(n/1024))+' KB':(n/1024/1024).toFixed(1)+' MB';
const stageHelp:Record<Buyer['stage'],string>={'Introduced':'You have been introduced. No commitment on either side.','Interested':'They have said they would like to learn more.','Under NDA':'They signed a confidentiality agreement before seeing details.','Reviewing information':'They are reviewing the information you shared.','Offer made':'They have made an offer. Your contact will walk you through it.','Not proceeding':'They decided not to continue. Nothing further is shared with them.'};
const statusTone:Record<DocRequest['status'],string>={'Open':'neutral','In progress':'progress','Submitted':'sent','Accepted':'done','Needs changes':'attention','Not applicable':'muted'};
const ownerLabel:Record<DocRequest['status'],string>={'Open':'To do','In progress':'Saved — not sent yet','Submitted':'Sent for review','Accepted':'Complete','Needs changes':'Needs a change','Not applicable':'Not needed'};

export function usePortal(store:PortalStore,portalId:string){
  const [b,setB]=useState<PortalBundle|null>(null),[error,setError]=useState('');
  const refresh=useCallback(async()=>{try{setB(await store.load(portalId));setError('');}catch(e){setError(e instanceof Error?e.message:'Could not open the portal.');}},[store,portalId]);
  useEffect(()=>{void refresh();const t=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh();},20000);return()=>clearInterval(t);},[refresh]);
  return {b,error,refresh};
}

export default function SellerPortal({store,portalId,preview=false,top}:{store:PortalStore;portalId:string;preview?:boolean;top?:ReactNode}){
  const {b,error,refresh}=usePortal(store,portalId);
  const seenOnce=useRef(false);
  useEffect(()=>{if(b&&!preview&&!seenOnce.current){seenOnce.current=true;void store.seen(portalId).catch(()=>{});}},[b,preview,store,portalId]);
  if(!b)return <div className="portal-shell"><div className="portal-loading">{error?<p role="alert" className="error-banner">{error}</p>:<><Loader2 className="spin"/>Opening your portal…</>}</div></div>;
  const p=b.portal,prog=portalProgress(b),waiting=b.requests.filter(r=>['Open','In progress','Needs changes'].includes(r.status)),newMessages=unread(b);
  const readOnly=preview||!b.canEdit;
  return <div className="portal-shell">
    {top}
    {preview&&<p className="portal-preview" role="status"><Lock size={14}/>Preview of what {p.ownerName} sees. Actions are disabled here.</p>}
    <header className="portal-hero">
      <div className="portal-hero-text"><span className="portal-kicker">Private owner portal · {p.firmName}</span><h1>{p.businessName}</h1><p>Prepared for {p.ownerName}. Everything here is visible only to you and {possessive(p.firmName)} team.</p>
        {p.welcome&&<blockquote className="portal-welcome">{p.welcome}</blockquote>}</div>
      <aside className="portal-help"><CircleHelp size={18}/><div><strong>Questions? Ask {p.help.name.split(' ')[0]}.</strong><a href={'mailto:'+p.help.email}><Mail size={13}/>{p.help.email}</a>{p.help.phone&&<a href={'tel:'+p.help.phone.replace(/[^\d+]/g,'')}><Phone size={13}/>{p.help.phone}</a>}<a href={"#portal-messages"} onClick={jump}><MessageSquare size={13}/>Send a message here</a></div></aside>
    </header>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    <section className="portal-summary" aria-label="Your progress">
      <div><strong>{prog.done} of {prog.total}</strong><span>requests complete</span></div>
      <div><strong>{waiting.length}</strong><span>waiting for you</span></div>
      <div><strong>{prog.sent}</strong><span>with {p.firmName.split(' ')[0]} for review</span></div>
      <div><strong>{newMessages}</strong><span>new {newMessages===1?'message':'messages'}</span></div>
      <div className="portal-bar" aria-hidden="true"><span style={{width:(prog.total?Math.round(prog.done/prog.total*100):0)+'%'}}/><span className="sent" style={{width:(prog.total?Math.round(prog.sent/prog.total*100):0)+'%'}}/></div>
    </section>
    <nav className="portal-nav" aria-label="Portal sections"><a href={"#portal-steps"} onClick={jump}><ListChecks size={15}/>Next steps</a><a href={"#portal-requests"} onClick={jump}><FileText size={15}/>Requests{waiting.length?<em>{waiting.length}</em>:null}</a><a href={"#portal-buyers"} onClick={jump}><Users size={15}/>Buyers</a><a href={"#portal-messages"} onClick={jump}><MessageSquare size={15}/>Messages{newMessages?<em>{newMessages}</em>:null}</a><a href={"#portal-documents"} onClick={jump}><FolderOpen size={15}/>Your documents</a></nav>
    <div className="portal-grid">
      <main className="portal-main">
        <section id="portal-steps" className="portal-section"><h2>Next steps</h2>
          {b.steps.length?<ol className="portal-steps">{b.steps.map(s=><li key={s.id} className={s.done?'done':''}><span className="portal-step-mark">{s.done?<Check size={14}/>:null}</span><div><strong>{s.text}</strong><small>{s.owner==='You'?'You':p.firmName}{s.due?' · by '+fmtDate(s.due):''}{s.done?' · done':''}</small></div></li>)}</ol>:<p className="portal-empty">{p.firmName} will add next steps here.</p>}
        </section>
        <section id="portal-requests" className="portal-section"><h2>Document requests</h2>
          <p className="portal-lede">Each request explains what is needed, why, and who can see it. Your work saves as you go, so you can leave and come back. Send each request when you’re ready for it to be reviewed.</p>
          {[...b.requests].sort((x,y)=>requestOrder(x)-requestOrder(y)).map(r=><RequestCard key={r.id} r={r} b={b} store={store} readOnly={readOnly} refresh={refresh}/>)}
          {!b.requests.length&&<p className="portal-empty">No documents requested yet.</p>}
        </section>
        <section id="portal-buyers" className="portal-section"><h2>Interested buyers</h2>
          {b.buyers.length?<div className="portal-buyers">{b.buyers.map(x=><article key={x.id}><div className="portal-buyer-head"><h3>{x.name}</h3><span className={'portal-stage s'+['Introduced','Interested','Under NDA','Reviewing information','Offer made','Not proceeding'].indexOf(x.stage)}>{x.stage}</span></div>{x.summary&&<p>{x.summary}</p>}<small>{stageHelp[x.stage]} Updated {fmtDate(x.updatedAt)}.</small></article>)}</div>:<p className="portal-empty">No buyers are listed yet. {p.firmName} adds buyers here as conversations begin.</p>}
        </section>
      </main>
      <aside className="portal-side">
        <Messages b={b} store={store} readOnly={readOnly} refresh={refresh}/>
        <section id="portal-documents" className="portal-section portal-docs"><h2>Your documents</h2>
          {b.files.length?<ul>{b.files.map(f=><li key={f.id}><FileRow f={f} store={store}/><small>Used for: {b.requests.filter(r=>r.fileIds.includes(f.id)).map(r=>r.title).join(', ')||'not linked to a request'}</small></li>)}</ul>:<p className="portal-empty">Documents you provide appear here, so you never need to send the same one twice.</p>}
          <p className="portal-access"><Lock size={13}/>Stored privately. Opened only by you{b.access.team.length?' and '+b.access.team.length+' '+(b.access.team.length===1?'person':'people')+' at '+p.firmName:''}.</p>
        </section>
      </aside>
    </div>
  </div>;
}

export function FileRow({f,store}:{f:PortalFile;store:PortalStore}){
  const [err,setErr]=useState('');
  return <span className="portal-file"><Paperclip size={14}/><button className="text-link" onClick={()=>void store.download(f).then(blob=>{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}).catch(e=>setErr(e.message))}>{f.name}</button><small>{fmtSize(f.size)} · {fmtDate(f.createdAt)}</small>{err&&<small className="portal-error">{err}</small>}<Download size={13} aria-hidden="true"/></span>;
}

type Upload={name:string;fraction:number;stage:string;error?:string;duplicate?:boolean};
function RequestCard({r,b,store,readOnly,refresh}:{r:DocRequest;b:PortalBundle;store:PortalStore;readOnly:boolean;refresh:()=>Promise<void>}){
  const done=['Accepted','Not applicable'].includes(r.status);
  const [open,setOpen]=useState(!done&&r.status!=='Submitted'&&b.requests.filter(x=>!['Accepted','Not applicable','Submitted'].includes(x.status)).sort((x,y)=>requestOrder(x)-requestOrder(y))[0]?.id===r.id);
  const [note,setNote]=useState(r.sellerNote),[saved,setSaved]=useState(''),[uploads,setUploads]=useState<Upload[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[drag,setDrag]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>>(undefined),input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!timer.current)setNote(r.sellerNote);},[r.sellerNote]);
  const locked=readOnly||done||r.status==='Submitted';
  const files=r.fileIds.map(id=>b.files.find(f=>f.id===id)).filter(Boolean) as PortalFile[];
  const reusable=b.files.filter(f=>!r.fileIds.includes(f.id));
  function noteChanged(v:string){setNote(v);setSaved('Saving…');clearTimeout(timer.current);timer.current=setTimeout(()=>{timer.current=undefined;void store.sellerNote(r.id,v).then(()=>{setSaved('Saved');void refresh();}).catch(e=>{setSaved('');setError(e.message);});},900);}
  async function add(list:FileList|File[]){
    setError('');const arr=[...list];setUploads(arr.map(f=>({name:f.name,fraction:0,stage:'Waiting'})));
    for(const [i,f] of arr.entries()){
      try{const out=await store.upload(r.id,f,(fraction,stage)=>setUploads(u=>u.map((x,j)=>j===i?{...x,fraction,stage}:x)));
        setUploads(u=>u.map((x,j)=>j===i?{...x,fraction:1,stage:out.duplicate?'You already provided this file on '+fmtDate(out.file.createdAt)+' — it is now linked here too.':'Saved',duplicate:out.duplicate}:x));}
      catch(e){setUploads(u=>u.map((x,j)=>j===i?{...x,error:e instanceof Error?e.message:'Upload failed.'}:x));}
      await refresh();
    }
  }
  async function act(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message:'Something went wrong. Your saved work is kept.');}finally{setBusy(false);}}
  return <article className={'portal-request '+statusTone[r.status]+(open?' open':'')}>
    <button className="portal-request-head" aria-expanded={open} onClick={()=>setOpen(!open)}>
      <span className="portal-request-icon">{r.status==='Accepted'?<Check size={16}/>:r.status==='Needs changes'?<AlertTriangle size={16}/>:<FileText size={16}/>}</span>
      <span className="portal-request-title"><strong>{r.title}</strong><small>{ownerLabel[r.status]}{r.due&&!done?' · requested by '+fmtDate(r.due):''}{files.length?' · '+files.length+' '+(files.length===1?'document':'documents'):''}</small></span>
      <ChevronDown size={18} className="portal-chevron"/>
    </button>
    {open&&<div className="portal-request-body">
      {r.status==='Needs changes'&&r.reviewNote&&<p className="portal-review-note"><AlertTriangle size={15}/><span><strong>What needs to change</strong>{r.reviewNote}</span></p>}
      {r.status==='Accepted'&&r.reviewNote&&<p className="portal-review-note ok"><Check size={15}/><span>{r.reviewNote}</span></p>}
      <dl className="portal-explain">
        <div><dt>What we need</dt><dd>{r.needed}</dd></div>
        <div><dt>Why it matters</dt><dd>{r.why}</dd></div>
        <div><dt>Who can see it</dt><dd>{r.sharing}<small><Lock size={12}/>Can be opened by you{b.access.team.length?' and '+b.access.team.join(', '):''}.</small></dd></div>
        <div><dt>Questions about this request</dt><dd>{r.contact.name} · <a href={'mailto:'+r.contact.email}>{r.contact.email}</a>{r.contact.phone?' · '+r.contact.phone:''}</dd></div>
      </dl>
      {files.length>0&&<ul className="portal-attached">{files.map(f=><li key={f.id}><FileRow f={f} store={store}/>{!locked&&<button className="icon-btn" aria-label={'Remove '+f.name+' from this request'} disabled={busy} onClick={()=>void act(()=>store.unlink(r.id,f.id))}><X size={14}/></button>}</li>)}</ul>}
      {!locked&&<>
        <div className={'portal-drop'+(drag?' drag':'')} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files.length)void add(e.dataTransfer.files);}}>
          <Upload size={20}/><p><strong>Add documents</strong> — drag files here or <button className="text-link" onClick={()=>input.current?.click()}>choose files</button>. Each file saves as soon as it uploads.</p><small>PDF, images, Word, Excel, CSV or text · up to 10 MB each. {privacyReminder}</small>
          <input ref={input} type="file" multiple hidden aria-label={'Add documents for '+r.title} accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xls,.xlsx,.doc,.docx" onChange={e=>{const l=e.target.files;if(l?.length)void add([...l]);e.target.value='';}}/>
        </div>
        {uploads.length>0&&<ul className="portal-uploads" aria-live="polite">{uploads.map((u,i)=><li key={i} className={u.error?'failed':u.fraction>=1?'ok':''}><span>{u.name}</span><small>{u.error||u.stage}</small>{!u.error&&u.fraction<1&&<span className="portal-upload-bar"><span style={{width:Math.round(u.fraction*100)+'%'}}/></span>}</li>)}</ul>}
        {reusable.length>0&&<label className="field portal-reuse"><span>Or use a document you already provided</span><select value="" disabled={busy} onChange={e=>{const id=e.target.value;if(id)void act(()=>store.link(r.id,id));}}><option value="">Choose a document…</option>{reusable.map(f=><option key={f.id} value={f.id}>{f.name} · {fmtDate(f.createdAt)}</option>)}</select></label>}
        <label className="field portal-note"><span>Note for {b.portal.firmName.split(' ')[0]} · optional <em aria-live="polite">{saved}</em></span><textarea rows={3} maxLength={2000} value={note} onChange={e=>noteChanged(e.target.value)} placeholder="For example: the 2023 return is with my accountant and will follow next week."/></label>
        <div className="portal-request-actions"><button className="btn primary" disabled={busy||(!files.length&&note.trim().length<5)} onClick={()=>void act(async()=>{clearTimeout(timer.current);timer.current=undefined;if(note!==r.sellerNote)await store.sellerNote(r.id,note);await store.submit(r.id);})}><Send size={15}/>Send for review</button><small>{files.length||note.trim().length>=5?'You can still message your contact after sending.':'Add a document, or a note explaining why you can’t provide one.'}</small></div>
      </>}
      {r.status==='Submitted'&&<p className="portal-sent"><Check size={15}/>Sent {fmtDate(r.submittedAt)}. {b.portal.firmName} will review it and let you know if anything else is needed.{r.sellerNote&&<span>Your note: “{r.sellerNote}”</span>}</p>}
      {error&&<p className="error-banner" role="alert">{error}</p>}
    </div>}
  </article>;
}

export function Messages({b,store,readOnly,refresh}:{b:PortalBundle;store:PortalStore;readOnly:boolean;refresh:()=>Promise<void>}){
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const end=useRef<HTMLDivElement>(null);
  const me=b.side;useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[b.messages.length]);
  return <section id="portal-messages" className="portal-section portal-messages"><h2>Messages</h2>
    <div className="portal-thread">{b.messages.map(m=><div key={m.id} className={'portal-msg '+(m.side===me?'mine':'theirs')}><p>{m.body}</p><small>{m.side===me?'You':m.author} · {new Date(m.createdAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></div>)}{!b.messages.length&&<p className="portal-empty">No messages yet. Ask anything — {b.portal.help.name.split(' ')[0]} will reply here.</p>}<div ref={end}/></div>
    {!readOnly&&<form onSubmit={e=>{e.preventDefault();if(!text.trim())return;setBusy(true);setError('');void store.message(b.portal.id,text).then(async()=>{setText('');await store.seen(b.portal.id).catch(()=>{});await refresh();}).catch(err=>setError(err.message)).finally(()=>setBusy(false));}}>
      <label className="sr-only" htmlFor={'msg-'+b.portal.id}>Message</label><textarea id={'msg-'+b.portal.id} rows={2} maxLength={4000} value={text} onChange={e=>setText(e.target.value)} placeholder={me==='seller'?'Write to '+b.portal.firmName+'…':'Write to '+b.portal.ownerName+'…'}/><button className="btn primary" disabled={busy||!text.trim()}><Send size={14}/>Send</button></form>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
  </section>;
}
