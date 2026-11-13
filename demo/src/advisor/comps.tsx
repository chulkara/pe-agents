import {ComparableReport} from '../execution/ComparableReport';
import {useAdvisor} from './data';
// Comparable sales: the firm's sourced library and the comparison for one company.
import {useEffect,useMemo,useState} from 'react';
import type {Company,Workspace} from '../../lib/domain';
import {makePacket,rankComps,compMultiple,fewCompsMessage,type Comp,type DraftPacket,type CompSubject} from '../../lib/drafting';
import {compsOf,saveComp,removeComp,parseCompsCsv,materialsOf,withMaterials,latestDraft,updateDraft,isStale,validateComp} from '../../lib/materials';
import {recastSde,type DealCompany} from '../../lib/deals';
import {fetchWebsitePage} from '../../lib/researchFlow';
import {money} from '../../lib/hvacValuation';
import {useDrafts,DraftStatus} from './drafts';
import {Button,StatusPill,Panel,EmptyState,Field} from '../design/ui';

type Props={c:Company;w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean};
const subjectOf=(c:Company):CompSubject=>{const d=c as DealCompany,r=d.recast;return {businessType:/refrigerat/i.test(c.industry)?'Commercial refrigeration':'Residential HVAC',region:d.region||'',state:c.state,revenue:r?.inputs.revenue||0,sde:r?recastSde(r):0,recurringPct:r?.inputs.maintenancePct,year:new Date().getFullYear()};};

/** Shown next to the estimate in Valuation and recast. Internal unless the advisor includes it in the memorandum. */
export function CompsPanel({c,w,commit,actor,readOnly}:Props){
  const execution=useAdvisor().store.execution;
  const lib=compsOf(w),subject=subjectOf(c),ranked=useMemo(()=>rankComps(subject,lib).map(x=>({...x,multiple:compMultiple(x.comp)})),[(w as {comps?:unknown}).comps,subject.revenue,subject.sde]);// eslint-disable-line react-hooks/exhaustive-deps
  const D=useDrafts(c,w,commit,actor),m=materialsOf(c);const [packet,setPacket]=useState<DraftPacket|null>(null),[err,setErr]=useState('');
  const company={id:c.id,name:c.name,region:(c as DealCompany).region||'',state:c.state,industry:c.industry};
  const rkey=JSON.stringify([subject,ranked.map(r=>r.comp.id+r.score)]);
  useEffect(()=>{let live=true;void makePacket('comps',company,{subject,ranked}).then(p=>{if(live)setPacket(p);});return()=>{live=false;};},[rkey]);// eslint-disable-line react-hooks/exhaustive-deps
  const drafts=m.drafts.filter(d=>d.kind==='comps'&&(d.result as {mode?:string}|undefined)?.mode!=='extract');const d=drafts[0]||latestDraft({...m,drafts:m.drafts.filter(x=>x.kind==='comps'&&x.status==='queued')},'comps');
  const res=d?.result as {commentary:string;cited:string[]}|undefined;const include=!!m.comps?.includeInCim;
  async function start(){if(!packet)return;setErr('');try{await D.start(packet);}catch(e){setErr((e as Error).message);}}
  return <><ComparableReport store={execution}/><Panel title="Comparable sales" action={<span className="adv-muted">Internal unless you include them in the memorandum</span>}>
    {ranked.length?<div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Sale</th><th>Year</th><th>Revenue</th><th>SDE</th><th>Price</th><th>Multiple</th><th>Source</th></tr></thead><tbody>{ranked.map(r=><tr key={r.comp.id}><td><strong>{r.comp.businessType}</strong><small>{r.comp.region?r.comp.region+', ':''}{r.comp.state}. Similarity {r.score}</small></td><td>{r.comp.year}</td><td className="adv-num">{r.comp.revenue?money(r.comp.revenue):'Not stated'}</td><td className="adv-num">{money(r.comp.sde)}</td><td className="adv-num">{money(r.comp.price)}</td><td className="adv-num adv-price">{r.multiple}x</td><td>{r.comp.sourceUrl?<a href={r.comp.sourceUrl} target="_blank" rel="noreferrer">{r.comp.source}</a>:r.comp.source}</td></tr>)}</tbody></table></div>
      :<EmptyState title="No comparable sales yet">Add sourced sales in Research, Comparable sales.</EmptyState>}
    {ranked.length>0&&ranked.length<3&&<p className="adv-note">{fewCompsMessage}</p>}
    {err&&<p className="error-banner" role="alert">{err}</p>}
    {!readOnly&&<div className="adv-buttons"><Button disabled={!packet||!!D.blocked||d?.status==='queued'||!subject.sde} onClick={()=>void start()}>{res?'Compare again':'Write the comparison'}</Button><label className="adv-check"><input type="checkbox" checked={include} onChange={e=>void commit(withMaterials(w,c.id,mm=>({...mm,comps:{...(mm.comps||{ids:[]}),ids:ranked.map(r=>r.comp.id),includeInCim:e.target.checked}})))}/>Include in the memorandum</label></div>}
    <DraftStatus d={d} job={d?D.jobs[d.id]:undefined} stale={isStale(d,packet?.inputHash)}/>
    {res&&<blockquote className="comps-commentary"><p>{res.commentary}</p>{res.cited?.length>0&&<small>Cites {res.cited.join(', ')}.</small>}</blockquote>}
  </Panel></>;
}

/** Research > Comparable sales: every comp has a source and a date. */
export function CompsLibrary({w,commit,actor,readOnly}:{w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean}){
  const execution=useAdvisor().store.execution;
  const lib=compsOf(w);const [f,setF]=useState<Partial<Comp>>({state:'NJ',businessType:'Residential HVAC',year:new Date().getFullYear()-1}),[err,setErr]=useState(''),[msg,setMsg]=useState(''),[csvErr,setCsvErr]=useState<string[]>([]);
  const n=(s:string)=>Number(s.replace(/[$,\s]/g,''))||0;
  async function add(){const p=validateComp(f);if(p.length){setErr(p.join(' '));return;}setErr('');if(await commit(saveComp(w,f,actor))){setMsg('Added to the library.');setF({state:f.state,businessType:f.businessType,year:f.year});}}
  async function importCsv(file:File){const r=parseCompsCsv(await file.text(),actor);setCsvErr(r.errors);let next=w;for(const c of r.comps)next=saveComp(next,c,actor);if(r.comps.length&&await commit(next))setMsg(`Imported ${r.comps.length} sale${r.comps.length===1?'':'s'}.`);}
  const companies=w.companies.filter(c=>!c.sample);
  return <div className="adv-page">
    <ComparableReport store={execution}/><Panel title="Comparable sales" action={<span className="adv-muted">{lib.filter(x=>x.status==='confirmed').length} sourced sales</span>}>
      <p className="adv-muted">Only real sales with a source and a date. Kalling never invents comparable sales or uses paid databases. Completed Kalling transactions use the reviewed private-origin records above.</p>
      {lib.length?<div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Business</th><th>Year</th><th>Revenue</th><th>SDE</th><th>Price</th><th>Multiple</th><th>Source</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{lib.map(c=><tr key={c.id}><td><strong>{c.businessType}</strong><small>{c.region?c.region+', ':''}{c.state}. {c.status==='candidate'?'Waiting for confirmation. ':''}Added {c.recordedAt.slice(0,10)} by {c.recordedBy}</small></td><td>{c.year}</td><td className="adv-num">{c.revenue?money(c.revenue):'Not stated'}</td><td className="adv-num">{money(c.sde)}</td><td className="adv-num">{money(c.price)}</td><td className="adv-num">{compMultiple(c)}x</td><td>{c.sourceUrl?<a href={c.sourceUrl} target="_blank" rel="noreferrer">{c.source}</a>:c.source}</td><td>{!readOnly&&<Button tone="quiet" onClick={()=>void commit(removeComp(w,c.id))}>Remove</Button>}</td></tr>)}</tbody></table></div>:<EmptyState title="The library is empty">Add a sale below, import a CSV, or read a public page with the research computer.</EmptyState>}
    </Panel>
    {!readOnly&&<Panel title="Add a sale"><div className="adv-grid3">
      <Field label="Type of business"><input value={f.businessType||''} onChange={e=>setF({...f,businessType:e.target.value})}/></Field><Field label="Region"><input value={f.region||''} onChange={e=>setF({...f,region:e.target.value})}/></Field><Field label="State"><input value={f.state||''} maxLength={2} onChange={e=>setF({...f,state:e.target.value.toUpperCase()})}/></Field>
      <Field label="Year of sale"><input inputMode="numeric" value={f.year||''} onChange={e=>setF({...f,year:n(e.target.value)})}/></Field><Field label="Revenue"><input inputMode="numeric" value={f.revenue||''} onChange={e=>setF({...f,revenue:n(e.target.value)})}/></Field><Field label="SDE or EBITDA"><input inputMode="numeric" value={f.sde||''} onChange={e=>setF({...f,sde:n(e.target.value)})}/></Field>
      <Field label="Price"><input inputMode="numeric" value={f.price||''} onChange={e=>setF({...f,price:n(e.target.value)})}/></Field><Field label="Source"><input value={f.source||''} onChange={e=>setF({...f,source:e.target.value})} placeholder="Broker report, public filing"/></Field><Field label="Source link, optional"><input value={f.sourceUrl||''} onChange={e=>setF({...f,sourceUrl:e.target.value||undefined})}/></Field></div>
      <Field label="Notes"><input value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></Field>
      {err&&<p className="error-banner" role="alert">{err}</p>}<div className="adv-buttons"><Button tone="primary" onClick={()=>void add()}>Add sale</Button>
      <label className="k-btn k-btn-plain">Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={e=>{const x=e.target.files?.[0];if(x)void importCsv(x);e.target.value='';}}/></label><span className="adv-muted" aria-live="polite">{msg}</span></div>
      {csvErr.length>0&&<ul className="drf-mismatch">{csvErr.map(x=><li key={x}>{x}</li>)}</ul>}
      <p className="adv-muted">CSV columns: business_type, region, state, year, revenue, sde, price, source, source_url, notes.</p>
    </Panel>}
    {!readOnly&&companies.length>0&&<ExtractFromPage w={w} commit={commit} actor={actor} companies={companies}/>}
  </div>;
}

function ExtractFromPage({w,commit,actor,companies}:{w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;companies:Company[]}){
  const [cid,setCid]=useState(companies[0].id),[url,setUrl]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);const c=companies.find(x=>x.id===cid)||companies[0];
  const D=useDrafts(c,w,commit,actor);const ex=materialsOf(c).drafts.filter(d=>d.kind==='comps'&&(d.status==='ready'||d.status==='queued'));
  async function run(){setBusy(true);setErr('');try{const page=(await fetchWebsitePage(url)).source;const p=await makePacket('comps',{id:c.id,name:c.name,region:(c as DealCompany).region||'',state:c.state,industry:c.industry},{mode:'extract',page:{url:page.url,text:page.text.slice(0,60000)}});await D.start(p);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  return <Panel title="Read a public page for sales">
    <p className="adv-muted">Paste a public page that lists sold businesses, such as a published market report. The research computer proposes sales with the exact excerpt; you confirm each one before it enters the library. Do not use pages whose terms forbid reading them.</p>
    <div className="adv-grid2"><Field label="Page link"><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></Field><Field label="Run as part of"><select value={cid} onChange={e=>setCid(e.target.value)}>{companies.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
    {err&&<p className="error-banner" role="alert">{err}</p>}{D.blocked&&<p className="drf-blocked">{D.blocked}</p>}
    <div className="adv-buttons"><Button disabled={busy||!/^https:\/\//.test(url)||!!D.blocked} onClick={()=>void run()}>Read the page</Button></div>
    {ex.map(d=>{const res=d.result as {mode?:string;candidates?:(Partial<Comp>&{excerpt:string})[]}|undefined;if(d.status==='queued')return <DraftStatus key={d.id} d={d} job={D.jobs[d.id]} stale={false}/>;if(res?.mode!=='extract')return null;
      return <div key={d.id} className="comps-candidates"><h3 className="deal-sub">{res.candidates?.length||0} possible sales found</h3>{(res.candidates||[]).map((x,i)=><div key={i} className="adv-row"><p><strong>{x.businessType}</strong>, {x.region} {x.state}, {x.year}: {money(x.price||0)} price, {x.sde?money(x.sde)+' SDE':'SDE not stated'}.</p><small className="drf-excerpt">“{x.excerpt}”</small>
        <div className="adv-buttons"><Button tone="primary" disabled={!x.sde} onClick={()=>void commit(saveComp(w,{...x,source:new URL(String(x.sourceUrl)).hostname,status:'confirmed'},actor))}>Confirm and add</Button>{!x.sde&&<span className="adv-muted">No SDE on the page, so it cannot be compared.</span>}</div></div>)}
        <Button tone="quiet" onClick={()=>void commit(updateDraft(w,c.id,d.id,{status:'applied',decidedAt:new Date().toISOString(),decidedBy:actor}))}>Done with this page</Button></div>;})}
  </Panel>;
}
export {StatusPill};
