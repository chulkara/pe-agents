// Drafting on the research computer: start a draft, follow its progress, review what comes back.
import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {Company,Workspace} from '../../lib/domain';
import {makePacket,checkedRecastLines,classifyDoc,supportsDrafting,workerUpdateCommand,validateTeaser,type DraftKind,type DraftPacket,type DocInput,type ExtractedLine} from '../../lib/drafting';
import {materialsOf,recordDraft,updateDraft,latestDraft,isStale,useAnyway,type DraftRecord} from '../../lib/materials';
import {recastTable,mismatches,proposals,applyProposals,trend,type Proposal,type Decision} from '../../lib/recastDraft';
import {saveRecast,type DealCompany} from '../../lib/deals';
import {acceptedInputs,type Extract} from '../../lib/extract';
import {lastFullYears} from '../../lib/engagement';
import {checkTeaser,blocking,applySuggestion,type Finding} from '../../lib/anonymity';
import {money} from '../../lib/hvacValuation';
import {useAgentRuntime,useComputer,useJobs} from '../AgentRuntime';
import {PortalContextRef} from '../OwnerPortalAdmin';
import {useAdvisor} from './data';
import {Button,StatusPill,Panel,EmptyState} from '../design/ui';

const dt=(s?:string)=>s?new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
export const kindLabel:Record<DraftKind,string>={recast:'Recast from documents',teaser:'Teaser',cim:'Memorandum',comps:'Comparable sales'};

/** Accepted documents with their extracted text, for a company's portal. */
export function useInputs(c:Company){
  const x=useAdvisor(),ctx=useContext(PortalContextRef),pe=x.portals[c.id];const [ex,setEx]=useState<Extract[]>([]);
  const key=pe?.bundle?pe.bundle.requests.map(r=>r.id+r.status+r.fileIds.join()).join('|'):'';
  useEffect(()=>{let live=true;if(!pe||!ctx.store)return;void ctx.store.extracts(pe.portal.id).then(e=>{if(live)setEx(e);}).catch(()=>{});return()=>{live=false;};},[pe?.portal.id,ctx.store,key]);// eslint-disable-line react-hooks/exhaustive-deps
  const inputs=pe?.bundle?acceptedInputs(pe.bundle):[];
  const docs:(DocInput&{status:string;note:string})[]=inputs.map(i=>{const e=ex.find(z=>z.fileId===i.fileId);return {fileId:i.fileId,name:i.name,kind:classifyDoc(i.name,i.requests),textHash:e?.textHash||'',pages:e?.status==='ok'?e.pages:[],status:e?e.status:'not read',note:e?.note||'Accept the request to read the text.'};});
  return {docs,extracts:ex,bundle:pe?.bundle,portalId:pe?.portal.id,store:ctx.store};
}
export async function openCitation(store:{download(f:{id:string;portalId:string;name:string;mime:string;size:number;sha256:string;status:'stored';uploadedBy:string;side:'firm'|'seller';createdAt:string}):Promise<Blob>}|null,files:{id:string}[],fileId:string,page:number){
  const f=files.find(x=>x.id===fileId) as Parameters<NonNullable<typeof store>['download']>[0]|undefined;if(!store||!f)return;const b=await store.download(f);const u=URL.createObjectURL(b);window.open(u+(f.mime==='application/pdf'?'#page='+page:''),'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(u),60000);
}

/** Start drafts, poll the research computer, and store results on the company. Nothing is applied here. */
export function useDrafts(c:Company,w:Workspace,commit:(n:Workspace)=>Promise<boolean>,actor:string){
  const rt=useAgentRuntime(),computer=useComputer(rt.backend).view,m=materialsOf(c);
  const queued=m.drafts.filter(d=>d.status==='queued');const {jobs}=useJobs(rt.backend,queued.map(d=>d.id));
  const wRef=useRef(w);wRef.current=w;const saving=useRef(false);
  useEffect(()=>{if(saving.current)return;let next=wRef.current;let changed=false;
    for(const d of queued){const j=jobs[d.id];if(!j)continue;
      if(j.status==='succeeded'&&j.result){const r=j.result as {model?:string};next=updateDraft(next,c.id,d.id,{status:'ready',result:j.result,model:r.model});changed=true;}
      else if(j.status==='failed'||j.status==='cancelled'){next=updateDraft(next,c.id,d.id,{status:'failed',error:j.error||'The draft did not finish.'});changed=true;}}
    if(changed){saving.current=true;void commit(next).finally(()=>{saving.current=false;});}
  },[jobs]);// eslint-disable-line react-hooks/exhaustive-deps
  const ready=!rt.backend?'Connect a research computer in Accounts and cloud.':computer.state==='unreachable'||computer.state==='not-connected'?computer.detail:computer.version&&!supportsDrafting(computer.version)?`Update the worker on your Mac to draft documents. Run: ${workerUpdateCommand}`:'';
  async function start(packet:DraftPacket){if(!rt.backend)throw Error('Connect a research computer first.');if(computer.version&&!supportsDrafting(computer.version))throw Error(`Update the worker on your Mac first: ${workerUpdateCommand}`);
    await rt.backend.submit(packet.kind,packet);await commit(recordDraft(wRef.current,c.id,{id:packet.id,kind:packet.kind,inputHash:packet.inputHash},actor));}
  return {m,jobs,start,computer,blocked:ready,role:rt.role};
}

export function DraftStatus({d,job,stale,onUseAnyway,onRetry}:{d?:DraftRecord;job?:{progress?:{label?:string};status:string;error?:string};stale:boolean;onUseAnyway?:(note:string)=>void;onRetry?:()=>void}){
  const [note,setNote]=useState('');if(!d)return null;
  return <div className="drf-status" aria-live="polite">
    {d.status==='queued'&&<p className="adv-note"><span className="drf-spinner" aria-hidden="true"/>{job?.progress?.label||(job?.status==='queued'?'Waiting for the research computer':'Starting the draft')}. Requested {dt(d.requestedAt)}.</p>}
    {d.status==='failed'&&<p className="error-banner" role="alert">The draft did not finish: {d.error} {onRetry&&<Button tone="quiet" onClick={onRetry}>Try again</Button>}</p>}
    {d.status!=='queued'&&d.status!=='failed'&&<p className="adv-muted">Drafted {dt(d.requestedAt)} by {d.model||'local Qwen'} on your research computer. {d.status==='applied'?`Applied by ${d.decidedBy} ${dt(d.decidedAt)}.`:d.status==='dismissed'?'Dismissed.':'Waiting for your review.'}</p>}
    {stale&&d.status!=='queued'&&<div className="drf-stale" role="status"><strong>Inputs changed since this draft.</strong> Run a fresh draft, or use this one anyway with a note.
      {onUseAnyway&&<div className="adv-buttons"><input aria-label="Why this draft is still right" placeholder="Why it is still right to use" value={note} onChange={e=>setNote(e.target.value)}/><Button disabled={note.trim().length<5} onClick={()=>onUseAnyway(note)}>Use anyway</Button></div>}</div>}
    {d.usedAnyway&&<p className="adv-muted">Used anyway by {d.usedAnyway.by}: {d.usedAnyway.note}</p>}
  </div>;
}

// ── Recast from documents ───────────────────────────────────────────────────────────────────
export function RecastDraftPanel({c,w,commit,actor,readOnly}:{c:Company;w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean}){
  const dc=c as DealCompany,{docs,bundle,store}=useInputs(c),D=useDrafts(c,w,commit,actor);
  const usable=docs.filter(d=>['pl','tax','ledger'].includes(d.kind)&&d.pages.length);
  const [packet,setPacket]=useState<DraftPacket|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[dec,setDec]=useState<Record<string,{decision:Decision;amount?:number}>>({}),[msg,setMsg]=useState('');
  const years=lastFullYears(new Date());
  useEffect(()=>{let live=true;if(!usable.length){setPacket(null);return;}void makePacket('recast',{id:c.id,name:c.name,region:dc.region||'',state:c.state,industry:c.industry},{documents:usable.map(({status:_s,note:_n,...d})=>d),years}).then(p=>{if(live)setPacket(p);});return()=>{live=false;};},[usable.map(d=>d.textHash).join()]);// eslint-disable-line react-hooks/exhaustive-deps
  const d=latestDraft(D.m,'recast'),rawResult=d?.result as {lines:ExtractedLine[];rejected:number}|undefined,stale=isStale(d,packet?.inputHash);
  const res=useMemo(()=>{if(!rawResult)return;const checked=checkedRecastLines(rawResult.lines,usable,years);return {...rawResult,lines:checked.lines,rejected:(Number(rawResult.rejected)||0)+checked.rejected};},[rawResult,usable.map(d=>d.textHash).join()]);// eslint-disable-line react-hooks/exhaustive-deps
  const table=useMemo(()=>res?recastTable(res.lines,years):[],[res]);// eslint-disable-line react-hooks/exhaustive-deps
  const mis=useMemo(()=>res?mismatches(res.lines):[],[res]);
  const props=useMemo(()=>res?proposals(res.lines,docs):[],[res]);// eslint-disable-line react-hooks/exhaustive-deps
  const tr=trend(table);const baseline=w.firm.draftBaselines?.recast;
  async function start(){if(!packet)return;setBusy(true);setErr('');try{await D.start(packet);setDec({});}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  async function apply(){if(!d)return;setBusy(true);setErr('');try{const cur=dc.recast||{inputs:{...(await import('../../lib/deals')).defaultInputs},addBacks:[],askingPrice:0,updatedAt:'',updatedBy:''};
    const next=applyProposals(cur,props,dec);let nw=saveRecast(w,c.id,{...next,sourceDraftId:d.id},actor,'draft',`From draft ${d.id.slice(-8)}`);nw=updateDraft(nw,c.id,d.id,{status:'applied',decidedAt:new Date().toISOString(),decidedBy:actor});
    if(await commit(nw))setMsg(`Applied ${Object.values(dec).filter(x=>x.decision==='accept').length} lines to the recast.${baseline?` This draft saved you about ${baseline} minutes.`:''}`);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  const decided=props.filter(p=>dec[p.id]);
  return <Panel title="Draft from documents" className="drf-panel" action={d&&<StatusPill tone={d.status==='ready'?'purple':d.status==='applied'?'green':d.status==='failed'?'warn':'peri'}>{d.status==='ready'?'Ready for review':d.status==='queued'?'Drafting':d.status[0].toUpperCase()+d.status.slice(1)}</StatusPill>}>
    <p className="adv-muted">The research computer reads the accepted profit and loss statements and tax returns and proposes each figure with its page. Code does the arithmetic. Nothing changes the recast until you apply the lines you accept.</p>
    {docs.length?<ul className="drf-docs">{docs.map(x=><li key={x.fileId}><span>{x.name}</span><small>{x.kind==='pl'?'Profit and loss':x.kind==='tax'?'Tax return':x.kind==='ledger'?'General ledger':'Other'}. {x.status==='ok'?`${x.pages.length} page${x.pages.length===1?'':'s'} read`:x.note}</small></li>)}</ul>:<EmptyState title="No accepted documents yet">Accept the owner’s profit and loss statements and tax returns in the Documents tab. Their text is read when you accept them.</EmptyState>}
    {err&&<p className="error-banner" role="alert">{err}</p>}{D.blocked&&<p className="drf-blocked" role="status">{D.blocked}</p>}
    {!readOnly&&<div className="adv-buttons"><Button tone={d?'plain':'primary'} disabled={busy||!packet||!!D.blocked||d?.status==='queued'} onClick={()=>void start()}>{d?'Draft again':'Draft recast'}</Button>{!usable.length&&docs.length>0&&<span className="adv-muted">No readable statements yet.</span>}</div>}
    <DraftStatus d={d} job={d?D.jobs[d.id]:undefined} stale={stale} onRetry={()=>void start()} onUseAnyway={readOnly?undefined:n=>void commit(useAnyway(w,c.id,d!.id,n,actor))}/>
    {res&&d?.status!=='queued'&&<>
      <h3 className="deal-sub">Extracted figures by year · proposals</h3><p className="adv-muted">This table retains the extraction before your decisions. The memorandum uses the saved recast after your edits and skips.</p>
      <div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Year</th><th>Revenue</th><th>Net income</th><th>Owner pay</th><th>D, A and I</th><th>Add-backs</th><th>SDE</th><th>Adjusted EBITDA</th></tr></thead><tbody>{table.map(r=><tr key={r.year}><td>{r.year}</td><td className="adv-num">{r.revenue===null?'Not found':money(r.revenue)}</td><td className="adv-num">{r.netIncome===null?'Not found':money(r.netIncome)}</td><td className="adv-num">{money(r.ownerPay)}</td><td className="adv-num">{money(r.depreciation+r.amortization+r.interest)}</td><td className="adv-num">{money(r.addBacks)}</td><td className="adv-num adv-price">{r.sde===null?'Not found':money(r.sde)}</td><td className="adv-num">{r.ebitda===null?'':money(r.ebitda)}</td></tr>)}</tbody></table></div>
      <p className="adv-muted">Three-year trend: revenue {tr.revenuePct===null?'not enough years':`${tr.revenuePct>0?'+':''}${tr.revenuePct}% a year`}, SDE {tr.sdePct===null?'not enough years':`${tr.sdePct>0?'+':''}${tr.sdePct}% a year`}. {res.rejected>0&&`${res.rejected} proposed figure${res.rejected===1?' was':'s were'} dropped because the amount was not on the cited page.`}</p>
      {mis.length>0&&<div className="drf-mismatch" role="note"><strong>Check with the owner</strong><ul>{mis.map(x=><li key={x.year+x.what}>{x.year}: {x.what} differ by {x.diffPct}% ({money(x.pl)} against {money(x.tax)}). <button type="button" className="text-link" onClick={()=>void openCitation(store,bundle?.files||[],x.plCite.fileId,x.plCite.page)}>{x.plCite.name}, page {x.plCite.page}</button> and <button type="button" className="text-link" onClick={()=>void openCitation(store,bundle?.files||[],x.taxCite.fileId,x.taxCite.page)}>{x.taxCite.name}, page {x.taxCite.page}</button></li>)}</ul></div>}
      <h3 className="deal-sub">Proposed lines for {props[0]?.year}</h3>
      <div className="adv-table-wrap"><table className="adv-table drf-props"><thead><tr><th>Line</th><th>Amount</th><th>Reason</th><th>Source</th><th>Confidence</th><th><span className="sr-only">Decision</span></th></tr></thead><tbody>
        {props.map(p=><PropRow key={p.id} p={p} dec={dec[p.id]} readOnly={readOnly||d?.status!=='ready'} set={v=>setDec(s=>({...s,[p.id]:v}))} open={()=>void openCitation(store,bundle?.files||[],p.citation.fileId,p.citation.page)}/>)}
      </tbody></table></div>
      {!readOnly&&d?.status==='ready'&&<div className="adv-buttons"><Button onClick={()=>setDec(Object.fromEntries(props.map(p=>[p.id,{decision:p.support==='Supported'?'accept':'skip' as Decision}])))}>Accept supported, skip the rest</Button><Button tone="primary" disabled={busy||!props.length||decided.length<props.length||stale} onClick={()=>void apply()}>Apply accepted lines</Button><span className="adv-muted">{decided.length} of {props.length} decided{stale?'. Inputs changed: run a fresh draft or use this one anyway.':''}</span></div>}
      <p className="adv-muted" role="status" aria-live="polite">{msg}</p>
    </>}
  </Panel>;
}
function PropRow({p,dec,set,open,readOnly}:{p:Proposal;dec?:{decision:Decision;amount?:number};set:(v:{decision:Decision;amount?:number})=>void;open:()=>void;readOnly:boolean}){
  const [edit,setEdit]=useState(false),[amt,setAmt]=useState(String(dec?.amount??p.amount));
  return <tr className={dec?.decision==='skip'?'skipped':dec?.decision==='accept'?'accepted':''}>
    <td><strong>{p.item}</strong><small>{p.target==='ownerPay'?'Owner pay':p.target==='addBack'?'Add-back':p.target==='netProfit'?'Net profit':'Revenue'}</small>{p.support==='Ask the owner'&&<StatusPill tone="warn">Ask the owner</StatusPill>}</td>
    <td className="adv-num">{edit?<input aria-label={'Amount for '+p.item} inputMode="numeric" value={amt} onChange={e=>setAmt(e.target.value)} onBlur={()=>{set({decision:'accept',amount:Number(amt.replace(/[^\d.-]/g,''))});setEdit(false);}}/>:money(dec?.amount??p.amount)}</td>
    <td>{p.reason}</td>
    <td><button type="button" className="text-link" onClick={open}>{p.citation.name}, page {p.citation.page}</button><small className="drf-excerpt">“{p.citation.excerpt}”</small></td>
    <td>{p.confidence==='high'?'High':'Medium'}</td>
    <td className="adv-actions">{!readOnly&&<><Button tone={dec?.decision==='accept'?'primary':'plain'} aria-pressed={dec?.decision==='accept'} onClick={()=>set({decision:'accept',amount:dec?.amount})}>Accept</Button><Button tone="quiet" onClick={()=>setEdit(true)}>Edit</Button><Button tone="quiet" aria-pressed={dec?.decision==='skip'} onClick={()=>set({decision:'skip'})}>Skip</Button></>}</td>
  </tr>;
}

// ── Teaser from the recast ──────────────────────────────────────────────────────────────────
export type TeaserFields={headline:string;summary:string;highlights:string[];growth:string[];reason:string};
export function teaserFacts(c:Company){const dc=c as DealCompany&{qualification?:{reason:string;timing:string;license:string;notes:string}},r=dc.recast,q=dc.qualification;
  return {facts:{region:dc.region||c.state,industry:c.industry,agreements:r?.inputs.agreements||0,technicians:r?.inputs.technicians||0,years:r?.inputs.years||0,recurringPct:r?.inputs.maintenancePct||0,commercialPct:r?.inputs.commercialPct||0,newConstructionPct:r?.inputs.newConstructionPct||0,trend:r?.inputs.trend||'flat',license:q?.license||'',reason:q?.reason||''},goals:q?{timing:q.timing,notes:q.notes}:{}};}
export function TeaserDraftPanel({c,w,commit,actor,readOnly,current,onAccept}:{c:Company;w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean;current:TeaserFields;onAccept:(f:Partial<TeaserFields>,all:boolean)=>void}){
  const dc=c as DealCompany,D=useDrafts(c,w,commit,actor);const [packet,setPacket]=useState<DraftPacket|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
  const inputs=teaserFacts(c);const ikey=JSON.stringify(inputs);
  useEffect(()=>{let live=true;void makePacket('teaser',{id:c.id,name:'Anonymous HVAC company',region:dc.region||'',state:c.state,industry:c.industry},inputs).then(p=>{if(live)setPacket(p);});return()=>{live=false;};},[ikey]);// eslint-disable-line react-hooks/exhaustive-deps
  const d=latestDraft(D.m,'teaser'),stale=isStale(d,packet?.inputHash);
  let t:TeaserFields|null=null;try{t=d?.result?validateTeaser((d.result as {teaser:unknown}).teaser):null;}catch{t=null;}
  const findings:Finding[]=t?checkTeaser({headline:t.headline,summary:t.summary,highlights:t.highlights,growth:t.growth,reason:t.reason},{businessName:c.name,ownerName:c.owner,city:c.city,website:c.website,region:dc.region||''}):[];
  const fix=(k:keyof TeaserFields,v:string|string[])=>{let out=v;for(const f of blocking(findings).filter(f=>f.field===k||Array.isArray(v)))out=Array.isArray(out)?out.map(s=>applySuggestion(s,f,dc.region)):applySuggestion(out,f,dc.region);return out;};
  async function start(){if(!packet)return;setBusy(true);setErr('');try{await D.start(packet);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  const rows:[keyof TeaserFields,string][]=[['headline','Headline'],['summary','Summary'],['highlights','Highlights'],['growth','Room to grow'],['reason','Reason for sale']];
  const show=(v:string|string[])=>Array.isArray(v)?v.join('\n'):v;
  return <Panel title="Draft from recast" className="drf-panel">
    <p className="adv-muted">The research computer writes the anonymous teaser from the reviewed recast and the facts you recorded. Figures come from the recast, not the model. The anonymity check runs on the draft before you see it.</p>
    {err&&<p className="error-banner" role="alert">{err}</p>}{D.blocked&&<p className="drf-blocked" role="status">{D.blocked}</p>}
    {!readOnly&&<div className="adv-buttons"><Button tone={d?'plain':'primary'} disabled={busy||!packet||!!D.blocked||d?.status==='queued'||!dc.recast} onClick={()=>void start()}>{d?'Draft again':'Draft teaser'}</Button>{!dc.recast&&<span className="adv-muted">Save the recast first.</span>}</div>}
    <DraftStatus d={d} job={d?D.jobs[d.id]:undefined} stale={stale} onRetry={()=>void start()} onUseAnyway={readOnly?undefined:n=>void commit(useAnyway(w,c.id,d!.id,n,actor))}/>
    {t&&d?.status!=='queued'&&<>
      {findings.length>0&&<div className="drf-findings" role="alert"><strong>{blocking(findings).length?'The draft identifies the business':'Check before publishing'}</strong><ul>{findings.map((f,i)=><li key={i}><b>“{f.text}”</b> in {f.field}. {f.why} {f.suggestion}</li>)}</ul></div>}
      <div className="adv-table-wrap"><table className="adv-table drf-compare"><thead><tr><th>Field</th><th>Listing now</th><th>Draft</th><th><span className="sr-only">Accept</span></th></tr></thead><tbody>
        {rows.map(([k,label])=><tr key={k}><th scope="row">{label}</th><td className="drf-text">{show(current[k])||<span className="adv-muted">Empty</span>}</td><td className="drf-text">{show(t![k])}</td><td>{!readOnly&&<Button onClick={()=>onAccept({[k]:t![k]},false)}>Use draft</Button>}{!readOnly&&blocking(findings).some(f=>f.field===k||(Array.isArray(t![k])&&f.field===k))&&<Button tone="quiet" onClick={()=>onAccept({[k]:fix(k,t![k])},false)}>Use with fixes</Button>}</td></tr>)}
      </tbody></table></div>
      {!readOnly&&<div className="adv-buttons"><Button tone="primary" onClick={()=>{onAccept(t!,true);void commit(updateDraft(w,c.id,d!.id,{status:'applied',decidedAt:new Date().toISOString(),decidedBy:actor}));}}>Use the whole draft</Button><span className="adv-muted">Numbers are filled from the recast. Publishing still waits for the anonymity check.</span></div>}
    </>}
  </Panel>;
}
