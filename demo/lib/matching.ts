// Two-way matching between buyer profiles and listings. Code ranks every pair from what the buyer
// told us and what the listing says, and writes a one-line reason from the same facts, so every
// ranking can be explained and checked. Nothing here contacts anyone or changes a record.
import {regionState,type Buyer,type BuyerCheck,type Listing,type Funds,type AccessRequest} from './brokerage.ts';

export type Tier='Strong fit'|'Good fit'|'Possible fit'|'Not a fit';
export type Factor={key:string;points:number;max:number;seller:string;buyer:string;concern?:boolean};
export type Fit={score:number;tier:Tier;factors:Factor[];reason:string;buyerReason:string};

const usd=(n:number)=>n>=1e6?'$'+(Math.round(n/1e5)/10).toString().replace(/\.0$/,'')+'M':'$'+Math.round(n/1e3)+'K';
const fundsRange:Record<Funds,[number,number]>={'Under $250K':[0,250e3],'$250K to $500K':[250e3,500e3],'$500K to $1M':[500e3,1e6],'$1M to $5M':[1e6,5e6],'Over $5M':[5e6,Infinity]};
const hvacWords=/\bhvac|hvacr|heating|cooling|air condition|refrigerat|mechanical contractor|technician|plumb|epa 608|nate\b|master (hvacr|license)/i;

/** Cash the buyer likely needs at close: 10% down with a bank or SBA loan, otherwise the asking price. */
export function cashNeeded(b:Pick<Buyer,'financing'>,l:Pick<Listing,'askingPrice'|'sellerFinancing'>){
  const borrows=b.financing.some(f=>/SBA|bank loan/i.test(f)),investors=b.financing.some(f=>/investor/i.test(f));
  if(borrows)return Math.round(l.askingPrice*0.1);
  if(investors)return Math.round(l.askingPrice*0.25);
  return l.sellerFinancing&&b.financing.some(f=>/seller note/i.test(f))?Math.round(l.askingPrice*0.8):l.askingPrice;
}

export function fit(b:Buyer,l:Listing,check?:Pick<BuyerCheck,'funds'>):Fit{
  const f:Factor[]=[],state=regionState(l.region);
  // Where
  if(b.regions.includes(l.region))f.push({key:'region',points:30,max:30,seller:`buys in ${l.region}`,buyer:`in your ${l.region} region`});
  else if(b.regions.some(r=>regionState(r)===state))f.push({key:'region',points:12,max:30,seller:`buys elsewhere in ${state}`,buyer:`in ${state}, near the regions you chose`,concern:true});
  else if(!b.regions.length)f.push({key:'region',points:10,max:30,seller:'has not named regions yet',buyer:'add regions to your profile to sharpen matches',concern:true});
  else f.push({key:'region',points:0,max:30,seller:`does not buy in ${state}`,buyer:`outside the regions you chose`,concern:true});
  // Price
  if(!b.maxPrice)f.push({key:'price',points:8,max:25,seller:'has not set a maximum price',buyer:'set the most you would pay to sharpen matches',concern:true});
  else if(l.askingPrice<=b.maxPrice)f.push({key:'price',points:l.askingPrice>=b.maxPrice*0.4?25:18,max:25,seller:`can pay up to ${usd(b.maxPrice)}`,buyer:`asking ${usd(l.askingPrice)} is under your ${usd(b.maxPrice)} limit`});
  else if(l.askingPrice<=b.maxPrice*1.1)f.push({key:'price',points:10,max:25,seller:`asking is just over their ${usd(b.maxPrice)} maximum`,buyer:`asking ${usd(l.askingPrice)} is just over your ${usd(b.maxPrice)} limit`,concern:true});
  else f.push({key:'price',points:0,max:25,seller:`asking is above their ${usd(b.maxPrice)} maximum`,buyer:`asking ${usd(l.askingPrice)} is above your ${usd(b.maxPrice)} limit`,concern:true});
  // Cash to close
  const need=cashNeeded(b,l),[lo,hi]=fundsRange[b.funds]||[0,0],proven=check&&(check.funds==='Proof of funds received'||check.funds==='Lender pre-qualified');
  if(check?.funds==='Not sufficient')f.push({key:'funds',points:0,max:20,seller:'funds were checked and fell short',buyer:'your last funds check fell short',concern:true});
  else if(lo>=need)f.push({key:'funds',points:proven?20:16,max:20,seller:proven?`funds checked (${check!.funds.toLowerCase()})`:`has the roughly ${usd(need)} needed at close`,buyer:`your cash covers the roughly ${usd(need)} needed at close`});
  else if(hi>=need)f.push({key:'funds',points:proven?16:10,max:20,seller:`may have the roughly ${usd(need)} needed at close`,buyer:`the roughly ${usd(need)} needed at close is within your range`});
  else f.push({key:'funds',points:0,max:20,seller:`likely short of the roughly ${usd(need)} needed at close`,buyer:`it needs roughly ${usd(need)} at close, more than your cash`,concern:true});
  // Buyer type for the size of business
  const sde=l.sde;
  const type:Record<Buyer['type'],[boolean,string,string]>={
    'Strategic HVAC operator':[true,'already runs an HVAC company','it fits an HVAC company adding a territory'],
    'Owner-operator':[sde<=1.2e6,sde<=1.2e6?'would run it day to day':'may find it large to run alone',sde<=1.2e6?'it is sized for an owner who runs it':'it is larger than most owner-run shops'],
    'Search fund':[sde>=5e5,sde>=5e5?'searches for businesses this size':'usually wants larger earnings',sde>=5e5?'its earnings suit a search fund':'it is smaller than most search funds target'],
    'Private equity / family office':[sde>=8e5,sde>=8e5?'invests at this size':'usually wants larger earnings',sde>=8e5?'it is large enough for an investor platform':'it is smaller than most investors target'],
  };
  const [ok,sel,buy]=type[b.type]||[false,'',''];
  f.push({key:'type',points:ok?15:4,max:15,seller:sel,buyer:buy,concern:!ok});
  // Trade experience
  const exp=hvacWords.test(b.experience)||b.type==='Strategic HVAC operator';
  f.push({key:'experience',points:exp?10:3,max:10,seller:exp?'has HVAC experience':'no HVAC experience listed',buyer:exp?'it uses your HVAC background':'add any trade experience to your profile',concern:!exp});
  let score=f.reduce((s,x)=>s+x.points,0);
  const priceOut=f.find(x=>x.key==='price')!.points===0,regionOut=f.find(x=>x.key==='region')!.points===0,fundsOut=f.find(x=>x.key==='funds')!.points===0;
  if(b.status==='Restricted')score=0;
  const tier:Tier=b.status==='Restricted'||priceOut||(regionOut&&fundsOut)?'Not a fit':score>=80&&!regionOut?'Strong fit':score>=60&&!regionOut?'Good fit':score>=40?'Possible fit':'Not a fit';
  const order=['region','type','experience','funds','price'],good=f.filter(x=>!x.concern&&!(x.key==='experience'&&b.type==='Strategic HVAC operator')).sort((x,y)=>order.indexOf(x.key)-order.indexOf(y.key)),bad=f.filter(x=>x.concern).sort((x,y)=>(y.max-y.points)-(x.max-x.points));
  const reason=b.status==='Restricted'?'Restricted by the advisor.':line(good.slice(0,3).map(x=>x.seller),bad[0]?.seller);
  const buyerReason=line(good.slice(0,3).map(x=>x.buyer),bad[0]?.buyer);
  return {score,tier,factors:f,reason,buyerReason};
}
function line(pros:string[],con?:string){
  const list=pros.length>1?pros.slice(0,-1).join(', ')+' and '+pros.at(-1):pros[0]||'';
  const s=list&&con?list+'; '+con:list||con||'';
  return s.charAt(0).toUpperCase()+s.slice(1)+'.';
}

const rank:Record<Tier,number>={'Strong fit':0,'Good fit':1,'Possible fit':2,'Not a fit':3};
export const byFit=(x:{fit:Fit},y:{fit:Fit})=>rank[x.fit.tier]-rank[y.fit.tier]||y.fit.score-x.fit.score;
export type BuyerMatch={buyer:Buyer;fit:Fit;access?:AccessRequest['status'];saved:boolean};
/** Best buyers for one listing, strongest first. Restricted buyers never appear. */
export function matchBuyers(db:{buyers:Buyer[];checks?:BuyerCheck[];access:AccessRequest[]},l:Listing,limit=10):BuyerMatch[]{
  return db.buyers.filter(b=>b.status!=='Restricted').map(b=>({buyer:b,fit:fit(b,l,db.checks?.find(c=>c.buyerId===b.id)),access:db.access.find(a=>a.listingId===l.id&&a.buyerId===b.id)?.status,saved:b.saved.includes(l.id)}))
    .filter(m=>m.fit.tier!=='Not a fit').sort((x,y)=>byFit(x,y)||x.buyer.createdAt.localeCompare(y.buyer.createdAt)).slice(0,limit);
}
/** Best live listings for one buyer, strongest first, leaving out ones they already asked about. */
export function matchListings<L extends Listing>(b:Buyer,listings:L[],opts:{check?:BuyerCheck;exclude?:string[];limit?:number}={}):{listing:L;fit:Fit}[]{
  return listings.filter(l=>l.status==='Live'&&!opts.exclude?.includes(l.id)).map(l=>({listing:l,fit:fit(b,l,opts.check)}))
    .filter(m=>m.fit.tier!=='Not a fit').sort((x,y)=>byFit(x,y)||(y.listing.publishedAt||'').localeCompare(x.listing.publishedAt||'')).slice(0,opts.limit??3);
}
/** What the owner may see: counts by buyer type, never names. */
export function fitSummary(matches:BuyerMatch[]){
  const strong=matches.filter(m=>m.fit.tier==='Strong fit').length,byType:Record<string,number>={};
  for(const m of matches)byType[m.buyer.type]=(byType[m.buyer.type]||0)+1;
  return {total:matches.length,strong,byType};
}
