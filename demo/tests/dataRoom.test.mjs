import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../lib/dataRoom.ts';
import {emptyBrokerDb} from '../lib/brokerage.ts';
import {localDataRoomStore,cloudDataRoomStore} from '../lib/dataRoomStore.ts';
import {memoryBytes} from '../lib/portalStore.ts';
import {LOCAL_BROKER_KEY} from '../lib/brokerStore.ts';

const adv={kind:'advisor',name:'Dana Advisor',canWrite:true};
const alex={kind:'buyer',email:'alex@example.com'},sam={kind:'buyer',email:'sam@example.com'};
const buyer=(id,email,name,type='Owner-operator')=>({id,email,name,phone:'',type,company:'',funds:'',financing:[],experience:'',regions:[],maxPrice:0,status:'Active',advisorNote:'',saved:[],alerts:false,createdAt:'2026-11-01T00:00:00Z'});
function base(){
  return {...emptyBrokerDb(),...D.emptyRoomDb(),
    listings:[{id:'L1',number:'KL-1101',status:'Live',headline:'Residential HVAC service company'}],
    buyers:[buyer('b1','alex@example.com','Alex Morgan'),buyer('b2','sam@example.com','Sam Lee','Search fund')],
    access:[{id:'a1',listingId:'L1',buyerId:'b1',status:'Approved'},{id:'a2',listingId:'L1',buyerId:'b2',status:'Pending'}]};
}
const item=(o={})=>({listingId:'L1',portalId:'P1',fileId:'f1',fileName:'memo.pdf',mime:'application/pdf',displayName:'Confidential memorandum',folder:'Overview',tier:'After NDA',allowDownload:false,note:'',...o});
function published(){
  let db=base();let r=D.saveItem(db,adv,item());db=r.db;const cim=r.id;
  r=D.saveItem(db,adv,item({fileId:'f2',fileName:'leases.pdf',displayName:'Facility lease',folder:'Legal and licenses',tier:'After LOI'}));db=r.db;const lease=r.id;
  db=D.setRoomStatus(db,adv,'L1','Proposed');db=D.ownerDecide(db,[cim,lease],'Approved','',['P1']);db=D.setRoomStatus(db,adv,'L1','Published');
  return {db,cim,lease};
}

test('the data room opens only after the owner approves every document',()=>{
  let db=base();const {db:d1,id}=D.saveItem(db,adv,item());db=d1;
  assert.throws(()=>D.setRoomStatus(db,adv,'L1','Published'),/owner must approve/);
  assert.throws(()=>D.ownerDecide(db,[id],'Approved','',['someone-else']),/not in your data room/);
  assert.throws(()=>D.ownerDecide(db,[id],'Removed','',['P1']),/Say why/);
  db=D.ownerDecide(db,[id],'Approved','',['P1']);db=D.setRoomStatus(db,adv,'L1','Published');
  assert.equal(db.rooms[0].status,'Published');
  assert.throws(()=>D.saveItem(db,adv,item()),/already in the data room/);
});
test('a material change sends the document back to the owner; a note change does not',()=>{
  const {db,cim}=published();
  const same=D.saveItem(db,adv,{...item(),id:cim,note:'Read this first'}).db;assert.equal(same.roomItems.find(x=>x.id===cim).ownerStatus,'Approved');
  const changed=D.saveItem(db,adv,{...item(),id:cim,allowDownload:true}).db;assert.equal(changed.roomItems.find(x=>x.id===cim).ownerStatus,'Pending');
  assert.equal(D.buyerItems(changed,alex,'L1').items.some(x=>x.id===cim),false,'pending items are hidden from buyers');
});
test('buyers see after-NDA documents; after-LOI documents need reviewed current execution evidence',()=>{
  let {db,cim,lease}=published();
  const v=D.buyerItems(db,alex,'L1');assert.equal(v.tier,1);assert.deepEqual(v.items.map(x=>[x.id,x.open]),[[cim,true],[lease,false]]);
  assert.equal(D.buyerItems(db,sam,'L1').tier,0,'pending NDA sees nothing open');
  let out=D.openItem(db,alex,lease);assert.match(out.error,/do not have access/);assert.equal(out.db.views.at(-1).event,'denied');
  assert.throws(()=>D.grantLoi(db,adv,'L1','b1','ok'),/Add a note/);
  db=D.grantLoi(db,adv,'L1','b1','Signed LOI received by email on Nov 10.');
  assert.match(D.openItem(db,alex,lease).error,/do not have access/,'a legacy grant cannot substitute for signed evidence');
  const source={fileId:'execution-loi',page:1,excerpt:'Both fictional parties signed this LOI.'};db={...db,executionFiles:[{id:'execution-loi',transactionId:'T1',family:'loi',version:1,status:'Stored'}],transactions:[{id:'T1',listingId:'L1',buyerId:'b1',state:'LOI reviewed',lois:[{fileId:'execution-loi',review:{source},signatories:[{side:'buyer',source},{side:'seller',source}]}]}]};
  out=D.openItem(db,alex,lease);assert.ok(out.ticket);assert.equal(out.db.views.at(-1).event,'opened');
});
test('every open is logged before a ticket is issued, and tickets expire after two minutes',()=>{
  const {db,cim}=published();const out=D.openItem(db,alex,cim);
  const ev=out.db.views.at(-1);assert.equal(ev.ticket,out.ticket.id);assert.equal(ev.event,'opened');assert.equal(ev.buyerId,'b1');
  assert.ok(D.ticketValid(out.ticket));assert.equal(D.ticketValid(out.ticket,Date.parse(out.ticket.at)+121000),false);
  const dl=D.openItem(out.db,alex,cim,'downloaded');assert.match(dl.error,/viewed but not downloaded/);
});
test('page events need the buyer’s own ticket and are capped',()=>{
  const {db,cim}=published();const out=D.openItem(db,alex,cim);
  const db2=D.logEvents(out.db,alex,out.ticket.id,[{page:1,seconds:30},{page:2,seconds:9999}]);
  assert.deepEqual(db2.views.filter(x=>x.event==='page').map(x=>[x.page,x.seconds]),[[1,30],[2,600]]);
  assert.throws(()=>D.logEvents(db2,sam,out.ticket.id,[{page:1,seconds:1}]),/not yours/);
  let full=db2;for(let i=0;i<8;i++)full=D.logEvents(full,alex,out.ticket.id,Array(49).fill({page:1,seconds:1}));
  assert.throws(()=>D.logEvents(full,alex,out.ticket.id,Array(20).fill({page:1,seconds:1})),/Too many/);
});
test('restricting a buyer or unpublishing ends access at once',()=>{
  const {db,cim}=published();
  const restricted={...db,buyers:db.buyers.map(b=>b.id==='b1'?{...b,status:'Restricted'}:b)};
  assert.match(D.openItem(restricted,alex,cim).error,/do not have access/);
  const off=D.setRoomStatus(db,adv,'L1','Unpublished');assert.equal(D.buyerItems(off,alex,'L1').tier,0);
  const removed=D.ownerDecide(db,[cim],'Removed','Has customer names',['P1']);assert.match(D.openItem(removed,alex,cim).error,/do not have access/);
});
test('the owner sees who opened what by anonymous label only, and a weekly summary',()=>{
  const {db,cim}=published();const out=D.openItem(db,alex,cim);
  const log=D.ownerLog(out.db,'L1');assert.equal(log.length,1);assert.equal(log[0].item,'Confidential memorandum');
  assert.equal(log[0].entries[0].label,'Buyer 1, owner-operator');assert.doesNotMatch(JSON.stringify(log),/Alex|alex@/);
  assert.match(D.weeklySummary(out.db,'L1'),/Confidential memorandum: Buyer 1, owner-operator \(1 open\)/);
  assert.equal(D.weeklySummary(db,'L1'),'No buyer opened a document in the data room this week.');
  assert.equal(D.buyerEngagement(out.db,'L1')[0].buyerId,'b1');
  assert.equal(D.buyerHistory(out.db,alex)[0].document,'Confidential memorandum');
  assert.match(D.watermarkText('Alex Morgan','alex@example.com',new Date('2026-11-12T10:00:00Z')),/^Alex Morgan, alex@example.com, 2026-11-12\. Confidential, Kalling data room$/);
});
test('the local store returns bytes only after logging, with a watermark for the buyer',async()=>{
  const {db,cim,lease}=published();const kv=new Map([[LOCAL_BROKER_KEY,JSON.stringify(db)]]);const KV={getItem:k=>kv.get(k)??null,setItem:(k,v)=>kv.set(k,v)};
  const bytes=memoryBytes();await bytes.put('f1',new Blob(['%PDF-1.4 sample'],{type:'application/pdf'}));
  const s=localDataRoomStore(alex,{kv:KV,bytes});const o=await s.open(cim);
  assert.equal(await o.blob.text(),'%PDF-1.4 sample');assert.match(o.watermark,/Alex Morgan, alex@example.com/);
  await assert.rejects(()=>s.open(lease),/do not have access/);
  const saved=JSON.parse(kv.get(LOCAL_BROKER_KEY));assert.deepEqual(saved.views.map(v=>v.event),['opened','denied']);
  const a=localDataRoomStore(adv,{kv:KV,bytes});const r=await a.room('L1');assert.equal(r.buyers[0].name,'Alex Morgan');assert.equal(r.buyers[0].label,'Buyer 1, owner-operator');
  const owner=localDataRoomStore({kind:'public'},{kv:KV,bytes});const rooms=await owner.ownerRooms(['P1']);assert.equal(rooms[0].log[0].entries[0].label,'Buyer 1, owner-operator');
  assert.deepEqual(await owner.ownerRooms(['P2']),[]);
});
test('documents get a starting folder, tier and readable name',()=>{
  assert.deepEqual(D.suggestPlacement('tax-returns.pdf',['Business tax returns for 2023, 2024 and 2025']),{folder:'Financials',tier:'After LOI'});
  assert.deepEqual(D.suggestPlacement('pl-2025.pdf'),{folder:'Financials',tier:'After NDA'});
  assert.equal(D.suggestPlacement('team.xlsx',['Team overview']).folder,'Team');
  assert.equal(D.suggestName('pl-2025.pdf'),'Profit and loss statement, 2025');
  assert.equal(D.suggestName('tax-returns.pdf'),'Business tax returns');
  assert.equal(D.suggestName('agreements.csv'),'Agreements');
});

test('local tickets require current permission, the same file, and a successful log',()=>{
  const {db,cim}=published(),out=D.openItem(db,alex,cim),id=out.ticket.id;
  assert.equal(D.ticketAccess(out.db,alex,id),true);assert.equal(D.ticketAccess(out.db,sam,id),false);
  assert.equal(D.ticketAccess({...out.db,views:[]},alex,id),false);
  assert.equal(D.ticketAccess({...out.db,roomItems:out.db.roomItems.map(i=>i.id===cim?{...i,fileId:'replacement'}:i)},alex,id),false);
  assert.equal(D.ticketAccess(D.ownerDecide(out.db,[cim],'Removed','Do not share',['P1']),alex,id),false);
  assert.equal(D.ticketAccess(D.setRoomStatus(out.db,adv,'L1','Unpublished'),alex,id),false);
  assert.equal(D.ticketAccess({...out.db,access:[]},alex,id),false);
});
test('the local store refuses bytes if approval changes while a file is being read',async()=>{
  const {db,cim}=published(),kv=new Map([[LOCAL_BROKER_KEY,JSON.stringify(db)]]);
  const KV={getItem:k=>kv.get(k)??null,setItem:(k,v)=>kv.set(k,v)};
  const bytes={async get(){const current=JSON.parse(kv.get(LOCAL_BROKER_KEY));current.buyers[0].status='Restricted';kv.set(LOCAL_BROKER_KEY,JSON.stringify(current));return new Blob(['private']);}};
  await assert.rejects(()=>localDataRoomStore(alex,{kv:KV,bytes}).open(cim),/Access changed/);
});
test('the cloud store logs first and uses authenticated storage downloads, never signed links',async()=>{
  const order=[],blob=new Blob(['private']);
  const client={async rpc(name,args){order.push([name,args]);return {data:{ticket:'t1',path:'P1/f1',name:'Memorandum',file_name:'memo.pdf',mime:'application/pdf',allow_download:false,watermark:'Alex'},error:null};},
    storage:{from(bucket){assert.equal(bucket,'kalling-portal');return {async download(path){order.push(['download',path]);return {data:blob,error:null};},createSignedUrl(){assert.fail('signed links must not be issued');}};}}};
  const result=await cloudDataRoomStore(client).open('i1');assert.equal(result.blob,blob);
  assert.deepEqual(order,[['kalling_dataroom_open',{p_item:'i1'}],['download','P1/f1']]);
  order.length=0;await cloudDataRoomStore(client).open('i1','downloaded');assert.equal(order[0][0],'kalling_dataroom_download');
  client.storage.from=()=>({async download(){return {data:null,error:{message:'Forbidden'}};}});
  await assert.rejects(()=>cloudDataRoomStore(client).open('i1'),/Access may have changed/);
  client.rpc=async()=>({data:{error:'You do not have access to this document.'},error:null});
  client.storage.from=()=>assert.fail('a denied open must not request storage');
  await assert.rejects(()=>cloudDataRoomStore(client).open('i1'),/do not have access/);
});
