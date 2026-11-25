import {useId,useState} from 'react';
import type {RoomSearchResult} from '../lib/askRoom';
import './askRoom.css';

type Props = {
  search: (question: string) => Promise<RoomSearchResult[]>;
  open?: (result: RoomSearchResult, button: HTMLButtonElement) => void;
  opening?: boolean;
  askAdvisor?: (question: string) => Promise<void>;
  buttonClass: string;
};

export function AskRoom({search,open,opening,askAdvisor,buttonClass}:Props) {
  const heading=useId();
  const [question,setQuestion]=useState('');
  const [results,setResults]=useState<RoomSearchResult[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(false);
  const [error,setError]=useState('');

  async function findPassages() {
    setBusy(true);
    setResults(null);
    setError('');
    setSent(false);
    try { setResults(await search(question.trim())); }
    catch (e) { setError(e instanceof Error ? e.message : 'The documents could not be searched. Try again.'); }
    finally { setBusy(false); }
  }

  async function sendQuestion() {
    if (!askAdvisor) return;
    setBusy(true);
    setError('');
    try { await askAdvisor(question.trim()); setSent(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'The question could not be sent. Try again.'); }
    finally { setBusy(false); }
  }

  return <section className="ask-room" aria-labelledby={heading}>
    <h3 id={heading}>Ask the data room</h3>
    {askAdvisor&&<p className="ask-room-note">Your advisor can see your questions. The owner sees only how many were asked.</p>}
    <form onSubmit={e=>{e.preventDefault();if(!busy&&question.trim().length>=2)void findPassages();}}>
      <label>
        <span>Question about the data room</span>
        <textarea rows={2} required maxLength={3000} value={question} disabled={busy} onChange={e=>{
          setQuestion(e.target.value);setResults(null);setSent(false);setError('');
        }}/>
      </label>
      <button className={buttonClass} disabled={busy||question.trim().length<2}>Search documents</button>
    </form>
    {busy&&<p role="status">{results?'Sending your question…':'Searching documents…'}</p>}
    {error&&<p className="ask-room-error" role="alert">{error}</p>}
    {results?.length ? <>
      <p role="status">{results.length} matching passage{results.length===1?'':'s'}</p>
      <ul className="ask-room-results">
        {results.map(result=><li key={`${result.itemId}:${result.page}`}>
          <p className="ask-room-citation">{result.displayName}, page {result.page}</p>
          <blockquote>{result.quote}</blockquote>
          {open&&<button type="button" className={buttonClass} disabled={opening} onClick={e=>open(result,e.currentTarget)}>Open at page {result.page}</button>}
        </li>)}
      </ul>
    </> : results&&<div className="ask-room-empty">
      <p role="status">Nothing in the documents answers that yet.</p>
      {askAdvisor&&(sent?<p role="status">Question sent. Answers appear on this listing.</p>:
        <button type="button" className={buttonClass} disabled={busy} onClick={()=>void sendQuestion()}>Ask the advisor</button>)}
    </div>}
  </section>;
}
