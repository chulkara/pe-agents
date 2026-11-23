// A seller's or buyer's own CPA and attorney. The party, never the brokerage, decides which
// documents each professional may open. A professional only ever sees documents the party can
// open at that moment: if the party loses access (a replaced version, a revoked share, a
// restricted buyer), the professional loses it too, without anyone having to remember.
import {buyerItems,type FullDb,type RoomItem} from './dataRoom.ts';
import {fileAllowed,currentFile,type ExecutionActor,type ExecutionData,type ExecutionFile,type Transaction} from './transactions.ts';

export type ProRole='CPA'|'Attorney';
export const proRoles:ProRole[]=['CPA','Attorney'];
export type Party={kind:'seller';portalIds:string[];email:string;name:string}|{kind:'buyer';email:string};
export type Professional={id:string;side:'seller'|'buyer';partyKey:string;partyName:string;name:string;email:string;firm:string;role:ProRole;
  status:'Invited'|'Active'|'Removed';createdAt:string;acceptedAt?:string;expiresAt:string;acknowledgedAt?:string};
export type DocSource='dataroom'|'transaction';
export type ProGrant={id:string;professionalId:string;source:DocSource;docId:string;docName:string;grantedAt:string;grantedBy:string;revokedAt?:string};
export type ProView={id:string;professionalId:string;grantId:string;at:string;event:'opened'|'denied'};
export type ProfessionalData={professionals?:Professional[];proGrants?:ProGrant[];proViews?:ProView[];proInvites?:{token:string;professionalId:string;usedAt?:string}[]};
export type ProDb=FullDb&ExecutionData&ProfessionalData;
export type ProViewer={kind:'professional';email:string;confirmed:boolean};
export type PartyDoc={source:DocSource;id:string;name:string;group:string};

export const MAX_PROFESSIONALS=6;
const DAY=864e5;
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
function need(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
const text=(v:unknown,min:number,max:number,label:string)=>{const s=String(v??'').trim();need(s.length>=min&&s.length<=max,`Enter ${label}.`);return s;};
const emailOk=(e:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** The record key a party's professionals hang off: the buyer profile, or the seller's first portal. */
export function partyKey(db:ProDb,p:Party){
  if(p.kind==='buyer'){const b=db.buyers.find(b=>b.email===p.email.toLowerCase());need(b&&b.status!=='Restricted','Sign in with your buyer profile.');return {key:b.id,name:b.name,buyerId:b.id};}
  need(p.portalIds.length>0,'Open your owner portal first.');return {key:p.portalIds[0],name:p.name,buyerId:''};
}
const mine=(db:ProDb,p:Party,pro:Professional|undefined)=>{const k=partyKey(db,p);return !!pro&&pro.side===p.kind&&(p.kind==='seller'?p.portalIds.includes(pro.partyKey):pro.partyKey===k.key);};

function txActor(db:ProDb,p:Party):ExecutionActor{
  if(p.kind==='seller')return {kind:'seller',portalId:p.portalIds[0],portalIds:p.portalIds,email:p.email};
  return {kind:'buyer',id:partyKey(db,p).buyerId,email:p.email.toLowerCase()};
}

/** Every document this party can open right now, from the data room and the closing workspace. */
export function partyDocuments(db:ProDb,p:Party):PartyDoc[]{
  const out:PartyDoc[]=[],items=db.roomItems||[];
  if(p.kind==='seller'){
    for(const i of items.filter(i=>p.portalIds.includes(i.portalId)&&i.ownerStatus!=='Removed'))out.push({source:'dataroom',id:i.id,name:i.displayName,group:'Data room, '+i.folder});
  }else{
    const b=db.buyers.find(b=>b.email===p.email.toLowerCase());
    if(b&&b.status!=='Restricted')for(const a of db.access.filter(a=>a.buyerId===b.id&&a.status==='Approved')){
      const l=db.listings.find(l=>l.id===a.listingId),room=buyerItems(db,{kind:'buyer',email:p.email},a.listingId);
      for(const i of room.items.filter(i=>i.open))out.push({source:'dataroom',id:i.id,name:i.displayName,group:`${l?.number||'Listing'} data room, ${i.folder}`});
    }
  }
  let actor:ExecutionActor;try{actor=txActor(db,p);}catch{return out;}
  for(const t of db.transactions||[])for(const f of (db.executionFiles||[]).filter(f=>f.transactionId===t.id))
    if(currentFile(db,f.id)&&fileAllowed(db,t,f,actor))out.push({source:'transaction',id:f.id,name:f.name,group:'Closing documents'});
  return out;
}

export function addProfessional(db:ProDb,p:Party,input:{name:string;email:string;firm:string;role:ProRole;days?:number}){
  const k=partyKey(db,p),name=text(input.name,2,120,'their name'),firm=String(input.firm??'').trim().slice(0,160),email=String(input.email??'').trim().toLowerCase();
  need(emailOk(email),'Enter their email address.');need(proRoles.includes(input.role),'Choose CPA or attorney.');
  need(email!==p.email.toLowerCase(),'Invite your professional with their own email, not yours.');
  const current=(db.professionals||[]).filter(x=>x.side===p.kind&&x.partyKey===k.key&&x.status!=='Removed');
  need(!current.some(x=>x.email===email),'This person already has an invitation.');
  need(current.length<MAX_PROFESSIONALS,`You can add up to ${MAX_PROFESSIONALS} professionals.`);
  const days=input.days??180;need(days>=1&&days<=365,'Choose access of up to a year.');
  const pro:Professional={id:uid(),side:p.kind,partyKey:k.key,partyName:k.name,name,email,firm,role:input.role,status:'Invited',createdAt:now(),expiresAt:new Date(Date.now()+days*DAY).toISOString()};
  const token=uid().replace(/-/g,'')+uid().replace(/-/g,'');
  return {db:{...db,professionals:[...(db.professionals||[]),pro],proInvites:[...(db.proInvites||[]),{token,professionalId:pro.id}]},id:pro.id,token};
}

export function removeProfessional(db:ProDb,p:Party,id:string):ProDb{
  const pro=db.professionals?.find(x=>x.id===id);need(mine(db,p,pro),'This professional is not on your list.');const at=now();
  return {...db,professionals:db.professionals!.map(x=>x.id===id?{...x,status:'Removed'}:x),proGrants:(db.proGrants||[]).map(g=>g.professionalId===id&&!g.revokedAt?{...g,revokedAt:at}:g)};
}

/** The party shares documents it can open itself. Buyers confirm their NDA's representative clause. */
export function grantDocuments(db:ProDb,p:Party,professionalId:string,docs:{source:DocSource;id:string}[],confirmed:boolean):ProDb{
  const pro=db.professionals?.find(x=>x.id===professionalId);need(pro&&mine(db,p,pro)&&pro.status!=='Removed','This professional is not on your list.');
  need(Date.parse(pro.expiresAt)>Date.now(),'This professional’s access has expired. Add them again.');
  need(confirmed,p.kind==='buyer'?'Confirm that your professional is bound to keep this confidential. Your NDA makes you responsible for them.':'Confirm that you want to share these documents.');
  need(docs.length>0,'Choose at least one document.');
  const available=partyDocuments(db,p),active=(db.proGrants||[]).filter(g=>g.professionalId===professionalId&&!g.revokedAt),add:ProGrant[]=[];
  for(const d of docs){const doc=available.find(x=>x.source===d.source&&x.id===d.id);need(doc,'You can only share documents you can open yourself.');
    if(!active.some(g=>g.source===d.source&&g.docId===d.id))add.push({id:uid(),professionalId,source:d.source,docId:d.id,docName:doc.name,grantedAt:now(),grantedBy:p.email.toLowerCase()});}
  return {...db,proGrants:[...(db.proGrants||[]),...add]};
}

export function revokeGrant(db:ProDb,p:Party,grantId:string):ProDb{
  const g=db.proGrants?.find(x=>x.id===grantId);need(g&&mine(db,p,db.professionals?.find(x=>x.id===g.professionalId)),'This share is not yours to change.');
  return g.revokedAt?db:{...db,proGrants:db.proGrants!.map(x=>x.id===grantId?{...x,revokedAt:now()}:x)};
}

export function acceptProfessional(db:ProDb,v:ProViewer,token:string):ProDb{
  need(v.confirmed,'Confirm your email address first.');
  const i=db.proInvites?.find(x=>x.token===token),pro=db.professionals?.find(x=>x.id===i?.professionalId);
  need(i&&!i.usedAt&&pro&&pro.status==='Invited'&&Date.parse(pro.expiresAt)>Date.now(),'This invitation has expired, was used, or was withdrawn.');
  need(pro.email===v.email.toLowerCase(),'Sign in with the email address the invitation was sent to.');
  const at=now();
  return {...db,professionals:db.professionals!.map(x=>x.id===pro.id?{...x,status:'Active',acceptedAt:at}:x),proInvites:db.proInvites!.map(x=>x===i?{...x,usedAt:at}:x)};
}

export function acknowledge(db:ProDb,v:ProViewer,professionalId:string):ProDb{
  const pro=db.professionals?.find(x=>x.id===professionalId);need(pro&&pro.email===v.email.toLowerCase()&&pro.status==='Active'&&v.confirmed,'Sign in as the invited professional.');
  return {...db,professionals:db.professionals!.map(x=>x.id===pro.id?{...x,acknowledgedAt:now()}:x)};
}

/** The party a professional works for, rebuilt so access is checked as that party, now. */
function partyFor(db:ProDb,pro:Professional):Party|null{
  if(pro.side==='buyer'){const b=db.buyers.find(b=>b.id===pro.partyKey);return b?{kind:'buyer',email:b.email}:null;}
  return {kind:'seller',portalIds:[pro.partyKey],email:'',name:pro.partyName};
}
const live=(pro:Professional|undefined,v:ProViewer,at=Date.now())=>!!pro&&v.confirmed&&pro.email===v.email.toLowerCase()&&pro.status==='Active'&&Date.parse(pro.expiresAt)>at;

/** What a signed-in professional sees: one card per party they work for, with the documents still shared. */
export function professionalHome(db:ProDb,v:ProViewer){
  return (db.professionals||[]).filter(x=>x.email===v.email.toLowerCase()&&x.status!=='Removed').map(pro=>{
    const ok=live(pro,v),party=ok?partyFor(db,pro):null,docs=party?partyDocuments(db,party):[];
    const grants=(db.proGrants||[]).filter(g=>g.professionalId===pro.id&&!g.revokedAt);
    return {professional:pro,documents:ok&&pro.acknowledgedAt?grants.map(g=>({grantId:g.id,name:g.docName,source:g.source,grantedAt:g.grantedAt,available:docs.some(d=>d.source===g.source&&d.id===g.docId)})):[]};
  });
}

/** Opening is logged first, allowed or denied; the bytes are fetched only for an allowed open. */
export function openForProfessional(db:ProDb,v:ProViewer,grantId:string):{db:ProDb;allowed:boolean;source?:DocSource;docId?:string;pro?:Professional}{
  const g=db.proGrants?.find(x=>x.id===grantId),pro=db.professionals?.find(x=>x.id===g?.professionalId);
  const party=pro&&live(pro,v)&&pro.acknowledgedAt&&!g!.revokedAt?partyFor(db,pro):null;
  const allowed=!!party&&partyDocuments(db,party).some(d=>d.source===g!.source&&d.id===g!.docId);
  const next=g&&pro&&pro.email===v.email.toLowerCase()?{...db,proViews:[...(db.proViews||[]),{id:uid(),professionalId:pro.id,grantId:g.id,at:now(),event:allowed?'opened' as const:'denied' as const}]}:db;
  return allowed?{db:next,allowed,source:g!.source,docId:g!.docId,pro}:{db:next,allowed:false};
}

/** The party's view: each professional, what is shared, and every time they opened something. */
export function partyProfessionals(db:ProDb,p:Party){
  let k:string;try{k=partyKey(db,p).key;}catch{return [];}
  return (db.professionals||[]).filter(x=>x.side===p.kind&&(p.kind==='seller'?p.portalIds.includes(x.partyKey):x.partyKey===k)&&x.status!=='Removed').map(pro=>({
    professional:pro,expired:Date.parse(pro.expiresAt)<=Date.now(),
    token:pro.status==='Invited'?db.proInvites?.find(i=>i.professionalId===pro.id&&!i.usedAt)?.token:undefined,
    grants:(db.proGrants||[]).filter(g=>g.professionalId===pro.id&&!g.revokedAt),
    views:(db.proViews||[]).filter(x=>x.professionalId===pro.id).map(x=>({at:x.at,event:x.event,document:db.proGrants?.find(g=>g.id===x.grantId)?.docName||'A document'})).reverse(),
  }));
}

export const professionalWatermark=(pro:Pick<Professional,'name'|'email'|'role'|'partyName'>,at=new Date())=>`${pro.name}, ${pro.email}, ${pro.role} for ${pro.partyName}, ${at.toISOString().slice(0,10)}. Confidential, Kalling`;
export type {RoomItem,ExecutionFile,Transaction};
