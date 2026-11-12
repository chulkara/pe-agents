import {createContext,useContext,useEffect,useState,type FormEvent} from 'react';
import {Copy,ExternalLink,Eye,Plus,Check,X,Pencil,Users,FileText,ListChecks,Settings2,Link2,Loader2} from 'lucide-react';
import type {Company} from '../lib/domain';
import {hvacRequestTemplates,dataRoomSharing} from '../lib/engagement';
import {possessive,buyerStages,portalProgress,unread,type Contact,type DocRequest,type Portal,type BuyerStage,type NextStep} from '../lib/portal';
import {inviteLink,type PortalStore,type RequestInput} from '../lib/portalStore';
import SellerPortal,{usePortal,FileRow,Messages,fmtDate} from './SellerPortal';

export type PortalContext={store:PortalStore|null;helpDefault:Contact;canWrite:boolean;local:boolean};
const Ctx=createContext<PortalContext>({store:null,helpDefault:{name:'',email:''},canWrite:false,local:true});
export const PortalProvider=Ctx.Provider;
export const PortalContextRef=Ctx;
const v=(e:FormEvent<HTMLFormElement>)=>Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;

export default function OwnerPortalAdmin({company,sections,onChange}:{company:Company;sections?:string[];onChange?:()=>void}){
  const ctx=useContext(Ctx),store=ctx.store;
  const [portals,setPortals]=useState<Portal[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{if(!store)return;try{setPortals(await store.listForCompany(company.id));setError('');onChange?.();}catch(e){setError((e as Error).message);setPortals([]);}};
  useEffect(()=>{void load();},[store,company.id]);// eslint-disable-line react-hooks/exhaustive-deps
  if(!store)return null;
  const current=portals?.find(p=>p.status!=='Closed');
  if(portals===null)return <div className="portal-admin"><Loader2 className="spin"/></div>;
  if(!current&&sections)return sections.includes('Requests')?<section className="panel portal-admin"><h2>No owner portal yet</h2><p>The owner’s document requests are prepared with the engagement letter. Open the Owner tab and prepare the letter first.</p></section>:null;
  if(!current)return <section className="panel portal-admin portal-admin-create"><h2>Give {company.owner||'the owner'} one place for everything.</h2>
    <p>The owner sees this business, interested buyers, document requests, messages and next steps. They never see your workspace, notes or other companies. Each request explains what you need, why, who can open it and whom to ask.</p>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {ctx.canWrite?<form className="portal-form" onSubmit={e=>{e.preventDefault();const d=v(e);setBusy(true);setError('');void store.create({companyId:company.id,businessName:d.businessName,ownerName:d.ownerName,ownerEmail:d.ownerEmail,help:{name:d.helpName,email:d.helpEmail,phone:d.helpPhone},welcome:d.welcome}).then(load).catch(err=>setError(err.message)).finally(()=>setBusy(false));}}>
      <div className="portal-form-grid"><label className="field"><span>Business name as the owner knows it</span><input name="businessName" required minLength={2} defaultValue={company.name}/></label><label className="field"><span>Owner’s name</span><input name="ownerName" required minLength={2} defaultValue={company.owner}/></label><label className="field"><span>Owner’s email, the invitation only works for this address</span><input name="ownerEmail" type="email" required defaultValue={company.email}/></label></div>
      <div className="portal-form-grid"><label className="field"><span>Help contact name</span><input name="helpName" required minLength={2} defaultValue={ctx.helpDefault.name}/></label><label className="field"><span>Help contact email</span><input name="helpEmail" type="email" required defaultValue={ctx.helpDefault.email}/></label><label className="field"><span>Help contact phone, optional</span><input name="helpPhone" defaultValue={ctx.helpDefault.phone}/></label></div>
      <label className="field"><span>Welcome note, optional</span><textarea name="welcome" rows={3} maxLength={1200} placeholder="Thank you for taking the time to talk with us. This is where we’ll keep everything organized…"/></label>
      <button className="btn primary" disabled={busy}><Plus size={15}/>Create owner portal</button><small>Nothing is shared until you send the owner an invitation link.</small></form>
    :<p>Ask an analyst or administrator to create the owner portal.</p>}
    {portals.some(p=>p.status==='Closed')&&<p className="portal-muted">{portals.filter(p=>p.status==='Closed').length} closed portal(s) kept for your records.</p>}
  </section>;
  return <Manage key={current.id} store={store} portalId={current.id} ctx={ctx} reload={load} sections={sections} onChange={onChange}/>;
}

function Manage({store,portalId,ctx,reload,sections,onChange}:{store:PortalStore;portalId:string;ctx:PortalContext;reload:()=>Promise<void>;sections?:string[];onChange?:()=>void}){
  const {b,error:loadError,refresh}=usePortal(store,portalId);
  const [tab,setTab]=useState(sections?.[0]||'Requests'),[link,setLink]=useState(''),[copied,setCopied]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if(!b)return <div className="portal-admin">{loadError?<p className="error-banner">{loadError}</p>:<Loader2 className="spin"/>}</div>;
  const p=b.portal,prog=portalProgress(b),toReview=b.requests.filter(r=>r.status==='Submitted').length,newMsgs=unread(b),w=ctx.canWrite;
  async function act(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();await refresh();onChange?.();}catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}
  const tabs=([['Requests',FileText,toReview],['Buyers',Users,0],['Next steps',ListChecks,0],['Messages',Link2,newMsgs],['Settings',Settings2,0],['Owner’s view',Eye,0]] as [string,typeof FileText,number][]).filter(([t])=>!sections||sections.includes(t)),showHead=!sections||sections.some(t=>t!=='Requests');
  return <section className="panel portal-admin">
    {showHead&&<><header className="portal-admin-head"><div><h2>{p.businessName}</h2><p>For {p.ownerName}, {p.ownerEmail}, <span className={'portal-status '+p.status.toLowerCase()}>{p.status==='Active'?'Owner has joined':p.status==='Invited'?'Invitation sent '+fmtDate(p.invitedAt):p.status}</span></p></div>
      <div className="portal-admin-stats"><span><strong>{prog.done}/{prog.total}</strong>complete</span><span><strong>{toReview}</strong>to review</span><span><strong>{newMsgs}</strong>unread</span></div></header>
    {w&&p.status!=='Closed'&&<div className="portal-invite">
      {!link?<><p>{p.status==='Active'?'The owner has joined. A new link replaces the old one if they need it again.':'Create a private link and send it to '+p.ownerName+' yourself. Kalling does not email anyone. It works once, only for '+p.ownerEmail+', for 14 days.'}</p><button className="btn" disabled={busy} onClick={()=>void act(async()=>{setLink(inviteLink(await store.invite(p.id)));})}><Link2 size={15}/>{p.status==='Draft'?'Create invitation link':'Create a new link'}</button></>
      :<><label className="field"><span>Invitation link for {p.ownerEmail}</span><input readOnly value={link} onFocus={e=>e.currentTarget.select()}/></label><div className="button-row"><button className="btn primary" onClick={()=>void navigator.clipboard.writeText(link).then(()=>setCopied(true)).catch(()=>setError('Copy the link from the box above.'))}>{copied?<Check size={15}/>:<Copy size={15}/>}{copied?'Copied':'Copy link'}</button>{ctx.local&&<a className="btn" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Open as the owner</a>}</div>{ctx.local&&<small>In the local demo, the owner view opens in this browser and asks for the invited email instead of a password.</small>}</>}
    </div>}</>}
    {(error||loadError)&&<p className="error-banner" role="alert">{error||loadError}</p>}
    {tabs.length>1&&<nav className="portal-admin-tabs">{tabs.map(([t,Icon,n])=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}><Icon size={14}/>{t}{n?<em>{n}</em>:null}</button>)}</nav>}
    {tab==='Requests'&&<RequestsAdmin b={b} store={store} act={act} busy={busy} w={w}/>}
    {tab==='Buyers'&&<BuyersAdmin b={b} store={store} act={act} busy={busy} w={w}/>}
    {tab==='Next steps'&&<StepsAdmin steps={b.steps} save={s=>act(()=>store.saveSteps(p.id,s))} busy={busy} w={w} firm={p.firmName}/>}
    {tab==='Messages'&&<Messages b={b} store={store} readOnly={!w} refresh={async()=>{await store.seen(p.id).catch(()=>{});await refresh();}}/>}
    {tab==='Settings'&&<form className="portal-form" onSubmit={e=>{e.preventDefault();const d=v(e);if(d.ownerEmail.toLowerCase()!==p.ownerEmail&&!confirm('Changing the owner email removes access for '+p.ownerEmail+' and cancels their invitation. Continue?'))return;void act(()=>store.update(p.id,{businessName:d.businessName,ownerName:d.ownerName,ownerEmail:d.ownerEmail,help:{name:d.helpName,email:d.helpEmail,phone:d.helpPhone},welcome:d.welcome}));}}>
      <fieldset disabled={!w||busy}><div className="portal-form-grid"><label className="field"><span>Business name</span><input name="businessName" defaultValue={p.businessName}/></label><label className="field"><span>Owner’s name</span><input name="ownerName" defaultValue={p.ownerName}/></label><label className="field"><span>Owner’s email, changing it removes the current owner’s access</span><input name="ownerEmail" type="email" defaultValue={p.ownerEmail}/></label></div>
      <div className="portal-form-grid"><label className="field"><span>Help contact name</span><input name="helpName" defaultValue={p.help.name}/></label><label className="field"><span>Help contact email</span><input name="helpEmail" type="email" defaultValue={p.help.email}/></label><label className="field"><span>Help contact phone</span><input name="helpPhone" defaultValue={p.help.phone}/></label></div>
      <label className="field"><span>Welcome note</span><textarea name="welcome" rows={3} maxLength={1200} defaultValue={p.welcome}/></label>
      <div className="button-row"><button className="btn primary">Save settings</button><button type="button" className="btn" onClick={()=>{if(confirm('Close this portal? The owner loses access immediately. Records are kept.'))void act(async()=>{await store.update(p.id,{close:true});await reload();});}}><X size={15}/>Close portal</button></div></fieldset></form>}
    {tab==='Owner’s view'&&<div className="portal-preview-frame"><SellerPortal store={store} portalId={p.id} preview/></div>}
  </section>;
}

type ActFn=(fn:()=>Promise<unknown>)=>Promise<void>;
type Bundle=NonNullable<ReturnType<typeof usePortal>['b']>;
function RequestsAdmin({b,store,act,busy,w}:{b:Bundle;store:PortalStore;act:ActFn;busy:boolean;w:boolean}){
  const [editing,setEditing]=useState<DocRequest|'new'|null>(null),[template,setTemplate]=useState(-1),[notes,setNotes]=useState<Record<string,string>>({});
  const p=b.portal,sharing=dataRoomSharing;
  const templates=hvacRequestTemplates({today:new Date()}),t=template>=0?{...templates[template],needed:templates[template].guidance?templates[template].needed+' '+templates[template].guidance:templates[template].needed}:undefined,base=editing&&editing!=='new'?editing:undefined;
  return <div className="portal-admin-body">
    {w&&!editing&&<div className="button-row"><button className="btn primary" onClick={()=>{setTemplate(-1);setEditing('new');}}><Plus size={15}/>Request a document</button></div>}
    {editing&&<form key={(base?.id||'new')+template} className="portal-form portal-request-form" onSubmit={e=>{e.preventDefault();const d=v(e);const input:RequestInput={id:base?.id,title:d.title,needed:d.needed,why:d.why,sharing:d.sharing,contact:{name:d.contactName,email:d.contactEmail,phone:d.contactPhone},due:d.due};void act(async()=>{await store.saveRequest(p.id,input);setEditing(null);});}}>
      {!base&&<label className="field"><span>Start from a common request</span><select value={template} onChange={e=>setTemplate(Number(e.target.value))}><option value={-1}>Write my own</option>{(['First round','Second round'] as const).map(g=><optgroup key={g} label={g}>{templates.map((x,i)=>x.round===g?<option key={x.key} value={i}>{x.title}</option>:null)}</optgroup>)}</select></label>}
      <label className="field"><span>Title</span><input name="title" required minLength={3} maxLength={140} defaultValue={base?.title||t?.title}/></label>
      <label className="field"><span>What is needed, in plain words</span><textarea name="needed" rows={3} required minLength={10} maxLength={1500} defaultValue={base?.needed||t?.needed}/></label>
      <label className="field"><span>Why it is needed</span><textarea name="why" rows={2} required minLength={10} maxLength={1000} defaultValue={base?.why||t?.why}/></label>
      <label className="field"><span>Who can see it</span><textarea name="sharing" rows={2} required minLength={10} maxLength={600} defaultValue={base?.sharing||sharing}/><small>The portal also lists exactly who can open the files: the owner and current members of your firm.</small></label>
      <div className="portal-form-grid"><label className="field"><span>Contact for questions</span><input name="contactName" required defaultValue={base?.contact.name||p.help.name}/></label><label className="field"><span>Contact email</span><input name="contactEmail" type="email" required defaultValue={base?.contact.email||p.help.email}/></label><label className="field"><span>Contact phone, optional</span><input name="contactPhone" defaultValue={base?.contact.phone||p.help.phone}/></label><label className="field"><span>Requested by, optional</span><input name="due" type="date" defaultValue={base?.due}/></label></div>
      <div className="button-row"><button className="btn primary" disabled={busy}>{base?'Save changes':'Add request'}</button><button type="button" className="btn" onClick={()=>setEditing(null)}>Cancel</button></div></form>}
    {!b.requests.length&&!editing&&<p className="portal-empty">No requests yet. Start with the documents a buyer needs first.</p>}
    <div className="portal-admin-requests">{[...b.requests].sort((x,y)=>(x.status==='Submitted'?-1:0)-(y.status==='Submitted'?-1:0)).map(r=><article key={r.id} className={'portal-admin-request '+r.status.toLowerCase().replace(/ /g,'-')}>
      <header><div><strong>{r.title}</strong><small>{r.status}{r.due?', by '+fmtDate(r.due):''}, updated {fmtDate(r.updatedAt)}</small></div>{w&&<button className="icon-btn" aria-label={'Edit '+r.title} onClick={()=>{setTemplate(-1);setEditing(r);}}><Pencil size={14}/></button>}</header>
      {r.fileIds.length>0&&<ul className="portal-attached">{r.fileIds.map(id=>b.files.find(f=>f.id===id)).filter(Boolean).map(f=><li key={f!.id}><FileRow f={f!} store={store}/><small>{f!.side==='seller'?'from owner':'from your team'}</small></li>)}</ul>}
      {r.sellerNote&&<p className="portal-owner-note">Owner’s note: “{r.sellerNote}”</p>}
      {w&&['Submitted','In progress','Needs changes','Open'].includes(r.status)&&<div className="portal-review">
        <input aria-label={'Review note for '+r.title} placeholder={r.status==='Submitted'?'Optional thank-you, or what needs to change':'Note to the owner'} value={notes[r.id]||''} onChange={e=>setNotes(n=>({...n,[r.id]:e.target.value}))}/>
        <button className="btn primary" disabled={busy||r.status!=='Submitted'} onClick={()=>void act(()=>store.review(r.id,'Accepted',notes[r.id]||''))}><Check size={14}/>Accept</button>
        <button className="btn" disabled={busy||(notes[r.id]||'').trim().length<5} onClick={()=>void act(()=>store.review(r.id,'Needs changes',notes[r.id]||''))}>Ask for a change</button>
        <button className="text-link" disabled={busy} onClick={()=>void act(()=>store.review(r.id,'Not applicable',notes[r.id]||''))}>Not needed</button></div>}
      {w&&['Accepted','Not applicable'].includes(r.status)&&<button className="text-link" disabled={busy} onClick={()=>void act(()=>store.review(r.id,'Open',''))}>Reopen</button>}
    </article>)}</div>
  </div>;
}

function BuyersAdmin({b,store,act,busy,w}:{b:Bundle;store:PortalStore;act:ActFn;busy:boolean;w:boolean}){
  const [edit,setEdit]=useState<string|null>(null);
  const form=(x?:{id:string;name:string;summary:string;stage:BuyerStage})=><form key={x?.id||'new'} className="portal-form" onSubmit={e=>{e.preventDefault();const d=v(e);void act(async()=>{await store.saveBuyer(b.portal.id,{id:x?.id,name:d.name,summary:d.summary,stage:d.stage as BuyerStage});setEdit(null);});}}>
    <div className="portal-form-grid"><label className="field"><span>Buyer name</span><input name="name" required minLength={2} defaultValue={x?.name}/></label><label className="field"><span>Stage</span><select name="stage" defaultValue={x?.stage||'Introduced'}>{buyerStages.map(s=><option key={s}>{s}</option>)}</select></label></div>
    <label className="field"><span>What the owner should know, shown to the owner</span><textarea name="summary" rows={2} maxLength={800} defaultValue={x?.summary}/></label>
    <div className="button-row"><button className="btn primary" disabled={busy}>Save buyer</button><button type="button" className="btn" onClick={()=>setEdit(null)}>Cancel</button>{x&&<button type="button" className="text-link" onClick={()=>void act(async()=>{await store.removeBuyer(b.portal.id,x.id);setEdit(null);})}>Remove</button>}</div></form>;
  return <div className="portal-admin-body"><p className="portal-muted">Everything here is visible to the owner. List only buyers who agreed to be named.</p>
    {w&&edit!=='new'&&<button className="btn primary" onClick={()=>setEdit('new')}><Plus size={15}/>Add buyer</button>}{edit==='new'&&form()}
    {b.buyers.map(x=>edit===x.id?form(x):<div className="portal-admin-row" key={x.id}><span><strong>{x.name}</strong><small>{x.stage}, {x.summary}</small></span>{w&&<button className="icon-btn" aria-label={'Edit '+x.name} onClick={()=>setEdit(x.id)}><Pencil size={14}/></button>}</div>)}</div>;
}

function StepsAdmin({steps,save,busy,w,firm}:{steps:NextStep[];save:(s:{id?:string;text:string;owner:'You'|'Firm';due:string;done:boolean}[])=>Promise<void>;busy:boolean;w:boolean;firm:string}){
  const [rows,setRows]=useState(steps.map(s=>({...s})));useEffect(()=>setRows(steps.map(s=>({...s}))),[steps]);
  const set=(i:number,patch:Partial<NextStep>)=>setRows(r=>r.map((x,j)=>j===i?{...x,...patch}:x));
  return <div className="portal-admin-body"><p className="portal-muted">Shown to the owner in this order. “You” means the owner.</p>
    {rows.map((s,i)=><div className="portal-step-edit" key={s.id||i}><input type="checkbox" aria-label="Done" checked={s.done} disabled={!w} onChange={e=>set(i,{done:e.target.checked})}/><input aria-label="Step" value={s.text} disabled={!w} maxLength={300} onChange={e=>set(i,{text:e.target.value})}/><select aria-label="Who" value={s.owner} disabled={!w} onChange={e=>set(i,{owner:e.target.value as 'You'|'Firm'})}><option value="You">Owner</option><option value="Firm">{firm}</option></select><input aria-label="Due" type="date" value={s.due} disabled={!w} onChange={e=>set(i,{due:e.target.value})}/>{w&&<button className="icon-btn" aria-label="Remove step" onClick={()=>setRows(r=>r.filter((_,j)=>j!==i))}><X size={14}/></button>}</div>)}
    {w&&<div className="button-row"><button className="btn" disabled={rows.length>=12} onClick={()=>setRows(r=>[...r,{id:'',portalId:'',text:'',owner:'You',due:'',done:false}])}><Plus size={15}/>Add step</button><button className="btn primary" disabled={busy} onClick={()=>void save(rows.map(({id,text,owner,due,done})=>({id:id||undefined,text,owner,due,done})))}>Save next steps</button></div>}</div>;
}
