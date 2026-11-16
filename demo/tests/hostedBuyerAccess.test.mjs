import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateBuyerFixture,loadBuyerFixture,fictionalBuyerPdf,verifyStampedPages} from '../scripts/hosted-buyer-access.mjs';
import {watermarkPdf} from '../lib/pdf.ts';
import {deployedCloudProject} from '../lib/cloudProject.ts';
function fixtures(){const f=randomUUID(),firm=randomUUID(),otherFirm=randomUUID(),project=deployedCloudProject.url;return {foundation:{project,status:'passed',mode:'run',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:24},()=>({status:'passed'})),fixtureManifest:{project,fixture:randomUUID(),firms:[firm,otherFirm]}},fixture:{project,mode:'buyer-access',status:'prepared',fixture:f,firm,otherFirm,company:'fictional-buyer-access-'+f,listing:randomUUID(),listingNumber:'KL-910015',expectedHeadline:'Sample HVAC company for software validation'}};}
test('buyer acceptance accepts only an exact prepared sample fixture linked to the completed foundation',()=>{
  const {fixture,foundation}=fixtures();assert.equal(validateBuyerFixture(fixture,foundation).listing,fixture.listing);
  for(const mutate of [x=>x.project='https://unrelated.supabase.co',x=>x.status='passed',x=>x.firm=randomUUID(),x=>x.otherFirm=randomUUID(),x=>x.company='real-company',x=>x.listing='invalid',x=>x.listingNumber='not-a-listing',x=>x.expectedHeadline='Real deal']){const copy=structuredClone(fixture);mutate(copy);assert.throws(()=>validateBuyerFixture(copy,foundation));}
});
test('a mistaken private file is never echoed by the buyer-fixture parser',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kalling-buyer-fixture-')),path=join(dir,'fixture.json'),{foundation,fixture}=fixtures();
  try{await writeFile(path,'{"password":"Fictional-private-fragment",invalid}');await assert.rejects(loadBuyerFixture(path,foundation),e=>e.message==='Cannot read the buyer fixture as JSON. Its contents are not printed.');await writeFile(path,JSON.stringify(fixture));assert.equal((await loadBuyerFixture(path,foundation)).fixture,fixture.fixture);}finally{await rm(dir,{recursive:true,force:true});}
});
test('stamped output preserves both source pages and includes the buyer identity in every page content stream',async()=>{
  const original=await fictionalBuyerPdf(randomUUID(),'Fictional overview'),mark='Fictional Buyer, buyer@kalling-validation.invalid, 2026-11-15. Confidential, Kalling data room';
  const stamped=Buffer.from(await (await watermarkPdf(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength),mark)).arrayBuffer());
  assert.equal(await verifyStampedPages(original,stamped,mark),2);await assert.rejects(verifyStampedPages(original,original,mark),/stamped document/);await assert.rejects(verifyStampedPages(original,stamped,'Other Buyer'),/every downloaded page/);
});
