import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateFoundationReport,loadFoundationReport,validateOwnerChangeReport,loadOwnerChangeReport,ownerChangeCheck,recheckOwnerRevocation} from '../scripts/hosted-owner-uploads.mjs';
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
function incomplete(foundation){
  const fixture=randomUUID(),portal=randomUUID();
  return {project:deployedCloudProject.url,mode:'owner-uploads',status:'failed',checks:[...Array.from({length:48},()=>({status:'passed'})),{status:'failed',name:ownerChangeCheck}],fixtureManifest:{fixture,firm:foundation.fixtureManifest.firms[0],company:'fictional-owner-upload-'+fixture,portals:[portal],letter:randomUUID(),files:Array.from({length:3},()=>({id:randomUUID(),bucket:'kalling-portal',path:[portal,randomUUID(),randomUUID()].join('/'),sha256:'a'.repeat(64)}))}};
}
test('focused revocation recheck is limited to the exact 48-check fictional partial fixture',()=>{
  const foundation=report(),previous=incomplete(foundation),p=validateOwnerChangeReport(previous,foundation);
  assert.equal(p.portal,previous.fixtureManifest.portals[0]);assert.equal(p.file.id,previous.fixtureManifest.files[1].id);assert.equal(p.priorPassedChecks,48);
  for(const change of [x=>{x.project='https://unrelated.supabase.co';},x=>{x.mode='run';},x=>{x.status='passed';},x=>{x.checks.length=16;},x=>{x.checks[12].status='failed';},x=>{x.checks[48].name='Different failure';},x=>{x.fixtureManifest.portalClosed=true;},x=>{x.fixtureManifest.firm=randomUUID();},x=>{x.fixtureManifest.company='real-business';},x=>{x.fixtureManifest.letter='invalid';},x=>{x.fixtureManifest.files[1].bucket='kalling-private';},x=>{x.fixtureManifest.files[1].path=randomUUID()+'/'+randomUUID()+'/'+randomUUID();},x=>{x.fixtureManifest.files[1].path+='/extra';},x=>{x.fixtureManifest.files[1].sha256='invalid';},x=>{x.fixtureManifest.files[1].id=x.fixtureManifest.files[0].id;}]){
    const altered=structuredClone(previous);change(altered);assert.throws(()=>validateOwnerChangeReport(altered,foundation));
  }
});
test('focused report errors hide private contents and invalid input never creates a client',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kalling-revocation-report-')),path=join(dir,'report.json'),foundation=report();
  try{
    await writeFile(path,'{"password":"Fictional-private-parser-fragment", invalid}');await assert.rejects(loadOwnerChangeReport(path,foundation),e=>e.message==='Cannot read the owner-upload report as JSON. Its contents are not printed.');
    const previous=incomplete(foundation);await writeFile(path,JSON.stringify(previous));assert.equal((await loadOwnerChangeReport(path,foundation)).checks.length,49);
    let clients=0;await assert.rejects(recheckOwnerRevocation(deployedCloudProject,{},foundation,previous,()=>{}, {},{makeClient:()=>{clients++;throw Error('Must never create a client');}}),/two existing confirmed fictional accounts/);assert.equal(clients,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
