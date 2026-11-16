import type {SupabaseClient} from '@supabase/supabase-js';

/** Every private read reaches current authorization with the existing JWT. */
export function downloadPrivateFile(client:SupabaseClient,bucket:string,path:string){
  return client.storage.from(bucket).download(path,{cacheNonce:crypto.randomUUID()},{cache:'no-store'});
}
type StorageResult={data?:unknown;error?:unknown;status?:unknown};
const record=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'?x as Record<string,unknown>:{};
const httpNumber=(x:unknown)=>typeof x==='number'&&Number.isInteger(x)&&x>=100&&x<=599?x:typeof x==='string'&&/^[1-5][0-9]{2}$/.test(x)?Number(x):null;
export function storageHttpStatus(result:StorageResult){
  const error=record(result.error);
  // StorageApiError.status is HTTP. statusCode may instead be "NoSuchKey".
  return httpNumber(error.status)??httpNumber(result.status)??httpNumber(error.statusCode);
}
export function isStorageRefusal(result:StorageResult){
  return !!result.error&&result.data==null&&[400,401,403,404].includes(storageHttpStatus(result)??0);
}
export function storageResultSummary(result:StorageResult){
  const e=record(result.error),known=['NoSuchKey','NoSuchBucket','AccessDenied','InvalidJWT','InvalidRequest','ResourceAlreadyExists','KeyAlreadyExists'];
  const code=[e.code,e.statusCode].find(x=>typeof x==='string'&&known.includes(x));
  return {httpStatus:storageHttpStatus(result),code:typeof code==='string'?code:null,hasError:!!result.error,hasData:result.data!=null};
}
