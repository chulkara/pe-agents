// Someone on the seller's staff (an office manager, bookkeeper or controller) who gathers records
// for the owner. A helper sees only the document requests the owner assigns, by title and
// description, never buyers, offers, prices, messages or data-room activity. Their uploads wait
// for the owner: nothing a helper sends reaches the brokerage until the owner approves it.
import {addFile,checkUpload,type Actor,type PortalDb,type DocRequest} from './portal.ts';

export type Helper={id:string;portalId:string;name:string;email:string;status:'Invited'|'Active'|'Removed';requestIds:string[];createdAt:string;acceptedAt?:string;expiresAt:string};
export type HelperUploadStatus='Waiting for owner'|'Approved'|'Declined'|'Withdrawn';
export type HelperUpload={id:string;helperId:string;portalId:string;requestId:string;name:string;mime:string;size:number;sha256:string;note:string;status:HelperUploadStatus;createdAt:string;decidedAt?:string;ownerNote?:string;fileId?:string};
export type HelperData={helpers?:Helper[];helperUploads?:HelperUpload[];helperInvites?:{token:string;helperId:string;usedAt?:string}[]};
export type HelperDb=PortalDb&HelperData;
export type HelperViewer={email:string;confirmed:boolean};

export const MAX_HELPERS=4;
const DAY=864e5,uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
function need(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
const done=(r:DocRequest)=>['Accepted','Not applicable'].includes(r.status);

/** Only the portal's own owner, signed in, may manage helpers. */
function ownerPortal(db:HelperDb,a:Actor,portalId:string){
  const p=db.portals.find(x=>x.id===portalId);
  need(p&&a.side==='seller'&&p.status==='Active'&&a.email.toLowerCase()===p.ownerEmail.toLowerCase(),'Only the business owner can do this.');
  need(!p.requestsHidden,'Document requests open after the engagement letter is signed.');
  return p;
}
function ownHelper(db:HelperDb,a:Actor,id:string){const h=db.helpers?.find(x=>x.id===id);need(h&&h.status!=='Removed','This person is not on your list.');ownerPortal(db,a,h.portalId);return h;}
const liveHelper=(h:Helper|undefined,v:HelperViewer,at=Date.now())=>!!h&&v.confirmed&&h.email===v.email.toLowerCase()&&h.status==='Active'&&Date.parse(h.expiresAt)>at;

export function addHelper(db:HelperDb,a:Actor,portalId:string,input:{name:string;email:string;days?:number}){
  const p=ownerPortal(db,a,portalId),name=String(input.name??'').trim(),email=String(input.email??'').trim().toLowerCase();
  need(name.length>=2&&name.length<=120,'Enter their name.');need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter their email address.');
  need(email!==p.ownerEmail.toLowerCase(),'Use their own email address, not yours.');
  const current=(db.helpers||[]).filter(h=>h.portalId===portalId&&h.status!=='Removed');
  need(!current.some(h=>h.email===email),'This person is already on your list.');need(current.length<MAX_HELPERS,`You can add up to ${MAX_HELPERS} people.`);
  const days=input.days??90;need(days>=1&&days<=365,'Choose access of up to a year.');
  const h:Helper={id:uid(),portalId,name,email,status:'Invited',requestIds:[],createdAt:now(),expiresAt:new Date(Date.now()+days*DAY).toISOString()};
  const token=uid().replace(/-/g,'')+uid().replace(/-/g,'');
  return {db:{...db,helpers:[...(db.helpers||[]),h],helperInvites:[...(db.helperInvites||[]),{token,helperId:h.id}]},id:h.id,token};
}

/** The owner chooses exactly which requests this person works on. */
export function assignRequests(db:HelperDb,a:Actor,helperId:string,requestIds:string[]):HelperDb{
  const h=ownHelper(db,a,helperId),ids=[...new Set(requestIds)];
  for(const id of ids){const r=db.requests.find(x=>x.id===id);need(r&&r.portalId===h.portalId,'Choose requests from your own portal.');}
  return {...db,helpers:db.helpers!.map(x=>x.id===helperId?{...x,requestIds:ids}:x)};
}

export function removeHelper(db:HelperDb,a:Actor,helperId:string):HelperDb{
  ownHelper(db,a,helperId);const at=now();
  return {...db,helpers:db.helpers!.map(x=>x.id===helperId?{...x,status:'Removed',requestIds:[]}:x),
    helperUploads:(db.helperUploads||[]).map(u=>u.helperId===helperId&&u.status==='Waiting for owner'?{...u,status:'Withdrawn',decidedAt:at,ownerNote:'Removed by the owner.'}:u)};
}

export function acceptHelper(db:HelperDb,v:HelperViewer,token:string):HelperDb{
  need(v.confirmed,'Confirm your email address first.');
  const i=db.helperInvites?.find(x=>x.token===token),h=db.helpers?.find(x=>x.id===i?.helperId);
  need(i&&!i.usedAt&&h&&h.status==='Invited'&&Date.parse(h.expiresAt)>Date.now(),'This invitation has expired, was used, or was withdrawn.');
  need(h.email===v.email.toLowerCase(),'Sign in with the email address the invitation was sent to.');
  const at=now();return {...db,helpers:db.helpers!.map(x=>x.id===h.id?{...x,status:'Active',acceptedAt:at}:x),helperInvites:db.helperInvites!.map(x=>x===i?{...x,usedAt:at}:x)};
}

/** What the helper sees: titles and descriptions of assigned requests, and their own uploads. Nothing else. */
export function helperHome(db:HelperDb,v:HelperViewer){
  return (db.helpers||[]).filter(h=>h.email===v.email.toLowerCase()&&h.status==='Active').map(h=>{
    const p=db.portals.find(x=>x.id===h.portalId),ok=liveHelper(h,v)&&!!p&&p.status==='Active'&&!p.requestsHidden;
    return {helper:{id:h.id,name:h.name,expiresAt:h.expiresAt},ownerName:p?.ownerName||'',businessName:p?.businessName||'',expired:!ok,
      requests:ok?h.requestIds.map(id=>db.requests.find(r=>r.id===id)).filter((r):r is DocRequest=>!!r).map(r=>({id:r.id,title:r.title,needed:r.needed,due:r.due,complete:done(r),
        uploads:(db.helperUploads||[]).filter(u=>u.helperId===h.id&&u.requestId===r.id).map(u=>({id:u.id,name:u.name,status:u.status,createdAt:u.createdAt,ownerNote:u.ownerNote||''}))})):[]};
  });
}

export function helperUpload(db:HelperDb,v:HelperViewer,helperId:string,requestId:string,f:{id?:string;name:string;mime:string;size:number;sha256:string;note?:string}){
  const h=db.helpers?.find(x=>x.id===helperId);need(h&&liveHelper(h,v),'Your access has ended. Ask the owner to add you again.');
  const r=db.requests.find(x=>x.id===requestId),p=db.portals.find(x=>x.id===h.portalId);
  need(r&&h.requestIds.includes(requestId)&&p&&p.status==='Active'&&!p.requestsHidden,'This request is not assigned to you.');need(!done(r),'This request is already complete.');
  need(/^[0-9a-f]{64}$/.test(f.sha256),'File fingerprint missing.');checkUpload(db,h.portalId,f);
  const waiting=(db.helperUploads||[]).filter(u=>u.helperId===helperId&&u.status==='Waiting for owner');need(waiting.length<50,'The owner has 50 of your files to review. Wait for them to catch up.');
  need(!waiting.some(u=>u.requestId===requestId&&u.sha256===f.sha256),'You already sent this file for this request.');
  const u:HelperUpload={id:f.id||uid(),helperId,portalId:h.portalId,requestId,name:String(f.name).trim().slice(0,200),mime:f.mime||'application/octet-stream',size:f.size,sha256:f.sha256,note:String(f.note??'').trim().slice(0,600),status:'Waiting for owner',createdAt:now()};
  return {db:{...db,helperUploads:[...(db.helperUploads||[]),u]},id:u.id};
}

export function withdrawUpload(db:HelperDb,v:HelperViewer,uploadId:string):HelperDb{
  const u=db.helperUploads?.find(x=>x.id===uploadId),h=db.helpers?.find(x=>x.id===u?.helperId);
  need(u&&h&&h.email===v.email.toLowerCase()&&v.confirmed&&u.status==='Waiting for owner','You can only withdraw your own files that are still waiting.');
  return {...db,helperUploads:db.helperUploads!.map(x=>x.id===uploadId?{...x,status:'Withdrawn',decidedAt:now()}:x)};
}

/** The owner's decision. Approving attaches the file to the request as the owner's own upload. */
export function decideUpload(db:HelperDb,a:Actor,uploadId:string,decision:'Approved'|'Declined',note=''):HelperDb{
  const u=db.helperUploads?.find(x=>x.id===uploadId);need(u&&u.status==='Waiting for owner','This file is no longer waiting for you.');
  ownerPortal(db,a,u.portalId);const at=now();
  if(decision==='Declined')return {...db,helperUploads:db.helperUploads!.map(x=>x.id===uploadId?{...x,status:'Declined',decidedAt:at,ownerNote:String(note).trim().slice(0,600)}:x)};
  const h=db.helpers?.find(x=>x.id===u.helperId);
  const out=addFile(db,{...a,name:`${a.name} (gathered by ${h?.name||'a helper'})`},u.requestId,{id:u.id,name:u.name,mime:u.mime,size:u.size,sha256:u.sha256});
  return {...out.db,helperUploads:(out.db as HelperDb).helperUploads!.map(x=>x.id===uploadId?{...x,status:'Approved',decidedAt:at,ownerNote:String(note).trim().slice(0,600),fileId:out.file.id}:x)};
}

/** The owner's view: each helper, what they're assigned, what is waiting, and what happened. */
export function ownerHelpers(db:HelperDb,a:Actor,portalId:string){
  try{ownerPortal(db,a,portalId);}catch{return [];}
  return (db.helpers||[]).filter(h=>h.portalId===portalId&&h.status!=='Removed').map(h=>({
    helper:h,expired:Date.parse(h.expiresAt)<=Date.now(),
    token:h.status==='Invited'?db.helperInvites?.find(i=>i.helperId===h.id&&!i.usedAt)?.token:undefined,
    uploads:(db.helperUploads||[]).filter(u=>u.helperId===h.id).map(u=>({...u,requestTitle:db.requests.find(r=>r.id===u.requestId)?.title||'A request'})).reverse(),
  }));
}
