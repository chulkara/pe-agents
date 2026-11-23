import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './marketplace-helpers.mjs';
import {hostedClientFixture} from './hosted-client-fixture.mjs';
import {buyerAccessRun} from '../../scripts/hosted-buyer-access.mjs';
import {roles,fictionalEmails} from '../../scripts/hosted-validation.mjs';
import {deployedCloudProject} from '../../lib/cloudProject.ts';
test('the entire buyer acceptance runner and trusted validator enforce real SQL permissions with simulated Auth and HTTP',async()=>{
  const s=await marketplaceFixture({intakeOpen:false});try{
    const ids={owner_a:s.owner,owner_b:s.outsider,member:s.viewer,seller:s.seller,buyer:s.buyer,specialist:s.other},accounts=Object.fromEntries(roles.map(r=>[r,{email:fictionalEmails[r],password:'Fictional-local-protocol-only-12345'}]));
    for(const r of roles){await s.db.query('update auth.users set email=$1 where id=$2',[accounts[r].email,ids[r]]);await s.db.query('update public.kalling_buyers set email=$1,name=$2 where user_id=$3',[accounts[r].email,'Fictional Existing Buyer',ids[r]]);}
    const base=randomUUID(),fixtureId=randomUUID(),company='fictional-buyer-access-'+fixtureId,wa={firm:{name:'Fictional hosted validation A '+base},companies:[{id:company,name:'Fictional HVAC buyer access validation',sample:true}],deals:[],events:[]};
    await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,1,wa,'Fictional acceptance test']);
    const otherFirm=await s.one(s.outsider,'select public.kalling_create_firm($1,$2)',['Fictional hosted validation B '+base,{...wa,firm:{name:'Fictional hosted validation B '+base}}]);
    const listing=(await s.db.query("select id from public.kalling_listings where number='KL-1047'")).rows[0].id;
    await s.db.query("update public.kalling_listings set headline='Sample HVAC company for software validation' where id=$1",[listing]);
    await s.db.query("update public.kalling_listing_private set business_name='Fictional HVAC buyer access validation',company_id=$2 where listing_id=$1",[listing,company]);
    const foundation={project:deployedCloudProject.url,mode:'run',status:'passed',transport:{actualAuthenticatedTransport:true},checks:Array.from({length:24},()=>({status:'passed'})),fixtureManifest:{project:deployedCloudProject.url,fixture:base,firms:[s.firm,otherFirm]}};
    const fixture={project:deployedCloudProject.url,mode:'buyer-access',status:'prepared',fixture:fixtureId,firm:s.firm,otherFirm,company,listing,listingNumber:'KL-1047',expectedHeadline:'Sample HVAC company for software validation'},sdk=hostedClientFixture(s,accounts,ids),checks=[],manifest={};
    const result=await buyerAccessRun(deployedCloudProject,accounts,foundation,fixture,(pass,name)=>{assert.ok(pass,name);checks.push(name);},manifest,{makeClient:sdk.makeClient});
    assert.equal(checks.length,65);assert.equal(result.actualAuthenticatedTransport,true);assert.equal(manifest.fixtureClosed,true);assert.equal(manifest.memberRevoked,true);assert.equal(manifest.stampedPages,2);assert.equal(sdk.signedOut.length,6);
    assert.equal((await s.db.query('select status from public.kalling_portals where id=$1',[manifest.portal])).rows[0].status,'Closed');
    assert.equal((await s.db.query('select status from public.kalling_listings where id=$1',[listing])).rows[0].status,'Withdrawn');
    assert.equal((await s.db.query('select intake_open from kalling_private.brokerage_settings')).rows[0].intake_open,false);
    assert.equal((await s.db.query('select count(*)::int n from public.kalling_leads')).rows[0].n,0);
    assert.equal((await s.db.query('select count(*)::int n from kalling_private.alert_outbox')).rows[0].n,0);
    console.log('Simulated protocol checks:',checks.length);
  }finally{await s.db.close();}
});
