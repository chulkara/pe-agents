import {useEffect,useMemo,useState,type FormEvent} from 'react';
import type {SupabaseClient,User} from '@supabase/supabase-js';
import {Loader2,Lock,LogOut} from 'lucide-react';
import {CONFIG_KEY,DISCONNECTED_KEY,deviceConnection,clientFor} from '../lib/cloud';
import {LOCAL_PORTAL_KEY,inviteTokenFromHash,localPortalStore,type PortalStore} from '../lib/portalStore';
import {cloudPortalStore,acceptPortalInvite} from '../lib/portalCloud';
import type {Portal,PortalDb} from '../lib/portal';
import SellerPortal from './SellerPortal';
import './portal.css';

const TOKEN_KEY='kalling-portal-invite',LOCAL_OWNER='kalling-portal-local-owner';
const ss={get:(k:string)=>{try{return sessionStorage.getItem(k)||'';}catch{return '';}},set:(k:string,v:string)=>{try{v?sessionStorage.setItem(k,v):sessionStorage.removeItem(k);}catch{/* private mode */}}};
function localDb():PortalDb|null{try{return JSON.parse(localStorage.getItem(LOCAL_PORTAL_KEY)||'null');}catch{return null;}}
const isLocalToken=(t:string)=>!!localDb()?.invites?.some(i=>i.token===t);

/** Entry for invited business owners: a plain sign-in, then only their own portal. */
export default function OwnerPortalApp(){
  const [token]=useState(()=>{const t=inviteTokenFromHash(location.hash)||ss.get(TOKEN_KEY);if(t)ss.set(TOKEN_KEY,t);return t;});
  const local=token?isLocalToken(token):!!ss.get(LOCAL_OWNER);
  useEffect(()=>{if(location.hash.includes('portal='))history.replaceState(null,'',location.pathname+'#owner');},[]);
  return local?<LocalOwner token={token}/>:<CloudOwner token={token}/>;
}
function Frame({children,signOut}:{children:React.ReactNode;signOut?:()=>void}){
  return <div className="portal-page"><header className="portal-topbar"><span className="portal-brand">kalling<span>.</span></span><span className="portal-secure"><Lock size={13}/>Private owner portal</span>{signOut&&<button className="text-link" onClick={signOut}><LogOut size={14}/>Sign out</button>}</header>{children}</div>;
}
function Picker({portals,open}:{portals:Portal[];open:(id:string)=>void}){return <div className="portal-gate"><h1>Choose a business</h1>{portals.map(p=><button key={p.id} className="portal-pick" onClick={()=>open(p.id)}><strong>{p.businessName}</strong><small>with {p.firmName}</small></button>)}</div>;}

function LocalOwner({token}:{token:string}){
  const [email,setEmail]=useState(ss.get(LOCAL_OWNER)),[error,setError]=useState(''),[portalId,setPortalId]=useState(''),[portals,setPortals]=useState<Portal[]|null>(null);
  const store=useMemo(()=>email?localPortalStore({actor:{side:'seller',name:'Owner',email},firmId:'local-demo',firmName:'',team:[]}):null,[email]);
  useEffect(()=>{if(!store)return;void (async()=>{try{if(token){const id=await (store as ReturnType<typeof localPortalStore>).acceptInvite(email,token);ss.set(TOKEN_KEY,'');setPortalId(id);}const list=await store.myPortals();setPortals(list);if(list.length===1)setPortalId(list[0].id);}catch(e){setError((e as Error).message);ss.set(LOCAL_OWNER,'');setEmail('');}})();},[store]);// eslint-disable-line react-hooks/exhaustive-deps
  const team=useMemo(()=>{const p=localDb()?.portals.find(x=>x.id===portalId);return p?localPortalStore({actor:{side:'seller',name:p.ownerName,email},firmId:p.firmId,firmName:p.firmName,team:[p.help.name+' (this browser)']}):null;},[portalId,email]);
  if(!email)return <Frame><form className="portal-gate" onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const v=String(new FormData(e.currentTarget).get('email')).trim().toLowerCase();ss.set(LOCAL_OWNER,v);setError('');setEmail(v);}}>
    <h1>Welcome.</h1><p>You’ve been invited to a private portal for your business. Enter the email address the invitation was sent to.</p>
    <p className="portal-demo-note">Local demo: records stay in this browser and no password is needed. A real portal asks you to sign in.</p>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <label className="field"><span>Your email address</span><input name="email" type="email" required autoComplete="email" autoFocus/></label><button className="btn primary">Open my portal</button></form></Frame>;
  const signOut=()=>{ss.set(LOCAL_OWNER,'');setEmail('');setPortalId('');};
  if(portalId&&team)return <Frame signOut={signOut}><SellerPortal store={team as PortalStore} portalId={portalId}/></Frame>;
  return <Frame signOut={signOut}>{portals&&!portals.length?<div className="portal-gate"><h1>No portal yet</h1><p>There’s no active portal for {email}. Use the invitation link you received, or ask your contact for a new one.</p></div>:portals?<Picker portals={portals} open={setPortalId}/>:<div className="portal-gate"><Loader2 className="spin"/></div>}</Frame>;
}

function CloudOwner({token}:{token:string}){
  const [client,setClient]=useState<SupabaseClient|null>(null),[user,setUser]=useState<User|null>(null),[checked,setChecked]=useState(false),[mode,setMode]=useState<'in'|'up'>('in'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[portals,setPortals]=useState<Portal[]|null>(null),[portalId,setPortalId]=useState('');
  useEffect(()=>{try{const cfg=deviceConnection(localStorage.getItem(CONFIG_KEY),localStorage.getItem(DISCONNECTED_KEY)==='true');if(!cfg){setError('This portal is not available on this device.');setChecked(true);return;}void clientFor(cfg).then(async c=>{setClient(c);const {data}=await c.auth.getUser();setUser(data.user||null);setChecked(true);c.auth.onAuthStateChange((_e,s)=>setUser(s?.user||null));}).catch(e=>{setError(e.message);setChecked(true);});}catch{setError('Saved connection settings are invalid.');setChecked(true);}},[]);
  const store=useMemo(()=>client&&user?cloudPortalStore(client,{side:'seller'}):null,[client,user]);
  useEffect(()=>{if(!store||!client)return;void (async()=>{try{const t=ss.get(TOKEN_KEY);if(t){const id=await acceptPortalInvite(client,t);ss.set(TOKEN_KEY,'');setPortalId(id);}const list=await store.myPortals();setPortals(list);if(list.length===1)setPortalId(list[0].id);}catch(e){setError((e as Error).message);setPortals([]);}})();},[store]);// eslint-disable-line react-hooks/exhaustive-deps
  async function auth(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!client)return;const d=new FormData(e.currentTarget),email=String(d.get('email')),password=String(d.get('password'));setBusy(true);setError('');setNotice('');
    try{if(mode==='up'){const {error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname+'#owner'}});if(error)throw error;setNotice('Check your email and click the confirmation link. Then come back here and sign in. This device remembers your invitation.');}
      else{const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;}}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  const signOut=()=>{void client?.auth.signOut();setPortals(null);setPortalId('');};
  if(!checked)return <Frame><div className="portal-gate"><Loader2 className="spin"/></div></Frame>;
  if(!user)return <Frame><form className="portal-gate" onSubmit={auth}>
    <h1>{token?'You’re invited.':'Welcome back.'}</h1><p>{token?'This is a private portal for your business. Sign in, or create an account, with the email address the invitation was sent to.':'Sign in to open your business’s portal.'}</p>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p className="studio-notice" role="status">{notice}</p>}
    <label className="field"><span>Email address</span><input name="email" type="email" required autoComplete="email"/></label>
    <label className="field"><span>Password{mode==='up'?' · at least 12 characters':''}</span><input name="password" type="password" required minLength={12} autoComplete={mode==='up'?'new-password':'current-password'}/></label>
    <button className="btn primary" disabled={busy||!client}>{mode==='up'?'Create account':'Sign in'}</button>
    <button type="button" className="text-link" onClick={()=>setMode(mode==='up'?'in':'up')}>{mode==='up'?'I already have an account':'First time here? Create an account'}</button></form></Frame>;
  if(portalId&&store)return <Frame signOut={signOut}><SellerPortal store={store} portalId={portalId}/></Frame>;
  return <Frame signOut={signOut}><div className="portal-gate">{error&&<p className="error-banner" role="alert">{error}</p>}{portals===null?<Loader2 className="spin"/>:portals.length?<Picker portals={portals} open={setPortalId}/>:<><h1>No portal yet</h1><p>There’s no active portal for {user.email}. Open the invitation link you received while signed in with that address, or ask your contact for a new link.</p></>}</div></Frame>;
}
