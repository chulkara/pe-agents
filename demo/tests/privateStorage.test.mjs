import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {downloadPrivateFile,isStorageRefusal,storageHttpStatus,storageResultSummary} from '../lib/privateStorage.ts';

test('real SDK semantic error codes do not hide their HTTP refusal status',async()=>{
  const client=createClient('https://example.supabase.co','public-fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>new Response(JSON.stringify({code:'NoSuchKey',message:'Object not found'}),{status:400,headers:{'Content-Type':'application/json'}})}});
  const result=await client.storage.from('fixture').download('opaque');
  assert.equal(result.error.statusCode,'NoSuchKey');assert.equal(result.error.status,400);
  assert.equal(storageHttpStatus(result),400);assert.equal(isStorageRefusal(result),true);
  assert.deepEqual(storageResultSummary(result),{httpStatus:400,code:'NoSuchKey',hasError:true,hasData:false});
  for(const status of [429,500,503])assert.equal(isStorageRefusal({error:{status,statusCode:'NoSuchKey'}}),false);
  assert.equal(isStorageRefusal({error:{statusCode:'403'}}),true);
  assert.equal(isStorageRefusal({error:{message:'Network failed'}}),false);
  assert.equal(isStorageRefusal({data:new Blob(['received']),error:{status:403}}),false);
});
test('private reads bypass a prior positive cache entry after revocation',async()=>{
  let revoked=false,network=0;const cache=new Map(),nonces=[];
  const client={storage:{from:()=>({download:async(path,options={},parameters={})=>{
    const key=path+'?'+(options.cacheNonce||'');nonces.push(options.cacheNonce);
    if(parameters.cache!=='no-store'&&cache.has(key))return cache.get(key);
    network++;const result=revoked?{data:null,error:{status:400,statusCode:'NoSuchKey'}}:{data:new Blob(['private']),error:null};cache.set(key,result);return result;
  }})}};
  assert.equal((await downloadPrivateFile(client,'private','original')).error,null);
  revoked=true;assert.equal(isStorageRefusal(await downloadPrivateFile(client,'private','original')),true);
  assert.equal(network,2);assert.equal(new Set(nonces).size,2);assert.ok(nonces.every(x=>typeof x==='string'&&x.length>0));
});
test('the pinned SDK sends fresh private URLs and preserves the same Authorization header',async()=>{
  const requests=[];
  const client=createClient('https://example.supabase.co','public-fixture-key',{accessToken:async()=>'fictional-retained-token',global:{fetch:async(url,init)=>{
    requests.push({url:String(url),cache:init.cache,authorization:new Headers(init.headers).get('Authorization')});
    return requests.length===1?new Response('fictional original'):new Response(JSON.stringify({code:'NoSuchKey',message:'Object not found'}),{status:400,headers:{'Content-Type':'application/json'}});
  }}});
  assert.equal(await (await downloadPrivateFile(client,'private','opaque/original')).data.text(),'fictional original');
  assert.equal(isStorageRefusal(await downloadPrivateFile(client,'private','opaque/original')),true);
  assert.equal(requests.length,2);assert.notEqual(requests[0].url,requests[1].url);
  for(const r of requests){assert.ok(new URL(r.url).searchParams.get('cacheNonce'));assert.equal(r.cache,'no-store');assert.equal(r.authorization,'Bearer fictional-retained-token');}
});
