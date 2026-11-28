// Owner side: answers about the business, and reviewing the memorandum before buyers see it.
import {useEffect,useRef,useState} from 'react';
import {Check,MessageSquare,Send} from 'lucide-react';
import {nextTurn,applyReply,answered,type Answers,type AnswerKey} from '../lib/interview';
import './interview.css';
import {answerQuestions,type PortalBundle,type OwnerAnswers} from '../lib/portal';
import type {PortalStore} from '../lib/portalStore';

type P={b:PortalBundle;store:PortalStore;readOnly:boolean;refresh:()=>Promise<void>};
type Key=keyof Omit<OwnerAnswers,'portalId'|'updatedAt'>;

export function AboutBusiness({b,store,readOnly,refresh}:P){
  const [v,setV]=useState<Record<Key,string>>(()=>({history:b.answers?.history||'',services:b.answers?.services||'',strengths:b.answers?.strengths||'',team:b.answers?.team||'',afterSale:b.answers?.afterSale||''})),[saved,setSaved]=useState(''),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const change=(k:Key,t:string)=>{setV(x=>({...x,[k]:t}));setSaved('Saving…');clearTimeout(timer.current);timer.current=setTimeout(()=>{void store.saveAnswers(b.portal.id,{[k]:t}).then(()=>{setSaved('Saved');void refresh();}).catch(e=>setSaved('Not saved: '+e.message));},900);};
  const [mode,setMode]=useState<'chat'|'form'>(()=>!readOnly&&answered(v)<answerQuestions.length?'chat':'form');
  return <section id="portal-about" className="portal-section"><h2>About your business</h2>
    <p className="portal-lede">Your answers help us write the memorandum buyers read after signing a confidentiality agreement. Write as you would talk, and come back any time. <em className="portal-saved" aria-live="polite">{saved}</em></p>
    {!readOnly&&<div className="iv-modes" role="group" aria-label="How to answer"><button type="button" aria-pressed={mode==='chat'} onClick={()=>setMode('chat')}>One question at a time</button><button type="button" aria-pressed={mode==='form'} onClick={()=>setMode('form')}>See all questions</button></div>}
    {mode==='chat'&&!readOnly?<TextInterview v={v} onSave={async(k,t)=>{setV(x=>({...x,[k]:t}));setSaved('Saving…');try{await store.saveAnswers(b.portal.id,{[k]:t});setSaved('Saved');void refresh();}catch(e){setSaved('Not saved: '+(e as Error).message);throw e;}}} onForm={()=>setMode('form')}/>:
    <div className="portal-about">{answerQuestions.map(([k,q,hint])=><label key={k} className="field"><span>{q}</span><small>{hint}</small><textarea rows={4} maxLength={3000} value={v[k]} disabled={readOnly} onChange={e=>change(k,e.target.value)}/></label>)}</div>}
  </section>;
}

/** The same questions as a conversation: one at a time, with one gentle follow-up on a short answer. */
function TextInterview({v,onSave,onForm}:{v:Answers;onSave:(k:AnswerKey,t:string)=>Promise<void>;onForm:()=>void}){
  const [followed,setFollowed]=useState<Set<AnswerKey>>(()=>new Set()),[reply,setReply]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const input=useRef<HTMLTextAreaElement>(null);
  const turn=nextTurn(v,followed);
  const asked=answerQuestions.filter(([k])=>(v[k]||'').trim());
  const send=async()=>{if(!turn||!reply.trim())return;setBusy(true);setErr('');const next=applyReply(v,turn,reply);
    try{await onSave(turn.key,next[turn.key]);if(turn.followUp)setFollowed(f=>new Set(f).add(turn.key));setReply('');setTimeout(()=>input.current?.focus(),0);}catch(e){setErr('That did not save: '+(e as Error).message+' Try again.');}finally{setBusy(false);}};
  return <div className="iv">
    <ol className="iv-log" aria-live="polite">
      {asked.map(([k,q])=><li key={k}><p className="iv-q">{q}</p><p className="iv-a">{v[k]}</p></li>)}
      {turn?<li className="iv-now"><p className="iv-q">{turn.prompt}</p>{!turn.followUp&&<small>{turn.hint}</small>}</li>
        :<li className="iv-now"><p className="iv-q">That’s everything, thank you. Your advisor will use this to draft your memorandum, and you’ll review it before any buyer sees it.</p><button type="button" className="btn" onClick={onForm}>Review or change your answers</button></li>}
    </ol>
    {turn&&<form className="iv-reply" onSubmit={e=>{e.preventDefault();void send();}}>
      <label className="sr-only" htmlFor="iv-text">Your answer</label>
      <textarea id="iv-text" ref={input} rows={3} maxLength={3000} value={reply} placeholder="Type your answer" disabled={busy} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
      <div className="iv-row"><small>Question {turn.index+1} of {turn.total}.<span className="iv-keys"> Press Enter to send, Shift and Enter for a new line.</span></small><button className="btn primary" type="submit" disabled={busy||!reply.trim()}><Send size={15}/>Send</button></div>
      {err&&<p role="alert" className="error-banner">{err}</p>}
    </form>}
  </div>;
}

export function MemorandumReview({b,store,readOnly,refresh}:P){
  const r=b.reviews.find(x=>x.kind==='cim');const [comments,setComments]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  if(!r)return null;
  const decide=async(d:'Approved'|'Changes requested')=>{setBusy(true);setErr('');try{await store.decideReview(r.id,d,Object.entries(comments).map(([section,text])=>({section,text})));await refresh();}catch(e){setErr(e instanceof Error?e.message:'Could not send.');}finally{setBusy(false);}};
  return <section id="portal-memo" className="portal-section portal-memo"><h2>Your memorandum</h2>
    <p className="portal-lede">This is what approved buyers will read after they sign a confidentiality agreement. Nothing is shared until you approve it. If something is wrong or private, add a note to that section.</p>
    {r.status!=='Waiting for owner'&&<p className="portal-sent" role="status"><Check size={15}/>{r.status==='Approved'?'You approved version '+r.version+'.':'You asked for changes to version '+r.version+'. Your advisor will send a new version.'}</p>}
    {(()=>{const doc=<article className="portal-memo-doc" aria-label={r.title}><h3 className="portal-memo-title">{r.title}</h3>
      {r.sections.map(s=><div key={s.key} className="portal-memo-section"><h4>{s.title}</h4>{s.text.split('\n\n').map((t,i)=><p key={i}>{t}</p>)}
        {r.status==='Waiting for owner'&&!readOnly&&<details className="portal-memo-comment"><summary><MessageSquare size={14}/>Suggest a change to this section</summary><label className="field"><span className="sr-only">Your note on {s.title}</span><textarea rows={2} value={comments[s.key]||''} onChange={e=>setComments(c=>({...c,[s.key]:e.target.value}))}/></label></details>}
        {r.comments.filter(c=>c.section===s.key).map((c,i)=><p key={i} className="portal-memo-note">Your note: {c.text}</p>)}</div>)}
    </article>;
      // Once decided, the full text folds away so the page stays short; it is one tap to read again.
      return r.status==='Waiting for owner'?doc:<details className="portal-memo-again"><summary>Read version {r.version} again</summary>{doc}</details>;})()}
    {r.status==='Waiting for owner'&&!readOnly&&<div className="portal-request-actions"><button className="btn primary" disabled={busy} onClick={()=>void decide('Approved')}><Check size={15}/>Approve the memorandum</button><button className="btn" disabled={busy||!Object.values(comments).some(t=>t.trim().length>=3)} onClick={()=>void decide('Changes requested')}>Ask for changes</button><small aria-live="polite">{err||(Object.values(comments).some(t=>t.trim().length>=3)?'Your notes go to your advisor, who will send a new version.':'Approving lets your advisor add it to the data room for approved buyers. To ask for changes, add a note to any section first.')}</small></div>}
  </section>;
}
