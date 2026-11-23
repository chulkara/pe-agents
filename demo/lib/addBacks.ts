// Add-backs an owner may have missed: personal or one-time costs the business paid that a buyer
// would not. Each dollar added back raises seller's discretionary earnings, and the estimate
// re-runs with the same rules, so a bigger SDE can also move the company into a higher size band.
// An add-back only counts with a buyer or lender if it is documented in the books or tax returns.
import {estimateHvacValue,type HvacInputs} from './hvacValuation.ts';

export type AddBackKey='vehicle'|'family'|'oneTime'|'travel';
export const addBackCategories:{key:AddBackKey;label:string;hint:string;max:number;step:number}[]=[
  {key:'vehicle',label:'Personal vehicles',hint:'Cars, fuel and insurance for vehicles that are not used for jobs.',max:60000,step:1000},
  {key:'family',label:'Family on payroll',hint:'Pay above market for relatives, or pay to relatives who won’t stay after a sale.',max:150000,step:5000},
  {key:'oneTime',label:'One-time legal or equipment costs',hint:'A settled lawsuit, a one-off repair, a move. Not routine equipment replacement.',max:100000,step:2500},
  {key:'travel',label:'Personal travel and meals',hint:'Trips, meals and memberships that were personal, not for customers or training.',max:40000,step:1000},
];
export type AddBackValues=Record<AddBackKey,number>;
export const noAddBacks:AddBackValues={vehicle:0,family:0,oneTime:0,travel:0};

export function addBackImpact(inputs:HvacInputs,extra:AddBackValues){
  const total=Object.values(extra).reduce((n,v)=>n+Math.max(0,v||0),0);
  const before=estimateHvacValue(inputs),after=estimateHvacValue({...inputs,addBacks:(inputs.addBacks||0)+total});
  return {total,before,after,sdeChange:after.sde-before.sde,lowChange:after.low-before.low,midChange:after.mid-before.mid,highChange:after.high-before.high,bandChanged:after.band!==before.band};
}
