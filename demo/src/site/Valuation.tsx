import {useMemo,useState,type FormEvent} from 'react';
import {estimateHvacValue,money,valuationSources,type HvacInputs,type Valuation} from '../../lib/hvacValuation';
import {regions,type Region} from '../../lib/brokerage';
import {useSession,href,Arrow} from './BrokerSite';

/** The estimate as a figure: large numbers over a scale, the range drawn as a pill. */
export function Gauge({v,caption}:{v:Valuation|null;caption?:string}){
  const max=v?Math.max(1e6,Math.ceil(v.high*1.3/500000)*500000):4e6,pct=(x:number)=>Math.min(100,Math.max(0,x/max*100));
  return <figure className="ks-gauge" aria-label={v?`Estimated value ${money(v.low)} to ${money(v.high)}`:'Enter your numbers to see an estimate'}>
    <figcaption><span className="ks-gauge-label">Estimated value</span><strong>{v?`${money(v.low)}–${money(v.high)}`:'—'}</strong><span className="ks-gauge-sub">{v?(caption||`${v.multipleLow}× to ${v.multipleHigh}× earnings of ${money(v.sde)}`):'Your estimate appears here.'}</span></figcaption>
    <div className="ks-scale" aria-hidden="true">
      <div className="ks-scale-track">{v&&<span className="ks-scale-pill" style={{left:pct(v.low)+'%',width:Math.max(4,pct(v.high)-pct(v.low))+'%'}}/>}{v&&<span className="ks-scale-mid" style={{left:pct(v.mid)+'%'}}/>}</div>
      <div className="ks-scale-ticks"><span>$0</span><span>{money(max/2)}</span><span>{money(max)}</span></div>
    </div>
  </figure>;
}

const quickDefaults:HvacInputs={revenue:2000000,ownerPay:150000,netProfit:220000,addBacks:0,maintenancePct:45,agreements:600,commercialPct:15,newConstructionPct:5,technicians:6,ownerRole:'key-relationships',topCustomerPct:8,years:15,trend:'flat',licenseHolder:'owner-only'};
/** Hero instrument: three questions, a live dial. */
export function QuickEstimate(){
  const [i,setI]=useState(quickDefaults);
  const v=useMemo(()=>{try{return estimateHvacValue(i);}catch{return null;}},[i]);
  const params=new URLSearchParams({revenue:String(i.revenue),earnings:String(i.ownerPay+i.netProfit),service:String(i.maintenancePct)});
  return <div className="ks-quick">
    <Gauge v={v}/>
    <label><span>Revenue last year <output>{money(i.revenue)}</output></span><input type="range" min={300000} max={12000000} step={50000} value={i.revenue} onChange={e=>setI({...i,revenue:+e.target.value,netProfit:Math.round(+e.target.value*0.11),ownerPay:Math.min(250000,Math.round(+e.target.value*0.075))})}/></label>
    <label><span>Owner pay plus profit <output>{money(i.ownerPay+i.netProfit)}</output></span><input type="range" min={50000} max={3000000} step={10000} value={i.ownerPay+i.netProfit} onChange={e=>setI({...i,netProfit:Math.max(0,+e.target.value-i.ownerPay)})}/></label>
    <label><span>Revenue from service and maintenance <output>{i.maintenancePct}%</output></span><input type="range" min={0} max={100} step={5} value={i.maintenancePct} onChange={e=>setI({...i,maintenancePct:+e.target.value})}/></label>
    <a className="ks-btn ks-btn-dark" href={href('/value?'+params)}>Refine this estimate<Arrow/></a>
  </div>;
}

const num=(s:FormDataEntryValue|null)=>Math.max(0,Number(String(s||'').replace(/[$,\s]/g,''))||0);
export function ValuePage(){
  const {store}=useSession();
  const q=new URLSearchParams(location.hash.split('?')[1]||'');
  const [inputs,setInputs]=useState<HvacInputs>({...quickDefaults,revenue:num(q.get('revenue'))||quickDefaults.revenue,netProfit:Math.max(0,(num(q.get('earnings'))||quickDefaults.ownerPay+quickDefaults.netProfit)-quickDefaults.ownerPay),maintenancePct:q.has('service')?num(q.get('service')):quickDefaults.maintenancePct});
  const [error,setError]=useState(''),[sent,setSent]=useState(''),[busy,setBusy]=useState(false);
  const calc=useMemo(()=>{try{return {v:estimateHvacValue(inputs),err:''};}catch(e){return {v:null,err:(e as Error).message};}},[inputs]);const v=calc.v;
  const set=(k:keyof HvacInputs)=>(e:{target:{value:string}})=>setInputs(x=>({...x,[k]:typeof quickDefaults[k]==='number'?num(e.target.value):e.target.value}));
  const field=(k:keyof HvacInputs,label:string,hint?:string,suffix='')=><label className="ks-field"><span>{label}</span>{suffix?<span className="ks-affix"><input inputMode="numeric" value={String(inputs[k])} onChange={set(k)}/><em>{suffix}</em></span>:<span className="ks-affix"><em>$</em><input inputMode="numeric" value={Number(inputs[k]).toLocaleString()} onChange={set(k)}/></span>}{hint&&<small>{hint}</small>}</label>;
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);setBusy(true);setError('');
    try{await store.submitLead({name:String(d.get('name')),email:String(d.get('email')),phone:String(d.get('phone')),businessName:String(d.get('businessName')),region:String(d.get('region')) as Region,timing:String(d.get('timing')),message:String(d.get('message')),source:'valuation',consent:d.get('consent')==='on',valuation:v?{sde:v.sde,low:v.low,mid:v.mid,high:v.high,revenue:inputs.revenue}:undefined});setSent(String(d.get('name')).split(' ')[0]);}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  return <div className="ks-value">
    <section className="ks-wrap ks-page-head"><h1 className="ks-display ks-display-s">What is your HVAC company worth?</h1><p>Answer what you know. The estimate updates as you type, and every adjustment is explained. Nothing is sent to anyone unless you ask for a review.</p></section>
    <div className="ks-wrap ks-value-grid">
      <form className="ks-value-form" onSubmit={e=>e.preventDefault()}>
        <fieldset><legend>Earnings</legend>
          {field('revenue','Revenue last year')}
          {field('ownerPay','What you pay yourself','Salary, benefits, vehicle and personal costs the business pays for.')}
          {field('netProfit','Pre-tax profit','From your tax return or profit and loss statement.')}
          {field('addBacks','One-time or non-business costs','A lawsuit, a one-off repair, a family member who won’t stay. Optional.')}
        </fieldset>
        <fieldset><legend>Revenue mix</legend>
          {field('maintenancePct','Revenue from service, repairs and maintenance','Everything except new installs for builders and big one-off projects.','%')}
          {field('agreements','Active maintenance agreements',undefined,'plans')}
          {field('commercialPct','Revenue from commercial customers',undefined,'%')}
          {field('newConstructionPct','Revenue from new construction or builders',undefined,'%')}
          {field('topCustomerPct','Largest single customer’s share',undefined,'%')}
        </fieldset>
        <fieldset><legend>Team and history</legend>
          {field('technicians','Field technicians, not counting you',undefined,'techs')}
          {field('years','Years in business',undefined,'years')}
          <label className="ks-field"><span>Your role day to day</span><select value={inputs.ownerRole} onChange={set('ownerRole')}><option value="runs-everything">I run sales, dispatch and the hardest jobs</option><option value="key-relationships">A team runs jobs; I keep key relationships</option><option value="manager-runs-day-to-day">A manager runs daily operations</option></select></label>
          <label className="ks-field"><span>Who holds the master HVACR license</span><select value={inputs.licenseHolder} onChange={set('licenseHolder')}><option value="owner-only">Only me</option><option value="owner-and-employee">Me and an employee</option><option value="employee">An employee</option></select></label>
          <label className="ks-field"><span>Revenue over the last three years</span><select value={inputs.trend} onChange={set('trend')}><option value="growing">Growing</option><option value="flat">About the same</option><option value="declining">Declining</option></select></label>
        </fieldset>
      </form>
      <aside className="ks-value-result" aria-live="polite">
        <Gauge v={v}/>
        {calc.err&&<p className="ks-error">{calc.err}</p>}
        {v&&<>
          <p className="ks-value-band">{v.band}. Starting range before adjustments, then:</p>
          <ul className="ks-adjust">{v.adjustments.map(a=><li key={a.label} className={a.effect>0?'up':'down'}><span>{a.label}</span><b>{a.effect>0?'+':'−'}{Math.abs(a.effect).toFixed(2)}×</b><small>{a.why}</small></li>)}</ul>
          {v.warnings.map(w=><p key={w} className="ks-warn">{w}</p>)}
          <h2>What would raise it</h2>
          <ul className="ks-ready">{v.readiness.map(r=><li key={r.label}><span>{r.label}</span><span className="ks-meter" aria-label={`${r.score} of 5`}>{[1,2,3,4,5].map(n=><i key={n} className={n<=r.score?'on':''}/>)}</span>{r.score<4&&<small>{r.tip}</small>}</li>)}</ul>
          <p className="ks-fine">An estimate from public industry ranges, not an appraisal or an offer. Sources: {valuationSources.map((s,i)=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}{i<valuationSources.length-1?'; ':''}</a>)}.</p>
        </>}
      </aside>
    </div>
    <section className="ks-wrap ks-review" id="review">
      {sent?<div className="ks-thanks" role="status"><h2>Thank you, {sent}.</h2><p>An advisor will call or email within one business day to talk through your numbers. The conversation is confidential, and there’s no obligation.</p></div>
      :<form onSubmit={submit} className="ks-review-form"><div><h2>Get a confidential review</h2><p>An advisor checks your numbers against recent HVAC sales, tells you what buyers will ask about, and whether now is the right time. No fee and no obligation. Your employees, customers and competitors won’t hear about it.</p></div>
        <div className="ks-review-fields">
          <label className="ks-field"><span>Your name</span><input name="name" required autoComplete="name"/></label>
          <label className="ks-field"><span>Email</span><input name="email" type="email" required autoComplete="email"/></label>
          <label className="ks-field"><span>Phone · optional</span><input name="phone" type="tel" autoComplete="tel"/></label>
          <label className="ks-field"><span>Company name · optional</span><input name="businessName"/></label>
          <label className="ks-field"><span>Where you operate</span><select name="region" required defaultValue="">{<option value="" disabled>Choose a region</option>}{regions.map(r=><option key={r}>{r}</option>)}</select></label>
          <label className="ks-field"><span>When might you sell?</span><select name="timing"><option>Just exploring</option><option>Within a year</option><option>In 1–3 years</option><option>As soon as possible</option></select></label>
          <label className="ks-field ks-wide"><span>Anything we should know · optional</span><textarea name="message" rows={3} maxLength={2000}/></label>
          <label className="ks-check ks-wide"><input type="checkbox" name="consent" required/>Contact me about selling my company. My estimate is shared with the advisor.</label>
          {error&&<p className="ks-error ks-wide">{error}</p>}
          <button className="ks-btn ks-btn-primary" disabled={busy}>Request a confidential review</button>
        </div></form>}
    </section>
  </div>;
}
