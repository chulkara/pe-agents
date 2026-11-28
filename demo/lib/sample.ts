// Seeds a fictional owner portal (Pat Russo, Russo Heating & Air) entirely in memory, through the same
// store calls an advisor and an owner make, so the one-tap sample shows the real product, not a mock-up.
import {localPortalStore,memoryBytes} from './portalStore.ts';
import type {SaleReadyInput} from './saleReady.ts';

export const OWNER={name:'Pat Russo',email:'pat@russohvac.test'},ADVISOR={name:'Karan',email:'karan@kalling.test'};
const due=(days:number)=>new Date(Date.now()+days*864e5).toISOString().slice(0,10);
export function memoryKV(){const m=new Map<string,string>();return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};}

export const sampleSaleReady=(requests:{title:string;status:string}[]):SaleReadyInput=>({
  businessName:'Russo Heating & Air',
  inputs:{revenue:2600000,ownerPay:168000,netProfit:243000,addBacks:0,maintenancePct:30,agreements:420,commercialPct:15,newConstructionPct:10,technicians:6,ownerRole:'runs-everything',topCustomerPct:9,years:19,trend:'growing',licenseHolder:'owner-only'},
  addBacks:[{item:'One-time legal settlement',amount:40000,evidence:'pl-2025.pdf, page 1'},{item:'Personal vehicle',amount:12000,evidence:''}],
  basisSources:{revenue:'pl-2025.pdf, page 1',netProfit:'pl-2025.pdf, page 1',ownerPay:'tax-return-2025.pdf, page 3'},
  requests,asOf:new Date().toISOString().slice(0,10),
  buyerFit:{total:9,strong:4,byType:{'Owner-operator':4,'Strategic HVAC operator':3,'Search fund':2},basis:'listing'},
});

/** Builds Pat Russo's fictional portal through the same store calls a real advisor and owner make. */
export async function seedSample(kv:ReturnType<typeof memoryKV>){
  const bytes=memoryBytes(),common={firmId:'sample',firmName:'Kalling',team:[ADVISOR.name],kv,bytes};
  const firm=localPortalStore({...common,actor:{side:'firm',name:ADVISOR.name,email:ADVISOR.email}});
  const owner=localPortalStore({...common,actor:{side:'seller',name:OWNER.name,email:OWNER.email}});
  const id=await firm.create({companyId:'sample-russo',businessName:'Russo Heating & Air',ownerName:OWNER.name,ownerEmail:OWNER.email,help:{name:ADVISOR.name,email:ADVISOR.email},welcome:'Pat, welcome. Everything about your sale happens here, privately. Start with the questions about your business, then send the records on the list when you can.'});
  await owner.acceptInvite(OWNER.email,await firm.invite(id));
  await firm.setRequestsHidden(id,false);
  const contact={name:ADVISOR.name,email:ADVISOR.email};
  const reqs=[
    ['Profit and loss statements, 2023 to 2025','Your yearly profit and loss statements.','Buyers and lenders start here.','Shared with approved buyers after they sign an NDA.','Accepted'],
    ['Business tax returns, 2023 to 2025','The full returns, all pages.','Lenders check the returns against the statements.','Shared with buyers after a letter of intent.','Accepted'],
    ['Year-to-date financials for 2026','This year so far.','Shows the business is still on track.','Shared with approved buyers.','Open'],
    ['Maintenance agreement list','A list or export of active plans. Customer names can be hidden.','Agreements are a big part of the price.','Shared with approved buyers.','Accepted'],
    ['Licenses and insurance','Your master HVACR license and current insurance certificates.','Buyers check who holds the license.','Shared with buyers after a letter of intent.','Open'],
    ['Team overview','Roles and years with you. No names needed.','Buyers want to know who stays.','Shared with approved buyers.','Accepted'],
  ] as const;
  for(const [title,needed,why,sharing] of reqs)await firm.saveRequest(id,{title,needed,why,sharing,contact,due:due(14)});
  const b=await firm.load(id);
  for(const r of b.requests){const s=reqs.find(x=>x[0]===r.title)?.[4];if(s==='Accepted')await firm.review(r.id,'Accepted','');}
  await owner.saveAnswers(id,{history:'My father started the business in 2007 with one van out of our garage in Green Brook. I took it over in 2014 and we have grown to six technicians.',services:'Mostly residential service and replacement across Somerset and Middlesex counties, from Green Brook out to Bridgewater and Edison, about 420 maintenance plans, and a few small commercial accounts.'});
  await firm.saveBuyer(id,{name:'Buyer 1, owner-operator',summary:'A licensed HVAC service manager from Central Jersey, planning to buy with an SBA loan.',stage:'Reviewing information'});
  await firm.saveBuyer(id,{name:'Buyer 2, regional company',summary:'A heating and cooling company expanding into Somerset County.',stage:'Under NDA'});
  await firm.saveSteps(id,[{text:'Answer the questions about your business',owner:'You',due:due(7),done:false},{text:'Send year-to-date financials for 2026',owner:'You',due:due(10),done:false},{text:'Introductory call with Buyer 1, with Karan on the line',owner:'Firm',due:due(5),done:false}]);
  const after=await firm.load(id);
  await firm.shareSaleReady(id,sampleSaleReady(after.requests.map(r=>({title:r.title,status:r.status}))),'Pat, here is where the business stands this month. Our estimate is the range above. The single biggest thing you can work on is the master HVACR license: if a second licensed contractor joins the team, buyers see much less risk. Four of six records are in, so we are close. This is an estimate to plan with, not an appraisal or an offer.');
  return {id,owner};
}

