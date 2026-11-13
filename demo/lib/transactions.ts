// Brokerage execution is separate from the historical buy-side ExecutionPlan. One transaction,
// exact offer version and canonical set of shared items; participant views are projections.
import type {BrokerDb, Offer, Viewer} from './brokerage.ts';
import {anonymousBuyerLabel} from './brokerage.ts';
import {versionOf, type OfferTerms} from './offerVersions.ts';
export const txId=()=>crypto.randomUUID();
export function requireTx(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
export const dateOnly=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export function safeText(s:unknown,min=0,max=2000){const t=String(s??'').trim();requireTx(t.length>=min&&t.length<=max,'Enter a complete response within the stated length.');requireTx(!/\b(?:social security|routing number|bank account number|wire instructions|credit authorization)\b|\b\d{3}-\d{2}-\d{4}\b/i.test(t),'Keep sensitive banking and personal application details outside Kalling.');return t;}
export function cents(s:string):number{requireTx(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(s),'Enter nonnegative US dollars with at most two decimal places.');const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));requireTx(Number.isSafeInteger(n),'The amount is too large.');return n;}
export function wholeDollarsToCents(n:number){requireTx(Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(n*100),'The source offer must use safe whole US dollars.');return n*100;}
export const dollars=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export type ExecutionActor={kind:'advisor';id:string;name:string;role:'owner'|'admin'|'analyst'|'viewer'}|{kind:'buyer';id:string;email:string}|{kind:'seller';portalId:string;portalIds?:string[];email:string}|{kind:'guest';id:string;email:string;confirmed:boolean}|{kind:'public'};
export type ExecutionSource={fileId:string;page:number;excerpt:string};
export type Evidence={source:ExecutionSource;reviewer:string;at:string;note:string};
export type Deadline={kind:'Unknown';reason:string}|{kind:'Date';date:string;timezone:'America/New_York'}|{kind:'Time';instant:string;timezone:'America/New_York'}|{kind:'Relative';anchor:string;days:number;calendar:'Calendar days'|'Business days';includeAnchor:boolean;holidays:string[];confirmedDate:string;confirmedBy:string};
export type Obligation={id:string;title:string;source:ExecutionSource;deadline:Deadline;version:number;loiVersion:number;confirmedBy:string;at:string;supersedes?:string};
export type LoiVersion={version:number;fileId:string;offerVersion:number;sellerEntity:string;buyerEntity:string;structure:string;executionDate:string;signatories:{side:'seller'|'buyer';name:string;role:string;source:ExecutionSource}[];createdAt:string;createdBy:string;review?:Evidence};
export type Participant={id:string;email:string;name:string;role:'Lawyer'|'CPA'|'Lender'|'Other specialist';purpose:string;coordinator:string;status:'Pending'|'Active'|'Revoked';expiresAt:string;acceptedAt?:string;identityAllowed:boolean};
export type TxEvent={id:string;action:string;by:string;at:string;note:string};
export type FileKind='LOI'|'Diligence'|'Closing evidence'|'Lease'|'License'|'Other';
export type ExecutionFile={id:string;transactionId:string;family:string;version:number;name:string;sha256:string;size:number;mime:string;status:'Reserved'|'Stored';kind:FileKind;content:'Confidential'|'Named counterparties'|'Restricted lender';uploadedBy:string;createdAt:string;portalFileId?:string;grants:string[];review?:{by:string;at:string;note:string};path?:string};
export type ExecutionRead={id:string;transactionId:string;fileId:string;actor:string;event:'opened'|'denied';at:string;ticket?:string;permissionStamp?:string};
export type DiligenceStatus='Open'|'In progress'|'Waiting'|'Submitted'|'Changes needed'|'Resolved'|'Not applicable';
export type DiligenceItem={current?:boolean;id:string;title:string;category:string;why:string;nextAction:string;owner:string;requestor:string;reviewer:string;contributors:string[];due:Deadline;audience:string[];priority:'Normal'|'High';blocking:boolean;authority:'Internal'|'Contract'|'Lender'|'Regulator';status:DiligenceStatus;revision:number;dependsOn:string[];sources:ExecutionSource[];origin?:string;response?:string;review?:{revision:number;by:string;at:string;note:string;decision:'Resolved'|'Changes needed'|'Not applicable';externalAuthority?:string};thread:{id:string;by:string;body:string;at:string}[];history:TxEvent[]};
export type ConditionKind='Financing'|'Escrow'|'License'|'Premises'|'Purchase agreement'|'Other closing';
export type ClosingCondition={current?:boolean;id:string;kind:ConditionKind;title:string;owner:string;nextAction:string;due:Deadline;audience:string[];dependsOn:string[];revision:number;required:boolean;stage:string;details:Record<string,string>;sources:ExecutionSource[];review?:{revision:number;by:string;at:string;professional:string;note:string};history:TxEvent[]};
export type ClosingAmounts={currency:'USD';basis:'Asset consideration'|'Equity consideration';cash:number;sellerNote:number;otherFixed:number;fixed:number;earnoutMax:number;earnoutRealized:number;workingCapital:number;inventory:number;realEstate:number;buyerDebt:number;basisNote:string};
export type CloseRecord={id:string;version:number;date:string;amounts:ClosingAmounts;evidence:ExecutionSource[];by:string;at:string;note:string;packageRevision:number;loiVersion:number;handover:{guestIds:string[];buyerFiles:string[];sellerFiles:string[]};correctionReason?:string};
export type CaseVersion={version:number;title:string;body:string;fields:string[];channels:('Website'|'Email')[];rights:string;status:'Draft'|'Changes requested'|'Declined'|'Approved'|'Published'|'Withdrawn';createdAt:string;createdBy:string;decision?:{by:string;at:string;note:string};publishedAt?:string;delivery?:{recipient:string;version:number;approvedBy:string;status:'Simulated'|'Cancelled'}};
export type ComparableRevision={version:number;closeVersion:number;state:string;businessType:string;period:string;basis:'Cash'|'Accrual';metric:'SDE'|'EBITDA';earnings:number;revenue:number;recastVersion:number;sources:ExecutionSource[];authority:{note:string;professional:string;scope:'Internal deidentified analysis';at:string};reviewer:string;at:string;disputed:boolean;note:string};
export type Transaction={id:string;fictional:boolean;firmId:string;listingId:string;companyId:string;portalId:string;buyerId:string;buyerLabel:string;offerId:string;offerVersion:number;terms:OfferTerms;state:'Planning'|'LOI reviewed'|'Abandoned'|'Closed';revision:number;createdAt:string;createdBy:string;lois:LoiVersion[];obligations:Obligation[];participants:Participant[];identity:{seller?:Evidence;buyer?:Evidence};items:DiligenceItem[];conditions:ClosingCondition[];planningClose?:string;closePackage?:{revision:number;loiVersion:number;by:string;at:string;note:string};closes:CloseRecord[];cases:CaseVersion[];comparables:ComparableRevision[];originalEstimate:{version:string;low:number|null;mid:number|null;high:number|null;asOf:string;source:string}|null;history:TxEvent[];stopReason?:string};
export type ExecutionData={transactions?:Transaction[];executionFiles?:ExecutionFile[];executionReads?:ExecutionRead[];executionInvites?:{participantId:string;transactionId:string;token:string;usedAt?:string}[]};
export type TxDb=BrokerDb&ExecutionData;
export const actorKey=(a:ExecutionActor)=>a.kind==='advisor'?a.id:a.kind==='buyer'?'buyer':a.kind==='seller'?'seller':a.kind==='guest'?a.id:'public';
export const actorName=(a:ExecutionActor)=>a.kind==='advisor'?a.name:a.kind==='buyer'?'Selected buyer':a.kind==='seller'?'Seller':a.kind==='guest'?'Specialist':'Public';
export const txWriter=(a:ExecutionActor)=>a.kind==='advisor'&&a.role!=='viewer';
export const txAdmin=(a:ExecutionActor)=>a.kind==='advisor'&&['owner','admin'].includes(a.role);
export function actorForViewer(v:Viewer,d:BrokerDb):ExecutionActor{return v.kind==='advisor'?{kind:'advisor',id:'local-advisor',name:v.name,role:v.canWrite?'owner':'viewer'}:v.kind==='buyer'?{kind:'buyer',id:d.buyers.find(b=>b.email===v.email)?.id||'',email:v.email}:{kind:'public'};}
export function canReadTransaction(d:TxDb,t:Transaction,a:ExecutionActor,at=Date.now()){
 if(a.kind==='advisor')return true;
 if(a.kind==='seller')return a.portalId===t.portalId||!!a.portalIds?.includes(t.portalId);
 if(a.kind==='buyer')return a.id===t.buyerId&&d.buyers.some(b=>b.id===a.id&&b.email===a.email&&b.status!=='Restricted')&&d.access.some(x=>x.buyerId===a.id&&x.listingId===t.listingId&&x.status==='Approved')&&t.state!=='Abandoned';
 return a.kind==='guest'&&a.confirmed&&t.state!=='Abandoned'&&t.participants.some(p=>p.id===a.id&&p.email===a.email&&p.status==='Active'&&Date.parse(p.expiresAt)>at);
}
export function currentFile(d:TxDb,id:string){const f=d.executionFiles?.find(x=>x.id===id);return f?.status==='Stored'&&!d.executionFiles?.some(x=>x.transactionId===f.transactionId&&x.family===f.family&&x.version>f.version&&x.status==='Stored')?f:undefined;}
export function sourceCurrent(d:TxDb,t:Transaction,s:ExecutionSource){try{safeText(s.excerpt,5,5000);}catch{return false;}const f=currentFile(d,s.fileId);return !!f&&f.transactionId===t.id&&Number.isInteger(s.page)&&s.page>0&&s.page<=5000&&s.excerpt.trim().length>=5;}
export function reviewSources(d:TxDb,t:Transaction,s:ExecutionSource[]){requireTx(s.length>0&&s.every(x=>sourceCurrent(d,t,x)),'Use exact current document versions, page numbers and excerpts.');}
export function sourceKey(s:ExecutionSource){return s.fileId+':'+s.page+':'+s.excerpt;}
export function fileAllowed(d:TxDb,t:Transaction,f:ExecutionFile,a:ExecutionActor,at=Date.now()){
 if(!canReadTransaction(d,t,a,at)||f.status!=='Stored')return false;
 if(a.kind==='advisor')return true;
 if(!currentFile(d,f.id))return false;
 if(t.state!=='Closed'&&f.uploadedBy===actorKey(a))return true;
 const key=actorKey(a);if(!f.review||!f.grants.includes(key)||f.content==='Restricted lender'&&a.kind!=='buyer'&&a.kind!=='guest')return false;
 if(f.content==='Named counterparties'&&(!t.identity.seller||!t.identity.buyer||a.kind==='guest'&&!t.participants.find(p=>p.id===a.id)?.identityAllowed))return false;
 if(t.state==='Closed'){const h=t.closes.at(-1)?.handover;return !!h&&(a.kind==='buyer'?h.buyerFiles.includes(f.id):a.kind==='seller'?h.sellerFiles.includes(f.id):h.guestIds.includes(key));}
 return true;
}
export function requireWrite(d:TxDb,t:Transaction,a:ExecutionActor){requireTx(canReadTransaction(d,t,a)&&txWriter(a),'Only the assigned brokerage reviewer can change this record.');requireTx(!['Abandoned','Closed'].includes(t.state),'This transaction is an archive.');}
export function event(a:ExecutionActor,action:string,note:string,at=new Date().toISOString()):TxEvent{return {id:txId(),action,by:actorName(a),at,note:safeText(note,0,2000)};}
export function putTransaction(d:TxDb,t:Transaction,a:ExecutionActor,action:string,note:string):TxDb {const next={...t,revision:t.revision+1,history:[...t.history,event(a,action,note)]};return {...d,transactions:d.transactions!.map(x=>x.id===t.id?next:x)};}
export function transaction(d:TxDb,id:string,a:ExecutionActor){const t=d.transactions?.find(x=>x.id===id);requireTx(t&&canReadTransaction(d,t,a),'Transaction access denied.');return t;}
export function startTransaction(d:TxDb,a:ExecutionActor,p:{offerId:string;offerVersion:number;portalId:string;companyId:string;firmId:string;originalEstimate:Transaction['originalEstimate']}):{db:TxDb;id:string}{
 requireTx(txWriter(a),'Only a brokerage reviewer can start execution.');const o=d.offers.find(o=>o.id===p.offerId),l=d.listings.find(l=>l.id===o?.listingId),b=d.buyers.find(b=>b.id===o?.buyerId);
 requireTx(o&&l&&b&&b.status!=='Restricted'&&d.access.some(x=>x.listingId===l.id&&x.buyerId===b.id&&x.status==='Approved'),'Select a currently approved buyer.');
 requireTx((o.currentVersion||1)===p.offerVersion&&d.offerShares?.some(x=>x.offerId===o.id&&x.version===p.offerVersion)&&d.offerInstructions?.some(x=>x.offerId===o.id&&x.version===p.offerVersion),'Share this exact offer version and record the owner instruction first.');
 requireTx(!['Withdrawn','Declined'].includes(o.status)&&['Live','Under LOI'].includes(l.status),'The listing and selected offer must still be active.');
 requireTx(!versionOf(d,o).terms.expiresOn||versionOf(d,o).terms.expiresOn!>=new Date().toISOString().slice(0,10),'This offer has expired.');
 requireTx(l.companyId===p.companyId&&!!p.portalId&&!!p.firmId,'Link the current company and seller portal.');
 requireTx(!d.transactions?.some(x=>x.listingId===l.id&&!['Abandoned','Closed'].includes(x.state)),'This listing already has an active transaction.');
 const id=txId(),t:Transaction={id,fictional:!!l.sample,firmId:p.firmId,listingId:l.id,companyId:p.companyId,portalId:p.portalId,buyerId:b.id,buyerLabel:anonymousBuyerLabel(d,b,l.id),offerId:o.id,offerVersion:p.offerVersion,terms:structuredClone(versionOf(d,o).terms),state:'Planning',revision:1,createdAt:new Date().toISOString(),createdBy:actorName(a),lois:[],obligations:[],participants:[],identity:{},items:[],conditions:[],closes:[],cases:[],comparables:[],originalEstimate:structuredClone(p.originalEstimate),history:[event(a,'Execution started','Owner instruction recorded; signed LOI remains unconfirmed.')]};return {id,db:{...d,transactions:[...(d.transactions||[]),t]}};
}
export function latestLoi(t:Transaction){return t.lois.at(-1);}
export function loiConfirmed(d:TxDb,t:Transaction){const l=latestLoi(t);return !!l?.review&&sourceCurrent(d,t,l.review.source)&&l.signatories.length>=2&&l.signatories.some(s=>s.side==='buyer')&&l.signatories.some(s=>s.side==='seller')&&l.signatories.every(s=>sourceCurrent(d,t,s.source));}
export function saveLoi(d:TxDb,t:Transaction,a:ExecutionActor,p:Omit<LoiVersion,'version'|'createdAt'|'createdBy'|'review'>):TxDb{
 requireWrite(d,t,a);requireTx(p.offerVersion===t.offerVersion,'The LOI must name the selected immutable offer version.');const f=currentFile(d,p.fileId);requireTx(f?.transactionId===t.id&&f.kind==='LOI','Select a stored, current LOI document.');
 safeText(p.sellerEntity,2,160);safeText(p.buyerEntity,2,160);safeText(p.structure,5,1000);requireTx(dateOnly(p.executionDate),'Record the execution date stated in the document.');
 requireTx(p.signatories.length>=2&&p.signatories.every(s=>['buyer','seller'].includes(s.side)&&s.source.fileId===p.fileId&&safeText(s.name,2,160)&&safeText(s.role,2,160)),'Record the required signatories and their stated roles.');reviewSources(d,t,p.signatories.map(s=>s.source));
 const l:LoiVersion={...structuredClone(p),version:(latestLoi(t)?.version||0)+1,createdAt:new Date().toISOString(),createdBy:actorName(a)};
 return putTransaction(d,{...t,lois:[...t.lois,l],state:'Planning',closePackage:undefined},a,'LOI version saved','Prior obligations retain their dates and require review against this version.');
}
export function confirmLoi(d:TxDb,t:Transaction,a:ExecutionActor,p:{source:ExecutionSource;note:string}):TxDb{
 requireWrite(d,t,a);const l=latestLoi(t);requireTx(l&&p.source.fileId===l.fileId,'Open the latest LOI.');reviewSources(d,t,[p.source,...l.signatories.map(x=>x.source)]);safeText(p.note,20,2000);
 const review={source:p.source,note:p.note,reviewer:actorName(a),at:new Date().toISOString()};const next=putTransaction(d,{...t,state:'LOI reviewed',lois:t.lois.map(x=>x.version===l.version?{...x,review}:x)},a,'External signatures reviewed',p.note);
 return {...next,listings:next.listings.map(x=>x.id===t.listingId?{...x,status:'Under LOI',updatedAt:review.at}:x)};
}
export function validateDeadline(p:Deadline):Deadline{
 if(p.kind==='Unknown'){safeText(p.reason,5,400);return p;}
 if(p.kind==='Date'){requireTx(dateOnly(p.date)&&p.timezone==='America/New_York','Use a valid date and the New York timezone.');return p;}
 if(p.kind==='Time'){requireTx(p.timezone==='America/New_York'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(p.instant)&&Number.isFinite(Date.parse(p.instant)),'A timed obligation needs an explicit timezone offset.');return p;}
 requireTx(p.kind==='Relative'&&dateOnly(p.anchor)&&dateOnly(p.confirmedDate)&&Number.isInteger(p.days)&&p.days>=0&&p.days<=3650&&['Calendar days','Business days'].includes(p.calendar)&&typeof p.includeAnchor==='boolean'&&p.holidays.every(dateOnly)&&!!p.confirmedBy,'Confirm the anchor, counting convention, holidays and resulting date.');
 requireTx(relativeDate(p)===p.confirmedDate,'The confirmed date does not match the recorded calendar convention.');return p;
}
export function relativeDate(p:Extract<Deadline,{kind:'Relative'}>){let d=new Date(p.anchor+'T12:00:00Z'),n=p.days;if(p.includeAnchor&&n>0&&(p.calendar==='Calendar days'||![0,6].includes(d.getUTCDay())&&!p.holidays.includes(p.anchor)))n--;while(n>0){d=new Date(d.getTime()+864e5);if(p.calendar==='Calendar days'||![0,6].includes(d.getUTCDay())&&!p.holidays.includes(d.toISOString().slice(0,10)))n--;}return d.toISOString().slice(0,10);}
export function deadlineDate(d:Deadline){return d.kind==='Date'?d.date:d.kind==='Relative'?d.confirmedDate:d.kind==='Time'?new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d.instant)):'';}
export function deadlineOverdue(d:Deadline,at=Date.now()){if(d.kind==='Time')return Date.parse(d.instant)<at;const date=deadlineDate(d);return !!date&&date<new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
export function saveObligation(d:TxDb,t:Transaction,a:ExecutionActor,p:Omit<Obligation,'id'|'version'|'at'|'confirmedBy'|'loiVersion'>):TxDb{
 requireWrite(d,t,a);requireTx(loiConfirmed(d,t),'Review the current signed LOI first.');reviewSources(d,t,[p.source]);requireTx(p.source.fileId===latestLoi(t)!.fileId,'Cite the current LOI for this obligation.');safeText(p.title,3,160);validateDeadline(p.deadline);
 const old=p.supersedes?t.obligations.find(x=>x.id===p.supersedes):undefined;requireTx(!p.supersedes||old,'Choose an existing obligation to supersede.');
 const row:Obligation={...structuredClone(p),id:txId(),version:(old?.version||0)+1,loiVersion:latestLoi(t)!.version,confirmedBy:actorName(a),at:new Date().toISOString()};return putTransaction(d,{...t,obligations:[...t.obligations,row],closePackage:undefined},a,'Obligation confirmed',p.title);
}
export function shareIdentity(d:TxDb,t:Transaction,a:ExecutionActor,p:{side:'seller'|'buyer';source:ExecutionSource;note:string;external:boolean}){
 requireTx(canReadTransaction(d,t,a),'Transaction access denied.');const own=a.kind===p.side;requireTx(own&&!p.external||txWriter(a)&&p.external,'Record your own permission, or identify the external instruction as a reviewer.');reviewSources(d,t,[p.source]);safeText(p.note,20,2000);const evidence:Evidence={...p,reviewer:actorName(a)+(p.external?' (external instruction recorded)':' (authenticated party)'),at:new Date().toISOString()};return putTransaction(d,{...t,identity:{...t.identity,[p.side]:evidence},closePackage:undefined},a,'Identity permission recorded',p.side);
}
export function projectTransaction(d:TxDb,t:Transaction,a:ExecutionActor):Transaction{
 requireTx(canReadTransaction(d,t,a),'Transaction access denied.');if(a.kind==='advisor')return structuredClone(t);
 const key=actorKey(a),visible=(x:{audience:string[]})=>x.audience.includes(key),allowed=new Set((d.executionFiles||[]).filter(f=>f.transactionId===t.id&&fileAllowed(d,t,f,a)).map(f=>f.id));
 const sources=(s:ExecutionSource[])=>s.filter(x=>allowed.has(x.fileId));
 const identity=!!t.identity.seller&&!!t.identity.buyer;
 return {...structuredClone(t),...(a.kind==='guest'?{terms:undefined as unknown as OfferTerms,offerId:'',offerVersion:0,planningClose:undefined}:{}),buyerId:'',firmId:'',companyId:'',originalEstimate:null,participants:[],identity:{},history:[],stopReason:undefined,
  lois:t.lois.filter(l=>allowed.has(l.fileId)).map(l=>({...l,sellerEntity:identity?l.sellerEntity:'Seller',buyerEntity:identity?l.buyerEntity:t.buyerLabel,signatories:identity?l.signatories:[],review:l.review&&allowed.has(l.review.source.fileId)?l.review:undefined})),
  obligations:t.obligations.filter(o=>allowed.has(o.source.fileId)),items:t.items.filter(visible).map(i=>({...structuredClone(i),sources:sources(i.sources),history:[],review:i.review?{...i.review,externalAuthority:undefined}:undefined})),conditions:t.conditions.filter(visible).map(i=>({...structuredClone(i),sources:sources(i.sources),history:[]})),
  closes:a.kind==='guest'?[]:t.closes.map(c=>({...c,evidence:sources(c.evidence),handover:{guestIds:[],buyerFiles:[],sellerFiles:[]}})),comparables:[],cases:a.kind==='seller'?structuredClone(t.cases):[],closePackage:t.closePackage?{...t.closePackage,note:'Prepared for a completion review.'}:undefined};
}
export function abandonTransaction(d:TxDb,t:Transaction,a:ExecutionActor,reason:string){requireWrite(d,t,a);safeText(reason,20,2000);return putTransaction(d,{...t,state:'Abandoned',stopReason:reason,participants:t.participants.map(p=>({...p,status:'Revoked'})),closePackage:undefined},a,'Negotiations stopped',reason);}
