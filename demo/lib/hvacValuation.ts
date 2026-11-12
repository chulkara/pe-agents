// Transparent valuation estimate for NJ/NY HVAC service companies.
// Starting multiples follow public industry guides for small HVAC businesses: SDE multiples
// of roughly 2x–4x for project-heavy shops, 3x–5x for balanced ones and 4x–6x for companies
// built on maintenance agreements. Every adjustment is shown to the owner. It is an estimate
// to start a conversation, not an appraisal or a promise of a price.
export type HvacInputs={
  revenue:number;            // last full year
  ownerPay:number;           // salary + benefits + personal expenses run through the business
  netProfit:number;          // pre-tax profit on the return/P&L
  addBacks:number;           // one-time or non-business costs
  maintenancePct:number;     // share of revenue from service/maintenance agreements and repairs (0-100)
  agreements:number;         // active maintenance agreements
  commercialPct:number;      // share of revenue from commercial customers
  newConstructionPct:number; // share from new-construction / builder work
  technicians:number;        // field technicians excluding the owner
  ownerRole:'runs-everything'|'key-relationships'|'manager-runs-day-to-day';
  topCustomerPct:number;     // largest customer's share of revenue
  years:number;              // years in business
  trend:'growing'|'flat'|'declining';
  licenseHolder:'owner-only'|'owner-and-employee'|'employee';
};
export type Adjustment={label:string;effect:number;why:string};
export type Valuation={sde:number;low:number;mid:number;high:number;multipleLow:number;multipleHigh:number;band:string;adjustments:Adjustment[];readiness:{label:string;score:number;tip:string}[];warnings:string[]};

const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const round=(n:number)=>n>=1e6?Math.round(n/25000)*25000:Math.round(n/5000)*5000;
export const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(n>=1e7?1:2).replace(/\.?0+$/,'')+'M':'$'+Math.round(n/1000).toLocaleString()+'K';

export function sellerDiscretionaryEarnings(i:Pick<HvacInputs,'ownerPay'|'netProfit'|'addBacks'>){return Math.max(0,(i.ownerPay||0)+(i.netProfit||0)+(i.addBacks||0));}

export function estimateHvacValue(i:HvacInputs):Valuation{
  const sde=sellerDiscretionaryEarnings(i),warnings:string[]=[];
  if(!(i.revenue>0))throw Error('Enter last year’s revenue.');
  if(sde<=0)throw Error('Enter owner pay and profit so we can estimate earnings.');
  const margin=sde/i.revenue;
  if(margin>0.45)warnings.push('Earnings above 45% of revenue are unusual for HVAC. Buyers will ask to see how add-backs were calculated.');
  if(margin<0.06)warnings.push('Earnings below 6% of revenue usually mean value is driven by assets and the customer list rather than profit.');
  // Size band: small owner-operated shops trade at lower multiples than companies with management.
  const band=sde<250000?{label:'Owner-operated (SDE under $250K)',lo:2.2,hi:3.0}:sde<750000?{label:'Established (SDE $250K–$750K)',lo:2.8,hi:3.6}:sde<2000000?{label:'Scaled (SDE $750K–$2M)',lo:3.4,hi:4.4}:{label:'Platform-ready (SDE over $2M)',lo:4.0,hi:5.2};
  const adj:Adjustment[]=[];
  const add=(label:string,effect:number,why:string)=>{if(Math.abs(effect)>=0.05)adj.push({label,effect:Math.round(effect*100)/100,why});};
  add('Recurring service revenue',clamp((i.maintenancePct-40)/100*1.6,-0.5,0.8),`${Math.round(i.maintenancePct)}% of revenue from service and maintenance. Buyers pay more for predictable, repeat revenue than for one-off installs.`);
  if(i.agreements>0)add('Maintenance agreements',clamp(Math.log10(i.agreements)/3*0.5-0.15,-0.1,0.45),`${i.agreements.toLocaleString()} active agreements create scheduled visits and replacement opportunities a new owner keeps.`);
  add('New-construction exposure',-clamp(i.newConstructionPct/100*1.2,0,0.8),`${Math.round(i.newConstructionPct)}% from builder work, which depends on a few contractors and the housing cycle.`);
  if(i.commercialPct>=25&&i.commercialPct<=70)add('Balanced customer mix',0.15,'A mix of residential and commercial work spreads risk.');
  add('Owner involvement',{'runs-everything':-0.45,'key-relationships':-0.15,'manager-runs-day-to-day':0.25}[i.ownerRole],{'runs-everything':'When the owner does sales, dispatch and the hardest jobs, a buyer has to replace all of it.','key-relationships':'Some customers and suppliers rely on the owner personally; a transition period helps.','manager-runs-day-to-day':'A manager already runs daily operations, so the business does not depend on the seller.'}[i.ownerRole]);
  add('Technician depth',i.technicians>=8?0.3:i.technicians>=4?0.1:i.technicians<=1?-0.3:-0.05,`${i.technicians} field technician${i.technicians===1?'':'s'}. Depth reduces the risk of losing capacity when one person leaves.`);
  add('Customer concentration',i.topCustomerPct>=25?-0.5:i.topCustomerPct>=15?-0.2:0,`Largest customer is ${Math.round(i.topCustomerPct)}% of revenue.`);
  add('Track record',i.years>=20?0.15:i.years<5?-0.3:0,`${i.years} years in business.`);
  add('Trend',{growing:0.25,flat:0,declining:-0.4}[i.trend],{growing:'Revenue is growing.',flat:'Revenue is steady.',declining:'Revenue has declined; buyers price in recovery risk.'}[i.trend]);
  add('License continuity',{'owner-only':-0.25,'owner-and-employee':0.1,employee:0.15}[i.licenseHolder],{'owner-only':'Only the owner holds the master HVACR license. In New Jersey the business needs a licensed bona fide representative, so a buyer must plan for that.','owner-and-employee':'Another licensed master HVACR contractor on staff makes the license transition easier.',employee:'A licensed employee can serve as the business’s licensed representative after a sale.'}[i.licenseHolder]);
  const shift=adj.reduce((n,a)=>n+a.effect,0);
  const multipleLow=Math.round(clamp(band.lo+shift,1.5,6.5)*10)/10,multipleHigh=Math.round(clamp(band.hi+shift,multipleLow+0.4,7)*10)/10;
  const low=round(sde*multipleLow),high=round(sde*multipleHigh),mid=round((low+high)/2);
  const readiness=[
    {label:'Recurring revenue',score:clamp(Math.round(i.maintenancePct/15+(i.agreements>300?2:i.agreements>100?1:0)),0,5),tip:'Convert repeat customers to annual maintenance agreements and track renewals.'},
    {label:'Runs without you',score:{'runs-everything':1,'key-relationships':3,'manager-runs-day-to-day':5}[i.ownerRole],tip:'Document dispatch, pricing and supplier relationships; promote a lead technician or office manager.'},
    {label:'Team and license',score:clamp((i.technicians>=6?3:i.technicians>=3?2:1)+(i.licenseHolder==='owner-only'?0:2),0,5),tip:'Support a senior technician through the master HVACR license.'},
    {label:'Customer spread',score:i.topCustomerPct>=25?1:i.topCustomerPct>=15?3:5,tip:'Reduce reliance on any single builder or property manager.'},
    {label:'Clean books',score:margin>0.45||margin<0.06?2:4,tip:'Keep three years of accountant-prepared statements and a written list of add-backs.'},
  ];
  return {sde,low,mid,high,multipleLow,multipleHigh,band:band.label,adjustments:adj,readiness,warnings};
}
export const valuationSources=[
  {title:'OffDeal — practical valuation guide for an HVAC business',url:'https://offdeal.io/blog/practical-valuation-guide-for-an-hvac-business'},
  {title:'NJ Board of Examiners of HVACR Contractors — FAQ',url:'https://njconsumeraffairs.gov/hvacr/Pages/FAQ.aspx'},
];
