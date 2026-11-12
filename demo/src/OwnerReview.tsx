// Owner side: answers about the business, and reviewing the memorandum before buyers see it.
import {useEffect,useRef,useState} from 'react';
import {Check,MessageSquare} from 'lucide-react';
import {answerQuestions,type PortalBundle,type OwnerAnswers} from '../lib/portal';
import type {PortalStore} from '../lib/portalStore';

type P={b:PortalBundle;store:PortalStore;readOnly:boolean;refresh:()=>Promise<void>};
type Key=keyof Omit<OwnerAnswers,'portalId'|'updatedAt'>;

export function AboutBusiness({b,store,readOnly,refresh}:P){
  const [v,setV]=useState<Record<Key,string>>(()=>({history:b.answers?.history||'',services:b.answers?.services||'',strengths:b.answers?.strengths||'',team:b.answers?.team||'',afterSale:b.answers?.afterSale||''})),[saved,setSaved]=useState(''),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const change=(k:Key,t:string)=>{setV(x=>({...x,[k]:t}));setSaved('Saving…');clearTimeout(timer.current);timer.current=setTimeout(()=>{void store.saveAnswers(b.portal.id,{[k]:t}).then(()=>{setSaved('Saved');void refresh();}).catch(e=>setSaved('Not saved: '+e.message));},900);};
  return <section id="portal-about" className="portal-section"><h2>About your business</h2>
    <p className="portal-lede">Your answers help us write the memorandum buyers read after signing an NDA. Write as you would talk. Everything saves as you type, and you can come back any time. <em className="portal-saved" aria-live="polite">{saved}</em></p>
    <div className="portal-about">{answerQuestions.map(([k,q,hint])=><label key={k} className="field"><span>{q}</span><small>{hint}</small><textarea rows={4} maxLength={3000} value={v[k]} disabled={readOnly} onChange={e=>change(k,e.target.value)}/></label>)}</div>
  </section>;
}

export function MemorandumReview({b,store,readOnly,refresh}:P){
  const r=b.reviews.find(x=>x.kind==='cim');const [comments,setComments]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  if(!r)return null;
  const decide=async(d:'Approved'|'Changes requested')=>{setBusy(true);setErr('');try{await store.decideReview(r.id,d,Object.entries(comments).map(([section,text])=>({section,text})));await refresh();}catch(e){setErr(e instanceof Error?e.message:'Could not send.');}finally{setBusy(false);}};
  return <section id="portal-memo" className="portal-section portal-memo"><h2>Your memorandum</h2>
    <p className="portal-lede">This is what approved buyers will read after they sign a confidentiality agreement. Nothing is shared until you approve it. If something is wrong or private, add a note to that section.</p>
    {r.status!=='Waiting for owner'&&<p className="portal-sent" role="status"><Check size={15}/>{r.status==='Approved'?'You approved version '+r.version+'.':'You asked for changes to version '+r.version+'. Your advisor will send a new version.'}</p>}
    <article className="portal-memo-doc" aria-label={r.title}><h3 className="portal-memo-title">{r.title}</h3>
      {r.sections.map(s=><div key={s.key} className="portal-memo-section"><h4>{s.title}</h4>{s.text.split('\n\n').map((t,i)=><p key={i}>{t}</p>)}
        {r.status==='Waiting for owner'&&!readOnly&&<details className="portal-memo-comment"><summary><MessageSquare size={14}/>Suggest a change to this section</summary><label className="field"><span className="sr-only">Your note on {s.title}</span><textarea rows={2} value={comments[s.key]||''} onChange={e=>setComments(c=>({...c,[s.key]:e.target.value}))}/></label></details>}
        {r.comments.filter(c=>c.section===s.key).map((c,i)=><p key={i} className="portal-memo-note">Your note: {c.text}</p>)}</div>)}
    </article>
    {r.status==='Waiting for owner'&&!readOnly&&<div className="portal-request-actions"><button className="btn primary" disabled={busy} onClick={()=>void decide('Approved')}><Check size={15}/>Approve the memorandum</button><button className="btn" disabled={busy||!Object.values(comments).some(t=>t.trim().length>=3)} onClick={()=>void decide('Changes requested')}>Ask for changes</button><small aria-live="polite">{err||'Approving lets your advisor add it to the data room for approved buyers.'}</small></div>}
  </section>;
}
