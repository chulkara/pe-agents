import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as A from '../lib/anonymity.ts';
import {publishProblems} from '../lib/brokerage.ts';

const cases=JSON.parse(await readFile(new URL('./fixtures/anonymity-cases.json',import.meta.url),'utf8'));
const core=['business','owner','town','domain','phone','email'];

test('shared fixture: the browser checker blocks exactly what the database blocks',()=>{
  for(const c of cases){const kinds=[...new Set(A.blocking(A.checkTeaser({summary:c.text},{...c.ctx,region:'Central Jersey'})).map(f=>f.kind).filter(k=>core.includes(k)))].sort();
    assert.deepEqual(kinds,[...c.blocks].sort(),c.name);}
});
test('findings explain why and suggest a rewrite',()=>{
  const f=A.checkTeaser({headline:'HVAC company in Edison, NJ'},{businessName:'Russo Heating & Air',region:'Central Jersey'});
  assert.equal(f[0].kind,'town');assert.match(f[0].why,/narrows the location/);assert.match(f[0].suggestion,/Central Jersey/);
  assert.equal(A.applySuggestion('HVAC company in Edison, NJ',f[0],'Central Jersey'),'HVAC company in Central Jersey, NJ');
  assert.deepEqual(A.nameVariants('Russo Heating & Air, LLC').distinctive,['Russo']);
});
test('addresses, license numbers, customers, employees, founding years and website phrases',()=>{
  const ctx={businessName:'Russo Heating & Air',customerNames:['Brookside Apartments'],employeeNames:['Luis Ortega'],licenseNumbers:['19HC00123400'],websitePhrases:['We have proudly served families across the region with honest heating and cooling since day one']};
  const f=A.checkTeaser({summary:'Office at 12 Main Street. License 19HC00123400. Serves Brookside Apartments; Luis Ortega leads the techs. Founded in 1998. We have proudly served families across the region with honest heating and cooling.'},ctx);
  const k=f.map(x=>x.kind+':'+x.severity);
  for(const want of ['address:block','license:block','customer:block','employee:block','founding:warn','phrase:warn'])assert.ok(k.includes(want),want);
});
test('memorandum mode allows the name but catches personal data',()=>{
  const ctx={businessName:'Russo Heating & Air',customerNames:['Brookside Apartments'],employeeNames:['Luis Ortega'],businessEmail:'office@russohvac.test'};
  assert.equal(A.checkConfidential({s:'Russo Heating & Air serves Central Jersey.'},ctx).length,0);
  const f=A.checkConfidential({s:'SSN 123-45-6789. Account number 123456789012. DOB: 4/5/1961. Write to pat.russo@gmail.com or office@russohvac.test. Home at 44 Oak Lane. Brookside Apartments and Luis Ortega.'},ctx);
  for(const want of ['ssn','bank','dob','personal-email','address','customer','employee'])assert.ok(f.some(x=>x.kind===want),want);
  assert.ok(!f.some(x=>x.text==='office@russohvac.test'));
});
test('publishing checks still block identifying text',()=>{
  const l={headline:'Edison residential HVAC company',summary:'x'.repeat(130),reason:'',askingPrice:1,revenue:1,sde:1,highlights:['a','b','c'],growth:[],confidential:{businessName:'Russo Heating & Air',city:'Edison',website:'',details:''}};
  assert.ok(publishProblems(l).some(p=>/edison/i.test(p)));
});
test('the database migration carries the same town list and generic words',async()=>{
  const sql=await readFile(new URL('../production/migrations/008_listing_anonymity.sql',import.meta.url),'utf8');
  for(const t of A.allTowns)assert.ok(sql.includes("'"+t.toLowerCase()+"'"),t);
});
