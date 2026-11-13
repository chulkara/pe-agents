// Owner side of the data room: approve what buyers will see, then see who opened what (anonymous labels only).
import {useCallback,useEffect,useState} from 'react';
import {Check,Eye,X} from 'lucide-react';
import type {DataRoomStore,OwnerRoom} from '../lib/dataRoomStore';
import {folders} from '../lib/dataRoom';

const when=(s:string)=>new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric'});
export function useOwnerRooms(room:DataRoomStore|undefined,portalId:string){
  const [rooms,setRooms]=useState<OwnerRoom[]>([]),[error,setError]=useState('');
  const load=useCallback(async()=>{if(!room)return;try{setRooms(await room.ownerRooms([portalId]));setError('');}catch(e){if(!/does not exist|schema cache/.test((e as Error).message))setError((e as Error).message);}},[room,portalId]);
  useEffect(()=>{void load();const t=setInterval(()=>{if(document.visibilityState!=='hidden')void load();},20000);return()=>clearInterval(t);},[load]);
  return {rooms,error,load};
}

export default function OwnerDataRoom({room,portalId,readOnly,firm}:{room:DataRoomStore|undefined;portalId:string;readOnly:boolean;firm:string}){
  const {rooms,error,load}=useOwnerRooms(room,portalId),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[err,setErr]=useState(''),[why,setWhy]=useState<Record<string,string>>({}),[asking,setAsking]=useState('');
  if(!room||!rooms.length)return null;
  async function act(fn:()=>Promise<void>,done:string){setBusy(true);setErr('');setMsg('');try{await fn();await load();setMsg(done);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  return <>{rooms.map(r=>{const live=r.items.filter(i=>i.ownerStatus!=='Removed'),pending=live.filter(i=>i.ownerStatus==='Pending'),removed=r.items.filter(i=>i.ownerStatus==='Removed');
    return <div key={r.listingId}>
    <section id="portal-dataroom" className="portal-section portal-dr"><h2>What buyers will see</h2>
      <p className="portal-lede">These documents go in the data room for listing {r.listingNumber}. Only buyers who signed an NDA and were approved by {firm} can open them. Each page they view shows their name, and nothing is shared until you approve it.</p>
      <p className="portal-dr-state" role="status">{r.room.status==='Published'?'The data room is open to approved buyers.':r.room.status==='Unpublished'?'The data room is closed. No buyer can open these documents.':pending.length?`${pending.length} document${pending.length===1?' is':'s are'} waiting for your approval.`:`You approved everything. ${firm} can now open the data room.`}</p>
      {folders.filter(f=>live.some(i=>i.folder===f)).map(f=><div key={f} className="portal-dr-folder"><h3>{f}</h3><ul>{live.filter(i=>i.folder===f).map(i=><li key={i.id} className={i.ownerStatus==='Approved'?'ok':''}>
        <div><strong>{i.displayName}</strong><small>{i.tier==='After NDA'?'Buyers who signed the NDA':'Only buyers with a signed letter of intent'}. {i.allowDownload?'Can be downloaded, stamped with their name.':'View only.'}{i.note?` ${i.note}`:''}</small></div>
        {i.ownerStatus==='Approved'?<span className="portal-dr-ok"><Check size={14}/>Approved</span>:!readOnly&&<span className="portal-dr-actions">
          <button className="btn primary" disabled={busy} onClick={()=>void act(()=>room.ownerDecide([i.id],'Approved','',[portalId]),`Approved “${i.displayName}”.`)}>Approve</button>
          <button className="btn" disabled={busy} aria-expanded={asking===i.id} onClick={()=>setAsking(asking===i.id?'':i.id)}><X size={14}/>Don’t share</button></span>}
        {asking===i.id&&<form className="portal-dr-why" onSubmit={e=>{e.preventDefault();void act(async()=>{await room.ownerDecide([i.id],'Removed',why[i.id]||'',[portalId]);setAsking('');},`“${i.displayName}” will not be shared. ${firm} has been told.`);}}>
          <label className="field"><span>Why shouldn’t buyers see this?</span><input required minLength={3} maxLength={400} value={why[i.id]||''} onChange={e=>setWhy({...why,[i.id]:e.target.value})}/></label><button className="btn" disabled={busy}>Don’t share</button></form>}
      </li>)}</ul></div>)}
      {!readOnly&&pending.length>1&&<div className="portal-request-actions"><button className="btn primary" disabled={busy} onClick={()=>void act(()=>room.ownerDecide(pending.map(i=>i.id),'Approved','',[portalId]),'Approved every document.')}><Check size={15}/>Approve all {pending.length}</button></div>}
      {removed.length>0&&<p className="portal-fine">Not shared: {removed.map(i=>i.displayName).join(', ')}.</p>}
      <p aria-live="polite" className={err||error?'portal-error':'portal-saved'}>{err||error||msg}</p>
    </section>
    <section id="portal-opened" className="portal-section"><h2>Who opened what</h2>
      <p className="portal-lede">Buyers are shown by a number and type so you can follow interest without seeing who they are. {firm} knows each buyer and vetted them before approving the NDA.</p>
      {r.log.length?<ul className="portal-dr-log">{r.log.map(x=><li key={x.item}><strong><Eye size={14}/>{x.item}</strong><ul>{x.entries.map(e=><li key={e.label}>{e.label} opened it {e.opens===1?'once':`${e.opens} times`}, last on {when(e.last)}{e.downloaded?', and downloaded a stamped copy':''}.</li>)}</ul></li>)}</ul>
        :<p className="portal-empty">{r.room.status==='Published'?'No buyer has opened a document yet.':'Once the data room opens, you will see here when buyers open each document.'}</p>}
      <label className="portal-check"><input type="checkbox" checked={!!r.room.weeklySummary} disabled={readOnly||busy} onChange={e=>void act(()=>room.setWeeklySummary(r.listingId,e.target.checked,[portalId]),e.target.checked?`${firm} will send you a weekly summary as a portal message.`:'Weekly summary turned off.')}/>Send me a weekly summary as a portal message</label>
    </section></div>;})}</>;
}
