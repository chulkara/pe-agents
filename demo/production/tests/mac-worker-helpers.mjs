import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {executionFixture,completeExecution} from './execution-helpers.mjs';
import {hostedClientFixture} from './hosted-client-fixture.mjs';
import {cloudClient} from '../../scripts/worker-core.mjs';
import {roles,fictionalEmails} from '../../scripts/hosted-validation.mjs';
import {deployedCloudProject} from '../../lib/cloudProject.ts';

export async function fixture(){
 const s=await executionFixture(),dir=await mkdtemp(join(tmpdir(),'kalling-mac-worker-'));
 const pdf=await PDFDocument.create();pdf.addPage().drawText('Fictional signed agreement. Cash USD 2,400,000.',{x:40,y:720,size:12});const completionBytes=Buffer.from(await pdf.save());
 const completionFile=await s.file({kind:'Closing evidence',size:completionBytes.length,sha256:createHash('sha256').update(completionBytes).digest('hex')});await s.one(s.owner,'select public.kalling_execution_file_review($1,$2)',[completionFile.id,'Reviewed the exact fictional completion evidence.']);await completeExecution(s,{completionFile});
 const ids={owner_a:s.owner,owner_b:s.outsider,member:s.viewer,seller:s.seller,buyer:s.buyer,specialist:s.other},accounts=Object.fromEntries(roles.map(r=>[r,{email:fictionalEmails[r],password:'Fictional-worker-protocol-password-12345'}]));
 for(const r of roles)await s.db.query('update auth.users set email=$1 where id=$2',[accounts[r].email,ids[r]]);
 const base=randomUUID(),run=randomUUID(),company='fictional-handover-'+run,name='Fictional hosted validation A '+base,workspace={firm:{name},companies:[{id:company,name:'Fictional HVAC handover validation',sample:true}],deals:[],events:[]};
 const version=(await s.db.query('select version from public.kalling_workspaces where firm_id=$1',[s.firm])).rows[0].version;await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,version,workspace,'Fictional worker validation']);
 const otherFirm=await s.one(s.outsider,'select public.kalling_create_firm($1,$2)',['Fictional hosted validation B '+base,{...workspace,firm:{name:'Fictional hosted validation B '+base}}]);
 await s.db.query("update public.kalling_listings set headline='Sample HVAC closing-file validation' where id=$1",[s.l]);await s.db.query("update public.kalling_listing_private set company_id=$2,business_name='Fictional HVAC handover validation' where listing_id=$1",[s.l,company]);await s.db.query("update kalling_private.execution_transactions set data=jsonb_set(data,'{companyId}',to_jsonb($2::text)) where id=$1",[s.id,company]);await s.db.exec('update kalling_private.brokerage_settings set intake_open=false');
 await s.db.query('update public.kalling_portals set company_id=$2 where id=$1',[s.portal,company]);await s.one(s.owner,'select public.kalling_portal_update($1,$2)',[s.portal,{close:true}]);await s.one(s.owner,'select public.kalling_buyer_vet($1,$2,$3)',[s.b1,'Restricted','Fictional handover cleanup.']);await s.one(s.owner,'select public.kalling_set_member($1,$2,$3,$4)',[s.firm,s.viewer,'viewer',false]);
 const foundation={project:deployedCloudProject.url,mode:'run',status:'passed',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:24},()=>({status:'passed'})),fixtureManifest:{project:deployedCloudProject.url,fixture:base,firms:[s.firm,otherFirm]}};
 const handover={project:deployedCloudProject.url,mode:'handover',status:'passed',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:90},()=>({status:'passed'})),fixtureManifest:{fixture:run,firm:s.firm,company,listing:s.l,transaction:s.id,portal:s.portal,buyer:s.b1,fixtureClosed:true,portalClosed:true,memberRevoked:true,buyerRestricted:true}};
 const sdk=hostedClientFixture(s,accounts,ids),cloudFactory=config=>cloudClient({...config,fetchImpl:async(url,init)=>{assert.ok(new URL(url).pathname.startsWith('/rest/v1/rpc/kalling_worker_'));assert.equal(init.headers.Authorization,undefined);const result=await sdk.anonymousRpc(new URL(url).pathname.split('/').at(-1),JSON.parse(init.body));return new Response(JSON.stringify(result.error?{message:result.error.message}:result.data),{status:result.error?result.status:200});}});
 sdk.bytes.set('kalling-execution/'+completionFile.path,completionBytes);
 const close=async()=>{await sdk.idle();await s.db.close();await rm(dir,{recursive:true,force:true});};return {...s,dir,accounts,foundation,handover,sdk,cloudFactory,completionBytes,close};
}
export function localModel({ready=true,invalid=false}={}){let chats=0;return {get chats(){return chats;},request:async(path,body)=>{if(path==='/api/status')return {cloud:{disabled:ready}};if(path==='/api/tags')return {models:[{name:'qwen3:4b',size:2500000000,digest:'a'.repeat(64)}]};if(path==='/api/show')return {modelfile:'FROM /local/weights'};assert.equal(path,'/api/chat');assert.equal(body.model,'qwen3:4b');chats++;const input=JSON.parse(body.messages[1].content);return {done:true,done_reason:'stop',prompt_eval_count:250,eval_count:80,message:{content:JSON.stringify({claims:[{sourceId:input.passages[0].id,quote:invalid?'This quote was invented.':input.passages[0].text}],questions:['Which remaining items should the advisor confirm before archiving?']})}};}};}
