import {useContext,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Check,X,Plus,Pencil,ExternalLink,Inbox,Store,Users,Handshake,MessageSquare} from 'lucide-react';
import type {Company} from '../lib/domain';
import {localBrokerStore,type BrokerStore} from '../lib/brokerStore';
import {regions,focuses,publishProblems,anonymousBuyerLabel,type Listing,type Lead,type Buyer,type AccessRequest,type Offer,type Question,type LeadStatus,type ListingStatus,type Region,type Focus,type BrokerDb} from '../lib/brokerage';
import {money} from '../lib/hvacValuation';
import {PortalContextRef} from './OwnerPortalAdmin';
import './brokerage-console.css';

type Data={leads:Lead[];listings:Listing[];buyers:Buyer[];requests:AccessRequest[];offers:Offer[];questions:Question[]};
const site=(path:string)=>location.pathname+'#'+path;
const dt=(s?:string)=>s?new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';

/** Advisor side of the marketplace: leads in, listings out, buyers vetted, offers tracked. */
export default function BrokerageConsole({companies,operator,store:given}:{companies:Company[];operator:string;store?:BrokerStore}){
  const store=useMemo(()=>given||localBrokerStore({kind:'advisor',name:operator,canWrite:true}),[given,operator]);
  const portal=useContext(PortalContextRef);
  const [tab,setTab]=useState('Leads'),[d,setD]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[edit,setEdit]=useState<Listing|'new'|null>(null);
  const load=async()=>{try{const [leads,listings,buyers,requests,offers,questions]=await Promise.all([store.leads(),store.listings(),store.buyers(),store.requests(),store.offers(),store.questions()]);setD({leads,listings,buyers,requests,offers,questions});setError('');}catch(e){setError((e as Error).message);}};
  useEffect(()=>{void load();const t=setInterval(()=>{if(document.visibilityState!=='hidden')void load();},15000);return()=>clearInterval(t);},[store]);// eslint-disable-line react-hooks/exhaustive-deps
  async function act(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  /** Approved buyers and shared offers show up, anonymously, in the owner's portal. */
  async function syncPortal(listing:Listing|undefined,buyer:Buyer|undefined,stage:'Under NDA'|'Offer made'|'Not proceeding'){
    if(!listing?.companyId||!buyer||!portal.store)return;const p=(await portal.store.listForCompany(listing.companyId)).find(x=>x.status!=='Closed');if(!p)return;
    const db={listings:d!.listings,buyers:d!.buyers,access:d!.requests,offers:d!.offers,questions:d!.questions,leads:d!.leads} as BrokerDb;
    const name=anonymousBuyerLabel(db,buyer,listing.id),existing=(await portal.store.load(p.id)).buyers.find(b=>b.name===name);
    await portal.store.saveBuyer(p.id,{id:existing?.id,name,summary:`${buyer.type}. ${buyer.funds} available; plans to pay with ${buyer.financing.join(', ')||'a method to be confirmed'}. Approved by your advisor after signing the NDA.`,stage});
  }
  if(!d)return <section className="panel bk"><p>{error||'Loading brokerage…'}</p></section>;
  const newLeads=d.leads.filter(l=>l.status==='New').length,pending=d.requests.filter(r=>r.status==='Pending').length,openOffers=d.offers.filter(o=>['Submitted','Shared with seller','Countered'].includes(o.status)).length;
  const tabs:[string,typeof Inbox,number][]=[['Leads',Inbox,newLeads],['Listings',Store,0],['Buyers',Users,pending],['Offers',Handshake,openOffers],['Questions',MessageSquare,0]];
  const buyer=(id:string)=>d.buyers.find(b=>b.id===id),listing=(id:string)=>d.listings.find(l=>l.id===id);
  return <section className="bk">
    <div className="page-heading"><div><div className="eyebrow">SELL-SIDE BROKERAGE</div><h1>Brokerage desk</h1><p>Seller inquiries, live listings, buyer approvals and offers for the public marketplace.</p></div><a className="btn" href={site('/')} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Open public site</a></div>
    <div className="bk-stats"><span><strong>{newLeads}</strong>new seller inquiries</span><span><strong>{d.listings.filter(l=>l.status==='Live').length}</strong>live listings</span><span><strong>{pending}</strong>NDA requests to review</span><span><strong>{openOffers}</strong>open offers</span></div>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <nav className="portal-admin-tabs">{tabs.map(([t,I,n])=><button key={t} className={tab===t?'active':''} onClick={()=>{setTab(t);setEdit(null);}}><I size={14}/>{t}{n?<em>{n}</em>:null}</button>)}</nav>

    {tab==='Leads'&&<div className="bk-list">{!d.leads.length&&<p className="portal-empty">No seller inquiries yet. They arrive from the valuation page’s “Get a confidential review” form.</p>}
      {d.leads.map(l=><article key={l.id} className={'bk-card '+(l.status==='New'?'new':'')}><header><div><strong>{l.name}{l.businessName?' · '+l.businessName:''}</strong><small>{l.region} · {l.timing} · {dt(l.createdAt)} · <a href={'mailto:'+l.email}>{l.email}</a>{l.phone?' · '+l.phone:''}</small></div>
        <select aria-label={'Status for '+l.name} value={l.status} disabled={busy} onChange={e=>void act(()=>store.updateLead(l.id,{status:e.target.value as LeadStatus}))}>{['New','Contacted','Qualified','Engaged','Not a fit'].map(s=><option key={s}>{s}</option>)}</select></header>
        {l.valuation&&<p className="bk-val">Estimate {money(l.valuation.low)}–{money(l.valuation.high)} on {money(l.valuation.revenue)} revenue and {money(l.valuation.sde)} earnings</p>}
        {l.message&&<p>“{l.message}”</p>}
        <textarea aria-label={'Notes for '+l.name} rows={2} defaultValue={l.notes} placeholder="Call notes" onBlur={e=>{if(e.target.value!==l.notes)void act(()=>store.updateLead(l.id,{notes:e.target.value}));}}/></article>)}</div>}

    {tab==='Listings'&&(edit?<ListingForm l={edit==='new'?undefined:edit} companies={companies} busy={busy} cancel={()=>setEdit(null)} save={input=>act(async()=>{await store.saveListing(input);setEdit(null);})}/>:<div className="bk-list">
      <div className="button-row"><button className="btn primary" onClick={()=>setEdit('new')}><Plus size={15}/>New listing</button></div>
      {d.listings.map(l=>{const problems=publishProblems(l),reqs=d.requests.filter(r=>r.listingId===l.id);return <article key={l.id} className="bk-card"><header><div><strong>{l.number} · {l.headline||'Untitled draft'}</strong><small>{l.status}{l.sample?' · sample':''} · {l.region} · {money(l.askingPrice)} asking · {reqs.filter(r=>r.status==='Approved').length} approved buyers · {d.offers.filter(o=>o.listingId===l.id).length} offers</small></div>
        <div className="button-row">{!l.sample&&<button className="icon-btn" aria-label={'Edit '+l.number} onClick={()=>setEdit(l)}><Pencil size={14}/></button>}<a className="icon-btn" aria-label={'View '+l.number+' on the public site'} href={site('/listings/'+l.number)} target="_blank" rel="noreferrer"><ExternalLink size={14}/></a>
          <select aria-label={'Status for '+l.number} value={l.status} disabled={busy} onChange={e=>void act(()=>store.setStatus(l.id,e.target.value as ListingStatus))}>{['Draft','Live','Under LOI','Sold','Withdrawn'].map(s=><option key={s}>{s}</option>)}</select></div></header>
        {l.status==='Draft'&&problems.length>0&&<ul className="bk-problems">{problems.map(p=><li key={p}>{p}</li>)}</ul>}</article>;})}</div>)}

    {tab==='Buyers'&&<div className="bk-list">
      {d.requests.filter(r=>r.status==='Pending').map(r=>{const b=buyer(r.buyerId),l=listing(r.listingId);return b&&l?<article key={r.id} className="bk-card new"><header><div><strong>{b.name} wants {l.number}</strong><small>{b.type}{b.company?' · '+b.company:''} · {b.funds} · {b.financing.join(', ')} · NDA signed {dt(r.nda.signedAt)}</small></div></header>
        <p>{b.experience}</p>{r.message&&<p>“{r.message}”</p>}
        <BuyerDecision busy={busy} decide={(status,note)=>act(async()=>{await store.decide(r.id,status,note);if(status==='Approved')await syncPortal(l,b,'Under NDA');})}/></article>:null;})}
      {!d.requests.some(r=>r.status==='Pending')&&<p className="portal-empty">No NDA requests waiting.</p>}
      <h3 className="bk-sub">All buyers</h3>
      {d.buyers.map(b=><article key={b.id} className="bk-card"><header><div><strong>{b.name}</strong><small>{b.email} · {b.type} · {b.funds} · up to {b.maxPrice?money(b.maxPrice):'—'} · {b.regions.join(', ')||'any region'}</small></div>
        <select aria-label={'Status for '+b.name} value={b.status} disabled={busy} onChange={e=>void act(()=>store.vet(b.id,e.target.value as Buyer['status'],b.advisorNote))}><option>Registered</option><option>Verified</option><option>Restricted</option></select></header>
        <small>{d.requests.filter(r=>r.buyerId===b.id).map(r=>`${listing(r.listingId)?.number}: ${r.status}`).join(' · ')||'No requests yet'}</small></article>)}</div>}

    {tab==='Offers'&&<div className="bk-list">{!d.offers.length&&<p className="portal-empty">No offers yet.</p>}
      {d.offers.map(o=>{const b=buyer(o.buyerId),l=listing(o.listingId);return <article key={o.id} className={'bk-card '+(o.status==='Submitted'?'new':'')}><header><div><strong>{money(o.price)} {o.kind.toLowerCase()} for {l?.number} from {b?.name}</strong><small>{money(o.cashAtClose)} at close · {money(o.sellerNote)} seller note · {money(o.earnout)} earnout · {o.financing} · close in {o.closeDays} days · {dt(o.createdAt)}</small></div><b className="bk-status">{o.status}</b></header>
        {o.conditions&&<p>{o.conditions}</p>}
        <OfferDecision o={o} busy={busy} decide={(status,note)=>act(async()=>{await store.setOffer(o.id,status,note);if(status==='Shared with seller')await syncPortal(l,b,'Offer made');})}/></article>;})}</div>}

    {tab==='Questions'&&<div className="bk-list">{!d.questions.length&&<p className="portal-empty">No buyer questions yet.</p>}
      {Object.values(d.questions.reduce<Record<string,Question[]>>((m,q)=>{(m[q.listingId+'|'+q.buyerId]??=[]).push(q);return m;},{})).map(thread=>{const q0=thread[0],l=listing(q0.listingId),b=buyer(q0.buyerId);return <article key={q0.id} className="bk-card"><header><div><strong>{l?.number} · {b?.name}</strong></div></header>
        {thread.map(q=><p key={q.id} className={'bk-q '+q.side}><b>{q.side==='buyer'?b?.name:q.author}:</b> {q.body}</p>)}
        <form className="bk-reply" onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=e.currentTarget,v=String(new FormData(f).get('a'));void act(async()=>{await store.ask(q0.listingId,v,q0.buyerId);f.reset();});}}><input name="a" aria-label="Answer" placeholder="Answer the buyer" required/><button className="btn" disabled={busy}>Send</button></form></article>;})}</div>}
  </section>;
}

function BuyerDecision({busy,decide}:{busy:boolean;decide:(s:'Approved'|'Declined',note:string)=>void}){
  const [note,setNote]=useState('');
  return <div className="portal-review"><input aria-label="Note to the buyer" placeholder="Optional note to the buyer" value={note} onChange={e=>setNote(e.target.value)}/><button className="btn primary" disabled={busy} onClick={()=>decide('Approved',note)}><Check size={14}/>Approve and share details</button><button className="btn" disabled={busy} onClick={()=>decide('Declined',note)}><X size={14}/>Decline</button></div>;
}
function OfferDecision({o,busy,decide}:{o:Offer;busy:boolean;decide:(s:Offer['status'],note:string)=>void}){
  const [note,setNote]=useState(o.advisorNote);if(['Accepted','Declined','Withdrawn'].includes(o.status))return o.advisorNote?<small>{o.advisorNote}</small>:null;
  return <div className="portal-review"><input aria-label="Note to the buyer" placeholder="Note to the buyer" value={note} onChange={e=>setNote(e.target.value)}/>{o.status==='Submitted'&&<button className="btn" disabled={busy} onClick={()=>decide('Shared with seller',note)}>Share with seller</button>}<button className="btn" disabled={busy} onClick={()=>decide('Countered',note)}>Counter</button><button className="btn primary" disabled={busy} onClick={()=>decide('Accepted',note)}>Seller accepts</button><button className="text-link" disabled={busy} onClick={()=>decide('Declined',note)}>Decline</button></div>;
}

function ListingForm({l,companies,busy,save,cancel}:{l?:Listing;companies:Company[];busy:boolean;save:(x:Partial<Listing>&{id?:string})=>void;cancel:()=>void}){
  const [companyId,setCompanyId]=useState(l?.companyId||''),c=companies.find(x=>x.id===companyId);
  const lines=(s:FormDataEntryValue|null)=>String(s||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const n=(s:FormDataEntryValue|null)=>Number(String(s||'').replace(/[^\d.]/g,''))||0;
  return <form key={companyId} className="portal-form bk-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);save({id:l?.id,companyId:companyId||undefined,headline:String(f.get('headline')),region:String(f.get('region')) as Region,focus:String(f.get('focus')) as Focus,askingPrice:n(f.get('askingPrice')),revenue:n(f.get('revenue')),sde:n(f.get('sde')),established:n(f.get('established')),employees:n(f.get('employees')),technicians:n(f.get('technicians')),agreements:n(f.get('agreements')),recurringPct:n(f.get('recurringPct')),residentialPct:n(f.get('residentialPct')),vehicles:n(f.get('vehicles')),realEstate:String(f.get('realEstate')) as Listing['realEstate'],sellerFinancing:f.get('sellerFinancing')==='on',reason:String(f.get('reason')),summary:String(f.get('summary')),highlights:lines(f.get('highlights')),growth:lines(f.get('growth')),confidential:{businessName:String(f.get('businessName')),city:String(f.get('city')),website:String(f.get('website')),details:String(f.get('details'))}});}}>
    <h2>{l?'Edit '+l.number:'New listing'}</h2>
    <label className="field"><span>Workspace company · links the owner portal</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Not linked</option>{companies.filter(x=>!x.sample).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <fieldset><legend>Public teaser · must not identify the business</legend>
      <label className="field"><span>Headline</span><input name="headline" defaultValue={l?.headline} required minLength={12} maxLength={120} placeholder="Residential HVAC service company with 900 maintenance agreements"/></label>
      <div className="portal-form-grid"><label className="field"><span>Region</span><select name="region" defaultValue={l?.region}>{regions.map(r=><option key={r}>{r}</option>)}</select></label><label className="field"><span>Kind of work</span><select name="focus" defaultValue={l?.focus}>{focuses.map(r=><option key={r}>{r}</option>)}</select></label><label className="field"><span>Reason for sale</span><input name="reason" defaultValue={l?.reason} maxLength={300}/></label></div>
      <div className="portal-form-grid">{([['askingPrice','Asking price'],['revenue','Revenue'],['sde','Seller’s discretionary earnings'],['established','Year established'],['employees','Employees'],['technicians','Technicians'],['agreements','Maintenance agreements'],['recurringPct','Service & maintenance %'],['residentialPct','Residential %'],['vehicles','Vehicles']] as const).map(([k,lab])=><label key={k} className="field"><span>{lab}</span><input name={k} inputMode="numeric" defaultValue={l?String(l[k]):''}/></label>)}
        <label className="field"><span>Facility</span><select name="realEstate" defaultValue={l?.realEstate}><option>Leased facility</option><option>Real estate available</option><option>Home-based</option></select></label></div>
      <label className="checkbox"><input type="checkbox" name="sellerFinancing" defaultChecked={l?.sellerFinancing}/>Seller will consider financing</label>
      <label className="field"><span>Summary · 120 characters or more</span><textarea name="summary" rows={4} defaultValue={l?.summary} maxLength={2500}/></label>
      <div className="portal-form-grid"><label className="field"><span>Highlights · one per line, at least three</span><textarea name="highlights" rows={4} defaultValue={l?.highlights.join('\n')}/></label><label className="field"><span>Room to grow · one per line</span><textarea name="growth" rows={4} defaultValue={l?.growth.join('\n')}/></label></div>
    </fieldset>
    <fieldset><legend>Confidential · shown only after an approved NDA</legend>
      <div className="portal-form-grid"><label className="field"><span>Business name</span><input name="businessName" defaultValue={l?.confidential.businessName||c?.name}/></label><label className="field"><span>City</span><input name="city" defaultValue={l?.confidential.city||c?.city}/></label><label className="field"><span>Website</span><input name="website" defaultValue={l?.confidential.website||c?.website}/></label></div>
      <label className="field"><span>Details for approved buyers</span><textarea name="details" rows={4} defaultValue={l?.confidential.details} maxLength={5000} placeholder="Address, owner background, data room link, what’s in the memorandum"/></label>
    </fieldset>
    <div className="button-row"><button className="btn primary" disabled={busy}>Save listing</button><button type="button" className="btn" onClick={cancel}>Cancel</button></div>
    <small>Saved listings stay as drafts. Set the status to Live when the checks pass.</small>
  </form>;
}
export type {BrokerStore};
