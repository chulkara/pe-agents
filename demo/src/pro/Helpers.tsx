import {useCallback,useEffect,useState,type FormEvent} from 'react';
import type {HelperStore,OwnerHelperView} from '../../lib/helperStore';
import type {DocRequest} from '../../lib/portal';
import './pro.css';

const day=(s:string)=>new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const helperLink=(token:string)=>location.origin+location.pathname+'#helper?token='+token;

/** The owner's control of staff helpers: who they are, which requests they work on, and what waits for approval. */
export function OwnerHelpers({store,portalId,requests,refresh}:{store:HelperStore;portalId:string;requests:DocRequest[];refresh:()=>void}){
  const [list,setList]=useState<OwnerHelperView[]|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState('');
  const load=useCallback(async()=>{try{setList(await store.list(portalId));}catch(e){setError((e as Error).message);setList([]);}},[store,portalId]);
  useEffect(()=>{void load();},[load]);
  async function run(fn:()=>Promise<void>,msg:string,reloadPortal=false){setBusy(true);setError('');setNotice('');try{await fn();await load();if(reloadPortal)refresh();setNotice(msg);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const open=requests.filter(r=>!['Accepted','Not applicable'].includes(r.status));
  const waiting=(list||[]).reduce((n,v)=>n+v.uploads.filter(u=>u.status==='Waiting for owner').length,0);
  return <section className="pro-panel" aria-labelledby="helpers-h">
    <h2 id="helpers-h">Someone on your staff helping{waiting?<span className="pro-count">{waiting} waiting for you</span>:null}</h2>
    <p className="pro-lede">An office manager or bookkeeper can gather records for you. They see only the requests you give them, by title and description. They don’t see buyers, offers, prices, messages or who has viewed what. Nothing they upload reaches Kalling until you approve it.</p>
    <p className="pro-fine">Their page carries the Kalling name. If your staff don’t know about the sale yet, think about who you add.</p>
    {error&&<p className="pro-error" role="alert">{error}</p>}{notice&&<p className="pro-ok" role="status">{notice}</p>}
    {link&&<div className="pro-link"><p>Invitation link. It works once, for the email address you entered.</p><code>{link}</code><button type="button" className="pro-btn" onClick={()=>void navigator.clipboard?.writeText(link).then(()=>setNotice('Link copied.'))}>Copy link</button></div>}
    {list===null?<p className="pro-fine">Loading…</p>:list.map(v=><HelperCard key={v.helper.id+v.helper.requestIds.join()} v={v} store={store} open={open} busy={busy} run={run} showLink={t=>setLink(helperLink(t))}/>)}
    <details className="pro-add"><summary>Add someone from your staff</summary>
      <form className="pro-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),form=e.currentTarget;void run(async()=>{const t=await store.add(portalId,{name:String(f.get('name')),email:String(f.get('email')),days:Number(f.get('days'))});form.reset();setLink(helperLink(t));},'Added. Send them the invitation link, then choose which requests they work on. Kalling does not email it for you.');}}>
        <label><span>Their name</span><input name="name" required maxLength={120} autoComplete="off"/></label>
        <label><span>Their email</span><input name="email" type="email" required autoComplete="off"/></label>
        <label><span>Access lasts</span><select name="days" defaultValue="90"><option value="30">30 days</option><option value="90">90 days</option><option value="180">6 months</option><option value="365">1 year</option></select></label>
        <button className="pro-btn pro-btn-primary" disabled={busy}>Add and create invitation</button>
      </form></details>
  </section>;
}

function HelperCard({v,store,open,busy,run,showLink}:{v:OwnerHelperView;store:HelperStore;open:DocRequest[];busy:boolean;run:(fn:()=>Promise<void>,msg:string,reloadPortal?:boolean)=>Promise<void>;showLink:(t:string)=>void}){
  const h=v.helper,[pick,setPick]=useState(new Set(h.requestIds)),[removing,setRemoving]=useState(false),[notes,setNotes]=useState<Record<string,string>>({});
  const waiting=v.uploads.filter(u=>u.status==='Waiting for owner'),past=v.uploads.filter(u=>u.status!=='Waiting for owner');
  const changed=pick.size!==h.requestIds.length||[...pick].some(id=>!h.requestIds.includes(id));
  // Opening a file the helper sent; an error appears in the panel's message area.
  const preview=(id:string)=>run(async()=>{const b=await store.preview(id);const url=URL.createObjectURL(b);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);},'Opened in a new tab.');
  return <article className="pro-card">
    <header><div><h3>{h.name}</h3><p>{h.email}</p></div><span className={'pro-status'+(h.status==='Active'&&!v.expired?' on':'')}>{v.expired?'Access expired':h.status==='Invited'?'Invitation not yet accepted':'Active until '+day(h.expiresAt)}</span></header>
    {v.token&&<button type="button" className="pro-link-btn" onClick={()=>showLink(v.token!)}>Show invitation link</button>}
    {waiting.length>0&&<><h4>Waiting for you</h4><ul className="pro-shared">{waiting.map(u=><li key={u.id} className="pro-wait"><span>{u.name}<small>For “{u.requestTitle}”, sent {day(u.createdAt)}{u.note?'. Note: '+u.note:''}</small></span>
      <div className="pro-actions"><button type="button" className="pro-btn" onClick={()=>void preview(u.id)}>Open</button>
        <button type="button" className="pro-btn pro-btn-primary" disabled={busy} onClick={()=>void run(()=>store.decide(u.id,'Approved'),'Approved. “'+u.name+'” is now attached to “'+u.requestTitle+'”.',true)}>Approve</button>
        <input aria-label={'Reason for sending back '+u.name} placeholder="Reason, optional" value={notes[u.id]||''} onChange={e=>setNotes(n=>({...n,[u.id]:e.target.value}))} maxLength={600}/>
        <button type="button" className="pro-link-btn" disabled={busy} onClick={()=>void run(()=>store.decide(u.id,'Declined',notes[u.id]||''),'Sent back to '+h.name+'.')}>Send back</button></div></li>)}</ul></>}
    {!v.expired&&h.status!=='Removed'&&<details className="pro-share" open={!h.requestIds.length}><summary>Requests {h.name} works on ({h.requestIds.length})</summary>
      <form onSubmit={e=>{e.preventDefault();void run(()=>store.assign(h.id,[...pick]),'Saved. '+h.name+' sees '+pick.size+' request'+(pick.size===1?'':'s')+'.');}}>
        {open.length?<fieldset><legend>They see each request’s title and description only.</legend>{open.map(r=><label key={r.id} className="pro-check"><input type="checkbox" checked={pick.has(r.id)} onChange={e=>setPick(s=>{const n=new Set(s);if(e.target.checked)n.add(r.id);else n.delete(r.id);return n;})}/><span>{r.title}<small className="pro-sub">{r.needed}</small></span></label>)}</fieldset>:<p className="pro-fine">No open requests right now.</p>}
        <button className="pro-btn pro-btn-primary" disabled={busy||!changed}>Save</button>
      </form></details>}
    {past.length>0&&<details className="pro-log"><summary>History ({past.length})</summary><ul>{past.map(u=><li key={u.id}>{u.status==='Approved'?'Approved':u.status==='Declined'?'Sent back':'Withdrawn'}: {u.name}, for “{u.requestTitle}”<small>{u.decidedAt?new Date(u.decidedAt).toLocaleString():''}{u.ownerNote?'. '+u.ownerNote:''}</small></li>)}</ul></details>}
    {removing?<p className="pro-confirm-remove">Remove {h.name}? Their access ends now and files still waiting are discarded. <button type="button" className="pro-btn" disabled={busy} onClick={()=>void run(()=>store.remove(h.id),h.name+' removed.')}>Remove</button> <button type="button" className="pro-link-btn" onClick={()=>setRemoving(false)}>Keep</button></p>
    :<button type="button" className="pro-link-btn pro-remove" disabled={busy} onClick={()=>setRemoving(true)}>Remove {h.name}</button>}
  </article>;
}
