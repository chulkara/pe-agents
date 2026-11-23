import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {Lock,LogOut} from 'lucide-react';
import {CONFIG_KEY,DISCONNECTED_KEY,deviceConnection,clientFor} from '../../lib/cloud';
import {LOCAL_PORTAL_KEY} from '../../lib/portalStore';
import {localHelperStore,cloudHelperStore,type HelperHome,type HelperStore} from '../../lib/helperStore';
import '../portal.css';
import './pro.css';

const day=(s:string)=>new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const SKEY='kalling-helper-v1';
const ss={get:()=>{try{return sessionStorage.getItem(SKEY)||'';}catch{return '';}},set:(v:string)=>{try{v?sessionStorage.setItem(SKEY,v):sessionStorage.removeItem(SKEY);}catch{/* private window */}}};
const tokenFromHash=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('token')||'';
// The browser demo is used only for a demo invitation, a demo helper already signed in on this tab,
// or a device with no hosted project. Having opened the demo before never sends a real helper there.
const isDemo=()=>{try{
  const t=tokenFromHash(),local=JSON.parse(localStorage.getItem(LOCAL_PORTAL_KEY)||'null') as {helperInvites?:{token:string}[]}|null;
  if(t)return !!local?.helperInvites?.some(i=>i.token===t);
  if(ss.get()&&local)return true;
  return !deviceConnection(localStorage.getItem(CONFIG_KEY),localStorage.getItem(DISCONNECTED_KEY)==='true');}catch{return true;}};

/** A staff member's page: the records the owner asked them to gather, and nothing else. */
export default function HelperApp(){
  const [token]=useState(tokenFromHash),demo=useMemo(isDemo,[]);
  const [client,setClient]=useState<SupabaseClient|null>(null),[email,setEmail]=useState(()=>demo?ss.get():''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[home,setHome]=useState<HelperHome|null>(null),[mode,setMode]=useState<'in'|'up'>('in');
  useEffect(()=>{if(demo)return;try{const cfg=deviceConnection(localStorage.getItem(CONFIG_KEY),localStorage.getItem(DISCONNECTED_KEY)==='true');if(!cfg)return;void clientFor(cfg).then(async c=>{setClient(c);const {data}=await c.auth.getUser();if(data.user?.email_confirmed_at)setEmail(data.user.email||'');});}catch(e){setError((e as Error).message);}},[demo]);
  const store=useMemo<HelperStore|null>(()=>!email?null:demo?localHelperStore({helper:{email,confirmed:true}}):client?cloudHelperStore(client):null,[email,demo,client]);
  const load=useCallback(async()=>{if(!store)return;try{if(token){await store.accept(token).catch(e=>{if(!/was used/.test((e as Error).message))throw e;});history.replaceState(null,'','#helper');}setHome(await store.home());}catch(e){setError((e as Error).message);setHome([]);}},[store,token]);
  useEffect(()=>{void load();},[load]);
  async function signIn(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget),em=String(d.get('email')).trim().toLowerCase(),password=String(d.get('password')||'');setBusy(true);setError('');setNotice('');
    try{if(demo){ss.set(em);setEmail(em);return;}if(!client)throw Error('This page is not available on this device.');
      if(mode==='up'){const {error}=await client.auth.signUp({email:em,password,options:{emailRedirectTo:location.href}});if(error)throw error;setNotice('Check your email and click the confirmation link, then come back here and sign in.');setMode('in');return;}
      const {data,error}=await client.auth.signInWithPassword({email:em,password});if(error)throw error;if(!data.user?.email_confirmed_at)throw Error('Confirm your email address first, then sign in.');setEmail(data.user.email||'');}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  async function run(fn:()=>Promise<void>,msg:string){setBusy(true);setError('');setNotice('');try{await fn();await load();setNotice(msg);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const signOut=()=>{ss.set('');if(!demo)void client?.auth.signOut();setEmail('');setHome(null);};
  return <div className="portal-page"><header className="portal-topbar"><span className="portal-brand">kalling<span>.</span></span><span className="portal-secure"><Lock size={13}/>Private document request</span>{email&&<button className="text-link" onClick={signOut}><LogOut size={14}/>Sign out</button>}</header>
    <section className="pro-portal pro-helper">
      <h1>Records to gather</h1>
      {error&&<p className="pro-error" role="alert">{error}</p>}{notice&&<p className="pro-ok" role="status">{notice}</p>}
      {!email?<form className="pro-form pro-signin" onSubmit={e=>void signIn(e)}>
        <p className="pro-lede">Sign in with the email address your employer used to invite you.</p>
        <label><span>Your email address</span><input name="email" type="email" required autoComplete="email"/></label>
        {!demo&&<label><span>Password{mode==='up'?', at least 12 characters':''}</span><input name="password" type="password" required minLength={mode==='up'?12:undefined} autoComplete={mode==='up'?'new-password':'current-password'}/></label>}
        {demo?<p className="pro-fine">Fictional demo in this browser. No password is needed and nothing is emailed.</p>:<p className="pro-fine">{mode==='in'?<>First time? <button type="button" className="pro-link-btn" onClick={()=>setMode('up')}>Create your login</button></>:<button type="button" className="pro-link-btn" onClick={()=>setMode('in')}>I already have a login</button>}</p>}
        <button className="pro-btn pro-btn-primary" disabled={busy||(!demo&&!client)}>{mode==='up'?'Create login':token?'Sign in and accept':'Sign in'}</button>
      </form>:home===null?<p className="pro-fine">Loading…</p>:!home.length?<p>No one has invited {email} yet. Ask the person who asked for your help to send you a new link.</p>
      :home.map(h=><article className="pro-card" key={h.helper.id}>
        <header><div><h3>{h.businessName}</h3><p>{h.ownerName} asked you to gather these records. Files you send go to {h.ownerName} first.</p></div><span className={'pro-status'+(h.expired?'':' on')}>{h.expired?'Access ended':'Until '+day(h.helper.expiresAt)}</span></header>
        {h.expired?<p className="pro-fine">Your access has ended. Ask {h.ownerName} to add you again if there is more to do.</p>:!h.requests.length?<p className="pro-fine">Nothing assigned to you right now.</p>
        :h.requests.map(r=><section className="pro-request" key={r.id}>
          <h4>{r.title}</h4><p>{r.needed}</p>{r.due&&<p className="pro-fine">Needed by {day(r.due+'T12:00:00')}</p>}
          {r.uploads.length>0&&<ul className="pro-shared">{r.uploads.map(u=><li key={u.id}><span>{u.name}<small>{u.status==='Waiting for owner'?'Waiting for '+h.ownerName:u.status==='Declined'?'Sent back'+(u.ownerNote?': '+u.ownerNote:''):u.status}, {day(u.createdAt)}</small></span>{u.status==='Waiting for owner'&&<button type="button" className="pro-link-btn" disabled={busy} onClick={()=>void run(()=>store!.withdraw(u.id),'Withdrawn.')}>Withdraw</button>}</li>)}</ul>}
          {r.complete?<p className="pro-fine">This request is complete.</p>:<form className="pro-upload" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),form=e.currentTarget,file=f.get('file') as File;if(!file?.size)return;void run(async()=>{await store!.upload(h.helper.id,r.id,file,String(f.get('note')||''));form.reset();},'Sent to '+h.ownerName+' for approval.');}}>
            <label><span>File</span><input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xls,.xlsx,.doc,.docx"/></label>
            <label><span>Note for {h.ownerName}, optional</span><input name="note" maxLength={600} placeholder="e.g. exported from QuickBooks"/></label>
            <button className="pro-btn pro-btn-primary" disabled={busy}>Send to {h.ownerName}</button>
            <p className="pro-fine">Remove Social Security numbers, full bank account numbers and passwords first. PDF, image, Word, Excel, CSV or text, up to 10 MB.</p>
          </form>}
        </section>)}
      </article>)}
    </section></div>;
}
