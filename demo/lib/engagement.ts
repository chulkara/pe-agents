// From a qualified seller to a signed engagement: the first-call checklist, the engagement letter
// and the HVAC document requests that open once both sides have signed.
import type {Company,Workspace} from './domain.ts';
import type {Region} from './brokerage.ts';
import {regionState} from './brokerage.ts';
import type {RequestInput} from './portalStore.ts';
import {setStage,dealStage,type DealCompany} from './deals.ts';

const now=()=>new Date().toISOString();
function need(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
const clean=(s:unknown,max:number)=>String(s??'').trim().replace(/\s+/g,' ').slice(0,max);

// ── Qualification ───────────────────────────────────────────────────────────────────────────
export const notFitReasons=['Not HVAC or refrigeration','Outside New Jersey and New York','Too small to sell through a broker','Owner is not ready to sell','Owner is not the decision maker','Books are not in order','Other'] as const;
export type NotFitReason=typeof notFitReasons[number];
export const licenseHolders=['Owner only','Owner and an employee','An employee','Not sure yet'] as const;
export type Qualification={
  hvac:boolean;njny:boolean;inRange:boolean;
  decisionMaker:boolean;partners:string;reason:string;timing:string;
  license:typeof licenseHolders[number];
  bookkeeper:boolean;threeYearsReturns:boolean;
  notes:string;outcome:'Qualified'|'Not a fit';notFit?:NotFitReason;by:string;at:string};
export type QualificationInput=Omit<Qualification,'outcome'|'notFit'|'by'|'at'>;
export type EngagedCompany=DealCompany&{qualification?:Qualification};

/** What is still missing before an advisor can call a seller qualified. */
export function qualificationGaps(q:Partial<QualificationInput>):string[]{
  const g:string[]=[];
  if(!q.hvac)g.push('Confirm the business does HVAC or refrigeration work.');
  if(!q.njny)g.push('Confirm it operates in New Jersey or New York.');
  if(!q.decisionMaker)g.push('Confirm you are speaking with the decision maker.');
  if(clean(q.reason,400).length<3)g.push('Note why the owner wants to sell.');
  if(clean(q.timing,120).length<2)g.push('Note when the owner wants to sell.');
  return g;
}
export function qualify(w:Workspace,companyId:string,q:QualificationInput,actor:string):Workspace{
  const c=w.companies.find(x=>x.id===companyId);need(c,'Company not found.');
  const gaps=qualificationGaps(q);need(!gaps.length,gaps.join(' '));
  const qualification:Qualification={...q,partners:clean(q.partners,200),reason:clean(q.reason,400),timing:clean(q.timing,120),notes:clean(q.notes,2000),outcome:'Qualified',by:actor,at:now()};
  const withQ={...w,companies:w.companies.map(x=>x.id===companyId?{...x,qualification} as EngagedCompany:x)};
  const stage=dealStage(c);
  return stage==='Qualified'?withQ:setStage(withQ,companyId,'Qualified',actor);
}
export function markNotFit(w:Workspace,companyId:string,reason:NotFitReason,note:string,actor:string,q?:Partial<QualificationInput>):Workspace{
  const c=w.companies.find(x=>x.id===companyId);need(c,'Company not found.');
  need(notFitReasons.includes(reason),'Choose why this seller is not a fit.');need(clean(note,1000).length>=3,'Add a short note about why.');
  const qualification={...(q||{}),hvac:!!q?.hvac,njny:!!q?.njny,inRange:!!q?.inRange,decisionMaker:!!q?.decisionMaker,partners:clean(q?.partners,200),reason:clean(q?.reason,400),timing:clean(q?.timing,120),license:q?.license||'Not sure yet',bookkeeper:!!q?.bookkeeper,threeYearsReturns:!!q?.threeYearsReturns,notes:clean(note,1000),outcome:'Not a fit',notFit:reason,by:actor,at:now()} satisfies Qualification;
  const withQ={...w,companies:w.companies.map(x=>x.id===companyId?{...x,qualification} as EngagedCompany:x)};
  return dealStage(c)==='Lost'?withQ:setStage(withQ,companyId,'Lost',actor);
}

// ── Engagement letter ───────────────────────────────────────────────────────────────────────
export const LETTER_TEMPLATE_VERSION='kalling-engagement-2026-11-v1';
export type LetterTerms={successFeePct:number|null;successFeeMin:number|null;feeBasis:string;retainer:'none'|number|null;exclusivityMonths:number|null;tailMonths:number|null;terminationDays:number|null;expenses:string};
export type LetterInput={ownerName:string;ownerTitle:string;legalName:string;state:'NJ'|'NY'|'';advisorName:string;advisorEmail:string;firmName:string;firmAddress:string;effectiveDate:string;terms:LetterTerms};
export const emptyTerms=():LetterTerms=>({successFeePct:null,successFeeMin:null,feeBasis:'',retainer:null,exclusivityMonths:null,tailMonths:null,terminationDays:null,expenses:''});
export const feeBases=['The total purchase price, including cash at close, seller notes and earned earnouts','Cash and notes at close only; earnouts when paid'];

export function letterDefaults(c:Company,o:{advisorName:string;advisorEmail:string;firmName:string;firmAddress:string;today?:string}):LetterInput{
  const d=c as DealCompany;const state=(c.state==='NJ'||c.state==='NY'?c.state:d.region?regionState(d.region):'') as LetterInput['state'];
  return {ownerName:c.owner,ownerTitle:'Owner',legalName:c.name,state,advisorName:o.advisorName,advisorEmail:o.advisorEmail,firmName:o.firmName,firmAddress:o.firmAddress,effectiveDate:(o.today||now()).slice(0,10),terms:emptyTerms()};
}
/** Every blank that stops a letter from going to the owner. There are no default fees. */
export function letterProblems(i:LetterInput):string[]{
  const p:string[]=[],t=i.terms;
  if(clean(i.ownerName,120).split(' ').length<2)p.push('Enter the owner’s full legal name.');
  if(clean(i.ownerTitle,80).length<2)p.push('Enter the owner’s title.');
  if(clean(i.legalName,160).length<2)p.push('Enter the legal name of the business.');
  if(i.state!=='NJ'&&i.state!=='NY')p.push('Choose New Jersey or New York.');
  if(clean(i.advisorName,120).length<2)p.push('Enter the advisor’s name.');
  if(clean(i.firmName,160).length<2)p.push('Enter the firm name.');
  if(clean(i.firmAddress,300).length<8)p.push('Enter the firm’s address in Firm settings.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(i.effectiveDate))p.push('Choose the effective date.');
  if(t.successFeePct===null||!(t.successFeePct>0&&t.successFeePct<=20))p.push('Enter the success fee percentage.');
  if(t.successFeeMin===null||!(t.successFeeMin>=0))p.push('Enter the minimum success fee, or 0 for none.');
  if(!clean(t.feeBasis,300))p.push('Choose how the success fee is calculated.');
  if(t.retainer===null||(typeof t.retainer==='number'&&!(t.retainer>0)))p.push('Choose no retainer or enter the retainer amount.');
  if(t.exclusivityMonths===null||!(t.exclusivityMonths>=1&&t.exclusivityMonths<=24))p.push('Enter the exclusivity term in months.');
  if(t.tailMonths===null||!(t.tailMonths>=0&&t.tailMonths<=36))p.push('Enter the tail period in months.');
  if(t.terminationDays===null||!(t.terminationDays>=0&&t.terminationDays<=90))p.push('Enter the termination notice in days.');
  if(clean(t.expenses,600).length<3)p.push('Say how expenses are handled.');
  return p;
}
const usd=(n:number)=>'$'+Math.round(n).toLocaleString('en-US');
const longDate=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
/** The exact text both sides sign. Same input, same text, same hash. */
export function renderLetter(i:LetterInput):string{
  const p=letterProblems(i);need(!p.length,p[0]);const t=i.terms,stateName=i.state==='NJ'?'New Jersey':'New York';
  const retainer=t.retainer==='none'?'There is no retainer.':`The Owner will pay a retainer of ${usd(t.retainer as number)} when this letter is signed. It is credited against the success fee.`;
  const minimum=t.successFeeMin?`, with a minimum of ${usd(t.successFeeMin)}`:'';
  return [
`ENGAGEMENT LETTER`,
`Template ${LETTER_TEMPLATE_VERSION}`,
``,
`Effective date: ${longDate(i.effectiveDate)}`,
``,
`Between ${i.firmName}, ${clean(i.firmAddress,300)} ("Kalling"), and ${clean(i.ownerName,120)}, ${clean(i.ownerTitle,80)} of ${clean(i.legalName,160)} (the "Owner" and the "Business").`,
``,
`1. Services`,
`Kalling will represent the Owner in the sale of the Business. Kalling will value the Business, prepare an anonymous listing and a confidential information memorandum, find and screen buyers, require each buyer to sign a confidentiality agreement before receiving confidential information, share offers with the Owner, and support negotiations through closing. ${clean(i.advisorName,120)} (${clean(i.advisorEmail,254)}) is the Owner's advisor. The Owner decides whether to accept any offer.`,
``,
`2. Exclusivity`,
`For ${t.exclusivityMonths} months from the effective date, the Owner will not engage another broker or intermediary to sell the Business. The Owner will refer buyers who contact the Owner directly to Kalling.`,
``,
`3. Fees`,
`If the Business is sold, the Owner will pay Kalling a success fee of ${t.successFeePct}% of ${t.feeBasis.charAt(0).toLowerCase()+t.feeBasis.slice(1)}${minimum}. The fee is due at closing. ${retainer} Expenses: ${clean(t.expenses,600)}`,
``,
`4. Confidentiality`,
`Kalling will keep the Owner's information confidential and will share it only with buyers who have signed a confidentiality agreement and whom Kalling has approved, and only the documents the Owner has approved for sharing.`,
``,
`5. How Kalling uses AI`,
`Kalling uses AI software to draft materials such as the earnings recast, the listing and the memorandum. People at Kalling review every draft before it is used. The Owner's documents are processed on Kalling's own computer and are not sent to outside AI services.`,
``,
`6. The Owner's responsibilities`,
`The Owner will provide accurate and complete information and will tell Kalling promptly about material changes to the Business. Kalling relies on the Owner's information and does not audit it.`,
``,
`7. No guarantee`,
`Kalling does not guarantee that the Business will sell, or that it will sell at any particular price or on any particular terms.`,
``,
`8. Term and termination`,
`Either party may end this engagement with ${t.terminationDays} days' written notice. If the Business is sold within ${t.tailMonths} months after the engagement ends to a buyer that Kalling introduced or that contacted Kalling during the engagement, the success fee is still due.`,
``,
`9. Electronic signatures`,
`The parties agree to sign this letter electronically. An electronic signature has the same effect as a handwritten signature.`,
``,
`10. Governing law`,
`This letter is governed by the laws of the State of ${stateName}.`,
``,
`Signed by the Owner: ${clean(i.ownerName,120)}, ${clean(i.ownerTitle,80)}, ${clean(i.legalName,160)}`,
`Signed for Kalling: ${clean(i.advisorName,120)}, ${i.firmName}`,
].join('\n');
}
export async function letterHash(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
/** A typed signature must match the name on the letter, ignoring case and extra spaces. */
export const sameName=(typed:string,expected:string)=>clean(typed,160).toLowerCase()===clean(expected,160).toLowerCase()&&clean(expected,160).length>=2;

// ── Prefilled HVAC requests ─────────────────────────────────────────────────────────────────
/** The last three full calendar years before today. */
export function lastFullYears(today:string|Date,n=3){const y=new Date(today).getUTCFullYear()-1;return Array.from({length:n},(_,i)=>y-n+1+i);}
/** Add business days, skipping Saturdays and Sundays. Public holidays are not skipped. */
export function addBusinessDays(from:string|Date,days:number){const d=new Date(from);d.setUTCHours(12,0,0,0);let left=days;while(left>0){d.setUTCDate(d.getUTCDate()+1);const w=d.getUTCDay();if(w!==0&&w!==6)left--;}return d.toISOString().slice(0,10);}
const joinYears=(y:number[])=>y.length>1?y.slice(0,-1).join(', ')+' and '+y[y.length-1]:String(y[0]);
export function licenseWording(region:Region|''|undefined){
  switch(region){
    case 'New York City':return 'Any New York City licenses and certificates your work needs, for example FDNY certificates of fitness for refrigeration systems, and your NYC business registrations.';
    case 'Long Island':return 'Your Nassau or Suffolk County HVAC and home improvement licenses, and your New York business registrations.';
    case 'Westchester & Rockland':return 'Your Westchester or Rockland County home improvement or trade licenses, and your New York business registrations.';
    case 'Hudson Valley':return 'Any county or town contractor licenses you hold, and your New York business registrations.';
    case 'North Jersey':case 'Central Jersey':case 'South Jersey':case 'Jersey Shore':return 'Your New Jersey Master HVACR contractor license, the name of the licensee of record, and your New Jersey business registrations.';
    default:return 'Your HVAC or refrigeration contractor licenses and your business registrations.';
  }
}
export const dataRoomSharing='Kalling advisors see this now. Buyers see it only if you approve sharing it in the data room.';
export type RequestTemplate={key:string;round:'First round'|'Second round';title:string;needed:string;why:string;guidance?:string};
export function hvacRequestTemplates(o:{today:string|Date;region?:Region|''}):RequestTemplate[]{
  const years=lastFullYears(o.today),last=years[years.length-1],thisYear=last+1;
  return [
    {key:'pl',round:'First round',title:`Profit and loss statements for ${joinYears(years)}`,needed:`Annual profit and loss statements for ${joinYears(years)}. Statements from your accountant or exports from QuickBooks are both fine.`,why:'Buyers use these to understand revenue and earnings over time. They are the starting point for the valuation.',guidance:'A PDF export from your accounting software works best. Please include the full year, January to December.'},
    {key:'tax',round:'First round',title:`Business tax returns for ${joinYears(years)}`,needed:`The business tax returns filed for ${joinYears(years)}, with all pages and schedules.`,why:'Tax returns confirm the figures in the profit and loss statements. Lenders financing a purchase, including SBA lenders, require them.'},
    {key:'ytd',round:'First round',title:`Year-to-date financials for ${thisYear}`,needed:`A profit and loss statement for ${thisYear} to date, and the same months of ${last} if you have them.`,why:'Shows how the business is performing now. HVAC is seasonal, so the same months last year make the comparison fair.'},
    {key:'agreements',round:'First round',title:'Maintenance agreement list',needed:'A list or export of active maintenance agreements. The columns that help most are: plan name, price, renewal month, and whether it renews automatically. Replace customer names with numbers.',why:'Recurring maintenance revenue is one of the biggest drivers of value for an HVAC company. Buyers pay more for agreements that renew.',guidance:'An export from ServiceTitan, Housecall Pro or your dispatch software is fine as a CSV or spreadsheet.'},
    {key:'licenses',round:'First round',title:'Licenses and insurance',needed:licenseWording(o.region)+' Also certificates for liability, vehicle and workers’ compensation insurance.',why:'Buyers need to know who holds the license and how it will transfer. This shapes how long you may stay on after the sale.'},
    {key:'team',round:'First round',title:'Team overview',needed:'A list of roles, start dates, pay ranges and certifications such as EPA 608 or NATE. Please leave out Social Security numbers, home addresses and dates of birth.',why:'Technicians are what buyers worry about most. This helps a buyer plan to keep the team in place.'},
    {key:'customers',round:'Second round',title:'Customer concentration',needed:`Your ten largest customers by revenue for ${last}, with each one's share of revenue. Use Customer A, Customer B and so on.`,why:'Buyers want to know whether the business depends on a few customers.'},
    {key:'mix',round:'Second round',title:'Revenue mix',needed:`Revenue for ${last} split into service and repair, replacement, maintenance agreements, commercial work and new construction.`,why:'Buyers value service and maintenance work more than new construction.'},
    {key:'equipment',round:'Second round',title:'Vehicles and equipment',needed:'A list of vans, trucks and major equipment with approximate age and whether each is owned or leased.',why:'Clarifies which assets are included in a sale and what may need replacing soon.'},
    {key:'lease',round:'Second round',title:'Lease or property documents',needed:'Your current lease, or deed if you own the property, with any amendments and renewal options.',why:'Confirms the business can stay at its location after a sale and on what terms.'},
    {key:'payroll',round:'Second round',title:'Payroll summary',needed:`A payroll summary for ${last} by role, with overtime and bonuses. Leave out Social Security numbers.`,why:'Lets a buyer see the true cost of the team and plan pay after the sale.'},
    {key:'lossruns',round:'Second round',title:'Insurance loss runs',needed:'Loss runs from your insurers for the last five years. Your agent can send these.',why:'Shows the claims history, which affects what a buyer will pay for insurance.'},
    {key:'vendors',round:'Second round',title:'Vendor and supplier agreements',needed:'Agreements with equipment distributors and suppliers, including any dealer programs, rebates or minimum purchase terms.',why:'Dealer status and supplier pricing often matter to a buyer and may need consent to transfer.'},
    {key:'warranty',round:'Second round',title:'Warranty obligations',needed:'How you handle labor warranties on installs, and any open warranty or callback obligations.',why:'A buyer takes on these promises, so they need to know their size.'},
  ];
}
/** The first-round requests, ready to save in the owner portal. */
export function prefilledRequests(o:{today:string|Date;region?:Region|'';contact:{name:string;email:string;phone?:string}}):RequestInput[]{
  const due=addBusinessDays(o.today,10);
  return hvacRequestTemplates(o).filter(t=>t.round==='First round').map(t=>({title:t.title,needed:t.guidance?t.needed+' '+t.guidance:t.needed,why:t.why,sharing:dataRoomSharing,contact:o.contact,due}));
}
export const afterSigningSteps=(advisor:string)=>[
  {text:'Upload the first documents. Start with whatever is easiest.',owner:'You' as const,due:'',done:false},
  {text:`${advisor} reviews your documents and prepares the earnings recast.`,owner:'Firm' as const,due:'',done:false},
  {text:'Review the anonymous listing and the memorandum before anything is shared.',owner:'You' as const,due:'',done:false},
];
