import type {BrokerDb,Viewer} from './brokerage.ts';

export const proofKinds=['Proof of funds','Lender pre-qualification'] as const;
export type ProofKind=typeof proofKinds[number];
export type VerificationState='Draft'|'Submitted'|'In review'|'Changes needed'|'Verified'|'Withdrawn'|'Revoked';
export type ProofFile={id:string;submissionId:string;name:string;mime:string;size:number;sha256:string;status:'reserved'|'stored';createdAt:string};
export type Verification={id:string;buyerId:string;version:number;status:VerificationState;kind:ProofKind;entity:string;documentDate:string;validUntil:string;explanation:string;buyerMessage:string;privateNote?:string;files:ProofFile[];createdAt:string;updatedAt:string;submittedAt?:string;review?:{by:string;at:string;until:string;fileIds:string[]}};
export type VerificationEvent={id:string;submissionId:string;actor:string;action:string;at:string;fileId?:string};
export type VerificationData={verifications?:Verification[];verificationEvents?:VerificationEvent[];verificationDays?:number};
export type VerificationDb=BrokerDb&VerificationData;
export type ProofInput={id?:string;kind:ProofKind;entity:string;documentDate:string;validUntil:string;explanation:string};
export type ReviewInput={decision:'In review'|'Changes needed'|'Verified'|'Revoked';message:string;privateNote:string;until:string;reviewed?:boolean;fileIds?:string[]};
export type VerificationBadge={status:'Verified'|'Not reviewed'|'Expired'|'Withdrawn'|'Revoked'|'Needs review';reviewedAt?:string;until?:string};
export const proofLimit=10*1024*1024;
function need(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const today=(at=Date.now())=>new Date(at).toISOString().slice(0,10);
export const reviewDefault=(at=Date.now(),days=90)=>new Date(at+days*864e5).toISOString().slice(0,10);
export const currentVerification=(db:VerificationData,buyerId:string)=>(db.verifications||[]).filter(v=>v.buyerId===buyerId).sort((a,b)=>b.version-a.version)[0];
export function verificationBadge(v:Verification|undefined,at=Date.now()):VerificationBadge{
  if(!v)return {status:'Not reviewed'};
  if(v.status==='Withdrawn'||v.status==='Revoked')return {status:v.status};
  if(v.status!=='Verified'||!v.review||!v.files.length||v.files.some(f=>f.status!=='stored'||!v.review!.fileIds.includes(f.id)))return {status:'Needs review'};
  const until=[v.review.until,v.validUntil].filter(Boolean).sort()[0];
  if(!date(until)||until<today(at))return {status:'Expired',reviewedAt:v.review.at,until};
  return {status:'Verified',reviewedAt:v.review.at,until};
}
export function verificationView(v:Verification,viewer:Viewer):Verification{const {privateNote,...rest}=v;return viewer.kind==='advisor'?structuredClone(v):structuredClone(rest);}
export function verificationActor(db:VerificationDb,viewer:Viewer,buyerId?:string,write=false){
  if(viewer.kind==='advisor'){need(viewer.canWrite,'Evidence review is available to authorized Kalling reviewers.');return buyerId;}
  const buyer=viewer.kind==='buyer'?db.buyers.find(b=>b.email.toLowerCase()===viewer.email.toLowerCase()):undefined;
  need(buyer&&(!buyerId||buyerId===buyer.id),'Verification access denied.');return buyer!.id;
}
function event(db:VerificationDb,viewer:Viewer,v:Verification,action:string,fileId?:string):VerificationDb{
  return {...db,verificationEvents:[...(db.verificationEvents||[]),{id:crypto.randomUUID(),submissionId:v.id,actor:viewer.kind==='advisor'?viewer.name:viewer.kind==='buyer'?viewer.email:'',action,at:new Date().toISOString(),...(fileId?{fileId}:{})}]};
}
export function saveProof(db:VerificationDb,viewer:Viewer,input:ProofInput):{db:VerificationDb;submission:Verification}{
  need(viewer.kind==='buyer','Only the buyer can prepare financing evidence.');const buyerId=verificationActor(db,viewer)!;
  need(proofKinds.includes(input.kind),'Choose the evidence type.');need(input.entity.trim().length>=2&&input.entity.trim().length<=160,'Name the person or entity on the document.');
  need(date(input.documentDate)&&input.documentDate<=today(),'Enter a valid document date, not in the future.');need(!input.validUntil||date(input.validUntil)&&input.validUntil>=input.documentDate,'Enter the validity date shown on the document.');
  const old=currentVerification(db,buyerId);need(!input.id||old?.id===input.id&&old.status==='Draft','This version is frozen. Prepare a replacement.');
  const at=new Date().toISOString(),v:Verification={id:input.id||crypto.randomUUID(),buyerId,version:input.id?old!.version:(old?.version||0)+1,status:'Draft',kind:input.kind,entity:input.entity.trim(),documentDate:input.documentDate,validUntil:input.validUntil,explanation:input.explanation.trim().slice(0,1000),buyerMessage:'',files:input.id?old!.files:[],createdAt:input.id?old!.createdAt:at,updatedAt:at};
  return {db:event({...db,verifications:[v,...(db.verifications||[]).filter(x=>x.id!==v.id)]},viewer,v,'Draft saved'),submission:v};
}
export function changeProof(db:VerificationDb,viewer:Viewer,id:string,action:'Submit'|'Withdraw'|ReviewInput):VerificationDb{
  const v=(db.verifications||[]).find(v=>v.id===id);need(v,'Submission not found.');verificationActor(db,viewer,v!.buyerId,true);
  need(currentVerification(db,v!.buyerId)?.id===id,'This is an older version. Open the current version.');const next=structuredClone(v!);next.updatedAt=new Date().toISOString();
  if(typeof action==='string'){
    need(viewer.kind==='buyer','Only the buyer can submit or withdraw evidence.');
    if(action==='Submit'){need(v!.status==='Draft','Prepare a replacement to change a frozen submission.');need(v!.files.length>0&&v!.files.every(f=>f.status==='stored'),'Wait for a validated document upload before submitting.');next.status='Submitted';next.submittedAt=next.updatedAt;}
    else {need(v!.status!=='Withdrawn','This submission was already withdrawn.');next.status='Withdrawn';}
  }else{
    need(viewer.kind==='advisor'&&viewer.canWrite,'Only an authorized advisor can review evidence.');
    need(['Submitted','In review','Changes needed','Verified'].includes(v!.status),'This submission is not available for review.');
    need(action.decision!=='Revoked'||v!.status==='Verified','Only an existing verification can be revoked.');
    need(!['Changes needed','Revoked'].includes(action.decision)||action.message.trim().length>=5,'Add a clear explanation for the buyer.');
    if(action.decision==='Verified'){
      need(action.reviewed===true&&JSON.stringify([...(action.fileIds||[])].sort())===JSON.stringify(v!.files.map(f=>f.id).sort()),'Confirm review of the exact submitted documents.');
      need(v!.files.length>0&&v!.files.every(f=>f.status==='stored'),'Review a validated evidence file first.');
      need(date(action.until)&&action.until>=today()&&action.until<=reviewDefault(Date.now(),db.verificationDays||90),'Choose a review-until date within the configured freshness policy.');
      need(!v!.validUntil||action.until<=v!.validUntil,'The review cannot outlast the document validity date.');
      next.review={by:viewer.name,at:next.updatedAt,until:action.until,fileIds:v!.files.map(f=>f.id)};
    }
    next.status=action.decision;next.buyerMessage=action.message.trim().slice(0,1000);next.privateNote=action.privateNote.trim().slice(0,1000);
  }
  return event({...db,verifications:db.verifications!.map(x=>x.id===id?next:x)},viewer,next,typeof action==='string'?action:action.decision);
}
/** Lightweight type validation shared with the trusted file-validation endpoint. No document text is extracted. */
export async function inspectProof(file:Blob&{name?:string}):Promise<{mime:string;sha256:string;size:number}>{
  need(file.size>0&&file.size<=proofLimit,'Use a non-empty PDF, PNG or JPEG up to 10 MB.');const bytes=new Uint8Array(await file.arrayBuffer());
  const pdf=bytes.length>=8&&new TextDecoder().decode(bytes.slice(0,8)).startsWith('%PDF-');
  const png=bytes.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)&&new TextDecoder().decode(bytes.slice(12,16))==='IHDR';
  const jpeg=bytes.length>=8&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
  const mime=pdf?'application/pdf':png?'image/png':jpeg?'image/jpeg':'';
  const ext=pdf?/\.pdf$/i:png?/\.png$/i:/\.jpe?g$/i;
  need(mime&&(!file.type||file.type===mime)&&(!file.name||ext.test(file.name)),'The file contents, type and extension must be a PDF, PNG or JPEG.');
  const hash=await crypto.subtle.digest('SHA-256',bytes);return {mime,size:bytes.length,sha256:Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')};
}
