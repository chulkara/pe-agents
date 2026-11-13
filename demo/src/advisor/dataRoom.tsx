// Deal Room, Data room tab: choose owner documents, send them to the owner, publish, and see who opened what.
import {useCallback,useContext,useEffect,useState} from 'react';
import type {Company} from '../../lib/domain';
import type {Listing} from '../../lib/brokerage';
import type {Portal,PortalBundle} from '../../lib/portal';
import {folders,tiers,suggestPlacement,suggestName,summaryText,type Folder,type Tier,type RoomItem} from '../../lib/dataRoom';
import type {AdvisorRoom} from '../../lib/dataRoomStore';
import {acceptedInputs} from '../../lib/extract';
import {materialsOf} from '../../lib/materials';
import {canShareInDataRoom} from '../../lib/cim';
import {cimPdfBlob} from './cimEditor';
import {useAdvisor} from './data';
import {PortalContextRef} from '../OwnerPortalAdmin';
import {Button,StatusPill,Panel,EmptyState,Field} from '../design/ui';

type P={c:Company;listing?:Listing;pe?:{portal:Portal;bundle?:PortalBundle};readOnly:boolean;onLive:(live:boolean)=>void;goListing:()=>void};
const when=(s:string)=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const minutes=(s:number)=>s<60?`${s} sec`:`${Math.round(s/60)} min`;
type Choice={fileId:string;fileName:string;mime:string;requests:string[];firm?:boolean};

export default function DataRoomTab(p:P){
  const x=useAdvisor(),portalCtx=useContext(PortalContextRef),[r,setR]=useState<AdvisorRoom|null>(null),[err,setErr]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<RoomItem|Choice|null>(null);
  const listingId=p.listing?.id;
  const load=useCallback(async()=>{if(!listingId)return;try{setR(await x.room.room(listingId));setErr('');}catch(e){setErr((e as Error).message);}},[x.room,listingId]);
  useEffect(()=>{void load();const t=setInterval(()=>{if(document.visibilityState!=='hidden')void load();},15000);return()=>clearInterval(t);},[load]);
  useEffect(()=>{p.onLive(r?.room?.status==='Published');},[r?.room?.status,p.onLive]);
  if(!p.listing)return <EmptyState title="No listing yet" action={<Button onClick={p.goListing}>Build the listing</Button>}>The data room belongs to a listing. Draft the anonymous listing first.</EmptyState>;
  if(!p.pe?.bundle)return <EmptyState title="No owner portal">Documents come from the owner portal. Prepare the engagement letter on the Owner tab to open one.</EmptyState>;
  const b=p.pe.bundle,listing=p.listing,items=r?.items.filter(i=>i.ownerStatus!=='Removed')||[],removed=r?.items.filter(i=>i.ownerStatus==='Removed')||[],status=r?.room?.status||'Draft';
  const inRoom=new Set(items.map(i=>i.fileId));
  const choices:Choice[]=acceptedInputs(b).filter(f=>!inRoom.has(f.fileId)).map(f=>({fileId:f.fileId,fileName:f.name,mime:f.mime,requests:f.requests}));
  const cim=materialsOf(p.c).cim[0],cimReady=canShareInDataRoom(cim),cimName=cim?`Confidential memorandum, version ${cim.version}`:'';
  const cimIn=items.some(i=>i.displayName===cimName);
  async function act(fn:()=>Promise<unknown>,done=''){setBusy(true);setErr('');setMsg('');try{await fn();await load();if(done)setMsg(done);}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
  async function addCim(){const s=portalCtx?.store;if(!s||!cim)throw Error('The owner portal is not connected.');
    const blob=await cimPdfBlob(p.c,cim),f=await s.uploadFirmFile(b.portal.id,new File([blob],`Memorandum v${cim.version}.pdf`,{type:'application/pdf'}));
    await x.room.saveItem({listingId:listing.id,portalId:b.portal.id,fileId:f.id,fileName:f.name,mime:f.mime,displayName:cimName,folder:'Overview',tier:'After NDA',allowDownload:false,note:'Start here.'});await x.reloadPortals();}
  const pending=items.filter(i=>i.ownerStatus==='Pending').length,approved=items.filter(i=>i.ownerStatus==='Approved').length;
  const nameOf=(id:string)=>r?.buyers.find(x=>x.buyerId===id)?.name||x.d?.buyers.find(y=>y.id===id)?.name||'A buyer';
  const approvedBuyers=(x.d?.requests||[]).filter(a=>a.listingId===listing.id&&a.status==='Approved').map(a=>x.d!.buyers.find(y=>y.id===a.buyerId)).filter(Boolean);
  const log=items.map(it=>({item:it.displayName,entries:(r?.engagement||[]).filter(g=>g.itemId===it.id&&(g.opens||g.downloads)).map(g=>({label:r!.buyers.find(y=>y.buyerId===g.buyerId)?.label||'A buyer',opens:g.opens,last:g.last,downloaded:g.downloads>0}))})).filter(x=>x.entries.length);
  const summary=summaryText(log);
  return <div className="dr">
    <div className="dr-status" role="status" aria-live="polite">
      <StatusPill tone={status==='Published'?'green':status==='Proposed'?'peri':'plain'}>{status==='Published'?'Open to approved buyers':status==='Proposed'?'With the owner for approval':status==='Unpublished'?'Closed to buyers':'Draft, not shared'}</StatusPill>
      <span>{items.length} document{items.length===1?'':'s'}. {approved} approved by the owner{pending?`, ${pending} waiting`:''}.</span>
      {!p.readOnly&&<span className="dr-status-actions">
        {status!=='Published'&&pending>0&&<Button disabled={busy} onClick={()=>void act(()=>x.room.setStatus(listing.id,'Proposed'),'Sent to the owner. They see “What buyers will see” in their portal.')}>{status==='Proposed'?'Send changes to the owner':'Send to owner for approval'}</Button>}
        {status!=='Published'&&<Button tone="primary" disabled={busy||!items.length||pending>0} title={pending?'The owner must approve every document first.':undefined} onClick={()=>void act(()=>x.room.setStatus(listing.id,'Published'),'The data room is open to approved buyers.')}>Publish data room</Button>}
        {status==='Published'&&<Button disabled={busy} onClick={()=>void act(()=>x.room.setStatus(listing.id,'Unpublished'),'Closed. Buyers lost access at once.')}>Unpublish</Button>}
      </span>}
    </div>
    {pending>0&&status==='Published'&&<p className="dr-note">Changed documents are hidden from buyers until the owner approves them again.</p>}
    {msg&&<p className="dr-ok" role="status">{msg}</p>}{err&&<p className="dr-err" role="alert">{err}</p>}

    <Panel title="Documents in the data room">
      {!items.length?<p className="dr-empty">Nothing here yet. Add accepted owner documents below.</p>:
      folders.filter(f=>items.some(i=>i.folder===f)).map(f=><section key={f} className="dr-folder"><h3>{f}</h3>
        <table className="dr-table"><thead><tr><th scope="col">Buyers see</th><th scope="col">When</th><th scope="col">Download</th><th scope="col">Owner</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{items.filter(i=>i.folder===f).map(i=><tr key={i.id}><td><strong>{i.displayName}</strong><small>{i.fileName}{i.note?`. ${i.note}`:''}</small></td><td>{i.tier}</td><td>{i.allowDownload?'Allowed':'View only'}</td>
          <td><StatusPill tone={i.ownerStatus==='Approved'?'green':'warn'}>{i.ownerStatus==='Approved'?'Approved':'Waiting'}</StatusPill></td>
          <td className="dr-row-actions">{!p.readOnly&&<><Button tone="quiet" onClick={()=>setEditing(i)}>Edit</Button><Button tone="quiet" disabled={busy} onClick={()=>void act(()=>x.room.removeItem(i.id),`Removed “${i.displayName}”. Buyers can no longer open it.`)}>Remove</Button></>}</td></tr>)}</tbody></table></section>)}
      {removed.length>0&&<p className="dr-removed">Not shared: {removed.map(i=>`${i.displayName}${i.ownerNote?` (${i.ownerNote})`:''}`).join('; ')}.</p>}
    </Panel>

    {!p.readOnly&&<Panel title="Add documents">
      {cim&&!cimIn&&<div className="dr-add-cim"><div><strong>{cimName}</strong><small>{cimReady?'You and the owner approved it. Adding it creates a PDF in the owner portal.':'Needs your approval and the owner’s before it can go in the data room.'}</small></div><Button tone="primary" disabled={busy||!cimReady} onClick={()=>void act(addCim,'Memorandum added. Send it to the owner for approval.')}>Add memorandum</Button></div>}
      {choices.length?<ul className="dr-choices">{choices.map(c=><li key={c.fileId}><span><strong>{c.fileName}</strong><small>From {c.requests.join(', ')}</small></span><Button onClick={()=>setEditing(c)}>Add</Button></li>)}</ul>
       :<p className="dr-empty">Every accepted owner document is already here. Accept more on the Documents tab.</p>}
    </Panel>}
    {editing&&<ItemForm key={'fileId' in editing&&!('id' in editing)?editing.fileId:(editing as RoomItem).id} it={editing} busy={busy} onCancel={()=>setEditing(null)} onSave={v=>void act(async()=>{await x.room.saveItem({...v,listingId:listing.id,portalId:b.portal.id});setEditing(null);},'id' in editing?'Saved. If buyers would get something different, the owner approves it again.':'Added. Send it to the owner for approval.')}/>}

    <Panel title="Most engaged buyers">
      {!r?.buyers.length?<p className="dr-empty">{status==='Published'?'No buyer has opened a document yet.':'Buyers can open documents once the data room is published.'}</p>:
      <table className="dr-table"><thead><tr><th scope="col">Buyer</th><th scope="col">Documents opened</th><th scope="col">Time reading</th><th scope="col">Last opened</th></tr></thead>
        <tbody>{r.buyers.map(e=><tr key={e.buyerId}><td><strong>{e.name}</strong><small>Owner sees “{e.label}”</small></td><td>{e.documents} of {items.length}</td><td>{minutes(e.seconds)}</td><td>{when(e.last)}</td></tr>)}</tbody></table>}
      {r&&r.engagement.some(g=>g.denied)&&<p className="dr-note">{r.engagement.filter(g=>g.denied).map(g=>`${nameOf(g.buyerId)} was refused ${g.denied} time${g.denied===1?'':'s'}`).join('. ')}.</p>}
    </Panel>

    <div className="adv-grid2">
      <Panel title="After-LOI documents">
        <p className="dr-help">Buyers with an accepted offer see after-LOI documents automatically. Grant access to another buyer here, with a note.</p>
        {r?.loi.map(g=><p key={g.buyerId} className="dr-loi"><strong>{nameOf(g.buyerId)}</strong> {g.note} <small>{g.by}, {when(g.at)}</small></p>)}
        {!p.readOnly&&approvedBuyers.length>0&&<form className="dr-loi-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),t=e.currentTarget;void act(async()=>{await x.room.grantLoi(listing.id,String(f.get('buyer')),String(f.get('note')));t.reset();},'Access granted.');}}>
          <Field label="Buyer"><select name="buyer" required>{approvedBuyers.map(b=><option key={b!.id} value={b!.id}>{b!.name}</option>)}</select></Field>
          <Field label="Why" hint="For example, the signed LOI date."><input name="note" required minLength={5} maxLength={400}/></Field>
          <Button disabled={busy}>Grant after-LOI access</Button></form>}
      </Panel>
      <Panel title="Weekly summary for the owner">
        <p className="dr-help">{r?.room?.weeklySummary?'The owner asked for a weekly summary. Nothing is sent automatically: review it and send it as a portal message.':'The owner has not asked for a weekly summary. You can still send one.'}</p>
        <pre className="dr-summary">{summary}</pre>
        {!p.readOnly&&<Button disabled={busy||!portalCtx?.store} onClick={()=>void act(async()=>{await portalCtx!.store!.message(b.portal.id,summary);await x.reloadPortals();},'Sent to the owner as a portal message.')}>Send to owner</Button>}
      </Panel>
    </div>
  </div>;
}

function ItemForm({it,busy,onSave,onCancel}:{it:RoomItem|Choice;busy:boolean;onSave:(v:{id?:string;fileId:string;fileName:string;mime:string;displayName:string;folder:Folder;tier:Tier;allowDownload:boolean;note:string})=>void;onCancel:()=>void}){
  const existing='id' in it?it as RoomItem:null,c=it as Choice,guess=existing?{folder:existing.folder,tier:existing.tier}:suggestPlacement(c.fileName,c.requests);
  const [v,setV]=useState({displayName:existing?.displayName||suggestName(c.fileName,c.requests),folder:guess.folder,tier:guess.tier,allowDownload:existing?.allowDownload||false,note:existing?.note||''});
  return <form className="dr-form" aria-label={existing?'Edit document':'Add document'} onSubmit={e=>{e.preventDefault();onSave({id:existing?.id,fileId:existing?.fileId||c.fileId,fileName:existing?.fileName||c.fileName,mime:existing?.mime||c.mime,...v});}}>
    <h3>{existing?'Edit':'Add'} {existing?.fileName||c.fileName}</h3>
    <div className="adv-grid2">
      <Field label="Name buyers see"><input required minLength={2} maxLength={160} value={v.displayName} onChange={e=>setV({...v,displayName:e.target.value})}/></Field>
      <Field label="Folder"><select value={v.folder} onChange={e=>setV({...v,folder:e.target.value as Folder})}>{folders.map(f=><option key={f}>{f}</option>)}</select></Field>
      <Field label="Who can open it" hint="After LOI means an accepted offer or your grant."><select value={v.tier} onChange={e=>setV({...v,tier:e.target.value as Tier})}>{tiers.map(t=><option key={t}>{t}</option>)}</select></Field>
      <Field label="Note for buyers" hint="Optional."><input maxLength={400} value={v.note} onChange={e=>setV({...v,note:e.target.value})}/></Field>
    </div>
    <label className="dr-check"><input type="checkbox" checked={v.allowDownload} onChange={e=>setV({...v,allowDownload:e.target.checked})}/>Allow download (each copy is stamped with the buyer’s name)</label>
    <div className="dr-form-actions"><Button tone="primary" disabled={busy}>{existing?'Save':'Add to data room'}</Button><Button type="button" tone="quiet" onClick={onCancel}>Cancel</Button></div>
  </form>;
}
