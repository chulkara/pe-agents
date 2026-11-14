import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateFoundationReport,loadFoundationReport} from '../scripts/hosted-owner-uploads.mjs';
import {deployedCloudProject} from '../lib/cloudProject.ts';
const report=()=>({project:deployedCloudProject.url,status:'passed',mode:'run',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:24},()=>({status:'passed'})),fixtureManifest:{project:deployedCloudProject.url,fixture:randomUUID(),firms:[randomUUID(),randomUUID()]}});
test('owner acceptance requires the completed real-transport foundation report and distinct valid fixture IDs',()=>{
  const valid=report();assert.equal(validateFoundationReport(valid).firmA,valid.fixtureManifest.firms[0]);
  for(const change of [x=>{x.project='https://another.supabase.co';},x=>{x.status='failed';},x=>{x.transport.actualAuthenticatedTransport=false;},x=>{x.mode='doctor';},x=>{x.fixtureManifest.firms[1]=x.fixtureManifest.firms[0];},x=>{x.fixtureManifest.fixture='untrusted-path';},x=>{x.checks[0].status='failed';},x=>{x.checks=[];}]){const x=report();change(x);assert.throws(()=>validateFoundationReport(x));}
});
test('malformed or mistakenly selected private files cannot leak through the report parser error',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kalling-owner-report-')),path=join(dir,'report.json');
  try{await writeFile(path,'{"password":"Fictional-private-parser-fragment", invalid}');await assert.rejects(loadFoundationReport(path),e=>e.message==='Cannot read the foundation report as JSON. Its contents are not printed.');await writeFile(path,JSON.stringify(report()));assert.equal((await loadFoundationReport(path)).status,'passed');}
  finally{await rm(dir,{recursive:true,force:true});}
});
