import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('current ordered migrations and the hosted smoke test enforce replacement approval and roll back every fixture',async()=>{
  const db=new PGlite();
  try{
    await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
    const names=(await readdir(new URL('../migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')&&!name.startsWith('002')).sort();
    for(const name of names)await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
    const result=await db.exec(await readFile(new URL('./phase3-smoke.sql',import.meta.url),'utf8'));
    assert.equal(result.at(-1).rows[0].phase3_validation.status,'passed');
    assert.equal(result.at(-1).rows[0].phase3_validation.checks.length,16);
    for(const table of ['auth.users','public.kalling_firms','public.kalling_portals','public.kalling_agent_jobs','public.kalling_agent_workers','public.kalling_portal_letters','public.kalling_access','storage.objects','kalling_private.brokerage_settings'])assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,0,table+' kept fictional fixtures');
    assert.equal((await db.query('select count(*)::int n from public.kalling_listings where not sample')).rows[0].n,0);
  }finally{await db.close();}
});
