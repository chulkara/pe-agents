// The offer builder. For buyers: ready-made financing structures for a listing, each with what they
// bring, the loan, the yearly payments and whether a lender would likely accept the coverage. For
// owners: what each shared offer means in money, at closing and over time, after Kalling's fee from
// their own engagement letter. All arithmetic is here, in code; every figure says where it came from.
import {sbaCheck,sbaDefaults,annualPayment,SBA_MIN_COVERAGE,type SbaInputs} from './sba.ts';
import type {OfferTerms} from './offerVersions.ts';
import type {LetterTerms} from './engagement.ts';

export type StructureKey='sba-10'|'sba-standby-note'|'sba-paid-note'|'all-cash';
export type Structure={key:StructureKey;title:string;summary:string;buyerCash:number;loan:number;sellerNote:number;sellerCashAtClose:number;
  yearlyPayments:number;coverage:number|null;meetsCoverage:boolean;afterPayments:number;issues:string[];assumptions:string;terms:OfferTerms};

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
      coverage:c.dscr,meetsCoverage:c.meetsCoverage,afterPayments:c.afterDebt,issues:c.issues,
      assumptions:sp.bank?`Assumes a ${LOAN_RATE}% loan over ${LOAN_YEARS} years and ${usd(base.buyerSalary)} a year paid to whoever runs the business. Your lender sets the real terms.`:`Assumes ${usd(base.buyerSalary)} a year paid to whoever runs the business.`,
      terms:{kind:'Indication of interest',price,cashAtClose:sellerCashAtClose,sellerNote:c.sellerNote,earnout:0,financing:sp.financing,closeDays:sp.bank?90:45,conditions:sp.bank?'Subject to SBA loan approval and customary due diligence.':'Subject to customary due diligence.',
        financingConditions:sp.bank?'SBA 7(a) loan approval':'',...sp.note}};
  });
}
export const coverageLine=(s:Pick<Structure,'coverage'|'meetsCoverage'>)=>s.coverage===null?'No loan payments.':
  `Earnings cover the payments ${s.coverage.toFixed(2)} times${s.meetsCoverage?`; lenders usually want at least ${SBA_MIN_COVERAGE}.`:`; lenders usually want at least ${SBA_MIN_COVERAGE}, so this may not be approved.`}`;

// ---- Owner side ----
const pct=(s?:string)=>{const m=String(s??'').match(/(\d+(?:\.\d+)?)\s*%/);return m?Number(m[1]):null;};
const years=(s?:string)=>{const t=String(s??'');let m=t.match(/(\d+(?:\.\d+)?)\s*years?/i);if(m)return Number(m[1]);m=t.match(/(\d+)\s*months?/i);return m?Number(m[1])/12:null;};
export type TakeHome={atClose:number;feeAtClose:number;cashAtClose:number;note:{principal:number;total:number|null;monthly:number|null;standby:boolean;explained:string}|null;
  earnout:{max:number;afterFee:number}|null;ifAllPaid:number;fee:{pct:number;min:number;retainer:number;source:string}|null;caveat:string};

/** What an offer means for the owner. The fee comes from the signed engagement letter, or is left out
 *  and said so. Taxes, paying off business debt and closing adjustments are not estimated. */
export function takeHome(t:Pick<OfferTerms,'cashAtClose'|'sellerNote'|'earnout'|'noteInterest'|'noteTerm'|'noteRepayment'>,letter?:{terms:Pick<LetterTerms,'successFeePct'|'successFeeMin'|'retainer'>;version:number}):TakeHome{
  const f=letter&&letter.terms.successFeePct?{pct:letter.terms.successFeePct,min:letter.terms.successFeeMin||0,retainer:typeof letter.terms.retainer==='number'?letter.terms.retainer:0,source:`Your signed engagement letter, version ${letter.version}`}:null;
  const atCloseBase=t.cashAtClose+t.sellerNote;
  const feeAtClose=f?Math.max(0,Math.max(f.min,Math.round(atCloseBase*f.pct/100))-f.retainer):0;
  let note:TakeHome['note']=null;
  if(t.sellerNote>0){
    const rate=pct(t.noteInterest),term=years(t.noteTerm),standby=/standby|no payments/i.test(t.noteRepayment||'');
    const yearly=rate!==null&&term?annualPayment(t.sellerNote,rate,term):null;
    note={principal:t.sellerNote,standby,monthly:yearly&&!standby?Math.round(yearly/12):null,total:yearly&&!standby?Math.round(yearly*term!):null,
      explained:rate===null||!term?'Paid later by the buyer; the interest and term are not stated, so only the principal is shown.':standby?`Paid later by the buyer, at ${rate}% a year, once the bank loan allows. No payments while it is outstanding.`:`Paid by the buyer monthly over ${term} years at ${rate}% a year.`};
  }
  const earnout=t.earnout>0?{max:t.earnout,afterFee:Math.round(t.earnout*(1-(f?.pct??0)/100))}:null;
  const atClose=t.cashAtClose-feeAtClose;
  const ifAllPaid=atClose+(note?.total??note?.principal??0)+(earnout?.afterFee??0);
  return {atClose,feeAtClose,cashAtClose:t.cashAtClose,note,earnout,ifAllPaid,fee:f,
    caveat:f?'Before taxes, paying off any business debt, and closing adjustments. Your CPA can estimate taxes.':'Your engagement letter is not signed yet, so Kalling’s fee is not included. Before taxes, paying off any business debt, and closing adjustments.'};
}
