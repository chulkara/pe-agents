// Turns cited figures from the owner's statements into a recast table and reviewable proposals.
// All arithmetic is here, in code. Nothing reaches the company recast until an advisor accepts it.
import type {ExtractedLine,RecastField} from './drafting.ts';
import type {Recast,AddBack} from './deals.ts';

export type YearRow={year:number;revenue:number|null;cogs:number|null;netIncome:number|null;depreciation:number;amortization:number;interest:number;ownerPay:number;addBacks:number;sde:number|null;ebitda:number|null;taxIncome:number|null};
export type Mismatch={year:number;what:string;pl:number;tax:number;diffPct:number;plCite:Citation;taxCite:Citation};
export type Citation={fileId:string;name:string;page:number;excerpt:string};
export type Proposal={id:string;year:number;target:'revenue'|'netProfit'|'ownerPay'|'addBack';field:RecastField;item:string;amount:number;reason:string;citation:Citation;confidence:'high'|'medium';support:'Supported'|'Ask the owner'};
const cite=(l:ExtractedLine):Citation=>({fileId:l.fileId,name:l.name,page:l.page,excerpt:l.excerpt});
const ownerFields:RecastField[]=['ownerSalary','ownerPayrollTax','ownerHealth','ownerRetirement','ownerVehicle','ownerPhone'];
const ownerLabel:Partial<Record<RecastField,string>>={ownerSalary:'Owner salary',ownerPayrollTax:'Payroll taxes on owner pay',ownerHealth:'Owner health insurance',ownerRetirement:'Owner retirement contributions',ownerVehicle:'Owner vehicle',ownerPhone:'Owner phone'};

/** One figure per year and field: statements win over tax returns; within a kind, the first cited figure wins. */
function pick(lines:ExtractedLine[],year:number,field:RecastField){return lines.find(l=>l.year===year&&l.field===field);}
export function recastTable(lines:ExtractedLine[],years?:number[]):YearRow[]{
  const ys=years?.length?years:[...new Set(lines.map(l=>l.year))].sort();
  return ys.map(year=>{
    const v=(f:RecastField)=>pick(lines,year,f)?.amount??null;
    const ownerPay=ownerFields.reduce((n,f)=>n+(v(f)||0),0);
    const addBacks=dedupe(lines.filter(l=>l.year===year&&l.field==='addBack')).reduce((n,l)=>n+l.amount,0);
    const net=v('netIncome'),dep=v('depreciation')||0,am=v('amortization')||0,int=v('interest')||0;
    const sde=net===null?null:net+ownerPay+dep+am+int+addBacks;
    return {year,revenue:v('revenue'),cogs:v('cogs'),netIncome:net,depreciation:dep,amortization:am,interest:int,ownerPay,addBacks,sde,ebitda:sde===null?null:sde-ownerPay,taxIncome:v('taxIncome')};
  });
}
const dedupe=(ls:ExtractedLine[])=>ls.filter((l,i)=>ls.findIndex(x=>x.year===l.year&&x.field===l.field&&x.amount===l.amount&&(x.category||'')===(l.category||''))===i);
/** Average yearly change in revenue and SDE across the years with figures. */
export function trend(rows:YearRow[]){
  const pct=(xs:(number|null)[])=>{const v=xs.filter((x):x is number=>x!==null&&x>0);if(v.length<2)return null;return Math.round((Math.pow(v[v.length-1]/v[0],1/(v.length-1))-1)*1000)/10;};
  const r=pct(rows.map(x=>x.revenue)),s=pct(rows.map(x=>x.sde));
  return {revenuePct:r,sdePct:s,label:r===null?'Not enough years':r>3?'growing':r<-3?'declining':'flat'} as const;
}
/** Profit and loss figures that differ from the tax return by more than 2%. */
export function mismatches(lines:ExtractedLine[],threshold=0.02):Mismatch[]{
  const out:Mismatch[]=[],ys=[...new Set(lines.map(l=>l.year))].sort();
  for(const year of ys){
    for(const [plField,taxField,what] of [['netIncome','taxIncome','Net income against ordinary business income'],['ownerSalary','taxOfficerComp','Owner salary against officer compensation']] as const){
      const pl=pick(lines,year,plField),tax=pick(lines,year,taxField);if(!pl||!tax||!pl.amount)continue;
      const diff=Math.abs(pl.amount-tax.amount)/Math.abs(pl.amount);
      if(diff>threshold)out.push({year,what,pl:pl.amount,tax:tax.amount,diffPct:Math.round(diff*1000)/10,plCite:cite(pl),taxCite:cite(tax)});
    }
  }
  return out;
}
/** Personal expenses need ledger detail; family payroll and related-party rent need the owner to confirm. */
export function support(l:ExtractedLine,docs:{kind:string}[]):'Supported'|'Ask the owner'{
  if(l.field!=='addBack')return 'Supported';
  const ledger=docs.some(d=>d.kind==='ledger');
  if(l.category==='personal expense'&&!ledger)return 'Ask the owner';
  if(l.category==='family payroll'||l.category==='related-party rent'||l.category==='other')return 'Ask the owner';
  if(l.confidence==='medium')return 'Ask the owner';
  return 'Supported';
}
/** Proposals for the latest full year: revenue, net profit, owner pay lines and add-backs (including D&A and interest). */
export function proposals(lines:ExtractedLine[],docs:{kind:string}[],year?:number):Proposal[]{
  const y=year??Math.max(0,...lines.filter(l=>l.field==='netIncome'||l.field==='revenue').map(l=>l.year));if(!y)return [];
  const out:Proposal[]=[];let n=0;const id=()=>`p${y}-${++n}`;
  const rev=pick(lines,y,'revenue');if(rev)out.push({id:id(),year:y,target:'revenue',field:'revenue',item:'Revenue',amount:rev.amount,reason:'Revenue from the profit and loss statement.',citation:cite(rev),confidence:rev.confidence,support:'Supported'});
  const net=pick(lines,y,'netIncome');if(net)out.push({id:id(),year:y,target:'netProfit',field:'netIncome',item:'Net income before tax',amount:net.amount,reason:'Starting point for seller’s discretionary earnings.',citation:cite(net),confidence:net.confidence,support:'Supported'});
  for(const f of ownerFields){const l=pick(lines,y,f);if(l)out.push({id:id(),year:y,target:'ownerPay',field:f,item:ownerLabel[f]||l.label,amount:l.amount,reason:'Paid to or for the owner; a buyer would replace this with their own pay.',citation:cite(l),confidence:l.confidence,support:'Supported'});}
  for(const [f,item,reason] of [['depreciation','Depreciation','A non-cash expense.'],['amortization','Amortization','A non-cash expense.'],['interest','Interest expense','Financing cost that a buyer’s own financing replaces.']] as const){const l=pick(lines,y,f);if(l&&l.amount)out.push({id:id(),year:y,target:'addBack',field:f,item,amount:l.amount,reason,citation:cite(l),confidence:l.confidence,support:'Supported'});}
  for(const l of dedupe(lines.filter(l=>l.year===y&&l.field==='addBack')))out.push({id:id(),year:y,target:'addBack',field:'addBack',item:l.label,amount:l.amount,reason:l.reason||l.category||'Possible add-back.',citation:cite(l),confidence:l.confidence,support:support(l,docs)});
  return out;
}
export type Decision='accept'|'skip';
export type ReviewedLine=Proposal&{decision:Decision;reportedAmount:number};
export type RecastReview={draftId:string;year:number;by:string;at:string;lines:ReviewedLine[]};
/** Apply only the accepted lines. Skipped lines never reach the recast. Edited amounts replace the proposal. */
export function applyProposals(current:Pick<Recast,'inputs'|'addBacks'|'askingPrice'>,props:Proposal[],decisions:Record<string,{decision:Decision;amount?:number}>):{inputs:Recast['inputs'];addBacks:(Omit<AddBack,'id'>&{id?:string})[];askingPrice:number;reviewedLines:ReviewedLine[]}{
  if(props.some(p=>!decisions[p.id]||!['accept','skip'].includes(decisions[p.id].decision)))throw Error('Review every proposed line before applying the recast.');
  if(props.some(p=>decisions[p.id].amount!==undefined&&!Number.isFinite(decisions[p.id].amount)))throw Error('Enter a finite amount for every edited line.');
  const reviewedLines:ReviewedLine[]=props.map(p=>({...p,decision:decisions[p.id].decision,reportedAmount:p.amount,amount:decisions[p.id].amount===undefined?p.amount:Math.round(decisions[p.id].amount!*100)/100}));
  const take=props.filter(p=>decisions[p.id]?.decision==='accept').map(p=>({...p,amount:Number.isFinite(decisions[p.id]?.amount)?Math.round(decisions[p.id]!.amount!*100)/100:p.amount}));
  const inputs={...current.inputs};
  const rev=take.find(p=>p.target==='revenue');if(rev)inputs.revenue=rev.amount;
  const net=take.find(p=>p.target==='netProfit');if(net)inputs.netProfit=net.amount;
  const owner=take.filter(p=>p.target==='ownerPay');if(owner.length)inputs.ownerPay=owner.reduce((s,p)=>s+p.amount,0);
  const ev=(p:Proposal)=>`${p.citation.name}, page ${p.citation.page}`;
  const fromDraft=take.filter(p=>p.target==='addBack').map(p=>({item:p.item,amount:p.amount,reason:p.reason.length>=5?p.reason:p.reason+' (from the documents)',evidence:ev(p)}));
  const kept=current.addBacks.filter(a=>!fromDraft.some(d=>d.item===a.item&&d.evidence===a.evidence));
  return {inputs,addBacks:[...kept,...fromDraft],askingPrice:current.askingPrice,reviewedLines};
}
