// Data room storage: a one-browser demo store and the Supabase store share this interface.
// Opening a document always writes the log row first; the file bytes come back only with a ticket.
import * as D from './dataRoom.ts';
import * as B from './brokerage.ts';
import {LOCAL_BROKER_KEY} from './brokerStore.ts';
import {sampleListings} from './brokerageSamples.ts';
import {indexedBytes,type ByteStore} from './portalStore.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Viewer} from './brokerage.ts';

export type ItemInput=Parameters<typeof D.saveItem>[2];
export type AdvisorRoom={room?:D.Room;items:D.RoomItem[];engagement:D.Engagement[];buyers:{buyerId:string;name:string;label:string;documents:number;seconds:number;last:string}[];loi:D.LoiGrant[]};
export type OwnerRoom={listingId:string;listingNumber:string;room:D.Room;items:D.RoomItem[];log:ReturnType<typeof D.ownerLog>;summary:string};
export type BuyerRoom=ReturnType<typeof D.buyerItems>;
export type Opened={ticket:string;blob:Blob;item:Pick<D.RoomItem,'id'|'displayName'|'mime'|'allowDownload'|'fileName'>;watermark:string};
export interface DataRoomStore{
  mode:'local'|'cloud';
  room(listingId:string):Promise<AdvisorRoom>;
  saveItem(i:ItemInput):Promise<string>;
  removeItem(id:string):Promise<void>;
  setStatus(listingId:string,status:'Proposed'|'Published'|'Unpublished'):Promise<void>;
  grantLoi(listingId:string,buyerId:string,note:string):Promise<void>;
  ownerRooms(portalIds:string[]):Promise<OwnerRoom[]>;
  ownerDecide(itemIds:string[],decision:'Approved'|'Removed',note:string,portalIds:string[]):Promise<void>;
  setWeeklySummary(listingId:string,on:boolean,portalIds:string[]):Promise<void>;
  buyerRoom(listingId:string):Promise<BuyerRoom>;
  open(itemId:string,kind?:'opened'|'downloaded'):Promise<Opened>;
  logPages(ticket:string,events:{page:number;seconds:number}[]):Promise<void>;
  history():Promise<ReturnType<typeof D.buyerHistory>>;
  ask(itemId:string,page:number,body:string):Promise<void>;
}

type KV={getItem(k:string):string|null;setItem(k:string,v:string):void};
export function localDataRoomStore(viewer:Viewer,o:{kv?:KV;bytes?:ByteStore}={}):DataRoomStore{
  const kv=o.kv||localStorage;let bytes=o.bytes;const files=()=>bytes||(bytes=indexedBytes());
  const read=():D.FullDb=>{try{const v=JSON.parse(kv.getItem(LOCAL_BROKER_KEY)||'null');if(v&&Array.isArray(v.listings))return {...B.emptyBrokerDb(),...D.emptyRoomDb(),...v};}catch{/* reset */}return {...B.emptyBrokerDb(),...D.emptyRoomDb(),listings:sampleListings};};
  const write=(db:D.FullDb)=>kv.setItem(LOCAL_BROKER_KEY,JSON.stringify(db));
  const apply=async(fn:(db:D.FullDb)=>D.FullDb)=>{write(fn(read()));};
  return {
    mode:'local',
    async room(listingId){if(viewer.kind!=='advisor')throw Error('Only a Kalling advisor can do this.');const db=read();
      return {room:(db.rooms||[]).find(r=>r.listingId===listingId),items:(db.roomItems||[]).filter(i=>i.listingId===listingId),engagement:D.engagement(db,listingId),loi:(db.loiGrants||[]).filter(g=>g.listingId===listingId),
        buyers:D.buyerEngagement(db,listingId).map(e=>{const b=db.buyers.find(x=>x.id===e.buyerId);return {...e,name:b?.name||'A buyer',label:b?B.anonymousBuyerLabel(db,b,listingId):'A buyer'};})};},
    async saveItem(i){const out=D.saveItem(read(),viewer,i);write(out.db);return out.id;},
    async removeItem(id){await apply(db=>D.removeItem(db,viewer,id));},
    async setStatus(l,s){await apply(db=>D.setRoomStatus(db,viewer,l,s));},
    async grantLoi(l,b,n){await apply(db=>D.grantLoi(db,viewer,l,b,n));},
    async ownerRooms(portalIds){const db=read();return (db.rooms||[]).filter(r=>portalIds.includes(r.portalId)&&r.status!=='Draft').map(r=>({listingId:r.listingId,listingNumber:db.listings.find(l=>l.id===r.listingId)?.number||'',room:r,items:(db.roomItems||[]).filter(i=>i.listingId===r.listingId),log:D.ownerLog(db,r.listingId),summary:D.weeklySummary(db,r.listingId)}));},
    async ownerDecide(ids,d,n,p){await apply(db=>D.ownerDecide(db,ids,d,n,p));},
    async setWeeklySummary(l,on,p){await apply(db=>D.setWeeklySummary(db,l,on,p));},
    async buyerRoom(listingId){return D.buyerItems(read(),viewer,listingId);},
    async open(itemId,kind='opened'){
      const out=D.openItem(read(),viewer,itemId,kind);write(out.db);if(out.error||!out.ticket||!out.item)throw Error(out.error||'You do not have access to this document.');
      // The ticket is checked again before the bytes are read, as the storage policy does in the cloud.
      if(!D.ticketAccess(read(),viewer,out.ticket.id))throw Error('Access changed or this viewing session expired. Open the document again.');
      const blob=await files().get(out.item.fileId);if(!blob)throw Error('This document’s contents are stored in a different browser.');
      if(!D.ticketAccess(read(),viewer,out.ticket.id))throw Error('Access changed or this viewing session expired. Open the document again.');
      const b=D.buyerOf(read(),viewer)!;return {ticket:out.ticket.id,blob,item:out.item,watermark:D.watermarkText(b.name,b.email)};
    },
    async logPages(t,ev){await apply(db=>D.logEvents(db,viewer,t,ev));},
    async history(){return D.buyerHistory(read(),viewer);},
    async ask(i,pg,body){await apply(db=>D.askAbout(db,viewer,i,pg,body));},
  };
}

type ItemRow={id:string;listing_id:string;portal_id:string;file_id:string;file_name:string;mime:string;display_name:string;folder:D.Folder;tier:D.Tier;allow_download:boolean;note:string;owner_status:D.RoomItem['ownerStatus'];owner_note:string;changed_at:string;approved_at:string|null};
const item=(r:ItemRow):D.RoomItem=>({id:r.id,listingId:r.listing_id,portalId:r.portal_id,fileId:r.file_id,fileName:r.file_name,mime:r.mime,displayName:r.display_name,folder:r.folder,tier:r.tier,allowDownload:r.allow_download,note:r.note,ownerStatus:r.owner_status,ownerNote:r.owner_note,changedAt:r.changed_at,approvedAt:r.approved_at||undefined});
type RoomRow={listing_id:string;portal_id:string;status:D.RoomStatus;proposed_at:string|null;published_at:string|null;weekly_summary:boolean};
const room=(r:RoomRow):D.Room=>({listingId:r.listing_id,portalId:r.portal_id,status:r.status,proposedAt:r.proposed_at||undefined,publishedAt:r.published_at||undefined,weeklySummary:r.weekly_summary});
/** Supabase data room. Row-level security and the RPCs in migration 009 enforce every rule above. */
export function cloudDataRoomStore(client:SupabaseClient):DataRoomStore{
  async function call<T=unknown>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data as T;}
  async function rows<T>(q:PromiseLike<{data:unknown;error:{message:string}|null}>):Promise<T[]>{const {data,error}=await q;if(error)throw Error(error.message);return (data||[]) as T[];}
  return {
    mode:'cloud',
    async room(listingId){const r=await call<{room:RoomRow|null;items:ItemRow[];events:{buyer_id:string;item_id:string;event:D.ViewEvent['event'];page:number|null;seconds:number|null;at:string}[];buyers:{id:string;name:string;label:string}[];loi:{buyer_id:string;note:string;by_name:string;at:string}[]}>('kalling_dataroom_advisor',{p_listing:listingId});
      const db={...B.emptyBrokerDb(),...D.emptyRoomDb(),views:r.events.map((e,i)=>({id:String(i),listingId,itemId:e.item_id,buyerId:e.buyer_id,event:e.event,page:e.page??undefined,seconds:e.seconds??undefined,at:e.at}))};
      return {room:r.room?room(r.room):undefined,items:r.items.map(item),engagement:D.engagement(db,listingId),loi:r.loi.map(g=>({listingId,buyerId:g.buyer_id,note:g.note,by:g.by_name,at:g.at})),
        buyers:D.buyerEngagement(db,listingId).map(e=>{const b=r.buyers.find(x=>x.id===e.buyerId);return {...e,name:b?.name||'A buyer',label:b?.label||'A buyer'};})};},
    async saveItem(i){return String(await call('kalling_dataroom_save_item',{p:i}));},
    async removeItem(id){await call('kalling_dataroom_remove_item',{p_item:id});},
    async setStatus(l,s){await call('kalling_dataroom_set_status',{p_listing:l,p_status:s});},
    async grantLoi(l,b,n){await call('kalling_dataroom_grant_loi',{p_listing:l,p_buyer:b,p_note:n});},
    async ownerRooms(){const r=await call<{listing_id:string;number:string;room:RoomRow;items:ItemRow[];log:OwnerRoom['log'];summary:string}[]>('kalling_dataroom_owner',{});return r.map(x=>({listingId:x.listing_id,listingNumber:x.number,room:room(x.room),items:x.items.map(item),log:x.log,summary:x.summary}));},
    async ownerDecide(ids,d,n){await call('kalling_dataroom_owner_decide',{p_items:ids,p_decision:d,p_note:n});},
    async setWeeklySummary(l,on){await call('kalling_dataroom_weekly',{p_listing:l,p_on:on});},
    async buyerRoom(listingId){const r=await call<{tier:0|1|2;items:{id:string;display_name:string;folder:D.Folder;tier:D.Tier;mime:string;allow_download:boolean;note:string;open:boolean}[]}>('kalling_dataroom_buyer',{p_listing:listingId});return {tier:r.tier,items:r.items.map(x=>({id:x.id,displayName:x.display_name,folder:x.folder,tier:x.tier,mime:x.mime,allowDownload:x.allow_download,note:x.note,open:x.open}))};},
    async open(itemId,kind='opened'){
      // Log first, then use an authenticated request so storage rechecks current access.
      // Signed URLs outlive an approval change and must not be used for buyer documents.
      const r=await call<{ticket:string;path:string;name:string;file_name:string;mime:string;allow_download:boolean;watermark:string;error?:string}>(kind==='downloaded'?'kalling_dataroom_download':'kalling_dataroom_open',{p_item:itemId});
      if(r.error)throw Error(r.error);
      if(!r.ticket||!r.path)throw Error('Could not open the document.');
      const {data,error}=await client.storage.from('kalling-portal').download(r.path);
      if(error||!data)throw Error('Could not open the document. Access may have changed; refresh the data room and try again.');
      return {ticket:r.ticket,blob:data,item:{id:itemId,displayName:r.name,mime:r.mime,allowDownload:r.allow_download,fileName:r.file_name},watermark:r.watermark};
    },
    async logPages(t,ev){await call('kalling_dataroom_events',{p_ticket:t,p_events:ev});},
    async ask(i,pg,body){await call('kalling_dataroom_ask',{p_item:i,p_page:pg,p_body:body});},
    async history(){return (await rows<{at:string;document:string;listing:string}>(client.rpc('kalling_dataroom_history',{}) as unknown as PromiseLike<{data:unknown;error:{message:string}|null}>));},
  };
}
