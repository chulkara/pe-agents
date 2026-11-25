// The owner's sale-ready page: what the business is worth today, what is dragging the price,
// and how ready a sale is. Every figure comes from the same estimate the advisor uses
// (hvacValuation.ts). A price drag's dollar figure is the change in the middle of that estimate
// if one stated assumption were true, worked out by code, never by a model.
import {estimateHvacValue,type HvacInputs,type Valuation} from './hvacValuation.ts';

export type SaleReadyBasis={label:string;amount:number;source?:string};
export type SaleReadyInput={
  businessName:string;
  inputs:HvacInputs;              // addBacks here is ignored; the itemised list below is used
  addBacks:{item:string;amount:number;evidence:string}[];
  basisSources?:Partial<Record<'revenue'|'netProfit'|'ownerPay',string>>; // e.g. "pl-2025.pdf, page 1"
  requests:{title:string;status:string}[];
  asOf:string;                     // ISO date the advisor prepared it
  buyerFit?:BuyerFit;              // counts only, never names; see lib/matching.ts
};
/** How many buyers in the directory fit, by type. `basis` says whether it was matched on the live
 *  listing or, before listing, on the estimated value. */
export type BuyerFit={total:number;strong:number;byType:Record<string,number>;basis:'listing'|'estimate'};
export type PriceDrag={key:string;title:string;why:string;fix:string;assumption:string;gainMid:number};
export type SaleReadyReport={valuation:Valuation;basis:SaleReadyBasis[];drags:PriceDrag[];readiness:{done:number;total:number;pct:number;missing:string[]}};

const total=(xs:{amount:number}[])=>xs.reduce((n,x)=>n+(Number.isFinite(x.amount)?Math.max(0,x.amount):0),0);
const documented=(a:{evidence:string})=>String(a.evidence||'').trim().length>=3;

export function saleReadyReport(i:SaleReadyInput):SaleReadyReport{
  const base:HvacInputs={...i.inputs,addBacks:total(i.addBacks)};
  const valuation=estimateHvacValue(base);
  const gain=(patch:Partial<HvacInputs>)=>{try{return estimateHvacValue({...base,...patch}).mid-valuation.mid;}catch{return 0;}};
  const drags:PriceDrag[]=[];
  const push=(d:Omit<PriceDrag,'gainMid'>,g:number)=>{if(g>0)drags.push({...d,gainMid:g});};

  if(base.licenseHolder==='owner-only')push({key:'license',title:'The master HVACR license is only in your name',why:'A buyer needs a licensed representative for the business after the sale. If that is only you, they have to plan around it.',fix:'Support a senior technician through the master HVACR license, or bring in a licensed manager.',assumption:'If a second licensed master HVACR contractor joined the team'},gain({licenseHolder:'owner-and-employee'}));
  if(base.ownerRole==='runs-everything')push({key:'owner',title:'The business depends on you day to day',why:'When the owner does sales, dispatch and the hardest jobs, a buyer has to replace all of it.',fix:'Write down dispatch, pricing and supplier relationships, and promote a lead technician or office manager.',assumption:'If a lead technician or office manager took over daily operations'},gain({ownerRole:'key-relationships'}));
  else if(base.ownerRole==='key-relationships')push({key:'owner',title:'Some customers rely on you personally',why:'Buyers worry that customers who know you will leave when you do.',fix:'Introduce your manager or lead technician to your biggest customers and suppliers now.',assumption:'If a manager ran the business day to day'},gain({ownerRole:'manager-runs-day-to-day'}));
  if(base.topCustomerPct>=15)push({key:'customer',title:`One customer is ${Math.round(base.topCustomerPct)}% of revenue`,why:'If that customer leaves, a buyer loses a large share of revenue at once.',fix:'Win more customers of the same kind so no single one is above 15% of revenue.',assumption:'If your largest customer fell below 15% of revenue'},gain({topCustomerPct:14}));
  if(base.maintenancePct<40)push({key:'recurring',title:'Most revenue is one-off work',why:'Buyers pay more for predictable service and maintenance revenue than for installs.',fix:'Turn repeat customers into annual maintenance agreements and track renewals.',assumption:'If 40% of revenue came from service and maintenance'},gain({maintenancePct:40}));
  if(base.agreements<300)push({key:'agreements',title:base.agreements?`Only ${base.agreements.toLocaleString('en-US')} active maintenance agreements`:'No active maintenance agreements',why:'Agreements give a new owner scheduled visits and future replacement jobs.',fix:'Offer an annual maintenance plan on every service call.',assumption:base.agreements?'If you doubled your active agreements':'If you had 100 active agreements'},gain({agreements:base.agreements?base.agreements*2:100}));
  if(base.newConstructionPct>=15)push({key:'builders',title:`${Math.round(base.newConstructionPct)}% of revenue is builder work`,why:'New-construction work depends on a few contractors and the housing cycle.',fix:'Grow service and replacement work so builder work is a smaller share.',assumption:'If builder work were 10 points less of revenue'},gain({newConstructionPct:Math.max(0,base.newConstructionPct-10)}));
  if(base.technicians<=3)push({key:'technicians',title:`${base.technicians} field technician${base.technicians===1?'':'s'}`,why:'With a small team, one departure removes a large share of capacity.',fix:'Hire or train one more field technician.',assumption:'With one more field technician'},gain({technicians:base.technicians+1}));
  const undoc=i.addBacks.filter(a=>!documented(a)&&a.amount>0);
  if(undoc.length){const amount=total(undoc);push({key:'addbacks',title:`$${Math.round(amount).toLocaleString('en-US')} of add-backs have no paperwork`,why:'Buyers and lenders only count add-backs they can see in the books or tax returns.',fix:'Keep a statement, invoice or receipt for each add-back.',assumption:'Value that is at risk if buyers exclude the undocumented add-backs'},valuation.mid-(()=>{try{return estimateHvacValue({...base,addBacks:base.addBacks-amount}).mid;}catch{return valuation.mid;}})());}
  drags.sort((a,b)=>b.gainMid-a.gainMid);

  const s=i.basisSources||{};
  const basis:SaleReadyBasis[]=[
    {label:'Revenue, last full year',amount:base.revenue,source:s.revenue},
    {label:'Net profit',amount:base.netProfit,source:s.netProfit},
    {label:'Owner pay and benefits',amount:base.ownerPay,source:s.ownerPay},
    {label:'Add-backs',amount:base.addBacks,source:i.addBacks.length?`${i.addBacks.length} item${i.addBacks.length===1?'':'s'}, ${i.addBacks.filter(documented).length} documented`:undefined},
  ];
  const done=i.requests.filter(r=>r.status==='Accepted'||r.status==='Not applicable');
  const readiness={done:done.length,total:i.requests.length,pct:i.requests.length?Math.round(done.length/i.requests.length*100):0,missing:i.requests.filter(r=>!done.includes(r)).map(r=>r.title)};
  return {valuation,basis,drags,readiness};
}

const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(2).replace(/\.?0+$/,'')+'M':'$'+Math.round(n/1000).toLocaleString('en-US')+'K';

/** A first draft of the monthly note. The advisor edits it before the owner sees it. */
export function draftNote(r:SaleReadyReport,ownerFirstName:string,previous?:SaleReadyReport,buyersWhoFit?:number):string{
  const v=r.valuation,lines=[`${ownerFirstName}, here is where the business stands this month.`];
  lines.push(`Our estimate of its value is ${money(v.low)} to ${money(v.high)}.`+(previous?` That is ${v.mid>=previous.valuation.mid?'up':'down'} ${money(Math.abs(v.mid-previous.valuation.mid))} from last time.`:''));
  const top=r.drags[0];
  if(top)lines.push(`The biggest thing you can work on: ${top.fix.charAt(0).toLowerCase()+top.fix.slice(1)} By our estimate that is worth about ${money(top.gainMid)}.`);
  if(r.readiness.total)lines.push(r.readiness.done===r.readiness.total?'All your records are in, so a sale could start quickly.':`${r.readiness.done} of ${r.readiness.total} records are in. Next up: ${r.readiness.missing[0]}.`);
  if(buyersWhoFit&&buyersWhoFit>0)lines.push(buyersWhoFit===1?'One buyer in our directory already fits the business.':`${buyersWhoFit} buyers in our directory already fit the business.`);
  lines.push('This is an estimate to plan with, not an appraisal or an offer.');
  return lines.join(' ');
}
