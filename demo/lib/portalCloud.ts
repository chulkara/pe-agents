import type {SupabaseClient} from '@supabase/supabase-js';
import {sha256Hex,checkUpload,emptyPortalDb,type Portal,type PortalBundle,type PortalFile,type Side,type DocRequest,type Buyer,type NextStep,type Message} from './portal.ts';
import type {PortalStore,RequestInput,UploadResult,CreatePortalInput} from './portalStore.ts';
import type {Letter,OwnerReview} from './portal.ts';
import type {Extract} from './extract.ts';
type LetterRow={id:string;portal_id:string;version:number;template_version:string;input:Letter['input'];body:string;text_hash:string;status:Letter['status'];events:Letter['events'];owner_signature:Letter['ownerSignature']|null;firm_signature:Letter['firmSignature']|null;void_reason:string|null;created_at:string;updated_at:string};
const letter=(r:LetterRow):Letter=>({id:r.id,portalId:r.portal_id,version:r.version,templateVersion:r.template_version,input:r.input,text:r.body,textHash:r.text_hash,status:r.status,events:r.events||[],ownerSignature:r.owner_signature||undefined,firmSignature:r.firm_signature||undefined,voidReason:r.void_reason||undefined,createdAt:r.created_at,updatedAt:r.updated_at});

type PortalRow={id:string;firm_id:string;company_id:string;business_name:string;firm_name:string;owner_name:string;owner_email:string;help:Portal['help'];welcome:string;status:Portal['status'];created_at:string;invited_at:string|null;accepted_at:string|null;seller_seen_at:string|null;firm_seen_at:string|null;requests_hidden?:boolean};
const portal=(r:PortalRow):Portal=>({id:r.id,firmId:r.firm_id,companyId:r.company_id,businessName:r.business_name,firmName:r.firm_name,ownerName:r.owner_name,ownerEmail:r.owner_email,help:r.help,welcome:r.welcome,status:r.status,requestsHidden:!!r.requests_hidden,createdAt:r.created_at,invitedAt:r.invited_at||undefined,acceptedAt:r.accepted_at||undefined,sellerSeenAt:r.seller_seen_at||undefined,firmSeenAt:r.firm_seen_at||undefined});
type FileRow={id:string;portal_id:string;name:string;mime:string;size:number;sha256:string;status:'reserved'|'stored';uploader_name:string;side:Side;created_at:string;object_path?:string};
const file=(r:FileRow):PortalFile=>({id:r.id,portalId:r.portal_id,name:r.name,mime:r.mime,size:Number(r.size),sha256:r.sha256,status:r.status,uploadedBy:r.uploader_name,side:r.side,createdAt:r.created_at});

/** Signed-in store. Every permission is enforced by the database; the client only shapes data. */
export function cloudPortalStore(client:SupabaseClient,o:{side:Side;firmId?:string}):PortalStore{
  async function call<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data as T;}
  async function rows<T>(q:PromiseLike<{data:unknown;error:{message:string}|null}>):Promise<T[]>{const {data,error}=await q;if(error)throw Error(/does not exist|schema cache/i.test(error.message)?'The owner portal is not set up for this cloud project yet. An administrator must apply database migration 004.':error.message);return (data||[]) as T[];}
  const store:PortalStore={
    mode:'cloud',side:o.side,
    async listForCompany(companyId){return (await rows<PortalRow>(client.from('kalling_portals').select('*').eq('firm_id',o.firmId!).eq('company_id',companyId).order('created_at',{ascending:false}))).map(portal);},
    async firmPortals(){if(o.side!=='firm'||!o.firmId)return [];return (await rows<PortalRow>(client.from('kalling_portals').select('*').eq('firm_id',o.firmId).order('created_at',{ascending:false}))).map(portal);},
    async myPortals(){return (await rows<PortalRow>(client.from('kalling_portals').select('*').eq('status','Active').order('accepted_at',{ascending:false}))).map(portal);},
    async create(i:CreatePortalInput){return call<string>('kalling_portal_create',{p_firm:o.firmId,p_company:i.companyId,p_business:i.businessName,p_owner_name:i.ownerName,p_owner_email:i.ownerEmail,p_help:i.help,p_welcome:i.welcome||''});},
    async load(id){
      const [p]=await rows<PortalRow>(client.from('kalling_portals').select('*').eq('id',id));if(!p)throw Error('This portal is not available to this account.');
      const [buyers,steps,files,requests,messages,access]=await Promise.all([
        rows<{id:string;portal_id:string;name:string;summary:string;stage:Buyer['stage'];updated_at:string}>(client.from('kalling_portal_buyers').select('*').eq('portal_id',id).order('updated_at',{ascending:false})),
        rows<{id:string;portal_id:string;text:string;owner:'You'|'Firm';due:string;done:boolean}>(client.from('kalling_portal_steps').select('*').eq('portal_id',id).order('position')),
        rows<FileRow>(client.from('kalling_portal_files').select('id,portal_id,name,mime,size,sha256,status,uploader_name,side,created_at').eq('portal_id',id).eq('status','stored').order('created_at')),
        rows<{id:string;portal_id:string;title:string;needed:string;why:string;sharing:string;contact:DocRequest['contact'];due:string;status:DocRequest['status'];seller_note:string;review_note:string;file_ids:string[];created_at:string;updated_at:string;submitted_at:string|null}>(client.from('kalling_portal_requests').select('*').eq('portal_id',id).order('created_at')),
        rows<{id:string;portal_id:string;side:Side;author:string;body:string;created_at:string}>(client.from('kalling_portal_messages').select('id,portal_id,side,author,body,created_at').eq('portal_id',id).order('created_at').limit(500)),
        call<{team:string[];seller:string[]}>('kalling_portal_access',{p_portal:id}),
      ]);
      const optional=async<T>(q:PromiseLike<{data:unknown;error:unknown}>):Promise<T[]>=>{const r=await q;return r.error?[]:(r.data as T[])||[];};
      const [ansRows,revRows]=await Promise.all([optional<{portal_id:string;history:string;services:string;strengths:string;team:string;after_sale:string;updated_at:string}>(client.from('kalling_portal_answers').select('*').eq('portal_id',id)),optional<{id:string;portal_id:string;kind:'cim';version:number;title:string;sections:OwnerReview['sections'];status:OwnerReview['status'];comments:OwnerReview['comments'];created_at:string;decided_at:string|null}>(client.from('kalling_portal_reviews').select('*').eq('portal_id',id).order('version',{ascending:false}))]);
      const answers=ansRows[0]?{portalId:id,history:ansRows[0].history,services:ansRows[0].services,strengths:ansRows[0].strengths,team:ansRows[0].team,afterSale:ansRows[0].after_sale,updatedAt:ansRows[0].updated_at}:undefined;
      const reviews=revRows.map((r):OwnerReview=>({id:r.id,portalId:r.portal_id,kind:r.kind,version:r.version,title:r.title,sections:r.sections,status:r.status,comments:r.comments||[],createdAt:r.created_at,decidedAt:r.decided_at||undefined}));
      const letters=await client.from('kalling_portal_letters').select('*').eq('portal_id',id).order('version',{ascending:false}).then(r=>r.error?[]:(r.data as LetterRow[]).map(letter));
      return {answers,reviews,letters,portal:portal(p),side:o.side,canEdit:o.side==='seller'?p.status==='Active':true,access,
        buyers:buyers.map(b=>({id:b.id,portalId:b.portal_id,name:b.name,summary:b.summary,stage:b.stage,updatedAt:b.updated_at})),
        steps:steps.map((s):NextStep=>({id:s.id,portalId:s.portal_id,text:s.text,owner:s.owner,due:s.due,done:s.done})),
        files:files.map(file),
        requests:requests.map((r):DocRequest=>({id:r.id,portalId:r.portal_id,title:r.title,needed:r.needed,why:r.why,sharing:r.sharing,contact:r.contact,due:r.due,status:r.status,sellerNote:r.seller_note,reviewNote:r.review_note,fileIds:r.file_ids||[],createdAt:r.created_at,updatedAt:r.updated_at,submittedAt:r.submitted_at||undefined})),
        messages:messages.map((m):Message=>({id:m.id,portalId:m.portal_id,side:m.side,author:m.author,body:m.body,createdAt:m.created_at}))} satisfies PortalBundle;
    },
    async update(id,patch){await call('kalling_portal_update',{p_portal:id,p_patch:patch});},
    async invite(id){return call<string>('kalling_portal_invite',{p_portal:id});},
    async saveBuyer(portalId,b){await call('kalling_portal_save_buyer',{p_portal:portalId,p_buyer:b});},
    async removeBuyer(portalId,id){await call('kalling_portal_remove_buyer',{p_portal:portalId,p_buyer:id});},
    async saveSteps(portalId,steps){await call('kalling_portal_save_steps',{p_portal:portalId,p_steps:steps});},
    async saveRequest(portalId,r:RequestInput){await call('kalling_portal_save_request',{p_portal:portalId,p_request:r});},
    async review(id,status,note){await call('kalling_portal_review',{p_request:id,p_status:status,p_note:note});},
    async sellerNote(id,note){await call('kalling_portal_seller_note',{p_request:id,p_note:note});},
    async submit(id){await call('kalling_portal_submit',{p_request:id});},
    async upload(requestId,f,onProgress=()=>{}):Promise<UploadResult>{
      onProgress(0.05,'Checking the file');checkUpload(emptyPortalDb(),'',{name:f.name,mime:f.type,size:f.size});
      const sha=await sha256Hex(await f.arrayBuffer());
      const r=await call<{file:FileRow;duplicate:boolean;uploaded?:boolean}>('kalling_portal_reserve_file',{p_request:requestId,p_name:f.name,p_mime:f.type,p_size:f.size,p_sha256:sha});
      if(r.duplicate){onProgress(1,'Already provided');return {file:file(r.file),duplicate:true};}
      if(!r.uploaded){onProgress(0.2,'Uploading');const up=await client.storage.from('kalling-portal').upload(r.file.object_path!,f,{contentType:f.type,upsert:false});
        if(up.error&&!/exists|duplicate/i.test(up.error.message))throw Error('The upload was interrupted. Your other documents are saved; try this file again. ('+up.error.message+')');}
      onProgress(0.9,'Confirming');const stored=await call<FileRow>('kalling_portal_finish_file',{p_file:r.file.id});onProgress(1,'Saved');
      return {file:file(stored),duplicate:stored.id!==r.file.id};
    },
    async link(requestId,fileId){await call('kalling_portal_link',{p_request:requestId,p_file:fileId});},
    async unlink(requestId,fileId){await call('kalling_portal_unlink',{p_request:requestId,p_file:fileId});},
    async download(f){const path=await call<string>('kalling_portal_file_path',{p_file:f.id});const {data,error}=await client.storage.from('kalling-portal').download(path);if(error||!data)throw Error('Download failed: '+(error?.message||'no data'));return data;},
    async message(portalId,body){await call('kalling_portal_message',{p_portal:portalId,p_body:body});},
    async seen(portalId){await call('kalling_portal_seen',{p_portal:portalId});},
    async setRequestsHidden(portalId,hidden){await call('kalling_portal_set_gate',{p_portal:portalId,p_hidden:hidden});},
    async saveLetter(portalId,l){return call<string>('kalling_letter_save',{p_portal:portalId,p_letter:l});},
    async letterReady(id){await call('kalling_letter_ready',{p_letter:id});},
    async letterViewed(id){await call('kalling_letter_viewed',{p_letter:id});},
    async signLetter(id,n,ok){await call('kalling_letter_sign',{p_letter:id,p_name:n,p_agree:ok});},
    async countersignLetter(id,n,ok){await call('kalling_letter_countersign',{p_letter:id,p_name:n,p_agree:ok});},
    async voidLetter(id,reason){await call('kalling_letter_void',{p_letter:id,p_reason:reason});},
    async saveAnswers(portalId,a){await call('kalling_portal_save_answers',{p_portal:portalId,p:a});},
    async publishReview(portalId,r){return call<string>('kalling_portal_publish_review',{p_portal:portalId,p:r});},
    async decideReview(id,d,c){await call('kalling_portal_decide_review',{p_review:id,p_decision:d,p_comments:c});},
    async uploadFirmFile(portalId,f){const sha=await sha256Hex(await f.arrayBuffer());const r=await call<{file:FileRow;duplicate:boolean}>('kalling_portal_reserve_firm_file',{p_portal:portalId,p_name:f.name,p_mime:f.type,p_size:f.size,p_sha256:sha});
      if(r.duplicate)return file(r.file);const up=await client.storage.from('kalling-portal').upload(r.file.object_path!,f,{contentType:f.type,upsert:false});if(up.error&&!/exists|duplicate/i.test(up.error.message))throw Error('The upload was interrupted: '+up.error.message);
      return file(await call<FileRow>('kalling_portal_finish_file',{p_file:r.file.id}));},
    async saveExtract(_portalId,ex){await call('kalling_portal_save_text',{p_file:ex.fileId,p_extract:ex});},
    async extracts(portalId){const {data,error}=await client.from('kalling_portal_file_text').select('*').eq('portal_id',portalId);if(error)return [];return (data as {file_id:string;status:Extract['status'];pages:Extract['pages'];text_hash:string;extractor:string;note:string;extracted_at:string}[]).map(r=>({fileId:r.file_id,status:r.status,pages:r.pages,textHash:r.text_hash,extractor:r.extractor,note:r.note,extractedAt:r.extracted_at,chars:r.pages.reduce((n,p)=>n+p.text.length,0)}));},
  };
  return store;
}
export async function acceptPortalInvite(client:SupabaseClient,token:string){const {data,error}=await client.rpc('kalling_portal_accept',{p_token:token});if(error)throw Error(error.message);return data as string;}
