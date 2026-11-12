// Qualify a seller, then prepare, send and countersign the engagement letter.
import {useContext,useMemo,useState} from 'react';
import type {Company,Workspace} from '../../lib/domain';
import {qualificationGaps,licenseHolders,notFitReasons,qualify,markNotFit,letterDefaults,letterProblems,renderLetter,feeBases,prefilledRequests,afterSigningSteps,LETTER_TEMPLATE_VERSION,type QualificationInput,type NotFitReason,type LetterInput,type EngagedCompany} from '../../lib/engagement';
import {setStage,dealStage,type DealCompany} from '../../lib/deals';
import {currentLetter,type Letter} from '../../lib/portal';
import {inviteLink} from '../../lib/portalStore';
import {letterPdf} from '../../lib/pdf';
import {money} from '../../lib/hvacValuation';
import {useAdvisor} from './data';
import {PortalContextRef} from '../OwnerPortalAdmin';
import {Button,StatusPill,Panel,Field,EmptyState} from '../design/ui';

const dt=(s?:string)=>s?new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'';
export const emptyQualification=(c?:Company):QualificationInput=>({hvac:/hvac|refrigeration/i.test(c?.industry||'hvac'),njny:['NJ','NY'].includes(c?.state||'NJ'),inRange:false,decisionMaker:false,partners:'',reason:'',timing:'',license:'Not sure yet',bookkeeper:false,threeYearsReturns:false,notes:''});

/** First-call checklist. Used on a lead in Sellers and on a company at stage Lead. */
export function QualifyPanel({initial,estimate,busy,onQualified,onNotFit,onCancel}:{initial:QualificationInput;estimate?:string;busy:boolean;onQualified:(q:QualificationInput)=>void;onNotFit:(reason:NotFitReason,note:string,q:QualificationInput)=>void;onCancel?:()=>void}){
  const [q,setQ]=useState(initial),[mode,setMode]=useState<'check'|'notfit'>('check'),[reason,setReason]=useState<NotFitReason|''>(''),[note,setNote]=useState('');
  const set=<K extends keyof QualificationInput>(k:K,v:QualificationInput[K])=>setQ(x=>({...x,[k]:v}));
  const gaps=qualificationGaps(q);
  const box=(k:'hvac'|'njny'|'inRange'|'decisionMaker'|'bookkeeper'|'threeYearsReturns',label:string)=><label className="adv-check"><input type="checkbox" checked={q[k]} onChange={e=>set(k,e.target.checked)}/>{label}</label>;
  return <Panel title="Qualify" className="eng-qualify" action={onCancel&&<Button tone="quiet" onClick={onCancel}>Close</Button>}>
    <p className="adv-muted">Fill this in during the first call. It takes about five minutes.</p>
    <div className="eng-q-grid">
      <fieldset><legend>Fit</legend>{box('hvac','HVAC or refrigeration work')}{box('njny','Operates in New Jersey or New York')}{box('inRange','Revenue and earnings in range')}{estimate&&<p className="adv-muted">Their estimate: {estimate}</p>}</fieldset>
      <fieldset><legend>Owner</legend>{box('decisionMaker','Speaking with the decision maker')}<Field label="Other owners or partners"><input value={q.partners} onChange={e=>set('partners',e.target.value)} placeholder="None, or names and shares"/></Field><Field label="Why they want to sell"><input value={q.reason} onChange={e=>set('reason',e.target.value)}/></Field><Field label="When"><input value={q.timing} onChange={e=>set('timing',e.target.value)} placeholder="Within a year"/></Field></fieldset>
      <fieldset><legend>License and readiness</legend><Field label="Who holds the master HVACR license"><select value={q.license} onChange={e=>set('license',e.target.value as QualificationInput['license'])}>{licenseHolders.map(l=><option key={l}>{l}</option>)}</select></Field>{box('bookkeeper','Books kept by an accountant or bookkeeper')}{box('threeYearsReturns','Three years of tax returns available')}</fieldset>
    </div>
    <Field label="Notes"><textarea rows={3} value={q.notes} onChange={e=>set('notes',e.target.value)}/></Field>
    {mode==='check'?<><p className="adv-muted" aria-live="polite">{gaps.length?gaps.join(' '):'Ready to qualify.'}</p>
      <div className="adv-buttons"><Button tone="primary" disabled={busy||gaps.length>0} onClick={()=>onQualified(q)}>Qualified</Button><Button disabled={busy} onClick={()=>setMode('notfit')}>Not a fit</Button></div></>
    :<div className="eng-notfit"><Field label="Why it is not a fit"><select value={reason} onChange={e=>setReason(e.target.value as NotFitReason)}><option value="">Choose a reason</option>{notFitReasons.map(r=><option key={r}>{r}</option>)}</select></Field><Field label="Note"><input value={note} onChange={e=>setNote(e.target.value)}/></Field>
      <div className="adv-buttons"><Button tone="primary" disabled={busy||!reason||note.trim().length<3} onClick={()=>onNotFit(reason as NotFitReason,note,q)}>Mark not a fit</Button><Button tone="quiet" onClick={()=>setMode('check')}>Back</Button></div></div>}
  </Panel>;
}

/** Qualify panel on a company at stage Lead. */
export function CompanyQualify({c,w,commit,actor,readOnly}:{c:Company;w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean}){
  const x=useAdvisor();const [err,setErr]=useState(''),[busy,setBusy]=useState(false);const lead=x.d?.leads.find(l=>l.id===(c as DealCompany).leadId);
  if(readOnly)return null;
  const run=async(fn:()=>Workspace,leadStatus?:'Qualified'|'Not a fit',note?:string)=>{setBusy(true);setErr('');try{if(await commit(fn())&&lead&&leadStatus)await x.act(()=>x.store.updateLead(lead.id,{status:leadStatus,...(note?{notes:[lead.notes,note].filter(Boolean).join('\n')}:{})}));}catch(e){setErr((e as Error).message);}finally{setBusy(false);}};
  return <>{err&&<p className="error-banner" role="alert">{err}</p>}<QualifyPanel initial={(c as EngagedCompany).qualification||emptyQualification(c)} estimate={lead?.valuation?`${money(lead.valuation.low)} to ${money(lead.valuation.high)} on ${money(lead.valuation.revenue)} revenue`:undefined} busy={busy}
    onQualified={q=>void run(()=>qualify(w,c.id,q,actor),'Qualified')} onNotFit={(r,n,q)=>void run(()=>markNotFit(w,c.id,r,n,actor,q),'Not a fit',`Not a fit: ${r}. ${n}`)}/></>;
}

type Terms=LetterInput['terms'];
const numOrNull=(s:string)=>s.trim()===''?null:Number(s.replace(/[^\d.]/g,''));
/** The engagement letter, from draft to countersigned, inside the Deal Room. */
export function EngagementPanel({c,w,commit,actor,readOnly}:{c:Company;w:Workspace;commit:(n:Workspace)=>Promise<boolean>;actor:string;readOnly:boolean}){
  const x=useAdvisor(),ctx=useContext(PortalContextRef),store=ctx.store,pe=x.portals[c.id],letters=pe?.bundle?.letters||[],cur=currentLetter(letters);
  const firm=w.firm,advisor=ctx.helpDefault.name?ctx.helpDefault:{name:actor,email:'team@local.demo'};
  const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState(''),[link,setLink]=useState('');
  const [inp,setInp]=useState<LetterInput>(()=>cur?.status==='Draft'?cur.input as unknown as LetterInput:letterDefaults(c,{advisorName:advisor.name,advisorEmail:advisor.email,firmName:firm.name,firmAddress:firm.address||''}));
  const problems=useMemo(()=>letterProblems({...inp,firmAddress:inp.firmAddress||firm.address||''}),[inp,firm.address]);
  const can=!readOnly&&ctx.canWrite&&!!store;
  async function act(fn:()=>Promise<unknown>,done?:string){setBusy(true);setErr('');setMsg('');try{await fn();await x.reloadPortals();if(done)setMsg(done);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  const setT=<K extends keyof Terms>(k:K,v:Terms[K])=>setInp(i=>({...i,terms:{...i.terms,[k]:v}}));
  const full={...inp,firmAddress:inp.firmAddress||firm.address||''};
  async function ensurePortal(){if(pe)return pe.portal.id;if(!c.owner||!c.email)throw Error('Add the owner’s name and email in Edit details first.');
    const id=await store!.create({companyId:c.id,businessName:c.name,ownerName:c.owner,ownerEmail:c.email,help:advisor,welcome:`Thank you for choosing ${firm.name} to help sell ${c.name}. Start by reading and signing the engagement letter below. Your document requests open once both of us have signed.`});
    await store!.setRequestsHidden(id,true);for(const r of prefilledRequests({today:new Date(),region:(c as DealCompany).region,contact:advisor}))await store!.saveRequest(id,r);return id;}
  const save=()=>act(async()=>{const id=await ensurePortal();await store!.saveLetter(id,{id:cur?.status==='Draft'?cur.id:undefined,templateVersion:LETTER_TEMPLATE_VERSION,input:full as unknown as Letter['input'],text:renderLetter(full)});},'Draft saved.');
  const ready=()=>act(async()=>{const id=await ensurePortal();const lid=await store!.saveLetter(id,{id:cur?.status==='Draft'?cur.id:undefined,templateVersion:LETTER_TEMPLATE_VERSION,input:full as unknown as Letter['input'],text:renderLetter(full)});await store!.letterReady(lid);setLink(inviteLink(await store!.invite(id)));},'The letter is ready. Send the owner the link below.');
  async function countersigned(l:Letter){
    let next=w;if(dealStage(c,{portal:pe?.portal})!=='Engaged'){try{next=setStage(w,c.id,'Engaged',actor,{portal:pe?.portal});}catch{/* already past Engaged */}}
    if(next!==w)await commit(next);
    const lead=x.d?.leads.find(z=>z.id===(c as DealCompany).leadId);if(lead)await x.store.updateLead(lead.id,{status:'Engaged'});
    if(pe){const steps=pe.bundle?.steps||[];if(!steps.length)await store!.saveSteps(pe.portal.id,afterSigningSteps(advisor.name));}
    void l;
  }
  if(!can&&!cur)return <Panel title="Engagement letter"><EmptyState title="No engagement letter yet">An analyst or administrator prepares the letter.</EmptyState></Panel>;
  return <Panel title="Engagement letter" className="eng-letter" action={cur&&<StatusPill tone={cur.status==='Countersigned'?'green':cur.status==='Signed by owner'?'purple':cur.status==='Draft'?'plain':'peri'}>{cur.status}</StatusPill>}>
    {!firm.letterReviewed&&<p className="eng-notice" role="note">Template pending legal review. An attorney should review this template before it is used with a real owner. Mark it reviewed in Firm settings.</p>}
    {err&&<p className="error-banner" role="alert">{err}</p>}{msg&&<p className="adv-note" role="status">{msg}</p>}
    {(!cur||cur.status==='Draft')&&can?<>
      <p className="adv-muted">The owner signs in their portal. Until both of you sign, the portal shows only the letter, messages and your contact details. The first six HVAC document requests are prepared now and open after signing.</p>
      <div className="adv-grid3">
        <Field label="Owner’s full legal name"><input value={inp.ownerName} onChange={e=>setInp({...inp,ownerName:e.target.value})}/></Field>
        <Field label="Owner’s title"><input value={inp.ownerTitle} onChange={e=>setInp({...inp,ownerTitle:e.target.value})}/></Field>
        <Field label="Legal name of the business"><input value={inp.legalName} onChange={e=>setInp({...inp,legalName:e.target.value})}/></Field>
        <Field label="Governing state"><select value={inp.state} onChange={e=>setInp({...inp,state:e.target.value as LetterInput['state']})}><option value="">Choose</option><option value="NJ">New Jersey</option><option value="NY">New York</option></select></Field>
        <Field label="Effective date"><input type="date" value={inp.effectiveDate} onChange={e=>setInp({...inp,effectiveDate:e.target.value})}/></Field>
        <Field label="Advisor who signs"><input value={inp.advisorName} onChange={e=>setInp({...inp,advisorName:e.target.value})}/></Field>
        <Field label="Firm address" hint={firm.address?undefined:'Save it in Firm settings to fill this in next time.'}><input value={inp.firmAddress} onChange={e=>setInp({...inp,firmAddress:e.target.value})}/></Field>
      </div>
      <h3 className="deal-sub">Terms</h3><p className="adv-muted">There are no default fees. Fill in every term for this engagement.</p>
      <div className="adv-grid3">
        <Field label="Success fee, %"><input inputMode="decimal" value={inp.terms.successFeePct??''} onChange={e=>setT('successFeePct',numOrNull(e.target.value))}/></Field>
        <Field label="Minimum success fee, $" hint="Enter 0 for no minimum"><input inputMode="numeric" value={inp.terms.successFeeMin??''} onChange={e=>setT('successFeeMin',numOrNull(e.target.value))}/></Field>
        <Field label="Fee is calculated on"><select value={inp.terms.feeBasis} onChange={e=>setT('feeBasis',e.target.value)}><option value="">Choose</option>{feeBases.map(b=><option key={b}>{b}</option>)}</select></Field>
        <Field label="Retainer"><select value={inp.terms.retainer===null?'':inp.terms.retainer==='none'?'none':'amount'} onChange={e=>setT('retainer',e.target.value==='none'?'none':e.target.value==='amount'?0:null)}><option value="">Choose</option><option value="none">No retainer</option><option value="amount">A retainer amount</option></select></Field>
        {typeof inp.terms.retainer==='number'&&<Field label="Retainer amount, $"><input inputMode="numeric" value={inp.terms.retainer||''} onChange={e=>setT('retainer',numOrNull(e.target.value)??0)}/></Field>}
        <Field label="Exclusivity, months"><input inputMode="numeric" value={inp.terms.exclusivityMonths??''} onChange={e=>setT('exclusivityMonths',numOrNull(e.target.value))}/></Field>
        <Field label="Tail period, months"><input inputMode="numeric" value={inp.terms.tailMonths??''} onChange={e=>setT('tailMonths',numOrNull(e.target.value))}/></Field>
        <Field label="Termination notice, days"><input inputMode="numeric" value={inp.terms.terminationDays??''} onChange={e=>setT('terminationDays',numOrNull(e.target.value))}/></Field>
      </div>
      <Field label="Expenses"><input value={inp.terms.expenses} onChange={e=>setT('expenses',e.target.value)} placeholder="Kalling pays its own expenses."/></Field>
      <div className="eng-problems" aria-live="polite">{problems.length?<><p><strong>Before the owner can sign</strong></p><ul>{problems.map(p=><li key={p}>{p}</li>)}</ul></>:<p>The letter is complete.</p>}</div>
      <div className="adv-buttons"><Button disabled={busy||!!problems.length} onClick={()=>void save()}>Save draft</Button><Button tone="primary" disabled={busy||!!problems.length} onClick={()=>void ready()}>Ready for owner</Button></div>
      {!problems.length&&<details className="eng-preview"><summary>Preview the letter</summary><pre>{renderLetter(full)}</pre></details>}
    </>:cur?<LetterStatusView l={cur} busy={busy} can={can} link={link} advisor={inp.advisorName||String(cur.input.advisorName)}
      newLink={()=>act(async()=>setLink(inviteLink(await store!.invite(pe!.portal.id))))}
      countersign={(n,ok)=>act(async()=>{await store!.countersignLetter(cur.id,n,ok);await countersigned(cur);},'Countersigned. The owner’s document requests are open and the deal is Engaged.')}
      voidIt={r=>act(()=>store!.voidLetter(cur.id,r),'The letter is void. Start a new version when you are ready.')}/>:null}
    {letters.filter(l=>l.status==='Void').length>0&&<p className="adv-muted">{letters.filter(l=>l.status==='Void').length} void version{letters.filter(l=>l.status==='Void').length===1?'':'s'} kept for your records.</p>}
  </Panel>;
}

export async function downloadLetter(l:Letter){const b=await letterPdf(l);const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`Engagement letter v${l.version} signed.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}

function LetterStatusView({l,busy,can,link,advisor,newLink,countersign,voidIt}:{l:Letter;busy:boolean;can:boolean;link:string;advisor:string;newLink:()=>void;countersign:(n:string,ok:boolean)=>void;voidIt:(r:string)=>void}){
  const [name,setName]=useState(''),[ok,setOk]=useState(false),[reason,setReason]=useState(''),[copied,setCopied]=useState(false);
  return <div className="eng-status">
    <ol className="deal-time">{l.events.map((e,i)=><li key={i}><span>{e.status}{e.note?`: ${e.note}`:''}</span><time dateTime={e.at}>{dt(e.at)}</time></li>)}</ol>
    <p className="adv-muted">Version {l.version}. Text fingerprint <code>{l.textHash.slice(0,16)}</code>.</p>
    {can&&['Ready to sign','Viewed by owner'].includes(l.status)&&<div className="eng-link">{link?<><Field label="Invitation link for the owner"><input readOnly value={link} onFocus={e=>e.currentTarget.select()}/></Field><Button onClick={()=>void navigator.clipboard.writeText(link).then(()=>setCopied(true)).catch(()=>{})}>{copied?'Copied':'Copy link'}</Button><p className="adv-muted">Kalling does not send email. Send this link to the owner yourself.</p></>
      :<><p>Waiting for the owner to sign. If they need the link again, create a new one.</p><Button disabled={busy} onClick={newLink}>Create a new link</Button></>}</div>}
    {can&&l.status==='Signed by owner'&&<div className="eng-sign"><p><strong>{l.ownerSignature?.name}</strong> signed on {dt(l.ownerSignature?.at)}. Countersign to open the owner’s document requests.</p>
      <label className="adv-check"><input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/>I agree to sign electronically</label>
      <Field label={`Type ${advisor} to countersign`}><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></Field>
      <Button tone="primary" disabled={busy||!ok||!name.trim()} onClick={()=>countersign(name,ok)}>Countersign</Button></div>}
    {l.status==='Countersigned'&&<div className="adv-buttons"><Button onClick={()=>void downloadLetter(l)}>Download signed letter (PDF)</Button></div>}
    {can&&!['Countersigned','Void'].includes(l.status)&&<details className="eng-void"><summary>Void this letter</summary><Field label="Why it is void"><input value={reason} onChange={e=>setReason(e.target.value)}/></Field><Button disabled={busy||reason.trim().length<5} onClick={()=>voidIt(reason)}>Void letter</Button></details>}
  </div>;
}
