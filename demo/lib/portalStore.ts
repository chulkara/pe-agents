import * as P from './portal.ts';
import type {Actor,Contact,Portal,PortalBundle,PortalDb,PortalFile,BuyerStage,Side} from './portal.ts';

export type CreatePortalInput={companyId:string;businessName:string;ownerName:string;ownerEmail:string;help:Contact;welcome?:string};
export type RequestInput={id?:string;title:string;needed:string;why:string;sharing:string;contact:Contact;due:string};
export type UploadResult={file:PortalFile;duplicate:boolean};
export interface PortalStore{
  mode:'local'|'cloud';side:Side;
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
}
export function inviteLink(token:string,base=typeof location!=='undefined'?location.origin+location.pathname:''){return base+'#portal='+token;}
export function inviteTokenFromHash(hash:string){const m=hash.match(/(?:^#|&)portal=([0-9a-f]{64})\b/);return m?m[1]:'';}

// ── Local demo store: records in localStorage, file bytes in IndexedDB, all in this browser ──
export const LOCAL_PORTAL_KEY='kalling-portal-demo-v1';
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
  const apply=async(fn:(db:PortalDb)=>PortalDb)=>{write(fn(read()));};
  const a=o.actor;
  const store={
    mode:'local' as const,side:a.side,
    async listForCompany(companyId:string){return read().portals.filter(p=>p.companyId===companyId&&p.firmId===o.firmId).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));},
    async myPortals(){return read().portals.filter(p=>p.ownerEmail===a.email.toLowerCase()&&p.status==='Active');},
    async firmPortals(){if(a.side!=='firm')return [];return read().portals.filter(p=>p.firmId===o.firmId).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));},
    async create(input:CreatePortalInput){const out=P.createPortal(read(),a,{...input,firmId:o.firmId,firmName:o.firmName});write(out.db);return out.id;},
    async load(id:string){return P.bundle(read(),a,id,o.team);},
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
    async download(f:PortalFile){P.bundle(read(),a,f.portalId,o.team);const b=await bytes.get(f.id);if(!b)throw Error('This document’s contents are stored in a different browser.');return b;},
    async message(portalId:string,body:string){await apply(db=>P.postMessage(db,a,portalId,body));},
    async seen(portalId:string){await apply(db=>P.markSeen(db,a,portalId));},
    async acceptInvite(email:string,token:string){const out=P.acceptInvite(read(),email,token);write(out.db);return out.id;},
  };
  return store;
}
