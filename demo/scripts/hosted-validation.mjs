// Hosted acceptance checks. Uses only the public project key and confirmed fictional users.
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile,stat,realpath} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {deployedCloudProject} from '../lib/cloudProject.ts';

const REPOSITORY=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const roles=['owner_a','owner_b','member','seller','buyer','specialist'];
export const fictionalEmails=Object.fromEntries(roles.map(role=>[role,role.replace('_','-')+'-20261114@kalling-validation.invalid']));
export function validateTarget(config){
  if(config.url!==deployedCloudProject.url||!/^sb_publishable_[\w-]{25,}$/.test(config.publishableKey||''))throw Error('Use the Kalling project and a publishable key only.');
  return config;
}
export function validateAccounts(accounts){
  const emails=new Set();
  for(const role of roles){
    const a=accounts?.[role];
    if(!a||!/^[-a-z0-9._+]+@kalling-validation[.]invalid$/i.test(a.email||'')||typeof a.password!=='string'||a.password.length<24)throw Error('Every role needs a confirmed fictional kalling-validation.invalid account and a password of at least 24 characters.');
    const email=a.email.toLowerCase();if(emails.has(email))throw Error('Use separate accounts for every role.');emails.add(email);
  }
  return accounts;
}
export async function loadAccounts(path){
  const p=await realpath(path),root=await realpath(REPOSITORY),info=await stat(p);
  if(p===root||p.startsWith(root+sep)||(info.mode&0o077)!==0)throw Error('Keep the credentials file outside the repository with permissions 0600.');
  let accounts;
  try{accounts=JSON.parse(await readFile(p,'utf8'));}
  catch{throw Error('Cannot read the credentials file as JSON. Its contents are not printed.');}
  return validateAccounts(accounts);
}
export function readHiddenPassword(label,{input=process.stdin,output=process.stderr}={}){
  if(!input.isTTY||!output.isTTY||typeof input.setRawMode!=='function')throw Error('Password entry requires an interactive Terminal. Do not pipe passwords into this command.');
  // Readline handles editing and restores the terminal on close. Its output is
  // discarded, including pasted input; only our label and newline are visible.
  const muted=new Writable({write(_chunk,_encoding,done){done();}});
  const wasRaw=!!input.isRaw;
  const rl=createInterface({input,output:muted,terminal:true,historySize:0});
  return new Promise((resolveAnswer,reject)=>{
    let settled=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;rl.close();
      if(wasRaw)input.setRawMode(true);
      muted.destroy();output.write('\n');
      if(error)reject(error);else resolveAnswer(value);
    };
    rl.once('SIGINT',()=>finish(Error('Password entry cancelled. No validation requests were sent.')));
    rl.once('close',()=>finish(Error('Password entry ended before all credentials were entered.')));
    output.write(label);
    rl.question('',answer=>finish(null,answer));
  });
}
export async function promptAccounts(ask=readHiddenPassword){
  const accounts={};
  for(const role of roles){
    const email=fictionalEmails[role],password=await ask('Password for '+email+': ');
    if(typeof password!=='string'||password.length<24)throw Error('The password for '+role+' must have at least 24 characters. No validation requests were sent.');
    accounts[role]={email,password};
  }
  return validateAccounts(accounts);
}
const digest=b=>createHash('sha256').update(b).digest('hex');
const boundedFetch=(input,init={})=>fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
const client=config=>createClient(config.url,config.publishableKey,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const ok=(value,message)=>{if(!value)throw Error(message);};
const permissionDenied=r=>!!r.error&&(['42501','PGRST106','PGRST301','PGRST302'].includes(r.error.code)||[401,403,406].includes(r.status));
const storageDenied=r=>!!r.error&&[400,401,403,404].includes(Number(r.error.statusCode||r.error.status));
async function rpc(c,name,args){const r=await c.rpc(name,args);if(r.error)throw Error(name+': '+(r.error.code||'request_failed'));return r.data;}

export async function doctor(config,check){
  validateTarget(config);const c=client(config);
  const response=await boundedFetch(config.url+'/auth/v1/health',{headers:{apikey:config.publishableKey}});
  check(response.ok,'Hosted Auth health responds over HTTPS');
  const invalid=await c.auth.getUser('fictional-invalid-token');
  check(!!invalid.error&&[400,401,403].includes(invalid.error.status),'Hosted Auth refuses an invalid token');
  const firms=await c.from('kalling_firms').select('id').limit(1);
  check(permissionDenied(firms)||(!firms.error&&firms.data.length===0),'Anonymous callers receive no firm records');
  for(const name of ['kalling_execution_rows','kalling_execution_calibration'])check(permissionDenied(await c.rpc(name)),name+' refuses an anonymous caller');
  const hidden=await c.schema('kalling_private').from('execution_transactions').select('id').limit(1);
  check(permissionDenied(hidden),'The private execution schema is unavailable to the public client');
  const edge=await boundedFetch(config.url+'/functions/v1/kalling-verification-file',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({fileId:randomUUID()})});
  check(edge.status===401,'Proof-file validator refuses a request without a user token');
  const preflight=await boundedFetch(config.url+'/functions/v1/kalling-verification-file',{method:'OPTIONS',headers:{Origin:'https://chulkara.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'}});
  check(preflight.ok&&preflight.headers.get('access-control-allow-origin')==='https://chulkara.github.io','The deployed validator accepts the GitHub Pages CORS preflight');
  return {actualAuthenticatedTransport:false,reason:'Doctor uses no accounts, uploads or retained fixtures.'};
}

export async function authenticatedRun(config,accounts,check,manifest){
  validateTarget(config);validateAccounts(accounts);const clients={},users={};
  const id=randomUUID(),company='fictional-hosted-'+id;
  manifest.fixture=id;manifest.project=config.url;manifest.firms=[];manifest.documents=[];
  try{
    for(const role of roles){
      const c=clients[role]=client(config),signed=await c.auth.signInWithPassword(accounts[role]);
      ok(!signed.error&&signed.data.session,'Hosted sign-in failed for '+role+'; no token is printed.');
      const current=await c.auth.getUser();
      ok(!current.error&&current.data.user.email_confirmed_at&&current.data.user.email.toLowerCase()===accounts[role].email.toLowerCase(),'The confirmed hosted identity does not match '+role+'.');
      users[role]=current.data.user;check(true,'Hosted password grant and user lookup: '+role);
    }
    const {owner_a:a,owner_b:b,member:m,seller,buyer,specialist}=clients;
    const workspace=name=>({firm:{name},companies:[{id:company,name:'Fictional HVAC validation',sample:true}],deals:[],events:[]});
    const wa=workspace('Fictional hosted validation A '+id),wb=workspace('Fictional hosted validation B '+id);
    const fa=await rpc(a,'kalling_create_firm',{p_name:wa.firm.name,p_data:wa}),fb=await rpc(b,'kalling_create_firm',{p_name:wb.firm.name,p_data:wb});
    manifest.firms.push(fa,fb);
    for(const [c,other] of [[a,fb],[b,fa],[seller,fa],[buyer,fa],[specialist,fa]]){
      const row=await c.from('kalling_workspaces').select('firm_id').eq('firm_id',other);
      check(!row.error&&row.data.length===0,'A known unrelated workspace stays private');
    }
    const invitation=await rpc(a,'kalling_invite_member',{p_firm:fa,p_email:accounts.member.email,p_role:'analyst'});
    await rpc(m,'kalling_accept_invite',{p_token:invitation});
    const visible=await m.from('kalling_workspaces').select('firm_id').eq('firm_id',fa);
    check(!visible.error&&visible.data.length===1,'Accepted membership exposes only the invited workspace');
    const bytes=Buffer.from('FICTIONAL HOSTED VALIDATION ONLY\n'+id+'\nNo real customer or financial records.\n');
    const reserved=await rpc(a,'kalling_reserve_document',{p_firm:fa,p_company:company,p_name:'fictional-validation.txt',p_mime:'text/plain',p_size:bytes.length,p_previous:null});
    const f=Array.isArray(reserved)?reserved[0]:reserved;ok(f?.object_path,'Document reservation has no object path.');
    manifest.documents.push({id:f.id,bucket:'kalling-private',path:f.object_path,sha256:digest(bytes)});
    const uploaded=await a.storage.from('kalling-private').upload(f.object_path,bytes,{contentType:'text/plain',upsert:false});ok(!uploaded.error,'Actual private upload failed.');
    await rpc(a,'kalling_finish_document',{p_document:f.id});
    for(const [c,label] of [[a,'owner'],[m,'analyst']]){const got=await c.storage.from('kalling-private').download(f.object_path);check(!got.error&&digest(Buffer.from(await got.data.arrayBuffer()))===digest(bytes),'Actual stored bytes match for '+label);}
    check(storageDenied(await a.storage.from('kalling-private').upload(f.object_path,Buffer.from('FICTIONAL REPLACEMENT'),{contentType:'text/plain',upsert:true})),'A stored original cannot be overwritten');
    for(const [c,label] of [[b,'other firm'],[seller,'seller'],[buyer,'buyer'],[specialist,'uninvited specialist'],[client(config),'anonymous caller']])check(storageDenied(await c.storage.from('kalling-private').download(f.object_path)),'Known object download refused for '+label);
    await rpc(a,'kalling_set_member',{p_firm:fa,p_user:users.member.id,p_role:'viewer',p_active:true});
    const changed=await m.rpc('kalling_save_workspace',{p_firm:fa,p_expected_version:1,p_data:wa,p_reason:'Fictional viewer must not write.'});
    check(permissionDenied(changed),'A role downgrade blocks writes without refreshing the old JWT');
    await rpc(a,'kalling_set_member',{p_firm:fa,p_user:users.member.id,p_role:'viewer',p_active:false});
    check(storageDenied(await m.storage.from('kalling-private').download(f.object_path)),'Revocation blocks actual Storage bytes with the existing JWT');
    const after=await m.from('kalling_workspaces').select('firm_id').eq('firm_id',fa);
    check(!after.error&&after.data.length===0,'Revocation also removes workspace visibility');
    const refreshed=await a.auth.refreshSession();check(!refreshed.error&&refreshed.data.user.id===users.owner_a.id,'Hosted refresh preserves the verified account');
    manifest.note='Private fictional fixtures retained for review. The brokerage house, SMTP, alerts, fees and launch settings were not changed.';
    return {actualAuthenticatedTransport:true,coverage:'Auth, known workspace isolation, immutable original-file upload/download, same-JWT membership downgrade and revocation',notCovered:['Seller/buyer execution file handover over HTTP','Public brokerage launch','SMTP delivery']};
  }finally{
    // No service role, Auth admin, email sending or user deletion is used here.
    for(const c of Object.values(clients))await c.auth.signOut({scope:'global'}).catch(()=>{});
  }
}

async function main(){
  const mode=process.argv[2]||'doctor',outputIndex=process.argv.indexOf('--output'),accountsIndex=process.argv.indexOf('--accounts');
  const config=validateTarget(deployedCloudProject),report={project:config.url,at:new Date().toISOString(),mode,checks:[],fixtureManifest:{}};
  const check=(pass,name)=>{report.checks.push({name,status:pass?'passed':'failed'});ok(pass,name);console.log('PASS: '+name);};
  try{
    if(mode==='doctor')report.transport=await doctor(config,check);
    else if(mode==='run'){
      const prompting=process.argv.includes('--prompt'),file=accountsIndex>=0&&process.argv[accountsIndex+1];
      ok(process.argv.includes('--confirm-fictional')&&prompting!==!!file,'Run needs --confirm-fictional and exactly one of --prompt or --accounts pointing to a protected file outside this repository.');
      if(prompting)console.log('Enter the six fictional account passwords. Input stays hidden and is not saved. Ctrl+C cancels before any validation requests.');
      const accounts=prompting?await promptAccounts():await loadAccounts(file);
      try{report.transport=await authenticatedRun(config,accounts,check,report.fixtureManifest);}
      finally{for(const account of Object.values(accounts))delete account.password;}
    }else throw Error('Choose doctor or run.');
    report.status='passed';
  }catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error('BLOCKED: '+e.message);}
  if(outputIndex>=0&&process.argv[outputIndex+1])await writeFile(resolve(process.argv[outputIndex+1]),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(report.status==='passed'?'Finished '+report.checks.length+' checks.':'No claim of completed hosted acceptance.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
