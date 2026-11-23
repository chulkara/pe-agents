import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {localProfessionalStore,cloudProfessionalStore,type ProfessionalStore,type PartyView,type ProHome} from '../../lib/professionalStore';
import {useSession} from '../site/BrokerSite';
import {proRoles,type PartyDoc,type ProRole} from '../../lib/professionals';
import {watermarkPdf} from '../../lib/pdf';
import './pro.css';

const day=(s:string)=>new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const inviteLink=(token:string)=>location.origin+location.pathname+'#/professional?token='+token;
const key=(d:{source:string;id:string})=>d.source+':'+d.id;

/** The seller's or buyer's own CPA and attorney: who they are, what each may open, and when they opened it. */
export function PartyProfessionals({store,side}:{store:ProfessionalStore;side:'seller'|'buyer'}){
  const [list,setList]=useState<PartyView[]|null>(null),[docs,setDocs]=useState<PartyDoc[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState<{id:string;url:string}|null>(null);
  const load=useCallback(async()=>{try{const [l,d]=await Promise.all([store.list(),store.documents()]);setList(l);setDocs(d);}catch(e){setError((e as Error).message);setList([]);}},[store]);
  useEffect(()=>{void load();},[load]);
  async function run(fn:()=>Promise<void>,msg:string){setBusy(true);setError('');setNotice('');try{await fn();await load();setNotice(msg);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function add(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),form=e.currentTarget;
    await run(async()=>{const token=await store.add({name:String(f.get('name')),email:String(f.get('email')),firm:String(f.get('firm')),role:String(f.get('role')) as ProRole,days:Number(f.get('days'))});form.reset();setLink({id:token,url:inviteLink(token)});},'Added. Send them the invitation link below. Kalling does not email it for you.');}
  const groups=useMemo(()=>[...new Set(docs.map(d=>d.group))],[docs]);
  return <section className="pro-panel" aria-labelledby="pro-h">
    <h2 id="pro-h">Your CPA and attorney</h2>
    <p className="pro-lede">Give your own accountant or lawyer a private login. They see only the documents you choose, you can take any of them back at any time, and you see every time they open one.{side==='buyer'?' Your NDA lets you share with advisors who keep the information confidential; you stay responsible for them.':''}</p>
    {error&&<p className="pro-error" role="alert">{error}</p>}{notice&&<p className="pro-ok" role="status">{notice}</p>}
    {link&&<div className="pro-link"><p>Invitation link. It works once, for the email address you entered.</p><code>{link.url}</code><button type="button" className="pro-btn" onClick={()=>void navigator.clipboard?.writeText(link.url).then(()=>setNotice('Link copied.'))}>Copy link</button></div>}
    {list===null?<p className="pro-fine">Loading…</p>:list.map(v=><Pro key={v.professional.id} store={store} v={v} docs={docs} groups={groups} side={side} busy={busy} run={run} showLink={t=>setLink({id:t,url:inviteLink(t)})}/>)}
    {list&&!list.length&&<p className="pro-fine">No one added yet.</p>}
    <details className="pro-add" open={list?.length===0}><summary>Add a CPA or attorney</summary>
      <form onSubmit={e=>void add(e)} className="pro-form">
        <label><span>Their name</span><input name="name" required maxLength={120} autoComplete="off"/></label>
        <label><span>Their email</span><input name="email" type="email" required autoComplete="off"/></label>
        <label><span>Firm, optional</span><input name="firm" maxLength={160} autoComplete="off"/></label>
        <label><span>Role</span><select name="role">{proRoles.map(r=><option key={r}>{r}</option>)}</select></label>
        <label><span>Access lasts</span><select name="days" defaultValue="180"><option value="30">30 days</option><option value="90">90 days</option><option value="180">6 months</option><option value="365">1 year</option></select></label>
        <button className="pro-btn pro-btn-primary" disabled={busy}>Add and create invitation</button>
      </form>
    </details>
  </section>;
}

function Pro({store,v,docs,groups,side,busy,run,showLink}:{store:ProfessionalStore;v:PartyView;docs:PartyDoc[];groups:string[];side:'seller'|'buyer';busy:boolean;run:(fn:()=>Promise<void>,msg:string)=>Promise<void>;showLink:(t:string)=>void}){
  const p=v.professional,shared=new Set(v.grants.map(g=>g.source+':'+g.docId)),[pick,setPick]=useState<Set<string>>(new Set()),[ok,setOk]=useState(false);
  const [removing,setRemoving]=useState(false);
  const unshared=docs.filter(d=>!shared.has(key(d)));
  const status=v.expired?'Access expired':p.status==='Invited'?'Invitation not yet accepted':'Active until '+day(p.expiresAt);
  return <article className="pro-card">
    <header><div><h3>{p.name}</h3><p>{p.role}{p.firm?', '+p.firm:''}. {p.email}</p></div><span className={'pro-status'+(p.status==='Active'&&!v.expired?' on':'')}>{status}</span></header>
    {v.token&&<button type="button" className="pro-link-btn" onClick={()=>showLink(v.token!)}>Show invitation link</button>}
    <h4>Shared with {p.name}</h4>
    {v.grants.length?<ul className="pro-shared">{v.grants.map(g=><li key={g.id}><span>{g.docName}<small>Shared {day(g.grantedAt)}</small></span><button type="button" className="pro-link-btn" disabled={busy} onClick={()=>void run(()=>store.revoke(g.id),'Access to “'+g.docName+'” removed.')}>Stop sharing</button></li>)}</ul>:<p className="pro-fine">Nothing shared yet.</p>}
    {!v.expired&&unshared.length>0&&<details className="pro-share"><summary>Share documents</summary>
      <form onSubmit={e=>{e.preventDefault();void run(async()=>{await store.grant(p.id,[...pick].map(k=>{const [source,...id]=k.split(':');return {source:source as PartyDoc['source'],id:id.join(':')};}),ok);setPick(new Set());setOk(false);},'Shared. They can open these the next time they sign in.');}}>
        {groups.map(g=>{const inGroup=unshared.filter(d=>d.group===g);return inGroup.length?<fieldset key={g}><legend>{g}</legend>{inGroup.map(d=><label key={key(d)} className="pro-check"><input type="checkbox" checked={pick.has(key(d))} onChange={e=>setPick(s=>{const n=new Set(s);if(e.target.checked)n.add(key(d));else n.delete(key(d));return n;})}/>{d.name}</label>)}</fieldset>:null;})}
        <label className="pro-check pro-confirm"><input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/>{side==='buyer'?`${p.name} is bound to keep this confidential, and I am responsible for them under my NDA.`:`I want ${p.name} to see these documents.`}</label>
        <button className="pro-btn pro-btn-primary" disabled={busy||!pick.size||!ok}>Share {pick.size||''} document{pick.size===1?'':'s'}</button>
      </form></details>}
    {v.views.length>0&&<details className="pro-log"><summary>Activity ({v.views.length})</summary><ul>{v.views.slice(0,50).map((x,i)=><li key={i}>{x.event==='opened'?'Opened':'Tried to open, no longer shared:'} {x.document}<small>{new Date(x.at).toLocaleString()}</small></li>)}</ul></details>}
    {removing?<p className="pro-confirm-remove">Remove {p.name}? They lose access to everything you shared. <button type="button" className="pro-btn" disabled={busy} onClick={()=>void run(()=>store.remove(p.id),p.name+' removed. Their access has ended.')}>Remove</button> <button type="button" className="pro-link-btn" onClick={()=>setRemoving(false)}>Keep</button></p>
    :<button type="button" className="pro-link-btn pro-remove" disabled={busy} onClick={()=>setRemoving(true)}>Remove {p.name}</button>}
  </article>;
}

/** The professional's own page: sign in, accept the invitation, agree to confidentiality, open what was shared. */
export function ProfessionalPortal({token,demo,client,makeStore}:{token:string;demo:boolean;client:import('@supabase/supabase-js').SupabaseClient|null;makeStore:(email:string)=>ProfessionalStore|null}){
  const SKEY='kalling-professional-v1';
  const [email,setEmail]=useState(()=>{try{return demo?sessionStorage.getItem(SKEY)||'':'';}catch{return '';}}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[home,setHome]=useState<ProHome|null>(null),[open,setOpen]=useState<{name:string;mime:string;bytes:ArrayBuffer}|null>(null),[mode,setMode]=useState<'in'|'up'>('in'),[notice,setNotice]=useState('');
  useEffect(()=>{if(!demo&&client)void client.auth.getUser().then(({data})=>{if(data.user?.email_confirmed_at)setEmail(data.user.email||'');});},[demo,client]);
  const store=useMemo(()=>email?makeStore(email):null,[email,makeStore]);
  const load=useCallback(async()=>{if(!store)return;try{if(token){await store.accept(token).catch(e=>{if(!/was used/.test((e as Error).message))throw e;});history.replaceState(null,'','#/professional');}setHome(await store.home());}catch(e){setError((e as Error).message);setHome([]);}},[store,token]);
  useEffect(()=>{void load();},[load]);
  async function signIn(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget),em=String(d.get('email')).trim().toLowerCase();setError('');setBusy(true);
    try{if(demo){try{sessionStorage.setItem(SKEY,em);}catch{/* private window */}setEmail(em);}
      else{if(!client)throw Error('The online service is unavailable.');const password=String(d.get('password'));
        if(mode==='up'){const {error}=await client.auth.signUp({email:em,password,options:{emailRedirectTo:location.href}});if(error)throw error;setNotice('Check your email and click the confirmation link, then come back to this page and sign in.');setMode('in');return;}
        const {data,error}=await client.auth.signInWithPassword({email:em,password});if(error)throw error;if(!data.user?.email_confirmed_at)throw Error('Confirm your email address first, then sign in.');setEmail(data.user.email||'');}}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  async function view(grantId:string){if(!store)return;setBusy(true);setError('');try{const o=await store.open(grantId);const mime=o.blob.type||'application/pdf',raw=await o.blob.arrayBuffer();setOpen({name:o.name,mime,bytes:mime==='application/pdf'?await (await watermarkPdf(raw,o.watermark)).arrayBuffer():raw});await load();}catch(e){setError((e as Error).message);await load();}finally{setBusy(false);}}
  const signOut=()=>{try{sessionStorage.removeItem(SKEY);}catch{/* ignore */}if(!demo)void client?.auth.signOut();setEmail('');setHome(null);setOpen(null);};
  return <section className="ks-wrap pro-portal">
    <h1>Documents shared with you</h1>
    <p className="pro-lede">For a seller’s or buyer’s own CPA or attorney. You see only what your client chose to share, and your client sees when you open each document.</p>
    {error&&<p className="pro-error" role="alert">{error}</p>}{notice&&<p className="pro-ok" role="status">{notice}</p>}
    {!email?<form className="pro-form pro-signin" onSubmit={e=>void signIn(e)}>
      <label><span>Your email address</span><input name="email" type="email" required autoComplete="email"/></label>
      {!demo&&<label><span>Password{mode==='up'?', at least 12 characters':''}</span><input name="password" type="password" required minLength={mode==='up'?12:undefined} autoComplete={mode==='up'?'new-password':'current-password'}/></label>}
      {demo?<p className="pro-fine">Fictional demo in this browser. No password is needed and nothing is emailed.</p>:<p className="pro-fine">Use the email address your client invited. {mode==='in'?<>First time? <button type="button" className="pro-link-btn" onClick={()=>setMode('up')}>Create your login</button></>:<button type="button" className="pro-link-btn" onClick={()=>setMode('in')}>I already have a login</button>}</p>}
      <button className="pro-btn pro-btn-primary" disabled={busy}>{mode==='up'?'Create login':token?'Sign in and accept the invitation':'Sign in'}</button>
    </form>:<>
      <p className="pro-fine">Signed in as {email}. <button type="button" className="pro-link-btn" onClick={signOut}>Sign out</button></p>
      {home===null?<p className="pro-fine">Loading…</p>:!home.length?<p>No client has invited {email} yet. Ask your client to add you, then open the link they send.</p>:home.map(({professional:p,documents})=><article className="pro-card" key={p.id}>
        <header><div><h3>{p.partyName}</h3><p>You are their {p.role==='CPA'?'CPA':'attorney'} {p.side==='buyer'?'on an acquisition':'on the sale of their business'}.</p></div><span className={'pro-status'+(p.status==='Active'?' on':'')}>{p.status==='Active'?'Access until '+day(p.expiresAt):'Waiting for you to accept'}</span></header>
        {p.status==='Active'&&!p.acknowledgedAt?<form className="pro-ack" onSubmit={e=>{e.preventDefault();if(!store)return;setBusy(true);void store.acknowledge(p.id).then(load).catch(err=>setError(err.message)).finally(()=>setBusy(false));}}>
          <p>Before you open anything: these documents are confidential. Use them only to advise {p.partyName} on this transaction, don’t share them, and don’t contact the other side’s business, staff or customers except through Kalling. Each page carries your name.</p>
          <label className="pro-check"><input type="checkbox" required/>I agree to keep these documents confidential.</label><button className="pro-btn pro-btn-primary" disabled={busy}>Agree and continue</button></form>
        :documents.length?<ul className="pro-shared">{documents.map(d=><li key={d.grantId}><span>{d.name}<small>{d.available?'Shared '+day(d.grantedAt):'No longer available to your client'}</small></span><button type="button" className="pro-btn" disabled={busy||!d.available} onClick={()=>void view(d.grantId)}>Open</button></li>)}</ul>
        :<p className="pro-fine">{p.status==='Active'?'Nothing shared yet. Your client chooses what you see.':'Open the invitation link your client sent to accept.'}</p>}
      </article>)}
      {open&&<div className="pro-viewer" role="dialog" aria-label={open.name}><header><h3>{open.name}</h3><button type="button" className="pro-btn" onClick={()=>setOpen(null)}>Close</button></header><DocPages doc={open}/></div>}
    </>}
  </section>;
}

/** Route wrapper for the public site: picks the demo or hosted store for the signed-in professional. */
export function ProfessionalPage({token}:{token:string}){
  const s=useSession();
  const makeStore=useCallback((email:string)=>s.client?cloudProfessionalStore(s.client):s.demo?localProfessionalStore({pro:{kind:'professional',email,confirmed:true}}):null,[s.client,s.demo]);
  return <ProfessionalPortal token={token} demo={s.demo} client={s.client} makeStore={makeStore}/>;
}
/** The buyer's panel on their account page. */
export function BuyerProfessionals(){
  const s=useSession();
  const store=useMemo(()=>s.client?cloudProfessionalStore(s.client,'buyer'):localProfessionalStore({party:{kind:'buyer',email:s.buyerEmail}}),[s.client,s.buyerEmail]);
  return <PartyProfessionals store={store} side="buyer"/>;
}

/** Renders each page to a canvas, so the watermark is part of every page and no browser PDF plug-in is needed. */
function DocPages({doc}:{doc:{name:string;mime:string;bytes:ArrayBuffer}}){
  const box=useRef<HTMLDivElement>(null),[state,setState]=useState<'loading'|'ready'|'unsupported'|'error'>('loading');
  useEffect(()=>{let live=true;const el=box.current;if(!el)return;el.replaceChildren();
    void (async()=>{try{
      if(/^image\//.test(doc.mime)){const img=document.createElement('img');img.alt=doc.name;img.src=URL.createObjectURL(new Blob([doc.bytes],{type:doc.mime}));el.append(img);setState('ready');return;}
      if(doc.mime!=='application/pdf'){setState('unsupported');return;}
      const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',document.baseURI).href;
      const pdf=await pdfjs.getDocument({data:new Uint8Array(doc.bytes.slice(0))}).promise,dpr=Math.min(2,devicePixelRatio||1);
      for(let n=1;n<=Math.min(pdf.numPages,200)&&live;n++){const pg=await pdf.getPage(n),base=pg.getViewport({scale:1}),fit=Math.min(1.6,(el.clientWidth-16)/base.width),vp=pg.getViewport({scale:fit*dpr}),c=document.createElement('canvas');
        c.width=vp.width;c.height=vp.height;c.style.width=vp.width/dpr+'px';c.setAttribute('aria-label',`Page ${n} of ${pdf.numPages}`);el.append(c);await pg.render({canvasContext:c.getContext('2d')!,viewport:vp,canvas:c} as never).promise;if(n===1&&live)setState('ready');}
    }catch{if(live)setState('error');}})();
    return()=>{live=false;};},[doc]);
  return <div className="pro-pages" ref={box} aria-busy={state==='loading'}>{state==='unsupported'&&<p className="pro-fine">This file type can’t be previewed here. Ask your client for a PDF.</p>}{state==='error'&&<p className="pro-error">This document could not be displayed.</p>}</div>;
}
