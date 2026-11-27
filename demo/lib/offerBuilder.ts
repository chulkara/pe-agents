// The offer builder. For buyers: ready-made financing structures for a listing, each with what they
// bring, the loan, the yearly payments and whether a lender would likely accept the coverage. For
// owners: what each shared offer means in money, at closing and over time, after Kalling's fee from
// their own engagement letter. All arithmetic is here, in code; every figure says where it came from.
import {sbaCheck,sbaDefaults,annualPayment,SBA_MIN_COVERAGE,type SbaInputs} from './sba.ts';
import type {OfferTerms} from './offerVersions.ts';
import {feeBases,type LetterTerms} from './engagement.ts';
import type {Letter} from './portal.ts';

export type StructureKey='sba-10'|'sba-standby-note'|'sba-paid-note'|'all-cash';
export type Structure={key:StructureKey;title:string;summary:string;buyerCash:number;loan:number;sellerNote:number;sellerCashAtClose:number;
  yearlyPayments:number;coverage:number|null;meetsCoverage:boolean;afterPayments:number;issues:string[];
  /** Problems that rule the structure out as built (for example the SBA loan limit), apart from coverage, which lenders weigh. */
  blockers:string[];assumptions:string;terms:OfferTerms};

const LOAN_RATE=sbaDefaults(1,1).ratePct,LOAN_YEARS=sbaDefaults(1,1).years,NOTE_RATE=6,NOTE_YEARS=5;
const usd=(n:number)=>'$'+Math.round(n).toLocaleString('en-US');

/** Up to four structures for a listing. Seller-note structures appear only when the seller will consider financing. */
export function structuresFor(l:{askingPrice:number;sde:number;sellerFinancing:boolean},o:{price?:number;buyerSalary?:number}={}):Structure[]{
  const price=Math.round(o.price??l.askingPrice);if(!(price>0))return [];
  const base:SbaInputs={...sbaDefaults(price,l.sde),buyerSalary:o.buyerSalary??sbaDefaults(price,l.sde).buyerSalary};
  const specs:{key:StructureKey;title:string;summary:string;in:Partial<SbaInputs>;financing:string;note?:Partial<OfferTerms>;bank:boolean}[]=[
    {key:'sba-10',title:'SBA loan, 10% down',summary:'You bring 10%; an SBA 7(a) loan covers the rest. The seller is paid in full at closing.',in:{buyerCashPct:10,sellerNotePct:0},financing:'SBA 7(a) loan with 10% buyer equity',bank:true},
    ...(l.sellerFinancing?[
      {key:'sba-standby-note' as const,title:'SBA loan with a standby seller note',summary:'You bring 5%; the seller carries 5% with no payments while the SBA loan is outstanding, which counts toward the 10% the SBA requires.',in:{buyerCashPct:5,sellerNotePct:5,sellerNoteStandby:true},financing:'SBA 7(a) loan; 5% buyer equity plus a 5% seller note on full standby',
        note:{noteInterest:`${NOTE_RATE}% a year`,noteTerm:`${LOAN_YEARS} years`,noteRepayment:'No payments while the SBA loan is outstanding (full standby)',noteSecurity:'Subordinate to the SBA lender'},bank:true},
      {key:'sba-paid-note' as const,title:'SBA loan plus a seller note',summary:`You bring 10%; the seller carries 10%, paid monthly over ${NOTE_YEARS} years; the SBA loan covers the rest.`,in:{buyerCashPct:10,sellerNotePct:10,sellerNoteStandby:false,sellerNoteRatePct:NOTE_RATE,sellerNoteYears:NOTE_YEARS},financing:'SBA 7(a) loan with 10% buyer equity and a 10% seller note',
        note:{noteInterest:`${NOTE_RATE}% a year`,noteTerm:`${NOTE_YEARS} years`,noteRepayment:'Equal monthly payments',noteSecurity:'Subordinate to the SBA lender'},bank:true},
    ]:[]),
    {key:'all-cash',title:'All cash',summary:'You pay the full price at closing with your own funds. No lender, no loan conditions.',in:{buyerCashPct:100,sellerNotePct:0},financing:'All cash; no financing condition',bank:false},
  ];
  return specs.map(sp=>{
    const c=sbaCheck({...base,...sp.in}),sellerCashAtClose=price-c.sellerNote;
    return {key:sp.key,title:sp.title,summary:sp.summary,buyerCash:c.buyerCash,loan:c.loan,sellerNote:c.sellerNote,sellerCashAtClose,yearlyPayments:c.debtService,
      coverage:c.dscr,meetsCoverage:c.meetsCoverage,afterPayments:c.afterDebt,issues:c.issues,blockers:c.issues.filter(i=>!/^Coverage is /.test(i)),
      assumptions:sp.bank?`Assumes a ${LOAN_RATE}% loan over ${LOAN_YEARS} years and ${usd(base.buyerSalary)} a year paid to whoever runs the business. Your lender sets the real terms.`:`Assumes ${usd(base.buyerSalary)} a year paid to whoever runs the business.`,
      terms:{kind:'Indication of interest',price,cashAtClose:sellerCashAtClose,sellerNote:c.sellerNote,earnout:0,financing:sp.financing,closeDays:sp.bank?90:45,conditions:sp.bank?'Subject to SBA loan approval and customary due diligence.':'Subject to customary due diligence.',
        financingConditions:sp.bank?'SBA 7(a) loan approval':'',...sp.note}};
  });
}
export const coverageLine=(s:Pick<Structure,'coverage'|'meetsCoverage'>)=>s.coverage===null?'No loan payments.':
  `Earnings cover the payments ${s.coverage.toFixed(2)} times${s.meetsCoverage?`; lenders usually want at least ${SBA_MIN_COVERAGE}.`:`; lenders usually want at least ${SBA_MIN_COVERAGE}, so this may not be approved.`}`;

// ---- Owner side ----
/** A fixed yearly rate, or null. Only a plain yearly percentage is read ("6%", "6% a year", "6.5% fixed",
 *  "6% APR"). Anything else (a monthly rate, prime plus a margin, a variable rate, two rates) is not
 *  read, so no payment is computed from it. */
export function fixedRate(s?:string):number|null{
  const m=String(s??'').trim().match(/^(\d+(?:\.\d+)?)\s*%\s*(?:fixed\s*)?(?:(?:a|per)\s+year|per\s+annum|annual(?:ly)?|yearly|apr)?(?:,?\s*fixed)?\.?$/i);
  return m?Number(m[1]):null;
}
/** A single stated term in years ("5 years", "60 months"), or null for anything else. */
export function termYears(s?:string):number|null{
  const m=String(s??'').trim().match(/^(\d+(?:\.\d+)?)\s*(years?|months?)\.?$/i);
  return m?(/month/i.test(m[2])?Number(m[1])/12:Number(m[1])):null;
}
export type NoteSchedule='equal monthly'|'interest only'|'standby'|'not stated'|'other';
/** How the offer says the note is repaid. Only a few exact, whole-term monthly schedules are read; any
 *  other wording (weekly, deferred for a time, changing part way) is shown as written, principal only.
 *  A balloon year must match the note's term. */
export function noteSchedule(repayment?:string,term?:number|null):NoteSchedule{
  const t=String(repayment??'').trim().replace(/\s+/g,' ');if(!t)return 'not stated';
  if(/^(?:no payments while the (?:sba |bank )?loan is outstanding(?: \(full standby\))?|(?:full )?standby(?: for the life of the (?:sba|bank) loan)?)\.?$/i.test(t))return 'standby';
  if(/^(?:(?:equal|level) monthly payments(?: of principal and interest)?|monthly (?:principal and interest|amortizing) payments|fully amortizing,? monthly(?: payments)?)\.?$/i.test(t))return 'equal monthly';
  const io=t.match(/^(?:monthly interest[ -]only payments?|interest[ -]only,? paid monthly)(?:,? (?:with )?(?:a |the )?balloon(?: payment)? (?:at|on) (?:maturity|the end of the term|the end of year (\d+)))?\.?$/i);
  if(io)return io[1]&&Number(io[1])!==term?'other':'interest only';
  return 'other';
}
export type TakeHome={atClose:number;feeAtClose:number;cashAtClose:number;
  note:{principal:number;total:number|null;monthly:number|null;standby:boolean;schedule:NoteSchedule;explained:string}|null;
  earnout:{max:number;fee:number;afterFee:number}|null;ifAllPaid:number;fee:{pct:number;min:number;retainer:number;source:string}|null;
  /** Why the fee is or is not included: from the signed letter, no signed letter, or a basis we do not compute. */
  feeStatus:'included'|'unsigned'|'other basis';caveat:string};

/** The engagement letter whose fee applies: the latest countersigned version. An amendment that is not
 *  countersigned yet does not replace it. */
export function signedFeeLetter(letters:Pick<Letter,'version'|'status'|'input'>[]):{terms:LetterTerms;version:number}|undefined{
  const l=letters.filter(x=>x.status==='Countersigned').sort((a,b)=>b.version-a.version)[0];
  const t=l&&(l.input as {terms?:LetterTerms}).terms;
  return t&&typeof t.successFeePct==='number'&&t.successFeePct>0?{terms:t,version:l.version}:undefined;
}

/** What an offer means for the owner. The fee comes from the signed engagement letter, or is left out
 *  and said so. It is charged once on everything paid: the minimum covers the whole sale, earnouts
 *  included, and the retainer is credited once. Taxes, paying off business debt and closing
 *  adjustments are not estimated. */
export function takeHome(t:Pick<OfferTerms,'cashAtClose'|'sellerNote'|'earnout'|'noteInterest'|'noteTerm'|'noteRepayment'>,letter?:{terms:Pick<LetterTerms,'successFeePct'|'successFeeMin'|'retainer'|'feeBasis'>;version:number}):TakeHome{
  // Both standard bases charge on cash and notes at close and on earnouts when paid. Any other basis is
  // shown as written and not estimated.
  const known=!!letter&&feeBases.includes(letter.terms.feeBasis);
  const f=letter&&known&&letter.terms.successFeePct?{pct:letter.terms.successFeePct,min:letter.terms.successFeeMin||0,retainer:typeof letter.terms.retainer==='number'?letter.terms.retainer:0,source:`Your signed engagement letter, version ${letter.version}`}:null;
  const owed=(base:number)=>f?Math.max(0,Math.max(f.min,Math.round(base*f.pct/100))-f.retainer):0;
  const atCloseBase=t.cashAtClose+t.sellerNote,earnoutMax=Math.max(0,t.earnout||0);
  const feeAtClose=owed(atCloseBase),earnoutFee=owed(atCloseBase+earnoutMax)-feeAtClose;
  let note:TakeHome['note']=null;
  if(t.sellerNote>0){
    const P=t.sellerNote,rate=fixedRate(t.noteInterest),term=termYears(t.noteTerm),schedule=noteSchedule(t.noteRepayment,termYears(t.noteTerm));
    let monthly:number|null=null,total:number|null=null,explained:string;
    if(schedule==='standby')explained=rate!==null?`Paid later by the buyer, at ${rate}% a year, once the bank loan allows. No payments while it is outstanding.`:'Paid later by the buyer, once the bank loan allows. No payments while it is outstanding.';
    else if(rate===null||!term)explained=`Paid later by the buyer; ${String(t.noteInterest??'').trim()?'the interest is not a single fixed yearly rate':'the interest is not stated'}${term?'':' or the term is not a single length'}, so only the principal is shown.`;
    else if(schedule==='equal monthly'){const y=annualPayment(P,rate,term);monthly=Math.round(y/12);total=Math.round(y*term);explained=`Paid by the buyer in equal monthly payments over ${term} years at ${rate}% a year.`;}
    else if(schedule==='interest only'){monthly=Math.round(P*rate/100/12);total=Math.round(P+P*rate/100*term);explained=`The buyer pays interest only, ${usd(monthly)} a month at ${rate}% a year, then the full ${usd(P)} at the end of ${term} years.`;}
    else if(schedule==='not stated')explained='Paid later by the buyer; the repayment schedule is not stated, so only the principal is shown.';
    else explained=`Paid on the schedule in the offer: "${String(t.noteRepayment).trim().slice(0,200)}". Only the principal is shown; your advisor can walk you through the payments.`;
    note={principal:P,standby:schedule==='standby',schedule,monthly,total,explained};
  }
  const earnout=earnoutMax>0?{max:earnoutMax,fee:earnoutFee,afterFee:earnoutMax-earnoutFee}:null;
  const atClose=t.cashAtClose-feeAtClose;
  const ifAllPaid=atClose+(note?.total??note?.principal??0)+(earnout?.afterFee??0);
  const after='Before taxes, paying off any business debt, and closing adjustments.';
  const feeStatus:TakeHome['feeStatus']=f?'included':letter?'other basis':'unsigned';
  return {atClose,feeAtClose,cashAtClose:t.cashAtClose,note,earnout,ifAllPaid,fee:f,feeStatus,
    caveat:feeStatus==='included'?after+' Your CPA can estimate taxes.'
      :feeStatus==='other basis'?`Your signed letter (version ${letter!.version}) calculates Kalling’s fee on: “${String(letter!.terms.feeBasis).trim().slice(0,200)}”. That is not estimated here, so the fee is not included; your advisor will confirm it. ${after}`
      :'Your engagement letter is not signed yet, so Kalling’s fee is not included. '+after};
}
