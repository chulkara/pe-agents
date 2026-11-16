import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './marketplace-helpers.mjs';
import {fictionalEmails} from '../../scripts/hosted-validation.mjs';
test('administrative buyer fixture admits only the two fictional buyers while public registration stays closed',async()=>{
 const s=await marketplaceFixture();try{
  await s.db.exec('delete from kalling_private.brokerage_settings;delete from public.kalling_buyers;');
  const ids={owner_a:s.owner,owner_b:s.outsider,member:s.viewer,seller:s.seller,buyer:s.buyer,specialist:s.other};for(const [role,id]of Object.entries(ids))await s.db.query('update auth.users set email=$1 where id=$2',[fictionalEmails[role],id]);
  const base=randomUUID(),workspace={firm:{name:'Fictional hosted validation A '+base},companies:[],deals:[],events:[]};await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,1,workspace,'Fictional setup']);
  await s.one(s.outsider,'select public.kalling_create_firm($1,$2)',['Fictional hosted validation B '+base,{...workspace,firm:{name:'Fictional hosted validation B '+base}}]);
  const sql=await readFile(new URL('../fixtures/prepare-buyer-access.sql',import.meta.url),'utf8'),out=await s.db.exec(sql),f=out.at(-1).rows[0].buyer_access_fixture;
  assert.equal(f.status,'prepared');assert.equal(f.firm,s.firm);assert.equal(f.company,'fictional-buyer-access-'+f.fixture);
  const config=(await s.db.query('select * from kalling_private.brokerage_settings')).rows[0];assert.equal(config.intake_open,false);assert.deepEqual(config.pilot_buyers,[s.buyer,s.other]);
  assert.equal((await s.db.query('select sample from public.kalling_listings where id=$1',[f.listing])).rows[0].sample,true);
  for(const table of ['public.kalling_leads','public.kalling_buyers','kalling_private.alert_outbox'])assert.equal((await s.db.query('select count(*)::int n from '+table)).rows[0].n,0);
  await assert.rejects(s.db.exec(sql),/already configured/);await s.db.exec('rollback');
  assert.equal((await s.db.query("select count(*)::int n from public.kalling_listings where headline='Sample HVAC company for software validation'")).rows[0].n,1);
 }finally{await s.db.close();}
});
