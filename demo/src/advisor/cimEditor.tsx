// The Materials tab: draft history, the memorandum editor and its two approvals, names to keep private.
import {useContext,useEffect,useMemo,useState} from 'react';
import type {Company,Workspace} from '../../lib/domain';
import {makePacket,cimSections,type DraftPacket,type Source,type CimParagraph as DraftParagraph} from '../../lib/drafting';
import {materialsOf,withMaterials,latestDraft,isStale,updateDraft,useAnyway,type CimVersion,type CimSection,type DraftRecord} from '../../lib/materials';
import {buildSources,assembleCim,releaseProblems,unresolved,reviewSections,companyContext,canShareInDataRoom} from '../../lib/cim';
import {recastTable} from '../../lib/recastDraft';
import {recastDiff,type DealCompany} from '../../lib/deals';
import type {ExtractedLine} from '../../lib/drafting';
import {textPdf} from '../../lib/pdf';
import {useDrafts,useInputs,DraftStatus,kindLabel} from './drafts';
import {PortalContextRef} from '../OwnerPortalAdmin';
import {Button,StatusPill,Panel,EmptyState,Field,KeylineList} from '../design/ui';

const dt=(s?:string)=>s?new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
type Props={c:Company;w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean};
type Private={anonymity?:{customerNames?:string[];employeeNames?:string[];licenseNumbers?:string[]}};

export function cimContext(c:Company){const a=(c as Company&Private).anonymity||{};return companyContext(c,{customerNames:a.customerNames||[],employeeNames:a.employeeNames||[],licenseNumbers:a.licenseNumbers||[]});}
export async function cimPdfBlob(c:Company,v:CimVersion){return textPdf({title:`Confidential information memorandum: ${c.name}`,cover:[`Version ${v.version}. Prepared by Kalling.`,'Shared only with buyers who signed a confidentiality agreement and were approved.'],sections:v.sections.filter(s=>s.key!=='cover').map(s=>({heading:s.title,body:s.paragraphs.map(p=>p.text).join('\n\n')})),stamp:`Kalling memorandum v${v.version}. Confidential.`});}

export default function MaterialsTab(p:Props){
  const m=materialsOf(p.c),dc=p.c as DealCompany;
  return <div className="mat-tab">
    <Panel title="Drafts">{m.drafts.length?<div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Draft</th><th>Requested</th><th>Model</th><th>Status</th></tr></thead><tbody>{m.drafts.map(d=><tr key={d.id}><td>{kindLabel[d.kind]}{(d.result as {mode?:string})?.mode==='extract'?', from a web page':''}</td><td>{dt(d.requestedAt)} by {d.requestedBy}</td><td>{d.model||'Waiting'}</td><td><StatusPill tone={d.status==='ready'?'purple':d.status==='applied'?'green':d.status==='failed'?'warn':'plain'}>{d.status==='ready'?'Ready for review':d.status[0].toUpperCase()+d.status.slice(1)}</StatusPill></td></tr>)}</tbody></table></div>:<EmptyState title="No drafts yet">Draft the recast in Valuation and recast, the teaser in Listing, and the memorandum below.</EmptyState>}</Panel>
    <Panel title="Recast history">{dc.recast?<KeylineList>{[dc.recast,...(dc.recastHistory||[])].map((r,i,all)=>{const prev=all[i+1];const diff=recastDiff(prev,r);return <li key={i}><div className="adv-grow"><strong>Version {r.version||1}{r.source==='draft'?', from documents':''}</strong><small>{dt(r.updatedAt)} by {r.updatedBy}. {diff.length?diff.join('. ')+'.':i===all.length-1?'First version.':'No changes.'}</small></div></li>;})}</KeylineList>:<p className="adv-muted">No recast saved yet.</p>}</Panel>
    <PrivateNames {...p}/>
    <CimPanel {...p}/>
  </div>;
}

/** Customer, employee and license names the checks must keep out of buyer materials. */
function PrivateNames({c,w,commit,readOnly}:Props){
  const a=(c as Company&Private).anonymity||{};const [v,setV]=useState({customers:(a.customerNames||[]).join('\n'),employees:(a.employeeNames||[]).join('\n'),licenses:(a.licenseNumbers||[]).join('\n')}),[msg,setMsg]=useState('');
  const list=(s:string)=>s.split('\n').map(x=>x.trim()).filter(x=>x.length>=3).slice(0,60);
  const save=async()=>{const next={...w,companies:w.companies.map(x=>x.id===c.id?{...x,anonymity:{customerNames:list(v.customers),employeeNames:list(v.employees),licenseNumbers:list(v.licenses)}}:x)};if(await commit(next))setMsg('Saved. The checks now look for these names.');};
  return <Panel title="Names to keep private"><p className="adv-muted">The anonymity and privacy checks look for these in the teaser and the memorandum. One per line.</p>
    <div className="adv-grid3"><Field label="Customer names"><textarea rows={3} value={v.customers} disabled={readOnly} onChange={e=>setV({...v,customers:e.target.value})}/></Field><Field label="Employee names"><textarea rows={3} value={v.employees} disabled={readOnly} onChange={e=>setV({...v,employees:e.target.value})}/></Field><Field label="License numbers"><textarea rows={3} value={v.licenses} disabled={readOnly} onChange={e=>setV({...v,licenses:e.target.value})}/></Field></div>
    {!readOnly&&<div className="adv-buttons"><Button onClick={()=>void save()}>Save names</Button><span className="adv-muted" aria-live="polite">{msg}</span></div>}</Panel>;
}

export function CimPanel({c,w,commit,actor,readOnly}:Props){
  const dc=c as DealCompany,m=materialsOf(c),ctx=useContext(PortalContextRef),{docs,bundle,portalId}=useInputs(c),D=useDrafts(c,w,commit,actor);
  const recastLines=(m.drafts.find(d=>d.kind==='recast'&&d.status==='applied')?.result as {lines?:ExtractedLine[]}|undefined)?.lines;
  const years=useMemo(()=>recastLines?recastTable(recastLines):undefined,[recastLines]);
  const sources=useMemo(()=>buildSources({company:dc,answers:bundle?.answers,docs:docs.map(d=>({fileId:d.fileId,name:d.name,kind:d.kind,extract:d.pages.length?{fileId:d.fileId,status:'ok',pages:d.pages,textHash:d.textHash,extractor:'',chars:0,note:'',extractedAt:''}:undefined}))}),[dc,bundle?.answers,docs.map(d=>d.textHash).join()]);// eslint-disable-line react-hooks/exhaustive-deps
  const [packet,setPacket]=useState<DraftPacket|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
  const company={id:c.id,name:c.name,region:dc.region||'',state:c.state,industry:c.industry};
  useEffect(()=>{let live=true;void makePacket('cim',company,{sources}).then(x=>{if(live)setPacket(x);});return()=>{live=false;};},[sources]);// eslint-disable-line react-hooks/exhaustive-deps
  const cimDrafts=m.drafts.filter(d=>d.kind==='cim'),d=latestDraft(m,'cim'),v=m.cim[0],stale=isStale(d,packet?.inputHash)&&!(d?.result as {sections?:object}|undefined&&Object.keys((d!.result as {sections:object}).sections).length<cimSections.filter(s=>s.by==='model').length);
  const pending=cimDrafts.find(x=>x.status==='ready');
  const review=bundle?.reviews.find(r=>r.id===v?.reviewId);
  // The owner's answer in the portal updates the version's status.
  useEffect(()=>{if(!v||!review||readOnly)return;
    if(review.status==='Approved'&&v.status!=='Owner approved')void commit(setVersion(w,c.id,{...v,status:'Owner approved',ownerApproval:{at:review.decidedAt||new Date().toISOString()}}));
    if(review.status==='Changes requested'&&v.status==='Ready for owner')void commit(setVersion(w,c.id,{...v,status:'Changes requested',comments:[...v.comments,...review.comments.map(x=>({section:x.section,by:dc.owner||'Owner',text:x.text,at:x.at,side:'owner' as const}))]}));
  },[review?.status]);// eslint-disable-line react-hooks/exhaustive-deps
  const problems=v?releaseProblems(v,cimContext(c)):[];
  async function run(only?:string[]){setBusy(true);setErr('');try{const pk=only?await makePacket('cim',company,{sources,sections:only}):packet;if(!pk)return;await D.start(pk);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  async function use(rec:DraftRecord){const res=rec.result as {sections:Record<string,DraftParagraph[]>;model?:string};const only=Object.keys(res.sections);
    const next=assembleCim({prev:v,draft:res.sections,draftId:rec.id,inputHash:rec.inputHash,model:res.model,sources,company:dc,years,actor,only:v?only:undefined});
    let nw=withMaterials(w,c.id,mm=>({...mm,cim:[next,...mm.cim].slice(0,20)}));nw=updateDraft(nw,c.id,rec.id,{status:'applied',decidedAt:new Date().toISOString(),decidedBy:actor});if(await commit(nw))setMsg(`Version ${next.version} created from the draft.`);}
  const edit=(next:CimVersion)=>commit(setVersion(w,c.id,{...next,status:'Draft',advisorApproval:undefined,ownerApproval:undefined}));
  async function sendToOwner(){if(!v||!portalId||!ctx.store)return;setBusy(true);setErr('');try{const id=await ctx.store.publishReview(portalId,{kind:'cim',version:v.version,title:`Confidential information memorandum, version ${v.version}`,sections:reviewSections(v)});if(await commit(setVersion(w,c.id,{...v,status:'Ready for owner',reviewId:id})))setMsg('Sent to the owner’s portal for review. Nothing is shared with buyers.');}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  async function pdf(){if(!v)return;const b=await cimPdfBlob(c,v);const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`Memorandum v${v.version}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
  return <Panel title="Confidential information memorandum" className="cim-panel" action={v&&<StatusPill tone={v.status==='Owner approved'?'green':v.status==='Changes requested'?'warn':v.status==='Draft'?'plain':'peri'}>{`Version ${v.version}: ${v.status}`}</StatusPill>}>
    <p className="adv-muted">The research computer writes each section from {sources.length} numbered sources: Kalling’s records, the owner’s answers, accepted documents and research. Every paragraph lists its sources. Anything without one needs confirmation before release.</p>
    {err&&<p className="error-banner" role="alert">{err}</p>}{D.blocked&&<p className="drf-blocked" role="status">{D.blocked}</p>}
    {!readOnly&&<div className="adv-buttons"><Button tone={v?'plain':'primary'} disabled={busy||!packet||!!D.blocked||d?.status==='queued'} onClick={()=>void run()}>{v?'Draft all sections again':'Draft memorandum'}</Button>{!bundle?.answers&&<span className="adv-muted">The owner has not answered “About your business” yet. The memorandum is better with those answers.</span>}</div>}
    <DraftStatus d={d} job={d?D.jobs[d.id]:undefined} stale={!!stale} onRetry={()=>void run()} onUseAnyway={readOnly?undefined:n=>void commit(useAnyway(w,c.id,d!.id,n,actor))}/>
    {pending&&!readOnly&&<div className="adv-note" role="status">A memorandum draft is ready{Object.keys((pending.result as {sections:object}).sections).length<cimSections.filter(s=>s.by==='model').length?' for '+Object.keys((pending.result as {sections:object}).sections).map(k=>cimSections.find(s=>s.key===k)?.title.toLowerCase()).join(', '):''}. <Button tone="primary" onClick={()=>void use(pending)}>Use this draft</Button> <Button tone="quiet" onClick={()=>void commit(updateDraft(w,c.id,pending.id,{status:'dismissed'}))}>Dismiss</Button></div>}
    <p className="adv-muted" role="status" aria-live="polite">{msg}</p>
    {v&&<>
      <div className={'cim-checks '+(problems.length?'bad':'ok')} aria-live="polite"><h3>{problems.length?'Not ready to release':'Ready to release'}</h3>{problems.length?<ul>{problems.map(x=><li key={x}>{x}</li>)}</ul>:<p>Every sentence has a source or a confirmation, and the privacy checks found nothing.</p>}</div>
      {!readOnly&&<div className="adv-buttons">
        {['Draft','Changes requested'].includes(v.status)&&<Button tone="primary" disabled={!!problems.length} onClick={()=>void commit(setVersion(w,c.id,{...v,status:'Advisor approved',advisorApproval:{by:actor,at:new Date().toISOString()}}))}>Approve as advisor</Button>}
        {v.status==='Advisor approved'&&<Button tone="primary" disabled={busy||!portalId} onClick={()=>void sendToOwner()}>Send to owner for review</Button>}
        <Button onClick={()=>void pdf()}>Download PDF</Button>
        {canShareInDataRoom(v)&&<StatusPill tone="green">Approved by you and the owner. Add it in the Data room tab.</StatusPill>}
      </div>}
      {v.advisorApproval&&<p className="adv-muted">Approved by {v.advisorApproval.by} {dt(v.advisorApproval.at)}.{v.ownerApproval?` Approved by the owner ${dt(v.ownerApproval.at)}.`:''}</p>}
      <div className="cim-sections">{v.sections.map(s=><CimSectionEditor key={s.key+v.version} s={s} v={v} sources={v.sources} readOnly={readOnly||!['Draft','Changes requested','Advisor approved'].includes(v.status)} actor={actor}
        regenerate={s.by==='model'&&!readOnly?()=>void run([String(s.key)]):undefined} save={next=>void edit(next)}/>)}</div>
    </>}
  </Panel>;
}
export function setVersion(w:Workspace,companyId:string,v:CimVersion){return withMaterials(w,companyId,m=>({...m,cim:m.cim.map(x=>x.version===v.version?v:x)}));}

function CimSectionEditor({s,v,sources,readOnly,save,regenerate,actor}:{s:CimSection;v:CimVersion;sources:Source[];readOnly:boolean;save:(v:CimVersion)=>void;regenerate?:()=>void;actor:string}){
  const [comment,setComment]=useState('');
  const put=(paragraphs:CimSection['paragraphs'])=>save({...v,sections:v.sections.map(x=>x.key===s.key?{...x,by:x.by==='code'?'code':'advisor',paragraphs}:x)});
  const comments=v.comments.filter(c=>c.section===s.key);const label=(id:string)=>sources.find(x=>x.id===id)?.label||id;
  return <section className="cim-section" aria-labelledby={'cim-'+s.key}>
    <header><h3 id={'cim-'+s.key}>{s.title}</h3><small>{s.by==='code'?'Made by Kalling from the reviewed records':s.by==='advisor'?'Edited by an advisor':'Drafted by the research computer'}</small>{regenerate&&<Button tone="quiet" onClick={regenerate}>Regenerate this section</Button>}</header>
    {s.paragraphs.length===0&&<p className="adv-muted">Not drafted yet.</p>}
    {s.paragraphs.map((p,i)=>{const open=p.needsConfirmation&&!p.confirmedNote;return <div key={i} className={'cim-para'+(open?' needs':'')}>
      {readOnly||s.by==='code'?<p>{p.text}</p>:<textarea aria-label={`${s.title}, paragraph ${i+1}`} defaultValue={p.text} rows={Math.min(8,Math.ceil(p.text.length/90)+1)} onBlur={e=>{if(e.target.value!==p.text)put(s.paragraphs.map((x,j)=>j===i?{...x,text:e.target.value}:x));}}/>}
      <p className="cim-sources">{p.sources.length?<>Sources: {p.sources.map(id=><span key={id} className="k-pill" title={sources.find(x=>x.id===id)?.text}>{id} {label(id)}</span>)}</>:open?<strong>Needs confirmation: no source supports this.</strong>:<>Confirmed: {p.confirmedNote}</>}</p>
      {open&&!readOnly&&<ConfirmPara sources={sources} onSource={id=>put(s.paragraphs.map((x,j)=>j===i?{...x,sources:[id],needsConfirmation:false}:x))} onConfirm={n=>put(s.paragraphs.map((x,j)=>j===i?{...x,confirmedNote:`${n} (${actor})`}:x))} onRemove={()=>put(s.paragraphs.filter((_,j)=>j!==i))}/>}
    </div>;})}
    {comments.length>0&&<ul className="cim-comments">{comments.map((c,i)=><li key={i} className={c.side}><b>{c.by}</b> {c.text}<small>{dt(c.at)}</small></li>)}</ul>}
    {!readOnly&&<form className="adv-reply" onSubmit={e=>{e.preventDefault();if(comment.trim().length<2)return;save({...v,comments:[...v.comments,{section:String(s.key),by:actor,text:comment.trim(),at:new Date().toISOString(),side:'firm'}]});setComment('');}}><Field label={'Comment on '+s.title.toLowerCase()}><input value={comment} onChange={e=>setComment(e.target.value)}/></Field><Button>Add comment</Button></form>}
  </section>;
}
function ConfirmPara({sources,onSource,onConfirm,onRemove}:{sources:Source[];onSource:(id:string)=>void;onConfirm:(n:string)=>void;onRemove:()=>void}){
  const [id,setId]=useState(''),[note,setNote]=useState('');
  return <div className="cim-confirm"><Field label="Add a source"><select value={id} onChange={e=>setId(e.target.value)}><option value="">Choose a source</option>{sources.map(s=><option key={s.id} value={s.id}>{s.id}: {s.label}</option>)}</select></Field><Button disabled={!id} onClick={()=>onSource(id)}>Use source</Button>
    <Field label="Or confirm it"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Confirmed with the owner on the call"/></Field><Button disabled={note.trim().length<5} onClick={()=>onConfirm(note.trim())}>Confirm</Button><Button tone="quiet" onClick={onRemove}>Remove sentence</Button></div>;
}
