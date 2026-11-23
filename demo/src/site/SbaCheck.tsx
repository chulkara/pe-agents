import {useState} from 'react';
import {money} from '../../lib/hvacValuation';
import {sbaCheck,sbaDefaults,maxPriceAtCoverage,SBA_MIN_COVERAGE,type SbaInputs} from '../../lib/sba';

/** Buyer-side check: can this price be financed with an SBA 7(a) loan? Arithmetic only, never a lending decision. */
export function SbaCheck({price,sde,sellerFinancing}:{price:number;sde:number;sellerFinancing:boolean}){
  const [i,setI]=useState<SbaInputs>(()=>({...sbaDefaults(price,sde),sellerNotePct:sellerFinancing?5:0}));
  const set=(k:keyof SbaInputs)=>(e:React.ChangeEvent<HTMLInputElement>)=>setI(v=>({...v,[k]:e.target.type==='checkbox'?e.target.checked:Number(e.target.value)}));
  let c:ReturnType<typeof sbaCheck>|null=null,error='';
  try{c=sbaCheck(i);}catch(e){error=(e as Error).message;}
  const ceiling=c?maxPriceAtCoverage(i):0;
  const num=(k:keyof SbaInputs,label:string,o:{step?:number;min?:number;max?:number;hint?:string}={})=><label className="ks-field"><span>{label}</span><input type="number" inputMode="decimal" value={String(i[k])} step={o.step??1} min={o.min??0} max={o.max} onChange={set(k)}/>{o.hint&&<small>{o.hint}</small>}</label>;
  return <section className="ks-sba" aria-label="SBA financing check">
    <h2>Can this be financed?</h2>
    <p className="ks-fine">A quick SBA 7(a) check using the listed price and discretionary earnings. Change any number to test your own structure.</p>
    <div className="ks-sba-grid">
      {num('price','Purchase price',{step:25000})}
      {num('buyerCashPct','Your cash at closing, % of price',{step:.5,max:100})}
      {num('sellerNotePct','Seller note, % of price',{step:.5,max:100,hint:sellerFinancing?'This seller will consider financing.':'This seller has not offered financing.'})}
      {num('ratePct','SBA loan rate, %',{step:.25,hint:'Most 7(a) loans float above prime. Ask your lender.'})}
      {num('years','Loan term, years',{max:25,hint:'Usually 10 years for a business purchase without real estate.'})}
      {num('buyerSalary','Salary for the owner or a manager',{step:5000,hint:'Lenders take a market salary out before testing coverage.'})}
    </div>
    <label className="ks-check"><input type="checkbox" checked={i.sellerNoteStandby} onChange={set('sellerNoteStandby')}/>The seller note is on full standby: no payments for the life of the SBA loan.</label>
    {error?<p className="ks-error" role="alert">{error}</p>:c&&<>
      <div className={'ks-sba-result'+(c.meetsCoverage&&!c.issues.length?' ok':' short')} role="status">
        <p className="ks-sba-dscr">{c.dscr===null?'No debt':c.dscr.toFixed(2)+'x'}<span>debt-service coverage</span></p>
        <p>{c.meetsCoverage&&!c.issues.length?`Clears the ${SBA_MIN_COVERAGE}x most SBA lenders look for.`:c.issues[0]}</p>
      </div>
      <dl className="ks-specs">
        <div><dt>SBA loan</dt><dd>{money(c.loan)}</dd></div>
        <div><dt>Your cash</dt><dd>{money(c.buyerCash)}</dd></div>
        <div><dt>Seller note</dt><dd>{money(c.sellerNote)}</dd></div>
        <div><dt>Equity SBA counts</dt><dd>{+c.equityPct.toFixed(1)}%</dd></div>
        <div><dt>Annual loan payments</dt><dd>{money(c.loanPayment)}</dd></div>
        <div><dt>Annual seller note payments</dt><dd>{c.sellerNotePayment?money(c.sellerNotePayment):"None"}</dd></div>
        <div><dt>Cash left after debt and salary</dt><dd>{money(c.afterDebt)}</dd></div>
        <div><dt>Return on your cash, year one</dt><dd>{c.cashOnCash===null?'n/a':Math.round(c.cashOnCash*100)+'%'}</dd></div>
      </dl>
      {c.issues.length>1&&<ul className="ks-sba-issues">{c.issues.slice(1).map(x=><li key={x}>{x}</li>)}</ul>}
      {ceiling>0&&<p className="ks-fine">With this structure, coverage stays at {SBA_MIN_COVERAGE}x up to a price of about {money(ceiling)}.</p>}
    </>}
    <p className="ks-fine">Estimates only. The lender decides eligibility, rate, term and how much it will lend. Equity rules follow SBA SOP 50 10 8 (June 2025): at least 10% equity, and a seller note counts for up to half of it only on full standby. Earnouts can’t be part of an SBA-financed price. See <a href="https://www.sba.gov/loans/7a-loans/" target="_blank" rel="noreferrer">SBA 7(a) loans</a>.</p>
  </section>;
}
