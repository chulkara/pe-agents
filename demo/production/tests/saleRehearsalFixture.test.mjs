import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './marketplace-helpers.mjs';
import {fictionalEmails} from '../../scripts/hosted-validation.mjs';
test('sale rehearsal fixture resets a Restricted fictional buyer, logs the reset and stays repeatable',async()=>{
 const s=await marketplaceFixture();try{
  await s.db.exec('delete from kalling_private.brokerage_settings;delete from public.kalling_buyers;delete from public.kalling_leads;');
  const ids={owner_a:s.owner,owner_b:s.outsider,member:s.viewer,seller:s.seller,buyer:s.buyer,specialist:s.other};for(const [role,id]of Object.entries(ids))await s.db.query('update auth.users set email=$1 where id=$2',[fictionalEmails[role],id]);
  await s.db.exec('alter table auth.users add column if not exists email_confirmed_at timestamptz');await s.db.exec('update auth.users set email_confirmed_at=now()');
  const base=randomUUID(),workspace={firm:{name:'Fictional hosted validation A '+base},companies:[],deals:[],events:[]};await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,1,workspace,'Fictional setup']);
  await s.one(s.outsider,'select public.kalling_create_firm($1,$2)',['Fictional hosted validation B '+base,{...workspace,firm:{name:'Fictional hosted validation B '+base}}]);
  await s.db.exec(await readFile(new URL('../fixtures/prepare-buyer-access.sql',import.meta.url),'utf8'));
  await s.db.query("insert into public.kalling_buyers(user_id,email,name,type,funds,experience,status) values($1,$2,'Fictional Acceptance Buyer','Owner-operator','$500K to $1M','Fictional experience for the rehearsal test.','Restricted')",[s.buyer,fictionalEmails.buyer]);
  const sql=await readFile(new URL('../fixtures/prepare-sale-rehearsal.sql',import.meta.url),'utf8');
  const out=(await s.db.exec(sql)).at(-1).rows[0].sale_rehearsal_fixture;
  assert.equal(out.status,'prepared');assert.equal(out.buyerStatus,'Registered');assert.equal(out.intakeOpen,false);
  const audit=(await s.db.query("select count(*)::int n from public.kalling_audit where event like 'Rehearsal reset the fictional buyer%'")).rows[0].n;assert.equal(audit,1);
  // Running it again changes nothing and logs nothing new.
  const again=(await s.db.exec(sql)).at(-1).rows[0].sale_rehearsal_fixture;assert.equal(again.buyerStatus,'Registered');
  assert.equal((await s.db.query("select count(*)::int n from public.kalling_audit where event like 'Rehearsal reset the fictional buyer%'")).rows[0].n,1);
  assert.equal((await s.db.query("select count(*)::int n from public.kalling_leads where email=$1 and status='New'",[fictionalEmails.seller])).rows[0].n,1);
 }finally{await s.db.close();}
});
