// Fictional hosted owner-portal acceptance. Passwords are prompted locally and
// the prior successful foundation report identifies the two private test firms.
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {validateTarget,validateAccounts,promptAccounts,loadAccounts,roles} from './hosted-validation.mjs';

const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const ok=(v,message)=>{if(!v)throw Error(message);};
const sha=b=>createHash('sha256').update(b).digest('hex');
const boundedFetch=(input,init={})=>fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
const client=config=>createClient(config.url,config.publishableKey,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const denied=r=>!!r.error&&(r.error.code==='42501'||[401,403].includes(Number(r.status||r.error.statusCode||r.error.status)));
const storageDenied=r=>!!r.error&&[400,401,403,404].includes(Number(r.error.statusCode||r.error.status));
async function rpc(c,name,args){const r=await c.rpc(name,args);if(r.error)throw Error(name+': '+(r.error.code||'request_failed'));return r.data;}
async function one(c,table,id,columns='*'){const r=await c.from(table).select(columns).eq('id',id).single();ok(!r.error&&r.data,'Required fictional '+table+' row is unavailable.');return r.data;}
export function validateFoundationReport(report){
  const m=report?.fixtureManifest;
  ok(report?.project===deployedCloudProject.url&&report.status==='passed'&&report.mode==='run'&&report.transport?.actualAuthenticatedTransport===true,'Use the completed foundation acceptance report for this Kalling project.');
  ok(Array.isArray(report.checks)&&report.checks.length>=24&&report.checks.every(x=>x.status==='passed'),'The foundation checks must have passed.');
  ok(m?.project===deployedCloudProject.url&&uuid(m.fixture)&&Array.isArray(m.firms)&&m.firms.length===2&&m.firms.every(uuid)&&m.firms[0]!==m.firms[1],'The foundation report must identify two distinct fictional test firms.');
  return {fixture:m.fixture,firmA:m.firms[0],firmB:m.firms[1]};
}
export async function loadFoundationReport(path){
  let report;
  try{report=JSON.parse(await readFile(resolve(path),'utf8'));}
  catch{throw Error('Cannot read the foundation report as JSON. Its contents are not printed.');}
  validateFoundationReport(report);return report;
}

export async function ownerUploadRun(config,accounts,foundation,check,manifest,{makeClient=client}={}){
  validateTarget(config);validateAccounts(accounts);const base=validateFoundationReport(foundation);
  const clients={},users={},id=randomUUID();let viewerGranted=false;manifest.fixture=id;manifest.firm=base.firmA;manifest.portals=[];manifest.files=[];
  try{
    for(const role of roles){
      const c=clients[role]=makeClient(config),signed=await c.auth.signInWithPassword(accounts[role]);
      ok(!signed.error&&signed.data.session,'Hosted sign-in failed for '+role+'; no token is printed.');
      const current=await c.auth.getUser();ok(!current.error&&current.data.user?.email_confirmed_at&&current.data.user.email.toLowerCase()===accounts[role].email.toLowerCase(),'Confirmed hosted identity does not match '+role+'.');
      users[role]=current.data.user;check(true,'Confirmed hosted identity: '+role);
    }
    const {owner_a:a,owner_b:b,seller,buyer,member,specialist}=clients;
    const fa=await one(a,'kalling_firms',base.firmA),fb=await one(b,'kalling_firms',base.firmB);
    ok(fa.created_by===users.owner_a.id&&fb.created_by===users.owner_b.id&&fa.name==='Fictional hosted validation A '+base.fixture&&fb.name==='Fictional hosted validation B '+base.fixture,'The report does not match the signed-in owners and exact fictional firm names.');
    const w=await a.from('kalling_workspaces').select('version,data').eq('firm_id',base.firmA).single();
    ok(!w.error&&w.data?.data?.firm?.name===fa.name&&Array.isArray(w.data.data.companies)&&w.data.data.companies.every(x=>x.sample===true),'Only a wholly fictional foundation workspace can be used.');
    check(true,'Both foundation fixtures belong to the expected fictional owners');
    await rpc(a,'kalling_set_member',{p_firm:base.firmA,p_user:users.member.id,p_role:'viewer',p_active:false});
    // No new firm is created; repeated acceptance runs stay within the pilot cap.
    const company='fictional-owner-upload-'+id,data={...w.data.data,companies:[...w.data.data.companies,{id:company,name:'Fictional HVAC upload validation',sample:true}]};
    await rpc(a,'kalling_save_workspace',{p_firm:base.firmA,p_expected_version:w.data.version,p_data:data,p_reason:'Fictional owner-upload acceptance '+id});manifest.company=company;
    const help={name:'Fictional Advisor',email:accounts.owner_a.email};
    const p=await rpc(a,'kalling_portal_create',{p_firm:base.firmA,p_company:company,p_business:'Fictional HVAC upload validation',p_owner_name:'Fictional Seller',p_owner_email:accounts.seller.email,p_help:help,p_welcome:'Fictional software validation only: '+id});manifest.portals.push(p);
    await rpc(a,'kalling_portal_set_gate',{p_portal:p,p_hidden:true});
    const request=title=>({title,needed:'A fictional statement for private upload validation.',why:'Confirm upload recovery and document review permissions.',sharing:'Only the invited fictional seller and the firm team.',contact:help});
    const r1=await rpc(a,'kalling_portal_save_request',{p_portal:p,p_request:request('Fictional original statement')});
    const token=await rpc(a,'kalling_portal_invite',{p_portal:p});
    check(denied(await buyer.rpc('kalling_portal_accept',{p_token:token})),'A different confirmed account cannot accept the seller invitation');
    await rpc(seller,'kalling_portal_accept',{p_token:token});
    check(denied(await seller.rpc('kalling_portal_accept',{p_token:token})),'The accepted seller invitation cannot be reused');
    const bytes=label=>Buffer.from('FICTIONAL SOFTWARE VALIDATION ONLY\n'+id+'\n'+label+'\nNo real customer or financial information.\n');
    const reserve=(c,r,content,name='fictional-statement.txt',mime='text/plain')=>rpc(c,'kalling_portal_reserve_file',{p_request:r,p_name:name,p_mime:mime,p_size:content.length,p_sha256:sha(content)});
    const remember=f=>{if(!manifest.files.some(x=>x.id===f.id))manifest.files.push({id:f.id,bucket:'kalling-portal',path:f.object_path,sha256:f.sha256});};
    const upload=async(c,f,content)=>{remember(f);const up=await c.storage.from('kalling-portal').upload(f.object_path,content,{contentType:f.mime,upsert:false});ok(!up.error,'Actual owner-portal byte upload failed.');};
    const finish=(c,f)=>rpc(c,'kalling_portal_finish_file',{p_file:f.id});
    const matches=async(c,f,content)=>{const path=await rpc(c,'kalling_portal_file_path',{p_file:f.id});const got=await c.storage.from('kalling-portal').download(path);return !got.error&&sha(Buffer.from(await got.data.arrayBuffer()))===sha(content);};
    const preBytes=bytes('Fictional advisor preparation'),pre=await reserve(a,r1,preBytes);await upload(a,pre.file,preBytes);await finish(a,pre.file);
    const hidden=await seller.from('kalling_portal_requests').select('id').eq('portal_id',p),hiddenFiles=await seller.from('kalling_portal_files').select('id').eq('portal_id',p);
    check(!hidden.error&&hidden.data.length===0&&!hiddenFiles.error&&hiddenFiles.data.length===0,'Unsigned requests and file metadata stay hidden');
    check(denied(await seller.rpc('kalling_portal_reserve_file',{p_request:r1,p_name:'fictional.txt',p_mime:'text/plain',p_size:4,p_sha256:sha(Buffer.from('test'))})),'A known request ID cannot bypass the engagement upload gate');
    check(denied(await seller.rpc('kalling_portal_link',{p_request:r1,p_file:pre.file.id})),'A known file cannot be attached before engagement completion');
    check(denied(await seller.rpc('kalling_portal_file_path',{p_file:pre.file.id})),'Unsigned seller cannot obtain a known stored file path');
    check(storageDenied(await seller.storage.from('kalling-portal').download(pre.file.object_path)),'Unsigned seller cannot download known original bytes');
    const letter=await rpc(a,'kalling_letter_save',{p_portal:p,p_letter:{templateVersion:'fictional-upload-test-v1',input:{ownerName:'Fictional Seller',advisorName:'Fictional Advisor'},text:'FICTIONAL SOFTWARE TEST ONLY. No real representation or engagement is agreed by this fixture. '.repeat(5)}});manifest.letter=letter;
    await rpc(a,'kalling_letter_ready',{p_letter:letter});await rpc(seller,'kalling_letter_sign',{p_letter:letter,p_name:'Fictional Seller',p_agree:true});
    const waiting=await seller.from('kalling_portal_requests').select('id').eq('portal_id',p);check(!waiting.error&&waiting.data.length===0,'The seller signature alone does not open requests');
    await rpc(a,'kalling_letter_countersign',{p_letter:letter,p_name:'Fictional Advisor',p_agree:true});
    const open=await seller.from('kalling_portal_requests').select('id').eq('portal_id',p);check(!open.error&&open.data.length===1,'Both fictional signatures open the seller requests');
    check(await matches(seller,pre.file,preBytes),'The signed owner can download exact advisor-prepared bytes');
    const content=bytes('Fictional owner original'),first=await reserve(seller,r1,content);remember(first.file);
    check(!!(await seller.rpc('kalling_portal_finish_file',{p_file:first.file.id})).error,'A missing byte upload cannot be marked stored');
    const retry=await reserve(seller,r1,content);check(retry.file.id===first.file.id&&retry.file.object_path===first.file.object_path&&!retry.uploaded,'Retry before upload reuses the original reservation');
    for(const [c,label]of [[b,'other firm'],[buyer,'buyer'],[specialist,'uninvited specialist']])check(storageDenied(await c.storage.from('kalling-portal').upload(first.file.object_path,content,{contentType:'text/plain',upsert:false})),'Reserved upload path refuses '+label);
    // Simulate connection loss after bytes arrive but before finalisation.
    await upload(seller,first.file,content);const arrived=await reserve(seller,r1,content);
    check(arrived.uploaded===true&&arrived.file.id===first.file.id,'Retry after bytes arrive skips a second upload');
    const saved=await finish(seller,arrived.file);check(saved.id===first.file.id&&saved.status==='stored','Recovered finalisation stores the original file');
    check((await finish(seller,arrived.file)).id===saved.id,'Repeating finalisation is idempotent');
    check(await matches(seller,saved,content),'Actual owner-portal bytes match for the seller');check(await matches(a,saved,content),'Actual owner-portal bytes match for the advisor');
    const duplicate=await reserve(seller,r1,content);check(duplicate.duplicate&&duplicate.file.id===saved.id&&!duplicate.file.object_path,'Identical bytes reuse the stored document without leaking a reservation path');
    for(const patch of [{p_size:content.length+1},{p_name:'fictional.exe'},{p_size:20000000}])check(!!(await seller.rpc('kalling_portal_reserve_file',{p_request:r1,p_name:'fictional.txt',p_mime:'text/plain',p_size:content.length,p_sha256:sha(content),...patch})).error,'Matching hashes cannot bypass file metadata or size validation');
    const r2=await rpc(a,'kalling_portal_save_request',{p_portal:p,p_request:request('Fictional second document request')});
    const linked=await reserve(seller,r2,content),second=await one(seller,'kalling_portal_requests',r2);
    check(linked.duplicate&&linked.file.id===saved.id&&second.file_ids.length===1&&second.file_ids[0]===saved.id,'A duplicate is attached to the currently requested question');
    for(const [c,label]of [[b,'other firm'],[buyer,'buyer'],[specialist,'uninvited specialist'],[member,'revoked member'],[makeClient(config),'anonymous caller']])check(storageDenied(await c.storage.from('kalling-portal').download(first.file.object_path)),'Known portal object download refuses '+label);
    for(const [c,label]of [[seller,'seller'],[a,'advisor']])check(storageDenied(await c.storage.from('kalling-portal').createSignedUrl(first.file.object_path,3600)),'Reusable signed URL refused for '+label);
    const overwrite=await seller.storage.from('kalling-portal').upload(first.file.object_path,bytes('FICTIONAL REPLACEMENT'),{contentType:'text/plain',upsert:true});
    check(!!overwrite.error&&await matches(seller,saved,content),'An overwrite attempt leaves the exact original bytes intact');
    const invite=await rpc(a,'kalling_invite_member',{p_firm:base.firmA,p_email:accounts.member.email,p_role:'viewer'});await rpc(member,'kalling_accept_invite',{p_token:invite});viewerGranted=true;
    check(await matches(member,saved,content),'An invited firm viewer can read owner-portal originals');
    check(denied(await member.rpc('kalling_portal_reserve_file',{p_request:r2,p_name:'fictional.txt',p_mime:'text/plain',p_size:4,p_sha256:sha(Buffer.from('test'))})),'A firm viewer cannot reserve an owner upload');
    await rpc(a,'kalling_set_member',{p_firm:base.firmA,p_user:users.member.id,p_role:'viewer',p_active:false});viewerGranted=false;
    check(storageDenied(await member.storage.from('kalling-portal').download(first.file.object_path)),'Viewer revocation blocks actual portal bytes with the existing JWT');
    await rpc(seller,'kalling_portal_submit',{p_request:r1});await rpc(a,'kalling_portal_review',{p_request:r1,p_status:'Accepted',p_note:'Reviewed the exact fictional originals.'});
    const revisedBytes=bytes('Fictional revised original'),revised=await reserve(seller,r2,revisedBytes);await upload(seller,revised.file,revisedBytes);await finish(seller,revised.file);
    await rpc(a,'kalling_portal_link',{p_request:r1,p_file:revised.file.id});const changed=await one(a,'kalling_portal_requests',r1);
    check(changed.status==='In progress'&&changed.review_note===''&&changed.submitted_at===null,'Changed attachments invalidate the earlier request acceptance');
    check(denied(await seller.rpc('kalling_portal_review',{p_request:r1,p_status:'Accepted',p_note:'Fictional self approval must fail.'})),'A seller cannot approve their own changed document request');
    await rpc(seller,'kalling_portal_submit',{p_request:r1});await rpc(a,'kalling_portal_review',{p_request:r1,p_status:'Accepted',p_note:'Reviewed the revised fictional originals.'});
    await rpc(a,'kalling_portal_link',{p_request:r1,p_file:revised.file.id});check((await one(a,'kalling_portal_requests',r1)).status==='Accepted','An unchanged attachment retry preserves its current review');
    await rpc(a,'kalling_portal_set_gate',{p_portal:p,p_hidden:true});check(storageDenied(await seller.storage.from('kalling-portal').download(first.file.object_path)),'Closing the gate blocks already-known bytes with the same seller JWT');
    await rpc(a,'kalling_portal_set_gate',{p_portal:p,p_hidden:false});check(await matches(seller,saved,content),'Reopening the completed engagement restores authorised reads');
    await rpc(a,'kalling_portal_update',{p_portal:p,p_patch:{ownerEmail:accounts.buyer.email}});
    check(storageDenied(await seller.storage.from('kalling-portal').download(first.file.object_path)),'Changing the invited owner removes the earlier seller byte access immediately');
    check(denied(await seller.rpc('kalling_portal_file_path',{p_file:saved.id})),'The earlier seller also loses the file-path RPC');
    await rpc(a,'kalling_portal_update',{p_portal:p,p_patch:{close:true}});manifest.portalClosed=true;
    manifest.note='Private fictional fixtures retained; the portal is closed and the member is revoked. No house, real intake, fees, email, model or launch setting changed.';
    return {actualAuthenticatedTransport:true,coverage:'Owner portal engagement gate, real private bytes, immutable retries, deduplication, request reapproval and same-JWT access changes',notCovered:['Buyer proof-file attestation and buyer data-room transport','Execution handover transport','Real Mac model job','Complete hosted mobile sale rehearsal']};
  }finally{
    if(viewerGranted)try{await rpc(clients.owner_a,'kalling_set_member',{p_firm:base.firmA,p_user:users.member.id,p_role:'viewer',p_active:false});}
    catch{manifest.cleanup={memberRevocationPending:true};}
    for(const c of Object.values(clients))await c.auth.signOut({scope:'global'}).catch(()=>{});
  }
}
async function main(){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
  const config=validateTarget(deployedCloudProject),report={project:config.url,at:new Date().toISOString(),mode:'owner-uploads',checks:[],fixtureManifest:{}};
  const check=(pass,name)=>{report.checks.push({name,status:pass?'passed':'failed'});ok(pass,name);console.log('PASS: '+name);};
  try{
    const prompting=process.argv.includes('--prompt'),file=arg('--accounts');
    ok(process.argv[2]==='run'&&process.argv.includes('--confirm-fictional')&&prompting!==!!file&&arg('--foundation-report'),'Use run --confirm-fictional, --foundation-report and exactly one of --prompt or --accounts.');
    const foundation=await loadFoundationReport(arg('--foundation-report'));
    if(prompting)console.log('Enter the same six fictional account passwords. Input is hidden and is not saved.');
    const accounts=prompting?await promptAccounts():await loadAccounts(file);
    try{report.transport=await ownerUploadRun(config,accounts,foundation,check,report.fixtureManifest);}
    finally{for(const a of Object.values(accounts))delete a.password;}
    report.status='passed';
  }catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error('BLOCKED: '+e.message);}
  if(arg('--output'))await writeFile(resolve(arg('--output')),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(report.status==='passed'?'Finished '+report.checks.length+' owner-upload checks.':'Owner-upload acceptance is incomplete; private partial fixtures may remain.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
