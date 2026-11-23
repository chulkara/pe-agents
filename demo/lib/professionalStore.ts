// Storage for party-appointed CPAs and attorneys. The rules live in professionals.ts; this file
// only reads and writes them. The one-browser demo keeps everything in the demo marketplace.
import * as P from './professionals.ts';
import {emptyBrokerDb} from './brokerage.ts';
import {emptyRoomDb} from './dataRoom.ts';
import {LOCAL_BROKER_KEY} from './brokerStore.ts';
import {indexedBytes,LOCAL_PORTAL_KEY,type ByteStore} from './portalStore.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import {downloadPrivateFile} from './privateStorage.ts';

export type PartyView=ReturnType<typeof P.partyProfessionals>[number];
export type ProHome=ReturnType<typeof P.professionalHome>;
export type ProOpened={blob:Blob;name:string;watermark:string};
export type PartyIdentity={kind:'seller';email:string;name:string}|{kind:'buyer';email:string};
export interface ProfessionalStore{
  mode:'local'|'cloud';
  // The seller or buyer side
  list():Promise<PartyView[]>;
  documents():Promise<P.PartyDoc[]>;
  add(input:{name:string;email:string;firm:string;role:P.ProRole;days?:number}):Promise<string>; // returns the invitation token
  remove(id:string):Promise<void>;
  grant(id:string,docs:{source:P.DocSource;id:string}[],confirmed:boolean):Promise<void>;
  revoke(grantId:string):Promise<void>;
  // The professional side
  home():Promise<ProHome>;
  accept(token:string):Promise<void>;
  acknowledge(id:string):Promise<void>;
  open(grantId:string):Promise<ProOpened>;
}

type KV={getItem(k:string):string|null;setItem(k:string,v:string):void};
export function localProfessionalStore(o:{party?:PartyIdentity;pro?:P.ProViewer;kv?:KV;portalBytes?:ByteStore;txBytes?:ByteStore}):ProfessionalStore{
  const kv=o.kv||localStorage;let pb=o.portalBytes,tb=o.txBytes;
  const read=():P.ProDb=>{try{const v=JSON.parse(kv.getItem(LOCAL_BROKER_KEY)||'null');if(v)return {...emptyBrokerDb(),...emptyRoomDb(),...v};}catch{/* reset */}return {...emptyBrokerDb(),...emptyRoomDb()};};
  const write=(d:P.ProDb)=>kv.setItem(LOCAL_BROKER_KEY,JSON.stringify(d));
  const party=():P.Party=>{const p=o.party;if(!p)throw Error('Sign in as the seller or buyer first.');if(p.kind==='buyer')return p;
    const portals=JSON.parse(kv.getItem(LOCAL_PORTAL_KEY)||'{"portals":[]}').portals as {id:string;ownerEmail:string;status:string}[];
    return {...p,portalIds:portals.filter(x=>x.ownerEmail.toLowerCase()===p.email.toLowerCase()&&x.status==='Active').map(x=>x.id)};};
  const pro=()=>{if(!o.pro)throw Error('Sign in as the invited professional.');return o.pro;};
  const apply=(fn:(d:P.ProDb)=>P.ProDb)=>{write(fn(read()));};
  return {
    mode:'local',
    async list(){return P.partyProfessionals(read(),party());},
    async documents(){return P.partyDocuments(read(),party());},
    async add(i){const out=P.addProfessional(read(),party(),i);write(out.db);return out.token;},
    async remove(id){apply(d=>P.removeProfessional(d,party(),id));},
    async grant(id,docs,c){apply(d=>P.grantDocuments(d,party(),id,docs,c));},
    async revoke(g){apply(d=>P.revokeGrant(d,party(),g));},
    async home(){return P.professionalHome(read(),pro());},
    async accept(t){apply(d=>P.acceptProfessional(d,pro(),t));},
    async acknowledge(id){apply(d=>P.acknowledge(d,pro(),id));},
    async open(grantId){
      const d=read(),out=P.openForProfessional(d,pro(),grantId);write(out.db);
      if(!out.allowed)throw Error('This document is no longer shared with you.');
      let blob:Blob|undefined,name='';
      if(out.source==='dataroom'){const i=d.roomItems?.find(x=>x.id===out.docId)!;name=i.displayName;blob=await (pb||(pb=indexedBytes())).get(i.fileId);}
      else{const f=d.executionFiles?.find(x=>x.id===out.docId)!;name=f.name;blob=await (f.portalFileId?(pb||(pb=indexedBytes())):(tb||(tb=indexedBytes('kalling-execution-files')))).get(f.portalFileId||f.id);}
      if(!blob)throw Error('This demo document’s contents are stored in a different browser.');
      return {blob,name,watermark:P.professionalWatermark(out.pro!)};
    },
  };
}

/** Hosted store. Row-level security and the RPCs in the professional-access migration enforce the same rules. */
export function cloudProfessionalStore(client:SupabaseClient,side:'seller'|'buyer'='buyer'):ProfessionalStore{
  async function call<T=unknown>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data as T;}
  return {
    mode:'cloud',
    async list(){return call<PartyView[]>('kalling_pro_party_list',{p_side:side});},
    async documents(){return call<P.PartyDoc[]>('kalling_pro_party_documents',{p_side:side});},
    async add(i){return call<string>('kalling_pro_add',{p_side:side,p_name:i.name,p_email:i.email,p_firm:i.firm,p_role:i.role,p_days:i.days??180});},
    async remove(id){await call('kalling_pro_remove',{p_id:id});},
    async grant(id,docs,c){await call('kalling_pro_grant',{p_id:id,p_docs:docs,p_confirmed:c});},
    async revoke(g){await call('kalling_pro_revoke',{p_grant:g});},
    async home(){return call<ProHome>('kalling_pro_home');},
    async accept(t){await call('kalling_pro_accept',{p_token:t});},
    async acknowledge(id){await call('kalling_pro_acknowledge',{p_id:id});},
    async open(grantId){
      const o=await call<{allowed:boolean;bucket:string;path:string;name:string;mime:string;watermark:string}>('kalling_pro_open',{p_grant:grantId});
      if(!o.allowed)throw Error('This document is no longer shared with you.');
      const {data,error}=await downloadPrivateFile(client,o.bucket,o.path);if(error||!data)throw Error('This document could not be loaded. Try again.');
      return {blob:new Blob([data],{type:o.mime||data.type}),name:o.name,watermark:o.watermark};
    },
  };
}
