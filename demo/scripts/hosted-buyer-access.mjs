// Fictional hosted buyer proof and data-room acceptance. Credentials stay local.
import {createClient} from '@supabase/supabase-js';
import {PDFDocument,StandardFonts,PDFRawStream,PDFArray,decodePDFRawStream} from 'pdf-lib';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deployedCloudProject} from '../lib/cloudProject.ts';
import {downloadPrivateFile,isStorageRefusal,storageHttpStatus} from '../lib/privateStorage.ts';
import {cloudVerificationStore} from '../lib/verificationStore.ts';
import {ndaText} from '../lib/brokerage.ts';
import {watermarkPdf} from '../lib/pdf.ts';
import {validateTarget,validateAccounts,promptAccounts,loadAccounts,roles,fictionalEmails} from './hosted-validation.mjs';
import {loadFoundationReport,validateFoundationReport} from './hosted-owner-uploads.mjs';
const ok=(x,message)=>{if(!x)throw Error(message);},uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const sha=b=>createHash('sha256').update(b).digest('hex');
const boundedFetch=(input,init={})=>fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
const client=config=>createClient(config.url,config.publishableKey,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const denied=r=>!!r.error&&(r.error.code==='42501'||[401,403].includes(Number(r.status||r.error.status)));
async function rpc(c,name,args={}){const r=await c.rpc(name,args);if(r.error)throw Error(name+': '+(r.error.code||'request_failed'));return r.data;}
async function row(c,table,id){const r=await c.from(table).select('*').eq('id',id).single();ok(!r.error&&r.data,'Required fictional '+table+' row is unavailable.');return r.data;}
export function validateBuyerFixture(f,foundation){
  const base=validateFoundationReport(foundation);
  ok(f?.project===deployedCloudProject.url&&f.mode==='buyer-access'&&f.status==='prepared'&&uuid(f.fixture)&&f.firm===base.firmA&&f.otherFirm===base.firmB,'Use the prepared fictional buyer fixture for the completed foundation run.');
  ok(f.company==='fictional-buyer-access-'+f.fixture&&uuid(f.listing)&&/^KL-[0-9]+$/.test(f.listingNumber)&&f.expectedHeadline==='Sample HVAC company for software validation','The fixture must identify the exact sample listing and fictional company.');return f;
}
export async function loadBuyerFixture(path,foundation){let f;try{f=JSON.parse(await readFile(resolve(path),'utf8'));}catch{throw Error('Cannot read the buyer fixture as JSON. Its contents are not printed.');}return validateBuyerFixture(f,foundation);}
export async function fictionalBuyerPdf(fixture,label){
  const d=await PDFDocument.create(),font=await d.embedFont(StandardFonts.Helvetica);
  for(let n=1;n<=2;n++){const p=d.addPage([612,792]);for(const [i,text]of ['FICTIONAL SOFTWARE VALIDATION ONLY',fixture,label,'No real business, customer or financial information.','Page '+n].entries())p.drawText(text,{x:40,y:740-i*28,size:12,font});}
  return Buffer.from(await d.save());
}
export async function verifyStampedPages(original,stamped,mark){
  const before=await PDFDocument.load(original),after=await PDFDocument.load(stamped),needle=Buffer.from(mark,'latin1').toString('hex').toUpperCase();
  ok(after.getPageCount()===before.getPageCount()&&after.getPageCount()>=2&&sha(original)!==sha(stamped),'The stamped document did not preserve both fictional pages.');
  for(const p of after.getPages()){
    const contents=p.node.Contents(),refs=contents instanceof PDFArray?contents.asArray():[contents];
    const decoded=refs.filter(Boolean).map(ref=>after.context.lookup(ref)).filter(x=>x instanceof PDFRawStream).map(s=>new TextDecoder().decode(decodePDFRawStream(s).decode())).join('\n');
    ok(decoded.toUpperCase().includes('<'+needle+'>'),'The buyer identity is not stamped into every downloaded page.');
  }
  return after.getPageCount();
}
export async function buyerAccessRun(config,accounts,foundation,fixture,check,manifest,{makeClient=client}={}){
  validateTarget(config);validateAccounts(accounts);validateBuyerFixture(fixture,foundation);
  for(const role of roles)ok(accounts[role].email===fictionalEmails[role],'Use only the six existing confirmed fictional accounts.');
  const clients={},users={},tokens={};let verified=false,memberGranted=false,portal;
  Object.assign(manifest,{fixture:fixture.fixture,firm:fixture.firm,company:fixture.company,listing:fixture.listing,proofFiles:[],portalFiles:[]});
  try{
    for(const role of roles){const c=clients[role]=makeClient(config),login=await c.auth.signInWithPassword(accounts[role]);ok(!login.error&&login.data.session,'Hosted sign-in failed for '+role+'.');const current=await c.auth.getUser();ok(!current.error&&current.data.user?.email_confirmed_at&&current.data.user.email===accounts[role].email,'Confirmed fictional identity mismatch for '+role+'.');users[role]=current.data.user;tokens[role]=login.data.session.access_token;check(true,'Confirmed hosted identity: '+role);}
    const {owner_a:a,owner_b:b,member,seller,buyer,specialist:other}=clients;
    const fa=await row(a,'kalling_firms',fixture.firm),fb=await row(b,'kalling_firms',fixture.otherFirm);
    ok(fa.created_by===users.owner_a.id&&fb.created_by===users.owner_b.id&&fa.name==='Fictional hosted validation A '+foundation.fixtureManifest.fixture&&fb.name==='Fictional hosted validation B '+foundation.fixtureManifest.fixture,'The fixture does not match the two fictional foundation owners.');
    const workspace=await a.from('kalling_workspaces').select('data').eq('firm_id',fixture.firm).single();ok(!workspace.error&&workspace.data?.data?.companies?.every(c=>c.sample===true)&&workspace.data.data.companies.some(c=>c.id===fixture.company&&c.name==='Fictional HVAC buyer access validation'),'The prepared workspace must contain only sample companies.');
    const listing=await row(a,'kalling_listings',fixture.listing),privateListing=await a.from('kalling_listing_private').select('*').eq('listing_id',fixture.listing).single(),status=await rpc(a,'kalling_brokerage_status');
    ok(status.configured&&status.intakeOpen===false&&status.firmId===fixture.firm&&listing.sample===true&&listing.status==='Live'&&listing.number===fixture.listingNumber&&listing.headline===fixture.expectedHeadline&&!privateListing.error&&privateListing.data.company_id===fixture.company&&privateListing.data.business_name==='Fictional HVAC buyer access validation','The private brokerage or dedicated sample listing changed.');
    check(true,'The exact fictional brokerage is configured with public seller intake closed');verified=true;
    const anonymous=makeClient(config);
    check((await rpc(anonymous,'kalling_brokerage_status')).intakeOpen===false&&(await anonymous.rpc('kalling_submit_lead',{p:{name:'Fictional Seller',email:accounts.seller.email,region:'Central Jersey',consent:true,source:'contact'}})).error?.message?.includes('not open yet'),'Anonymous seller intake remains closed during the private test');
    check(denied(await a.rpc('kalling_brokerage_set_house',{p_firm:fixture.firm})),'Application users cannot claim the global brokerage role');
    check(denied(await b.rpc('kalling_buyer_save_profile',{p:{name:'Fictional Uninvited Buyer',type:'Owner-operator',funds:'Under $250K',experience:'Fictional software validation only with no actual buyer.'}})),'Public buyer registration stays closed to uninvited confirmed accounts');
    await rpc(a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'viewer',p_active:false});
    const profile={name:'Fictional Acceptance Buyer',company:'Fictional Buyer Entity',type:'Owner-operator',funds:'$500K to $1M',experience:'FICTIONAL SOFTWARE VALIDATION ONLY. No actual buyer or funding claim.',regions:['Central Jersey'],maxPrice:2000000,alerts:false};
    for(const [c,u]of [[buyer,users.buyer],[other,users.specialist]]){const old=await c.from('kalling_buyers').select('*').eq('user_id',u.id);ok(!old.error&&old.data.every(x=>x.email===u.email&&x.name.startsWith('Fictional ')),'An account already has a non-fixture buyer profile.');}
    const buyerId=await rpc(buyer,'kalling_buyer_save_profile',{p:profile});manifest.buyer=buyerId;await rpc(other,'kalling_buyer_save_profile',{p:{...profile,name:'Fictional Other Buyer'}});
    const proof=cloudVerificationStore(buyer),reviewer=cloudVerificationStore(a),pdf=await fictionalBuyerPdf(fixture.fixture,'Fictional proof document'),date=new Date().toISOString().slice(0,10),until=new Date(Date.now()+30*864e5).toISOString().slice(0,10),input={kind:'Proof of funds',entity:profile.company,documentDate:date,validUntil:until,explanation:'Software test only; no funding is represented.'};
    const invalid=await proof.save(input),bad=await rpc(buyer,'kalling_verification_reserve',{p_submission:invalid.id,p_name:'fictional-mismatched.pdf',p_mime:'application/pdf',p_size:pdf.length,p_sha:'0'.repeat(64)});manifest.proofFiles.push({id:bad.id,path:bad.path,submission:invalid.id});
    ok(!(await buyer.storage.from('kalling-buyer-proof').upload(bad.path,pdf,{contentType:'application/pdf',upsert:false,cacheControl:'0'})).error,'Fictional mismatch upload failed.');
    const invalidated=await buyer.functions.invoke('kalling-verification-file',{body:{fileId:bad.id}});
    check(!!invalidated.error&&!invalidated.data?.ok,'The trusted validator rejects bytes that do not match their reserved fingerprint');
    check(!!(await buyer.rpc('kalling_verification_change',{p_submission:invalid.id,p_action:'Submit',p:{}})).error,'An unvalidated proof cannot be submitted');
    const v=await proof.save(input);manifest.submission=v.id;
    const reserve=await rpc(buyer,'kalling_verification_reserve',{p_submission:v.id,p_name:'fictional-proof.pdf',p_mime:'application/pdf',p_size:pdf.length,p_sha:sha(pdf)});manifest.proofFiles.push({id:reserve.id,path:reserve.path,submission:v.id,sha256:sha(pdf)});
    check(denied(await buyer.rpc('kalling_verification_attest',{p_file:reserve.id,p_user:users.buyer.id,p_sha:sha(pdf),p_size:pdf.length,p_mime:'application/pdf'})),'A buyer cannot attest to their own proof bytes');
    await proof.upload(v.id,new File([pdf],'fictional-proof.pdf',{type:'application/pdf'}));
    const after=(await proof.list()).find(x=>x.id===v.id);check(after.files.length===1&&after.files[0].id===reserve.id&&after.files[0].status==='stored','Actual uploaded proof is attested by the deployed trusted validator');
    await proof.upload(v.id,new File([pdf],'fictional-proof.pdf',{type:'application/pdf'}));check((await proof.list()).find(x=>x.id===v.id).files.length===1,'Retry reuses the exact validated proof instead of adding another file');
    for(const [c,label]of [[a,'advisor before a logged open'],[b,'other firm'],[seller,'seller'],[member,'inactive member'],[other,'other buyer'],[anonymous,'anonymous caller']])check(isStorageRefusal(await downloadPrivateFile(c,'kalling-buyer-proof',reserve.path)),'Known proof bytes refuse '+label);
    const readProof=await proof.open(reserve.id);check(sha(Buffer.from(await readProof.arrayBuffer()))===sha(pdf),'The buyer downloads the exact original proof after a logged open');
    const overwrite=await buyer.storage.from('kalling-buyer-proof').upload(reserve.path,pdf,{contentType:'application/pdf',upsert:true,cacheControl:'0'});
    check((isStorageRefusal(overwrite)||storageHttpStatus(overwrite)===409)&&sha(Buffer.from(await (await proof.open(reserve.id)).arrayBuffer()))===sha(pdf),'Proof originals cannot be overwritten after validation');
    for(const [c,label]of [[seller,'seller'],[b,'other firm'],[other,'other buyer']])check(denied(await c.rpc('kalling_verification_open',{p_file:reserve.id})),'The proof-open RPC refuses '+label);
    for(const [c,label]of [[buyer,'buyer'],[a,'advisor']])check(isStorageRefusal(await c.storage.from('kalling-buyer-proof').createSignedUrl(reserve.path,3600)),'Portable proof signed links are refused for '+label);
    await proof.change(v.id,'Submit');check(denied(await buyer.rpc('kalling_verification_change',{p_submission:v.id,p_action:'Verified',p:{reviewed:true,fileIds:[reserve.id],until}})),'A buyer cannot verify their own financing evidence');
    const openedProof=await reviewer.open(reserve.id);check(sha(Buffer.from(await openedProof.arrayBuffer()))===sha(pdf),'An authorised advisor reads matching proof bytes after a logged open');
    await rpc(a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'analyst',p_active:true});memberGranted=true;
    check(sha(Buffer.from(await (await cloudVerificationStore(member).open(reserve.id)).arrayBuffer()))===sha(pdf),'A currently authorised analyst can review the exact proof');
    await rpc(a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'viewer',p_active:true});
    check(isStorageRefusal(await downloadPrivateFile(member,'kalling-buyer-proof',reserve.path))&&denied(await member.rpc('kalling_verification_open',{p_file:reserve.id})),'Reviewer downgrade immediately blocks known proof bytes and new read tickets');
    const review={decision:'Verified',until,privateNote:'Fictional private reviewer note '+fixture.fixture,message:'Fictional documents checked for software validation.',reviewed:true,fileIds:[reserve.id]};
    check(!!(await a.rpc('kalling_verification_change',{p_submission:v.id,p_action:'Verified',p:{...review,fileIds:[]}})).error,'Verification requires review of the exact submitted file identities');
    await reviewer.change(v.id,review);
    const buyerView=(await proof.list()).find(x=>x.id===v.id),advisorView=(await reviewer.list(buyerId)).find(x=>x.id===v.id);
    check(buyerView.status==='Verified'&&!('privateNote'in buyerView)&&!JSON.stringify(buyerView).includes(reserve.path)&&advisorView.privateNote===review.privateNote,'The verified buyer sees its status but no advisor notes or storage paths');
    const profileAccess=await buyer.from('kalling_access').select('id').eq('listing_id',fixture.listing);check(!profileAccess.error&&profileAccess.data.length===0,'Financing verification alone grants no listing NDA access');
    portal=await rpc(a,'kalling_portal_create',{p_firm:fixture.firm,p_company:fixture.company,p_business:'Fictional HVAC buyer access validation',p_owner_name:'Fictional Seller',p_owner_email:accounts.seller.email,p_help:{name:'Fictional Advisor',email:accounts.owner_a.email},p_welcome:'Fictional buyer access acceptance '+fixture.fixture});manifest.portal=portal;
    await rpc(a,'kalling_portal_set_gate',{p_portal:portal,p_hidden:true});const invitation=await rpc(a,'kalling_portal_invite',{p_portal:portal});await rpc(seller,'kalling_portal_accept',{p_token:invitation});
    const letter=await rpc(a,'kalling_letter_save',{p_portal:portal,p_letter:{templateVersion:'fictional-buyer-access-v1',input:{ownerName:'Fictional Seller',advisorName:'Fictional Advisor'},text:'FICTIONAL SOFTWARE TEST ONLY. No real engagement, representation or fee is agreed. '.repeat(6)}});manifest.letter=letter;
    await rpc(a,'kalling_letter_ready',{p_letter:letter});await rpc(seller,'kalling_letter_sign',{p_letter:letter,p_name:'Fictional Seller',p_agree:true});await rpc(a,'kalling_letter_countersign',{p_letter:letter,p_name:'Fictional Advisor',p_agree:true});
    const uploadDoc=async label=>{const bytes=await fictionalBuyerPdf(fixture.fixture,label),r=await rpc(a,'kalling_portal_reserve_firm_file',{p_portal:portal,p_name:label+'.pdf',p_mime:'application/pdf',p_size:bytes.length,p_sha256:sha(bytes)});ok(!(await a.storage.from('kalling-portal').upload(r.file.object_path,bytes,{contentType:'application/pdf',cacheControl:'0',upsert:false})).error,'Fictional data-room byte upload failed.');await rpc(a,'kalling_portal_finish_file',{p_file:r.file.id});const f={id:r.file.id,path:r.file.object_path,sha256:sha(bytes),bytes};manifest.portalFiles.push({id:f.id,path:f.path,sha256:f.sha256});return f;};
    const original=await uploadDoc('fictional-original'),loi=await uploadDoc('fictional-after-loi'),itemInput=f=>({listingId:fixture.listing,portalId:portal,fileId:f.id,displayName:'Fictional financial overview',folder:'Financials',tier:'After NDA',allowDownload:true,note:'Fictional software validation only.'});
    const item=await rpc(a,'kalling_dataroom_save_item',{p:itemInput(original)}),locked=await rpc(a,'kalling_dataroom_save_item',{p:{...itemInput(loi),displayName:'Fictional after-LOI document',tier:'After LOI',allowDownload:false}});manifest.items=[item,locked];
    await rpc(a,'kalling_dataroom_set_status',{p_listing:fixture.listing,p_status:'Proposed'});
    check(!!(await a.rpc('kalling_dataroom_set_status',{p_listing:fixture.listing,p_status:'Published'})).error,'The room cannot publish before owner document approval');
    for(const [c,label]of [[a,'advisor'],[buyer,'buyer']])check(denied(await c.rpc('kalling_dataroom_owner_decide',{p_items:[item,locked],p_decision:'Approved',p_note:'Fictional self approval must fail.'})),'Only the invited seller can approve room documents: '+label+' refused');
    await rpc(seller,'kalling_dataroom_owner_decide',{p_items:[item,locked],p_decision:'Approved',p_note:'Fictional owner approval.'});await rpc(a,'kalling_dataroom_set_status',{p_listing:fixture.listing,p_status:'Published'});
    const nda=sha(ndaText(listing)),requestArgs={p_listing:fixture.listing,p_signed_name:profile.name,p_agreed:true,p_message:'FICTIONAL SOFTWARE VALIDATION ONLY.',p_text_hash:nda};
    check(!!(await buyer.rpc('kalling_buyer_request_access',{...requestArgs,p_agreed:false})).error,'Listing access requires an explicit NDA agreement');
    check(!!(await buyer.rpc('kalling_buyer_request_access',{...requestArgs,p_text_hash:'0'.repeat(64)})).error,'A different agreement fingerprint cannot be signed');
    await rpc(buyer,'kalling_buyer_request_access',requestArgs);const requests=await buyer.from('kalling_access').select('*').eq('listing_id',fixture.listing);ok(!requests.error&&requests.data.length===1,'Expected one new sample-listing NDA request.');const access=requests.data[0];manifest.access=access.id;
    check(access.status==='Pending'&&access.nda.textHash===nda&&(await rpc(buyer,'kalling_dataroom_buyer',{p_listing:fixture.listing})).tier===0,'Signing the exact NDA still waits for advisor approval');
    check(denied(await buyer.rpc('kalling_access_decide',{p_request:access.id,p_status:'Approved',p_note:'Fictional self approval.'})),'A buyer cannot approve its own NDA request');
    const forbidden=await rpc(buyer,'kalling_dataroom_open',{p_item:item});check(!!forbidden.error&&!forbidden.ticket&&isStorageRefusal(await downloadPrivateFile(buyer,'kalling-portal',original.path)),'An unapproved buyer receives no ticket or bytes for a known room file');
    await rpc(a,'kalling_access_decide',{p_request:access.id,p_status:'Approved',p_note:'Fictional buyer and current NDA checked.'});
    const badges=await rpc(seller,'kalling_portal_buyer_badges',{p_portal:portal}),badgeText=JSON.stringify(badges);
    check(Object.values(badges).some(b=>b.status==='Verified')&&Object.keys(badges).every(k=>/^Buyer [0-9]+, owner-operator$/.test(k))&&![accounts.buyer.email,profile.name,profile.company,review.privateNote,reserve.id,reserve.path].some(x=>badgeText.includes(x)),'The seller sees an anonymous verified badge without proof documents or buyer identity');
    const room=await rpc(buyer,'kalling_dataroom_buyer',{p_listing:fixture.listing});check(room.tier===1&&room.items.find(i=>i.id===item)?.open&&!room.items.find(i=>i.id===locked)?.open,'Approved NDA access opens the overview while after-LOI documents remain locked');
    for(const [c,label]of [[other,'other buyer'],[b,'other firm'],[anonymous,'anonymous caller']])check(isStorageRefusal(await downloadPrivateFile(c,'kalling-portal',original.path)),'Known room-file bytes refuse '+label);
    const events=()=>rpc(a,'kalling_dataroom_advisor',{p_listing:fixture.listing}),before=await events();const opened=await rpc(buyer,'kalling_dataroom_open',{p_item:item}),logged=await events();
    check(!!opened.ticket&&logged.events.length===before.events.length+1&&logged.events.some(e=>e.item_id===item&&e.buyer_id===buyerId&&e.event==='opened'),'The successful room-open event exists before original bytes are requested');
    check(opened.watermark===profile.name+', '+accounts.buyer.email+', '+new Date().toISOString().slice(0,10)+'. Confidential, Kalling data room','The room returns the current buyer identity for the page watermark');
    const matches=async path=>{const r=await downloadPrivateFile(buyer,'kalling-portal',path);return !r.error&&r.data?Buffer.from(await r.data.arrayBuffer()):null;};
    check(sha(await matches(opened.path)||Buffer.alloc(0))===original.sha256,'The logged ticket delivers the exact original room bytes');
    check(isStorageRefusal(await buyer.storage.from('kalling-portal').createSignedUrl(original.path,3600)),'A logged buyer cannot turn room access into a portable signed link');
    check(!!(await rpc(buyer,'kalling_dataroom_open',{p_item:locked})).error,'A known after-LOI item remains denied without a reviewed signed LOI');
    const downloaded=await rpc(buyer,'kalling_dataroom_download',{p_item:item}),downloadBytes=await matches(downloaded.path);ok(downloadBytes,'The approved download failed.');const stamped=Buffer.from(await (await watermarkPdf(downloadBytes.buffer.slice(downloadBytes.byteOffset,downloadBytes.byteOffset+downloadBytes.byteLength),downloaded.watermark)).arrayBuffer());
    const pages=await verifyStampedPages(downloadBytes,stamped,downloaded.watermark);manifest.stampedPages=pages;check(pages===2,'A downloaded copy preserves both pages and stamps the buyer identity into each page');
    await rpc(buyer,'kalling_dataroom_events',{p_ticket:opened.ticket,p_events:[{page:1,seconds:2},{page:2,seconds:3}]});
    const ownerRoom=(await rpc(seller,'kalling_dataroom_owner')).find(r=>r.listing_id===fixture.listing),ownerLog=JSON.stringify(ownerRoom.log);
    check(ownerRoom.log.some(g=>g.entries.some(e=>/^Buyer [0-9]+, owner-operator$/.test(e.label)))&&!ownerLog.includes(accounts.buyer.email)&&!ownerLog.includes(profile.name),'Seller engagement records use anonymous labels while recording document reads');
    await rpc(a,'kalling_access_decide',{p_request:access.id,p_status:'Declined',p_note:'Fictional immediate revocation test.'});
    check(isStorageRefusal(await downloadPrivateFile(buyer,'kalling-portal',original.path)),'NDA access revocation blocks a previously logged original with the same buyer JWT');
    check(!!(await rpc(buyer,'kalling_dataroom_open',{p_item:item})).error,'A revoked buyer cannot obtain a replacement read ticket');
    await rpc(a,'kalling_access_decide',{p_request:access.id,p_status:'Approved',p_note:'Fictional access restored for document reapproval test.'});
    await rpc(buyer,'kalling_dataroom_open',{p_item:item});await rpc(seller,'kalling_dataroom_owner_decide',{p_items:[item],p_decision:'Removed',p_note:'Fictional owner revocation.'});
    check(isStorageRefusal(await downloadPrivateFile(buyer,'kalling-portal',original.path)),'Owner removal blocks a previously issued ticket immediately');
    await rpc(seller,'kalling_dataroom_owner_decide',{p_items:[item],p_decision:'Approved',p_note:'Fictional original reapproved.'});await rpc(buyer,'kalling_dataroom_open',{p_item:item});
    const replacement=await uploadDoc('fictional-replacement');await rpc(a,'kalling_dataroom_save_item',{p:{...itemInput(replacement),id:item}});
    check(isStorageRefusal(await downloadPrivateFile(buyer,'kalling-portal',original.path))&&isStorageRefusal(await downloadPrivateFile(buyer,'kalling-portal',replacement.path))&&!!(await rpc(buyer,'kalling_dataroom_open',{p_item:item})).error,'Replacement invalidates old tickets and requires fresh owner approval');
    await rpc(seller,'kalling_dataroom_owner_decide',{p_items:[item],p_decision:'Approved',p_note:'Fictional replacement reviewed.'});
    check(isStorageRefusal(await downloadPrivateFile(buyer,'kalling-portal',replacement.path)),'Owner approval cannot transfer an old ticket to replacement bytes');
    const next=await rpc(buyer,'kalling_dataroom_open',{p_item:item});check(sha(await matches(next.path)||Buffer.alloc(0))===replacement.sha256,'A new logged ticket delivers the owner-approved replacement exactly');
    await rpc(a,'kalling_buyer_vet',{p_buyer:buyerId,p_status:'Restricted',p_note:'Fictional account restriction test.'});
    check(isStorageRefusal(await downloadPrivateFile(buyer,'kalling-portal',replacement.path))&&!!(await rpc(buyer,'kalling_dataroom_open',{p_item:item})).error,'Account restriction blocks old tickets and new opens immediately');
    const same=await buyer.auth.getSession(),identity=await buyer.auth.getUser();check(!same.error&&same.data.session?.access_token===tokens.buyer&&!identity.error&&identity.data.user.id===users.buyer.id,'The original valid buyer JWT was retained throughout all revocation checks');
    const finalEvents=await events();check(finalEvents.events.filter(e=>e.event==='denied'&&e.buyer_id===buyerId).length>=4,'Refused room opens remain in the advisor audit history');
    await proof.change(v.id,'Withdraw');await rpc(a,'kalling_dataroom_set_status',{p_listing:fixture.listing,p_status:'Unpublished'});await rpc(a,'kalling_listing_set_status',{p_listing:fixture.listing,p_status:'Withdrawn'});await rpc(a,'kalling_portal_update',{p_portal:portal,p_patch:{close:true}});manifest.fixtureClosed=true;
    check((await rpc(a,'kalling_brokerage_status')).intakeOpen===false,'The fictional room and listing close while public seller intake stays closed');
    return {actualAuthenticatedTransport:true,coverage:'Fictional buyer proof attestation/privacy, exact NDA and advisor review, logged room reads, stamped PDF pages and current-permission revocation using unchanged JWTs',browserWatermarkRendering:'Checked separately by repository browser flows; this runner checks stamped PDF output bytes',notCovered:['Execution handover transport','Real Mac model inference','Complete hosted mobile sale rehearsal','Attorney review or document authenticity']};
  }finally{
    if(verified&&memberGranted)try{await rpc(clients.owner_a,'kalling_set_member',{p_firm:fixture.firm,p_user:users.member.id,p_role:'viewer',p_active:false});manifest.memberRevoked=true;}catch{manifest.memberRevocationPending=true;}
    if(verified&&portal&&!manifest.fixtureClosed)try{await rpc(clients.owner_a,'kalling_dataroom_set_status',{p_listing:fixture.listing,p_status:'Unpublished'});manifest.failedRoomUnpublished=true;}catch{manifest.roomClosurePending=true;}
    for(const c of Object.values(clients))await c.auth.signOut({scope:'global'}).catch(()=>{});
  }
}
async function main(){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;},report={project:deployedCloudProject.url,at:new Date().toISOString(),mode:'buyer-access',checks:[],fixtureManifest:{}};
  const check=(pass,name)=>{report.checks.push({name,status:pass?'passed':'failed'});ok(pass,name);console.log('PASS: '+name);};
  try{const prompting=process.argv.includes('--prompt'),file=arg('--accounts');ok(process.argv[2]==='run'&&process.argv.includes('--confirm-fictional')&&prompting!==!!file&&arg('--foundation-report')&&arg('--fixture'),'Use run --confirm-fictional, --foundation-report, --fixture and exactly one of --prompt or --accounts.');
    const foundation=await loadFoundationReport(arg('--foundation-report')),fixture=await loadBuyerFixture(arg('--fixture'),foundation);if(prompting)console.log('Enter the six existing fictional account passwords. Input is hidden and is not saved.');const accounts=prompting?await promptAccounts():await loadAccounts(file);
    try{report.transport=await buyerAccessRun(deployedCloudProject,accounts,foundation,fixture,check,report.fixtureManifest);}finally{for(const a of Object.values(accounts))delete a.password;}report.status='passed';
  }catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error('BLOCKED: '+e.message);}
  if(arg('--output'))await writeFile(resolve(arg('--output')),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(report.status==='passed'?'Finished '+report.checks.length+' buyer-access checks. The fictional fixture is closed.':'Buyer-access acceptance is incomplete; private partial fixtures may remain.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
