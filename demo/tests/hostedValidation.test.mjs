import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateTarget,validateAccounts,loadAccounts,roles} from '../scripts/hosted-validation.mjs';
import {deployedCloudProject} from '../lib/cloudProject.ts';
const accounts=()=>Object.fromEntries(roles.map((r,i)=>[r,{email:r+'-'+i+'@kalling-validation.invalid',password:'Fictional-validation-only-'+i+'-long'}]));
test('hosted acceptance rejects privileged keys, different projects, real contacts and shared identities before any HTTP write',()=>{
  assert.deepEqual(validateTarget(deployedCloudProject),deployedCloudProject);
  assert.throws(()=>validateTarget({...deployedCloudProject,publishableKey:'sb_secret_never_use'}));
  assert.throws(()=>validateTarget({...deployedCloudProject,url:'https://other-project.supabase.co'}));
  assert.doesNotThrow(()=>validateAccounts(accounts()));
  for(const edit of [a=>{a.owner_a.email='real@example.com';},a=>{a.member.email=a.owner_a.email;},a=>{a.buyer.password='short';}]){const a=accounts();edit(a);assert.throws(()=>validateAccounts(a));}
});
test('hosted acceptance refuses an exposed credentials file and accepts a protected external fixture file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'kalling-hosted-config-')),p=join(dir,'accounts.json');
  try{await writeFile(p,JSON.stringify(accounts()),{mode:0o644});await assert.rejects(loadAccounts(p),/0600/);await rm(p);await writeFile(p,JSON.stringify(accounts()),{mode:0o600});assert.equal((await loadAccounts(p)).seller.email,'seller-3@kalling-validation.invalid');}
  finally{await rm(dir,{recursive:true,force:true});}
});
