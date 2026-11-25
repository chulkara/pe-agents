// Drafts the closing record from what the transaction already holds (the chosen offer version,
// the latest LOI and the planned date), so the owner or administrator checks and confirms rather
// than retyping. Nothing is recorded here: every value still goes through the close form and its
// explicit confirmation, and anything the offer cannot say is left blank and flagged.
import type {Transaction,CloseRecord} from './transactions.ts';

export type CloseDraft={values:Record<string,string>;from:Record<string,string>;checks:string[];summary:string};
const usd=(n:number)=>'$'+Math.round(n).toLocaleString('en-US');
const fromCents=(n:number)=>(n/100).toFixed(2).replace(/\.00$/,'');

export function closePrefill(t:Pick<Transaction,'terms'|'offerVersion'|'lois'|'planningClose'|'closes'>):CloseDraft{
  const last=t.closes.at(-1) as CloseRecord|undefined;
  if(last){ // a correction starts from the record it corrects
    const a=last.amounts,values:Record<string,string>={date:last.date,basis:a.basis,basisNote:a.basisNote};
    for(const k of ['cash','sellerNote','otherFixed','fixed','earnoutMax','earnoutRealized','workingCapital','inventory','realEstate','buyerDebt'] as const)values[k]=fromCents(a[k]);
    return {values,from:{},checks:['Change only what the correction is for, and say why below.'],summary:'Pre-filled from closing version '+last.version+'.'};
  }
  const terms=t.terms,loi=[...t.lois].sort((x,y)=>y.version-x.version)[0];
  const offer='Offer version '+t.offerVersion,cash=terms.cashAtClose||0,note=terms.sellerNote||0,earnout=terms.earnout||0;
  const values:Record<string,string>={},from:Record<string,string>={},checks:string[]=[];
  const set=(k:string,v:string,src:string)=>{values[k]=v;from[k]=src;};
  if(t.planningClose)set('date',t.planningClose,'Planned closing date');else checks.push('Enter the actual closing date.');
  const equity=/equity|stock|share|membership interest/i.test(loi?.structure||'');
  set('basis',equity?'Equity consideration':'Asset consideration',loi?'LOI version '+loi.version+' structure':'Default; no LOI structure recorded');
  set('cash',String(cash),offer+', cash at close');
  set('sellerNote',String(note),offer+', seller note');
  set('otherFixed','0','Nothing else fixed in the offer');
  set('fixed',String(cash+note),'Cash plus seller note');
  set('earnoutMax',String(earnout),offer+', earnout');
  set('earnoutRealized','0','Nothing is earned at closing');
  if(terms.price&&terms.price!==cash+note)checks.push(`The headline price (${usd(terms.price)}) is not cash plus seller note (${usd(cash+note)}). Check the closing statement before recording.`);
  checks.push('Working capital, inventory, real estate and buyer borrowing are not in the offer. Take them from the closing statement.');
  const noteTerms=[terms.noteTerm,terms.noteInterest].filter(Boolean).join(', ');
  set('basisNote',`Per ${offer.toLowerCase()}${loi?`, reflected in LOI version ${loi.version}${loi.structure?` (${loi.structure})`:''}`:''}: ${usd(cash)} cash at close, ${usd(note)} seller note${noteTerms?` (${noteTerms})`:''}${earnout?`, and up to ${usd(earnout)} in earnout${terms.earnoutPeriod?` over ${terms.earnoutPeriod}`:''}`:''}. Confirm inventory, working capital and real estate against the closing statement.`,offer+(loi?' and LOI version '+loi.version:''));
  return {values,from,checks,summary:'Pre-filled from '+offer.toLowerCase()+(loi?' and LOI version '+loi.version:'')+'.'};
}
