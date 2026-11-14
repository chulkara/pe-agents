// Owner (seller) portal. An invited owner sees only their own business room: interested
// buyers, document requests, messages and next steps. The firm's workspace stays private.
export type Side='firm'|'seller';
export type Contact={name:string;email:string;phone?:string};
export type PortalStatus='Draft'|'Invited'|'Active'|'Closed';
export type Portal={id:string;firmId:string;companyId:string;businessName:string;firmName:string;ownerName:string;ownerEmail:string;help:Contact;welcome:string;status:PortalStatus;requestsHidden?:boolean;createdAt:string;invitedAt?:string;acceptedAt?:string;sellerSeenAt?:string;firmSeenAt?:string};
export const buyerStages=['Introduced','Interested','Under NDA','Reviewing information','Offer made','Not proceeding'] as const;
export type BuyerStage=typeof buyerStages[number];
export type Buyer={id:string;portalId:string;name:string;summary:string;stage:BuyerStage;updatedAt:string;verification?:import('./buyerVerification.ts').VerificationBadge};
export const requestStatuses=['Open','In progress','Submitted','Accepted','Needs changes','Not applicable'] as const;
export type RequestStatus=typeof requestStatuses[number];
export type DocRequest={id:string;portalId:string;title:string;needed:string;why:string;sharing:string;contact:Contact;due:string;status:RequestStatus;sellerNote:string;reviewNote:string;fileIds:string[];createdAt:string;updatedAt:string;submittedAt?:string};
export type PortalFile={id:string;portalId:string;name:string;mime:string;size:number;sha256:string;status:'reserved'|'stored';uploadedBy:string;side:Side;createdAt:string};
export type Message={id:string;portalId:string;side:Side;author:string;body:string;createdAt:string};
export type NextStep={id:string;portalId:string;text:string;owner:'You'|'Firm';due:string;done:boolean};
export const letterStatuses=['Draft','Ready to sign','Viewed by owner','Signed by owner','Countersigned','Void'] as const;
export type LetterStatus=typeof letterStatuses[number];
export type Signature={name:string;email:string;at:string;consent:true};
/** An engagement letter. Its text is frozen once it is ready to sign; the hash proves which text was signed. */
export type Letter={id:string;portalId:string;version:number;templateVersion:string;input:{ownerName:string;advisorName:string;[k:string]:unknown};text:string;textHash:string;status:LetterStatus;events:{status:LetterStatus;at:string;by:string;note?:string}[];ownerSignature?:Signature;firmSignature?:Signature;voidReason?:string;createdAt:string;updatedAt:string};
export type OwnerAnswers={portalId:string;history:string;services:string;strengths:string;team:string;afterSale:string;updatedAt:string};
export const answerQuestions:[keyof Omit<OwnerAnswers,'portalId'|'updatedAt'>,string,string][]=[
  ['history','How did the business start, and how has it grown?','When it started, who started it, and the big steps since.'],
  ['services','What work do you do, and for whom?','Service, replacement, maintenance plans, commercial work, the areas you cover.'],
  ['strengths','What makes the business good?','What customers say, what you are proud of, what a new owner should keep.'],
  ['team','Who does what on your team?','Roles and how long people have been with you. Names are not needed.'],
  ['afterSale','What do you want for your team and customers after the sale?','For example, keeping everyone on, or how long you can help with the transition.'],
];
export const reviewStatuses=['Waiting for owner','Changes requested','Approved'] as const;
/** A document the owner reviews before anything is shared with buyers, such as the memorandum. */
export type OwnerReview={id:string;portalId:string;kind:'cim';version:number;title:string;sections:{key:string;title:string;text:string}[];status:typeof reviewStatuses[number];comments:{section:string;text:string;at:string}[];createdAt:string;decidedAt?:string};
export type PortalBundle={answers?:OwnerAnswers;reviews:OwnerReview[];letters:Letter[];portal:Portal;buyers:Buyer[];requests:DocRequest[];files:PortalFile[];messages:Message[];steps:NextStep[];access:{team:string[];seller:string[]};side:Side;canEdit:boolean};
export type PortalDb={portals:Portal[];buyers:Buyer[];requests:DocRequest[];files:PortalFile[];messages:Message[];steps:NextStep[];letters?:Letter[];answers?:OwnerAnswers[];reviews?:OwnerReview[];invites:{token:string;portalId:string;email:string;expiresAt:string;usedAt?:string}[]};
export type Actor={side:Side;name:string;email:string;canWrite?:boolean};

export const fileLimits={maxBytes:10*1024*1024,maxFiles:100,maxPortalBytes:200*1024*1024,types:['application/pdf','image/png','image/jpeg','text/plain','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']};
export const fileExtensions=/\.(pdf|png|jpe?g|txt|csv|xlsx?|docx?)$/i;
export const privacyReminder='Please remove Social Security numbers, full bank account numbers and passwords before uploading.';

/** Plain-language starting points for an HVAC sale. The firm edits every field before the owner sees it. */
export const requestTemplates:{title:string;needed:string;why:string}[]=[
  {title:'Profit and loss statements for the last 3 years',needed:'Annual profit and loss statements for the last three full years. Statements from your accountant or exports from QuickBooks are both fine.',why:'Buyers use these to understand revenue and earnings over time. They are the starting point for the valuation.'},
  {title:'Business tax returns for the last 3 years',needed:'The business tax returns filed for the same three years, with all pages and schedules.',why:'Tax returns confirm the figures in the profit and loss statements. Lenders financing a purchase, including SBA lenders, require them.'},
  {title:'Year-to-date financials',needed:'A profit and loss statement for this year to date, and the same months last year if you have them.',why:'Shows how the business is performing now. HVAC is seasonal, so the same months last year make the comparison fair.'},
  {title:'Maintenance agreement list',needed:'A list or export of active maintenance agreements: plan type, price, renewal month and whether it renews automatically. Customer names can be replaced with numbers.',why:'Recurring maintenance revenue is one of the biggest drivers of value for an HVAC company. Buyers pay more for agreements that renew.'},
  {title:'Licenses and insurance',needed:'Your NJ Master HVACR license or NYC and county licenses, business registrations, and certificates for liability, vehicle and workers’ compensation insurance.',why:'Buyers need to know who holds the license and how it will transfer. This shapes how long you may stay on after the sale.'},
  {title:'Team overview',needed:'A list of roles, start dates, pay ranges and certifications such as EPA 608 or NATE. Please leave out Social Security numbers, home addresses and dates of birth.',why:'Technicians are what buyers worry about most. This helps a buyer plan to keep the team in place.'},
  {title:'Customer and revenue mix',needed:'Revenue split by service, replacement, maintenance, commercial and new construction for the last full year, and your ten largest customers by share of revenue (names optional).',why:'Buyers value service and maintenance work more than new construction, and want to know whether the business depends on a few customers.'},
  {title:'Vehicles and equipment',needed:'A list of vans, trucks and major equipment with approximate age and whether each is owned or leased.',why:'Clarifies which assets are included in a sale and what may need replacing soon.'},
  {title:'Lease or property documents',needed:'Your current lease, or deed if you own the property, with any amendments and renewal options.',why:'Confirms the business can stay at its location after a sale and on what terms.'},
];

const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
const clean=(s:unknown,max:number)=>String(s??'').trim().slice(0,max);
const emailOk=(e:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=254;
function require_(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
function contact(c:Partial<Contact>|undefined,label:string):Contact{const name=clean(c?.name,120),email=clean(c?.email,254).toLowerCase(),phone=clean(c?.phone,40);require_(name.length>=2,label+' needs a name.');require_(emailOk(email),label+' needs a valid email address.');return phone?{name,email,phone}:{name,email};}

export const emptyPortalDb=():PortalDb=>({portals:[],buyers:[],requests:[],files:[],messages:[],steps:[],letters:[],answers:[],reviews:[],invites:[]});
function portalOf(db:PortalDb,id:string){const p=db.portals.find(x=>x.id===id);require_(p,'Owner portal not found.');return p;}
function firmWriter(a:Actor){require_(a.side==='firm'&&a.canWrite!==false,'Only the firm’s team can change this.');}
function sellerOf(a:Actor,p:Portal){require_(a.side==='seller'&&a.email.toLowerCase()===p.ownerEmail&&p.status==='Active','This portal is not available to this account.');}
function canRead(a:Actor,p:Portal){return a.side==='firm'||(a.email.toLowerCase()===p.ownerEmail&&p.status==='Active');}

export function createPortal(db:PortalDb,a:Actor,input:{firmId:string;firmName:string;companyId:string;businessName:string;ownerName:string;ownerEmail:string;help:Contact;welcome?:string}):{db:PortalDb;id:string}{
  firmWriter(a);
  require_(!db.portals.some(p=>p.companyId===input.companyId&&p.status!=='Closed'),'This business already has an open owner portal.');
  const owner=contact({name:input.ownerName,email:input.ownerEmail},'The owner');
  const p:Portal={id:uid(),firmId:input.firmId,companyId:input.companyId,businessName:clean(input.businessName,160),firmName:clean(input.firmName,160),ownerName:owner.name,ownerEmail:owner.email,help:contact(input.help,'The help contact'),welcome:clean(input.welcome,1200),status:'Draft',createdAt:now()};
  require_(p.businessName.length>=2,'Name the business.');
  return {db:{...db,portals:[...db.portals,p]},id:p.id};
}
export function updatePortal(db:PortalDb,a:Actor,id:string,patch:Partial<Pick<Portal,'ownerName'|'ownerEmail'|'help'|'welcome'|'businessName'>>&{close?:boolean}):PortalDb{
  firmWriter(a);const p=portalOf(db,id);
  const next:Portal={...p,businessName:patch.businessName!==undefined?clean(patch.businessName,160):p.businessName,welcome:patch.welcome!==undefined?clean(patch.welcome,1200):p.welcome,help:patch.help?contact(patch.help,'The help contact'):p.help};
  if(patch.ownerEmail!==undefined||patch.ownerName!==undefined){const o=contact({name:patch.ownerName??p.ownerName,email:patch.ownerEmail??p.ownerEmail},'The owner');
    // Changing the invited address revokes the earlier invitation and access.
    if(o.email!==p.ownerEmail){next.status=p.status==='Closed'?'Closed':'Draft';next.acceptedAt=undefined;db={...db,invites:db.invites.map(i=>i.portalId===id&&!i.usedAt?{...i,usedAt:'revoked'}:i)};}
    next.ownerName=o.name;next.ownerEmail=o.email;}
  if(patch.close)next.status='Closed';
  return {...db,portals:db.portals.map(x=>x.id===id?next:x)};
}
export function invite(db:PortalDb,a:Actor,id:string,token=uid().replace(/-/g,'')+uid().replace(/-/g,'')):{db:PortalDb;token:string}{
  firmWriter(a);const p=portalOf(db,id);require_(p.status!=='Closed','This portal is closed.');
  const invites=db.invites.map(i=>i.portalId===id&&!i.usedAt?{...i,usedAt:'replaced'}:i);
  const expiresAt=new Date(Date.now()+14*864e5).toISOString();
  return {db:{...db,invites:[...invites,{token,portalId:id,email:p.ownerEmail,expiresAt}],portals:db.portals.map(x=>x.id===id&&x.status==='Draft'?{...x,status:'Invited',invitedAt:now()}:x)},token};
}
export function acceptInvite(db:PortalDb,email:string,token:string):{db:PortalDb;id:string}{
  const i=db.invites.find(x=>x.token===token&&!x.usedAt&&x.expiresAt>now());
  require_(i,'This invitation link is invalid or has expired. Ask your contact for a new one.');
  require_(i.email===email.toLowerCase(),'This invitation was sent to a different email address. Sign in with the address it was sent to.');
  return {id:i.portalId,db:{...db,invites:db.invites.map(x=>x===i?{...x,usedAt:now()}:x),portals:db.portals.map(p=>p.id===i.portalId?{...p,status:'Active',acceptedAt:now()}:p)}};
}

export function saveBuyer(db:PortalDb,a:Actor,portalId:string,b:{id?:string;name:string;summary:string;stage:BuyerStage}):PortalDb{
  firmWriter(a);portalOf(db,portalId);
  const v:Buyer={id:b.id||uid(),portalId,name:clean(b.name,160),summary:clean(b.summary,800),stage:b.stage,updatedAt:now()};
  require_(v.name.length>=2,'Name the buyer.');require_(buyerStages.includes(v.stage),'Choose a buyer stage.');
  return {...db,buyers:b.id?db.buyers.map(x=>x.id===b.id&&x.portalId===portalId?v:x):[...db.buyers,v]};
}
export function removeBuyer(db:PortalDb,a:Actor,id:string):PortalDb{firmWriter(a);return {...db,buyers:db.buyers.filter(b=>b.id!==id)};}
export function saveSteps(db:PortalDb,a:Actor,portalId:string,steps:{id?:string;text:string;owner:'You'|'Firm';due:string;done:boolean}[]):PortalDb{
  firmWriter(a);portalOf(db,portalId);require_(steps.length<=12,'Keep next steps to twelve or fewer.');
  const v=steps.map(s=>({id:s.id||uid(),portalId,text:clean(s.text,300),owner:s.owner==='You'?'You' as const:'Firm' as const,due:clean(s.due,10),done:!!s.done})).filter(s=>s.text.length>=3);
  return {...db,steps:[...db.steps.filter(s=>s.portalId!==portalId),...v]};
}
export function saveRequest(db:PortalDb,a:Actor,portalId:string,r:{id?:string;title:string;needed:string;why:string;sharing:string;contact:Contact;due:string}):PortalDb{
  firmWriter(a);portalOf(db,portalId);
  const base={title:clean(r.title,140),needed:clean(r.needed,1500),why:clean(r.why,1000),sharing:clean(r.sharing,600),contact:contact(r.contact,'The request contact'),due:clean(r.due,10)};
  require_(base.title.length>=3,'Give the request a short title.');require_(base.needed.length>=10,'Explain what is needed.');require_(base.why.length>=10,'Explain why it is needed.');require_(base.sharing.length>=10,'Say who will see these documents.');
  if(r.id){const old=db.requests.find(x=>x.id===r.id&&x.portalId===portalId);require_(old,'Request not found.');return {...db,requests:db.requests.map(x=>x===old?{...old,...base,updatedAt:now()}:x)};}
  require_(db.requests.filter(x=>x.portalId===portalId).length<40,'Forty requests per portal is the pilot limit.');
  return {...db,requests:[...db.requests,{id:uid(),portalId,...base,status:'Open',sellerNote:'',reviewNote:'',fileIds:[],createdAt:now(),updatedAt:now()}]};
}
export function reviewRequest(db:PortalDb,a:Actor,id:string,status:'Accepted'|'Needs changes'|'Not applicable'|'Open',note:string):PortalDb{
  firmWriter(a);const r=db.requests.find(x=>x.id===id);require_(r,'Request not found.');
  if(status==='Needs changes')require_(clean(note,1000).length>=5,'Tell the owner what needs to change.');
  return {...db,requests:db.requests.map(x=>x===r?{...r,status,reviewNote:clean(note,1000),updatedAt:now()}:x)};
}

function sellerRequest(db:PortalDb,a:Actor,id:string){const r=db.requests.find(x=>x.id===id);require_(r,'Request not found.');const p=portalOf(db,r.portalId);sellerOf(a,p);require_(!p.requestsHidden,'Document requests open after the engagement letter is signed.');require_(!['Accepted','Not applicable'].includes(r.status),'This request is already complete.');return r;}
/** Saving a note or a file moves a request to In progress; nothing is lost if the owner leaves. */
export function saveSellerNote(db:PortalDb,a:Actor,id:string,note:string):PortalDb{
  const r=sellerRequest(db,a,id),sellerNote=clean(note,2000);
  return {...db,requests:db.requests.map(x=>x===r?{...r,sellerNote,status:['Open','Needs changes'].includes(r.status)&&(sellerNote||r.fileIds.length)?'In progress':r.status,updatedAt:now()}:x)};
}
export function submitRequest(db:PortalDb,a:Actor,id:string):PortalDb{
  const r=sellerRequest(db,a,id);require_(r.fileIds.length||r.sellerNote.length>=5,'Add a document, or a note explaining why you cannot provide one, before sending.');
  return {...db,requests:db.requests.map(x=>x===r?{...r,status:'Submitted',submittedAt:now(),updatedAt:now()}:x)};
}
/** Same bytes already supplied? Link the existing document instead of storing a copy. */
export function findDuplicate(db:PortalDb,portalId:string,sha256:string){return db.files.find(f=>f.portalId===portalId&&f.sha256===sha256&&f.status==='stored');}
export function checkUpload(db:PortalDb,portalId:string,f:{name:string;mime:string;size:number}){
  require_(f.size>0&&f.size<=fileLimits.maxBytes,'Each file can be up to 10 MB. Split larger files or contact your help contact.');
  require_(fileExtensions.test(f.name)&&(fileLimits.types.includes(f.mime)||f.mime===''),'Use PDF, image, Word, Excel, CSV or text files.');
  const own=db.files.filter(x=>x.portalId===portalId);require_(own.length<fileLimits.maxFiles,'This portal has reached its 100-file limit. Contact your help contact.');
  require_(own.reduce((n,x)=>n+x.size,0)+f.size<=fileLimits.maxPortalBytes,'This portal has reached its storage limit. Contact your help contact.');
}
export function addFile(db:PortalDb,a:Actor,requestId:string,f:{id?:string;name:string;mime:string;size:number;sha256:string}):{db:PortalDb;file:PortalFile;duplicate:boolean}{
  const r=a.side==='seller'?sellerRequest(db,a,requestId):db.requests.find(x=>x.id===requestId);require_(r,'Request not found.');if(a.side==='firm')firmWriter(a);
  require_(/^[0-9a-f]{64}$/.test(f.sha256),'File fingerprint missing.');
  const dup=findDuplicate(db,r.portalId,f.sha256);
  if(dup){const linked=r.fileIds.includes(dup.id);return {db:linked?db:linkFile(db,a,requestId,dup.id),file:dup,duplicate:true};}
  checkUpload(db,r.portalId,f);
  const file:PortalFile={id:f.id||uid(),portalId:r.portalId,name:clean(f.name,200),mime:f.mime||'application/octet-stream',size:f.size,sha256:f.sha256,status:'stored',uploadedBy:a.name,side:a.side,createdAt:now()};
  return {db:linkFile({...db,files:[...db.files,file]},a,requestId,file.id),file,duplicate:false};
}
export function linkFile(db:PortalDb,a:Actor,requestId:string,fileId:string):PortalDb{
  const r=db.requests.find(x=>x.id===requestId);require_(r,'Request not found.');
  if(a.side==='seller'){const p=portalOf(db,r.portalId);sellerOf(a,p);require_(!p.requestsHidden,'Documents open after the engagement letter is signed.');}else firmWriter(a);
  const f=db.files.find(x=>x.id===fileId&&x.portalId===r.portalId&&x.status==='stored');require_(f,'That document is not available in this portal.');
  if(r.fileIds.includes(fileId))return db;
  if(a.side==='seller')require_(!['Accepted','Not applicable'].includes(r.status),'This request is already complete.');
  return {...db,requests:db.requests.map(x=>x===r?{...r,fileIds:[...r.fileIds,fileId],status:'In progress',reviewNote:['Accepted','Submitted'].includes(r.status)?'':r.reviewNote,submittedAt:undefined,updatedAt:now()}:x)};
}
export function unlinkFile(db:PortalDb,a:Actor,requestId:string,fileId:string):PortalDb{
  const r=sellerRequest(db,a,requestId);require_(r.status!=='Submitted','This request was sent for review. Message your contact to change it.');
  return {...db,requests:db.requests.map(x=>x===r?{...r,fileIds:r.fileIds.filter(id=>id!==fileId),updatedAt:now()}:x)};
}
export function postMessage(db:PortalDb,a:Actor,portalId:string,body:string):PortalDb{
  const p=portalOf(db,portalId);if(a.side==='seller')sellerOf(a,p);else firmWriter(a);
  const text=clean(body,4000);require_(text.length>=1,'Write a message first.');
  return {...db,messages:[...db.messages,{id:uid(),portalId,side:a.side,author:a.name,body:text,createdAt:now()}]};
}
export function markSeen(db:PortalDb,a:Actor,portalId:string):PortalDb{const p=portalOf(db,portalId);if(!canRead(a,p))return db;return {...db,portals:db.portals.map(x=>x.id===portalId?{...x,[a.side==='seller'?'sellerSeenAt':'firmSeenAt']:now()}:x)};}

export function bundle(db:PortalDb,a:Actor,portalId:string,team:string[]):PortalBundle{
  const portal=portalOf(db,portalId);require_(canRead(a,portal),'This portal is not available to this account.');
  const seller=a.side==='seller';
  const requests=seller&&portal.requestsHidden?[]:db.requests.filter(r=>r.portalId===portalId);
  const letters=(db.letters||[]).filter(l=>l.portalId===portalId&&(!seller||l.status!=='Draft')).sort((x,y)=>y.version-x.version);
  const reviews=(db.reviews||[]).filter(r=>r.portalId===portalId).sort((x,y)=>y.version-x.version),answers=(db.answers||[]).find(x=>x.portalId===portalId);
  return {answers,reviews,letters,portal,buyers:db.buyers.filter(b=>b.portalId===portalId),requests,files:seller&&portal.requestsHidden?[]:db.files.filter(f=>f.portalId===portalId&&f.status==='stored'),messages:db.messages.filter(m=>m.portalId===portalId),steps:db.steps.filter(s=>s.portalId===portalId),access:{team,seller:portal.status==='Active'?[portal.ownerEmail]:[]},side:a.side,canEdit:a.side==='firm'?a.canWrite!==false:portal.status==='Active'};
}

/** Progress the owner sees at the top of their portal. */
export function portalProgress(b:Pick<PortalBundle,'requests'>){
  const live=b.requests.filter(r=>r.status!=='Not applicable');
  const done=live.filter(r=>r.status==='Accepted').length,sent=live.filter(r=>r.status==='Submitted').length,started=live.filter(r=>r.status==='In progress').length,changes=live.filter(r=>r.status==='Needs changes').length;
  return {total:live.length,done,sent,started,changes,open:live.length-done-sent-started-changes};
}
export function unread(b:PortalBundle){const seen=b.side==='seller'?b.portal.sellerSeenAt:b.portal.firmSeenAt;return b.messages.filter(m=>m.side!==b.side&&(!seen||m.createdAt>seen)).length;}
export async function sha256Hex(data:ArrayBuffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function requestOrder(r:DocRequest){return ['Needs changes','In progress','Open','Submitted','Accepted','Not applicable'].indexOf(r.status);}
export const possessive=(name:string)=>name+(/s$/i.test(name.trim())?'’':'’s');

// ── Engagement letters ──────────────────────────────────────────────────────────────────────
const letterOf=(db:PortalDb,id:string)=>{const l=(db.letters||[]).find(x=>x.id===id);require_(l,'Letter not found.');return l;};
const setLetter=(db:PortalDb,l:Letter):PortalDb=>({...db,letters:(db.letters||[]).map(x=>x.id===l.id?l:x)});
const event=(l:Letter,status:LetterStatus,by:string,note?:string):Letter=>({...l,status,updatedAt:now(),events:[...l.events,{status,at:now(),by,...(note?{note}:{})}]});
export const nameMatches=(typed:string,expected:string)=>{const n=(s:string)=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();return n(expected).length>=2&&n(typed)===n(expected);};
/** Requests stay hidden from the owner until the letter is countersigned. */
export function setRequestsHidden(db:PortalDb,a:Actor,portalId:string,hidden:boolean):PortalDb{firmWriter(a);portalOf(db,portalId);return {...db,portals:db.portals.map(p=>p.id===portalId?{...p,requestsHidden:hidden}:p)};}
export function saveLetterDraft(db:PortalDb,a:Actor,portalId:string,l:{id?:string;templateVersion:string;input:Letter['input'];text:string;textHash:string}):{db:PortalDb;id:string}{
  firmWriter(a);const p=portalOf(db,portalId);require_(p.status!=='Closed','This portal is closed.');
  require_(l.text.length>=200&&/^[0-9a-f]{64}$/.test(l.textHash),'Fill in the letter first.');
  const list=(db.letters||[]).filter(x=>x.portalId===portalId);
  if(l.id){const old=letterOf(db,l.id);require_(old.status==='Draft','Only a draft letter can be edited. Void it and start a new version.');return {db:setLetter(db,{...old,input:l.input,text:l.text,textHash:l.textHash,templateVersion:l.templateVersion,updatedAt:now()}),id:old.id};}
  require_(!list.some(x=>!['Void','Countersigned'].includes(x.status)),'This portal already has an open engagement letter.');
  const letter:Letter={id:uid(),portalId,version:list.length+1,templateVersion:l.templateVersion,input:l.input,text:l.text,textHash:l.textHash,status:'Draft',events:[{status:'Draft',at:now(),by:a.name}],createdAt:now(),updatedAt:now()};
  return {db:{...db,letters:[...(db.letters||[]),letter]},id:letter.id};
}
export function letterReady(db:PortalDb,a:Actor,id:string):PortalDb{firmWriter(a);const l=letterOf(db,id);require_(l.status==='Draft','This letter was already sent.');return setLetter(db,event(l,'Ready to sign',a.name));}
export function letterViewed(db:PortalDb,a:Actor,id:string):PortalDb{const l=letterOf(db,id);sellerOf(a,portalOf(db,l.portalId));return l.status==='Ready to sign'?setLetter(db,event(l,'Viewed by owner',a.name)):db;}
export function signLetter(db:PortalDb,a:Actor,id:string,typedName:string,agreed:boolean):PortalDb{
  const l=letterOf(db,id);sellerOf(a,portalOf(db,l.portalId));
  require_(['Ready to sign','Viewed by owner'].includes(l.status),'This letter is not waiting for your signature.');
  require_(agreed,'Agree to sign electronically first.');require_(nameMatches(typedName,l.input.ownerName),`Type your full name exactly as it appears on the letter: ${l.input.ownerName}.`);
  return setLetter(db,{...event(l,'Signed by owner',a.email),ownerSignature:{name:typedName.trim().replace(/\s+/g,' '),email:a.email.toLowerCase(),at:now(),consent:true}});
}
export function countersignLetter(db:PortalDb,a:Actor,id:string,typedName:string,agreed:boolean):PortalDb{
  firmWriter(a);const l=letterOf(db,id);require_(l.status==='Signed by owner','The owner has not signed yet.');
  require_(agreed,'Agree to sign electronically first.');require_(nameMatches(typedName,l.input.advisorName),`Type the advisor’s name exactly as it appears on the letter: ${l.input.advisorName}.`);
  const signed={...event(l,'Countersigned',a.email),firmSignature:{name:typedName.trim().replace(/\s+/g,' '),email:a.email.toLowerCase(),at:now(),consent:true as const}};
  return {...setLetter(db,signed),portals:db.portals.map(p=>p.id===l.portalId?{...p,requestsHidden:false}:p)};
}
export function voidLetter(db:PortalDb,a:Actor,id:string,reason:string):PortalDb{
  firmWriter(a);const l=letterOf(db,id);require_(!['Countersigned','Void'].includes(l.status),'A countersigned letter cannot be voided here.');const r=clean(reason,500);require_(r.length>=5,'Say why the letter is void.');
  return setLetter(db,{...event(l,'Void',a.name,r),voidReason:r});
}
/** The letter the owner and advisor are working on now: the newest that is not void. */
export const currentLetter=(letters:Letter[])=>[...letters].sort((x,y)=>y.version-x.version).find(l=>l.status!=='Void');

// ── Owner answers and reviews ───────────────────────────────────────────────────────────────
export function saveAnswers(db:PortalDb,a:Actor,portalId:string,ans:Partial<Omit<OwnerAnswers,'portalId'|'updatedAt'>>):PortalDb{
  const p=portalOf(db,portalId);sellerOf(a,p);const old=(db.answers||[]).find(x=>x.portalId===portalId);
  const v:OwnerAnswers={portalId,history:clean(ans.history??old?.history,3000),services:clean(ans.services??old?.services,3000),strengths:clean(ans.strengths??old?.strengths,3000),team:clean(ans.team??old?.team,3000),afterSale:clean(ans.afterSale??old?.afterSale,3000),updatedAt:now()};
  return {...db,answers:[...(db.answers||[]).filter(x=>x.portalId!==portalId),v]};
}
export function publishReview(db:PortalDb,a:Actor,portalId:string,r:{kind:'cim';version:number;title:string;sections:{key:string;title:string;text:string}[]}):{db:PortalDb;id:string}{
  firmWriter(a);portalOf(db,portalId);require_(r.sections.length>=1,'Nothing to review.');
  const v:OwnerReview={id:uid(),portalId,kind:r.kind,version:r.version,title:clean(r.title,160),sections:r.sections.map(x=>({key:clean(x.key,40),title:clean(x.title,120),text:clean(x.text,20000)})),status:'Waiting for owner',comments:[],createdAt:now()};
  return {db:{...db,reviews:[...(db.reviews||[]).filter(x=>!(x.portalId===portalId&&x.kind===r.kind&&x.status==='Waiting for owner')),v]},id:v.id};
}
export function decideReview(db:PortalDb,a:Actor,id:string,decision:'Approved'|'Changes requested',comments:{section:string;text:string}[]):PortalDb{
  const r=(db.reviews||[]).find(x=>x.id===id);require_(r,'Review not found.');sellerOf(a,portalOf(db,r.portalId));require_(r.status==='Waiting for owner','This was already answered.');
  const c=comments.map(x=>({section:clean(x.section,40),text:clean(x.text,2000),at:now()})).filter(x=>x.text.length>=3);
  if(decision==='Changes requested')require_(c.length>0,'Say what you would like changed.');
  return {...db,reviews:(db.reviews||[]).map(x=>x.id===id?{...x,status:decision,comments:c,decidedAt:now()}:x)};
}
/** A file the firm adds itself, such as the approved memorandum, not tied to a request. */
export function addFirmFile(db:PortalDb,a:Actor,portalId:string,f:{id?:string;name:string;mime:string;size:number;sha256:string}):{db:PortalDb;file:PortalFile}{
  firmWriter(a);portalOf(db,portalId);require_(/^[0-9a-f]{64}$/.test(f.sha256),'File fingerprint missing.');
  const dup=findDuplicate(db,portalId,f.sha256);if(dup)return {db,file:dup};checkUpload(db,portalId,f);
  const file:PortalFile={id:f.id||uid(),portalId,name:clean(f.name,200),mime:f.mime,size:f.size,sha256:f.sha256,status:'stored',uploadedBy:a.name,side:'firm',createdAt:now()};
  return {db:{...db,files:[...db.files,file]},file};
}
