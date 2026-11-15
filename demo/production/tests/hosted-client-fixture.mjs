// SDK/Auth/HTTP stand-ins backed by real PostgreSQL roles and byte fingerprints.
// This verifies the runner and policies; it is not hosted transport evidence.
import assert from 'node:assert/strict';
import {verificationFileHandler} from '../functions/kalling-verification-file/index.ts';
import {roles} from '../../scripts/hosted-validation.mjs';
export function hostedClientFixture(s,accounts,ids){
  const bytes=new Map(),signedOut=[];
  async function query(uid,sql,args=[],operation='',role=uid?'authenticated':'anon'){
    await s.db.exec('begin;set local role '+role);
    try{await s.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('storage.operation',$2,true)",[uid||'',operation]);const r=await s.db.query(sql,args);await s.db.exec('commit');return {data:r.rows,error:null,status:200};}
    catch(e){await s.db.exec('rollback');return {data:null,error:{code:e.code,message:e.message,status:e.code==='42501'?403:400},status:e.code==='42501'?403:400};}
  }
  async function rpc(uid,name,args,role){assert.match(name,/^kalling_[a-z_]+$/);const keys=Object.keys(args);keys.forEach(k=>assert.match(k,/^(p|p_[a-z0-9_]+)$/));const r=await query(uid,'select public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') result',Object.values(args),'',role);return {...r,data:r.data?.[0]?.result??null};}
  const missing=()=>({data:null,error:{status:400,statusCode:'NoSuchKey',code:'NoSuchKey'}});
  async function download(uid,bucket,path){for(const op of ['object.get_authenticated_info','object.get_authenticated']){const r=await query(uid,'select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path],op);if(!r.data?.length)return missing();}return bytes.has(bucket+'/'+path)?{data:new Blob([bytes.get(bucket+'/'+path)]),error:null}:missing();}
  const response=(r)=>new Response(JSON.stringify(r.error?{message:r.error.message}:r.data),{status:r.error?r.status:200,headers:{'Content-Type':'application/json'}});
  const handler=verificationFileHandler({url:'https://fixture.invalid',publicKey:'fictional-public',serverKey:'fictional-server-test-only'},async(url,init)=>{
    const u=new URL(url),auth=new Headers(init.headers).get('Authorization'),uid=auth?.startsWith('Bearer fictional-user-')?auth.slice('Bearer fictional-user-'.length):null;
    if(u.pathname==='/auth/v1/user'){const rows=uid?(await s.db.query('select * from auth.users where id=$1',[uid])).rows:[];return new Response(JSON.stringify(rows[0]||{}),{status:rows.length?200:401});}
    if(u.pathname.startsWith('/rest/v1/rpc/')){
      const name=u.pathname.split('/').at(-1),args=JSON.parse(init.body);
      if(name==='kalling_verification_attest'){assert.equal(auth,'Bearer fictional-server-test-only');return response(await rpc(null,name,args,'service_role'));}
      return response(await rpc(uid,name,args));
    }
    if(u.pathname.startsWith('/storage/v1/object/authenticated/')){const [bucket,...path]=u.pathname.split('/authenticated/')[1].split('/').map(decodeURIComponent);const r=await download(uid,bucket,path.join('/'));return r.error?new Response('{}',{status:400}):new Response(r.data);}
    throw Error('Unexpected validator request: '+u.pathname);
  });
  function makeClient(){let uid=null;
    return {auth:{
      signInWithPassword:async credentials=>{const role=roles.find(r=>accounts[r].email===credentials.email&&accounts[r].password===credentials.password);uid=ids[role];return {data:{session:uid?{access_token:'fictional-user-'+uid}:null},error:uid?null:{status:400}};},
      getUser:async()=>({data:{user:uid?(await s.db.query('select * from auth.users where id=$1',[uid])).rows[0]:null},error:uid?null:{status:401}}),
      getSession:async()=>({data:{session:uid?{access_token:'fictional-user-'+uid}:null},error:null}),
      signOut:async()=>{signedOut.push(uid);uid=null;return {error:null};},
    },rpc:(name,args={})=>rpc(uid,name,args),
    from:table=>{assert.match(table,/^kalling_[a-z_]+$/);let fields='*';const filters=[];const run=async single=>{const r=await query(uid,'select '+fields+' from public.'+table+(filters.length?' where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and '):''),filters.map(x=>x[1]));return {...r,data:single?r.data?.[0]??null:r.data};};const q={select:value=>{assert.match(value,/^(\*|[a-z_,]+)$/);fields=value;return q;},eq:(key,value)=>{assert.match(key,/^[a-z_]+$/);filters.push([key,value]);return q;},single:()=>run(true),then:(yes,no)=>run(false).then(yes,no)};return q;},
    storage:{from:bucket=>({
      upload:async(path,content,options)=>{const data=Buffer.from(await (content.arrayBuffer?content.arrayBuffer():content)),meta={size:data.length,mimetype:options.contentType};const r=await query(uid,options.upsert?'update storage.objects set metadata=$3 where bucket_id=$1 and name=$2 returning id':'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,meta]);const saved=!r.error&&(!options.upsert||r.data?.length);if(saved)bytes.set(bucket+'/'+path,data);return saved?r:{data:null,error:{status:r.error?.code==='23505'?409:403},status:r.error?.code==='23505'?409:403};},
      info:async path=>{const r=await query(uid,'select metadata from storage.objects where bucket_id=$1 and name=$2',[bucket,path],'object.get_authenticated_info');return r.data?.length?{data:r.data[0].metadata,error:null}:missing();},
      download:async(path,options,parameters)=>{assert.ok(options.cacheNonce);assert.equal(parameters.cache,'no-store');return download(uid,bucket,path);},
      createSignedUrl:async path=>{const r=await query(uid,'select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path],'object.sign');return r.data?.length?{data:{signedUrl:'fictional'},error:null}:missing();},
    })},
    functions:{invoke:async(name,{body})=>{assert.equal(name,'kalling-verification-file');const r=await handler(new Request('https://fixture.invalid/functions/'+name,{method:'POST',headers:{Authorization:'Bearer fictional-user-'+uid,'Content-Type':'application/json'},body:JSON.stringify(body)}));const data=await r.json();return {data,error:r.ok?null:{status:r.status}};}},
  };}
  return {makeClient,signedOut,bytes};
}
