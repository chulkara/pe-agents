import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {marketplaceFixture} from './marketplace-helpers.mjs';
import {ownerUploadRun,recheckOwnerRevocation,ownerChangeCheck} from '../../scripts/hosted-owner-uploads.mjs';
import {roles,fictionalEmails} from '../../scripts/hosted-validation.mjs';
import {deployedCloudProject} from '../../lib/cloudProject.ts';

// Executes the whole acceptance protocol against PostgreSQL policies and a
// byte store. Auth and HTTP are simulated here, not claimed as hosted evidence.
test('owner-upload acceptance protocol completes against real SQL permissions without configuring a house or creating more firms',async()=>{
  const s=await marketplaceFixture();
  try{
    await s.db.exec('delete from kalling_private.brokerage_settings');
    const ids={owner_a:s.owner,owner_b:s.outsider,member:s.viewer,seller:s.seller,buyer:s.buyer,specialist:s.other};
    const accounts=Object.fromEntries(roles.map(role=>[role,{email:fictionalEmails[role],password:'Fictional-local-protocol-only-12345'}]));
    for(const role of roles)await s.db.query('update auth.users set email=$1 where id=$2',[accounts[role].email,ids[role]]);
    const fixture=randomUUID(),wa={firm:{name:'Fictional hosted validation A '+fixture},companies:[{id:'foundation',name:'Fictional HVAC',sample:true}],deals:[],events:[]};
    await s.one(s.owner,'select public.kalling_save_workspace($1,$2,$3,$4)',[s.firm,1,wa,'Fictional foundation report fixture']);
    const wb={...wa,firm:{name:'Fictional hosted validation B '+fixture}};
    const fb=await s.one(s.outsider,'select public.kalling_create_firm($1,$2)',[wb.firm.name,wb]);
    const report={project:deployedCloudProject.url,status:'passed',mode:'run',checks:Array.from({length:24},()=>({status:'passed'})),transport:{actualAuthenticatedTransport:true},fixtureManifest:{project:deployedCloudProject.url,fixture,firms:[s.firm,fb]}};
    const bytes=new Map(),signedOut=[];
    async function query(uid,sql,args=[],operation=''){
      await s.db.exec('begin;set local role '+(uid?'authenticated':'anon'));
      try{
        await s.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[uid||'',operation]);
        const r=await s.db.query(sql,args);await s.db.exec('commit');return {data:r.rows,error:null,status:200};
      }catch(e){await s.db.exec('rollback');return {data:null,error:{code:e.code,message:e.message,statusCode:e.code==='42501'?403:400},status:e.code==='42501'?403:400};}
    }
    function makeClient(){
      let uid=null;
      return {
        auth:{
          signInWithPassword:async credentials=>{const role=roles.find(r=>accounts[r].email===credentials.email&&accounts[r].password===credentials.password);uid=ids[role];return {data:{session:uid?{access_token:'fictional-simulated-token-'+uid}:null},error:uid?null:{status:400}};},
          getSession:async()=>({data:{session:uid?{access_token:'fictional-simulated-token-'+uid}:null},error:null}),
          getUser:async()=>{const r=await s.db.query('select id,email,email_confirmed_at from auth.users where id=$1',[uid]);return {data:{user:r.rows[0]},error:null};},
          signOut:async()=>{signedOut.push(uid);uid=null;return {error:null};},
        },
        rpc:async(name,args)=>{
          assert.match(name,/^kalling_[a-z_]+$/);const keys=Object.keys(args);keys.forEach(k=>assert.match(k,/^p_[a-z0-9_]+$/));
          const r=await query(uid,'select public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',Object.values(args));return {...r,data:r.data?.[0]?.result??null};
        },
        from:table=>{
          assert.match(table,/^kalling_[a-z_]+$/);let fields='*';const filters=[];
          const run=async single=>{const r=await query(uid,'select '+fields+' from public.'+table+(filters.length?' where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and '):''),filters.map(x=>x[1]));return {...r,data:single?r.data?.[0]??null:r.data};};
          const q={select:value=>{assert.match(value,/^(\*|[a-z_,]+)$/);fields=value;return q;},eq:(key,value)=>{assert.match(key,/^[a-z_]+$/);filters.push([key,value]);return q;},single:()=>run(true),then:(yes,no)=>run(false).then(yes,no)};return q;
        },
        storage:{from:bucket=>({
          upload:async(path,content,options)=>{
            if(options.upsert){const r=await query(uid,'update storage.objects set metadata=$1 where bucket_id=$2 and name=$3 returning id',[{size:content.length,mimetype:options.contentType},bucket,path]);if(r.data?.length)bytes.set(path,Buffer.from(content));return r.data?.length?r:{error:{statusCode:403}};}
            const r=await query(uid,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,{size:content.length,mimetype:options.contentType}]);if(!r.error)bytes.set(path,Buffer.from(content));return r;
          },
          // The hosted failing request used the metadata operation before bytes.
          // Exercise both contexts so a read-only SQL simulation cannot mask it.
          download:async(path,options,parameters)=>{assert.ok(options.cacheNonce);assert.equal(parameters.cache,'no-store');for(const operation of ['object.get_authenticated_info','object.get_authenticated']){const r=await query(uid,'select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path],operation);if(!r.data?.length)return {data:null,error:{status:400,statusCode:'NoSuchKey',code:'NoSuchKey'}};}return bytes.has(path)?{data:new Blob([bytes.get(path)]),error:null}:{data:null,error:{status:400,statusCode:'NoSuchKey',code:'NoSuchKey'}};},
          createSignedUrl:async path=>{const r=await query(uid,'select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path],'object.sign');return r.data?.length?{data:{signedUrl:'fictional-signed-link'},error:null}:{error:{statusCode:r.error?.statusCode||404}};},
        })},
      };
    }
    const checks=[],manifest={};await ownerUploadRun(deployedCloudProject,accounts,report,(pass,name)=>{assert.ok(pass,name);checks.push(name);},manifest,{makeClient});
    assert.equal(checks.length,50);assert.equal(manifest.portalClosed,true);assert.equal(signedOut.length,6);
    // Recreate only the final failed report's state, without another full run.
    // The focused probe must check this original file and JWT, not a fresh file.
    await s.db.query("update public.kalling_portals set status='Draft' where id=$1",[manifest.portals[0]]);
    const partial=structuredClone(manifest);delete partial.portalClosed;
    const previous={project:deployedCloudProject.url,mode:'owner-uploads',status:'failed',fixtureManifest:partial,checks:[...checks.slice(0,48).map(name=>({name,status:'passed'})),{name:ownerChangeCheck,status:'failed'}]};
    const altered=structuredClone(previous);altered.fixtureManifest.files[1].sha256='0'.repeat(64);
    await assert.rejects(recheckOwnerRevocation(deployedCloudProject,{owner_a:accounts.owner_a,seller:accounts.seller},report,altered,()=>{}, {},{makeClient}),/linked original file has changed/);
    const untouched=(await s.db.query('select status,owner_email,seller_id from public.kalling_portals where id=$1',[manifest.portals[0]])).rows[0];assert.equal(untouched.status,'Draft');assert.equal(untouched.owner_email,fictionalEmails.buyer);assert.equal(untouched.seller_id,null);
    const resumedChecks=[],resumed={};const result=await recheckOwnerRevocation(deployedCloudProject,{owner_a:accounts.owner_a,seller:accounts.seller},report,previous,(pass,name)=>{assert.ok(pass,name);resumedChecks.push(name);},resumed,{makeClient});
    assert.equal(result.originalOwnerUploadChecksCompleted,50);assert.equal(resumedChecks.length,9);assert.equal(resumed.portalClosed,true);assert.equal(resumed.linkedEvidence.sameSellerJwt,true);assert.equal(resumed.linkedEvidence.originalFile,manifest.files[1].id);assert.deepEqual(resumed.ownerRevocationResponse,{httpStatus:400,code:'NoSuchKey',hasError:true,hasData:false});assert.equal(signedOut.length,10);
    assert.equal((await s.db.query('select count(*)::int n from public.kalling_firms')).rows[0].n,2);
    assert.equal((await s.db.query('select count(*)::int n from kalling_private.brokerage_settings')).rows[0].n,0);
    assert.equal((await s.db.query('select active from public.kalling_members where firm_id=$1 and user_id=$2',[s.firm,s.viewer])).rows[0].active,false);
  }finally{await s.db.close();}
});
