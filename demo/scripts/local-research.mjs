#!/usr/bin/env node
import {readPacket,runLocalResearch,localModel} from './local-agent-runner.mjs';
import {localModels} from '../lib/agentProtocol.ts';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const args=process.argv.slice(2),command=args.shift();
const help=`Kalling local research — no paid API or cloud fallback\n\nPrerequisites: Node 22.13+ and Ollama in local-only mode.\n  node --experimental-strip-types scripts/local-research.mjs configure-local-only\n  node --experimental-strip-types scripts/local-research.mjs doctor\n  node --experimental-strip-types scripts/local-research.mjs run /path/assignment.json\n  node --experimental-strip-types scripts/local-research.mjs run /path/assignment.json --model qwen3:8b\n\nCtrl+C pauses the assignment. Run the same command to resume saved steps.\nImport the resulting result.json through Company → Research → Local research.\nSee docs/local-research-pilot.md for setup, source limits and evaluation.`;
if(!command||command==='help'||command==='--help'){console.log(help);process.exit(0);}
const controller=new AbortController();process.once('SIGINT',()=>{controller.abort();console.log('\nStopping after the current checkpoint…');});process.once('SIGTERM',()=>controller.abort());
try{
  if(command==='configure-local-only'){
    if(args.length)throw Error('configure-local-only takes no arguments.');
    const dir=join(homedir(),'.ollama'),path=join(dir,'server.json');await mkdir(dir,{recursive:true,mode:0o700});let settings={};
    try{settings=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Existing Ollama settings could not be read; no settings were changed.');}
    if(!settings||Array.isArray(settings)||typeof settings!=='object')throw Error('Existing Ollama settings are invalid; no settings were changed.');
    const tmp=path+'.kalling-'+process.pid;await writeFile(tmp,JSON.stringify({...settings,disable_ollama_cloud:true},null,2),{mode:0o600});await rename(tmp,path);
    console.log('Preserved existing Ollama settings and disabled cloud features. Quit and reopen Ollama for this to take effect.');
  }else if(command==='doctor'){
    if(args.length)throw Error('doctor takes no arguments.');
    console.log('Checking local Ollama at 127.0.0.1:11434; no hosted provider is contacted.');
    const digest=await localModel('qwen3:4b',controller.signal);console.log('Local qwen3:4b available. Digest: '+digest);console.log('Ready. No inference request was made.');
  }else if(command==='run'){
    const file=args.shift();if(!file)throw Error('Supply the exported assignment JSON path.');let model='qwen3:4b';
    if(args.length){if(args.length!==2||args[0]!=='--model'||!localModels.includes(args[1]))throw Error('Only --model qwen3:4b or --model qwen3:8b is supported.');model=args[1];}
    const packet=await readPacket(file),out=await runLocalResearch(packet,{model,signal:controller.signal,onProgress:p=>console.log(p.step?`${p.step} · ${p.status}`:p.status)});
    console.log('Import this result into Kalling:\n'+out.path);console.log('Model API charge: $0. Hardware, electricity and internet are excluded.');
  }else throw Error('Unknown command.\n'+help);
}catch(e){console.error(e.message||e);process.exitCode=controller.signal.aborted?130:1;}
