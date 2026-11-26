import assert from 'node:assert/strict';
import test from 'node:test';
import {LOCAL_BROKER_KEY} from '../lib/brokerStore.ts';
import {emptyBrokerDb} from '../lib/brokerage.ts';
import {buyerItems,emptyRoomDb,ownerDecide,saveItem,setRoomStatus} from '../lib/dataRoom.ts';
import {cloudDataRoomStore,localDataRoomStore} from '../lib/dataRoomStore.ts';

const advisor={kind:'advisor',name:'Casey Advisor',canWrite:true};
const nda={kind:'buyer',email:'nda@buyer.test'};
const loi={kind:'buyer',email:'loi@buyer.test'};
const declined={kind:'buyer',email:'declined@buyer.test'};
const publicViewer={kind:'public'};
const source={fileId:'signed-loi',page:1,excerpt:'Both fictional parties signed.'};

function fixture(){
  const viewers=[nda,loi,declined];
  let db={
    ...emptyBrokerDb(),...emptyRoomDb(),
    listings:[{id:'listing',number:'KL-1001',status:'Live'}],
    buyers:viewers.map((viewer,index)=>({id:`buyer-${index}`,email:viewer.email,status:'Active'})),
    access:viewers.map((_,index)=>({listingId:'listing',buyerId:`buyer-${index}`,status:index===2?'Declined':'Approved'})),
    executionFiles:[{id:'signed-loi',transactionId:'tx',family:'loi',version:1,status:'Stored'}],
    transactions:[{id:'tx',listingId:'listing',buyerId:'buyer-1',state:'LOI reviewed',
      lois:[{fileId:'signed-loi',review:{source},signatories:[{side:'buyer',source},{side:'seller',source}]}]}],
  };
  function add(fileId,displayName,tier){
    const result=saveItem(db,advisor,{listingId:'listing',portalId:'portal',fileId,fileName:`${fileId}.csv`,mime:'text/csv',
      displayName,folder:'Customers',tier,allowDownload:false,note:''});
    db=result.db;
    return result.id;
  }
  const ndaItem=add('nda-file','Service summary','After NDA');
  const loiItem=add('loi-file','Detailed renewals','After LOI');
  db=ownerDecide(db,[ndaItem,loiItem],'Approved','',['portal']);
  db=setRoomStatus(db,advisor,'listing','Published');
  const pending=add('pending-file','Additional renewals','After NDA');

  const state=new Map([[LOCAL_BROKER_KEY,JSON.stringify(db)]]);
  const kv={getItem:key=>state.get(key)??null,setItem:(key,value)=>state.set(key,value)};
  const read=()=>JSON.parse(state.get(LOCAL_BROKER_KEY));
  const set=next=>state.set(LOCAL_BROKER_KEY,JSON.stringify(next));
  const bodies=new Map([
    ['nda-file','Maintenance plans renew in spring.'],
    ['loi-file','Service contracts renew in spring and contain a private schedule.'],
    ['pending-file','Maintenance agreements renew in spring before inspections.'],
  ]);
  const reads=[];
  const bytes={async get(id){reads.push(id);return new Blob([bodies.get(id)],{type:'text/csv'});}};
  const store=(viewer,byteStore=bytes)=>localDataRoomStore(viewer,{kv,bytes:byteStore});
  return {read,set,store,reads,ndaItem,loiItem,pending,bodies};
}

test('only open items reach buyer search at each tier, and the advisor can also search pending items',async()=>{
  const f=fixture(),query='Which maintenance agreements renew in spring?';
  assert.equal(buyerItems(f.read(),nda,'listing').tier,1);
  assert.equal(buyerItems(f.read(),loi,'listing').tier,2);
  let results=await f.store(nda).search('listing',query);
  assert.deepEqual(results.map(r=>r.itemId),[f.ndaItem]);
  assert.deepEqual(f.reads.splice(0),['nda-file']);
  assert.equal(results[0].page,1);
  assert.ok(f.bodies.get('nda-file').includes(results[0].quote));

  results=await f.store(loi).search('listing',query);
  assert.deepEqual(new Set(results.map(r=>r.itemId)),new Set([f.ndaItem,f.loiItem]));
  assert.deepEqual(f.reads.splice(0),['nda-file','loi-file']);

  await assert.rejects(f.store(declined).search('listing',query),/do not have access/);
  await assert.rejects(f.store(publicViewer).search('listing',query),/do not have access/);
  assert.deepEqual(f.reads,[]);
  results=await f.store(advisor).search('listing',query);
  assert.deepEqual(new Set(results.map(r=>r.itemId)),new Set([f.ndaItem,f.loiItem,f.pending]));
  assert.equal(f.read().roomSearches.length,2);
});

test('revoking approval during a byte read withholds results and does not overwrite the revocation',async()=>{
  const f=fixture();
  const store=f.store(nda,{async get(id){
    const db=f.read();
    db.access.find(entry=>entry.buyerId==='buyer-0').status='Declined';
    f.set(db);
    return new Blob([f.bodies.get(id)]);
  }});
  const before=await store.buyerRoom('listing');
  await assert.rejects(store.search('listing','Which plans renew in spring?'),/do not have access/);
  assert.equal(f.read().access[0].status,'Declined');
  assert.deepEqual(f.read().roomSearches,[]);
  assert.notEqual(before.revision,(await store.buyerRoom('listing')).revision);
});

test('replacing an item during a byte read withholds the old file and preserves the replacement',async()=>{
  const f=fixture();
  const store=f.store(nda,{async get(id){
    const db=f.read();
    db.roomItems.find(item=>item.id===f.ndaItem).fileId='replacement';
    f.set(db);
    return new Blob([f.bodies.get(id)]);
  }});
  assert.deepEqual(await store.search('listing','Which plans renew in spring?'),[]);
  assert.equal(f.read().roomItems.find(item=>item.id===f.ndaItem).fileId,'replacement');
  assert.equal(f.read().roomSearches.length,1);
});

test('the advisor can see search text and the owner sees only a weekly count',async()=>{
  const f=fixture();
  const olderQuestion='Search from a previous week';
  const question='Where are the penguins?';
  const db=f.read();
  db.roomSearches.push({listingId:'listing',buyerId:'buyer-0',question:olderQuestion,at:'2000-01-01T00:00:00Z'});
  f.set(db);
  assert.deepEqual(await f.store(nda).search('listing',question),[]);
  assert.deepEqual(await f.store(nda).history(),[],'a question is not a document open');
  assert.equal(f.read().questions.length,0,'only an explicit handoff sends a question');

  const advisorRoom=await f.store(advisor).room('listing');
  assert.deepEqual(advisorRoom.searches.map(event=>event.question),[question,olderQuestion]);
  assert.equal(advisorRoom.searchQuestionCount,1);
  await assert.rejects(f.store(publicViewer).room('listing'),/Only a Kalling advisor/);
  const [ownerRoom]=await f.store(publicViewer).ownerRooms(['portal']);
  assert.equal(ownerRoom.summary,'Data room this week:\n1 question asked');
  assert.doesNotMatch(JSON.stringify(ownerRoom),/penguins|previous week|buyer-0/);
});

test('hosted stores map exact passages and keep advisor activity on its own RPC',async()=>{
  const result={item_id:'file',display_name:'Fictional schedule',page:2,quote:'Ten fictional service contracts renew in March.',score:0.5};
  const activity={searches:[{question:'When do contracts renew?',at:'2026-11-25T15:00:00Z'}],search_question_count:2};
  const calls=[];
  const client={rpc:async(name,args)=>{
    calls.push([name,args]);
    switch(name){
      case 'kalling_dataroom_search':
      case 'kalling_dataroom_search_advisor':return {data:[result],error:null};
      case 'kalling_dataroom_advisor':return {data:{room:{listing_id:'listing'},items:[],events:[],buyers:[],loi:[]},error:null};
      case 'kalling_dataroom_search_activity':return {data:activity,error:null};
      default:throw Error(`Unexpected RPC ${name}`);
    }
  }};
  const expected=[{itemId:result.item_id,displayName:result.display_name,page:result.page,quote:result.quote,score:result.score}];
  const args={p_listing:'listing',p_question:'When do contracts renew?'};
  assert.deepEqual(await cloudDataRoomStore(client).search('listing',args.p_question),expected);
  const advisorStore=cloudDataRoomStore(client,'advisor');
  assert.deepEqual(await advisorStore.search('listing',args.p_question),expected);
  const room=await advisorStore.room('listing');
  assert.deepEqual(room.searches,activity.searches);
  assert.equal(room.searchQuestionCount,2);
  assert.deepEqual(calls,[
    ['kalling_dataroom_search',args],['kalling_dataroom_search_advisor',args],
    ['kalling_dataroom_advisor',{p_listing:'listing'}],['kalling_dataroom_search_activity',{p_listing:'listing'}],
  ]);
});

test('existing hosted rooms load while the search migration is waiting to be applied',async()=>{
  const store=cloudDataRoomStore({rpc:async name=>name==='kalling_dataroom_advisor'
    ? {data:{room:{listing_id:'listing'},items:[],events:[],buyers:[],loi:[]},error:null}
    : {data:null,error:{code:'PGRST202',message:'Function not found'}}},'advisor');
  const room=await store.room('listing');
  assert.deepEqual(room.searches,[]);
  await assert.rejects(store.search('listing','When do contracts renew?'),/Data room search is not available yet/);
});
