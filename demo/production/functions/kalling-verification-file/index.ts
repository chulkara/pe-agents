// Trusted byte validation only. No extraction, model or external service receives this file.
import {inspectProof} from '../../../lib/buyerVerification.ts';
type Env={url:string;publicKey:string;serverKey:string};
export function verificationFileHandler(env:Env,request:typeof fetch=fetch){
  return async(req:Request)=>{
    const origin=req.headers.get('origin'),allowed=!origin||origin==='https://chulkara.github.io'||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin&&allowed){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='POST, OPTIONS';}
    const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(!allowed)return response({error:'Origin not allowed'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='POST')return response({error:'Use POST'},405);
    const auth=req.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(auth))return response({error:'Sign in first'},401);
    try{
      const authHeaders={Authorization:auth,apikey:env.publicKey,'Content-Type':'application/json'};
      const identity=await request(env.url+'/auth/v1/user',{headers:authHeaders});if(!identity.ok)return response({error:'Sign in first'},401);
      const user=await identity.json();if(!user.id||!user.email_confirmed_at)return response({error:'Confirm your email first'},403);
      const body=await req.json();if(!/^[0-9a-f-]{36}$/i.test(body.fileId||''))return response({error:'Invalid file'},400);
      const reserve=await request(env.url+'/rest/v1/rpc/kalling_verification_prepare_validation',{method:'POST',headers:authHeaders,body:JSON.stringify({p_file:body.fileId})});
      if(!reserve.ok)return response({error:'Document access denied'},403);const meta=await reserve.json();
      if(!meta.path||meta.size>10*1024*1024||meta.size<1)return response({error:'Invalid reservation'},400);
      const file=await request(env.url+'/storage/v1/object/authenticated/kalling-buyer-proof/'+meta.path.split('/').map(encodeURIComponent).join('/'),{headers:authHeaders,cache:'no-store'});
      if(!file.ok)return response({error:'Upload unavailable'},409);
      const reported=Number(file.headers.get('content-length'));if(reported>10*1024*1024)return response({error:'File too large'},400);
      const bytes=await file.arrayBuffer();const proof=await inspectProof(new File([bytes],meta.name,{type:meta.mime}));
      if(proof.sha256!==meta.sha256||proof.size!==meta.size||proof.mime!==meta.mime)return response({error:'File does not match reservation'},400);
      const attest=await request(env.url+'/rest/v1/rpc/kalling_verification_attest',{method:'POST',headers:{Authorization:'Bearer '+env.serverKey,apikey:env.serverKey,'Content-Type':'application/json'},body:JSON.stringify({p_file:body.fileId,p_user:user.id,p_sha:proof.sha256,p_size:proof.size,p_mime:proof.mime})});
      if(!attest.ok)return response({error:'The draft changed or validation was refused'},409);
      return response({ok:true});
    }catch{return response({error:'File validation failed. Use a PDF, PNG or JPEG matching the reservation.'},400);}
  };
}
// Supabase supplies these environment variables server-side. No value is checked into source.
declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(r:Request)=>Promise<Response>)=>void};
if(typeof Deno!=='undefined')Deno.serve(verificationFileHandler({url:Deno.env.get('SUPABASE_URL')!,publicKey:Deno.env.get('SUPABASE_ANON_KEY')!,serverKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}));
