import {useEffect,useState} from 'react';
import type {VerificationStore} from '../../lib/verificationStore';
import {proofKinds,reviewDefault,verificationBadge,type Verification,type VerificationBadge,type ProofInput,type ReviewInput} from '../../lib/buyerVerification';
import {Button,Field,Panel,StatusPill} from '../design/ui';
import './buyer.css';

const day=(s?:string)=>s?new Date(s.slice(0,10)+'T12:00:00').toLocaleDateString():'';
export function VerificationPill({badge}:{badge?:VerificationBadge}){
  const verified=badge?.status==='Verified';return <span className="buyer-verification-badge"><StatusPill tone={verified?'green':'plain'}>{verified?'Verified':badge?.status||'Not reviewed'}</StatusPill>{verified&&<details><summary>What verified means</summary><p>Kalling reviewed financing evidence on {day(badge.reviewedAt)}. Review valid through {day(badge.until)}. This does not guarantee identity, creditworthiness, financing or closing.</p></details>}</span>;
}
function EvidenceFiles({v,store}:{v:Verification;store:VerificationStore}){
  const [error,setError]=useState('');return <><ul className="buyer-proof-files">{v.files.map(f=><li key={f.id}><button type="button" className="text-link" onClick={()=>void store.open(f.id).then(blob=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}).catch(e=>setError(e.message))}>{f.name}</button><span>{Math.ceil(f.size/1024)} KB · {f.status==='stored'?'Validated':'Upload validation pending'}</span></li>)}</ul>{error&&<p role="alert" className="buyer-error">{error}</p>}</>;
}
function useEvidence(store:VerificationStore,buyerId?:string,enabled=true){
  const [rows,setRows]=useState<Verification[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const refresh=async()=>{try{setRows(await store.list(buyerId));setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}};
  useEffect(()=>{if(!enabled){setLoading(false);return;}void refresh();const t=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh();},15000);return()=>clearInterval(t);},[store,buyerId,enabled]);
  return {rows,error,loading,refresh,setError};
}
export function BuyerVerification({store,name}:{store:VerificationStore;name:string}){
  const x=useEvidence(store),current=x.rows[0],draft=current?.status==='Draft'?current:undefined;
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState<{name:string;stage:string;fraction:number}[]>([]);
  async function run(fn:()=>Promise<unknown>,notice:string){setBusy(true);x.setError('');setMessage('');try{await fn();setMessage(notice);await x.refresh();}catch(e){x.setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="buyer-panel" id="buyer-verification" aria-label="Financing evidence">
    <div className="buyer-section-head"><div><h2>Financing evidence</h2><p>Provide a proof-of-funds document or a lender pre-qualification letter for an advisor to review.</p></div><VerificationPill badge={verificationBadge(current)}/></div>
    <p className="buyer-privacy">Only you and authorized Kalling reviewers can read these files. Sellers see a review badge, never the files or your bank details. Please redact account numbers and unrelated transactions. Do not upload passwords, Social Security numbers, government ID or a credit report.</p>
    {store.mode==='local'&&<p className="buyer-demo">Local demo only. Use fictional documents. These files stay in this browser and are not a secure shared account.</p>}
    {x.loading?<p role="status">Loading verification…</p>:<>
      {current&&<div className="buyer-evidence-current"><p><strong>Version {current.version} · {current.status}</strong>{current.submittedAt?' · Submitted '+day(current.submittedAt):''}</p><p>{current.kind}, {current.entity}. Document dated {day(current.documentDate)}.</p>{current.buyerMessage&&<p className="buyer-notice">Your advisor: {current.buyerMessage}</p>}<EvidenceFiles v={current} store={store}/></div>}
      {!draft&&(!current||editing)?<form className="buyer-proof-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{await store.save({kind:String(f.get('kind')) as ProofInput['kind'],entity:String(f.get('entity')),documentDate:String(f.get('documentDate')),validUntil:String(f.get('validUntil')),explanation:String(f.get('explanation'))});setEditing(false);},'Draft saved. Upload the evidence, then send it for review.');}}>
        <div className="buyer-form-grid"><Field label="Evidence type"><select name="kind">{proofKinds.map(k=><option key={k}>{k}</option>)}</select></Field><Field label="Name or entity on the document"><input name="entity" defaultValue={name} required maxLength={160}/></Field><Field label="Document date"><input name="documentDate" type="date" required max={new Date().toISOString().slice(0,10)}/></Field><Field label="Valid through, if stated"><input name="validUntil" type="date"/></Field></div>
        <Field label="Explanation, optional" hint="Explain who the document relates to. Do not paste financial details."><textarea name="explanation" maxLength={1000} rows={2}/></Field><Button tone="primary" disabled={busy}>Save evidence draft</Button>{current&&<Button type="button" onClick={()=>setEditing(false)}>Cancel</Button>}
      </form>:draft?<div className="buyer-proof-form">
        <p>Upload up to three PDFs, PNGs or JPEGs, each up to 10 MB. Files are saved before you submit this version.</p>
        <label className="buyer-upload"><span>{busy?'Saving evidence…':'Choose evidence files'}</span><input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple disabled={busy} onChange={e=>{const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value='';void run(async()=>{for(const file of files){setProgress(p=>[...p.filter(x=>x.name!==file.name),{name:file.name,stage:'Checking file',fraction:0}]);await store.upload(draft.id,file,(stage,fraction)=>setProgress(p=>p.map(x=>x.name===file.name?{...x,stage,fraction}:x)));}},'Saved, not submitted.');}}/></label>
        <ul className="buyer-upload-progress" aria-live="polite">{progress.map(p=><li key={p.name}><span>{p.name}</span><small>{p.stage}</small><progress max={1} value={p.fraction}/></li>)}</ul>
        <Button tone="primary" disabled={busy||!draft.files.length||draft.files.some(f=>f.status!=='stored')} onClick={()=>void run(()=>store.change(draft.id,'Submit'),'Submitted. A Kalling advisor will review this version.')}>Send evidence for review</Button>
      </div>:<div className="buyer-actions"><Button onClick={()=>setEditing(true)} disabled={busy}>Prepare replacement evidence</Button>{current&&current.status!=='Withdrawn'&&<Button disabled={busy} onClick={()=>void run(()=>store.change(current.id,'Withdraw'),'Submission withdrawn. The verified badge has been removed.')}>Withdraw submission</Button>}</div>}
      {editing&&current&&<p className="buyer-notice">Saving a replacement immediately removes the previous verified badge. The new evidence needs review.</p>}
      {!!x.rows.length&&<details className="buyer-history"><summary>Evidence version history ({x.rows.length})</summary><ul>{x.rows.map(v=><li key={v.id}>Version {v.version}: {v.status}, {day(v.createdAt)}. {v.review?'Reviewed '+day(v.review.at):'No advisor verification.'}</li>)}</ul></details>}
    </>}{x.error&&<p className="buyer-error" role="alert">{x.error}</p>}<p role="status" aria-live="polite" className="buyer-saved">{busy?'Saving…':message}</p>
  </section>;
}
export function AdvisorVerification({store,buyerId,readOnly=false,onChanged}:{store:VerificationStore;buyerId:string;readOnly?:boolean;onChanged?:()=>void}){
  const x=useEvidence(store,buyerId,!readOnly),v=x.rows[0],[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [days,setDays]=useState(90);useEffect(()=>{if(!readOnly)void store.policy().then(setDays).catch(e=>x.setError(e.message));},[store,readOnly]);
  const until=[reviewDefault(Date.now(),days),v?.validUntil].filter(Boolean).sort()[0];
  if(readOnly)return <p>Evidence review is available to authorized Kalling reviewers.</p>;
  async function save(input:ReviewInput){if(!v)return;setBusy(true);x.setError('');try{await store.change(v.id,input);await x.refresh();setMessage('Review saved.');onChanged?.();}catch(e){x.setError((e as Error).message);}finally{setBusy(false);}}
  return <Panel title="Financing evidence review"><p className="buyer-privacy">Review the exact submitted documents. A verified badge does not approve a listing NDA or establish lender approval.</p>{x.loading?<p>Loading evidence…</p>:!v?<p>No financing evidence has been submitted. A legacy status or funds note does not count as verification.</p>:<>
    <div className="buyer-section-head"><strong>Version {v.version} · {v.status}</strong><VerificationPill badge={verificationBadge(v)}/></div><p>{v.kind}. {v.entity}. Dated {day(v.documentDate)}{v.validUntil?', valid through '+day(v.validUntil):''}.</p>{v.explanation&&<p>{v.explanation}</p>}<EvidenceFiles v={v} store={store}/>
    {['Submitted','In review','Changes needed','Verified'].includes(v.status)&&<form key={v.id+v.updatedAt} className="buyer-review-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({decision:String(f.get('decision')) as ReviewInput['decision'],message:String(f.get('message')),privateNote:String(f.get('privateNote')),until:String(f.get('until')),reviewed:f.get('reviewed')==='on',fileIds:v.files.map(f=>f.id)});}}>
      <Field label="Decision"><select name="decision" defaultValue={v.status==='Verified'?'Revoked':'In review'}><option>In review</option><option>Changes needed</option><option>Verified</option>{v.status==='Verified'&&<option>Revoked</option>}</select></Field>
      <Field label="Review valid through" hint={`Review policy: up to ${days} days, capped by the document's own validity.`}><input type="date" name="until" defaultValue={until} max={until}/></Field>
      <label className="ks-check"><input type="checkbox" name="reviewed"/>I reviewed every document listed in this version. Required to verify.</label><Field label="Explanation visible to the buyer"><textarea name="message" defaultValue={v.buyerMessage} maxLength={1000} rows={2}/></Field><Field label="Private reviewer note" hint="Do not paste account numbers or financial excerpts."><textarea name="privateNote" defaultValue={v.privateNote} maxLength={1000} rows={2}/></Field><Button tone="primary" disabled={busy}>Save verification review</Button>
    </form>}{v.status==='Draft'&&<p>The buyer has saved a draft and has not submitted it.</p>}
    <details className="buyer-history"><summary>Previous versions</summary><ul>{x.rows.slice(1).map(old=><li key={old.id}>Version {old.version}, {old.status}, {day(old.updatedAt)}</li>)}</ul></details>
  </>}{x.error&&<p role="alert" className="buyer-error">{x.error}</p>}<p role="status" aria-live="polite">{message}</p></Panel>;
}

export function VerificationPolicy({store}:{store:VerificationStore}){
 const [days,setDays]=useState(90),[message,setMessage]=useState('');useEffect(()=>{void store.policy().then(setDays).catch(e=>setMessage(e.message));},[store]);
 return <details className="buyer-history"><summary>Verification freshness policy</summary><form className="buyer-actions" onSubmit={e=>{e.preventDefault();void store.policy(days).then(()=>setMessage('Policy saved. Existing reviews keep their original expiry; new reviews use this policy.')).catch(e=>setMessage(e.message));}}><Field label="Maximum review validity in days" hint="Default 90. Only a firm owner or administrator can change the hosted policy."><input type="number" min={1} max={365} value={days} onChange={e=>setDays(Number(e.target.value))}/></Field><Button>Save review policy</Button></form><p role="status">{message}</p></details>;
}
