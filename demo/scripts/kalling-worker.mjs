#!/usr/bin/env node
// Kalling research computer. One-time setup by the pilot administrator; sellers never use this.
import {createWorker,createLocalApi,localApiPort,workerVersion} from './worker-core.mjs';
import {localModels} from '../lib/agentProtocol.ts';
import {mkdir,writeFile,rm,stat,appendFile,rename,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {homedir,userInfo} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),command=args.shift()||'help';
const stateDir=process.env.KALLING_AGENT_HOME||join(homedir(),'.kalling-agent');
const logDir=join(homedir(),'Library','Logs','Kalling'),logFile=join(logDir,'worker.log');
const label='com.kalling.worker',plist=join(homedir(),'Library','LaunchAgents',label+'.plist');
const script=fileURLToPath(import.meta.url),demoDir=resolve(dirname(script),'..');
const help=`Kalling research computer (${workerVersion}) — local Qwen only, no paid API

One-time setup on the Mac that powers the pilot:
  node --experimental-strip-types scripts/kalling-worker.mjs install       Start now and at every login
  node --experimental-strip-types scripts/kalling-worker.mjs pair CODE     Connect to a firm (or use Settings in Kalling)
  node --experimental-strip-types scripts/kalling-worker.mjs status        Show connection and model state
  node --experimental-strip-types scripts/kalling-worker.mjs uninstall     Stop and remove the login item
  node --experimental-strip-types scripts/kalling-worker.mjs start         Run in this window (for troubleshooting)

Logs: ~/Library/Logs/Kalling/worker.log · Checkpoints: ~/.kalling-agent
Set the model with --model qwen3:8b on install or start (default qwen3:4b).
For larger drafts, add a per-kind model to ~/.kalling-agent/worker.json, for example {"models":{"cim":"qwen3:14b"}}.`;

function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;const v=args[i+1];args.splice(i,2);return v;}
const model=option('--model','qwen3:4b');
if(!localModels.includes(model))throw Error('Only --model qwen3:4b, qwen3:8b or qwen3:14b is supported.');
const run=(cmd,a)=>new Promise(r=>execFile(cmd,a,(e,stdout,stderr)=>r({code:e?.code??0,out:String(stdout||''),err:String(stderr||'')})));
async function log(line){const text=`${new Date().toISOString()} ${line}\n`;process.stdout.write(text);
  try{await mkdir(logDir,{recursive:true});try{if((await stat(logFile)).size>2_000_000)await rename(logFile,logFile+'.1');}catch{}await appendFile(logFile,text);}catch{}}
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

try{
  if(command==='help'||command==='--help'){console.log(help);}
  else if(command==='start'){
    const worker=createWorker({stateDir,model,log:m=>void log(m)}),api=createLocalApi(worker);
    await worker.start();
    try{const port=await api.listen();await log(`Local Kalling demo connection ready on 127.0.0.1:${port}.`);}
    catch(e){await log(e.code==='EADDRINUSE'?`Port ${localApiPort} is in use; another Kalling worker may already be running. Cloud work continues; the local demo connection is unavailable.`:'Local demo connection unavailable: '+e.message);}
    const stop=async()=>{await log('Stopping; active work resumes from its checkpoint next start.');await worker.stop();await api.close().catch(()=>{});process.exit(0);};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }else if(command==='pair'){
    const code=args.shift();if(!code)throw Error('Paste the connection code from Kalling → Settings → Research computer.');
    const worker=createWorker({stateDir,model});const s=await worker.pair(code);
    console.log(`Connected to ${s.cloud.firmName} as “${s.cloud.name}”. The running worker picks this up within a few seconds.`);
  }else if(command==='install'){
    if(process.platform!=='darwin')throw Error('Automatic start at login is set up for macOS. On other systems run the start command from a service manager.');
    const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<13))throw Error('Node 22.13 or newer is required.');
    await mkdir(dirname(plist),{recursive:true});await mkdir(logDir,{recursive:true});await mkdir(stateDir,{recursive:true,mode:0o700});
    const programArgs=[process.execPath,'--experimental-strip-types','--disable-warning=ExperimentalWarning',script,'start','--model',model];
    await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>${label}</string>
 <key>ProgramArguments</key><array>${programArgs.map(a=>`<string>${xml(a)}</string>`).join('')}</array>
 <key>WorkingDirectory</key><string>${xml(demoDir)}</string>
 <key>EnvironmentVariables</key><dict><key>KALLING_AGENT_HOME</key><string>${xml(stateDir)}</string></dict>
 <key>RunAtLoad</key><true/>
 <key>KeepAlive</key><true/>
 <key>ThrottleInterval</key><integer>10</integer>
 <key>StandardErrorPath</key><string>${xml(join(logDir,'worker-errors.log'))}</string>
</dict></plist>
`,{mode:0o644});
    const uid=String(userInfo().uid);await run('launchctl',['bootout',`gui/${uid}/${label}`]);
    const r=await run('launchctl',['bootstrap',`gui/${uid}`,plist]);if(r.code)throw Error('launchctl could not start the worker: '+(r.err||r.out).trim());
    console.log(`Installed. The Kalling research computer is running and will start automatically at login.\nModel: ${model} · Logs: ${logFile}\nNext: in Kalling, open Settings → Research computer and choose Connect this Mac.`);
  }else if(command==='uninstall'){
    const uid=String(userInfo().uid);await run('launchctl',['bootout',`gui/${uid}/${label}`]);await rm(plist,{force:true});
    console.log('Stopped and removed from login items. Checkpoints and the connection in ~/.kalling-agent were kept; delete that folder to forget them.');
  }else if(command==='status'){
    let s=null;try{const r=await fetch(`http://127.0.0.1:${localApiPort}/v1/status`,{signal:AbortSignal.timeout(3000)});s=await r.json();}catch{}
    let installed=false;try{await stat(plist);installed=true;}catch{}
    if(!s){console.log(`Worker is not running.${installed?' It is installed; check '+logFile:' Run install to start it.'}`);process.exitCode=1;}
    else{
      console.log(`Running ${s.version}${installed?' · starts at login':' · not installed as a login item'}`);
      console.log(`Model: ${s.model.ready?'ready':'NOT READY'} · ${s.model.detail}`);
      console.log(`Cloud: ${s.cloud.status}${s.cloud.firmName?' · '+s.cloud.firmName+' as '+s.cloud.name:''}${s.cloud.waiting?' · '+s.cloud.waiting+' waiting':''}${s.cloud.detail?' · '+s.cloud.detail:''}`);
      console.log(s.active?`Working: ${s.active.kind} for ${s.active.company} · ${s.active.progress?.label||''}`:'Idle');
    }
    try{const tail=(await readFile(logFile,'utf8')).trim().split('\n').slice(-5);console.log('\nRecent log:\n'+tail.join('\n'));}catch{}
  }else throw Error('Unknown command.\n\n'+help);
}catch(e){console.error(e.message||e);process.exitCode=1;}
