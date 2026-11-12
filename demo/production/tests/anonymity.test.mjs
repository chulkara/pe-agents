import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 008 runs the same fixture as the browser checker (tests/anonymity.test.mjs).
let db;
before(async()=>{db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','005_brokerage.sql','008_listing_anonymity.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));});
after(async()=>db?.close());

test('shared fixture: the database blocks exactly the cases the browser blocks',async()=>{
  const cases=JSON.parse(await readFile(new URL('../../tests/fixtures/anonymity-cases.json',import.meta.url),'utf8'));
  for(const c of cases){const r=(await db.query('select kalling_private.anonymity_problems($1,$2,$3,$4,$5) p',[c.text,c.ctx.businessName,c.ctx.city,c.ctx.website,c.ctx.ownerName])).rows[0].p;
    assert.equal(r.length>0,c.blocks.length>0,c.name+': '+JSON.stringify(r));}
});
test('publishing checks the owner name and nearby towns; saving stores the owner name',async()=>{
  const owner='00000000-0000-0000-0000-0000000000b1';await db.query("insert into auth.users values($1,'o@kalling.test',now())",[owner]);
  const as=async(sql,args)=>{await db.exec('begin;set local role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows[0]?Object.values(r.rows[0])[0]:null;}catch(e){await db.exec('rollback;');throw e;}};
  const firm=await as('select public.kalling_create_firm($1,$2)',['Kalling',{firm:{name:'Kalling'},companies:[],deals:[],events:[]}]);await as('select public.kalling_brokerage_set_house($1)',[firm]);
  const base={headline:'Central Jersey residential HVAC company',summary:'A steady service company. '.repeat(6),askingPrice:1e6,revenue:2e6,sde:3e5,highlights:['a','b','c'],confidential:{businessName:'Russo Heating & Air',city:'Edison',ownerName:'Pat Russo'}};
  const id=await as('select public.kalling_listing_save($1)',[{...base,summary:base.summary+' Founder Russo stays on.'}]);
  assert.equal((await db.query('select owner_name from public.kalling_listing_private where listing_id=$1',[id])).rows[0].owner_name,'Pat Russo');
  await assert.rejects(as('select public.kalling_listing_set_status($1,$2)',[id,'Live']),/mentions “russo”/);
  await as('select public.kalling_listing_save($1)',[{id,summary:base.summary+' Serving Piscataway.'}]);await assert.rejects(as('select public.kalling_listing_set_status($1,$2)',[id,'Live']),/piscataway/);
  await as('select public.kalling_listing_save($1)',[{id,summary:base.summary}]);await as('select public.kalling_listing_set_status($1,$2)',[id,'Live']);
});
