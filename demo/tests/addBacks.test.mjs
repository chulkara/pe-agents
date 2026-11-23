import {test} from 'node:test';import assert from 'node:assert/strict';import * as A from '../lib/addBacks.ts';
const base={revenue:2000000,ownerPay:150000,netProfit:220000,addBacks:0,maintenancePct:45,agreements:600,commercialPct:15,newConstructionPct:5,technicians:6,ownerRole:'key-relationships',topCustomerPct:8,years:15,trend:'flat',licenseHolder:'owner-only'};
test('no add-backs changes nothing',()=>{const r=A.addBackImpact(base,A.noAddBacks);assert.equal(r.total,0);assert.equal(r.midChange,0);});
test('each dollar raises SDE one for one and the range by roughly the multiple',()=>{
 const r=A.addBackImpact(base,{...A.noAddBacks,vehicle:12000,travel:8000});
 assert.equal(r.total,20000);assert.equal(r.sdeChange,20000);assert.equal(r.bandChanged,false);
 const m=(r.after.multipleLow+r.after.multipleHigh)/2;assert.ok(Math.abs(r.midChange-20000*m)<=15000,`${r.midChange} vs ${20000*m}`);
});
test('enough add-backs can move the company into a higher size band',()=>{
 const small={...base,ownerPay:100000,netProfit:130000};const r=A.addBackImpact(small,{...A.noAddBacks,family:40000});
 assert.equal(r.bandChanged,true);assert.ok(r.midChange>40000*3);
});
test('negative values are ignored and categories have sensible limits',()=>{
 assert.equal(A.addBackImpact(base,{...A.noAddBacks,vehicle:-5000}).total,0);
 for(const c of A.addBackCategories)assert.ok(c.max>0&&c.max%c.step===0);
});
