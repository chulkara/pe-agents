import {ExecutionWorkspace} from '../execution/ExecutionWorkspace';
import {useEffect,useState,type FormEvent} from 'react';
import {money} from '../../lib/hvacValuation';
import {ndaText,regions,focuses,buyerTypes,fundBands,filterListings,regionState,type ListingFilter,type Region,type Focus,type BuyerType,type Funds} from '../../lib/brokerage';
import type {ViewListing} from '../../lib/brokerStore';
import {href,go,useAsync,useSession,Arrow,type Route} from './BrokerSite';
import {BuyerDataRoom,OpenedHistory} from './DataRoom';
import {TermsEditor,BuyerOffers} from '../buyer/Offers';
import {verificationBadge} from '../../lib/buyerVerification';
import {BuyerLenderPreparation} from '../buyer/LenderPreparation';
import {BuyerAlerts} from '../buyer/Alerts';
import {BuyerVerification} from '../buyer/Verification';

/** Listing card: where and what, then the asking price as the headline number. */
export function Nameplate({l}:{l:ViewListing}){
  return <a className={'ks-plate'+(l.status==='Sold'?' sold':'')} href={href('/listings/'+l.number)}>
    <div className="ks-plate-top"><span>{l.region}, {regionState(l.region)}</span>{l.sample&&<span className="ks-tag">Sample</span>}{l.status!=='Live'&&<span className="ks-tag ks-tag-dark">{l.status}</span>}</div>
    <h3>{l.headline}</h3>
    <p className="ks-plate-price">{money(l.askingPrice)}<span>asking</span></p>
    <dl className="ks-plate-data">
      <div><dt>Revenue</dt><dd>{money(l.revenue)}</dd></div>
      <div><dt>Earnings</dt><dd>{money(l.sde)}</dd></div>
      <div><dt>Agreements</dt><dd>{l.agreements.toLocaleString()}</dd></div>
    </dl>
    <p className="ks-plate-foot"><span>{l.number} · {l.focus}</span><Arrow/></p>
  </a>;
}

export function ListingsPage({route}:{route:Route}){
  const {store}=useSession();const res=useAsync(()=>store.listings(),[store]);
  const q=route.query;const [f,setF]=useState<ListingFilter>({q:q.get('q')||'',state:(q.get('state') as 'NJ'|'NY')||'',region:(q.get('region') as Region)||'',focus:(q.get('focus') as Focus)||'',maxPrice:Number(q.get('max'))||0,recurringOnly:q.get('recurring')==='1',sort:(q.get('sort') as ListingFilter['sort'])||'newest'});
  useEffect(()=>{const p=new URLSearchParams();if(f.q)p.set('q',f.q);if(f.state)p.set('state',f.state);if(f.region)p.set('region',f.region);if(f.focus)p.set('focus',f.focus);if(f.maxPrice)p.set('max',String(f.maxPrice));if(f.recurringOnly)p.set('recurring','1');if(f.sort&&f.sort!=='newest')p.set('sort',f.sort);history.replaceState(null,'','#/listings'+(p.size?'?'+p:''));},[f]);
  const list=filterListings(res.data||[],f),open=list.filter(l=>l.status!=='Sold'),sold=list.filter(l=>l.status==='Sold');
  return <>
    <section className="ks-wrap ks-page-head"><h1 className="ks-display ks-display-s">HVAC companies for sale</h1><p>Every listing is anonymous. Create a buyer profile and sign a listing’s NDA to request the company name, financials and documents.</p></section>
    <div className="ks-wrap ks-market">
      <form className="ks-filters" onSubmit={e=>e.preventDefault()} aria-label="Filter listings">
        <label className="ks-field"><span>Search</span><input type="search" value={f.q} onChange={e=>setF({...f,q:e.target.value})} placeholder="Refrigeration, Long Island…"/></label>
        <fieldset className="ks-seg"><legend>State</legend>{(['','NJ','NY'] as const).map(s=><label key={s||'all'}><input type="radio" name="state" checked={f.state===s} onChange={()=>setF({...f,state:s,region:''})}/>{s||'Both'}</label>)}</fieldset>
        <label className="ks-field"><span>Region</span><select value={f.region} onChange={e=>setF({...f,region:e.target.value as Region})}><option value="">Any region</option>{regions.filter(r=>!f.state||regionState(r)===f.state).map(r=><option key={r}>{r}</option>)}</select></label>
        <label className="ks-field"><span>Kind of work</span><select value={f.focus} onChange={e=>setF({...f,focus:e.target.value as Focus})}><option value="">Any</option>{focuses.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="ks-field"><span>Asking price up to</span><select value={f.maxPrice} onChange={e=>setF({...f,maxPrice:+e.target.value})}><option value={0}>Any price</option>{[750000,1500000,3000000,5000000].map(n=><option key={n} value={n}>{money(n)}</option>)}</select></label>
        <label className="ks-check"><input type="checkbox" checked={!!f.recurringOnly} onChange={e=>setF({...f,recurringOnly:e.target.checked})}/>Half or more from service and maintenance</label>
        <label className="ks-field"><span>Sort</span><select value={f.sort} onChange={e=>setF({...f,sort:e.target.value as ListingFilter['sort']})}><option value="newest">Newest</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="sde-desc">Earnings, high to low</option></select></label>
      </form>
      <div>
        <p className="ks-count" aria-live="polite">{res.loading?'Loading listings…':`${open.length} ${open.length===1?'company':'companies'} for sale`}</p>
        {res.error&&<p className="ks-error">{res.error}</p>}
        <div className="ks-plates">{open.map(l=><Nameplate key={l.id} l={l}/>)}</div>
        {!res.loading&&!open.length&&<div className="ks-empty"><p>No listings match. Widen the price or region, or create a buyer profile and we’ll tell you when one does.</p><a className="ks-btn" href={href('/account?next=profile')}>Get listing alerts</a></div>}
        {sold.length>0&&<><h2 className="ks-sold-head">Recently sold</h2><div className="ks-plates">{sold.map(l=><Nameplate key={l.id} l={l}/>)}</div></>}
      </div>
    </div>
  </>;
}

export function ListingPage({id}:{id:string}){
  const s=useSession();const res=useAsync(()=>Promise.all([s.store.listing(id),s.store.me(),s.store.questions()]),[s.store,id]);const stories=useAsync(()=>s.store.execution.publicCases(),[s.store]);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[showNda,setShowNda]=useState(false);
  if(res.error)return <section className="ks-wrap ks-page-head"><h1>Listing not available</h1><p>{res.error}</p><a className="ks-btn" href={href('/listings')}>Browse listings</a></section>;
  if(!res.data)return <section className="ks-wrap ks-page-head"><p>Loading…</p></section>;
  const [l,me,qs]=res.data,saved=me?.buyer.saved.includes(l.id),approved=l.access==='Approved'&&!!l.confidential.businessName,mult=(l.askingPrice/l.sde).toFixed(1);
  const offers=me?.offers.filter(o=>o.listingId===l.id)||[],questions=qs.filter(q=>q.listingId===l.id);
  async function act(fn:()=>Promise<void>,msg=''){setBusy(true);setError('');setNotice('');try{await fn();res.reload();if(msg)setNotice(msg);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <article className="ks-listing">
    <section className="ks-wrap ks-listing-head">
      <a className="ks-back" href={href('/listings')}>All listings</a>
      <div className="ks-listing-title"><p>Listing {l.number} · {l.region}, {regionState(l.region)}{l.sample?' · Sample listing (fictional)':''}</p><h1>{l.headline}</h1><p className="ks-listing-sub">{l.focus} · established {l.established} · {l.reason}</p></div>
      <dl className="ks-listing-numbers"><div><dt>Asking price</dt><dd>{money(l.askingPrice)}</dd></div><div><dt>Revenue</dt><dd>{money(l.revenue)}</dd></div><div><dt>Seller’s discretionary earnings</dt><dd>{money(l.sde)}</dd></div><div><dt>Price to earnings</dt><dd>{mult}×</dd></div></dl>
    </section>
    <div className="ks-wrap ks-listing-grid">
      <div className="ks-listing-main">
        {l.status!=='Live'&&<p className="ks-note">{l.status==='Sold'?'This company has been sold.':'This company has accepted a letter of intent. Backup offers may still be considered.'}</p>}
        <h2>About the company</h2><p className="ks-prose">{l.summary}</p>
        <h2>Highlights</h2><ul className="ks-checklist">{l.highlights.map(h=><li key={h}>{h}</li>)}</ul>
        {l.growth.length>0&&<><h2>Room to grow</h2><ul className="ks-checklist">{l.growth.map(h=><li key={h}>{h}</li>)}</ul></>}
        <h2>Operations</h2>
        <dl className="ks-specs"><div><dt>Employees</dt><dd>{l.employees}</dd></div><div><dt>Field technicians</dt><dd>{l.technicians}</dd></div><div><dt>Maintenance agreements</dt><dd>{l.agreements.toLocaleString()}</dd></div><div><dt>Service and maintenance revenue</dt><dd>{l.recurringPct}%</dd></div><div><dt>Residential share</dt><dd>{l.residentialPct}%</dd></div><div><dt>Service vehicles</dt><dd>{l.vehicles}</dd></div><div><dt>Facility</dt><dd>{l.realEstate}</dd></div><div><dt>Seller financing</dt><dd>{l.sellerFinancing?'Considered for qualified buyers':'Not offered'}</dd></div></dl>
        {approved&&<section className="ks-confidential"><h2>Confidential details</h2><p className="ks-fine">Shared under your signed NDA. Don’t contact the business, its staff or customers directly.</p><dl className="ks-specs"><div><dt>Business</dt><dd>{l.confidential.businessName}</dd></div><div><dt>Location</dt><dd>{l.confidential.city}</dd></div>{l.confidential.website&&<div><dt>Website</dt><dd>{l.confidential.website}</dd></div>}</dl><p className="ks-prose">{l.confidential.details}</p></section>}
        {approved&&<BuyerDataRoom room={s.room} listingId={l.id} questions={questions} onAsked={res.reload}/>}
        {approved&&<section className="ks-qa"><h2>Questions for the advisor</h2>{questions.filter(q=>!q.itemId||q.side==='advisor').map(q=><div key={q.id} className={'ks-q '+q.side}><p>{q.body}</p><small>{q.side==='buyer'?'You':q.author} · {new Date(q.createdAt).toLocaleDateString()}</small></div>)}
          <form onSubmit={e=>{e.preventDefault();const t=e.currentTarget,v=String(new FormData(t).get('q'));void act(async()=>{await s.store.ask(l.id,v);t.reset();},'Question sent. Answers appear here.');}}><label className="ks-field"><span>Ask a question</span><textarea name="q" rows={2} required maxLength={3000}/></label><button className="ks-btn" disabled={busy}>Send question</button></form></section>}
        {approved&&['Live','Under LOI'].includes(l.status)&&<OfferForm l={l} busy={busy} submit={o=>act(()=>s.store.offer(l.id,o),'Offer submitted. Your advisor will be in touch.')}/>}
        {offers.length>0&&<section><h2>Your offers</h2><ul className="ks-offers">{offers.map(o=><li key={o.id}><span>{o.kind} · {money(o.price)} · close in {o.closeDays} days</span><b>{o.status}</b>{o.advisorNote&&<small>{o.advisorNote}</small>}{['Submitted','Shared with seller','Countered'].includes(o.status)&&<button className="ks-link" disabled={busy} onClick={()=>void act(()=>s.store.setOffer(o.id,'Withdrawn',''))}>Withdraw</button>}</li>)}</ul></section>}
      </div>
      <aside className="ks-listing-side">
        <div className="ks-access">
          {l.status==='Sold'?<><h2>Acquisition completed</h2><p>This listing is closed to new NDA and access requests.</p>{stories.data?.filter(c=>c.listingNumber===l.number).map(c=><a className="ks-btn" key={c.id} href={href('/stories/'+c.id)}>Read the seller-approved account</a>)}<a className="ks-link" href={href('/listings')}>Browse available listings</a></>:!s.buyerEmail?<><h2>Get the full details</h2><p>Sign in with a free buyer profile, sign this listing’s NDA, and an advisor reviews your request.</p><a className="ks-btn ks-btn-primary" href={href('/account?next='+encodeURIComponent('/listings/'+l.number))}>Sign in to request details</a></>
          :!me?<><h2>One more step</h2><p>Create your buyer profile so the advisor knows who you are.</p><a className="ks-btn ks-btn-primary" href={href('/account?next='+encodeURIComponent('/listings/'+l.number))}>Create buyer profile</a></>
          :l.access==='Approved'?<><h2>You have access</h2><p>Your NDA was approved. Confidential details, questions and offers are open on this page.</p></>
          :l.access==='Pending'?<><h2>Request received</h2><p>An advisor is reviewing your profile and signed NDA, usually within one business day.</p></>
          :l.access==='Declined'?<><h2>Request declined</h2><p>This seller is looking for a different kind of buyer. Contact Kalling if you think that’s a mistake.</p></>
          :showNda?<NdaForm l={l} name={me.buyer.name} busy={busy} onCancel={()=>setShowNda(false)} submit={(n,a,m)=>act(async()=>{await s.store.requestAccess(l,n,a,m);setShowNda(false);},'NDA signed. Your request is with an advisor.')}/>
          :<><h2>Request the full details</h2><p>Sign this listing’s confidentiality agreement online. An advisor checks your profile, then shares the name, financials and documents.</p><button className="ks-btn ks-btn-primary" onClick={()=>setShowNda(true)}>Review and sign the NDA</button></>}
          {notice&&<p className="ks-ok" role="status">{notice}</p>}{error&&<p className="ks-error" role="alert">{error}</p>}
        </div>
        {me&&<button className="ks-btn ks-save" aria-pressed={!!saved} disabled={busy} onClick={()=>void act(()=>s.store.toggleSaved(l.id))}>{saved?'Saved to your list':'Save listing'}</button>}
      </aside>
    </div>
  </article>;
}

function NdaForm({l,name,busy,submit,onCancel}:{l:ViewListing;name:string;busy:boolean;submit:(name:string,agreed:boolean,message:string)=>void;onCancel:()=>void}){
  const [agreed,setAgreed]=useState(false),[typed,setTyped]=useState('');
  return <form className="ks-nda" onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();submit(typed,agreed,String(new FormData(e.currentTarget).get('message')||''));}}>
    <h2>Confidentiality agreement</h2>
    <pre tabIndex={0} aria-label="Agreement text">{ndaText(l)}</pre>
    <label className="ks-check"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>I have read and agree to these terms.</label>
    <label className="ks-field"><span>Type your full name to sign: {name}</span><input value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="name" required/></label>
    <label className="ks-field"><span>Note to the advisor · optional</span><textarea name="message" rows={2} maxLength={1500} placeholder="Why this company fits you"/></label>
    <div className="ks-actions"><button className="ks-btn ks-btn-primary" disabled={busy||!agreed||typed.trim().toLowerCase()!==name.toLowerCase()}>Sign and request access</button><button type="button" className="ks-link" onClick={onCancel}>Cancel</button></div>
    <p className="ks-fine">We record your typed name, the date and a fingerprint of this exact text with your request.</p>
  </form>;
}
function OfferForm({l,busy,submit}:{l:ViewListing;busy:boolean;submit:(o:Parameters<ReturnType<typeof useSession>['store']['offer']>[1])=>void}){
  return <div className="ks-offer"><h2>Make an offer</h2><TermsEditor busy={busy} initial={{kind:'Indication of interest',price:l.askingPrice,cashAtClose:l.askingPrice,sellerNote:0,earnout:0,financing:'',closeDays:90,conditions:''}} submit={submit}/></div>;
}

export function BuyPage(){
  return <>
    <section className="ks-wrap ks-page-head"><h1 className="ks-display ks-display-s">Buying an HVAC company</h1><p>Kalling lists heating, cooling and refrigeration companies in New Jersey and New York. Profiles are free. You never pay Kalling a fee to buy.</p><div className="ks-actions"><a className="ks-btn ks-btn-primary" href={href('/account?next=profile')}>Create a buyer profile</a><a className="ks-btn" href={href('/listings')}>Browse listings</a></div></section>
    <section className="ks-wrap"><ol className="ks-steps ks-steps-long">
      <li><div className="ks-step-head"><h3>Create a profile</h3></div><p>Tell us who you are, the regions you want and how you plan to pay. Sellers want to know their company is going to someone capable.</p></li>
      <li><div className="ks-step-head"><h3>Sign the listing NDA</h3></div><p>Each listing has its own confidentiality agreement. Read it and sign it online in a minute.</p></li>
      <li><div className="ks-step-head"><h3>Get approved</h3></div><p>An advisor reviews your request, usually within one business day. We may ask for proof of funds or a lender pre-qualification before sharing financials.</p></li>
      <li><div className="ks-step-head"><h3>Review and ask</h3></div><p>See the company name, financial statements and documents. Ask questions on the listing page, then meet the owner.</p></li>
      <li><div className="ks-step-head"><h3>Offer and close</h3></div><p>Submit an indication of interest or letter of intent. Your advisor coordinates diligence, the lender and the license transition through closing.</p></li>
    </ol></section>
    <section className="ks-band"><div className="ks-wrap ks-two">
      <div><h2>The license question</h2><p className="ks-lede">In New Jersey, an HVACR business must have a licensed master HVACR contractor as its bona fide representative. If you aren’t licensed, plan for a licensed employee or the seller to fill that role. Every listing shows how the seller expects to handle it.</p></div>
      <div><h2>Financing</h2><p className="ks-lede">Many buyers use SBA 7(a) loans with a seller note. Listings show whether the seller will consider financing. Your advisor can introduce lenders who know the HVAC trade. Kalling doesn’t lend or give lending advice.</p></div>
    </div></section>
  </>;
}

export function AccountPage({route}:{route:Route}){
  const s=useSession();const res=useAsync(()=>s.store.me(),[s.store]);const next=route.query.get('next')||'';
  const [error,setError]=useState(''),[saved,setSaved]=useState(false);
  const listings=useAsync(()=>s.store.listings(),[s.store]);
  const proofs=useAsync(()=>s.buyerEmail?s.store.verification.list():Promise.resolve([]),[s.store,s.buyerEmail]);
  if(!s.buyerEmail)return s.client?<CloudSignIn/>:<section className="ks-wrap ks-auth"><h1>Buyer sign in</h1><p>Use your email to save listings, sign NDAs and follow your requests.</p>
    <form onSubmit={e=>{e.preventDefault();s.signIn(String(new FormData(e.currentTarget).get('email')).trim().toLowerCase());}}><label className="ks-field"><span>Email</span><input name="email" type="email" required autoComplete="email" autoFocus/></label><button className="ks-btn ks-btn-primary">Continue</button></form>
    <p className="ks-fine">Demo marketplace: there’s no password and records stay in this browser.</p></section>;
  if(!res.data&&res.loading)return <section className="ks-wrap ks-page-head"><p>Loading…</p></section>;
  const me=res.data,editing=!me||next==='profile';
  const all=listings.data||[];
  return <section className="ks-wrap ks-account">
    <div className="ks-section-head"><h1>{me?`Welcome back, ${me.buyer.name.split(' ')[0]}`:'Create your buyer profile'}</h1><button className="ks-link" onClick={s.signOut}>Sign out of {s.buyerEmail}</button></div>
    {editing?<form className="ks-profile" onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);setError('');void s.store.saveProfile({name:String(d.get('name')),phone:String(d.get('phone')),type:String(d.get('type')) as BuyerType,company:String(d.get('company')),funds:String(d.get('funds')) as Funds,financing:d.getAll('financing').map(String),experience:String(d.get('experience')),regions:d.getAll('regions').map(String) as Region[],maxPrice:Number(String(d.get('maxPrice')).replace(/\D/g,''))||0,alerts:d.get('alerts')==='on'}).then(()=>{setSaved(true);if(next&&next!=='profile')go(next);else{history.replaceState(null,'','#/account');res.reload();}}).catch(err=>setError(err.message));}}>
      <p className="ks-lede">Sellers see your buyer type and progress, not your contact details. Advisors use the rest to approve requests quickly.</p>
      <div className="ks-form-grid">
        <label className="ks-field"><span>Full legal name</span><input name="name" required defaultValue={me?.buyer.name} autoComplete="name"/></label>
        <label className="ks-field"><span>Phone · optional</span><input name="phone" defaultValue={me?.buyer.phone} autoComplete="tel"/></label>
        <label className="ks-field"><span>What kind of buyer are you?</span><select name="type" defaultValue={me?.buyer.type}>{buyerTypes.map(t=><option key={t}>{t}</option>)}</select></label>
        <label className="ks-field"><span>Company or fund · optional</span><input name="company" defaultValue={me?.buyer.company}/></label>
        <label className="ks-field"><span>Cash available for a down payment</span><select name="funds" defaultValue={me?.buyer.funds}>{fundBands.map(t=><option key={t}>{t}</option>)}</select></label>
        <label className="ks-field"><span>Most you’d pay</span><input name="maxPrice" inputMode="numeric" defaultValue={me?.buyer.maxPrice?me.buyer.maxPrice.toLocaleString():''} placeholder="3,000,000"/></label>
      </div>
      <fieldset className="ks-chips"><legend>How you’d pay</legend>{['SBA 7(a) loan','Cash','Seller note','Investor capital','Conventional bank loan'].map(f=><label key={f}><input type="checkbox" name="financing" value={f} defaultChecked={me?.buyer.financing.includes(f)}/>{f}</label>)}</fieldset>
      <fieldset className="ks-chips"><legend>Regions you’d consider</legend>{regions.map(r=><label key={r}><input type="checkbox" name="regions" value={r} defaultChecked={me?.buyer.regions.includes(r)}/>{r}</label>)}</fieldset>
      <label className="ks-field"><span>Your background</span><textarea name="experience" rows={4} required minLength={30} maxLength={1500} defaultValue={me?.buyer.experience} placeholder="Trade experience, businesses you’ve run, licenses you hold, and who would run the company day to day."/></label>
      <p className="ks-fine">After saving your profile, set explicit email preferences in Listing alerts. Email subscriptions start off.</p>
      {error&&<p className="ks-error" role="alert">{error}</p>}{saved&&<p className="ks-ok" role="status">Profile saved.</p>}
      <div className="ks-actions"><button className="ks-btn ks-btn-primary">Save profile</button>{me&&<a className="ks-link" href={href('/account')}>Cancel</a>}</div>
    </form>:<>
      <div className="ks-account-grid">
        <section><h2>Your requests</h2>{me.access.length?<ul className="ks-offers">{me.access.map(a=>{const l=all.find(x=>x.id===a.listingId);return <li key={a.id}><a href={href('/listings/'+(l?.number||a.listingId))}>{l?.headline||'Listing'}</a><b>{a.status}</b><small>NDA signed {new Date(a.nda.signedAt).toLocaleDateString()}</small></li>;})}</ul>:<p className="ks-empty">No requests yet. Open a listing and sign its NDA to see the details.</p>}</section>
        <section><h2>Saved listings</h2>{me.buyer.saved.length?<div className="ks-plates ks-plates-tight">{all.filter(l=>me.buyer.saved.includes(l.id)).map(l=><Nameplate key={l.id} l={l}/>)}</div>:<p className="ks-empty">Save listings to compare them here.</p>}</section>

        <section><h2>Your profile</h2><p>{me.buyer.type} · {me.buyer.funds} available · {me.buyer.regions.join(', ')||'any region'}</p><p className="ks-fine">Status: {me.buyer.status==='Verified'?'Legacy status. Review financing evidence below.':me.buyer.status==='Restricted'?'Restricted. Contact Kalling.':'Profile complete'}</p><a className="ks-btn" href={href('/account?next=profile')}>Edit profile</a></section>
      </div><ExecutionWorkspace store={s.store.execution} watermark={me.buyer.name+' | '+me.buyer.email}/><BuyerOffers store={s.store} offers={me.offers} refresh={res.reload}/><BuyerAlerts store={s.store.alerts} listings={all}/><BuyerVerification store={s.store.verification} name={me.buyer.company||me.buyer.name}/><BuyerLenderPreparation store={s.store.lenders} listings={all} verificationRef={verificationBadge(proofs.data?.[0]).status==='Verified'?proofs.data?.[0]?.id:undefined}/><OpenedHistory room={s.room}/></>}
  </section>;
}

function CloudSignIn(){
  const {client}=useSession();const [mode,setMode]=useState<'in'|'up'>('in'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  return <section className="ks-wrap ks-auth"><h1>{mode==='in'?'Buyer sign in':'Create a buyer account'}</h1><p>Save listings, sign NDAs and follow your requests.</p>
    <form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget),email=String(d.get('email')).trim(),password=String(d.get('password'));setBusy(true);setError('');setNotice('');
      void (mode==='in'?client!.auth.signInWithPassword({email,password}):client!.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname+'#/account'}})).then(({error})=>{if(error)throw error;if(mode==='up')setNotice('Check your email and click the confirmation link, then sign in.');}).catch(err=>setError(err.message)).finally(()=>setBusy(false));}}>
      <label className="ks-field"><span>Email</span><input name="email" type="email" required autoComplete="email"/></label>
      <label className="ks-field"><span>Password{mode==='up'?' · at least 12 characters':''}</span><input name="password" type="password" required minLength={12} autoComplete={mode==='up'?'new-password':'current-password'}/></label>
      {error&&<p className="ks-error" role="alert">{error}</p>}{notice&&<p className="ks-ok" role="status">{notice}</p>}
      <button className="ks-btn ks-btn-primary" disabled={busy}>{mode==='in'?'Sign in':'Create account'}</button></form>
    <button className="ks-link" onClick={()=>setMode(mode==='in'?'up':'in')}>{mode==='in'?'New here? Create an account':'Already have an account? Sign in'}</button></section>;
}
