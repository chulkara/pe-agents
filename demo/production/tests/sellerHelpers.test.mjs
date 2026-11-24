import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {executionFixture} from './execution-helpers.mjs';
// executionFixture: s.seller (fictional-3) owns s.portal; s.owner runs the brokerage; s.outsider (fictional-5) plays the office manager.
let s,req,req2,token,hid,upload;
before(async()=>{s=await executionFixture();
 const r=(title,why)=>s.one(s.owner,'select public.kalling_portal_save_request($1,$2)',[s.portal,{title,needed:'Full-year statement for the business.',why,sharing:'Shared with approved buyers after an NDA.',contact:{name:'Fictional Advisor',email:'fictional-0@marketplace.invalid'},due:'2026-12-15'}]);
 req=await r('2025 profit and loss','Buyers will ask for this before any offer.');req2=await r('Customer list','Buyer diligence after a letter of intent.');});
after(()=>s?.db.close());
async function read(user,path,operation='object.get_authenticated'){await s.db.exec('begin;set local role authenticated');try{await s.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[user,operation]);const r=(await s.db.query("select name from storage.objects where bucket_id='kalling-portal' and name=$1",[path])).rows;await s.db.exec('commit');return r.length;}catch(e){await s.db.exec('rollback');throw e;}}
const put=(user,path,size=100,mimetype='application/pdf')=>s.as(user,"insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,$2)",[path,{size,mimetype}]);
const helper=()=>s.outsider;

test('only the owner adds a helper; only the invited, confirmed email accepts',async()=>{
 await assert.rejects(s.one(s.owner,'select public.kalling_helper_add($1,$2,$3,$4)',[s.portal,'Fictional Mary','fictional-5@marketplace.invalid',90]),/Only the business owner/);
 await assert.rejects(s.one(s.buyer,'select public.kalling_helper_add($1,$2,$3,$4)',[s.portal,'Fictional Mary','fictional-5@marketplace.invalid',90]),/Only the business owner/);
 token=await s.one(s.seller,'select public.kalling_helper_add($1,$2,$3,$4)',[s.portal,'Fictional Mary','Fictional-5@marketplace.invalid',90]);
 await assert.rejects(s.one(s.seller,'select public.kalling_helper_add($1,$2,$3,$4)',[s.portal,'Me','fictional-3@marketplace.invalid',90]),/own email/);
 await assert.rejects(s.one(s.other,'select public.kalling_helper_accept($1)',[token]),/invitation was sent to/);
 await s.one(helper(),'select public.kalling_helper_accept($1)',[token]);
 hid=(await s.one(s.seller,'select public.kalling_helper_owner_list($1)',[s.portal]))[0].helper.id;
 await assert.rejects(s.one(s.owner,'select public.kalling_helper_owner_list($1)',[s.portal]),/Only the business owner/);
});

test('the helper sees only assigned titles and descriptions, nothing about buyers or the sale',async()=>{
 assert.equal((await s.one(helper(),'select public.kalling_helper_home()'))[0].requests.length,0);
 await s.one(s.seller,'select public.kalling_helper_assign($1,$2)',[hid,[req]]);
 const home=await s.one(helper(),'select public.kalling_helper_home()');assert.equal(home[0].requests.length,1);
 const json=JSON.stringify(home);for(const leak of ['Buyers will ask','approved buyers','Customer list','Fictional brokerage'])assert.ok(!json.includes(leak),'leak: '+leak);
 assert.deepEqual(Object.keys(home[0].requests[0]).sort(),['complete','due','id','needed','title','uploads']);
 assert.equal((await s.as(helper(),'select * from public.kalling_portal_requests where portal_id=$1',[s.portal])).length,0,'no direct table access to requests');
 await assert.rejects(s.as(helper(),'select * from public.kalling_offers'),/permission denied/);
 await assert.rejects(s.one(helper(),'select public.kalling_helper_reserve($1,$2,$3,$4,$5,$6,$7)',[hid,req2,'c.pdf','application/pdf',100,'c'.repeat(64),'']),/not assigned/);
});

test('helper files wait for the owner and the brokerage cannot read them before approval',async()=>{
 upload=await s.one(helper(),'select public.kalling_helper_reserve($1,$2,$3,$4,$5,$6,$7)',[hid,req,'pl.pdf','application/pdf',100,'a'.repeat(64),'From QuickBooks']);
 await assert.rejects(put(s.other,upload.path),/row-level security|policy/);
 await put(helper(),upload.path);await s.one(helper(),'select public.kalling_helper_finish($1)',[upload.id]);
 assert.equal(await read(s.owner,upload.path),0,'brokerage cannot read a waiting helper file');
 assert.equal(await read(s.buyer,upload.path),0);
 assert.equal(await read(s.seller,upload.path),1,'the owner can preview it');assert.equal(await read(s.seller,upload.path,'object.sign'),0);
 assert.equal(await read(s.seller,upload.path,'object.get_authenticated_info'),1,'Storage looks up the file details before the download');
 assert.equal((await s.as(s.owner,'select * from public.kalling_portal_files where portal_id=$1',[s.portal])).length,0);
 await assert.rejects(s.one(s.owner,'select public.kalling_helper_decide($1,$2,$3)',[upload.id,'Approved','']),/Only the business owner/);
 await s.one(s.seller,'select public.kalling_helper_decide($1,$2,$3)',[upload.id,'Approved','']);
 const files=await s.as(s.owner,'select id,uploader_name from public.kalling_portal_files where portal_id=$1',[s.portal]);assert.equal(files.length,1);assert.match(files[0].uploader_name,/gathered by Fictional Mary/);
 assert.equal(await read(s.owner,upload.path),1,'after approval the brokerage reads it like any owner upload');
 const r=(await s.as(s.owner,'select file_ids,status from public.kalling_portal_requests where id=$1',[req]))[0];assert.equal(r.file_ids[0],files[0].id);assert.equal(r.status,'In progress');
 assert.equal((await s.one(helper(),'select public.kalling_helper_home()'))[0].requests[0].uploads[0].status,'Approved');
});

test('sending back, withdrawing, removal and the engagement gate',async()=>{
 const u=await s.one(helper(),'select public.kalling_helper_reserve($1,$2,$3,$4,$5,$6,$7)',[hid,req,'old.pdf','application/pdf',100,'b'.repeat(64),'']);await put(helper(),u.path);await s.one(helper(),'select public.kalling_helper_finish($1)',[u.id]);
 await s.one(s.seller,'select public.kalling_helper_decide($1,$2,$3)',[u.id,'Declined','Wrong year']);
 assert.equal(await read(s.seller,u.path),0,'a declined file is no longer readable');
 const list=await s.one(s.seller,'select public.kalling_helper_owner_list($1)',[s.portal]);assert.equal(list[0].uploads.find(x=>x.id===u.id).ownerNote,'Wrong year');
 const w=await s.one(helper(),'select public.kalling_helper_reserve($1,$2,$3,$4,$5,$6,$7)',[hid,req,'w.pdf','application/pdf',100,'d'.repeat(64),'']);
 await assert.rejects(s.one(s.other,'select public.kalling_helper_withdraw($1)',[w.id]),/own files/);await s.one(helper(),'select public.kalling_helper_withdraw($1)',[w.id]);
 await s.db.query('update public.kalling_portals set requests_hidden=true where id=$1',[s.portal]);
 assert.equal((await s.one(helper(),'select public.kalling_helper_home()'))[0].requests.length,0);
 await assert.rejects(s.one(helper(),'select public.kalling_helper_reserve($1,$2,$3,$4,$5,$6,$7)',[hid,req,'x.pdf','application/pdf',100,'e'.repeat(64),'']),/access has ended/);
 await s.db.query('update public.kalling_portals set requests_hidden=false where id=$1',[s.portal]);
 await s.one(s.seller,'select public.kalling_helper_remove($1)',[hid]);
 assert.equal((await s.one(helper(),'select public.kalling_helper_home()')).length,0);
 await assert.rejects(s.one(helper(),'select public.kalling_helper_reserve($1,$2,$3,$4,$5,$6,$7)',[hid,req,'y.pdf','application/pdf',100,'f'.repeat(64),'']),/access has ended/);
 for(const t of ['helper_people','helper_invites','helper_uploads'])await assert.rejects(s.as(s.seller,`select * from kalling_private.${t}`),/permission denied/);
});

test('advisors see who each party appointed, never what was shared',async()=>{
 const t1=await s.one(s.seller,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['seller','Fictional Seller CPA','seller-cpa@pro.invalid','Fictional & Co','CPA',90]);
 await s.one(s.buyer,'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)',['buyer','Fictional Buyer Attorney','buyer-law@pro.invalid','','Attorney',90]);
 const list=await s.one(s.owner,'select public.kalling_pro_advisor_list($1)',[s.portal]);
 assert.deepEqual(list.map(x=>[x.side,x.role,x.name]).sort(),[['buyer','Attorney','Fictional Buyer Attorney'],['seller','CPA','Fictional Seller CPA']]);
 assert.ok(list.every(x=>!('grants' in x)&&!('views' in x)));
 assert.equal((await s.one(s.viewer,'select public.kalling_pro_advisor_list($1)',[s.portal])).length,2,'read-only team members see it too');
 await assert.rejects(s.one(s.buyer,'select public.kalling_pro_advisor_list($1)',[s.portal]),/Advisor access denied/);
 await assert.rejects(s.one(s.seller,'select public.kalling_pro_advisor_list($1)',[s.portal]),/Advisor access denied/);
 void t1;
});
