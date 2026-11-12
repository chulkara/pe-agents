// Kalling brokerage: sell-side marketplace for NJ/NY HVAC companies.
// Public visitors see anonymized teasers. Registered buyers sign a listing NDA and request
// access; an advisor approves before confidential details, questions and offers open up.
import type {Valuation} from './hvacValuation.ts';

export type Region='North Jersey'|'Central Jersey'|'South Jersey'|'Jersey Shore'|'New York City'|'Long Island'|'Hudson Valley'|'Westchester & Rockland';
export const regions:Region[]=['North Jersey','Central Jersey','South Jersey','Jersey Shore','New York City','Long Island','Hudson Valley','Westchester & Rockland'];
export const regionState=(r:Region)=>(['North Jersey','Central Jersey','South Jersey','Jersey Shore'] as Region[]).includes(r)?'NJ':'NY';
export type Focus='Residential service & replacement'|'Commercial HVAC/R'|'Residential & commercial'|'Refrigeration & controls';
export const focuses:Focus[]=['Residential service & replacement','Commercial HVAC/R','Residential & commercial','Refrigeration & controls'];
export type ListingStatus='Draft'|'Live'|'Under LOI'|'Sold'|'Withdrawn';
export type Listing={id:string;number:string;status:ListingStatus;sample:boolean;headline:string;region:Region;focus:Focus;askingPrice:number;revenue:number;sde:number;established:number;employees:number;technicians:number;agreements:number;recurringPct:number;residentialPct:number;vehicles:number;realEstate:'Leased facility'|'Real estate available'|'Home-based';sellerFinancing:boolean;reason:string;summary:string;highlights:string[];growth:string[];
  confidential:{businessName:string;city:string;website:string;details:string};companyId?:string;portalId?:string;createdAt:string;publishedAt?:string;updatedAt:string};
export type BuyerType='Owner-operator'|'Search fund'|'Strategic HVAC operator'|'Private equity / family office';
export const buyerTypes:BuyerType[]=['Owner-operator','Search fund','Strategic HVAC operator','Private equity / family office'];
export type Funds='Under $250K'|'$250K to $500K'|'$500K to $1M'|'$1M to $5M'|'Over $5M';
export const fundBands:Funds[]=['Under $250K','$250K to $500K','$500K to $1M','$1M to $5M','Over $5M'];
export type Buyer={id:string;email:string;name:string;phone:string;type:BuyerType;company:string;funds:Funds;financing:string[];experience:string;regions:Region[];maxPrice:number;status:'Registered'|'Verified'|'Restricted';advisorNote:string;saved:string[];alerts:boolean;createdAt:string};
export type AccessRequest={id:string;listingId:string;buyerId:string;status:'Pending'|'Approved'|'Declined'|'Withdrawn';nda:{version:string;textHash:string;signedName:string;signedAt:string};message:string;decisionNote:string;decidedAt?:string;createdAt:string};
export type Offer={id:string;listingId:string;buyerId:string;kind:'Indication of interest'|'Letter of intent';price:number;cashAtClose:number;sellerNote:number;earnout:number;financing:string;closeDays:number;conditions:string;status:'Submitted'|'Shared with seller'|'Countered'|'Accepted'|'Declined'|'Withdrawn';advisorNote:string;createdAt:string;updatedAt:string};
export type Question={id:string;listingId:string;buyerId:string;side:'buyer'|'advisor';author:string;body:string;createdAt:string};
export type LeadStatus='New'|'Contacted'|'Qualified'|'Engaged'|'Not a fit';
export type Lead={id:string;createdAt:string;name:string;email:string;phone:string;businessName:string;region:Region;timing:string;message:string;valuation?:Pick<Valuation,'sde'|'low'|'high'|'mid'>&{revenue:number};status:LeadStatus;notes:string;source:'valuation'|'contact'};
export const fundsChecks=['Not checked','Requested','Proof of funds received','Lender pre-qualified','Not sufficient'] as const;
export type FundsCheck=typeof fundsChecks[number];
/** Advisor-only record of whether a buyer showed they can pay. Buyers never see it. */
export type BuyerCheck={buyerId:string;funds:FundsCheck;note:string;checkedAt:string;checkedBy:string};
export type BrokerDb={listings:Listing[];buyers:Buyer[];access:AccessRequest[];offers:Offer[];questions:Question[];leads:Lead[];checks?:BuyerCheck[]};
export type Viewer={kind:'public'}|{kind:'buyer';email:string}|{kind:'advisor';name:string;canWrite:boolean};

export const ndaVersion='kalling-listing-nda-2026-11';
export const ndaText=(l:Pick<Listing,'number'|'headline'>)=>`CONFIDENTIALITY AGREEMENT: LISTING ${l.number}

In exchange for receiving confidential information about the business offered as listing ${l.number} (“${l.headline}”), I agree that:

1. I will use the information only to evaluate a possible acquisition of this business.
2. I will not disclose the business’s identity or any information I receive to anyone except my advisors, lenders and investors who need it for that evaluation and who are bound to keep it confidential. I am responsible for their compliance.
3. I will not contact the owner, employees, customers, suppliers, landlord or lenders of the business except through Kalling, unless the owner agrees in writing.
4. I will not solicit or hire the business’s employees for two years, except through general advertising.
5. If I stop evaluating the business, or Kalling asks, I will return or destroy the information.
6. This agreement lasts for two years. It does not oblige either side to complete a transaction. It is governed by New Jersey law.

Information not already public, received from Kalling or the seller, is confidential under this agreement.`;

const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
const clean=(s:unknown,max:number)=>String(s??'').trim().slice(0,max);
const emailOk=(e:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=254;
function need(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
const advisor=(v:Viewer)=>{need(v.kind==='advisor'&&v.canWrite,'Only a Kalling advisor can do this.');};
export const emptyBrokerDb=():BrokerDb=>({listings:[],buyers:[],access:[],offers:[],questions:[],leads:[],checks:[]});
export const publicStatuses:ListingStatus[]=['Live','Under LOI','Sold'];

/** What a viewer may see of a listing. Confidential fields only after an approved NDA. */
export function listingFor(db:BrokerDb,v:Viewer,l:Listing):Listing&{access:AccessRequest['status']|'None'|'Advisor'}{
  if(v.kind==='advisor')return {...l,access:'Advisor'};
  need(publicStatuses.includes(l.status),'This listing is not available.');
  const buyer=v.kind==='buyer'?db.buyers.find(b=>b.email===v.email):undefined;
  const req=buyer?db.access.filter(a=>a.listingId===l.id&&a.buyerId===buyer.id).at(-1):undefined;
  const open=req?.status==='Approved'&&buyer?.status!=='Restricted';
  return {...l,companyId:undefined,portalId:undefined,confidential:open?l.confidential:{businessName:'',city:'',website:'',details:''},access:req?.status||'None'};
}
export function publicListings(db:BrokerDb,v:Viewer){return db.listings.filter(l=>v.kind==='advisor'||publicStatuses.includes(l.status)).map(l=>listingFor(db,v,l)).sort((a,b)=>(a.status==='Sold'?1:0)-(b.status==='Sold'?1:0)||(b.publishedAt||b.createdAt).localeCompare(a.publishedAt||a.createdAt));}
export type ListingFilter={q?:string;state?:'NJ'|'NY'|'';region?:Region|'';focus?:Focus|'';maxPrice?:number;minSde?:number;recurringOnly?:boolean;sort?:'newest'|'price-asc'|'price-desc'|'sde-desc'};
export function filterListings<T extends Listing>(list:T[],f:ListingFilter){
  const q=(f.q||'').toLowerCase();
  const out=list.filter(l=>(!q||[l.headline,l.summary,l.region,l.focus,l.number].join(' ').toLowerCase().includes(q))&&(!f.state||regionState(l.region)===f.state)&&(!f.region||l.region===f.region)&&(!f.focus||l.focus===f.focus)&&(!f.maxPrice||l.askingPrice<=f.maxPrice)&&(!f.minSde||l.sde>=f.minSde)&&(!f.recurringOnly||l.recurringPct>=50));
  const s=f.sort||'newest';
  return s==='newest'?out:[...out].sort((a,b)=>s==='price-asc'?a.askingPrice-b.askingPrice:s==='price-desc'?b.askingPrice-a.askingPrice:b.sde-a.sde);
}

export function submitLead(db:BrokerDb,input:Omit<Lead,'id'|'createdAt'|'status'|'notes'>&{consent:boolean}):BrokerDb{
  need(input.consent,'Please agree to be contacted about your business.');
  const email=clean(input.email,254).toLowerCase();need(emailOk(email),'Enter a valid email address.');
  const name=clean(input.name,120);need(name.length>=2,'Enter your name.');
  need(regions.includes(input.region),'Choose where the business is based.');
  need(db.leads.filter(l=>l.email===email&&l.createdAt>new Date(Date.now()-864e5).toISOString()).length<3,'We already have your request. An advisor will be in touch within one business day.');
  const lead:Lead={id:uid(),createdAt:now(),name,email,phone:clean(input.phone,40),businessName:clean(input.businessName,160),region:input.region,timing:clean(input.timing,60),message:clean(input.message,2000),valuation:input.valuation,status:'New',notes:'',source:input.source};
  return {...db,leads:[lead,...db.leads]};
}
export function updateLead(db:BrokerDb,v:Viewer,id:string,patch:{status?:LeadStatus;notes?:string}):BrokerDb{advisor(v);return {...db,leads:db.leads.map(l=>l.id===id?{...l,status:patch.status??l.status,notes:patch.notes!==undefined?clean(patch.notes,4000):l.notes}:l)};}

export function saveListing(db:BrokerDb,v:Viewer,input:Partial<Listing>&{id?:string}):{db:BrokerDb;id:string}{
  advisor(v);const old=input.id?db.listings.find(l=>l.id===input.id):undefined;need(!input.id||old,'Listing not found.');
  const base:Listing=old||{id:uid(),number:'KL-'+(Math.max(1100,...db.listings.map(l=>Number(l.number.slice(3))||0))+1),status:'Draft',sample:false,headline:'',region:'Central Jersey',focus:'Residential service & replacement',askingPrice:0,revenue:0,sde:0,established:2010,employees:0,technicians:0,agreements:0,recurringPct:0,residentialPct:100,vehicles:0,realEstate:'Leased facility',sellerFinancing:false,reason:'',summary:'',highlights:[],growth:[],confidential:{businessName:'',city:'',website:'',details:''},createdAt:now(),updatedAt:now()};
  const n=(x:unknown,d:number)=>Number.isFinite(Number(x))&&Number(x)>=0?Number(x):d;
  const next:Listing={...base,headline:clean(input.headline??base.headline,120),region:input.region??base.region,focus:input.focus??base.focus,askingPrice:n(input.askingPrice,base.askingPrice),revenue:n(input.revenue,base.revenue),sde:n(input.sde,base.sde),established:n(input.established,base.established),employees:n(input.employees,base.employees),technicians:n(input.technicians,base.technicians),agreements:n(input.agreements,base.agreements),recurringPct:Math.min(100,n(input.recurringPct,base.recurringPct)),residentialPct:Math.min(100,n(input.residentialPct,base.residentialPct)),vehicles:n(input.vehicles,base.vehicles),realEstate:input.realEstate??base.realEstate,sellerFinancing:input.sellerFinancing??base.sellerFinancing,reason:clean(input.reason??base.reason,300),summary:clean(input.summary??base.summary,2500),highlights:(input.highlights??base.highlights).map(h=>clean(h,200)).filter(Boolean).slice(0,8),growth:(input.growth??base.growth).map(h=>clean(h,200)).filter(Boolean).slice(0,6),confidential:{businessName:clean(input.confidential?.businessName??base.confidential.businessName,160),city:clean(input.confidential?.city??base.confidential.city,120),website:clean(input.confidential?.website??base.confidential.website,200),details:clean(input.confidential?.details??base.confidential.details,5000)},companyId:input.companyId??base.companyId,portalId:input.portalId??base.portalId,updatedAt:now()};
  need(regions.includes(next.region)&&focuses.includes(next.focus),'Choose a region and focus.');
  return {db:{...db,listings:old?db.listings.map(l=>l===old?next:l):[next,...db.listings]},id:next.id};
}
/** Publishing checks that the teaser cannot identify the business and has the essentials. */
export function publishProblems(l:Listing):string[]{
  const p:string[]=[];
  if(l.headline.length<12)p.push('Write a headline of at least 12 characters.');
  if(l.summary.length<120)p.push('Write a public summary of at least 120 characters.');
  if(!(l.askingPrice>0&&l.revenue>0&&l.sde>0))p.push('Enter asking price, revenue and SDE.');
  if(l.highlights.length<3)p.push('Add at least three highlights.');
  const secret=[l.confidential.businessName,l.confidential.city,l.confidential.website.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]].map(s=>s.trim().toLowerCase()).filter(s=>s.length>=4);
  const publicText=[l.headline,l.summary,l.reason,...l.highlights,...l.growth].join(' ').toLowerCase();
  for(const s of secret)if(publicText.includes(s))p.push(`The public text mentions “${s}”. Remove it so the business stays anonymous.`);
  return p;
}
export function setListingStatus(db:BrokerDb,v:Viewer,id:string,status:ListingStatus):BrokerDb{
  advisor(v);const l=db.listings.find(x=>x.id===id);need(l,'Listing not found.');
  if(status==='Live'){const p=publishProblems(l);need(!p.length,p.join(' '));}
  return {...db,listings:db.listings.map(x=>x===l?{...l,status,publishedAt:status==='Live'&&!l.publishedAt?now():l.publishedAt,updatedAt:now()}:x)};
}

export function registerBuyer(db:BrokerDb,email:string,input:Omit<Buyer,'id'|'email'|'status'|'advisorNote'|'saved'|'alerts'|'createdAt'>&{alerts?:boolean}):BrokerDb{
  const e=clean(email,254).toLowerCase();need(emailOk(e),'Sign in first.');
  const name=clean(input.name,120);need(name.length>=2,'Enter your full name.');
  need(buyerTypes.includes(input.type),'Choose what kind of buyer you are.');need(fundBands.includes(input.funds),'Choose your available funds.');
  need(clean(input.experience,1500).length>=30,'Tell us briefly about your background (at least 30 characters).');
  const old=db.buyers.find(b=>b.email===e);
  const b:Buyer={id:old?.id||uid(),email:e,name,phone:clean(input.phone,40),type:input.type,company:clean(input.company,160),funds:input.funds,financing:input.financing.map(f=>clean(f,40)).slice(0,5),experience:clean(input.experience,1500),regions:input.regions.filter(r=>regions.includes(r)),maxPrice:Math.max(0,Number(input.maxPrice)||0),status:old?.status||'Registered',advisorNote:old?.advisorNote||'',saved:old?.saved||[],alerts:input.alerts??old?.alerts??true,createdAt:old?.createdAt||now()};
  return {...db,buyers:old?db.buyers.map(x=>x===old?b:x):[...db.buyers,b]};
}
export const buyerOf=(db:BrokerDb,v:Viewer)=>v.kind==='buyer'?db.buyers.find(b=>b.email===v.email):undefined;
export function toggleSaved(db:BrokerDb,v:Viewer,listingId:string):BrokerDb{const b=buyerOf(db,v);need(b,'Create a buyer profile to save listings.');return {...db,buyers:db.buyers.map(x=>x===b?{...b,saved:b.saved.includes(listingId)?b.saved.filter(i=>i!==listingId):[...b.saved,listingId]}:x)};}
export function checkBuyer(db:BrokerDb,v:Viewer,buyerId:string,funds:FundsCheck,note:string):BrokerDb{advisor(v);if(!fundsChecks.includes(funds))throw Error('Choose a verification status.');if(!db.buyers.some(b=>b.id===buyerId))throw Error('Buyer not found.');const c:BuyerCheck={buyerId,funds,note:clean(note,2000),checkedAt:new Date().toISOString(),checkedBy:v.kind==='advisor'?v.name:''};return {...db,checks:[...(db.checks||[]).filter(x=>x.buyerId!==buyerId),c]};}
export function vetBuyer(db:BrokerDb,v:Viewer,id:string,status:Buyer['status'],note:string):BrokerDb{advisor(v);return {...db,buyers:db.buyers.map(b=>b.id===id?{...b,status,advisorNote:clean(note,2000)}:b)};}

export function requestAccess(db:BrokerDb,v:Viewer,listingId:string,signedName:string,agreed:boolean,message:string,textHash:string):BrokerDb{
  const b=buyerOf(db,v);need(b,'Create a buyer profile before requesting details.');need(b.status!=='Restricted','Your account cannot request new listings. Contact Kalling.');
  const l=db.listings.find(x=>x.id===listingId);need(l&&['Live','Under LOI'].includes(l.status),'This listing is not accepting new requests.');
  need(agreed,'Agree to the confidentiality terms to continue.');
  need(clean(signedName,120).toLowerCase()===b.name.toLowerCase(),'Type your full name exactly as it appears on your profile: '+b.name+'.');
  need(/^[0-9a-f]{64}$/.test(textHash),'Agreement text missing.');
  const open=db.access.find(a=>a.listingId===listingId&&a.buyerId===b.id&&['Pending','Approved'].includes(a.status));if(open)return db;
  return {...db,access:[...db.access,{id:uid(),listingId,buyerId:b.id,status:'Pending',nda:{version:ndaVersion,textHash,signedName:b.name,signedAt:now()},message:clean(message,1500),decisionNote:'',createdAt:now()}]};
}
export function decideAccess(db:BrokerDb,v:Viewer,id:string,status:'Approved'|'Declined',note:string):BrokerDb{advisor(v);const a=db.access.find(x=>x.id===id);need(a,'Request not found.');return {...db,access:db.access.map(x=>x===a?{...a,status,decisionNote:clean(note,1000),decidedAt:now()}:x)};}
function approved(db:BrokerDb,v:Viewer,listingId:string){const b=buyerOf(db,v);need(b&&b.status!=='Restricted','Sign in as an approved buyer.');need(db.access.some(a=>a.listingId===listingId&&a.buyerId===b.id&&a.status==='Approved'),'Sign the NDA and wait for approval before asking questions or making an offer.');return b;}
export function askQuestion(db:BrokerDb,v:Viewer,listingId:string,body:string,buyerId?:string):BrokerDb{
  const text=clean(body,3000);need(text.length>=2,'Write your question.');
  if(v.kind==='advisor'){advisor(v);need(buyerId,'Choose the buyer.');return {...db,questions:[...db.questions,{id:uid(),listingId,buyerId,side:'advisor',author:v.name,body:text,createdAt:now()}]};}
  const b=approved(db,v,listingId);return {...db,questions:[...db.questions,{id:uid(),listingId,buyerId:b.id,side:'buyer',author:b.name,body:text,createdAt:now()}]};
}
export function submitOffer(db:BrokerDb,v:Viewer,listingId:string,o:Pick<Offer,'kind'|'price'|'cashAtClose'|'sellerNote'|'earnout'|'financing'|'closeDays'|'conditions'>):BrokerDb{
  const b=approved(db,v,listingId);const l=db.listings.find(x=>x.id===listingId)!;need(['Live','Under LOI'].includes(l.status),'This listing is not accepting offers.');
  need(o.price>0,'Enter an offer price.');need(Math.abs(o.cashAtClose+o.sellerNote+o.earnout-o.price)<=1,'Cash at close, seller note and earnout should add up to the offer price.');
  need(o.closeDays>=14&&o.closeDays<=365,'Choose a closing timeline between 14 and 365 days.');
  return {...db,offers:[...db.offers,{id:uid(),listingId,buyerId:b.id,kind:o.kind,price:o.price,cashAtClose:o.cashAtClose,sellerNote:o.sellerNote,earnout:o.earnout,financing:clean(o.financing,200),closeDays:o.closeDays,conditions:clean(o.conditions,2000),status:'Submitted',advisorNote:'',createdAt:now(),updatedAt:now()}]};
}
export function updateOffer(db:BrokerDb,v:Viewer,id:string,status:Offer['status'],note:string):BrokerDb{
  const o=db.offers.find(x=>x.id===id);need(o,'Offer not found.');
  if(v.kind==='buyer'){const b=buyerOf(db,v);need(b?.id===o.buyerId&&status==='Withdrawn'&&!['Accepted','Declined'].includes(o.status),'You can only withdraw your own open offer.');}else advisor(v);
  let next={...db,offers:db.offers.map(x=>x===o?{...o,status,advisorNote:v.kind==='advisor'?clean(note,1500):o.advisorNote,updatedAt:now()}:x)};
  if(status==='Accepted'&&o.kind==='Letter of intent')next={...next,listings:next.listings.map(l=>l.id===o.listingId&&l.status==='Live'?{...l,status:'Under LOI' as const,updatedAt:now()}:l)};
  return next;
}
/** Buyers see only their own activity; advisors see everything. */
export function buyerActivity(db:BrokerDb,v:Viewer){const b=buyerOf(db,v);if(!b)return null;return {buyer:b,access:db.access.filter(a=>a.buyerId===b.id),offers:db.offers.filter(o=>o.buyerId===b.id),questions:db.questions.filter(q=>q.buyerId===b.id)};}
/** Anonymous label used when an approved buyer appears in the owner's portal. */
export const anonymousBuyerLabel=(db:BrokerDb,b:Buyer,listingId:string)=>{const n=db.access.filter(a=>a.listingId===listingId&&a.status==='Approved').findIndex(a=>a.buyerId===b.id)+1;return `Buyer ${n||"?"}, ${b.type.toLowerCase()}`;};
export function matchesBuyBox(b:Buyer,l:Listing){return (!b.regions.length||b.regions.includes(l.region))&&(!b.maxPrice||l.askingPrice<=b.maxPrice*1.1);}
