// The owner's sale-ready page, and the advisor's panel that prepares and shares it.
import {useMemo,useState} from 'react';
import {Check,Share2} from 'lucide-react';
import type {Company} from '../../lib/domain';
import type {DealCompany} from '../../lib/deals';
import type {PortalBundle,SaleReadySnapshot} from '../../lib/portal';
import type {PortalStore} from '../../lib/portalStore';
import {saleReadyReport,draftNote,type SaleReadyInput,type SaleReadyReport} from '../../lib/saleReady';
import {buyerFitFor,describeTypes} from '../../lib/matching';
import {useAdvisor} from '../advisor/data';
import './saleReady.css';

const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(2).replace(/\.?0+$/,'')+'M':'$'+Math.round(n/1000).toLocaleString('en-US')+'K';
const exact=(n:number)=>'$'+Math.round(n).toLocaleString('en-US');
const day=(iso:string)=>new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const cleanFit=(f:SaleReadyInput['buyerFit'])=>{if(!f||typeof f!=='object')return null;const n=(x:unknown)=>Number.isFinite(Number(x))&&Number(x)>0?Math.floor(Number(x)):0;const byType:Record<string,number>={};for(const [k,v] of Object.entries(f.byType||{}))if(n(v))byType[k]=n(v);return {total:n(f.total),strong:Math.min(n(f.strong),n(f.total)),byType,basis:f.basis==='listing'?'listing' as const:'estimate' as const};};
const safeReport=(i:SaleReadyInput):SaleReadyReport|null=>{try{return saleReadyReport(i);}catch{return null;}};

/** What the owner sees. `snap` is a shared version; `previous` is the one before it, for the change line. */
export function SaleReadyView({snap,previous,by,preview=false}:{snap:{input:SaleReadyInput;note:string;sharedAt?:string};previous?:SaleReadyInput;by?:string;preview?:boolean}){
  const r=useMemo(()=>safeReport(snap.input),[snap.input]),before=useMemo(()=>previous?safeReport(previous):null,[previous]);
  if(!r)return null;
  const v=r.valuation,change=before?v.mid-before.valuation.mid:0,fit=cleanFit(snap.input.buyerFit);
  return <section className="sr" id="portal-sale-ready" aria-labelledby="sr-title">
    <p className="sr-meta">{preview?'Preview of the owner’s page':'Your sale-ready page'}{snap.sharedAt?` · updated ${day(snap.sharedAt)}`:''}</p>
    <h2 id="sr-title">What {snap.input.businessName} is worth today</h2>
    <p className="sr-range"><span>{money(v.low)}</span><span className="sr-to">to</span><span>{money(v.high)}</span></p>
    <p className="sr-basis-line">Based on {exact(v.sde)} a year in owner earnings, at {v.multipleLow} to {v.multipleHigh} times.{before&&Math.abs(change)>=5000?<> <strong className={change>0?'sr-up':'sr-down'}>{change>0?'Up':'Down'} {money(Math.abs(change))}</strong> since last time.</>:null}</p>
    {snap.note&&<blockquote className="sr-note"><p>{snap.note}</p>{by&&<cite>{by}, your Kalling advisor</cite>}</blockquote>}

    {r.drags.length>0&&<div className="sr-block"><h3>What is holding the price back</h3><p className="sr-sub">Ranked by how much each could add to the middle of the estimate.</p>
      <ol className="sr-drags">{r.drags.map(d=><li key={d.key}>
        <div className="sr-drag-head"><strong>{d.title}</strong><span className="sr-gain">about +{money(d.gainMid)}</span></div>
        <p>{d.why}</p>
        <p className="sr-fix"><Check size={15} aria-hidden="true"/>{d.fix}</p>
        <p className="sr-assume">{d.assumption}, by the same estimate.</p>
      </li>)}</ol></div>}

    {fit&&fit.total>0&&<div className="sr-block sr-fit"><h3>Buyers who fit</h3>
      <p className="sr-fit-line"><strong>{fit.total}</strong> {fit.total===1?'buyer':'buyers'} in Kalling’s directory {fit.total===1?'fits':'fit'} your business today{fit.strong?`, ${fit.strong} of them strongly`:''}: {describeTypes(fit.byType)}.</p>
      <p className="sr-sub">{fit.basis==='estimate'?'Matched on the estimated value above, before anything is listed. No buyer has been told about your business.':'Matched on your anonymous listing. Buyers see only the anonymous listing until we approve them under a confidentiality agreement.'}</p></div>}
    {r.readiness.total>0&&<div className="sr-block"><h3>How ready a sale is</h3>
      <div className="sr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.readiness.pct} aria-label="Records in"><i style={{width:r.readiness.pct+'%'}}/></div>
      <p className="sr-sub">{r.readiness.done} of {r.readiness.total} records are in{r.readiness.missing.length?'. Still needed: '+r.readiness.missing.slice(0,3).join(', ')+(r.readiness.missing.length>3?` and ${r.readiness.missing.length-3} more`:'')+'.':'. A sale could start quickly.'}</p></div>}

    <details className="sr-how"><summary>How we worked it out</summary>
      <table><tbody>{r.basis.map(b=><tr key={b.label}><th scope="row">{b.label}</th><td>{exact(b.amount)}</td><td className="sr-src">{b.source||'From your advisor’s recast'}</td></tr>)}</tbody></table>
      <p className="sr-sub">{v.band}. Starting multiple adjusted for:</p>
      <ul>{v.adjustments.map(a=><li key={a.label}><strong>{a.label} ({a.effect>0?'+':''}{a.effect}x).</strong> {a.why}</li>)}</ul>
    </details>
    <p className="sr-legal">An estimate to plan with, not an appraisal or an offer. A buyer’s price depends on their own review.</p>
  </section>;
}

/** Builds the page's input from the advisor's saved recast and the portal's document requests. */
export function saleReadyInput(company:Company,b:Pick<PortalBundle,'portal'|'requests'>):SaleReadyInput|null{
  const rc=(company as DealCompany).recast;if(!rc?.inputs||!(rc.inputs.revenue>0))return null;
  const sources:SaleReadyInput['basisSources']={};
  for(const l of rc.review?.lines||[])if(l.decision==='accept'&&(l.target==='revenue'||l.target==='netProfit'||l.target==='ownerPay')&&!sources[l.target])sources[l.target]=`${l.citation.name}, page ${l.citation.page}`;
  return {businessName:b.portal.businessName,inputs:{...rc.inputs},addBacks:(rc.addBacks||[]).map(a=>({item:a.item,amount:a.amount,evidence:a.evidence||''})),basisSources:sources,requests:b.requests.map(r=>({title:r.title,status:r.status})),asOf:new Date().toISOString().slice(0,10)};
}

export function SaleReadyAdmin({company,b,store,refresh,canWrite}:{company:Company;b:PortalBundle;store:PortalStore;refresh:()=>Promise<void>;canWrite:boolean}){
  const {d}=useAdvisor();
  const base=useMemo(()=>saleReadyInput(company,b),[company,b]);
  const input=useMemo(()=>{if(!base||!d)return base;const r=safeReport(base);const fit=buyerFitFor({buyers:d.buyers,checks:d.checks,access:d.requests,listings:d.listings},{id:company.id,region:(company as DealCompany).region},r?{price:r.valuation.mid,sde:r.valuation.sde}:undefined);return fit?{...base,buyerFit:fit}:base;},[base,d,company]);
  const shared=(b.saleReady||[]) as SaleReadySnapshot[],last=shared[0];
  const report=useMemo(()=>input?safeReport(input):null,[input]);
  const firstName=b.portal.ownerName.split(' ')[0]||b.portal.ownerName;
  const [note,setNote]=useState(()=>report?draftNote(report,firstName,last?safeReport(last.input)||undefined:undefined,input?.buyerFit?.total):''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[err,setErr]=useState('');
  if(!input||!report)return <section className="panel"><h2>Sale-ready page</h2><p className="muted">Save the recast under Valuation and recast first. The page is built from it.</p></section>;
  const share=async()=>{setBusy(true);setErr('');setMsg('');try{await store.shareSaleReady(b.portal.id,input,note);await refresh();setMsg(`Shared with ${firstName}. It is at the top of their portal.`);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}};
  return <section className="panel sr-admin">
    <h2>Sale-ready page</h2>
    <p className="muted">Built from your saved recast and the owner’s document requests. Review it, edit the note, then share. The owner sees nothing until you do.</p>
    <SaleReadyView snap={{input,note}} previous={last?.input} preview/>
    <label className="field sr-note-field"><span>Note to {firstName}</span><textarea rows={5} value={note} onChange={e=>setNote(e.target.value)} disabled={!canWrite||busy} maxLength={2000}/></label>
    {err&&<p role="alert" className="error-banner">{err}</p>}{msg&&<p role="status" className="sr-ok">{msg}</p>}
    {canWrite&&<div className="button-row"><button className="btn primary" disabled={busy||note.trim().length<20} onClick={()=>void share()}><Share2 size={15}/>Share with {firstName}</button></div>}
    {shared.length>0&&<p className="muted sr-history">Shared {shared.length} time{shared.length===1?'':'s'}. Latest: version {last.version}, {day(last.sharedAt)} by {last.by}.</p>}
  </section>;
}
