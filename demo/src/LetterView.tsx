// The owner reads and signs the engagement letter in their portal.
import {useEffect,useRef,useState} from 'react';
import {Check,FileSignature,Download} from 'lucide-react';
import {currentLetter,type PortalBundle,type Letter} from '../lib/portal';
import type {PortalStore} from '../lib/portalStore';
import {letterPdf} from '../lib/pdf';

const when=(s?:string)=>s?new Date(s).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}):'';
async function download(l:Letter){const b=await letterPdf(l);const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`Engagement letter v${l.version} signed.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}

export function SignedLetterLink({b}:{b:PortalBundle}){const l=b.letters.find(x=>x.status==='Countersigned');if(!l)return null;
  return <li><span className="portal-file"><FileSignatureIcon/><button className="text-link" onClick={()=>void download(l)}>Signed engagement letter (PDF)</button><small>Signed {when(l.firmSignature?.at)}</small><Download size={13} aria-hidden="true"/></span><small>Used for your engagement with {b.portal.firmName}</small></li>;}
const FileSignatureIcon=()=><FileSignature size={14} aria-hidden="true"/>;

/** Shown above everything else until the letter is countersigned. */
export default function OwnerLetter({b,store,readOnly,refresh}:{b:PortalBundle;store:PortalStore;readOnly:boolean;refresh:()=>Promise<void>}){
  const l=currentLetter(b.letters);const [name,setName]=useState(''),[ok,setOk]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState('');const viewed=useRef(false);
  useEffect(()=>{if(l&&l.status==='Ready to sign'&&!readOnly&&!viewed.current){viewed.current=true;void store.letterViewed(l.id).then(refresh).catch(()=>{});}},[l,readOnly,store,refresh]);
  if(!l||l.status==='Countersigned')return null;
  const sign=async()=>{setBusy(true);setErr('');try{await store.signLetter(l.id,name,ok);await refresh();}catch(e){setErr(e instanceof Error?e.message:'Could not sign.');}finally{setBusy(false);}};
  return <section id="portal-letter" className="portal-section portal-letter" aria-labelledby="letter-h">
    <h2 id="letter-h">Your engagement letter</h2>
    <p className="portal-lede">This letter says what we will do for you, what it costs, and how either of us can end it. Read it, then sign by typing your name. Your document requests open once both of us have signed.</p>
    <article className="portal-letter-text" tabIndex={0} aria-label="Engagement letter text">{l.text.split('\n').map((t,i)=>/^\d+\. /.test(t)?<h3 key={i}>{t}</h3>:i===0?<h3 key={i} className="portal-letter-title">{t}</h3>:t?<p key={i}>{t}</p>:null)}</article>
    {l.status==='Signed by owner'?<p className="portal-sent" role="status"><Check size={15}/>You signed on {when(l.ownerSignature?.at)}. {b.portal.firmName} will countersign, and then your document requests open here.</p>
    :readOnly?<p className="portal-muted">Preview: the owner signs here.</p>
    :<form className="portal-sign" onSubmit={e=>{e.preventDefault();void sign();}}>
      <label className="portal-consent"><input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)}/><span>I agree to sign this letter electronically. My typed name has the same effect as a handwritten signature.</span></label>
      <label className="field"><span>Type your full name: {String(l.input.ownerName)}</span><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
      <button className="btn primary" disabled={busy||!ok||!name.trim()}><FileSignature size={15}/>Sign the letter</button>
      <p className="portal-muted" aria-live="polite">{err||'We record your name, email, the time and a fingerprint of this exact text. We do not record your IP address or device.'}</p>
    </form>}
  </section>;
}
