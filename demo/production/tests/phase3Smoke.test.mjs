import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('all Phase 3 migrations work in order and the hosted smoke test rolls back every fixture',async()=>{
  const db=new PGlite();
  try{
    await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
    for(const name of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','005_brokerage.sql','006_buyer_checks.sql','007_drafting_jobs.sql','008_listing_anonymity.sql','009_data_room.sql','010_engagement_letters.sql','011_owner_reviews.sql','20261113032739_kalling_dataroom_revocation.sql'])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
    const result=await db.exec(await readFile(new URL('./phase3-smoke.sql',import.meta.url),'utf8'));
    assert.equal(result.at(-1).rows[0].phase3_validation.status,'passed');
    for(const table of ['auth.users','public.kalling_firms','public.kalling_portals','public.kalling_agent_jobs','public.kalling_agent_workers','public.kalling_portal_letters','public.kalling_access','storage.objects','kalling_private.brokerage_settings'])assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,0,table+' kept fictional fixtures');
    assert.equal((await db.query('select count(*)::int n from public.kalling_listings where not sample')).rows[0].n,0);
  }finally{await db.close();}
});
