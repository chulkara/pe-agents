// Sell-side deal logic for the advisor workspace: stages, engagement, recast and offer comparison.
import type {Company,Workspace} from './domain.ts';
import {estimateHvacValue,sellerDiscretionaryEarnings,type HvacInputs,type Valuation} from './hvacValuation.ts';
import {regionState,type Lead,type Listing,type Offer,type Region} from './brokerage.ts';
import {requestTemplates,type Portal} from './portal.ts';

export const sellStages=['Lead','Qualified','Engaged','Preparing','Listed','Under LOI','Closed','Lost'] as const;
export type SellStage=typeof sellStages[number];
export type AddBack={id:string;item:string;amount:number;reason:string;evidence:string};
export type Recast={inputs:HvacInputs;addBacks:AddBack[];askingPrice:number;updatedAt:string;updatedBy:string};
export type DealFields={sellStage?:SellStage;stageChangedAt?:string;recast?:Recast;leadId?:string;region?:Region};
export type DealCompany=Company&DealFields;

const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
function need(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
const asDeal=(c:Company)=>c as DealCompany;

/** Stage for a company. A stored stage wins; older records are mapped from what already exists. */
export function dealStage(c:Company,ctx:{listing?:Pick<Listing,'status'>;portal?:Pick<Portal,'status'>}={}):SellStage{
  const d=asDeal(c);
  if(d.sellStage&&sellStages.includes(d.sellStage))return d.sellStage;
  const l=ctx.listing?.status;
  if(l==='Sold')return 'Closed';if(l==='Under LOI')return 'Under LOI';if(l==='Live')return 'Listed';if(l==='Draft')return 'Preparing';
  if(ctx.portal&&ctx.portal.status!=='Closed')return 'Engaged';
  if(c.status==='Passed')return 'Lost';
  if(c.status==='Interested')return 'Qualified';
  return 'Lead';
}
export function canMove(from:SellStage,to:SellStage){
  if(from===to)return false;
  if(from==='Closed'||from==='Lost')return to==='Qualified';
  return true;
}
export function setStage(w:Workspace,companyId:string,to:SellStage,actor:string,ctx:Parameters<typeof dealStage>[1]={}):Workspace{
  const c=w.companies.find(x=>x.id===companyId);need(c,'Company not found.');
  need(sellStages.includes(to),'Unknown stage.');
  const from=dealStage(c,ctx);need(canMove(from,to),from==='Closed'||from==='Lost'?`Reopen ${c.name} as Qualified first.`:`${c.name} is already ${to}.`);
  const next={...c,sellStage:to,stageChangedAt:now()} as DealCompany;
  return {...w,companies:w.companies.map(x=>x.id===companyId?next:x),events:[{id:uid(),text:`${actor} moved ${c.name} from ${from} to ${to}.`,date:now()},...w.events]};
}
export const daysInStage=(c:Company,today=Date.now())=>{const t=asDeal(c).stageChangedAt;return t?Math.max(0,Math.floor((today-Date.parse(t))/864e5)):null;};

/** Plain next steps the advisor sees for each stage. */
export const stageChecklist:Record<SellStage,string[]>={
  'Lead':['Call the owner and confirm they are thinking about selling','Note revenue, earnings and timing','Qualify or mark as lost'],
  'Qualified':['Run the valuation with the owner’s numbers','Explain the process and the success fee in writing','Send the engagement letter'],
  'Engaged':['Invite the owner to their portal','Request the standard documents','Agree on the asking price'],
  'Preparing':['Finish the recast and add-backs','Draft the anonymous listing and pass the anonymity check','Prepare the confidential memorandum'],
  'Listed':['Review NDA requests within one business day','Answer buyer questions','Share serious offers with the owner'],
  'Under LOI':['Open the diligence checklist','Coordinate the lender and license transition','Track the closing date'],
  'Closed':['Mark the listing sold','Ask the owner about a short case study','Record the final price for comparables'],
  'Lost':['Record why the deal stopped','Set a reminder to check back'],
};
export const primaryAction:Record<SellStage,{label:string;tab:string}>={
  'Lead':{label:'Qualify this seller',tab:'Overview'},'Qualified':{label:'Run the valuation',tab:'Valuation and recast'},
  'Engaged':{label:'Request documents',tab:'Documents'},'Preparing':{label:'Publish listing',tab:'Listing'},
  'Listed':{label:'Review buyers',tab:'Buyers'},'Under LOI':{label:'Review offers',tab:'Offers'},
  'Closed':{label:'See the activity',tab:'Activity'},'Lost':{label:'See the activity',tab:'Activity'},
};

export const defaultInputs:HvacInputs={revenue:0,ownerPay:0,netProfit:0,addBacks:0,maintenancePct:40,agreements:0,commercialPct:15,newConstructionPct:5,technicians:4,ownerRole:'key-relationships',topCustomerPct:10,years:10,trend:'flat',licenseHolder:'owner-only'};
/** The add-backs table feeds SDE: the sum replaces the single add-backs input. */
export function recastInputs(r:Pick<Recast,'inputs'|'addBacks'>):HvacInputs{return {...r.inputs,addBacks:r.addBacks.reduce((n,a)=>n+(Number.isFinite(a.amount)?a.amount:0),0)};}
export function recastValuation(r:Pick<Recast,'inputs'|'addBacks'>):Valuation|null{try{return estimateHvacValue(recastInputs(r));}catch{return null;}}
export const recastSde=(r:Pick<Recast,'inputs'|'addBacks'>)=>sellerDiscretionaryEarnings(recastInputs(r));
export function saveRecast(w:Workspace,companyId:string,input:{inputs:HvacInputs;addBacks:(Partial<AddBack>&{item:string;amount:number;reason:string})[];askingPrice:number},actor:string):Workspace{
  const c=w.companies.find(x=>x.id===companyId);need(c,'Company not found.');
  const addBacks:AddBack[]=input.addBacks.map(a=>({id:a.id||uid(),item:String(a.item||'').trim().slice(0,120),amount:Math.round(Number(a.amount)||0),reason:String(a.reason||'').trim().slice(0,400),evidence:String(a.evidence||'').trim().slice(0,200)})).filter(a=>a.item.length>=2);
  for(const a of addBacks)need(a.reason.length>=5,`Explain why “${a.item}” is added back.`);
  const recast:Recast={inputs:{...input.inputs},addBacks,askingPrice:Math.max(0,Math.round(Number(input.askingPrice)||0)),updatedAt:now(),updatedBy:actor};
  return {...w,companies:w.companies.map(x=>x.id===companyId?{...x,recast} as DealCompany:x),events:[{id:uid(),text:`${actor} saved the recast for ${c.name}.`,date:now()},...w.events]};
}
/** Where the asking price sits against the estimate. */
export function askingVersusEstimate(asking:number,v:Pick<Valuation,'low'|'high'>|null){
  if(!v||!asking)return null;
  if(asking<v.low)return {position:'below' as const,text:'The asking price is below the estimated range. Buyers will move fast; check that nothing is missing from the recast.'};
  if(asking>v.high)return {position:'above' as const,text:'The asking price is above the estimated range. Expect buyers to ask for support for the add-backs or growth.'};
  return {position:'within' as const,text:'The asking price is inside the estimated range.'};
}

/** A lead from the public site becomes a workspace company at Engaged, prefilled from the valuation. */
export function startEngagement(w:Workspace,lead:Lead,actor:string):{workspace:Workspace;companyId:string}{
  need(!w.companies.some(c=>asDeal(c).leadId===lead.id),'This lead already has an engagement.');
  const id=uid(),sde=lead.valuation?.sde||0,revenue=lead.valuation?.revenue||0;
  const company={id,name:lead.businessName||`${lead.name.split(' ').slice(-1)[0]} HVAC (name to confirm)`,city:'',state:regionState(lead.region),industry:'HVAC',owner:lead.name,website:'',email:lead.email,phone:lead.phone,status:'Interested',nextAction:'Invite the owner to their portal',due:'',assignedTo:actor,sample:false,evidence:[],documents:[],conversations:lead.message?[{id:uid(),type:'Note',date:lead.createdAt.slice(0,10),body:'From the valuation form: '+lead.message,outcome:''}]:[],drafts:[],
    sellStage:'Engaged' as SellStage,stageChangedAt:now(),leadId:lead.id,region:lead.region,
    recast:{inputs:{...defaultInputs,revenue,netProfit:sde},addBacks:[],askingPrice:0,updatedAt:now(),updatedBy:actor}} as DealCompany;
  return {companyId:id,workspace:{...w,companies:[company,...w.companies],events:[{id:uid(),text:`${actor} started an engagement with ${lead.name}.`,date:now()},...w.events]}};
}

/** Offers side by side: open offers first, then by price. */
export function compareOffers<T extends Pick<Offer,'status'|'price'|'cashAtClose'|'createdAt'>>(offers:T[]){
  const rank=(s:Offer['status'])=>['Accepted','Shared with seller','Countered','Submitted','Declined','Withdrawn'].indexOf(s);
  return [...offers].sort((a,b)=>rank(a.status)-rank(b.status)||b.price-a.price||b.cashAtClose-a.cashAtClose||a.createdAt.localeCompare(b.createdAt));
}
export const cashShare=(o:Pick<Offer,'price'|'cashAtClose'>)=>o.price?Math.round(o.cashAtClose/o.price*100):0;

/** Who sees seller documents, in the words the owner reads. */
export const defaultSharing='Only Kalling advisors working on your sale. Buyers see these only after you approve them and they sign an NDA.';
/** Drafts the owner portal for a new engagement with the first six HVAC requests. Nothing is sent: the advisor invites the owner. */
export async function draftEngagementPortal(store:{create(i:{companyId:string;businessName:string;ownerName:string;ownerEmail:string;help:{name:string;email:string;phone?:string};welcome?:string}):Promise<string>;saveRequest(portalId:string,r:{title:string;needed:string;why:string;sharing:string;contact:{name:string;email:string;phone?:string};due:string}):Promise<void>},c:Company,help:{name:string;email:string;phone?:string},count=6){
  const id=await store.create({companyId:c.id,businessName:c.name,ownerName:c.owner,ownerEmail:c.email,help,welcome:`Thanks for working with us on the sale of ${c.name}. Everything we need from you is listed here, with why we need it and who will see it.`});
  for(const t of requestTemplates.slice(0,count))await store.saveRequest(id,{...t,sharing:defaultSharing,contact:help,due:''});
  return id;
}
