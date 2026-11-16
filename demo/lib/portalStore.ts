import {localExecutionStore,type ExecutionStore} from './executionStore.ts';
import {sharedOffers,ownerOfferAction,type SharedOffer,type OwnerOfferAction} from './offerVersions.ts';
import * as P from './portal.ts';
import {anonymousBuyerLabel,type BrokerDb} from './brokerage.ts';
import {currentVerification,verificationBadge} from './buyerVerification.ts';
import type {Extract} from './extract.ts';
import type {Actor,Contact,Portal,PortalBundle,PortalDb,PortalFile,BuyerStage,Side,Letter,OwnerAnswers} from './portal.ts';

export type CreatePortalInput={companyId:string;businessName:string;ownerName:string;ownerEmail:string;help:Contact;welcome?:string};
export type RequestInput={id?:string;title:string;needed:string;why:string;sharing:string;contact:Contact;due:string};
export type UploadResult={file:PortalFile;duplicate:boolean};
export interface PortalStore{
  execution:ExecutionStore;
  mode:'local'|'cloud';side:Side;
  sharedOffers(portalId:string):Promise<SharedOffer[]>;
  offerAction(portalId:string,id:string,version:number,kind:OwnerOfferAction['kind'],message:string):Promise<void>;
  listForCompany(companyId:string):Promise<Portal[]>;
  myPortals():Promise<Portal[]>;
  /** Every portal this firm runs, for the workspace's Today and Deals pages. */
  firmPortals():Promise<Portal[]>;
  create(input:CreatePortalInput):Promise<string>;
  load(id:string):Promise<PortalBundle>;
  update(id:string,patch:Partial<Pick<Portal,'ownerName'|'ownerEmail'|'help'|'welcome'|'businessName'>>&{close?:boolean}):Promise<void>;
  invite(id:string):Promise<string>;
  saveBuyer(portalId:string,b:{id?:string;name:string;summary:string;stage:BuyerStage}):Promise<void>;
  removeBuyer(portalId:string,id:string):Promise<void>;
  saveSteps(portalId:string,steps:{id?:string;text:string;owner:'You'|'Firm';due:string;done:boolean}[]):Promise<void>;
  saveRequest(portalId:string,r:RequestInput):Promise<void>;
  review(requestId:string,status:'Accepted'|'Needs changes'|'Not applicable'|'Open',note:string):Promise<void>;
  sellerNote(requestId:string,note:string):Promise<void>;
  submit(requestId:string):Promise<void>;
  upload(requestId:string,file:File,onProgress?:(fraction:number,stage:string)=>void):Promise<UploadResult>;
  link(requestId:string,fileId:string):Promise<void>;
  unlink(requestId:string,fileId:string):Promise<void>;
  download(file:PortalFile):Promise<Blob>;
  message(portalId:string,body:string):Promise<void>;
  seen(portalId:string):Promise<void>;
  // engagement letters
  setRequestsHidden(portalId:string,hidden:boolean):Promise<void>;
  saveLetter(portalId:string,l:LetterSave):Promise<string>;
  letterReady(id:string):Promise<void>;
  letterViewed(id:string):Promise<void>;
  signLetter(id:string,typedName:string,agreed:boolean):Promise<void>;
  countersignLetter(id:string,typedName:string,agreed:boolean):Promise<void>;
  voidLetter(id:string,reason:string):Promise<void>;
  // text read from documents (firm only)
  saveExtract(portalId:string,ex:Extract):Promise<void>;
  // owner answers, owner reviews and firm files
  saveAnswers(portalId:string,a:Partial<Omit<OwnerAnswers,'portalId'|'updatedAt'>>):Promise<void>;
  publishReview(portalId:string,r:{kind:'cim';version:number;title:string;sections:{key:string;title:string;text:string}[]}):Promise<string>;
  decideReview(id:string,decision:'Approved'|'Changes requested',comments:{section:string;text:string}[]):Promise<void>;
  uploadFirmFile(portalId:string,file:File):Promise<PortalFile>;
  extracts(portalId:string):Promise<Extract[]>;
}
export type LetterSave={id?:string;templateVersion:string;input:Letter['input'];text:string};
export function inviteLink(token:string,base=typeof location!=='undefined'?location.origin+location.pathname:''){return base+'#portal='+token;}
export function inviteTokenFromHash(hash:string){const m=hash.match(/(?:^#|&)portal=([0-9a-f]{64})\b/);return m?m[1]:'';}

// ── Local demo store: records in localStorage, file bytes in IndexedDB, all in this browser ──
export const LOCAL_PORTAL_KEY='kalling-portal-demo-v1';
export const LOCAL_EXTRACT_KEY='kalling-extract-demo-v1';
export type ByteStore={put(id:string,data:Blob):Promise<void>;get(id:string):Promise<Blob|undefined>};
export function memoryBytes():ByteStore{const m=new Map<string,Blob>();return {put:async(id,d)=>{m.set(id,d);},get:async id=>m.get(id)};}
export function indexedBytes(name='kalling-portal-files'):ByteStore{
  const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('This browser blocked local file storage.'));});
  const tx=async<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>)=>{const db=await open();return new Promise<T>((resolve,reject)=>{const t=db.transaction('files',mode),req=fn(t.objectStore('files'));t.oncomplete=()=>{resolve(req.result);db.close();};t.onerror=()=>{reject(t.error);db.close();};});};
  return {put:async(id,d)=>{await tx('readwrite',s=>s.put(d,id));},get:async id=>tx('readonly',s=>s.get(id)) as Promise<Blob|undefined>};
}
type KV={getItem(k:string):string|null;setItem(k:string,v:string):void};
export function localPortalStore(o:{actor:Actor;firmId:string;firmName:string;team:string[];kv?:KV;bytes?:ByteStore}):PortalStore&{acceptInvite(email:string,token:string):Promise<string>}{
  const kv=o.kv||localStorage,bytes=o.bytes||indexedBytes();
  const read=():PortalDb=>{try{const v=JSON.parse(kv.getItem(LOCAL_PORTAL_KEY)||'null');return v&&Array.isArray(v.portals)?{...P.emptyPortalDb(),...v}:P.emptyPortalDb();}catch{return P.emptyPortalDb();}};
  const write=(db:PortalDb)=>kv.setItem(LOCAL_PORTAL_KEY,JSON.stringify(db));
  const readExtracts=():Record<string,Record<string,Extract>>=>{try{return JSON.parse(kv.getItem(LOCAL_EXTRACT_KEY)||'{}')||{};}catch{return {};}};
  const apply=async(fn:(db:PortalDb)=>PortalDb)=>{write(fn(read()));};
  const a=o.actor;
  const store={
    async sharedOffers(id:string){const b=P.bundle(read(),a,id,o.team);let d:BrokerDb;try{d=JSON.parse(kv.getItem('kalling-broker-demo-v1')||'null');}catch{return [];}if(!d)return [];return d.listings.filter(l=>l.companyId===b.portal.companyId).flatMap(l=>sharedOffers(d,l.id));},
    async offerAction(portalId:string,id:string,version:number,kind:OwnerOfferAction['kind'],message:string){const b=P.bundle(read(),a,portalId,o.team);if(a.side!=='seller')throw Error('Only the owner can record an offer response.');const d=JSON.parse(kv.getItem('kalling-broker-demo-v1')||'null') as BrokerDb;const offer=d?.offers.find(o=>o.id===id),listing=d?.listings.find(l=>l.id===offer?.listingId);if(!listing||listing.companyId!==b.portal.companyId)throw Error('Offer access denied.');const next=ownerOfferAction(d,listing.id,id,version,kind,message);const portalDb=P.postMessage(read(),a,portalId,kind+' for offer version '+version+': '+message+' (Discussion only; not legal acceptance.)');kv.setItem('kalling-broker-demo-v1',JSON.stringify(next));write(portalDb);},
    mode:'local' as const,side:a.side,execution:localExecutionStore({viewer:a.side==='seller'?{kind:'seller',portalId:'',email:a.email}:{kind:'advisor',id:'local-advisor',name:a.name,role:a.canWrite===false?'viewer':'owner'},kv,portalBytes:bytes}),
    async listForCompany(companyId:string){return read().portals.filter(p=>p.companyId===companyId&&p.firmId===o.firmId).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));},
    async myPortals(){return read().portals.filter(p=>p.ownerEmail===a.email.toLowerCase()&&p.status==='Active');},
    async firmPortals(){if(a.side!=='firm')return [];return read().portals.filter(p=>p.firmId===o.firmId).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));},
    async create(input:CreatePortalInput){const out=P.createPortal(read(),a,{...input,firmId:o.firmId,firmName:o.firmName});write(out.db);return out.id;},
    async load(id:string){const bundle=P.bundle(read(),a,id,o.team);let market:BrokerDb|undefined;try{market=JSON.parse(kv.getItem('kalling-broker-demo-v1')||'null') as BrokerDb;}catch{/* no marketplace yet */}
      return {...bundle,buyers:bundle.buyers.map(b=>{const listing=market?.listings.find(l=>l.companyId===bundle.portal.companyId);const buyer=listing&&market?.buyers.find(x=>anonymousBuyerLabel(market!,x,listing.id)===b.name);return {...b,verification:buyer?verificationBadge(currentVerification(market!,buyer.id)):{status:'Not reviewed' as const}};})};},
    async update(id:string,patch:Parameters<PortalStore['update']>[1]){await apply(db=>P.updatePortal(db,a,id,patch));},
    async invite(id:string){const out=P.invite(read(),a,id);write(out.db);return out.token;},
    async saveBuyer(portalId:string,b:Parameters<PortalStore['saveBuyer']>[1]){await apply(db=>P.saveBuyer(db,a,portalId,b));},
    async removeBuyer(_p:string,id:string){await apply(db=>P.removeBuyer(db,a,id));},
    async saveSteps(portalId:string,steps:Parameters<PortalStore['saveSteps']>[1]){await apply(db=>P.saveSteps(db,a,portalId,steps));},
    async saveRequest(portalId:string,r:RequestInput){await apply(db=>P.saveRequest(db,a,portalId,r));},
    async review(id:string,status:Parameters<PortalStore['review']>[1],note:string){await apply(db=>P.reviewRequest(db,a,id,status,note));},
    async sellerNote(id:string,note:string){await apply(db=>P.saveSellerNote(db,a,id,note));},
    async submit(id:string){await apply(db=>P.submitRequest(db,a,id));},
    async upload(requestId:string,file:File,onProgress:(fraction:number,stage:string)=>void=()=>{}){
      onProgress(0.05,'Checking the file');const buf=await file.arrayBuffer();const sha256=await P.sha256Hex(buf);
      const db=read(),r=db.requests.find(x=>x.id===requestId);if(!r)throw Error('Request not found.');
      if(!P.findDuplicate(db,r.portalId,sha256))P.checkUpload(db,r.portalId,{name:file.name,mime:file.type,size:file.size});
      const id=crypto.randomUUID();onProgress(0.4,'Saving securely');
      if(!P.findDuplicate(db,r.portalId,sha256))await bytes.put(id,new Blob([buf],{type:file.type}));
      const out=P.addFile(read(),a,requestId,{id,name:file.name,mime:file.type,size:file.size,sha256});write(out.db);onProgress(1,out.duplicate?'Already provided':'Saved');return {file:out.file,duplicate:out.duplicate};
    },
    async link(requestId:string,fileId:string){await apply(db=>P.linkFile(db,a,requestId,fileId));},
    async unlink(requestId:string,fileId:string){await apply(db=>P.unlinkFile(db,a,requestId,fileId));},
    async download(f:PortalFile){const visible=P.bundle(read(),a,f.portalId,o.team);if(!visible.files.some(x=>x.id===f.id))throw Error('This document is not available in this portal.');const b=await bytes.get(f.id);if(!b)throw Error('This document’s contents are stored in a different browser.');return b;},
    async message(portalId:string,body:string){await apply(db=>P.postMessage(db,a,portalId,body));},
    async seen(portalId:string){await apply(db=>P.markSeen(db,a,portalId));},
    async setRequestsHidden(portalId:string,hidden:boolean){await apply(db=>P.setRequestsHidden(db,a,portalId,hidden));},
    async saveLetter(portalId:string,l:LetterSave){const textHash=await P.sha256Hex(new TextEncoder().encode(l.text).buffer as ArrayBuffer);const out=P.saveLetterDraft(read(),a,portalId,{...l,textHash});write(out.db);return out.id;},
    async letterReady(id:string){await apply(db=>P.letterReady(db,a,id));},
    async letterViewed(id:string){await apply(db=>P.letterViewed(db,a,id));},
    async signLetter(id:string,n:string,ok:boolean){await apply(db=>P.signLetter(db,a,id,n,ok));},
    async countersignLetter(id:string,n:string,ok:boolean){await apply(db=>P.countersignLetter(db,a,id,n,ok));},
    async voidLetter(id:string,reason:string){await apply(db=>P.voidLetter(db,a,id,reason));},
    async saveAnswers(portalId:string,ans:Parameters<PortalStore['saveAnswers']>[1]){await apply(db=>P.saveAnswers(db,a,portalId,ans));},
    async publishReview(portalId:string,r:Parameters<PortalStore['publishReview']>[1]){const out=P.publishReview(read(),a,portalId,r);write(out.db);return out.id;},
    async decideReview(id:string,d:'Approved'|'Changes requested',c:{section:string;text:string}[]){await apply(db=>P.decideReview(db,a,id,d,c));},
    async uploadFirmFile(portalId:string,file:File){const buf=await file.arrayBuffer(),sha256=await P.sha256Hex(buf),id=crypto.randomUUID();const db=read();if(!P.findDuplicate(db,portalId,sha256))await bytes.put(id,new Blob([buf],{type:file.type}));const out=P.addFirmFile(read(),a,portalId,{id,name:file.name,mime:file.type,size:file.size,sha256});write(out.db);return out.file;},
    async saveExtract(portalId:string,ex:Extract){if(a.side!=='firm'||a.canWrite===false)throw Error('Only the firm’s team can change this.');const all=readExtracts();all[portalId]={...(all[portalId]||{}),[ex.fileId]:ex};kv.setItem(LOCAL_EXTRACT_KEY,JSON.stringify(all));},
    async extracts(portalId:string){if(a.side!=='firm')return [];return Object.values(readExtracts()[portalId]||{});},
    async acceptInvite(email:string,token:string){const out=P.acceptInvite(read(),email,token);write(out.db);return out.id;},
  };
  return store;
}
