// The Deal Room: one screen per company for the whole sale.
import {useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import type {Company,Workspace} from '../../lib/domain';
import {money,type HvacInputs} from '../../lib/hvacValuation';
import {sellStages,setStage,canMove,stageChecklist,primaryAction,recastValuation,recastSde,saveRecast,askingVersusEstimate,defaultInputs,draftEngagementPortal,type AddBack,type DealCompany,type SellStage} from '../../lib/deals';
import type {Listing} from '../../lib/brokerage';
import {useAdvisor,listingOf,stageOf,unansweredThreads} from './data';
import {AccessRequests,OfferComparison,QuestionThreads,ListingEditor} from './market';
import {regionOf} from './pages';
import {Button,StatusPill,Figure,Panel,KeylineList,EmptyState,Field,Tabs} from '../design/ui';
import OwnerPortalAdmin,{PortalContextRef} from '../OwnerPortalAdmin';
import {unread} from '../../lib/portal';

export const dealTabs=['Overview','Valuation and recast','Listing','Buyers','Offers','Documents','Owner','Research and drafting','Activity'] as const;
export type DealTab=typeof dealTabs[number];
type Props={c:Company;w:Workspace;commit:(next:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean;tab:string;setTab:(t:string)=>void;back:()=>void;backLabel:string;edit:()=>void;research:ReactNode;computer:ReactNode;aiCount:number};
const dt=(s?:string)=>s?new Date(s.length===10?s+'T12:00:00':s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';

export default function DealRoom(p:Props){
  const x=useAdvisor(),portalCtx=useContext(PortalContextRef),c=p.c as DealCompany;
  const listing=listingOf(x.d,c),pe=x.portals[c.id],stage=stageOf(x,c),[msg,setMsg]=useState('');
  const tab=(dealTabs as readonly string[]).includes(p.tab)?p.tab as DealTab:'Overview';
  const v=c.recast?recastValuation(c.recast):null,sde=c.recast?recastSde(c.recast):0,revenue=c.recast?.inputs.revenue||listing?.revenue||0;
  const counts:Partial<Record<DealTab,number>>={
    Buyers:(listing&&x.d?x.d.requests.filter(r=>r.listingId===listing.id&&r.status==='Pending').length+unansweredThreads(x.d.questions.filter(q=>q.listingId===listing.id)).length:0),
    Offers:listing&&x.d?x.d.offers.filter(o=>o.listingId===listing.id&&o.status==='Submitted').length:0,
    Documents:pe?.bundle?.requests.filter(r=>r.status==='Submitted').length||0,
    Owner:pe?.bundle?unread(pe.bundle):0,'Research and drafting':p.aiCount};
  async function move(to:SellStage,note?:string){try{const next=setStage(p.w,c.id,to,p.actor,{listing,portal:pe?.portal});if(await p.commit(next))setMsg(note||`Moved to ${to}.`);}catch(e){setMsg((e as Error).message);}}
  const before=(s:SellStage)=>sellStages.indexOf(stage)<sellStages.indexOf(s)&&stage!=='Lost';
  async function engage(){if(portalCtx.store&&portalCtx.canWrite&&!pe&&c.email&&c.owner){try{await draftEngagementPortal(portalCtx.store,c,portalCtx.helpDefault.email?portalCtx.helpDefault:{name:p.actor,email:'team@local.demo'});await x.reloadPortals();}catch(e){setMsg((e as Error).message);return;}}await move('Engaged','Engaged. The owner portal is drafted with the standard requests. Invite the owner from the Owner tab.');}
  const action=(()=>{const a=primaryAction[stage];
    if(stage==='Lead')return {label:a.label,run:()=>void move('Qualified')};
    if(stage==='Qualified')return {label:'Start engagement',run:()=>void engage()};
    if(stage==='Listed'&&counts.Offers)return {label:'Share offer with seller',run:()=>p.setTab('Offers')};
    return {label:a.label,run:()=>p.setTab(a.tab)};})();
  const head=listing?.askingPrice?{value:money(listing.askingPrice),label:'Asking price'}:c.recast?.askingPrice?{value:money(c.recast.askingPrice),label:'Asking price'}:v&&v.mid>0?{value:`${money(v.low)} to ${money(v.high)}`,label:'Estimated value'}:{value:'Not valued',label:'Estimated value'};
  const portalPill=!pe?<StatusPill>No owner portal</StatusPill>:pe.portal.status==='Active'?<StatusPill tone="green">Owner has joined</StatusPill>:pe.portal.status==='Invited'?<StatusPill tone="peri">Owner invited</StatusPill>:<StatusPill>Portal draft</StatusPill>;
  return <div className="adv-page deal-room">
    <div className="deal-top"><Button tone="quiet" onClick={p.back}>Back to {p.backLabel}</Button>{c.sample&&<StatusPill>Fictional sample</StatusPill>}</div>
    <header className="deal-head">
      <div className="deal-id"><h1>{c.name}</h1><p>{regionOf(c)}. {c.industry}.</p><p className="deal-owner">{c.owner?<><strong>{c.owner}</strong>{c.email&&<> <a href={'mailto:'+c.email}>{c.email}</a></>}{c.phone&&<> <a href={'tel:'+c.phone}>{c.phone}</a></>}</>:'Owner not known yet.'} {!p.readOnly&&<Button tone="quiet" onClick={p.edit}>Edit details</Button>}</p></div>
      <div className="deal-controls">
        <label className={'deal-stage stage-'+stage.replace(/\s/g,'-').toLowerCase()}><span className="sr-only">Stage</span><select aria-label="Stage" value={stage} disabled={p.readOnly} onChange={e=>void move(e.target.value as SellStage)}>{sellStages.map(s=><option key={s} disabled={!canMove(stage,s)&&s!==stage}>{s}</option>)}</select></label>
        {portalPill}{p.computer}
        {!p.readOnly&&<Button tone="primary" arrow onClick={action.run}>{action.label}</Button>}
      </div>
    </header>
    <div className="deal-figs"><Figure value={head.value} label={head.label} small={head.value==='Not valued'}/><Figure value={revenue?money(revenue):'Not recorded'} label="Revenue, last full year" small={!revenue}/><Figure value={sde?money(sde):'Not recorded'} label="Earnings (SDE)" small={!sde}/></div>
    <p className="adv-note" role="status" aria-live="polite" hidden={!msg}>{msg}</p>
    <div className="deal-body">
      <aside className="deal-rail" aria-label="Deal summary">
        <NextSteps c={c} readOnly={p.readOnly}/>
        <Panel title="Key dates"><Timeline c={c} listing={listing}/></Panel>
        <Panel title="What happens next"><ol className="deal-check">{stageChecklist[stage].map(t=><li key={t}>{t}</li>)}</ol></Panel>
      </aside>
      <main className="deal-main">
        <Tabs label="Deal Room sections" tabs={dealTabs.map(t=>({id:t,count:counts[t]}))} current={tab} onChange={p.setTab}/>
        <div className="adv-tabpanel" role="tabpanel" aria-label={tab}>
          {tab==='Overview'&&<Overview c={c} listing={listing} stage={stage} w={p.w}/>}
          {tab==='Valuation and recast'&&<RecastEditor key={c.id} c={c} w={p.w} commit={p.commit} actor={p.actor} readOnly={p.readOnly} askingPrice={listing?.askingPrice}/>}
          {tab==='Listing'&&<ListingEditor key={c.id} listing={listing} company={c} onSaved={()=>{if(before('Preparing'))void move('Preparing','Listing saved as a draft. The deal is now Preparing.');}} onPublished={()=>{if(before('Listed'))void move('Listed','Published. The deal is now Listed.');}}/>}
          {tab==='Buyers'&&(listing?<><AccessRequests listingId={listing.id}/><h2 className="deal-sub">Questions from buyers</h2><QuestionThreads listingId={listing.id}/></>:<NoListing go={()=>p.setTab('Listing')}/>)}
          {tab==='Offers'&&(listing?<OfferComparison listing={listing} onAccepted={(l:Listing)=>{if(stage!=='Under LOI')void p.commit(setStage(p.w,c.id,'Under LOI',p.actor,{listing:l})).then(ok=>ok&&setMsg('The seller accepted. The deal is now Under LOI.'));}}/>:<NoListing go={()=>p.setTab('Listing')}/>)}
          {tab==='Documents'&&<OwnerPortalAdmin key={c.id+'d'} company={c} sections={['Requests']} onChange={()=>void x.reloadPortals()}/>}
          {tab==='Owner'&&<OwnerPortalAdmin key={c.id+'o'} company={c} sections={['Messages','Next steps','Buyers','Settings','Owner’s view']} onChange={()=>void x.reloadPortals()}/>}
          {tab==='Research and drafting'&&p.research}
          {tab==='Activity'&&<Activity w={p.w} c={c}/>}
        </div>
      </main>
    </div>
  </div>;
}
function NoListing({go}:{go:()=>void}){return <EmptyState title="No listing yet" action={<Button onClick={go}>Build the listing</Button>}>Buyers and offers appear here once the anonymous listing is published.</EmptyState>;}

function NextSteps({c,readOnly}:{c:Company;readOnly:boolean}){
  const x=useAdvisor(),ctx=useContext(PortalContextRef),pe=x.portals[c.id],steps=pe?.bundle?.steps||[];
  const toggle=(id:string)=>{if(!ctx.store||!pe)return;void x.act(()=>ctx.store!.saveSteps(pe.portal.id,steps.map(s=>({...s,done:s.id===id?!s.done:s.done}))));};
  return <Panel title="Next steps">{steps.length?<><ul className="deal-steps">{steps.map(s=><li key={s.id}><label><input type="checkbox" checked={s.done} disabled={readOnly||!ctx.canWrite||x.busy} onChange={()=>toggle(s.id)}/><span className={s.done?'done':''}>{s.text}<small>{s.owner==='You'?'Owner':'Kalling'}{s.due?', '+dt(s.due):''}</small></span></label></li>)}</ul><p className="adv-muted">Shared with the owner portal.</p></>
    :<><p>{c.nextAction||'No next step set.'}{c.due?<small className="adv-muted"> Due {dt(c.due)}.</small>:null}</p><p className="adv-muted">{pe?'Add next steps from the Owner tab. The owner sees them in the portal.':'Next steps shared with the owner appear once the portal exists.'}</p></>}</Panel>;
}
function Timeline({c,listing}:{c:DealCompany;listing?:Listing}){
  const x=useAdvisor(),pe=x.portals[c.id]?.portal,reqs=listing&&x.d?x.d.requests.filter(r=>r.listingId===listing.id):[],offers=listing&&x.d?x.d.offers.filter(o=>o.listingId===listing.id):[];
  const items=([['Stage last changed',c.stageChangedAt],['Owner portal created',pe?.createdAt],['Owner invited',pe?.invitedAt],['Owner joined',pe?.acceptedAt],['Listing drafted',listing?.createdAt],['Listing published',listing?.publishedAt],['First NDA signed',reqs.map(r=>r.nda.signedAt).sort()[0]],['First offer',offers.map(o=>o.createdAt).sort()[0]],['Offer accepted',offers.find(o=>o.status==='Accepted')?.updatedAt]] as [string,string|undefined][]).filter(([,d])=>d).sort((a,b)=>a[1]!.localeCompare(b[1]!));
  return items.length?<ol className="deal-time">{items.map(([t,d])=><li key={t}><span>{t}</span><time dateTime={d}>{dt(d)}</time></li>)}</ol>:<p className="adv-muted">Dates appear as the sale moves forward.</p>;
}

function Overview({c,listing,stage,w}:{c:DealCompany;listing?:Listing;stage:SellStage;w:Workspace}){
  const x=useAdvisor(),v=c.recast?recastValuation(c.recast):null,i=c.recast?.inputs,docs=x.portals[c.id]?.bundle?.requests||[];
  const summary=[`${c.name} is ${/^([aeiou]|hvac)/i.test(c.industry)?'an':'a'} ${c.industry} company in ${regionOf(c)}${c.owner?', owned by '+c.owner:''}.`,
    i&&i.revenue?`Revenue was ${money(i.revenue)} last year with ${money(recastSde(c.recast!))} in seller’s discretionary earnings.`:'Revenue and earnings are not recorded yet.',
    v&&v.mid>0?`The estimate is ${money(v.low)} to ${money(v.high)}, at ${v.multipleLow.toFixed(1)} to ${v.multipleHigh.toFixed(1)} times earnings.`:'',
    listing?`Listing ${listing.number} is ${listing.status==='Under LOI'?'under LOI':listing.status.toLowerCase()}${listing.askingPrice?' at '+money(listing.askingPrice):''}.`:'',
    `The deal is at the ${stage} stage.`].filter(Boolean).join(' ');
  const facts=[...c.evidence,...c.documents.flatMap(d=>d.evidence)].slice(0,8);
  const risks:string[]=[];
  if(i){if(i.licenseHolder==='owner-only')risks.push('Only the owner holds the HVACR license. The buyer needs a licensed manager or a transition plan.');
    if(i.ownerRole==='runs-everything')risks.push('The owner runs most of the day to day. Buyers will ask how the business runs without them.');
    if(i.topCustomerPct>=15)risks.push(`The largest customer is ${i.topCustomerPct}% of revenue.`);
    if(i.agreements===0)risks.push('No maintenance agreements are recorded.');
    if(i.newConstructionPct>=30)risks.push(`${i.newConstructionPct}% of revenue is new construction, which buyers value less.`);
    if(i.trend==='declining')risks.push('Revenue is declining.');}
  for(const w2 of v?.warnings||[])risks.push(w2);
  const open=docs.filter(r=>['Open','In progress','Needs changes'].includes(r.status)).map(r=>`Waiting for the owner: ${r.title}.`);
  if(!c.recast||!c.recast.inputs.revenue)open.unshift('Enter the owner’s numbers in Valuation and recast.');
  if(!listing&&['Engaged','Preparing'].includes(stage))open.push('Draft the anonymous listing.');
  const events=w.events.filter(e=>e.text.includes(c.name)).slice(0,5);
  return <div className="deal-overview">
    <Panel title="Deal summary"><p className="deal-summary">{summary}</p></Panel>
    <div className="adv-grid2">
      <Panel title="Key facts">{facts.length?<KeylineList>{facts.map(f=><li key={f.id}><div className="adv-grow"><strong>{f.value}</strong><small>{f.field.replaceAll('_',' ')}. Source: {f.source}{f.kind==='assumption'?' (assumption)':''}</small></div></li>)}</KeylineList>:<EmptyState title="No sourced facts yet">Facts from research and the owner’s documents appear here with their source.</EmptyState>}</Panel>
      <Panel title="Risks and open questions">{risks.length+open.length?<KeylineList>{[...risks,...open].map(r=><li key={r}>{r}</li>)}</KeylineList>:<p className="adv-muted">Nothing flagged yet. Risks come from the recast and the owner’s documents.</p>}</Panel>
    </div>
    <Panel title="Latest activity">{events.length?<KeylineList>{events.map(e=><li key={e.id}><div className="adv-grow">{e.text}<small>{dt(e.date)}</small></div></li>)}</KeylineList>:<p className="adv-muted">No activity recorded for this company yet.</p>}</Panel>
  </div>;
}

const ownerRoles:[HvacInputs['ownerRole'],string][]=[['runs-everything','Runs everything'],['key-relationships','Holds key relationships'],['manager-runs-day-to-day','A manager runs the day to day']];
const licenses:[HvacInputs['licenseHolder'],string][]=[['owner-only','Owner only'],['owner-and-employee','Owner and an employee'],['employee','An employee']];
/** Inputs saved per company; the add-backs table feeds SDE and every adjustment is explained. */
function RecastEditor({c,w,commit,actor,readOnly,askingPrice:listed}:{c:DealCompany;w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean;askingPrice?:number}){
  const [inputs,setInputs]=useState<HvacInputs>(()=>({...defaultInputs,...c.recast?.inputs})),[rows,setRows]=useState<(Partial<AddBack>&{key:string})[]>(()=>(c.recast?.addBacks||[]).map(a=>({...a,key:a.id}))),[asking,setAsking]=useState(c.recast?.askingPrice||listed||0),[msg,setMsg]=useState(''),[err,setErr]=useState('');
  useEffect(()=>setMsg(''),[inputs,rows,asking]);
  const r={inputs,addBacks:rows.map(x=>({id:x.id||x.key,item:x.item||'',amount:Number(x.amount)||0,reason:x.reason||'',evidence:x.evidence||''}))};
  const v=useMemo(()=>recastValuation(r),[JSON.stringify(r)]);// eslint-disable-line react-hooks/exhaustive-deps
  const sde=recastSde(r),cmp=askingVersusEstimate(asking,v),num=(s:string)=>Number(s.replace(/[^\d.-]/g,''))||0;
  const set=<K extends keyof HvacInputs>(k:K,val:HvacInputs[K])=>setInputs(p=>({...p,[k]:val}));
  const n=(k:'revenue'|'ownerPay'|'netProfit'|'maintenancePct'|'agreements'|'commercialPct'|'newConstructionPct'|'technicians'|'topCustomerPct'|'years',label:string,hint?:string)=><Field key={k} label={label} hint={hint}><input inputMode="numeric" value={inputs[k]||''} onChange={e=>set(k,num(e.target.value))}/></Field>;
  const docs=c.documents.map(d=>d.name);
  async function save(){setErr('');try{if(await commit(saveRecast(w,c.id,{inputs,addBacks:r.addBacks.filter(a=>a.item),askingPrice:asking},actor)))setMsg('Recast saved.');}catch(e){setErr((e as Error).message);}}
  return <form className="deal-recast" onSubmit={e=>{e.preventDefault();void save();}}>
    <fieldset disabled={readOnly}>
      <div className="deal-recast-figs" aria-live="polite"><Figure value={money(sde)} label="Seller’s discretionary earnings"/><Figure value={v&&v.mid>0?`${money(v.low)} to ${money(v.high)}`:'Enter the numbers'} label={v?`Estimated value, ${v.multipleLow.toFixed(1)} to ${v.multipleHigh.toFixed(1)} times earnings`:'Estimated value'}/></div>
      <Panel title="The owner’s numbers"><div className="adv-grid3">{n('revenue','Revenue, last full year')}{n('netProfit','Pre-tax profit')}{n('ownerPay','Owner’s pay and benefits')}</div></Panel>
      <Panel title="Add-backs" action={<Button type="button" onClick={()=>setRows(x=>[...x,{key:crypto.randomUUID(),item:'',amount:0,reason:'',evidence:''}])}>Add a line</Button>}>
        <p className="adv-muted">Costs that will not continue under a new owner. Each one needs a reason; buyers will ask for the evidence.</p>
        {rows.length?<div className="adv-table-wrap"><table className="adv-table deal-addbacks"><thead><tr><th>Item</th><th>Amount</th><th>Reason</th><th>Evidence</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>{rows.map((a,i)=>{const up=(patch:Partial<AddBack>)=>setRows(x=>x.map((y,j)=>j===i?{...y,...patch}:y));return <tr key={a.key}>
          <td><input aria-label={'Item '+(i+1)} value={a.item} onChange={e=>up({item:e.target.value})} maxLength={120} placeholder="One-time lawsuit settlement"/></td>
          <td><input aria-label={'Amount '+(i+1)} inputMode="numeric" value={a.amount||''} onChange={e=>up({amount:num(e.target.value)})}/></td>
          <td><input aria-label={'Reason '+(i+1)} value={a.reason} onChange={e=>up({reason:e.target.value})} maxLength={400} placeholder="Settled in 2025 and will not recur"/></td>
          <td><input aria-label={'Evidence '+(i+1)} list={'docs-'+c.id} value={a.evidence} onChange={e=>up({evidence:e.target.value})} maxLength={200} placeholder="2025 P&L, line 61"/></td>
          <td><Button type="button" tone="quiet" aria-label={'Remove line '+(i+1)} onClick={()=>setRows(x=>x.filter((_,j)=>j!==i))}>Remove</Button></td></tr>;})}</tbody>
          <tfoot><tr><th scope="row">Total add-backs</th><td className="adv-num">{money(r.addBacks.reduce((s,a)=>s+a.amount,0))}</td><td colSpan={3}/></tr></tfoot></table></div>:<p>No add-backs yet.</p>}
        <datalist id={'docs-'+c.id}>{docs.map(d=><option key={d} value={d}/>)}</datalist>
      </Panel>
      <Panel title="What drives the multiple"><div className="adv-grid3">
        {n('maintenancePct','Service and maintenance, % of revenue')}{n('agreements','Active maintenance agreements')}{n('commercialPct','Commercial, % of revenue')}{n('newConstructionPct','New construction, % of revenue')}{n('technicians','Field technicians')}{n('topCustomerPct','Largest customer, % of revenue')}{n('years','Years in business')}
        <Field label="Revenue trend"><select value={inputs.trend} onChange={e=>set('trend',e.target.value as HvacInputs['trend'])}><option value="growing">Growing</option><option value="flat">Flat</option><option value="declining">Declining</option></select></Field>
        <Field label="Owner’s role"><select value={inputs.ownerRole} onChange={e=>set('ownerRole',e.target.value as HvacInputs['ownerRole'])}>{ownerRoles.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Who holds the HVACR license"><select value={inputs.licenseHolder} onChange={e=>set('licenseHolder',e.target.value as HvacInputs['licenseHolder'])}>{licenses.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      {v&&<><h3 className="deal-sub">How the estimate moved</h3><p className="adv-muted">Starting band: {v.band}.</p><KeylineList>{v.adjustments.map(a=><li key={a.label}><div className="adv-grow"><strong>{a.label}</strong><small>{a.why}</small></div><span className={'adv-num '+(a.effect>0?'pos':a.effect<0?'neg':'')}>{a.effect>0?'+':''}{a.effect.toFixed(2)}x</span></li>)}</KeylineList></>}
      </Panel>
      <Panel title="Asking price"><div className="adv-grid2"><Field label="Asking price" hint={listed&&listed!==asking?`The listing shows ${money(listed)}.`:undefined}><input inputMode="numeric" value={asking||''} onChange={e=>setAsking(num(e.target.value))}/></Field>
        <div aria-live="polite">{cmp?<p className={'deal-cmp '+cmp.position}>{cmp.text}</p>:<p className="adv-muted">Enter an asking price to compare it with the estimate.</p>}</div></div></Panel>
    </fieldset>
    {err&&<p className="error-banner" role="alert">{err}</p>}
    {!readOnly&&<div className="adv-buttons"><Button tone="primary">Save recast</Button><span className="adv-muted" aria-live="polite">{msg||(c.recast?`Last saved ${dt(c.recast.updatedAt)} by ${c.recast.updatedBy}.`:'Not saved yet.')}</span></div>}
  </form>;
}

function Activity({w,c}:{w:Workspace;c:Company}){
  const events=w.events.filter(e=>e.text.includes(c.name));
  return events.length?<KeylineList>{events.map(e=><li key={e.id}><div className="adv-grow">{e.text}<small>{new Date(e.date).toLocaleString()}</small></div></li>)}</KeylineList>:<EmptyState title="No activity yet">Stage changes, recasts and research for this company are logged here.</EmptyState>;
}
