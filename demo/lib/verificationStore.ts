import type {SupabaseClient} from '@supabase/supabase-js';
import {emptyBrokerDb,type Viewer} from './brokerage.ts';
import {LOCAL_BROKER_KEY} from './brokerStore.ts';
import {indexedBytes,type ByteStore} from './portalStore.ts';
import * as V from './buyerVerification.ts';
export interface VerificationStore{
  mode:'local'|'cloud';policy(days?:number):Promise<number>;list(buyerId?:string):Promise<V.Verification[]>;save(input:V.ProofInput):Promise<V.Verification>;
  upload(id:string,file:File,onProgress?:(stage:string,fraction:number)=>void):Promise<void>;
  change(id:string,action:'Submit'|'Withdraw'|V.ReviewInput):Promise<void>;open(fileId:string):Promise<Blob>;
}
type KV={getItem(k:string):string|null;setItem(k:string,v:string):void};
export function localVerificationStore(viewer:Viewer,opts:{kv?:KV;bytes?:ByteStore}={}):VerificationStore{
  const kv=opts.kv||localStorage,bytes=()=>opts.bytes||indexedBytes();
  const read=():V.VerificationDb=>{try{return {...emptyBrokerDb(),...JSON.parse(kv.getItem(LOCAL_BROKER_KEY)||'{}')};}catch{return emptyBrokerDb();}};
  const write=(d:V.VerificationDb)=>kv.setItem(LOCAL_BROKER_KEY,JSON.stringify(d));
  const get=(id:string)=>{const d=read(),v=d.verifications?.find(x=>x.id===id);if(!v)throw Error('Submission not found.');V.verificationActor(d,viewer,v.buyerId);return {d,v};};
  return {mode:'local',
    async policy(days){const d=read();if(days!==undefined){if(viewer.kind!=='advisor'||!viewer.canWrite)throw Error('Only an authorized advisor can change the review policy.');if(!Number.isInteger(days)||days<1||days>365)throw Error('Choose 1 to 365 days.');write({...d,verificationDays:days});return days;}return d.verificationDays||90;},
    async list(buyerId){const d=read(),id=V.verificationActor(d,viewer,buyerId);return (d.verifications||[]).filter(v=>!id||v.buyerId===id).map(v=>V.verificationView(v,viewer)).sort((a,b)=>b.version-a.version);},
    async save(input){const out=V.saveProof(read(),viewer,input);write(out.db);return V.verificationView(out.submission,viewer);},
    async upload(id,file,progress){const proof=await V.inspectProof(file);let {d,v}=get(id);if(viewer.kind!=='buyer'||v.status!=='Draft')throw Error('Only the buyer can upload into the current draft.');
      if(V.currentVerification(d,v.buyerId)?.id!==id)throw Error('Open the current draft.');
      let f=v.files.find(f=>f.sha256===proof.sha256);if(f?.status==='stored'){progress?.('Already saved',1);return;}
      if(v.files.length>=3&&!f)throw Error('Use up to three documents per submission.');
      if(!f){f={id:crypto.randomUUID(),submissionId:id,name:file.name.slice(0,200),...proof,status:'reserved',createdAt:new Date().toISOString()};v={...v,files:[...v.files,f]};write({...d,verifications:d.verifications!.map(x=>x.id===id?v:x)});}
      progress?.('Saving private document',.2);await bytes().put('verification:'+f.id,file);
      ({d,v}=get(id));if(v.status!=='Draft'||V.currentVerification(d,v.buyerId)?.id!==id)throw Error('The draft changed. Open the current version.');
      write({...d,verifications:d.verifications!.map(x=>x.id===id?{...x,files:x.files.map(a=>a.id===f!.id?{...a,status:'stored'}:a)}:x)});progress?.('Saved, not submitted',1);
    },
    async change(id,action){write(V.changeProof(read(),viewer,id,action));},
    async open(fileId){let d=read();const v=d.verifications?.find(v=>v.files.some(f=>f.id===fileId));if(!v)throw Error('Document not found.');V.verificationActor(d,viewer,v.buyerId);
      write({...d,verificationEvents:[...(d.verificationEvents||[]),{id:crypto.randomUUID(),submissionId:v.id,fileId,actor:viewer.kind==='advisor'?viewer.name:viewer.kind==='buyer'?viewer.email:'',action:'Document opened',at:new Date().toISOString()}]});
      const b=await bytes().get('verification:'+fileId);d=read();V.verificationActor(d,viewer,v.buyerId);if(!b)throw Error('The contents are unavailable in this browser. Upload the document again.');return b;
    }
  };
}
export function cloudVerificationStore(client:SupabaseClient):VerificationStore{
  async function call<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await client.rpc(name,args);if(error)throw Error(/does not exist|schema cache|PGRST202/i.test(error.message)?'Buyer verification is not activated on this workspace. Contact Kalling.':error.message);return data as T;}
  return {mode:'cloud',
    policy:days=>call<number>('kalling_verification_policy',{p_days:days??null}),
    list:buyerId=>call('kalling_verification_list',{p_buyer:buyerId||null}),
    save:input=>call('kalling_verification_save',{p:input}),
    async upload(id,file,progress){const checked=await V.inspectProof(file);const r=await call<{id:string;path:string;stored:boolean}>('kalling_verification_reserve',{p_submission:id,p_name:file.name,p_mime:checked.mime,p_size:checked.size,p_sha:checked.sha256});
      if(r.stored){progress?.('Already saved',1);return;}progress?.('Uploading private document',.2);
      const {data:existing}=await client.storage.from('kalling-buyer-proof').info(r.path);
      if(!existing){const {error}=await client.storage.from('kalling-buyer-proof').upload(r.path,file,{contentType:checked.mime,upsert:false,cacheControl:'0'});if(error)throw Error('Upload did not finish. Try the same file again.');}
      progress?.('Validating file',.8);const {data,error}=await client.functions.invoke('kalling-verification-file',{body:{fileId:r.id}});
      if(error||!data?.ok)throw Error('Trusted file validation is unavailable or failed. Your upload is saved but cannot be submitted. Try again or contact Kalling.');progress?.('Saved, not submitted',1);
    },
    async change(id,action){await call('kalling_verification_change',{p_submission:id,p_action:typeof action==='string'?action:action.decision,p:typeof action==='string'?{}:action});},
    async open(fileId){const path=await call<string>('kalling_verification_open',{p_file:fileId});const {data,error}=await client.storage.from('kalling-buyer-proof').download(path);if(error||!data)throw Error('Document access is unavailable or has changed.');return data;}
  };
}
