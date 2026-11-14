import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough,Writable} from 'node:stream';
import {validateTarget,validateAccounts,loadAccounts,roles,fictionalEmails,readHiddenPassword,promptAccounts} from '../scripts/hosted-validation.mjs';
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
  try{
    await writeFile(p,JSON.stringify(accounts()),{mode:0o644});await assert.rejects(loadAccounts(p),/0600/);await rm(p);
    await writeFile(p,JSON.stringify(accounts()),{mode:0o600});assert.equal((await loadAccounts(p)).seller.email,'seller-3@kalling-validation.invalid');
    await writeFile(p,'{"password":"Fictional-sensitive-parser-fragment", invalid}');
    await assert.rejects(loadAccounts(p),error=>error.message==='Cannot read the credentials file as JSON. Its contents are not printed.');
  }
  finally{await rm(dir,{recursive:true,force:true});}
});
function terminal(){
  const input=new PassThrough();input.isTTY=true;input.isRaw=false;
  input.setRawMode=value=>{input.isRaw=value;};
  let visible='';const output=new Writable({write(chunk,_encoding,done){visible+=chunk;done();}});output.isTTY=true;
  return {input,output,visible:()=>visible};
}
test('password entry hides pasted credentials and restores the terminal, including cancellation',async()=>{
  const t=terminal(),secret='Fictional-paste-only-1234567890',answer=readHiddenPassword('Password: ',t);
  t.input.write(secret+'\r');assert.equal(await answer,secret);
  assert.equal(t.visible(),'Password: \n');assert.equal(t.input.isRaw,false);t.input.destroy();
  const c=terminal(),cancelled=readHiddenPassword('Password: ',c);c.input.write('\u0003');
  await assert.rejects(cancelled,/cancelled/);assert.equal(c.input.isRaw,false);assert.equal(c.visible(),'Password: \n');c.input.destroy();
  assert.throws(()=>readHiddenPassword('Password: ',{input:new PassThrough(),output:new PassThrough()}),/interactive Terminal/);
});
test('interactive setup binds the six known fictional identities and rejects incomplete credentials before a run',async()=>{
  const asked=[];const actual=await promptAccounts(async label=>{asked.push(label);return 'Fictional-private-only-1234567890';});
  assert.equal(asked.length,6);assert.deepEqual(Object.keys(actual),roles);
  assert.equal(actual.owner_a.email,'owner-a-20261114@kalling-validation.invalid');
  assert.equal(actual.owner_b.email,'owner-b-20261114@kalling-validation.invalid');
  for(const role of roles)assert.equal(actual[role].email,fictionalEmails[role]);
  await assert.rejects(promptAccounts(async()=> 'short'),/No validation requests were sent/);
});
