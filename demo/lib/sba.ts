// SBA 7(a) financing check for a business acquisition. Deterministic arithmetic only:
// it estimates payments and debt-service coverage so a buyer can test a price before
// talking to a lender. Lenders decide eligibility, rate, term and coverage; this is not a
// lending decision. Equity rules follow SBA SOP 50 10 8 (effective June 1, 2025): at least
// 10% equity for a change of ownership, of which a seller note may provide up to half only
// when it is on full standby for the life of the loan.

export type SbaInputs={
  price:number;            // purchase price, USD
  sde:number;              // seller's discretionary earnings, USD per year
  buyerCashPct:number;     // buyer cash at closing, % of price
  sellerNotePct:number;    // seller note, % of price
  sellerNoteStandby:boolean; // no payments for the life of the SBA loan
  sellerNoteRatePct:number;  // seller note interest, % per year
  sellerNoteYears:number;    // seller note term once payments are made
  ratePct:number;          // SBA loan interest, % per year
  years:number;            // SBA loan term
  buyerSalary:number;      // market salary the new owner or a manager is paid, USD per year
};

export type SbaCheck={
  loan:number;sellerNote:number;buyerCash:number;
  loanPayment:number;sellerNotePayment:number;debtService:number; // annual, USD
  cashFlowForDebt:number;dscr:number|null;afterDebt:number;cashOnCash:number|null;
  equityPct:number;meetsCoverage:boolean;issues:string[];
};

export const SBA_MIN_COVERAGE=1.25;
export const SBA_MAX_LOAN=5_000_000;
export const SBA_MIN_EQUITY_PCT=10;
export const sbaDefaults=(price:number,sde:number):SbaInputs=>({price,sde,buyerCashPct:10,sellerNotePct:0,sellerNoteStandby:true,sellerNoteRatePct:6,sellerNoteYears:10,ratePct:10.5,years:10,buyerSalary:90000});

/** Level annual payment on an amortizing loan, paid monthly. */
export function annualPayment(principal:number,ratePct:number,years:number){
  if(!(principal>0)||!(years>0))return 0;
  const r=ratePct/100/12,n=years*12;
  const monthly=r===0?principal/n:principal*r/(1-Math.pow(1+r,-n));
  return monthly*12;
}

const round=(n:number)=>Math.round(n);

export function sbaCheck(i:SbaInputs):SbaCheck{
  const issues:string[]=[];
  if(!(i.price>0))throw Error('Enter a purchase price.');
  if(!(i.sde>=0))throw Error('Enter the business’s discretionary earnings.');
  const cashPct=Math.max(0,i.buyerCashPct),notePct=Math.max(0,i.sellerNotePct);
  if(cashPct+notePct>100)throw Error('Buyer cash and the seller note cannot exceed the price.');
  const buyerCash=i.price*cashPct/100,sellerNote=i.price*notePct/100,loan=Math.max(0,i.price-buyerCash-sellerNote);
  // Equity the SBA counts: buyer cash, plus a standby seller note for at most half of the 10%.
  const noteCounted=i.sellerNoteStandby?Math.min(notePct,SBA_MIN_EQUITY_PCT/2):0,equityPct=cashPct+noteCounted;
  if(equityPct<SBA_MIN_EQUITY_PCT){
    issues.push(notePct>0&&!i.sellerNoteStandby
      ?'A seller note only counts toward the 10% equity when it is on full standby for the life of the loan.'
      :`SBA requires at least ${SBA_MIN_EQUITY_PCT}% equity for a change of ownership; this structure has ${+equityPct.toFixed(1)}%.`);
  }
  if(i.sellerNoteStandby&&notePct>SBA_MIN_EQUITY_PCT/2&&cashPct<SBA_MIN_EQUITY_PCT/2)issues.push('A seller note can provide at most half of the required equity; the buyer must bring at least 5% in cash.');
  if(loan>SBA_MAX_LOAN)issues.push('The loan is above the $5 million SBA 7(a) limit.');
  const loanPayment=annualPayment(loan,i.ratePct,i.years);
  const sellerNotePayment=i.sellerNoteStandby?0:annualPayment(sellerNote,i.sellerNoteRatePct,i.sellerNoteYears);
  const debtService=loanPayment+sellerNotePayment;
  const cashFlowForDebt=i.sde-Math.max(0,i.buyerSalary);
  const dscr=debtService>0?cashFlowForDebt/debtService:null;
  const afterDebt=cashFlowForDebt-debtService;
  const cashOnCash=buyerCash>0?afterDebt/buyerCash:null;
  const meetsCoverage=dscr===null?cashFlowForDebt>0:dscr>=SBA_MIN_COVERAGE;
  if(dscr!==null&&dscr<SBA_MIN_COVERAGE)issues.push(`Coverage is ${dscr.toFixed(2)}x; SBA lenders typically need at least ${SBA_MIN_COVERAGE}x.`);
  return {loan:round(loan),sellerNote:round(sellerNote),buyerCash:round(buyerCash),loanPayment:round(loanPayment),sellerNotePayment:round(sellerNotePayment),debtService:round(debtService),cashFlowForDebt:round(cashFlowForDebt),dscr,afterDebt:round(afterDebt),cashOnCash,equityPct,meetsCoverage,issues};
}

/** The highest price, in $25,000 steps, that keeps coverage at the SBA minimum with this structure. */
export function maxPriceAtCoverage(i:SbaInputs){
  let lo=0,hi=Math.max(i.price*3,1_000_000);
  for(let k=0;k<60;k++){const mid=(lo+hi)/2,c=sbaCheck({...i,price:mid});if(c.dscr===null||c.dscr>=SBA_MIN_COVERAGE)lo=mid;else hi=mid;}
  return Math.floor(lo/25000)*25000;
}
