import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {servicePaths,stageRuntime,launchPlist,installService,inspectService,restartService,uninstallService,acquireServiceLock,serviceReceipt,privateJson,command} from '../scripts/worker-service.mjs';
import {createWorker} from '../scripts/worker-core.mjs';

const fixture=async()=>{const home=await mkdtemp(join(tmpdir(),'kalling-login-service-'));return {home,paths:servicePaths({home,profile:'pilot'}),close:()=>rm(home,{recursive:true,force:true})};};
function launchd(){let registered=false,pid=100,failBootstrap=0,programs='';const calls=[];return {calls,get pid(){return pid;},failNext(){failBootstrap++;},run:async(file,args)=>{
  calls.push([file,...args]);if(file===process.execPath)return command(file,args);assert.equal(file,'launchctl');const action=args[0];
  if(action==='print')return {code:registered?0:113,out:registered?'state = running\n pid = '+pid+'\n'+programs:''};
  if(action==='bootstrap'){if(failBootstrap){failBootstrap--;return {code:5,err:'Simulated registration failure'};}registered=true;pid++;if(args[2])programs=(await readFile(args[2],'utf8')).replaceAll('&amp;','&').replaceAll('&quot;','\"');return {code:0};}
  if(action==='bootout'){registered=false;return {code:0};}if(action==='kill'){pid++;return {code:0};}throw Error('Unexpected command');
}};}
async function receipt(paths,pid,active=null){const w={status:()=>({version:'test',startedAt:new Date().toISOString(),model:{name:'qwen3:4b',ready:true},cloud:{status:'online',lastContact:new Date().toISOString()}}),state:{model:{digest:'a'.repeat(64)},config:{cloud:{token:'never-print-this-secret',firmId:'firm',workerId:'worker'}},active}};await privateJson(join(paths.stateDir,'service-status.json'),serviceReceipt(w,paths,{pid,instance:'test-instance'}));}

test('standalone runtime loads without node_modules, copies no credentials and rejects modified release bytes',async()=>{
 const f=await fixture();try{const runtime=await stageRuntime(resolve('.'),f.paths);assert.ok(!runtime.release.includes('Downloads'));assert.equal((await stat(runtime.script)).mode&0o077,0);const out=await command(process.execPath,['--experimental-strip-types',runtime.script,'help']);assert.equal(out.code,0);assert.match(out.out,/local Qwen only/);await assert.rejects(readFile(join(runtime.release,'node_modules','package.json')),/ENOENT/);await assert.rejects(readFile(join(runtime.release,'worker.json')),/ENOENT/);
 await writeFile(runtime.script,'modified');await assert.rejects(stageRuntime(resolve('.'),f.paths),/runtime was changed/);
 }finally{await f.close();}
});
test('symlink source and profile traversal are refused before registration',async()=>{
 const f=await fixture();try{assert.throws(()=>servicePaths({home:f.home,profile:'../../elsewhere'}));const src=join(f.home,'source');await mkdir(join(src,'scripts'),{recursive:true});await mkdir(join(src,'lib'));await symlink(process.execPath,join(src,'scripts','unsafe.mjs'));await assert.rejects(stageRuntime(src,f.paths),/symbolic links/);}finally{await f.close();}
});
test('separate launch agent preserves existing credentials, refuses busy restart and rolls back a failed upgrade',async()=>{
 const f=await fixture(),d=launchd();try{
 const original=servicePaths({home:f.home});await mkdir(original.stateDir);await writeFile(join(original.stateDir,'worker.json'),'private-original-token');
 const installed=await installService(f.paths,{sourceRoot:resolve('.'),run:d.run,uid:501});assert.ok(installed.runtime.script.startsWith(f.paths.root));const plist=await readFile(f.paths.plist,'utf8');assert.match(plist,/<key>RunAtLoad<\/key><true\/>/);assert.match(plist,/<key>KeepAlive<\/key><true\/>/);assert.match(plist,/--profile/);assert.ok(!plist.includes('private-original-token'));assert.equal((await stat(f.paths.plist)).mode&0o077,0);
 await receipt(f.paths,d.pid,{id:'running-job',kind:'execution'});await assert.rejects(restartService(f.paths,{run:d.run,uid:501}),/idle managed/);await assert.rejects(uninstallService(f.paths,{run:d.run,uid:501}),/idle/);assert.equal(d.calls.filter(c=>c[1]==='kill').length,0);
 await receipt(f.paths,d.pid);const before=await restartService(f.paths,{run:d.run,uid:501});assert.notEqual(d.pid,before.pid);assert.equal((await inspectService(f.paths,{run:d.run,uid:501})).fresh,false,'stale receipt cannot prove a restart');
 await receipt(f.paths,d.pid);d.failNext();await assert.rejects(installService(f.paths,{sourceRoot:resolve('.'),run:d.run,uid:501,model:'qwen3:8b'}),/could not register/);assert.equal(await readFile(f.paths.plist,'utf8'),plist);assert.equal(JSON.parse(await readFile(f.paths.manifest,'utf8')).model,'qwen3:4b');assert.equal(await readFile(join(original.stateDir,'worker.json'),'utf8'),'private-original-token');
 await receipt(f.paths,d.pid);await uninstallService(f.paths,{run:d.run,uid:501});assert.equal((await inspectService(f.paths,{run:d.run,uid:501})).registered,false);assert.equal(await readFile(join(original.stateDir,'worker.json'),'utf8'),'private-original-token');
 }finally{await f.close();}
});
test('unknown existing login items and registered labels are preserved',async()=>{
 const f=await fixture(),d=launchd();try{await mkdir(join(f.home,'Library','LaunchAgents'),{recursive:true});await writeFile(f.paths.plist,'legacy service');await assert.rejects(installService(f.paths,{sourceRoot:resolve('.'),run:d.run}),/existing worker installation/);assert.equal(await readFile(f.paths.plist,'utf8'),'legacy service');await rm(f.paths.plist);await d.run('launchctl',['bootstrap']);await assert.rejects(installService(f.paths,{sourceRoot:resolve('.'),run:d.run}),/unrecognised service/);assert.equal(d.calls.filter(c=>c[1]==='bootout').length,0);}finally{await f.close();}
});
test('service lock rejects a concurrent worker, reclaims a dead process and never removes another owner’s lock',async()=>{
 const f=await fixture();try{const a=await acquireServiceLock(f.paths,{pid:101,alive:()=>true});await assert.rejects(acquireServiceLock(f.paths,{pid:102,alive:()=>true}),/already uses/);const b=await acquireServiceLock(f.paths,{pid:102,alive:()=>false});await a.release();assert.equal(JSON.parse(await readFile(b.ownerFile,'utf8')).instance,b.instance);await b.release();await assert.rejects(stat(join(f.paths.stateDir,'service.lock')),/ENOENT/);}finally{await f.close();}
});
test('status receipt excludes credentials, prompts and company identities',async()=>{
 const f=await fixture();try{await receipt(f.paths,123);const s=await readFile(join(f.paths.stateDir,'service-status.json'),'utf8');assert.ok(!s.includes('never-print-this-secret'));assert.equal((await stat(join(f.paths.stateDir,'service-status.json'))).mode&0o077,0);}finally{await f.close();}
});
test('one-shot pairing preserves configured models and does not claim, heartbeat or invoke a model',async()=>{
 const f=await fixture();try{await mkdir(f.paths.stateDir,{recursive:true});await privateJson(join(f.paths.stateDir,'worker.json'),{models:{cim:'qwen3:14b'}});let calls=0;const worker=createWorker({stateDir:f.paths.stateDir,request:()=>{throw Error('No model request permitted');},cloudFactory:()=>({pair:async()=>{calls++;return {token:'private-test-token',worker_id:'worker',firm_id:'firm',name:'Pilot'};},heartbeat:()=>{throw Error('No heartbeat permitted');},claim:()=>{throw Error('No claim permitted');}})});await worker.pair('ABCDEF-ABCDEF-ABCDEF-ABCDEF',undefined,{activate:false});assert.equal(calls,1);assert.equal(worker.state.config.models.cim,'qwen3:14b');assert.equal(worker.state.model.checkedAt,0);}finally{await f.close();}
});
