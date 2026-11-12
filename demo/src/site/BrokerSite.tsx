import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import '@fontsource-variable/zalando-sans/wght.css';
import '@fontsource/forum/400.css';
import './site.css';
import {localBrokerStore,type BrokerStore} from '../../lib/brokerStore';
import {cloudBrokerStore,brokerageReady} from '../../lib/brokerCloud';
import {CONFIG_KEY,DISCONNECTED_KEY,deviceConnection,clientFor} from '../../lib/cloud';
import type {SupabaseClient} from '@supabase/supabase-js';
import {HomePage,SellPage} from './Pages';
import {ValuePage} from './Valuation';
import {ListingsPage,ListingPage,BuyPage,AccountPage} from './Market';

export type Route={path:string;parts:string[];query:URLSearchParams};
const parse=():Route=>{const raw=location.hash.replace(/^#\/?/,'');const [p,q='']=raw.split('?');const parts=p.split('/').filter(Boolean);return {path:'/'+parts.join('/'),parts,query:new URLSearchParams(q)};};
export const href=(path:string)=>'#'+path;
export function go(path:string){location.hash=path;}
const BUYER_KEY='kalling-buyer-email';
export type Session={store:BrokerStore;buyerEmail:string;signIn:(email:string)=>void;signOut:()=>void;demo:boolean;client:SupabaseClient|null};
const Ctx=createContext<Session|null>(null);
export const useSession=()=>useContext(Ctx)!;
const getEmail=()=>{try{return localStorage.getItem(BUYER_KEY)||'';}catch{return '';}};

export default function BrokerSite(){
  const [route,setRoute]=useState(parse),[buyerEmail,setBuyer]=useState(getEmail);
  useEffect(()=>{const on=()=>{setRoute(parse());window.scrollTo({top:0});};addEventListener('hashchange',on);return()=>removeEventListener('hashchange',on);},[]);
  // Use the live marketplace when the cloud project has the brokerage tables; otherwise a one-browser demo.
  const [client,setClient]=useState<SupabaseClient|null>(null),[checked,setChecked]=useState(false),[cloudEmail,setCloudEmail]=useState('');
  useEffect(()=>{let live=true;void (async()=>{try{const cfg=deviceConnection(localStorage.getItem(CONFIG_KEY),localStorage.getItem(DISCONNECTED_KEY)==='true');if(!cfg)return;const c=await clientFor(cfg);if(!(await brokerageReady(c)))return;const {data}=await c.auth.getUser();if(!live)return;setCloudEmail(data.user?.email_confirmed_at?data.user.email||'':'');c.auth.onAuthStateChange((_e,sess)=>setCloudEmail(sess?.user?.email_confirmed_at?sess.user.email||'':''));setClient(c);}catch{/* demo */}finally{if(live)setChecked(true);}})();return()=>{live=false;};},[]);
  const email=client?cloudEmail:buyerEmail;
  const store=useMemo(()=>client?cloudBrokerStore(client,email?{kind:'buyer',email}:{kind:'public'}):localBrokerStore(email?{kind:'buyer',email}:{kind:'public'}),[client,email]);
  const session:Session={store,buyerEmail:email,demo:!client,client,signIn:e=>{try{localStorage.setItem(BUYER_KEY,e);}catch{/* private mode */}setBuyer(e);},signOut:()=>{if(client){void client.auth.signOut();return;}try{localStorage.removeItem(BUYER_KEY);}catch{/* */}setBuyer('');}};
  const [a,b]=route.parts;
  let page:ReactNode;
  if(!a)page=<HomePage/>;
  else if(a==='sell')page=<SellPage/>;
  else if(a==='value')page=<ValuePage/>;
  else if(a==='listings'&&b)page=<ListingPage id={b}/>;
  else if(a==='listings')page=<ListingsPage route={route}/>;
  else if(a==='buy')page=<BuyPage/>;
  else if(a==='account')page=<AccountPage route={route}/>;
  else page=<section className="ks-wrap ks-notfound"><h1>That page isn’t here.</h1><p><a href={href('/')}>Go to the home page</a> or <a href={href('/listings')}>browse listings</a>.</p></section>;
  useEffect(()=>{document.title=({'':'Kalling: sell or buy an HVAC company in New Jersey and New York',sell:'Sell your HVAC company | Kalling',value:'What is my HVAC company worth? | Kalling',listings:'HVAC companies for sale in NJ and NY | Kalling',buy:'Buy an HVAC company | Kalling',account:'Your buyer account | Kalling'} as Record<string,string>)[a||'']||'Kalling';},[a]);
  return <Ctx.Provider value={session}><div className="ks">
    <a className="ks-skip" href="#ks-main" onClick={e=>{e.preventDefault();document.getElementById('ks-main')?.focus();}}>Skip to content</a>
    {checked&&!client&&<p className="ks-demo-bar">Demo marketplace: listings are samples and anything you enter stays in this browser.</p>}
    <Header active={a||''}/>
    <main id="ks-main" tabIndex={-1}>{page}</main>
    <Footer/>
  </div></Ctx.Provider>;
}

function Header({active}:{active:string}){
  const s=useSession(),[open,setOpen]=useState(false);
  useEffect(()=>setOpen(false),[active]);
  useEffect(()=>{document.body.style.overflow=open?'hidden':'';return()=>{document.body.style.overflow='';};},[open]);
  const links:[string,string][]=[['sell','Sell'],['buy','Buy'],['listings','Listings'],['value','Valuation']];
  return <header className={'ks-header'+(open?' open':'')}><div className="ks-wrap ks-header-row">
    <a className="ks-logo" href={href('/')} aria-label="Kalling home">Kalling</a>
    <nav className="ks-nav" aria-label="Main">{links.map(([p,l])=><a key={p} href={href('/'+p)} aria-current={active===p?'page':undefined}>{l}</a>)}</nav>
    <div className="ks-header-actions">
      <a className="ks-pill ks-pill-line" href={href('/account')} aria-current={active==='account'?'page':undefined}>{s.buyerEmail?'Your account':'Sign in'}</a>
      <a className="ks-pill ks-pill-dark" href={href('/value')}>Value my company<Arrow/></a>
    </div>
    <button className="ks-menu" aria-expanded={open} aria-controls="ks-sheet" onClick={()=>setOpen(!open)}>{open?'Close':'Menu'}<span aria-hidden="true">{open?'×':'+'}</span></button>
  </div>
  <div id="ks-sheet" className="ks-sheet" hidden={!open}>
    <nav aria-label="Main">{[...links,['account',s.buyerEmail?'Your account':'Sign in'] as [string,string]].map(([p,l])=><a key={p} href={href('/'+p)}>{l}</a>)}</nav>
    <a className="ks-pill ks-pill-light" href={href('/value')}>Value my company<Arrow/></a>
  </div></header>;
}
export const Arrow=()=><svg className="ks-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.6"/></svg>;
function Footer(){
  return <footer className="ks-footer"><div className="ks-wrap">
    <div className="ks-footer-grid">
      <p className="ks-footer-lede">A brokerage for heating, cooling and refrigeration companies in New Jersey and New York.</p>
      <div><h2>Owners</h2><a href={href('/sell')}>How selling works</a><a href={href('/value')}>Valuation</a><a href="#owner">Owner portal</a></div>
      <div><h2>Buyers</h2><a href={href('/listings')}>Listings</a><a href={href('/buy')}>How buying works</a><a href={href('/account')}>Buyer account</a></div>
      <div><h2>Kalling</h2><a href="#advisor">Advisor workspace</a></div>
    </div>
    <p className="ks-wordmark" aria-hidden="true">Kalling</p>
    <div className="ks-legal"><p>Listings marked “Sample” are fictional and shown to demonstrate the marketplace. Valuation estimates are not appraisals. Kalling does not provide legal, tax or lending advice.</p><p>© {new Date().getFullYear()} Kalling</p></div>
  </div></footer>;
}
export function useAsync<T>(fn:()=>Promise<T>,deps:unknown[]){
  const [state,setState]=useState<{data?:T;error?:string;loading:boolean}>({loading:true});
  const [n,setN]=useState(0);
  useEffect(()=>{let live=true;setState(s=>({...s,loading:true}));fn().then(data=>{if(live)setState({data,loading:false});}).catch(e=>{if(live)setState({error:e instanceof Error?e.message:'Something went wrong.',loading:false});});return()=>{live=false;};},[...deps,n]);// eslint-disable-line react-hooks/exhaustive-deps
  return {...state,reload:()=>setN(x=>x+1)};
}
