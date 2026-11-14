import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudPortalStore} from '../lib/portalCloud.ts';

const row={id:'file-1',portal_id:'portal-1',request_id:'original-request',name:'fictional.txt',mime:'text/plain',size:4,sha256:'a'.repeat(64),status:'reserved',uploader_name:'Fictional Seller',side:'seller',created_at:'2026-11-14T00:00:00Z',object_path:'portal-1/opaque/path'};
function fixture({uploaded=false,failUpload=false,failLink=false,firm=false}={}){
  const calls=[],progress=[];
  const client={
    rpc:async(name,args)=>{
      calls.push([name,args]);
      if(name==='kalling_portal_reserve_file'||name==='kalling_portal_reserve_firm_file')return {data:{file:row,duplicate:false,uploaded},error:null};
      if(name==='kalling_portal_finish_file')return {data:{...row,status:'stored'},error:null};
      if(name==='kalling_portal_link')return failLink?{error:{message:'This request is already complete.'}}:{data:null,error:null};
      throw Error('Unexpected RPC');
    },
    storage:{from:bucket=>({upload:async(path,file,options)=>{calls.push(['upload',{bucket,path,options}]);return {error:failUpload?{message:'Connection interrupted'}:null};}})},
  };
  return {calls,progress,store:cloudPortalStore(client,{side:firm?'firm':'seller',firmId:firm?'firm-1':undefined})};
}
test('a retry finalises arrived bytes without uploading again and attaches to the requested question',async()=>{
  const s=fixture({uploaded:true}),f=new File(['test'],'fictional.txt',{type:'text/plain'});
  await s.store.upload('second-request',f,(...x)=>s.progress.push(x));
  assert.equal(s.calls.some(x=>x[0]==='upload'),false);
  assert.deepEqual(s.calls.at(-1),['kalling_portal_link',{p_request:'second-request',p_file:'file-1'}]);
  assert.deepEqual(s.progress.at(-1),[1,'Saved']);
});
test('interruption and failed attachment never report a saved request',async()=>{
  for(const options of [{failUpload:true},{uploaded:true,failLink:true}]){
    const s=fixture(options),f=new File(['test'],'fictional.txt',{type:'text/plain'});
    await assert.rejects(s.store.upload('second-request',f,(...x)=>s.progress.push(x)),/interrupted|already complete/);
    assert.equal(s.progress.some(x=>x[0]===1),false);
    if(options.failUpload){assert.equal(s.calls.some(x=>x[0]==='kalling_portal_finish_file'),false);assert.equal(s.calls.find(x=>x[0]==='upload')[1].options.upsert,false);}
  }
});
test('a firm PDF retry also skips bytes already received',async()=>{
  const s=fixture({uploaded:true,firm:true});
  await s.store.uploadFirmFile('portal-1',new File(['test'],'Fictional memorandum.pdf',{type:'application/pdf'}));
  assert.equal(s.calls.some(x=>x[0]==='upload'),false);assert.equal(s.calls.at(-1)[0],'kalling_portal_finish_file');
});
