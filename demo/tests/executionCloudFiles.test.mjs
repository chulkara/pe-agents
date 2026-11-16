import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudExecutionStore} from '../lib/executionStore.ts';
const file=()=>new File(['%PDF-1.4\nFictional only\n%%EOF'],'fictional.pdf',{type:'application/pdf'});
test('a retry skips arrived bytes, preserves its fingerprint across input order and only reports success after finish',async()=>{
 const calls=[],notes=[];let arrived=false,finished=false;
 const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='kalling_execution_file_prepare')return {data:{id:'f',path:'t/f.pdf',stored:finished,uploaded:arrived},error:null};if(name==='kalling_execution_file_finish'){finished=true;return {data:null,error:null};}throw Error('Unexpected RPC');},storage:{from:()=>({upload:async(_path,_file,options)=>{assert.equal(options.cacheControl,'0');arrived=true;return {error:{message:'Connection interrupted',status:500}};}})}};
 const store=cloudExecutionStore(client);await assert.rejects(store.upload('t',file(),{kind:'Closing evidence',content:'Confidential'},x=>notes.push(x)),/interrupted/);assert.equal(finished,false);
 await store.upload('t',file(),{content:'Confidential',kind:'Closing evidence'},x=>notes.push(x));assert.equal(finished,true);assert.equal(calls.filter(x=>x.name==='kalling_execution_file_prepare')[0].args.p.retryKey,calls.filter(x=>x.name==='kalling_execution_file_prepare')[1].args.p.retryKey);
 await store.upload('t',file(),{kind:'Closing evidence',content:'Confidential'},x=>notes.push(x));assert.match(notes.at(-1),/Already saved/);assert.equal(calls.filter(x=>x.name==='kalling_execution_file_finish').length,1);
});
test('execution downloads obtain a current logged ticket before a fresh authenticated byte request',async()=>{
 let permitted=true;const calls=[];
 const client={rpc:async(name)=>{calls.push(name);return {data:{allowed:permitted,bucket:'kalling-execution',path:'t/f.pdf'},error:null};},storage:{from:()=>({download:async(_path,options,parameters)=>{calls.push('bytes');assert.ok(options.cacheNonce);assert.equal(parameters.cache,'no-store');return {data:new Blob(['fictional']),error:null};}})}};
 const store=cloudExecutionStore(client);await store.openFile('f');assert.deepEqual(calls,['kalling_execution_file_open','bytes']);permitted=false;await assert.rejects(store.openFile('f'),/no longer shared/);assert.equal(calls.filter(x=>x==='bytes').length,1);
});
