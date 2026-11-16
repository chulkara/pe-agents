import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './marketplace-helpers.mjs';
import {hostedClientFixture} from './hosted-client-fixture.mjs';
import {buyerAccessRun} from '../../scripts/hosted-buyer-access.mjs';
import {handoverRun} from '../../scripts/hosted-handover.mjs';
import {roles,fictionalEmails} from '../../scripts/hosted-validation.mjs';
import {deployedCloudProject} from '../../lib/cloudProject.ts';

test('the full closing-file runner preserves a passed buyer fixture and enforces real SQL and byte access with simulated Auth and HTTP',async()=>{
 const s=await marketplaceFixture({intakeOpen:false});try{
  const ids={owner_a:s.owner,owner_b:s.outsider,member:s.viewer,seller:s.seller,buyer:s.buyer,specialist:s.other},accounts=Object.fromEntries(roles.map(r=>[r,{email:fictionalEmails[r],password:'Fictional-local-protocol-only-12345'}]));
  for(const r of roles){await s.db.query('update auth.users set email=$1 where id=$2',[accounts[r].email,ids[r]]);await s.db.query('update public.kalling_buyers set email=$1,name=$2 where user_id=$3',[accounts[r].email,'Fictional Existing Buyer',ids[r]]);}
  const base=randomUUID(),buyerFixtureId=randomUUID(),company='fictional-buyer-access-'+buyerFixtureId,wa={firm:{name:'Fictional hosted validation A '+base},companies:[{id:company,name:'Fictional HVAC buyer access validation',sample:true}],deals:[],events:[]};
  await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,1,wa,'Fictional handover test']);
  const otherFirm=await s.one(s.outsider,'select public.kalling_create_firm($1,$2)',['Fictional hosted validation B '+base,{...wa,firm:{name:'Fictional hosted validation B '+base}}]);
  const listing=(await s.db.query("select id from public.kalling_listings where number='KL-1047'")).rows[0].id;
  await s.db.query("update public.kalling_listings set headline='Sample HVAC company for software validation' where id=$1",[listing]);await s.db.query("update public.kalling_listing_private set business_name='Fictional HVAC buyer access validation',company_id=$2 where listing_id=$1",[listing,company]);
  const foundation={project:deployedCloudProject.url,mode:'run',status:'passed',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:24},()=>({status:'passed'})),fixtureManifest:{project:deployedCloudProject.url,fixture:base,firms:[s.firm,otherFirm]}};
  const priorFixture={project:deployedCloudProject.url,mode:'buyer-access',status:'prepared',fixture:buyerFixtureId,firm:s.firm,otherFirm,company,listing,listingNumber:'KL-1047',expectedHeadline:'Sample HVAC company for software validation'},sdk=hostedClientFixture(s,accounts,ids),buyerChecks=[],buyerManifest={};
  const transport=await buyerAccessRun(deployedCloudProject,accounts,foundation,priorFixture,(pass,name)=>{assert.ok(pass,name);buyerChecks.push({name,status:'passed'});},buyerManifest,{makeClient:sdk.makeClient});
  const buyerReport={project:deployedCloudProject.url,mode:'buyer-access',status:'passed',transport,checks:buyerChecks,fixtureManifest:buyerManifest};
  const setup=await readFile(new URL('../fixtures/prepare-handover.sql',import.meta.url),'utf8');
  // A changed public-intake setting is a hard stop, not a reason to replace it.
  await s.db.exec('update kalling_private.brokerage_settings set intake_open=true');await assert.rejects(s.db.exec(setup),/Preserve the configured/);await s.db.exec('rollback;update kalling_private.brokerage_settings set intake_open=false');
  const prepared=await s.db.exec(setup),fixture=prepared.at(-1).rows[0].handover_fixture;
  await assert.rejects(s.db.exec(setup),/already exists/);await s.db.exec('rollback');
  const checks=[],manifest={};
  const result=await handoverRun(deployedCloudProject,accounts,foundation,buyerReport,fixture,(pass,name)=>{assert.ok(pass,name);checks.push(name);console.log('Handover:',name);},manifest,{makeClient:sdk.makeClient});
  assert.equal(checks.length,90);assert.equal(result.actualAuthenticatedTransport,true);assert.equal(manifest.fixtureClosed,true);assert.equal(manifest.buyerRestricted,true);assert.equal(manifest.portalClosed,true);assert.equal(manifest.memberRevoked,true);assert.equal(sdk.signedOut.length,12);
  assert.equal((await s.db.query('select status from public.kalling_listings where id=$1',[listing])).rows[0].status,'Withdrawn');
  assert.equal((await s.db.query('select status from public.kalling_listings where id=$1',[fixture.listing])).rows[0].status,'Sold');
  const t=(await s.db.query('select * from kalling_private.execution_transactions where id=$1',[manifest.transaction])).rows[0];assert.equal(t.state,'Closed');assert.equal(t.data.closes.length,1);assert.deepEqual(t.data.closes[0].handover,manifest.handover);
  assert.equal((await s.db.query("select count(*)::int n from kalling_private.execution_participants where transaction_id=$1 and status='Active'",[manifest.transaction])).rows[0].n,0);
  assert.equal((await s.db.query('select intake_open from kalling_private.brokerage_settings')).rows[0].intake_open,false);
  assert.equal((await s.db.query('select count(*)::int n from public.kalling_leads')).rows[0].n,0);assert.equal((await s.db.query('select count(*)::int n from kalling_private.alert_outbox')).rows[0].n,0);
  assert.equal((await s.db.query('select count(*)::int n from public.kalling_listings where not sample')).rows[0].n,0);
  console.log('Simulated closing-file protocol checks:',checks.length);
  // A real transport failure must not be reported as a successful refusal. The
  // controller retains partial history, closes the portal and removes access.
  const next=(await s.db.exec(setup)).at(-1).rows[0].handover_fixture,partial={};
  await assert.rejects(handoverRun(deployedCloudProject,accounts,foundation,buyerReport,next,(pass,name)=>{assert.ok(pass,name);if(name.startsWith('The app resumes arrived bytes'))throw Error('Simulated connection interruption for cleanup coverage.');},partial,{makeClient:sdk.makeClient}),/Simulated connection interruption/);
  assert.equal(partial.fixtureClosed,undefined);assert.equal(partial.portalClosed,true);assert.equal(partial.buyerRestricted,true);assert.equal(partial.memberRevoked,true);
  assert.equal((await s.db.query('select state from kalling_private.execution_transactions where id=$1',[partial.transaction])).rows[0].state,'Planning');
  assert.equal((await s.db.query('select status from public.kalling_portals where id=$1',[partial.portal])).rows[0].status,'Closed');
  assert.equal(sdk.signedOut.length,18);assert.equal((await s.db.query('select intake_open from kalling_private.brokerage_settings')).rows[0].intake_open,false);
 }finally{await s.db.close();}
});
