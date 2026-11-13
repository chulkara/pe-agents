// Advisor pages: Today, Deals, Sellers, Buyers, Listings and Offers.
import {useState} from 'react';
import type {Company,Workspace} from '../../lib/domain';
import {money} from '../../lib/hvacValuation';
import {sellStages,setStage,daysInStage,recastValuation,startEngagement,type DealCompany,type SellStage} from '../../lib/deals';
import {materialsOf} from '../../lib/materials';
import {acceptedInputs} from '../../lib/extract';
import {kindLabel} from './drafts';
import {classifyDoc} from '../../lib/drafting';
import {qualify,markNotFit,type QualificationInput,type NotFitReason} from '../../lib/engagement';
import {QualifyPanel,emptyQualification} from './engagement';
import type {Lead,LeadStatus,Listing} from '../../lib/brokerage';
import {useAdvisor,listingOf,stageOf,unansweredThreads,openOffer} from './data';
import {AccessRequests,BuyerDirectory,OfferComparison,QuestionThreads,ListingEditor,ListingRows,site} from './market';
import {Button,PillLink,StatusPill,Figure,Panel,KeylineList,EmptyState,Field,Tabs} from '../design/ui';
import {AdvisorLenderQueue} from '../buyer/LenderPreparation';
import {AlertQueue} from '../buyer/Alerts';
import {AdvisorVerification,VerificationPolicy} from '../buyer/Verification';
import {PortalContextRef} from '../OwnerPortalAdmin';
import {useContext} from 'react';

export type AdvisorProps={w:Workspace;commit:(next:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean;openDeal:(companyId:string,tab?:string)=>void;go:(page:string)=>void};
const dt=(s?:string)=>s?new Date(s.length===10?s+'T12:00:00':s).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
export const regionOf=(c:Company)=>(c as DealCompany).region||[c.city,c.state].filter(Boolean).join(', ');
export function headlineValue(c:Company,l?:Listing):{value:string;label:string}{
  if(l?.askingPrice)return {value:money(l.askingPrice),label:'asking'};const r=(c as DealCompany).recast;
  if(r?.askingPrice)return {value:money(r.askingPrice),label:'asking'};const v=r?recastValuation(r):null;
  return v&&v.mid>0?{value:money(v.mid),label:'estimate'}:{value:'Not valued',label:''};
}
const stageTone=(s:SellStage)=>s==='Under LOI'||s==='Closed'?'green':s==='Listed'?'purple':s==='Lost'?'plain':s==='Engaged'||s==='Preparing'?'peri':'plain';
export function StagePill({stage}:{stage:SellStage}){return <StatusPill tone={stageTone(stage)}>{stage}</StatusPill>;}
export function PageHead({title,lede,children}:{title:string;lede?:string;children?:React.ReactNode}){return <header className="adv-head"><div><h1>{title}</h1>{lede&&<p>{lede}</p>}</div>{children&&<div className="adv-buttons">{children}</div>}</header>;}

type Need={id:string;date:string;kind:string;text:string;action:string;run:()=>void};
export function TodayPage(p:AdvisorProps&{aiReview:{c:Company;label:string}[]}){
  const x=useAdvisor(),{d,portals}=x;
  const proofQueue=x.verification.filter(v=>['Submitted','In review'].includes(v.status)&&!x.verification.some(n=>n.buyerId===v.buyerId&&n.version>v.version));
  const greeting=(()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening';})();
  const companyFor=(listingId:string)=>{const l=d?.listings.find(z=>z.id===listingId);return l?.companyId?p.w.companies.find(c=>c.id===l.companyId):undefined;};
  const toPage=(listingId:string,tab:string,page:string)=>()=>{const c=companyFor(listingId);if(c)p.openDeal(c.id,tab);else p.go(page);};
  const docs=Object.values(portals).flatMap(({portal,bundle})=>(bundle?.requests||[]).filter(r=>r.status==='Submitted').map(r=>({portal,r})));
  const needs:Need[]=d?[
    ...x.alerts.filter(a=>a.status==='Awaiting review').map(a=>({id:'alert'+a.id,date:a.createdAt,kind:'Listing alert',text:'Review listing alert for '+a.recipient,action:'Review alert',run:()=>{localStorage.setItem('kalling-buyer-section','Listing alerts');p.go('Buyers');}})),
    ...x.introductions.filter(r=>['Submitted','Ready for approval'].includes(r.status)).map(r=>({id:'intro'+r.id,date:r.updatedAt,kind:'Lender request',text:r.nextStep,action:'Review introduction',run:()=>{localStorage.setItem('kalling-buyer-section','Lender requests');p.go('Buyers');}})),
    ...proofQueue.map(v=>({id:'proof'+v.id,date:v.submittedAt||v.updatedAt,kind:'Financing evidence',text:`Financing evidence version ${v.version} is waiting for review`,action:'Review evidence',run:()=>p.go('Buyers')})),
    ...d.leads.filter(l=>l.status==='New').map(l=>({id:'l'+l.id,date:l.createdAt,kind:'Seller inquiry',text:`Call ${l.name}${l.businessName?' about '+l.businessName:''}, ${l.region}`,action:'Open sellers',run:()=>p.go('Sellers')})),
    ...d.requests.filter(r=>r.status==='Pending').map(r=>{const b=d.buyers.find(z=>z.id===r.buyerId),l=d.listings.find(z=>z.id===r.listingId);return {id:'r'+r.id,date:r.createdAt,kind:'NDA request',text:`${b?.name||'A buyer'} signed the NDA for ${l?.number||'a listing'}`,action:'Review buyer',run:toPage(r.listingId,'Buyers','Buyers')};}),
    ...docs.map(({portal,r})=>({id:'d'+r.id,date:r.submittedAt||r.updatedAt,kind:'Seller documents',text:`${portal.ownerName} sent “${r.title}”`,action:'Review documents',run:()=>p.openDeal(portal.companyId,'Documents')})),
    ...unansweredThreads(d.questions).map(t=>{const q=t[t.length-1],b=d.buyers.find(z=>z.id===q.buyerId),l=d.listings.find(z=>z.id===q.listingId);return {id:'q'+q.id,date:q.createdAt,kind:'Buyer question',text:`${b?.name||'A buyer'} asked about ${l?.number}`,action:'Answer',run:toPage(q.listingId,'Buyers','Buyers')};}),
    ...d.offers.filter(o=>o.status==='Submitted').map(o=>{const b=d.buyers.find(z=>z.id===o.buyerId),l=d.listings.find(z=>z.id===o.listingId);return {id:'o'+o.id,date:o.createdAt,kind:'Offer',text:`${money(o.price)} from ${b?.name||'a buyer'} for ${l?.number}`,action:'Share with seller',run:toPage(o.listingId,'Offers','Offers')};}),
    ...Object.values(portals).flatMap(({portal,bundle})=>(bundle?.letters||[]).filter(l=>l.status==='Signed by owner').map(l=>({id:'e'+l.id,date:l.ownerSignature?.at||l.updatedAt,kind:'Engagement letter',text:`${portal.ownerName} signed the engagement letter for ${portal.businessName}`,action:'Countersign',run:()=>p.openDeal(portal.companyId,'Owner')}))),
    ...p.w.companies.flatMap(c=>{const m=materialsOf(c),b=portals[c.id]?.bundle,acc=b?acceptedInputs(b).filter(i=>['pl','tax','ledger'].includes(classifyDoc(i.name,i.requests))).map(i=>i.fileId).sort().join():'';const out:Need[]=[];
      for(const d of m.drafts.filter(d=>d.status==='ready')){const isExtract=(d.result as {mode?:string})?.mode==='extract';out.push({id:'dr'+d.id,date:d.requestedAt,kind:isExtract?'Comparable sales':'AI draft',text:isExtract?`Possible comparable sales are waiting for confirmation`:`${kindLabel[d.kind]} for ${c.name} is ready for review`,action:isExtract?'Confirm sales':'Review draft',run:isExtract?()=>p.go('Comparable sales'):()=>p.openDeal(c.id,d.kind==='recast'||d.kind==='comps'?'Valuation and recast':d.kind==='teaser'?'Listing':'Materials')});}
      const rd=m.drafts.find(d=>d.kind==='recast'&&['ready','applied'].includes(d.status));const used=(rd?.result as {documents?:{fileId:string}[]}|undefined)?.documents?.map(x=>x.fileId).sort().join();
      if(rd&&used!==undefined&&b&&acc!==used&&!rd.usedAnyway)out.push({id:'st'+rd.id,date:rd.requestedAt,kind:'Changed inputs',text:`New documents since the recast draft for ${c.name}`,action:'Draft again',run:()=>p.openDeal(c.id,'Valuation and recast')});
      if(m.cim[0]?.status==='Changes requested')out.push({id:'cim'+c.id,date:m.cim[0].createdAt,kind:'Memorandum',text:`${c.owner||'The owner'} asked for changes to the memorandum`,action:'Review changes',run:()=>p.openDeal(c.id,'Materials')});
      return out;}),
    ...x.execution.flatMap(({transaction:t})=>t.items.filter(i=>['Submitted','Changes needed'].includes(i.status)).map(i=>({id:'execution:'+i.id,date:t.createdAt,kind:'Diligence review',text:i.title+'; coordinator '+i.owner,action:'Review diligence',run:()=>p.openDeal(t.companyId,'Diligence')}))),
    ...p.aiReview.map(({c,label})=>({id:'a'+c.id,date:'',kind:'AI draft',text:`${label} for ${c.name}`,action:'Review draft',run:()=>p.openDeal(c.id,'Research and drafting')})),
  ].sort((a,b)=>b.date.localeCompare(a.date)):[];
  const counts=sellStages.map(s=>[s,p.w.companies.filter(c=>stageOf(x,c)===s).length] as const);
  return <div className="adv-page">
    <header className="adv-head"><div><p className="adv-date">{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</p><h1>{greeting}, {p.actor.split(/[@\s]/)[0]}</h1></div></header>
    <div className="adv-figures" aria-live="polite">
      <Figure value={d?.leads.filter(l=>l.status==='New').length??0} label="New seller inquiries"/>
      <Figure value={d?.requests.filter(r=>r.status==='Pending').length??0} label="NDA requests waiting"/>
      <Figure value={d?.offers.filter(openOffer).length??0} label="Open offers"/>
      <Figure value={docs.length} label="Documents to review"/>
    </div>
    {x.error&&<p className="error-banner" role="alert">{x.error}</p>}
    <div className="adv-today">
      <Panel title="Needs you" action={<span className="adv-muted">{needs.length} item{needs.length===1?'':'s'}</span>}>
        {needs.length?<KeylineList className="adv-needs">{needs.slice(0,25).map(n=><li key={n.id}><div><small>{n.kind}{n.date?', '+dt(n.date):''}</small><strong>{n.text}</strong></div><Button arrow onClick={n.run}>{n.action}</Button></li>)}</KeylineList>
          :<EmptyState title="Nothing is waiting for you">New inquiries, NDA requests, seller documents, buyer questions and offers appear here as they arrive.</EmptyState>}
      </Panel>
      <Panel title="Deals by stage" action={<Button tone="quiet" onClick={()=>p.go('Deals')}>Open pipeline</Button>}>
        <ol className="adv-strip">{counts.map(([s,n])=><li key={s}><button type="button" onClick={()=>p.go('Deals')}><span>{s}</span><b className="k-figure">{n}</b></button></li>)}</ol>
      </Panel>
    </div>
  </div>;
}

export function DealsPage(p:AdvisorProps){
  const x=useAdvisor();const [view,setView]=useState<'Board'|'Table'>(()=>{try{return localStorage.getItem('kalling-deals-view')==='Table'?'Table':'Board';}catch{return 'Board';}}),[drag,setDrag]=useState(''),[over,setOver]=useState(''),[msg,setMsg]=useState('');
  const choose=(v:'Board'|'Table')=>{setView(v);try{localStorage.setItem('kalling-deals-view',v);}catch{/* private mode */}};
  const rows=p.w.companies.map(c=>({c,stage:stageOf(x,c),l:listingOf(x.d,c)}));
  async function move(id:string,to:SellStage){const r=rows.find(r=>r.c.id===id);if(!r||r.stage===to)return;try{const next=setStage(p.w,id,to,p.actor,{listing:r.l,portal:x.portals[id]?.portal});if(await p.commit(next))setMsg(`${r.c.name} moved to ${to}.`);}catch(e){setMsg((e as Error).message);}}
  const menu=(r:typeof rows[number])=><select className="adv-stage-menu" aria-label={'Stage for '+r.c.name} value={r.stage} disabled={p.readOnly} onChange={e=>void move(r.c.id,e.target.value as SellStage)}>{sellStages.map(s=><option key={s}>{s}</option>)}</select>;
  const card=(r:typeof rows[number])=>{const v=headlineValue(r.c,r.l),days=daysInStage(r.c);return <article key={r.c.id} className={'adv-card'+(drag===r.c.id?' dragging':'')} draggable={!p.readOnly} onDragStart={e=>{setDrag(r.c.id);e.dataTransfer.setData('text/plain',r.c.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{setDrag('');setOver('');}}>
    <button type="button" className="adv-card-open" onClick={()=>p.openDeal(r.c.id)}><strong>{r.c.name}</strong><small>{regionOf(r.c)}</small></button>
    <p className="adv-card-value"><span className="k-figure">{v.value}</span> {v.label}</p>
    <dl><div><dt>Owner</dt><dd>{r.c.owner||'Not known yet'}</dd></div><div><dt>In stage</dt><dd>{days===null?'Not tracked':days===0?'Today':days+' day'+(days===1?'':'s')}</dd></div></dl>
    <p className="adv-card-next">{r.c.nextAction||'No next step'}{r.c.due?<span>, due {dt(r.c.due)}</span>:null}</p>{menu(r)}</article>;};
  return <div className="adv-page">
    <PageHead title="Deals" lede="Every seller you represent, by stage. Drag a card or use its stage menu to move it. Each move is logged."><Tabs label="View" tabs={[{id:'Board'},{id:'Table'}]} current={view} onChange={v=>choose(v as 'Board'|'Table')}/></PageHead>
    <p className="sr-only" aria-live="polite">{msg}</p>{msg&&<p className="adv-note" role="status">{msg}</p>}
    {view==='Board'?<div className="adv-board">{sellStages.map(s=>{const list=rows.filter(r=>r.stage===s);return <section key={s} className={'adv-col'+(over===s?' over':'')} aria-label={s} onDragOver={e=>{if(!drag)return;e.preventDefault();setOver(s);}} onDragLeave={()=>setOver(o=>o===s?'':o)} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain')||drag;setOver('');setDrag('');void move(id,s);}}>
      <h2>{s}<span>{list.length}</span></h2>{list.map(card)}{!list.length&&<p className="adv-col-empty">None</p>}</section>;})}</div>
    :<div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Business</th><th>Region</th><th>Asking or estimate</th><th>Owner</th><th>In stage</th><th>Next step</th><th>Due</th><th>Stage</th></tr></thead><tbody>{rows.map(r=>{const v=headlineValue(r.c,r.l),days=daysInStage(r.c);return <tr key={r.c.id}><td><button type="button" className="adv-link" onClick={()=>p.openDeal(r.c.id)}>{r.c.name}</button></td><td>{regionOf(r.c)}</td><td className="adv-num">{v.value}</td><td>{r.c.owner||'Not known'}</td><td>{days===null?'':days+'d'}</td><td>{r.c.nextAction}</td><td>{dt(r.c.due)}</td><td>{menu(r)}</td></tr>;})}</tbody></table></div>}
  </div>;
}

export function SellersPage(p:AdvisorProps){
  const x=useAdvisor(),portal=useContext(PortalContextRef);const [busy,setBusy]=useState(''),[err,setErr]=useState('');
  const linked=(l:Lead)=>p.w.companies.find(c=>(c as DealCompany).leadId===l.id);
  const [open,setOpen]=useState('');
  async function qualifyLead(l:Lead,q:QualificationInput){setBusy(l.id);setErr('');try{
    const existing=linked(l);let w=p.w,id=existing?.id;
    if(!id){const r=startEngagement(w,l,p.actor,'Lead');w=r.workspace;id=r.companyId;}
    if(!await p.commit(qualify(w,id,q,p.actor)))return;
    await x.act(()=>x.store.updateLead(l.id,{status:'Qualified'}));setOpen('');p.openDeal(id,'Owner');
  }catch(e){setErr((e as Error).message);}finally{setBusy('');}}
  async function notFit(l:Lead,reason:NotFitReason,note:string,q:QualificationInput){setBusy(l.id);setErr('');try{
    const existing=linked(l);if(existing)await p.commit(markNotFit(p.w,existing.id,reason,note,p.actor,q));
    await x.act(()=>x.store.updateLead(l.id,{status:'Not a fit',notes:[l.notes,`Not a fit: ${reason}. ${note}`].filter(Boolean).join('\n')}));setOpen('');
  }catch(e){setErr((e as Error).message);}finally{setBusy('');}}
  const owners=p.w.companies.filter(c=>!c.sample&&c.owner);
  return <div className="adv-page">
    <PageHead title="Sellers" lede="Owners who asked for a valuation or a call, and the owners you already work with. Qualify an inquiry during the first call; a qualified seller moves to Deals, where you prepare the engagement letter."><PillLink href={site('/value')} target="_blank" rel="noreferrer">Open the valuation page</PillLink></PageHead>
    {(err||x.error)&&<p className="error-banner" role="alert">{err||x.error}</p>}
    <Panel title="Inquiries">{!x.d?.leads.length?<EmptyState title="No inquiries yet">They arrive from the public valuation form and the contact form.</EmptyState>:
      <div className="adv-rows">{x.d.leads.map(l=>{const c=linked(l),est=l.valuation;return <article key={l.id} className={'adv-row'+(l.status==='New'?' adv-row-new':'')}>
        <header><div><h3>{l.name}{l.businessName?', '+l.businessName:''}</h3><p>{l.region}. {l.timing}. Asked {dt(l.createdAt)}. <a href={'mailto:'+l.email}>{l.email}</a>{l.phone?<>, <a href={'tel:'+l.phone}>{l.phone}</a></>:null}</p></div>
          <select aria-label={'Status for '+l.name} value={l.status} disabled={!!busy||p.readOnly} onChange={e=>void x.act(()=>x.store.updateLead(l.id,{status:e.target.value as LeadStatus}))}>{['New','Contacted','Qualified','Engaged','Not a fit'].map(s=><option key={s}>{s}</option>)}</select></header>
        {est&&<p className="adv-est"><span className="k-figure">{money(est.low)} to {money(est.high)}</span> estimated on {money(est.revenue)} revenue and {money(est.sde)} earnings</p>}
        {l.message&&<p className="adv-quote">“{l.message}”</p>}
        <Field label="Call notes"><textarea rows={2} defaultValue={l.notes} disabled={p.readOnly} onBlur={e=>{if(e.target.value!==l.notes)void x.act(()=>x.store.updateLead(l.id,{notes:e.target.value}));}}/></Field>
        <div className="adv-buttons">{c&&<Button arrow onClick={()=>p.openDeal(c.id)}>Open Deal Room</Button>}{!p.readOnly&&!['Not a fit','Engaged','Qualified'].includes(l.status)&&open!==l.id&&<Button tone="primary" disabled={!!busy} onClick={()=>setOpen(l.id)}>Qualify</Button>}</div>
        {open===l.id&&<QualifyPanel initial={emptyQualification(c)} estimate={est?`${money(est.low)} to ${money(est.high)} on ${money(est.revenue)} revenue`:undefined} busy={busy===l.id} onCancel={()=>setOpen('')} onQualified={q=>void qualifyLead(l,q)} onNotFit={(r,n,q)=>void notFit(l,r,n,q)}/>}
      </article>;})}</div>}</Panel>
    <Panel title="Owner contacts">{owners.length?<KeylineList>{owners.map(c=><li key={c.id}><div className="adv-grow"><strong>{c.owner}</strong><small>{c.name}. {regionOf(c)}{c.email?'. '+c.email:''}{c.phone?'. '+c.phone:''}</small></div><StagePill stage={stageOf(x,c)}/><Button tone="quiet" onClick={()=>p.openDeal(c.id,'Owner')}>Owner</Button></li>)}</KeylineList>:<EmptyState title="No owner contacts yet">Owners appear here once a business is in Deals with an owner name.</EmptyState>}</Panel>
  </div>;
}

export function BuyersPage(p:AdvisorProps){
  const x=useAdvisor();const queue=x.verification.filter(v=>['Submitted','In review'].includes(v.status)&&!x.verification.some(n=>n.buyerId===v.buyerId&&n.version>v.version));
  const [tab,setTab]=useState(()=>localStorage.getItem('kalling-buyer-section')||(queue.length?'Evidence review':'NDA requests')),pending=x.d?.requests.filter(r=>r.status==='Pending').length||0,qs=x.d?unansweredThreads(x.d.questions).length:0;
  return <div className="adv-page"><PageHead title="Buyers" lede="Buyer profiles, NDA requests and questions. Approving a buyer shares the confidential details and adds them, without a name, to the owner’s portal."/>
    {x.error&&<p className="error-banner" role="alert">{x.error}</p>}
    <Tabs label="Buyer sections" tabs={[{id:'NDA requests',count:pending},{id:'All buyers'},{id:'Evidence review',count:queue.length},{id:'Listing alerts'},{id:'Lender requests'},{id:'Questions',count:qs}]} current={tab} onChange={t=>{setTab(t);localStorage.setItem('kalling-buyer-section',t);}}/>
    <div className="adv-tabpanel">{tab==='NDA requests'?<AccessRequests/>:tab==='All buyers'?<BuyerDirectory/>:tab==='Evidence review'?<>{!p.readOnly&&<VerificationPolicy store={x.store.verification}/>}{x.verificationError&&<p role="alert">{x.verificationError}</p>}{queue.length?queue.map(v=><AdvisorVerification key={v.id} store={x.store.verification} buyerId={v.buyerId} readOnly={p.readOnly} onChanged={()=>void x.reload()}/>):<EmptyState title="No evidence waiting for review">Buyer submissions appear here after they send their financing evidence.</EmptyState>}</>:tab==='Listing alerts'?<AlertQueue store={x.store.alerts} readOnly={p.readOnly}/>:tab==='Lender requests'?<AdvisorLenderQueue store={x.store.lenders} readOnly={p.readOnly}/>:<QuestionThreads/>}</div></div>;
}

export function ListingsPage(p:AdvisorProps){
  const x=useAdvisor();const [edit,setEdit]=useState<Listing|'new'|null>(null);const companies=p.w.companies.filter(c=>!c.sample);
  return <div className="adv-page"><PageHead title="Listings" lede="Anonymous teasers on the public marketplace. Build a company’s listing in its Deal Room, or here for a listing without a workspace company.">{!p.readOnly&&!edit&&<Button tone="primary" onClick={()=>setEdit('new')}>New listing</Button>}<PillLink href={site('/listings')} target="_blank" rel="noreferrer">Public marketplace</PillLink></PageHead>
    {x.error&&<p className="error-banner" role="alert">{x.error}</p>}
    {edit?<ListingEditor key={edit==='new'?'new':edit.id} listing={edit==='new'?undefined:edit} companies={companies} onCancel={()=>setEdit(null)}/>:<ListingRows companies={p.w.companies} onEdit={l=>setEdit(l)} onOpenDeal={id=>p.openDeal(id,'Listing')}/>}
  </div>;
}

export function OffersPage(p:AdvisorProps){
  const x=useAdvisor();const listings=(x.d?.listings||[]).filter(l=>x.d!.offers.some(o=>o.listingId===l.id));
  const accepted=(l:Listing)=>{const c=p.w.companies.find(z=>z.id===l.companyId);if(c&&stageOf(x,c)!=='Under LOI'){try{void p.commit(setStage(p.w,c.id,'Under LOI',p.actor,{listing:l}));}catch{/* already there */}}};
  return <div className="adv-page"><PageHead title="Offers" lede="Compare terms and versions before deciding which offers to share with the owner."/>
    {x.error&&<p className="error-banner" role="alert">{x.error}</p>}
    {listings.length?listings.map(l=><Panel key={l.id} title={`${l.number}. ${l.headline}`} action={<span className="adv-muted">{money(l.askingPrice)} asking</span>}><OfferComparison listing={l} onAccepted={accepted}/></Panel>)
      :<EmptyState title="No offers yet">Approved buyers make offers from the listing page.</EmptyState>}
  </div>;
}
