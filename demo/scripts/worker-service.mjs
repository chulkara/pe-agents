// Private, dependency-free macOS login service. Never copies credentials into a release.
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,rm,readdir,lstat,chmod,open,rmdir} from 'node:fs/promises';
import {homedir,userInfo} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

export const serviceSchema=1;
const ok=(v,m)=>{if(!v)throw Error(m);};
export const command=(file,args)=>new Promise(resolve=>execFile(file,args,{timeout:30000,maxBuffer:1024*1024},(e,stdout,stderr)=>resolve({code:e?.code??0,out:String(stdout||''),err:String(stderr||'')})));
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const exists=async path=>{try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
export async function privateJson(path,data){await mkdir(dirname(path),{recursive:true,mode:0o700});const tmp=path+'.tmp-'+randomUUID();try{await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(tmp,path);}finally{await rm(tmp,{force:true});}}
export async function readJson(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}

export function servicePaths({home=homedir(),profile='default',stateDir}={}){
  ok(['default','pilot'].includes(profile),'Use --profile default or --profile pilot.');
  const root=join(home,'Library','Application Support','Kalling','worker-'+profile),label='com.kalling.worker'+(profile==='pilot'?'.pilot':'');
  return {profile,root,label,stateDir:stateDir|| (profile==='default'?join(home,'.kalling-agent'):join(root,'state')),
    logDir:join(home,'Library','Logs','Kalling',...(profile==='pilot'?['pilot']:[])),plist:join(home,'Library','LaunchAgents',label+'.plist'),manifest:join(root,'service.json')};
}

/** Copy code only, using a content-addressed directory so an old Downloads ZIP is expendable. */
export async function stageRuntime(sourceRoot,paths,{node=process.execPath,run=command}={}){
  const files=[];
  async function walk(dir){for(const name of (await readdir(join(sourceRoot,dir))).sort()){
    const rel=join(dir,name),s=await lstat(join(sourceRoot,rel));
    ok(!s.isSymbolicLink(),'Worker source cannot contain symbolic links.');
    if(s.isDirectory())await walk(rel);else if(s.isFile()&&/\.(?:mjs|ts|js)$/.test(name))files.push([rel,await readFile(join(sourceRoot,rel))]);
  }}
  await walk('scripts');await walk('lib');
  files.push(['package.json',Buffer.from('{"name":"kalling-worker-runtime","private":true,"type":"module"}\n')]);
  const hash=createHash('sha256');for(const [name,bytes] of files){hash.update(name.split('\\').join('/'));hash.update('\0');hash.update(bytes);hash.update('\0');}
  const digest=hash.digest('hex'),release=join(paths.root,'releases',digest),script=join(release,'scripts','kalling-worker.mjs');
  await mkdir(join(paths.root,'releases'),{recursive:true,mode:0o700});
  if(!await exists(release)){
    const temp=release+'.staging-'+randomUUID();
    try{for(const [name,bytes] of files){const p=join(temp,name);await mkdir(dirname(p),{recursive:true,mode:0o700});await writeFile(p,bytes,{mode:0o600,flag:'wx'});}await rename(temp,release);}
    finally{await rm(temp,{recursive:true,force:true});}
  }
  // Check every byte even on a previously installed release, then import with no node_modules.
  for(const [name,bytes] of files)ok((await readFile(join(release,name))).equals(bytes),'The installed worker runtime was changed. Preserve it and investigate before reinstalling.');
  const smoke=await run(node,['--experimental-strip-types','--input-type=module','-e',`await import(${JSON.stringify(pathToFileURL(join(release,'scripts','worker-core.mjs')).href)})`]);
  ok(smoke.code===0,'The standalone worker runtime could not load. No login item was changed.');
  return {release,script,digest,node};
}

export function launchPlist(paths,runtime,model){
  const args=[runtime.node,'--experimental-strip-types','--disable-warning=ExperimentalWarning',runtime.script,'start','--profile',paths.profile,'--model',model];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${xml(paths.label)}</string>
<key>ProgramArguments</key><array>${args.map(a=>'<string>'+xml(a)+'</string>').join('')}</array>
<key>WorkingDirectory</key><string>${xml(runtime.release)}</string>
<key>EnvironmentVariables</key><dict><key>KALLING_AGENT_HOME</key><string>${xml(paths.stateDir)}</string><key>OLLAMA_NO_CLOUD</key><string>1</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>ExitTimeOut</key><integer>30</integer><key>Umask</key><integer>63</integer>
<key>StandardErrorPath</key><string>${xml(join(paths.logDir,'worker-errors.log'))}</string>
</dict></plist>\n`;
}

async function assertManaged(paths){
  const m=await readJson(paths.manifest);
  ok(m?.schema===serviceSchema&&m.profile===paths.profile&&m.label===paths.label&&m.stateDir===paths.stateDir&&m.runtime?.script===join(paths.root,'releases',m.runtime?.digest||'','scripts','kalling-worker.mjs')&&/^[a-f0-9]{64}$/.test(m.runtime.digest),'This service is not a recognised managed installation. Existing files were left untouched.');
  ok(await readFile(paths.plist,'utf8')===launchPlist(paths,m.runtime,m.model),'The login item has changed outside this installer. Existing files were left untouched.');return m;
}

export async function inspectService(paths,{run=command,uid=userInfo().uid,now=Date.now()}={}){
  const m=await readJson(paths.manifest),r=await run('launchctl',['print',`gui/${uid}/${paths.label}`]);
  const pid=Number(r.out.match(/^\s*pid = (\d+)\s*$/m)?.[1])||null,s=await readJson(join(paths.stateDir,'service-status.json'));
  const programMatches=r.code===0&&!!m?.runtime?.script&&r.out.includes(m.runtime.script)&&r.out.includes(m.runtime.node);
  const fresh=programMatches&&!!s&&s.profile===paths.profile&&s.pid===pid&&now-Date.parse(s.updatedAt)>=0&&now-Date.parse(s.updatedAt)<15000;
  let managed=false;try{await assertManaged(paths);managed=true;}catch{}
  return {installed:!!m,managed,registered:r.code===0,programMatches,pid,fresh,receipt:fresh?s:null,runtime:m?.runtime,model:m?.model,installationId:m?.installationId};
}

export async function installService(paths,{sourceRoot,model='qwen3:4b',run=command,node=process.execPath,uid=userInfo().uid,installationId}={}){
  if(installationId)ok(/^[a-f0-9-]{36}$/.test(installationId),'Use a unique installation identity.');
  // Never replace a legacy or another tool's launch agent and never interrupt a running assignment.
  const hadPlist=await exists(paths.plist),hadManifest=await exists(paths.manifest);let previous=null,oldPlist=null;
  if(hadPlist||hadManifest){ok(hadPlist&&hadManifest,'An existing worker installation needs review. It was not changed.');previous=await assertManaged(paths);oldPlist=await readFile(paths.plist,'utf8');
    const status=await inspectService(paths,{run,uid});ok(!status.registered||(status.fresh&&!status.receipt.active),'Wait for the installed worker to become idle before reinstalling.');}
  else ok((await run('launchctl',['print',`gui/${uid}/${paths.label}`])).code!==0,'An unrecognised service already owns this label. It was left untouched.');
  const runtime=await stageRuntime(sourceRoot,paths,{node,run}),manifest={schema:serviceSchema,profile:paths.profile,label:paths.label,stateDir:paths.stateDir,model,runtime,installationId:installationId||previous?.installationId||randomUUID(),installedAt:new Date().toISOString()};
  for(const p of [paths.root,paths.stateDir,paths.logDir,dirname(paths.plist)])await mkdir(p,{recursive:true,mode:0o700});
  for(const name of ['worker.log','worker-errors.log']){const p=join(paths.logDir,name);const f=await open(p,'a',0o600);await f.close();await chmod(p,0o600);}
  const target=`gui/${uid}/${paths.label}`;
  if(previous){const stopped=await run('launchctl',['bootout',target]);if(stopped.code&& (await run('launchctl',['print',target])).code===0)throw Error('The previous worker could not stop; no replacement was made.');}
  let changed=false;
  try{
    await writeFile(paths.plist,launchPlist(paths,runtime,model),{mode:0o600});changed=true;
    const r=await run('launchctl',['bootstrap',`gui/${uid}`,paths.plist]);ok(r.code===0,'macOS could not register the worker. Check Login Items settings; no credentials were changed.');
    await privateJson(paths.manifest,manifest);return manifest;
  }catch(e){
    if(changed){await run('launchctl',['bootout',target]);if(previous){await writeFile(paths.plist,oldPlist,{mode:0o600});await privateJson(paths.manifest,previous);const rollback=await run('launchctl',['bootstrap',`gui/${uid}`,paths.plist]);if(rollback.code)e.message+=' The previous login item could not restart; its files and credentials are preserved.';}
      else{await rm(paths.plist,{force:true});await rm(paths.manifest,{force:true});}}
    throw e;
  }
}

export async function restartService(paths,{run=command,uid=userInfo().uid}={}){
  await assertManaged(paths);const before=await inspectService(paths,{run,uid});
  ok(before.registered&&before.fresh&&!before.receipt.active,'Restart requires a running, idle managed worker. No active work was interrupted.');
  const r=await run('launchctl',['kill','SIGTERM',`gui/${uid}/${paths.label}`]);ok(r.code===0,'macOS refused the worker restart.');return before.receipt;
}

export async function uninstallService(paths,{run=command,uid=userInfo().uid}={}){
  await assertManaged(paths);const s=await inspectService(paths,{run,uid});
  ok(!s.registered||(s.fresh&&!s.receipt.active),'Wait for the worker to become idle before removing the login item.');
  const r=await run('launchctl',['bootout',`gui/${uid}/${paths.label}`]);ok(r.code===0||(await run('launchctl',['print',`gui/${uid}/${paths.label}`])).code!==0,'macOS could not stop the worker.');
  await rm(paths.plist,{force:true});await rm(paths.manifest,{force:true});
}

/** One process per state directory. A stale lock is reclaimed only after its PID no longer exists. */
export async function acquireServiceLock(paths,{pid=process.pid,alive=id=>{try{process.kill(id,0);return true;}catch(e){return e.code!=='ESRCH';}}}={}){
  await mkdir(paths.stateDir,{recursive:true,mode:0o700});const dir=join(paths.stateDir,'service.lock'),instance=randomUUID(),ownerFile=join(dir,pid+'-'+instance+'.json');
  for(let tries=0;tries<3;tries++){
    try{
      await mkdir(dir,{mode:0o700});
      try{await writeFile(ownerFile,JSON.stringify({pid,instance}),{flag:'wx',mode:0o600});}catch(e){await rmdir(dir).catch(()=>{});throw e;}
      return {instance,ownerFile,release:async()=>{await rm(ownerFile,{force:true});await rmdir(dir).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e;});}};
    }catch(e){
      if(e.code!=='EEXIST')throw e;
      const names=await readdir(dir);if(!names.length){ok(Date.now()-(await lstat(dir)).mtimeMs>30000,'Another worker is acquiring this profile. Wait for it to start.');await rmdir(dir).catch(()=>{});continue;}
      ok(names.length===1&&/^\d+-[a-f0-9-]{36}\.json$/.test(names[0]),'The worker lock needs inspection. Existing files were left untouched.');
      const oldFile=join(dir,names[0]),held=await readJson(oldFile);ok(Number.isInteger(held?.pid)&&!alive(held.pid),'Another worker already uses this profile. It was left running.');
      // Remove only the dead owner's uniquely named file. Never recursively remove a new owner's lock.
      await rm(oldFile,{force:true});await rmdir(dir).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e;});
    }
  }
  throw Error('The worker profile is busy.');
}

export async function bootTime({run=command}={}){const r=await run('sysctl',['-n','kern.boottime']);const n=Number(r.out.match(/sec\s*=\s*(\d+)/)?.[1]);ok(r.code===0&&Number.isSafeInteger(n)&&n>0,'Could not read the Mac boot time.');return n;}

export function serviceReceipt(worker,paths,{pid=process.pid,instance,localChatRequests=0}={}){
  const s=worker.status();return {schema:serviceSchema,profile:paths.profile,pid,instance,version:s.version,startedAt:s.startedAt,updatedAt:new Date().toISOString(),
    model:{...s.model,digest:worker.state.model.digest},cloud:{status:s.cloud.status,lastContact:s.cloud.lastContact,workerId:worker.state.config.cloud?.workerId||null,firmId:worker.state.config.cloud?.firmId||null},
    active:worker.state.active?{id:worker.state.active.id,kind:worker.state.active.kind}:null,localChatRequests};
}
