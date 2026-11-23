import {useMemo,useState} from 'react';
import {money,type HvacInputs} from '../../lib/hvacValuation';
import {addBackCategories,addBackImpact,noAddBacks,type AddBackKey,type AddBackValues} from '../../lib/addBacks';

/** Lets an owner see what documented personal or one-time costs would add to the estimate, then fold them in. */
export function AddBackFinder({inputs,onApply}:{inputs:HvacInputs;onApply:(total:number)=>void}){
  const [vals,setVals]=useState<AddBackValues>(noAddBacks);
  const r=useMemo(()=>{try{return addBackImpact(inputs,vals);}catch{return null;}},[inputs,vals]);
  if(!r)return null;
  const set=(k:AddBackKey)=>(e:React.ChangeEvent<HTMLInputElement>)=>setVals(v=>({...v,[k]:Number(e.target.value)}));
  return <section className="ks-addbacks" aria-label="Find add-backs">
    <h2>Costs a buyer wouldn’t have</h2>
    <p className="ks-fine">Personal and one-time costs the business paid count as earnings to a buyer. Slide to see what they’re worth.</p>
    {addBackCategories.map(c=><label key={c.key} className="ks-addback">
      <span>{c.label}<b>{vals[c.key]?money(vals[c.key]):"$0"}</b></span>
      <input type="range" min={0} max={c.max} step={c.step} value={vals[c.key]} onChange={set(c.key)} aria-valuetext={money(vals[c.key])+' a year'}/>
      <small>{c.hint}</small>
    </label>)}
    {r.total>0?<div className="ks-addback-result" role="status">
      <p><b>+{money(r.sdeChange)}</b> a year in earnings moves your estimate to <b>{money(r.after.low)} to {money(r.after.high)}</b>, about <b>+{money(r.midChange)}</b> at the midpoint.</p>
      {r.bandChanged&&<p className="ks-fine">That moves the company into a higher size band: {r.after.band}.</p>}
      <p className="ks-fine">Only add-backs you can show in your books or tax returns hold up with a buyer’s accountant or a lender.</p>
      <button type="button" className="ks-btn" onClick={()=>{onApply(r.total);setVals(noAddBacks);}}>Add {money(r.total)} to my estimate</button>
    </div>:<p className="ks-fine">Nothing added yet.</p>}
  </section>;
}
