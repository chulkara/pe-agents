// Fictional closing-file acceptance. Uses publishable-key clients and local hidden passwords.
import {createClient} from '@supabase/supabase-js';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {downloadPrivateFile,isStorageRefusal,storageHttpStatus} from '../lib/privateStorage.ts';
import {cloudExecutionStore} from '../lib/executionStore.ts';
import {conditionDetails} from '../lib/closingTimeline.ts';
import {ndaText} from '../lib/brokerage.ts';
import {validateTarget,validateAccounts,promptAccounts,loadAccounts,roles,fictionalEmails} from './hosted-validation.mjs';
import {loadFoundationReport,validateFoundationReport} from './hosted-owner-uploads.mjs';

const ok=(value,message)=>{if(!value)throw Error(message);};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const boundedFetch=(input,init={})=>fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
const client=config=>createClient(config.url,config.publishableKey,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const refused=result=>!!result.error&&['42501','P0001','22023'].includes(result.error.code);
async function rpc(c,name,args={}){const r=await c.rpc(name,args);if(r.error)throw Error(name+': '+(r.error.code||'request_failed'));return r.data;}
async function one(c,table,id){const r=await c.from(table).select('*').eq('id',id).single();ok(!r.error&&r.data,'The fictional '+table+' row is unavailable.');return r.data;}
async function readJson(path,label){try{return JSON.parse(await readFile(resolve(path),'utf8'));}catch{throw Error('Cannot read the '+label+' JSON. Its contents are not printed.');}}
export function validateBuyerReport(report,foundation){
  const base=validateFoundationReport(foundation),f=report?.fixtureManifest;
  ok(report?.project===deployedCloudProject.url&&report.mode==='buyer-access'&&report.status==='passed'&&report.transport?.actualAuthenticatedTransport===true&&report.checks?.length===65&&report.checks.every(c=>c.status==='passed'),'Complete all 65 authenticated buyer-access checks before handover validation.');
  ok(uuid(f?.fixture)&&f.firm===base.firmA&&f.company==='fictional-buyer-access-'+f.fixture&&uuid(f.listing)&&uuid(f.portal)&&uuid(f.buyer)&&f.fixtureClosed===true&&f.memberRevoked===true,'The completed buyer report must identify the closed fictional fixture and revoked test member.');return f;
}
export function validateHandoverFixture(f,foundation,buyerReport){
  const base=validateFoundationReport(foundation),prior=validateBuyerReport(buyerReport,foundation);
  ok(f?.project===deployedCloudProject.url&&f.mode==='handover'&&f.status==='prepared'&&uuid(f.fixture)&&f.firm===base.firmA&&f.otherFirm===base.firmB,'Use the prepared handover fixture for the completed fictional foundation.');
  ok(f.company==='fictional-handover-'+f.fixture&&uuid(f.listing)&&/^KL-[0-9]+$/.test(f.listingNumber)&&f.expectedHeadline==='Sample HVAC closing-file validation'&&f.priorBuyerFixture===prior.fixture&&f.priorBuyerListing===prior.listing&&f.listing!==prior.listing,'Handover must use its own sample listing and preserve the completed buyer fixture.');return f;
}
export const fictionalAmounts={currency:'USD',basis:'Asset consideration',cash:240000000,sellerNote:20000000,otherFixed:0,fixed:260000000,earnoutMax:20000000,earnoutRealized:0,workingCapital:0,inventory:0,realEstate:0,buyerDebt:150000000,basisNote:'Fictional asset consideration includes normal inventory and working capital; borrowing is reported separately as a source of funds.'};
const moneyText='Cash consideration USD 2,400,000; seller note USD 200,000; maximum earnout USD 200,000.';
const permissionText='Fictional Seller and Fictional Buyer permit the advisor to share this exact document with the explicitly selected transaction participants.';
export async function fictionalHandoverPdf(fixture,label){
  const d=await PDFDocument.create(),font=await d.embedFont(StandardFonts.Helvetica),p=d.addPage([612,792]);
  const lines=['FICTIONAL SOFTWARE VALIDATION ONLY',fixture,label,'Fictional Seller LLC. Fictional Buyer LLC.','Fictional Seller, Manager, signed for Fictional Seller LLC.','Fictional Acceptance Buyer, Manager, signed for Fictional Buyer LLC.',...moneyText.split('; ').map(s=>s.replace(/;$/,'')),...permissionText.match(/.{1,76}(?:\s|$)/g),'No real transaction, funding, professional review or signature.'];
  for(const [i,line]of lines.entries())p.drawText(line.trim(),{x:38,y:750-i*24,size:10,font});
  return Buffer.from(await d.save());
}

export async function handoverRun(config,accounts,foundation,buyerReport,fixture,check,manifest,{makeClient=client}={}){
  validateTarget(config);validateAccounts(accounts);validateHandoverFixture(fixture,foundation,buyerReport);
  for(const role of roles)ok(accounts[role].email===fictionalEmails[role],'Use only the six existing confirmed fictional accounts.');
  const clients={},users={},tokens={};let verified=false,memberChanged=false,portal,transaction,buyerId,success=false;
  Object.assign(manifest,{fixture:fixture.fixture,firm:fixture.firm,listing:fixture.listing,company:fixture.company,priorBuyerFixture:fixture.priorBuyerFixture,files:[],participants:[]});
  try{
    for(const role of roles){const c=clients[role]=makeClient(config),login=await c.auth.signInWithPassword(accounts[role]);ok(!login.error&&login.data.session,'Hosted sign-in failed for '+role+'.');const current=await c.auth.getUser();ok(!current.error&&current.data.user?.email_confirmed_at&&current.data.user.email===accounts[role].email,'Confirmed fictional identity mismatch for '+role+'.');users[role]=current.data.user;tokens[role]=login.data.session.access_token;check(true,'Confirmed hosted identity: '+role);}
    const {owner_a:a,owner_b:b,member,seller,buyer,specialist}=clients,anonymous=makeClient(config);
    const fa=await one(a,'kalling_firms',fixture.firm),fb=await one(b,'kalling_firms',fixture.otherFirm),status=await rpc(a,'kalling_brokerage_status');
    const workspace=await a.from('kalling_workspaces').select('data').eq('firm_id',fixture.firm).single(),listing=await one(a,'kalling_listings',fixture.listing),privateListing=await a.from('kalling_listing_private').select('*').eq('listing_id',fixture.listing).single();
    const prior=validateBuyerReport(buyerReport,foundation),oldListing=await one(a,'kalling_listings',prior.listing),oldPortal=await one(a,'kalling_portals',prior.portal),profile=await one(a,'kalling_buyers',prior.buyer);
    ok(fa.created_by===users.owner_a.id&&fb.created_by===users.owner_b.id&&fa.name==='Fictional hosted validation A '+foundation.fixtureManifest.fixture&&fb.name==='Fictional hosted validation B '+foundation.fixtureManifest.fixture,'The two fictional foundation owners do not match.');
    ok(status.configured&&status.firmId===fixture.firm&&status.intakeOpen===false&&!workspace.error&&workspace.data.data.companies.every(c=>c.sample===true)&&workspace.data.data.companies.some(c=>c.id===fixture.company&&c.name==='Fictional HVAC handover validation')&&listing.sample===true&&listing.status==='Live'&&listing.number===fixture.listingNumber&&listing.headline===fixture.expectedHeadline&&!privateListing.error&&privateListing.data.company_id===fixture.company&&privateListing.data.business_name==='Fictional HVAC handover validation','The prepared private handover fixture changed.');
    ok(oldListing.sample===true&&oldListing.status==='Withdrawn'&&oldPortal.status==='Closed'&&profile.user_id===users.buyer.id&&profile.name==='Fictional Acceptance Buyer'&&profile.status==='Restricted','Preserve the completed buyer fixture and its restricted fictional account.');
    ok(!(await rpc(a,'kalling_execution_rows')).some(x=>x.transaction.listingId===fixture.listing),'This fixture was already started. Preserve its history and prepare a new fixture.');
    verified=true;buyerId=manifest.buyer=prior.buyer;check(true,'Both foundation firms, the new sample listing and the closed buyer fixture match exactly');
    check((await rpc(anonymous,'kalling_brokerage_status')).intakeOpen===false,'Public seller intake remains closed');
    await rpc(a,'kalling_buyer_vet',{p_buyer:buyerId,p_status:'Registered',p_note:'Fictional closing-file acceptance only; public registration remains paused.'});
    await rpc(a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'viewer',p_active:false});memberChanged=true;
    portal=manifest.portal=await rpc(a,'kalling_portal_create',{p_firm:fixture.firm,p_company:fixture.company,p_business:'Fictional HVAC handover validation',p_owner_name:'Fictional Seller',p_owner_email:accounts.seller.email,p_help:{name:'Fictional Advisor',email:accounts.owner_a.email},p_welcome:'Fictional handover acceptance '+fixture.fixture});
    await rpc(a,'kalling_portal_set_gate',{p_portal:portal,p_hidden:true});const ownerInvite=await rpc(a,'kalling_portal_invite',{p_portal:portal});await rpc(seller,'kalling_portal_accept',{p_token:ownerInvite});
    const letter=manifest.letter=await rpc(a,'kalling_letter_save',{p_portal:portal,p_letter:{templateVersion:'fictional-handover-v1',input:{ownerName:'Fictional Seller',advisorName:'Fictional Advisor'},text:'FICTIONAL SOFTWARE VALIDATION ONLY. No real engagement, legal representation or fee is agreed. '.repeat(6)}});
    await rpc(a,'kalling_letter_ready',{p_letter:letter});await rpc(seller,'kalling_letter_sign',{p_letter:letter,p_name:'Fictional Seller',p_agree:true});await rpc(a,'kalling_letter_countersign',{p_letter:letter,p_name:'Fictional Advisor',p_agree:true});
    await rpc(buyer,'kalling_buyer_request_access',{p_listing:fixture.listing,p_signed_name:profile.name,p_agreed:true,p_message:'Fictional closing-file validation only.',p_text_hash:sha(ndaText(listing))});
    const accessRows=await buyer.from('kalling_access').select('id').eq('listing_id',fixture.listing);ok(!accessRows.error&&accessRows.data.length===1,'The fictional NDA request is unavailable.');
    manifest.access=accessRows.data[0].id;await rpc(a,'kalling_access_decide',{p_request:manifest.access,p_status:'Approved',p_note:'Exact fictional NDA reviewed for closing-file validation.'});
    const terms={kind:'Letter of intent',price:2800000,cashAtClose:2400000,sellerNote:200000,earnout:200000,financing:'Fictional lender financing',closeDays:90,conditions:'Fictional software validation only; no actual acquisition.'};
    await rpc(buyer,'kalling_buyer_offer',{p_listing:fixture.listing,p:terms});const offers=await rpc(a,'kalling_offer_rows'),offer=offers.find(o=>o.listingId===fixture.listing||o.listing_id===fixture.listing);ok(offer,'The fictional offer is unavailable.');manifest.offer=offer.id;
    await rpc(a,'kalling_offer_share',{p_offer:offer.id,p_version:1,p_note:'Fictional terms shared for software validation.'});await rpc(a,'kalling_offer_accept',{p_offer:offer.id,p_version:1,p_instruction:'Fictional owner instruction confirmed for this exact offer version.'});
    const stores=Object.fromEntries(Object.entries(clients).map(([r,c])=>[r,cloudExecutionStore(c)])),store=stores.owner_a;
    transaction=manifest.transaction=await store.start({offerId:offer.id,offerVersion:1,portalId:portal,originalEstimate:null});
    const load=async(c=a)=>(await rpc(c,'kalling_execution_rows')).find(x=>x.transaction.id===transaction);
    const command=async(action,p,actor=a)=>{const bundle=await load(actor);ok(bundle,'The current transaction is unavailable.');return cloudExecutionStore(actor).command(transaction,bundle.transaction.revision,action,p);};
    check((await load()).transaction.state==='Planning','An approved NDA and exact shared offer start the dedicated fictional transaction');
    for(const [c,label]of [[b,'other firm'],[member,'inactive member'],[specialist,'uninvited specialist']])check(!(await rpc(c,'kalling_execution_rows')).some(x=>x.transaction.id===transaction),'The private transaction is hidden from '+label);
    const fileById=async id=>(await load()).files.find(f=>f.id===id);
    const remember=async(id,bytes)=>{const f=await fileById(id);ok(f,'The stored execution file is unavailable.');const original=await rpc(a,'kalling_execution_file_open',{p_file:id});ok(original.allowed&&original.path,'The advisor cannot obtain a logged path.');const out={id,path:original.path,bucket:original.bucket,sha256:sha(bytes),bytes,family:f.family};manifest.files.push({id,path:out.path,bucket:out.bucket,sha256:out.sha256});return out;};
    const upload=async(label,kind='Diligence',content='Confidential',extra={})=>{const bytes=await fictionalHandoverPdf(fixture.fixture,label),id=await store.upload(transaction,new File([bytes],label+'.pdf',{type:'application/pdf'}),{kind,content,...extra});return remember(id,bytes);};
    const source=f=>({fileId:f.id,page:1,excerpt:'Fictional signed agreement. '+moneyText+' '+permissionText});
    const review=f=>store.reviewFile(f.id,'Reviewed the exact fictional PDF and its stated purpose.');
    const grant=(f,recipients)=>store.grantFile(f.id,recipients,source(f),'Fictional owner and buyer permission reviewed for these exact selected recipients.');
    const grantArgs=(f,recipients)=>({p_file:f.id,p_recipients:recipients,p_permission:source(f),p_note:'Fictional reviewed permission for the exact document and recipients.'});
    const matches=async(c,f)=>{const r=await downloadPrivateFile(c,f.bucket,f.path);return !r.error&&r.data&&sha(Buffer.from(await r.data.arrayBuffer()))===f.sha256;};
    const blockedBytes=async(c,f)=>isStorageRefusal(await downloadPrivateFile(c,f.bucket,f.path));
    const open=c=>f=>rpc(c,'kalling_execution_file_open',{p_file:f.id});

    // Simulate a dropped connection after Storage receives bytes, before finalisation.
    const retryBytes=await fictionalHandoverPdf(fixture.fixture,'Fictional interrupted upload'),retryFile=new File([retryBytes],'fictional-interrupted.pdf',{type:'application/pdf'}),retryInput={kind:'Diligence',content:'Confidential'};
    const retryKey=sha(JSON.stringify([transaction,retryFile.name,retryFile.size,retryFile.type,sha(retryBytes),retryInput.kind,retryInput.content,null]));
    const reservation=await rpc(a,'kalling_execution_file_prepare',{p_transaction:transaction,p:{name:retryFile.name,mime:retryFile.type,size:retryFile.size,sha256:sha(retryBytes),...retryInput,retryKey}});
    const retry=await rpc(a,'kalling_execution_file_prepare',{p_transaction:transaction,p:{name:retryFile.name,mime:retryFile.type,size:retryFile.size,sha256:sha(retryBytes),...retryInput,retryKey}});
    check(reservation.id===retry.id&&retry.uploaded===false,'Retry before bytes arrive reuses the same execution reservation');
    check(refused(await a.rpc('kalling_execution_file_finish',{p_file:reservation.id})),'Missing Storage bytes cannot be marked stored');
    check(isStorageRefusal(await buyer.storage.from('kalling-execution').upload(reservation.path,retryBytes,{contentType:'application/pdf',upsert:false,cacheControl:'0'})),'A different account cannot upload into the advisor reservation');
    ok(!(await a.storage.from('kalling-execution').upload(reservation.path,retryBytes,{contentType:'application/pdf',upsert:false,cacheControl:'0'})).error,'Fictional interrupted byte upload failed.');
    const recovered=await store.upload(transaction,retryFile,{content:'Confidential',kind:'Diligence'}),recoveredAgain=await store.upload(transaction,retryFile,retryInput),recoveredFile=await remember(recovered,retryBytes);
    check(recovered===reservation.id&&recoveredAgain===recovered&&(await load()).files.filter(f=>f.family===recoveredFile.family).length===1,'The app resumes arrived bytes and repeats safely without another document version');
    check(await matches(a,recoveredFile),'Recovered advisor bytes match the original PDF fingerprint');

    const master=await upload('Fictional signed LOI','LOI','Named counterparties'),closing=await upload('Fictional completion record','Closing evidence'),buyerOnly=await upload('Fictional buyer handover','Closing evidence'),sellerOnly=await upload('Fictional seller handover','Closing evidence'),temporary=await upload('Fictional preclose working file'),restricted=await upload('Fictional lender review','Diligence','Restricted lender');
    check(!(await open(buyer)(closing)).allowed&&await blockedBytes(buyer,closing),'Uploading a document grants no automatic buyer access');
    check(refused(await a.rpc('kalling_execution_file_grant',grantArgs(closing,['buyer']))),'Sharing a document requires review first');
    await review(closing);await grant(closing,['buyer','seller']);
    const audit=()=>rpc(a,'kalling_execution_file_audit',{p_transaction:transaction});
    const before=(await audit()).length,opened=await open(buyer)(closing),after=await audit();
    check(opened.allowed&&opened.ticket&&after.length===before+1&&after.some(e=>e.event==='opened'&&e.ticket===opened.ticket&&e.fileId===closing.id&&e.actor===users.buyer.id),'A successful execution read is logged before bytes are requested');
    for(const [c,label]of [[buyer,'buyer'],[seller,'seller'],[b,'other firm'],[specialist,'uninvited specialist']])check(refused(await c.rpc('kalling_execution_file_audit',{p_transaction:transaction})),'Private file audit records refuse '+label);
    check(await matches(buyer,closing),'The logged buyer reads the exact completion PDF');
    for(const [c,label]of [[b,'other firm'],[member,'inactive member'],[specialist,'uninvited specialist'],[anonymous,'anonymous caller']])check(await blockedBytes(c,closing),'Known execution bytes refuse '+label);
    check(isStorageRefusal(await buyer.storage.from('kalling-execution').createSignedUrl(closing.path,3600)),'A logged buyer cannot create a portable signed link');
    const overwrite=await a.storage.from('kalling-execution').upload(closing.path,retryBytes,{contentType:'application/pdf',upsert:true,cacheControl:'0'});
    await open(a)(closing);
    check((isStorageRefusal(overwrite)||storageHttpStatus(overwrite)===409)&&await matches(a,closing),'Stored execution originals cannot be overwritten');
    await grant(closing,['seller']);check(await blockedBytes(buyer,closing)&&!(await open(buyer)(closing)).allowed,'Removing a grant blocks the previous ticket and a replacement open immediately');
    await grant(closing,['buyer','seller']);check(await blockedBytes(buyer,closing),'Restoring a grant does not reactivate the previous read ticket');await open(buyer)(closing);check(await matches(buyer,closing),'A fresh logged open restores only the current approved document');
    await review(master);check(refused(await a.rpc('kalling_execution_file_grant',grantArgs(master,['buyer','seller']))),'Named documents require both counterparty identity permissions');
    for(const side of ['seller','buyer'])await command('identity',{side,external:true,source:source(master),note:'Fictional counterparty instruction permits this minimum identity disclosure.'});
    await grant(master,['buyer','seller']);check((await open(buyer)(master)).allowed&&await matches(buyer,master),'Both evidenced identity permissions unlock the exact named document');
    await review(restricted);check(refused(await a.rpc('kalling_execution_file_grant',grantArgs(restricted,['seller']))),'Restricted lender material cannot be shared with the seller');
    for(const f of [buyerOnly,sellerOnly,temporary])await review(f);
    await grant(buyerOnly,['buyer']);await grant(sellerOnly,['seller']);await grant(temporary,['buyer','seller']);
    check(!(await open(seller)(buyerOnly)).allowed&&await blockedBytes(seller,buyerOnly),'The seller cannot read a buyer-only execution document');
    check(!(await open(buyer)(sellerOnly)).allowed&&await blockedBytes(buyer,sellerOnly),'The buyer cannot read a seller-only execution document');

    // A replacement has a new fingerprint, review and permission revision.
    const version1=await upload('Fictional version one');await review(version1);await grant(version1,['buyer']);await open(buyer)(version1);ok(await matches(buyer,version1),'Initial version read failed.');
    const version2=await upload('Fictional version two','Diligence','Confidential',{family:version1.family});
    check(await blockedBytes(buyer,version1)&&await blockedBytes(buyer,version2)&&!(await open(buyer)(version1)).allowed,'A stored replacement invalidates the prior bytes and leaves the new version private');
    await review(version2);await grant(version2,['buyer']);check(await blockedBytes(buyer,version2),'Review and sharing do not transfer an earlier version ticket');await open(buyer)(version2);check(await matches(buyer,version2),'A fresh logged read delivers the exact reviewed replacement');

    const invitationInput=(email,name)=>({email,name,role:'Lender',purpose:'Fictional restricted document review for software validation.',coordinator:'Fictional Advisor',expiresAt:new Date(Date.now()+7*864e5).toISOString(),identityAllowed:false,recipientReviewed:true});
    const invite=await store.invite(transaction,invitationInput(accounts.specialist.email,'Fictional Specialist'));
    check(refused(await buyer.rpc('kalling_execution_accept_invite',{p_token:invite})),'A different confirmed account cannot accept a specialist invitation');
    await stores.specialist.acceptInvite(invite);check(refused(await specialist.rpc('kalling_execution_accept_invite',{p_token:invite})),'An accepted specialist invitation cannot be reused');
    let guest=(await load()).transaction.participants.find(p=>p.email===accounts.specialist.email&&p.status==='Active');ok(guest,'The specialist invitation did not activate.');manifest.participants.push(guest.id);
    await grant(restricted,[guest.id]);await grant(temporary,['buyer','seller',guest.id]);await open(specialist)(restricted);
    check(await matches(specialist,restricted),'The invited specialist reads only its explicitly granted restricted PDF');
    check(refused(await a.rpc('kalling_execution_file_grant',grantArgs(master,['buyer','seller',guest.id]))),'A specialist without identity permission cannot receive a named document');
    const guestView=await load(specialist);check(guestView.transaction.terms===undefined&&guestView.transaction.closes.length===0&&guestView.transaction.history.length===0&&!guestView.files.some(f=>f.id===master.id),'The specialist projection hides deal terms, completion records and named files');
    await store.revoke(transaction,guest.id,'Fictional specialist immediate revocation check.');check(await blockedBytes(specialist,restricted)&&!(await open(specialist)(restricted)).allowed,'Specialist revocation blocks existing byte access immediately');
    const nextInvite=await store.invite(transaction,invitationInput(accounts.specialist.email,'Fictional Specialist'));await stores.specialist.acceptInvite(nextInvite);guest=(await load()).transaction.participants.find(p=>p.email===accounts.specialist.email&&p.status==='Active');ok(guest,'The replacement specialist invitation did not activate.');manifest.participants.push(guest.id);
    check(await blockedBytes(specialist,restricted)&&!(await open(specialist)(restricted)).allowed,'A new invitation does not inherit grants from the revoked participant');
    await grant(restricted,[guest.id]);await grant(temporary,['buyer','seller',guest.id]);
    const otherInvite=await store.invite(transaction,invitationInput(accounts.owner_b.email,'Fictional Nonretained Specialist'));await stores.owner_b.acceptInvite(otherInvite);const otherGuest=(await load()).transaction.participants.find(p=>p.email===accounts.owner_b.email&&p.status==='Active');ok(otherGuest,'The second specialist invitation did not activate.');manifest.participants.push(otherGuest.id);await grant(temporary,['buyer','seller',guest.id,otherGuest.id]);await open(b)(temporary);check(await matches(b,temporary),'A separately invited specialist receives only its selected file before closing');
    const memberInvite=await rpc(a,'kalling_invite_member',{p_firm:fixture.firm,p_email:accounts.member.email,p_role:'viewer'});await rpc(member,'kalling_accept_invite',{p_token:memberInvite});
    await open(member)(closing);check(await matches(member,closing),'An active firm viewer reads archived advisor documents after a logged open');
    check(refused(await member.rpc('kalling_execution_file_prepare',{p_transaction:transaction,p:{name:'fictional-viewer.pdf',size:retryBytes.length,mime:'application/pdf',sha256:sha(retryBytes),kind:'Diligence',content:'Confidential'}})),'A read-only firm viewer cannot reserve execution uploads');
    await rpc(a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'viewer',p_active:false});check(await blockedBytes(member,closing),'Firm-member revocation blocks a logged byte read with the existing JWT');

    // Reuse a seller-uploaded, accepted original without copying or automatically sharing it.
    const ownerPdf=await fictionalHandoverPdf(fixture.fixture,'Fictional owner original'),request=await rpc(a,'kalling_portal_save_request',{p_portal:portal,p_request:{title:'Fictional accepted handover original',needed:'Upload the fictional PDF only.',why:'Software validation of an accepted owner PDF.',sharing:'Advisor review first; transaction sharing needs a separate permission.',contact:{name:'Fictional Advisor',email:accounts.owner_a.email},due:''}});
    const ownerReserve=await rpc(seller,'kalling_portal_reserve_file',{p_request:request,p_name:'fictional-owner-original.pdf',p_mime:'application/pdf',p_size:ownerPdf.length,p_sha256:sha(ownerPdf)});ok(!(await seller.storage.from('kalling-portal').upload(ownerReserve.file.object_path,ownerPdf,{contentType:'application/pdf',upsert:false,cacheControl:'0'})).error,'The fictional owner-original upload failed.');await rpc(seller,'kalling_portal_finish_file',{p_file:ownerReserve.file.id});await rpc(seller,'kalling_portal_submit',{p_request:request});await rpc(a,'kalling_portal_review',{p_request:request,p_status:'Accepted',p_note:'Reviewed the exact fictional owner original.'});
    const reusedId=await store.reuse(transaction,ownerReserve.file.id,{kind:'Closing evidence',content:'Confidential'}),reused=await remember(reusedId,ownerPdf);manifest.reusedPortalFile=ownerReserve.file.id;
    check(reused.path===ownerReserve.file.object_path&&reused.bucket==='kalling-portal'&&!(await open(buyer)(reused)).allowed&&await blockedBytes(buyer,reused),'Reusing an accepted owner original preserves its bytes and adds no buyer access');await review(reused);await grant(reused,['buyer']);await open(buyer)(reused);check(await matches(buyer,reused),'A separately reviewed grant opens the exact reused owner original');

    await command('loi',{fileId:master.id,offerVersion:1,sellerEntity:'Fictional Seller LLC',buyerEntity:'Fictional Buyer LLC',structure:'Fictional asset transaction',executionDate:new Date().toISOString().slice(0,10),signatories:[{side:'seller',name:'Fictional Seller',role:'Manager',source:source(master)},{side:'buyer',name:'Fictional Acceptance Buyer',role:'Manager',source:source(master)}]});
    await command('confirm_loi',{source:source(master),note:'Reviewed both fictional signatures and their stated manager authority.'});await command('obligation',{title:'Documented fictional completion deadline',source:source(master),deadline:{kind:'Date',date:new Date(Date.now()+30*864e5).toISOString().slice(0,10),timezone:'America/New_York'}});
    check((await store.readiness(transaction)).blockers.length>0,'A reviewed LOI alone cannot bypass unresolved closing conditions');
    await command('item',{title:'Reconcile the fictional financial period',category:'Financial',why:'Confirm the exact fictional financial period before completion.',nextAction:'Review the fictional financial reconciliation.',owner:'Fictional Advisor',requestor:'Fictional Buyer',reviewer:'Fictional Advisor',contributors:[],due:{kind:'Unknown',reason:'No real contractual deadline applies to this software test.'},audience:['seller','buyer'],priority:'High',blocking:true,authority:'Internal',dependsOn:[],sources:[]});
    let item=(await load()).transaction.items.at(-1);await command('respond',{id:item.id,response:'Reviewed the exact fictional financial period and earnings reconciliation.',sources:[source(closing)],status:'Submitted',nextAction:'Have the advisor review the fictional reconciliation.'});item=(await load()).transaction.items.at(-1);await command('review_item',{id:item.id,revision:item.revision,decision:'Resolved',note:'Reviewed the exact fictional reconciliation and its source period.'});
    for(const kind of ['Financing','Escrow','License','Premises','Purchase agreement']){const details=Object.fromEntries(conditionDetails[kind].map(key=>[key,'Fictional documented '+key]));if(kind==='License'){details.jurisdiction='NJ';details.verifiedOn=new Date().toISOString().slice(0,10);}if(kind==='Escrow'){details.amount='125000.50';details.currency='USD';}await command('condition',{kind,title:'Fictional '+kind+' condition',owner:'Fictional Advisor',nextAction:'Archive the fictional professional confirmation.',due:{kind:'Unknown',reason:'No real closing date applies to this software test.'},audience:['buyer','seller'],dependsOn:[],required:true,stage:{Financing:'Funding confirmed',Escrow:'Receipt confirmed',License:'Continuity confirmed',Premises:'Consent received','Purchase agreement':'Completion confirmed'}[kind],details,sources:[source(closing)]});const condition=(await load()).transaction.conditions.at(-1);await command('review_condition',{id:condition.id,revision:condition.revision,professional:'Fictional professional for software validation',note:'Reviewed the fictional condition and exact supporting completion evidence.'});}
    check((await store.readiness(transaction)).blockers.length===0,'Financial diligence and all five reviewed conditions permit a completion package');
    await command('prepare_close',{note:'Reviewed the exact fictional completion evidence and all current conditions.'});
    // A current permission change must invalidate the package prepared just above.
    await grant(closing,['buyer','seller']);const stale=(await load()).transaction,closingInput={commandId:randomUUID(),date:new Date().toISOString().slice(0,10),amounts:fictionalAmounts,evidence:[source(closing)],note:'Fictional acquisition completed solely for software validation of controlled file handover.',handover:{buyerFiles:[closing.id,buyerOnly.id,reused.id],sellerFiles:[closing.id,sellerOnly.id],guestIds:[guest.id]}};
    check(refused(await a.rpc('kalling_execution_close',{p_transaction:transaction,p_revision:stale.revision,p_action:'close',p:closingInput})),'A changed document grant invalidates the earlier completion package');
    await command('prepare_close',{note:'Refreshed the exact completion package after all final document permissions.'});
    await rpc(a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'analyst',p_active:true});const beforeClose=(await load()).transaction;
    check(refused(await member.rpc('kalling_execution_close',{p_transaction:transaction,p_revision:beforeClose.revision,p_action:'close',p:closingInput})),'An analyst cannot record the final close');await rpc(a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'viewer',p_active:false});
    await open(buyer)(temporary);await open(seller)(temporary);await open(specialist)(restricted);await open(b)(temporary);await open(buyer)(reused);
    await command('close',closingInput);const closed=await load();manifest.closed=true;manifest.handover=closingInput.handover;
    check(closed.transaction.state==='Closed'&&closed.transaction.closes.length===1&&(await one(a,'kalling_listings',fixture.listing)).status==='Sold','One controlled close marks only the sample listing Sold');
    await rpc(a,'kalling_execution_close',{p_transaction:transaction,p_revision:beforeClose.revision,p_action:'close',p:closingInput});
    check((await load()).transaction.closes.length===1,'Retrying the identical close preserves one immutable completion record');
    check(refused(await a.rpc('kalling_execution_close',{p_transaction:transaction,p_revision:beforeClose.revision,p_action:'close',p:{...closingInput,commandId:randomUUID()}})),'A competing close command cannot create another completion');
    check(await blockedBytes(buyer,temporary)&&await blockedBytes(seller,temporary),'Pre-close grants and tickets cannot bypass the selected buyer and seller handover');
    const buyerView=await load(buyer),sellerView=await load(seller),sorted=xs=>[...xs].sort();
    check(JSON.stringify(sorted(buyerView.files.map(f=>f.id)))===JSON.stringify(sorted(closingInput.handover.buyerFiles)),'The buyer archive contains exactly the buyer handover selection');
    check(JSON.stringify(sorted(sellerView.files.map(f=>f.id)))===JSON.stringify(sorted(closingInput.handover.sellerFiles)),'The seller archive contains exactly the seller handover selection');
    for(const [c,f,label]of [[buyer,closing,'buyer completion record'],[buyer,buyerOnly,'buyer-only file'],[seller,closing,'seller completion record'],[seller,sellerOnly,'seller-only file'],[buyer,reused,'reused owner original']]){await open(c)(f);check(await matches(c,f),'The closed archive delivers exact bytes for '+label);}
    check(await blockedBytes(buyer,sellerOnly)&&await blockedBytes(seller,buyerOnly),'Closing preserves buyer-only and seller-only file separation');
    check(!(await rpc(b,'kalling_execution_rows')).some(x=>x.transaction.id===transaction)&&await blockedBytes(b,temporary),'A nonretained specialist loses transaction and byte access at close');
    check((await open(specialist)(restricted)).allowed&&await matches(specialist,restricted),'The retained specialist keeps only its existing explicit file grant');
    check(!(await open(specialist)(closing)).allowed&&await blockedBytes(specialist,closing),'Retaining a specialist does not expose the buyer or seller handover');
    const retained=await load(specialist);check(retained.transaction.terms===undefined&&retained.transaction.closes.length===0&&retained.files.every(f=>[restricted.id,temporary.id].includes(f.id)),'A retained specialist still has no deal terms or closing financial projection');
    const originalClose=JSON.stringify((await load()).transaction.closes),append=await upload('Fictional later private receipt','Closing evidence');
    check((await load()).transaction.state==='Closed'&&JSON.stringify((await load()).transaction.closes)===originalClose,'Advisor post-close evidence uploads keep the original completion record unchanged');
    for(const [c,label]of [[buyer,'buyer'],[seller,'seller'],[specialist,'retained specialist']])check(!(await open(c)(append)).allowed&&await blockedBytes(c,append),'Later private evidence is not automatically shared with '+label);
    check(refused(await a.rpc('kalling_execution_file_grant',grantArgs(append,['buyer']))),'The closed archive does not silently add new handover grants');
    await rpc(a,'kalling_portal_update',{p_portal:portal,p_patch:{close:true}});manifest.portalClosed=true;await open(buyer)(reused);
    check(await matches(buyer,reused),'An explicit buyer handover of an original survives closing the seller portal');
    await store.revoke(transaction,guest.id,'Fictional retained-specialist cleanup and immediate revocation check.');
    check(await blockedBytes(specialist,restricted)&&!(await open(specialist)(restricted)).allowed,'A retained specialist can still be revoked immediately after closing');
    await open(buyer)(closing);await rpc(a,'kalling_buyer_vet',{p_buyer:buyerId,p_status:'Restricted',p_note:'Fictional closing-file acceptance is complete; remove buyer byte access.'});
    check(await blockedBytes(buyer,closing)&&!(await open(buyer)(closing)).allowed,'Buyer restriction immediately blocks the closed archive and previous tickets');
    for(const role of ['buyer','seller','specialist','owner_b','member']){const session=await clients[role].auth.getSession(),current=await clients[role].auth.getUser();check(!session.error&&session.data.session?.access_token===tokens[role]&&!current.error&&current.data.user.id===users[role].id,'Revocation checks retained the original valid JWT: '+role);}
    const final=await load();check((await audit()).filter(e=>e.event==='denied').length>=8,'Denied file opens remain in the advisor audit history');
    check(final.transaction.cases.every(c=>c.status!=='Published')&&final.transaction.comparables.length===0&&(await rpc(a,'kalling_brokerage_status')).intakeOpen===false&&(await one(a,'kalling_listings',prior.listing)).status==='Withdrawn','The sample archive stays private, public intake stays closed and no comparable or case study is published');
    manifest.fixtureClosed=true;success=true;
    return {actualAuthenticatedTransport:true,coverage:'Fictional exact-byte closing handover, interrupted uploads, per-version review and sharing, restricted recipients, current-permission revocation with unchanged JWTs, reused originals and private post-close append',notCovered:['Legal effect or authenticity of fictional signatures','Trusted server-side SHA attestation of execution uploads','Real Mac model inference','Complete hosted mobile sale rehearsal','Attorney review, licensing, fees, SMTP or public launch']};
  }finally{
    // Never erase an incomplete run. Remove its temporary access and retain an actionable manifest.
    const cleanup=async(name,action)=>{try{await action();manifest[name]=true;}catch{manifest[name]=false;}};
    if(verified){
      if(memberChanged)await cleanup('memberRevoked',()=>rpc(clients.owner_a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'viewer',p_active:false}));
      if(transaction)for(const id of manifest.participants)await cleanup('participantRevoked_'+id,()=>rpc(clients.owner_a,'kalling_execution_revoke',{p_transaction:transaction,p_participant:id,p_note:'Fictional acceptance cleanup; remove temporary specialist access.'}));
      if(buyerId)await cleanup('buyerRestricted',()=>rpc(clients.owner_a,'kalling_buyer_vet',{p_buyer:buyerId,p_status:'Restricted',p_note:'Fictional acceptance cleanup; no continuing test buyer access.'}));
      if(portal)await cleanup('portalClosed',()=>rpc(clients.owner_a,'kalling_portal_update',{p_portal:portal,p_patch:{close:true}}));
    }
    for(const [role,c]of Object.entries(clients))await cleanup('signedOut_'+role,async()=>{const r=await c.auth.signOut({scope:'global'});if(r.error)throw Error('Sign-out failed.');});
    if(success)ok(manifest.memberRevoked&&manifest.buyerRestricted&&manifest.portalClosed&&manifest.participants.every(id=>manifest['participantRevoked_'+id])&&roles.every(r=>manifest['signedOut_'+r]),'Handover checks passed but cleanup needs review.');
  }
}

async function main(){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;},report={project:deployedCloudProject.url,at:new Date().toISOString(),mode:'handover',checks:[],fixtureManifest:{}};
  const check=(pass,name)=>{report.checks.push({name,status:pass?'passed':'failed'});ok(pass,name);console.log('PASS: '+name);};
  try{const prompting=process.argv.includes('--prompt'),file=arg('--accounts');ok(process.argv[2]==='run'&&process.argv.includes('--confirm-fictional')&&prompting!==!!file&&arg('--foundation-report')&&arg('--buyer-report')&&arg('--fixture'),'Use run --confirm-fictional, both --foundation-report and --buyer-report, --fixture, and exactly one of --prompt or --accounts.');
    const foundation=await loadFoundationReport(arg('--foundation-report')),buyerReport=await readJson(arg('--buyer-report'),'completed buyer report'),fixture=validateHandoverFixture(await readJson(arg('--fixture'),'prepared handover fixture'),foundation,buyerReport);
    if(prompting)console.log('Enter the same six fictional passwords. Input is hidden and is not saved.');const accounts=prompting?await promptAccounts():await loadAccounts(file);
    try{report.transport=await handoverRun(deployedCloudProject,accounts,foundation,buyerReport,fixture,check,report.fixtureManifest);}finally{for(const account of Object.values(accounts))delete account.password;}
    report.status='passed';
  }catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error('BLOCKED: '+e.message);}
  if(arg('--output'))await writeFile(resolve(arg('--output')),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(report.status==='passed'?'Finished '+report.checks.length+' closing-file handover checks. The fictional sample is archived and temporary access is removed.':'Closing-file acceptance is incomplete; the report identifies private partial fixtures and cleanup status.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
