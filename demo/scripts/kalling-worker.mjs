#!/usr/bin/env node
// One-time setup by the pilot administrator. Sellers never install or operate this service.
import {createWorker,createLocalApi,localApiPort,workerVersion} from './worker-core.mjs';
import {localRequest} from './local-agent-runner.mjs';
import {localModels} from '../lib/agentProtocol.ts';
import {mkdir,stat,appendFile,rename} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {servicePaths,installService,inspectService,restartService,uninstallService,acquireServiceLock,serviceReceipt,privateJson,command as run} from './worker-service.mjs';

const args=process.argv.slice(2),command=args.shift()||'help';
function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;const v=args[i+1];if(!v||v.startsWith('--'))throw Error('Missing '+name+' value.');args.splice(i,2);return v;}
const profile=option('--profile','default'),model=option('--model','qwen3:4b');
const paths=servicePaths({profile,stateDir:process.env.KALLING_AGENT_HOME}),logFile=join(paths.logDir,'worker.log');
const help=`Kalling research computer (${workerVersion}), local Qwen only

  install --profile pilot   Install a separate persistent pilot, start now and at login
  pair CODE --profile pilot  Save the firm connection without claiming a job in this Terminal
  status --profile pilot    Show the registered service, model and firm connection
  restart --profile pilot   Restart only an idle managed service
  uninstall --profile pilot  Remove the login item; retain private credentials and checkpoints
  start --profile pilot     Foreground troubleshooting (refuses a second process)

Prefix these commands with: node --experimental-strip-types scripts/kalling-worker.mjs
The default profile retains ~/.kalling-agent. The pilot uses separate private state and logs.
Install copies its runtime outside Downloads. Reinstall after moving or replacing Node itself.
--model qwen3:4b is the default; qwen3:8b and qwen3:14b are optional local models.`;

async function log(line){const text=new Date().toISOString()+' '+line+'\n';process.stdout.write(text);
  try{await mkdir(paths.logDir,{recursive:true,mode:0o700});try{if((await stat(logFile)).size>2_000_000)await rename(logFile,logFile+'.1');}catch{}await appendFile(logFile,text,{mode:0o600});}catch{}}

async function start(){
  const lock=await acquireServiceLock(paths);let worker,api,timer,writing=Promise.resolve(),chats=0,stopping=false;
  const statusPath=join(paths.stateDir,'service-status.json');
  const receipt=()=>{writing=writing.catch(()=>{}).then(()=>privateJson(statusPath,serviceReceipt(worker,paths,{instance:lock.instance,localChatRequests:chats})));return writing;};
  const stop=async()=>{if(stopping)return;stopping=true;clearInterval(timer);await log('Stopping; unfinished work keeps its checkpoint.');await worker?.stop();await api?.close().catch(()=>{});await writing.catch(()=>{});await lock.release();process.exit(0);};
  try{
    if(profile==='pilot'&&process.platform==='darwin'){
      // Opens the already-installed app once; never starts a second Ollama server or changes its policy.
      const opened=await run('open',['-g','-a','Ollama']);if(opened.code)await log('Ollama did not open. The worker will wait for the local app.');
    }
    worker=createWorker({stateDir:paths.stateDir,model,request:async(path,body,signal)=>{if(path==='/api/chat'){chats++;await receipt();}return localRequest(path,body,signal);},log:m=>void log(m)});
    await worker.start();await receipt();timer=setInterval(()=>void receipt().catch(()=>{}),2000);
    // The pilot consumes the hosted queue only, leaving the existing local-demo port untouched.
    if(profile==='default'){
      api=createLocalApi(worker);try{await api.listen();await log('Local demo connection ready on 127.0.0.1:'+localApiPort+'.');}
      catch(e){await log(e.code==='EADDRINUSE'?'Local demo port is already in use. Hosted work remains available.':'Local demo connection unavailable.');}
    }
    process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  }catch(e){clearInterval(timer);await worker?.stop();await lock.release();throw e;}
}

try{
  if(!localModels.includes(model))throw Error('Use a supported local Qwen model.');
  if(command==='help'||command==='--help')console.log(help);
  else if(command==='start')await start();
  else if(command==='pair'){
    const code=args.shift();if(!code)throw Error('Use the connection code from Kalling Settings, Research computer.');
    const worker=createWorker({stateDir:paths.stateDir,model});const s=await worker.pair(code,undefined,{activate:false});
    console.log('Saved connection to '+s.cloud.firmName+'. The installed service picks it up within a few seconds.');
  }else{
    if(process.platform!=='darwin')throw Error('Login service controls run on macOS. Use start with a service manager on other systems.');
    if(command==='install'){
      const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<13))throw Error('Node 22.13 or newer is required.');
      const m=await installService(paths,{sourceRoot:resolve(dirname(fileURLToPath(import.meta.url)),'..'),model});
      console.log('Installed '+profile+' worker. It starts at login and macOS restarts it if it exits.\nRuntime: '+m.runtime.script+'\nLogs: '+logFile+'\nNo firm connection was changed.');
    }else if(command==='restart'){
      const before=await restartService(paths);console.log('Requested a graceful restart of idle process '+before.pid+'. Run status again in about fifteen seconds.');
    }else if(command==='uninstall'){
      await uninstallService(paths);console.log('Removed this login item. Private credentials and checkpoints were kept. Revoke the computer in Kalling to remove its hosted access.');
    }else if(command==='status'){
      const s=await inspectService(paths);console.log(JSON.stringify({profile,installed:s.installed,managed:s.managed,registered:s.registered,programMatches:s.programMatches,pid:s.pid,fresh:s.fresh,...(s.receipt?{worker:s.receipt}:{}),logs:logFile},null,2));if(!s.fresh)process.exitCode=1;
    }else throw Error('Unknown command.\n'+help);
  }
}catch(e){console.error(e.message||e);process.exitCode=1;}
