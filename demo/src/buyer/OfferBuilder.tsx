// Offer builder screens. Buyers pick a financing structure that fills the offer form; owners see what
// each shared offer means in money. All numbers come from lib/offerBuilder.ts.
import {useState} from 'react';
import {structuresFor,coverageLine,takeHome,type StructureKey} from '../../lib/offerBuilder';
import type {OfferTerms,SharedOffer} from '../../lib/offerVersions';
import type {LetterTerms} from '../../lib/engagement';
import {TermsEditor} from './Offers';
import './offerBuilder.css';

// Exact dollars wherever an owner or buyer is deciding.
const usd=(n:number)=>'$'+Math.round(n).toLocaleString('en-US');

/** Buyer: pick a structure, then adjust the filled-in terms and submit. */
export function OfferBuilder({listing,busy,submit}:{listing:{askingPrice:number;sde:number;sellerFinancing:boolean};busy:boolean;submit:(t:OfferTerms)=>Promise<void>|void}){
  const options=structuresFor(listing),[picked,setPicked]=useState<StructureKey|''>('');
  const chosen=options.find(o=>o.key===picked);
  const blank:OfferTerms={kind:'Indication of interest',price:listing.askingPrice,cashAtClose:listing.askingPrice,sellerNote:0,earnout:0,financing:'',closeDays:90,conditions:''};
  return <div className="ob">
    <p className="ob-lede">Start from a structure. Each one shows what you bring, what you borrow, and whether the business's earnings cover the payments. You can change every term before you submit.</p>
    <div className="ob-options" role="radiogroup" aria-label="Financing structures">{options.map(o=>{const blocked=o.blockers.length>0;return <button key={o.key} type="button" role="radio" aria-checked={picked===o.key} aria-disabled={blocked||undefined} disabled={blocked} className={'ob-option'+(picked===o.key?' is-picked':'')+(blocked?' is-blocked':'')} onClick={()=>{if(!blocked)setPicked(o.key);}}>
      <strong>{o.title}</strong><span className="ob-sum">{o.summary}</span>
      <dl><div><dt>You bring</dt><dd>{usd(o.buyerCash)}</dd></div>{o.loan>0&&<div><dt>Loan</dt><dd>{usd(o.loan)}</dd></div>}{o.sellerNote>0&&<div><dt>Seller note</dt><dd>{usd(o.sellerNote)}</dd></div>}{o.yearlyPayments>0&&<div><dt>Payments a year</dt><dd>{usd(o.yearlyPayments)}</dd></div>}</dl>
      {blocked?<span className="ob-cover is-warn">Not available as built: {o.blockers.join(' ')}</span>:<span className={'ob-cover'+(o.meetsCoverage?'':' is-warn')}>{coverageLine(o)}</span>}
    </button>;})}</div>
    {options.length>0&&<p className="ob-assume">{(chosen||options[0]).assumptions} Kalling doesn't lend or give lending advice.</p>}
    <TermsEditor key={picked||'blank'} busy={busy} initial={chosen?.terms||blank} submit={submit}/>
  </div>;
}

/** Owner: what each shared offer means in money, after Kalling's fee from the signed letter. */
export function OfferTakeHome({offers,letter,feeState='ready'}:{offers:SharedOffer[];letter?:{terms:LetterTerms;version:number};feeState?:'loading'|'ready'|'error'}){
  if(!offers.length)return null;
  // Without the letter we cannot say what the fee is, so no take-home figure is shown until it has loaded.
  if(feeState!=='ready')return <div className="ob-home" aria-label="What you take home"><h3>What each offer means for you</h3><p className="ob-caveat" role="status">{feeState==='loading'?'Loading your engagement letter, so Kalling’s fee can be included…':'We could not load your engagement letter just now, so take-home amounts are not shown. This page tries again shortly.'}</p></div>;
  return <div className="ob-home" aria-label="What you take home">
    <h3>What each offer means for you</h3>
    <div className="ob-home-grid">{offers.map(o=>{const h=takeHome(o.terms,letter);return <article key={o.id}>
      <h4>{o.label}</h4>
      <p className="ob-big"><span>{usd(h.atClose)}</span> at closing</p>
      <dl>
        <div><dt>Cash from the buyer at closing</dt><dd>{usd(h.cashAtClose)}</dd></div>
        {h.fee&&<div><dt>Kalling's fee due at closing</dt><dd>-{usd(h.feeAtClose)}</dd></div>}
        {h.note&&<div><dt>Seller note{h.note.monthly?`, ${usd(h.note.monthly)} a month`:''}</dt><dd>{usd(h.note.total??h.note.principal)}{h.note.total?' with interest':''}</dd></div>}
        {h.earnout&&<div><dt>Earnout, only if earned{h.fee?(h.earnout.fee?`, after ${usd(h.earnout.fee)} fee`:', no further fee'):''}</dt><dd>up to {usd(h.earnout.afterFee)}</dd></div>}
        <div className="ob-total"><dt>If everything is paid</dt><dd>{usd(h.ifAllPaid)}</dd></div>
      </dl>
      {h.note&&<p className="ob-note">{h.note.explained}</p>}
    </article>;})}</div>
    {(()=>{const h=takeHome(offers[0].terms,letter);return <p className="ob-caveat">{h.fee?`Kalling's fee: ${h.fee.pct}% at closing${h.fee.min?`, minimum ${usd(h.fee.min)}`:''}${h.fee.retainer?`, less the ${usd(h.fee.retainer)} retainer`:''}, from ${h.fee.source.charAt(0).toLowerCase()+h.fee.source.slice(1)}. `:''}{h.caveat}</p>;})()}
  </div>;
}
