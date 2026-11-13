// Marketplace pieces used on the Buyers, Listings and Offers pages and inside the Deal Room.
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {checkTeaser,blocking,applySuggestion,type Finding} from '../../lib/anonymity';
import {regions,focuses,fundsChecks,publishProblems,regionState,type Listing,type Buyer,type Offer,type Region,type Focus,type FundsCheck,type ListingStatus} from '../../lib/brokerage';
import {money} from '../../lib/hvacValuation';
import {compareOffers,cashShare,recastSde,type DealCompany} from '../../lib/deals';
import type {Company} from '../../lib/domain';
import {useAdvisor,openOffer} from './data';
import {Button,StatusPill,EmptyState,Field,Avatar} from '../design/ui';
import {AdvisorOfferDesk} from '../buyer/Offers';
import {AdvisorVerification} from '../buyer/Verification';

const dt=(s?:string)=>s?new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
export const site=(path:string)=>location.pathname+'#'+path;
const offerTone=(s:Offer['status'])=>s==='Accepted'?'green':s==='Shared with seller'?'peri':s==='Submitted'?'purple':s==='Countered'?'plain':'plain';

/** NDA requests waiting for a decision, with the signature details. */
export function AccessRequests({listingId,onApproved}:{listingId?:string;onApproved?:(l:Listing)=>void}){
  const {d,act,busy,canWrite,store,syncPortal}=useAdvisor();if(!d)return null;
  const rows=d.requests.filter(r=>(!listingId||r.listingId===listingId)).sort((a,b)=>(a.status==='Pending'?0:1)-(b.status==='Pending'?0:1)||b.createdAt.localeCompare(a.createdAt));
  if(!rows.length)return <EmptyState title="No NDA requests yet">Buyers request access from the public listing page. Each request arrives here with the buyer’s signed NDA.</EmptyState>;
  return <div className="adv-rows">{rows.map(r=>{const b=d.buyers.find(x=>x.id===r.buyerId),l=d.listings.find(x=>x.id===r.listingId);if(!b||!l)return null;const check=d.checks.find(c=>c.buyerId===b.id);
    return <article key={r.id} className={'adv-row'+(r.status==='Pending'?' adv-row-new':'')}>
      <header><Avatar name={b.name}/><div><h3>{b.name}{b.company?', '+b.company:''}</h3><p>{b.type}. {b.funds} to invest. Pays with {b.financing.join(', ')||'a method to be confirmed'}.{!listingId&&<> Wants {l.number}.</>}</p></div><StatusPill tone={r.status==='Approved'?'green':r.status==='Pending'?'purple':'plain'}>{r.status==='Pending'?'Waiting for you':r.status}</StatusPill></header>
      <dl className="adv-facts"><div><dt>NDA signed by</dt><dd>{r.nda.signedName}</dd></div><div><dt>Signed on</dt><dd>{dt(r.nda.signedAt)}</dd></div><div><dt>Text fingerprint</dt><dd><code title={r.nda.textHash}>{r.nda.textHash.slice(0,12)}</code> v{r.nda.version}</dd></div><div><dt>Funds check</dt><dd>{check?.funds||'Not checked'}</dd></div></dl>
      <p className="adv-quote">{b.experience}</p>{r.message&&<p className="adv-quote">“{r.message}”</p>}
      {r.status==='Pending'&&canWrite&&<Decision busy={busy} buttons={[['Approve and share details','primary','Approved'],['Decline','plain','Declined']]} onDecide={(s,note)=>void act(async()=>{await store.decide(r.id,s as 'Approved'|'Declined',note);if(s==='Approved'){await syncPortal(l,b,'Under NDA');onApproved?.(l);}})}/>}
      {r.decisionNote&&<p className="adv-muted">Note to buyer: {r.decisionNote}</p>}
    </article>;})}</div>;
}

function Decision({busy,buttons,onDecide,note:initial=''}:{busy:boolean;buttons:[string,'primary'|'plain'|'quiet',string][];onDecide:(status:string,note:string)=>void;note?:string}){
  const [note,setNote]=useState(initial);
  return <div className="adv-decide"><Field label="Note to the buyer, optional"><input value={note} onChange={e=>setNote(e.target.value)} maxLength={1000}/></Field><div className="adv-buttons">{buttons.map(([label,tone,s])=><Button key={s} tone={tone} disabled={busy} onClick={()=>onDecide(s,note)}>{label}</Button>)}</div></div>;
}

/** Every registered buyer, the advisor's status and the funds check. */
export function BuyerDirectory(){
  const {d,act,busy,canWrite,store}=useAdvisor();const [open,setOpen]=useState('');if(!d)return null;
  if(!d.buyers.length)return <EmptyState title="No buyers yet">Buyers appear once they create a profile on the public site.</EmptyState>;
  return <div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Buyer</th><th>Funds</th><th>Up to</th><th>Requests</th><th>Status</th><th>Funds check</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
    {d.buyers.map(b=>{const c=d.checks.find(x=>x.buyerId===b.id),reqs=d.requests.filter(r=>r.buyerId===b.id);return [<tr key={b.id}>
      <td><strong>{b.name}</strong><small>{b.type}{b.company?', '+b.company:''}</small></td><td>{b.funds}</td><td className="adv-num">{b.maxPrice?money(b.maxPrice):'Not set'}</td>
      <td>{reqs.map(r=>d.listings.find(l=>l.id===r.listingId)?.number+' '+r.status.toLowerCase()).join(', ')||'None'}</td>
      <td><select aria-label={'Status for '+b.name} value={b.status} disabled={busy||!canWrite} onChange={e=>void act(()=>store.vet(b.id,e.target.value as Buyer['status'],b.advisorNote))}><option>Registered</option>{b.status==='Verified'&&<option disabled value="Verified">Legacy status, evidence review needed</option>}<option>Restricted</option></select></td>
      <td><StatusPill tone={c?.funds==='Lender pre-qualified'||c?.funds==='Proof of funds received'?'green':c?.funds==='Not sufficient'?'warn':'plain'}>{c?.funds||'Not checked'}</StatusPill></td>
      <td><Button tone="quiet" aria-expanded={open===b.id} onClick={()=>setOpen(open===b.id?'':b.id)}>{open===b.id?'Close':'Verify'}</Button></td></tr>,
      open===b.id&&<tr key={b.id+'-v'} className="adv-expand"><td colSpan={7}><AdvisorVerification store={store.verification} buyerId={b.id} readOnly={!canWrite}/>{c&&<details><summary>Historical funds note</summary><p>{c.funds}. {c.note}. This note is not evidence-backed verification.</p></details>}</td></tr>];})}
  </tbody></table></div>;
}
function Verification({buyer,funds,note,checked,disabled,save}:{buyer:Buyer;funds:FundsCheck;note:string;checked:string;disabled:boolean;save:(f:FundsCheck,n:string)=>void}){
  const [f,setF]=useState(funds),[n,setN]=useState(note);
  return <form className="adv-verify" onSubmit={e=>{e.preventDefault();save(f,n);}}>
    <div><h3>Can {buyer.name.split(' ')[0]} pay?</h3><p>Record what you have seen: a bank or brokerage statement, or a lender’s pre-qualification letter. The buyer never sees this.</p><p className="adv-muted">{checked}. {buyer.email}{buyer.phone?', '+buyer.phone:''}.</p></div>
    <Field label="Verification"><select value={f} onChange={e=>setF(e.target.value as FundsCheck)}>{fundsChecks.map(x=><option key={x}>{x}</option>)}</select></Field>
    <Field label="Private note" hint="Lender, amount and date are enough. Do not paste account numbers."><textarea rows={3} value={n} onChange={e=>setN(e.target.value)} maxLength={2000}/></Field>
    <Button tone="primary" disabled={disabled}>Save check</Button></form>;
}

/** Offers for one listing side by side. */
export function OfferComparison({listing,onAccepted}:{listing:Listing;onAccepted?:(l:Listing)=>void}){
  const x=useAdvisor();if(!x.d)return null;return <AdvisorOfferDesk store={x.store} offers={x.d.offers.filter(o=>o.listingId===listing.id)} buyers={x.d.buyers} canWrite={x.canWrite} changed={async(action,id)=>{const o=x.d?.offers.find(o=>o.id===id),b=x.d?.buyers.find(b=>b.id===o?.buyerId);if(action==='share')await x.syncPortal(listing,b,'Offer made');await x.reload();if(action==='accept'&&onAccepted){const l=await x.store.listing(listing.id);if(l.status==='Under LOI')onAccepted(l);}}}/>;
}

/** Buyer question threads, newest first, with a reply box. */
export function QuestionThreads({listingId}:{listingId?:string}){
  const {d,act,busy,canWrite,store,room}=useAdvisor(),[docs,setDocs]=useState<Record<string,string>>({});
  useEffect(()=>{if(!listingId)return;void room.room(listingId).then(r=>setDocs(Object.fromEntries(r.items.map(i=>[i.id,i.displayName])))).catch(()=>{});},[room,listingId]);
  if(!d)return null;
  const threads=Object.values(d.questions.filter(q=>!listingId||q.listingId===listingId).reduce<Record<string,typeof d.questions>>((m,q)=>{(m[q.listingId+'|'+q.buyerId]??=[]).push(q);return m;},{}));
  if(!threads.length)return <EmptyState title="No buyer questions">Approved buyers can ask questions from the listing page.</EmptyState>;
  return <div className="adv-rows">{threads.map(t=>{const q0=t[0],b=d.buyers.find(x=>x.id===q0.buyerId),l=d.listings.find(x=>x.id===q0.listingId),waiting=t[t.length-1].side==='buyer';
    return <article key={q0.id} className={'adv-row'+(waiting?' adv-row-new':'')}><header><div><h3>{b?.name}{!listingId&&l?' on '+l.number:''}</h3></div>{waiting&&<StatusPill tone="purple">Needs an answer</StatusPill>}</header>
      <div className="adv-thread">{t.map(q=><p key={q.id} className={q.side}><b>{q.side==='buyer'?b?.name:q.author}</b>{q.itemId&&<small className="adv-q-ref">About {docs[q.itemId]||'a data room document'}, page {q.page}</small>}{q.body}</p>)}</div>
      {canWrite&&<form className="adv-reply" onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=e.currentTarget,v=String(new FormData(f).get('a'));void act(async()=>{await store.ask(q0.listingId,v,q0.buyerId);f.reset();});}}><Field label={'Answer '+(b?.name||'the buyer')}><input name="a" required maxLength={2000}/></Field><Button disabled={busy}>Send answer</Button></form>}</article>;})}</div>;
}

export type Draft=Omit<Listing,'id'|'number'|'status'|'sample'|'createdAt'|'updatedAt'>&{id?:string};
function draftFor(l:Listing|undefined,c?:Company):Draft{
  if(l)return {...l};const dc=c as DealCompany|undefined,r=dc?.recast;
  return {headline:'',region:(dc?.region||(c?.state==='NY'?'Long Island':'Central Jersey')) as Region,focus:'Residential service & replacement',askingPrice:r?.askingPrice||0,revenue:r?.inputs.revenue||0,sde:r?Math.max(0,recastSde(r)):0,established:new Date().getFullYear()-(r?.inputs.years||10),employees:0,technicians:r?.inputs.technicians||0,agreements:r?.inputs.agreements||0,recurringPct:r?.inputs.maintenancePct||0,residentialPct:100-(r?.inputs.commercialPct||0),vehicles:0,realEstate:'Leased facility',sellerFinancing:false,reason:'Owner is retiring',summary:'',highlights:[],growth:[],confidential:{businessName:c?.name||'',city:c?.city||'',website:c?.website||'',details:'',ownerName:c?.owner||''},companyId:c?.id};
}
/** Listing builder with a live preview and the anonymity check inline. Publishing waits for the check. */
export function ListingEditor({listing,company,companies,onSaved,onPublished,onCancel,incoming,onChange}:{listing?:Listing;company?:Company;companies?:Company[];onSaved?:(id:string)=>void;onPublished?:(l:Listing)=>void;onCancel?:()=>void;incoming?:{fields:Partial<Draft>;all:boolean;nonce:number};onChange?:(x:Draft)=>void}){
  const {act,busy,canWrite,store}=useAdvisor();
  const [x,setX]=useState<Draft>(()=>draftFor(listing,company)),[saved,setSaved]=useState('');
  const set=<K extends keyof Draft>(k:K,v:Draft[K])=>{setX(p=>({...p,[k]:v}));setSaved('');};
  const conf=(k:keyof Listing['confidential'],v:string)=>{setX(p=>({...p,confidential:{...p.confidential,[k]:v}}));setSaved('');};
  const lines=(s:string)=>s.split('\n').map(t=>t.trim()).filter(Boolean),num=(s:string)=>Number(s.replace(/[^\d.]/g,''))||0;
  /** A reviewed draft field arrives from the teaser draft; with all, the figures are refreshed from the recast too. */
  useEffect(()=>{if(!incoming)return;setX(p=>{const d=draftFor(undefined,company);return {...p,...incoming.fields,...(incoming.all?{askingPrice:d.askingPrice||p.askingPrice,revenue:d.revenue,sde:d.sde,technicians:d.technicians,agreements:d.agreements,recurringPct:d.recurringPct,residentialPct:d.residentialPct,established:d.established}:{})};});setSaved('');},[incoming?.nonce]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{onChange?.(x);},[x]);// eslint-disable-line react-hooks/exhaustive-deps
  const [checked,setChecked]=useState<Record<string,string>>({});
  const full=useMemo(()=>({...x,id:listing?.id||'draft',number:listing?.number||'KL-new',status:listing?.status||'Draft',sample:false,createdAt:'',updatedAt:''}) as Listing,[x,listing]);
  const findings=useMemo(()=>checkTeaser({headline:x.headline,summary:x.summary,reason:x.reason,highlights:x.highlights,growth:x.growth},{businessName:x.confidential.businessName,ownerName:x.confidential.ownerName||company?.owner,city:x.confidential.city,website:x.confidential.website,region:x.region,...(company?anonExtra(company):{})}),[x,company]);
  const blocks=blocking(findings),warns=findings.filter(f=>f.severity==='warn'),unchecked=warns.filter(f=>(checked[f.kind+f.text]||'').trim().length<3);
  const problems=[...publishProblems(full).filter(p=>!/^The public text mentions/.test(p)),...blocks.map(f=>`“${f.text}” in ${f.field}: ${f.why}`),...unchecked.map(f=>`Check “${f.text}” in ${f.field} and add a note.`)],live=listing?.status==='Live'||listing?.status==='Under LOI';
  const fixField=(f:Finding)=>{const k=f.field as 'headline'|'summary'|'reason'|'highlights'|'growth';const v=x[k];set(k,(Array.isArray(v)?v.map(t=>applySuggestion(t,f,x.region)):applySuggestion(v as string,f,x.region)) as never);};
  async function save(){let id='';const ok=await act(async()=>{id=await store.saveListing({...x,id:listing?.id});});if(ok){setSaved('Saved as a draft.');onSaved?.(id);}return ok?id:'';}
  async function publish(){const id=listing?.id||await save();if(!id)return;const ok=await act(async()=>{if(listing)await store.saveListing({...x,id});await store.setStatus(id,'Live');});if(ok){setSaved('Published. The listing is live on the public site.');onPublished?.({...full,id,status:'Live'});}}
  const numField=(k:'askingPrice'|'revenue'|'sde'|'established'|'employees'|'technicians'|'agreements'|'recurringPct'|'residentialPct'|'vehicles',label:string)=><Field key={k} label={label}><input inputMode="numeric" value={x[k]||''} onChange={e=>set(k,num(e.target.value))}/></Field>;
  return <div className="adv-listing">
    <form className="adv-listing-form" onSubmit={e=>{e.preventDefault();void save();}}>
      {companies&&<Field label="Workspace company" hint="Links the owner portal, so approved buyers and shared offers appear there."><select value={x.companyId||''} onChange={e=>set('companyId',e.target.value||undefined)}><option value="">Not linked</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      <fieldset disabled={!canWrite||busy}><legend>Public teaser</legend><p className="adv-muted">Anyone can read this. It must not identify the business.</p>
        <Field label="Headline"><input value={x.headline} onChange={e=>set('headline',e.target.value)} maxLength={120} placeholder="Residential HVAC service company with 900 maintenance agreements"/></Field>
        <div className="adv-grid3"><Field label="Region"><select value={x.region} onChange={e=>set('region',e.target.value as Region)}>{regions.map(r=><option key={r}>{r}</option>)}</select></Field><Field label="Kind of work"><select value={x.focus} onChange={e=>set('focus',e.target.value as Focus)}>{focuses.map(r=><option key={r}>{r}</option>)}</select></Field><Field label="Reason for sale"><input value={x.reason} onChange={e=>set('reason',e.target.value)} maxLength={300}/></Field></div>
        <div className="adv-grid3">{numField('askingPrice','Asking price')}{numField('revenue','Revenue')}{numField('sde','Earnings (SDE)')}{numField('established','Year established')}{numField('technicians','Technicians')}{numField('employees','Employees')}{numField('agreements','Maintenance agreements')}{numField('recurringPct','Service and maintenance, %')}{numField('residentialPct','Residential, %')}{numField('vehicles','Vehicles')}
          <Field label="Facility"><select value={x.realEstate} onChange={e=>set('realEstate',e.target.value as Listing['realEstate'])}><option>Leased facility</option><option>Real estate available</option><option>Home-based</option></select></Field></div>
        <label className="adv-check"><input type="checkbox" checked={x.sellerFinancing} onChange={e=>set('sellerFinancing',e.target.checked)}/>The owner will consider seller financing</label>
        <Field label="Summary" hint={`${x.summary.length} of at least 120 characters`}><textarea rows={4} value={x.summary} onChange={e=>set('summary',e.target.value)} maxLength={2500}/></Field>
        <div className="adv-grid2"><Field label="Highlights, one per line" hint="At least three"><textarea rows={4} value={x.highlights.join('\n')} onChange={e=>set('highlights',lines(e.target.value))}/></Field><Field label="Room to grow, one per line"><textarea rows={4} value={x.growth.join('\n')} onChange={e=>set('growth',lines(e.target.value))}/></Field></div>
      </fieldset>
      <fieldset disabled={!canWrite||busy}><legend>Confidential</legend><p className="adv-muted">Shown only to buyers you approve after they sign the NDA.</p>
        <div className="adv-grid3"><Field label="Business name"><input value={x.confidential.businessName} onChange={e=>conf('businessName',e.target.value)}/></Field><Field label="Owner’s name"><input value={x.confidential.ownerName||''} onChange={e=>conf('ownerName',e.target.value)}/></Field><Field label="City"><input value={x.confidential.city} onChange={e=>conf('city',e.target.value)}/></Field><Field label="Website"><input value={x.confidential.website} onChange={e=>conf('website',e.target.value)}/></Field></div>
        <Field label="Details for approved buyers"><textarea rows={3} value={x.confidential.details} onChange={e=>conf('details',e.target.value)} maxLength={5000} placeholder="Address, owner background, data room link, what the memorandum covers"/></Field>
      </fieldset>
      {canWrite&&<div className="adv-buttons"><Button disabled={busy}>Save draft</Button>{!live&&<Button type="button" tone="primary" disabled={busy||problems.length>0} onClick={()=>void publish()} aria-describedby="anon-check">Publish listing</Button>}{live&&<StatusPill tone="green">{listing?.status}</StatusPill>}{onCancel&&<Button type="button" tone="quiet" onClick={onCancel}>Close</Button>}</div>}
      <p className="adv-muted" aria-live="polite">{saved}</p>
    </form>
    <aside className="adv-listing-side">
      <section id="anon-check" className={'adv-check-panel '+(problems.length?'bad':'ok')} aria-live="polite"><h3>{problems.length?'Not ready to publish':'Ready to publish'}</h3>
        {problems.length?<ul>{publishProblems(full).filter(p=>!/^The public text mentions/.test(p)).map(p=><li key={p}>{p}</li>)}</ul>:<p>The teaser has the essentials and nothing in it identifies the business: no name, owner, town, address, phone, email, website or license number.</p>}
        {blocks.length>0&&<ul className="anon-findings">{blocks.map((f,i)=><li key={i}><strong>“{f.text}”</strong> in {f.field}. {f.why} {f.suggestion}{canWrite&&['town','business','owner'].includes(f.kind)&&<> <button type="button" className="text-link" onClick={()=>fixField(f)}>Use suggestion</button></>}</li>)}</ul>}
        {warns.length>0&&<div className="anon-warns"><p><strong>Check these</strong></p>{warns.map((f,i)=><label key={i} className="anon-warn"><span>“{f.text}” in {f.field}. {f.why} {f.suggestion}</span><input aria-label={'I checked “'+f.text+'”: note'} placeholder="I checked this: note" value={checked[f.kind+f.text]||''} onChange={e=>setChecked(c=>({...c,[f.kind+f.text]:e.target.value}))}/></label>)}</div>}</section>
      <div className="ks adv-preview" onClickCapture={e=>e.preventDefault()}><p className="adv-muted">Public card</p><PreviewCard l={full}/>
        <p className="adv-muted">Listing page</p><div className="adv-preview-page"><p className="adv-preview-meta">{full.region}, {regionState(full.region)}. {full.focus}.</p><h3>{full.headline||'Your headline'}</h3><p>{full.summary||'The summary appears here.'}</p>{full.highlights.length>0&&<ul>{full.highlights.map(h=><li key={h}>{h}</li>)}</ul>}<p className="adv-muted">The business name, city and documents stay hidden until you approve a buyer.</p></div></div>
    </aside>
  </div>;
}
function PreviewCard({l}:{l:Listing}){
  return <div className="ks-plate"><div className="ks-plate-top"><span>{l.region}, {regionState(l.region)}</span>{l.status!=='Live'&&<span className="ks-tag ks-tag-dark">{l.status}</span>}</div><h3>{l.headline||'Your headline'}</h3><p className="ks-plate-price">{money(l.askingPrice)}<span>asking</span></p>
    <dl className="ks-plate-data"><div><dt>Revenue</dt><dd>{money(l.revenue)}</dd></div><div><dt>Earnings</dt><dd>{money(l.sde)}</dd></div><div><dt>Agreements</dt><dd>{l.agreements.toLocaleString()}</dd></div></dl><p className="ks-plate-foot"><span>{l.number}. {l.focus}</span></p></div>;
}

/** Listing rows with status, buyers and offers. */
export function ListingRows({onEdit,onOpenDeal,companies}:{onEdit:(l:Listing)=>void;onOpenDeal:(companyId:string)=>void;companies:Company[]}){
  const {d,act,busy,canWrite,store}=useAdvisor();if(!d)return null;
  return <div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Listing</th><th>Asking</th><th>Approved buyers</th><th>Offers</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
    {d.listings.map(l=>{const co=companies.find(c=>c.id===l.companyId),problems=l.status==='Draft'?publishProblems(l):[];return <tr key={l.id}>
      <td><strong>{l.number}. {l.headline||'Untitled draft'}</strong><small>{l.region}{l.sample?'. Sample listing':''}{co?'. '+co.name:''}{problems.length?`. ${problems.length} thing${problems.length===1?'':'s'} to fix before publishing`:''}</small></td>
      <td className="adv-num">{money(l.askingPrice)}</td><td className="adv-num">{d.requests.filter(r=>r.listingId===l.id&&r.status==='Approved').length}</td><td className="adv-num">{d.offers.filter(o=>o.listingId===l.id).length}</td>
      <td><select aria-label={'Status for '+l.number} value={l.status} disabled={busy||!canWrite||l.sample} onChange={e=>void act(()=>store.setStatus(l.id,e.target.value as ListingStatus))}>{['Draft','Live','Under LOI','Sold','Withdrawn'].map(s=><option key={s}>{s}</option>)}</select></td>
      <td className="adv-actions">{co?<Button tone="quiet" onClick={()=>onOpenDeal(co.id)}>Deal Room</Button>:!l.sample&&<Button tone="quiet" onClick={()=>onEdit(l)}>Edit</Button>}<a className="k-btn k-btn-quiet" href={site('/listings/'+l.number)} target="_blank" rel="noreferrer">Public page</a></td></tr>;})}
  </tbody></table></div>;
}

/** Names the anonymity checker should look for: customers and employees from accepted documents. */
export function anonExtra(c:Company){const d=c as Company&{anonymity?:{customerNames?:string[];employeeNames?:string[];licenseNumbers?:string[]}};return {customerNames:d.anonymity?.customerNames||[],employeeNames:d.anonymity?.employeeNames||[],licenseNumbers:d.anonymity?.licenseNumbers||[],websitePhrases:c.evidence.map(e=>e.excerpt).filter(Boolean)};}
