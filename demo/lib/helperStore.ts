// Storage for the seller's staff helpers. Rules live in helpers.ts. In the browser demo, helper
// files sit in the owner-portal byte store under their own id; the portal only lists them after
// the owner approves. Hosted, the files sit outside the portal file table until approval, so the
// brokerage's storage policy cannot reach them.
import * as H from './helpers.ts';
import {emptyPortalDb,sha256Hex,type Actor} from './portal.ts';
import {indexedBytes,LOCAL_PORTAL_KEY,type ByteStore} from './portalStore.ts';
import {downloadPrivateFile} from './privateStorage.ts';
import type {SupabaseClient} from '@supabase/supabase-js';

export type OwnerHelperView=ReturnType<typeof H.ownerHelpers>[number];
export type HelperHome=ReturnType<typeof H.helperHome>;
export interface HelperStore{
  mode:'local'|'cloud';
  list(portalId:string):Promise<OwnerHelperView[]>;
  add(portalId:string,input:{name:string;email:string;days?:number}):Promise<string>;
  assign(helperId:string,requestIds:string[]):Promise<void>;
  remove(helperId:string):Promise<void>;
  decide(uploadId:string,decision:'Approved'|'Declined',note?:string):Promise<void>;
  preview(uploadId:string):Promise<Blob>;
  home():Promise<HelperHome>;
  accept(token:string):Promise<void>;
  upload(helperId:string,requestId:string,file:File,note:string):Promise<void>;
  withdraw(uploadId:string):Promise<void>;
}

type KV={getItem(k:string):string|null;setItem(k:string,v:string):void};
export function localHelperStore(o:{owner?:Actor;helper?:H.HelperViewer;kv?:KV;bytes?:ByteStore}):HelperStore{
  const kv=o.kv||localStorage;let bytes=o.bytes;const files=()=>bytes||(bytes=indexedBytes());
  const read=():H.HelperDb=>{try{return {...emptyPortalDb(),...JSON.parse(kv.getItem(LOCAL_PORTAL_KEY)||'null')};}catch{return emptyPortalDb();}};
  const write=(d:H.HelperDb)=>kv.setItem(LOCAL_PORTAL_KEY,JSON.stringify(d));
  const owner=()=>{if(!o.owner)throw Error('Sign in as the business owner.');return o.owner;};
  const helper=()=>{if(!o.helper)throw Error('Sign in with the invited email address.');return o.helper;};
  return {
    mode:'local',
    async list(p){return H.ownerHelpers(read(),owner(),p);},
    async add(p,i){const out=H.addHelper(read(),owner(),p,i);write(out.db);return out.token;},
    async assign(h,ids){write(H.assignRequests(read(),owner(),h,ids));},
    async remove(h){write(H.removeHelper(read(),owner(),h));},
    async decide(u,d,n){write(H.decideUpload(read(),owner(),u,d,n));},
    async preview(u){const d=read(),up=d.helperUploads?.find(x=>x.id===u);if(!up||!H.ownerHelpers(d,owner(),up.portalId).length)throw Error('Only the business owner can open this file.');const b=await files().get(u);if(!b)throw Error('This demo file is stored in a different browser.');return b;},
    async home(){return H.helperHome(read(),helper());},
    async accept(t){write(H.acceptHelper(read(),helper(),t));},
    async upload(h,r,f,note){const sha=await sha256Hex(await f.arrayBuffer()),id=crypto.randomUUID();
      H.helperUpload(read(),helper(),h,r,{id,name:f.name,mime:f.type,size:f.size,sha256:sha,note}); // check first, then store bytes, then record
      await files().put(id,f);const out=H.helperUpload(read(),helper(),h,r,{id,name:f.name,mime:f.type,size:f.size,sha256:sha,note});write(out.db);},
    async withdraw(u){write(H.withdrawUpload(read(),helper(),u));},
  };
}

/** Hosted store. The helper-access migration enforces the same rules in the database and Storage. */
export function cloudHelperStore(client:SupabaseClient):HelperStore{
  async function call<T=unknown>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data as T;}
  return {
    mode:'cloud',
    async list(p){return call<OwnerHelperView[]>('kalling_helper_owner_list',{p_portal:p});},
    async add(p,i){return call<string>('kalling_helper_add',{p_portal:p,p_name:i.name,p_email:i.email,p_days:i.days??90});},
    async assign(h,ids){await call('kalling_helper_assign',{p_helper:h,p_requests:ids});},
    async remove(h){await call('kalling_helper_remove',{p_helper:h});},
    async decide(u,d,n){await call('kalling_helper_decide',{p_upload:u,p_decision:d,p_note:n||''});},
    async preview(u){const path=await call<string>('kalling_helper_upload_path',{p_upload:u});const {data,error}=await downloadPrivateFile(client,'kalling-portal',path);if(error||!data)throw Error('This file could not be opened.');return data;},
    async home(){return call<HelperHome>('kalling_helper_home');},
    async accept(t){await call('kalling_helper_accept',{p_token:t});},
    async upload(h,r,f,note){const sha=await sha256Hex(await f.arrayBuffer());
      const res=await call<{id:string;path:string}>('kalling_helper_reserve',{p_helper:h,p_request:r,p_name:f.name,p_mime:f.type,p_size:f.size,p_sha256:sha,p_note:note});
      const up=await client.storage.from('kalling-portal').upload(res.path,f,{contentType:f.type,upsert:false,cacheControl:'0'});
      if(up.error&&!/exists|duplicate/i.test(up.error.message))throw Error('The upload was interrupted. Try this file again. ('+up.error.message+')');
      await call('kalling_helper_finish',{p_upload:res.id});},
    async withdraw(u){await call('kalling_helper_withdraw',{p_upload:u});},
  };
}
