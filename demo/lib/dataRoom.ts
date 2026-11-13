// The data room: documents the owner approved, shown read-only to buyers who signed the NDA.
// Every open is logged before the file is served; the owner sees who opened what, by anonymous label.
import type {BrokerDb,Viewer,Buyer} from './brokerage.ts';
import {anonymousBuyerLabel,askQuestion} from './brokerage.ts';
import {classifyDoc} from './drafting.ts';

const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
function need(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}
const clean=(s:unknown,max:number)=>String(s??'').trim().slice(0,max);

export const folders=['Overview','Financials','Operations','Customers','Team','Legal and licenses','Other'] as const;
export type Folder=typeof folders[number];
export const tiers=['After NDA','After LOI'] as const;
export type Tier=typeof tiers[number];
export type RoomStatus='Draft'|'Proposed'|'Published'|'Unpublished';
export type Room={listingId:string;portalId:string;status:RoomStatus;proposedAt?:string;publishedAt?:string;weeklySummary?:boolean};
export type RoomItem={id:string;listingId:string;portalId:string;fileId:string;fileName:string;mime:string;displayName:string;folder:Folder;tier:Tier;allowDownload:boolean;note:string;ownerStatus:'Pending'|'Approved'|'Removed';ownerNote:string;changedAt:string;approvedAt?:string};
export type ViewEvent={id:string;listingId:string;itemId:string;buyerId:string;event:'opened'|'page'|'downloaded'|'denied';page?:number;seconds?:number;at:string;ticket?:string};
export type Ticket={id:string;buyerId:string;itemId:string;at:string};
export type LoiGrant={listingId:string;buyerId:string;note:string;by:string;at:string};
export type RoomDb={rooms:Room[];roomItems:RoomItem[];views:ViewEvent[];tickets:Ticket[];loiGrants:LoiGrant[]};
export const emptyRoomDb=():RoomDb=>({rooms:[],roomItems:[],views:[],tickets:[],loiGrants:[]});
export type FullDb=BrokerDb&Partial<RoomDb>;
const R=(db:FullDb):RoomDb=>({rooms:db.rooms||[],roomItems:db.roomItems||[],views:db.views||[],tickets:db.tickets||[],loiGrants:db.loiGrants||[]});
export const TICKET_SECONDS=120;
const advisor=(v:Viewer)=>need(v.kind==='advisor'&&v.canWrite,'Only a Kalling advisor can do this.');

// ── Advisor ─────────────────────────────────────────────────────────────────────────────────
export function saveItem(db:FullDb,v:Viewer,i:{id?:string;listingId:string;portalId:string;fileId:string;fileName:string;mime:string;displayName:string;folder:Folder;tier:Tier;allowDownload:boolean;note:string}):{db:FullDb;id:string}{
  advisor(v);const r=R(db);need(db.listings.some(l=>l.id===i.listingId),'Listing not found.');need(folders.includes(i.folder)&&tiers.includes(i.tier),'Choose a folder and when buyers can see it.');
  const name=clean(i.displayName,160);need(name.length>=2,'Name the document as buyers will see it.');
  const old=i.id?r.roomItems.find(x=>x.id===i.id):undefined;need(!i.id||old,'Item not found.');
  need(!r.roomItems.some(x=>x.listingId===i.listingId&&x.fileId===i.fileId&&x.id!==i.id&&x.ownerStatus!=='Removed'),'This document is already in the data room.');
  // Anything that changes what buyers get needs the owner to approve it again.
  const material=!old||old.fileId!==i.fileId||old.tier!==i.tier||old.allowDownload!==i.allowDownload||old.folder!==i.folder;
  const item:RoomItem={id:old?.id||uid(),listingId:i.listingId,portalId:i.portalId,fileId:i.fileId,fileName:clean(i.fileName,200),mime:i.mime,displayName:name,folder:i.folder,tier:i.tier,allowDownload:!!i.allowDownload,note:clean(i.note,400),ownerStatus:material?'Pending':old!.ownerStatus,ownerNote:material?'':old!.ownerNote,changedAt:now(),...(material?{}:{approvedAt:old!.approvedAt})};
  const room=r.rooms.find(x=>x.listingId===i.listingId)||{listingId:i.listingId,portalId:i.portalId,status:'Draft' as RoomStatus};
  return {db:{...db,rooms:[...r.rooms.filter(x=>x.listingId!==i.listingId),room],roomItems:old?r.roomItems.map(x=>x.id===old.id?item:x):[...r.roomItems,item]},id:item.id};
}
export function removeItem(db:FullDb,v:Viewer,id:string):FullDb{advisor(v);const r=R(db);return {...db,roomItems:r.roomItems.filter(x=>x.id!==id)};}
export function setRoomStatus(db:FullDb,v:Viewer,listingId:string,status:'Proposed'|'Published'|'Unpublished'):FullDb{
  advisor(v);const r=R(db),room=r.rooms.find(x=>x.listingId===listingId);need(room,'Add documents to the data room first.');
  const items=r.roomItems.filter(x=>x.listingId===listingId&&x.ownerStatus!=='Removed');
  if(status==='Proposed')need(items.length>0,'Add at least one document.');
  if(status==='Published'){need(items.length>0,'Add at least one document.');need(items.every(x=>x.ownerStatus==='Approved'),'The owner must approve every document before the data room opens.');}
  return {...db,rooms:r.rooms.map(x=>x.listingId===listingId?{...x,status,...(status==='Proposed'?{proposedAt:now()}:status==='Published'?{publishedAt:now()}:{})}:x)};
}
export function grantLoi(db:FullDb,v:Viewer,listingId:string,buyerId:string,note:string):FullDb{
  advisor(v);need(clean(note,400).length>=5,'Add a note saying why this buyer gets after-LOI documents.');const r=R(db);
  return {...db,loiGrants:[...r.loiGrants.filter(g=>!(g.listingId===listingId&&g.buyerId===buyerId)),{listingId,buyerId,note:clean(note,400),by:v.kind==='advisor'?v.name:'',at:now()}]};
}

// ── Owner ───────────────────────────────────────────────────────────────────────────────────
export function ownerDecide(db:FullDb,itemIds:string[],decision:'Approved'|'Removed',note:string,portalIds:string[]):FullDb{
  const r=R(db);for(const id of itemIds){const it=r.roomItems.find(x=>x.id===id);need(it&&portalIds.includes(it.portalId),'This document is not in your data room.');}
  if(decision==='Removed')need(clean(note,400).length>=3,'Say why this should not be shared.');
  return {...db,roomItems:r.roomItems.map(x=>itemIds.includes(x.id)?{...x,ownerStatus:decision,ownerNote:clean(note,400),...(decision==='Approved'?{approvedAt:now()}:{})}:x)};
}
export function setWeeklySummary(db:FullDb,listingId:string,on:boolean,portalIds:string[]):FullDb{const r=R(db);const room=r.rooms.find(x=>x.listingId===listingId);need(room&&portalIds.includes(room.portalId),'Data room not found.');return {...db,rooms:r.rooms.map(x=>x.listingId===listingId?{...x,weeklySummary:on}:x)};}

// ── Buyers ──────────────────────────────────────────────────────────────────────────────────
export const buyerOf=(db:FullDb,v:Viewer)=>v.kind==='buyer'?db.buyers.find(b=>b.email===v.email.toLowerCase()):undefined;
/** What this buyer may open on this listing: nothing, the after-NDA folder, or everything. */
export function buyerTier(db:FullDb,b:Buyer|undefined,listingId:string):0|1|2{
  if(!b||b.status==='Restricted')return 0;const l=db.listings.find(x=>x.id===listingId);if(!l||!['Live','Under LOI'].includes(l.status))return 0;
  const r=R(db),room=r.rooms.find(x=>x.listingId===listingId);if(!room||room.status!=='Published')return 0;
  if(!db.access.some(a=>a.listingId===listingId&&a.buyerId===b.id&&a.status==='Approved'))return 0;
  const loi=db.offers.some(o=>o.listingId===listingId&&o.buyerId===b.id&&o.status==='Accepted')||r.loiGrants.some(g=>g.listingId===listingId&&g.buyerId===b.id);
  return loi?2:1;
}
const visible=(it:RoomItem,tier:number)=>it.ownerStatus==='Approved'&&(it.tier==='After NDA'?tier>=1:tier>=2);
export function buyerItems(db:FullDb,v:Viewer,listingId:string){
  const b=buyerOf(db,v),t=buyerTier(db,b,listingId),r=R(db);
  return {tier:t,items:r.roomItems.filter(x=>x.listingId===listingId&&x.ownerStatus==='Approved').map(x=>({id:x.id,displayName:x.displayName,folder:x.folder,tier:x.tier,mime:x.mime,allowDownload:x.allowDownload,note:x.note,open:visible(x,t)}))};
}
/** Opening writes the log row first, then hands back a short-lived ticket. A denied open is logged too. */
export function openItem(db:FullDb,v:Viewer,itemId:string,kind:'opened'|'downloaded'='opened'):{db:FullDb;ticket?:Ticket;item?:RoomItem;error?:string}{
  const r=R(db),it=r.roomItems.find(x=>x.id===itemId),b=buyerOf(db,v);need(it,'Document not found.');need(b,'Sign in with your buyer profile first.');
  const ok=visible(it,buyerTier(db,b,it.listingId))&&(kind==='opened'||it.allowDownload);
  const ev:ViewEvent={id:uid(),listingId:it.listingId,itemId:it.id,buyerId:b.id,event:ok?kind:'denied',at:now()};
  if(!ok)return {db:{...db,views:[...r.views,ev]},error:kind==='downloaded'&&visible(it,buyerTier(db,b,it.listingId))?'This document can be viewed but not downloaded.':'You do not have access to this document.'};
  const ticket:Ticket={id:uid(),buyerId:b.id,itemId:it.id,at:now()};
  return {db:{...db,views:[...r.views,{...ev,ticket:ticket.id}],tickets:[...r.tickets.filter(t=>Date.parse(t.at)>Date.now()-TICKET_SECONDS*1000*30),ticket]},ticket,item:it};
}
export const ticketValid=(t:Ticket|undefined,at=Date.now())=>!!t&&at-Date.parse(t.at)<TICKET_SECONDS*1000;
/** Page and time events, only for a ticket this buyer holds, and capped per ticket. */
export function logEvents(db:FullDb,v:Viewer,ticketId:string,events:{page:number;seconds:number}[]):FullDb{
  const r=R(db),b=buyerOf(db,v),t=r.tickets.find(x=>x.id===ticketId);need(b&&t&&t.buyerId===b.id,'This viewing session is not yours.');
  const it=r.roomItems.find(x=>x.id===t.itemId)!;const count=r.views.filter(x=>x.ticket===ticketId&&x.event==='page').length;need(count+events.length<=400,'Too many page events for one viewing.');
  return {...db,views:[...r.views,...events.slice(0,50).map(e=>({id:uid(),listingId:it.listingId,itemId:it.id,buyerId:b.id,event:'page' as const,page:Math.max(1,Math.round(e.page)),seconds:Math.min(600,Math.max(0,Math.round(e.seconds))),at:now(),ticket:ticketId}))]};
}

// ── Who opened what ─────────────────────────────────────────────────────────────────────────
export type Engagement={buyerId:string;itemId:string;opens:number;first:string;last:string;seconds:number;pages:number;downloads:number;denied:number};
export function engagement(db:FullDb,listingId:string):Engagement[]{
  const m=new Map<string,Engagement>();
  for(const e of R(db).views.filter(x=>x.listingId===listingId)){const k=e.buyerId+'|'+e.itemId;const g=m.get(k)||{buyerId:e.buyerId,itemId:e.itemId,opens:0,first:e.at,last:e.at,seconds:0,pages:0,downloads:0,denied:0};
    if(e.event==='opened')g.opens++;if(e.event==='downloaded')g.downloads++;if(e.event==='denied')g.denied++;if(e.event==='page'){g.seconds+=e.seconds||0;g.pages=Math.max(g.pages,e.page||0);}
    if(e.at<g.first)g.first=e.at;if(e.at>g.last)g.last=e.at;m.set(k,g);}
  return [...m.values()];
}
export function buyerEngagement(db:FullDb,listingId:string){const by=new Map<string,{buyerId:string;documents:number;seconds:number;last:string}>();
  for(const g of engagement(db,listingId).filter(x=>x.opens>0)){const b=by.get(g.buyerId)||{buyerId:g.buyerId,documents:0,seconds:0,last:g.last};b.documents++;b.seconds+=g.seconds;if(g.last>b.last)b.last=g.last;by.set(g.buyerId,b);}
  return [...by.values()].sort((a,b)=>b.documents-a.documents||b.seconds-a.seconds);}
/** The owner's view: by document, anonymous labels only. */
export function ownerLog(db:FullDb,listingId:string){
  const items=R(db).roomItems.filter(x=>x.listingId===listingId);
  return items.map(it=>({item:it.displayName,entries:engagement(db,listingId).filter(g=>g.itemId===it.id&&(g.opens||g.downloads)).map(g=>{const b=db.buyers.find(x=>x.id===g.buyerId);return {label:b?anonymousBuyerLabel(db,b,listingId):'A buyer',opens:g.opens,last:g.last,downloaded:g.downloads>0};})})).filter(x=>x.entries.length);
}
export function buyerHistory(db:FullDb,v:Viewer){const b=buyerOf(db,v);if(!b)return [];const r=R(db);return r.views.filter(x=>x.buyerId===b.id&&x.event==='opened').map(x=>({at:x.at,document:r.roomItems.find(i=>i.id===x.itemId)?.displayName||'A document',listing:db.listings.find(l=>l.id===x.listingId)?.number||''})).reverse();}
export const watermarkText=(name:string,email:string,at=new Date())=>`${name}, ${email}, ${at.toISOString().slice(0,10)}. Confidential, Kalling data room`;
/** Plain text for the owner's weekly summary, from per-document entries. */
export function summaryText(log:{item:string;entries:{label:string;opens:number;last:string;downloaded:boolean}[]}[],since=Date.now()-7*864e5){
  const recent=log.map(x=>({...x,entries:x.entries.filter(e=>Date.parse(e.last)>=since)})).filter(x=>x.entries.length);
  if(!recent.length)return 'No buyer opened a document in the data room this week.';
  return 'Data room this week:\n'+recent.map(x=>`${x.item}: `+x.entries.map(e=>`${e.label} (${e.opens} open${e.opens===1?'':'s'}${e.downloaded?', downloaded':''})`).join('; ')).join('\n');
}
export const weeklySummary=(db:FullDb,listingId:string,since=Date.now()-7*864e5)=>summaryText(ownerLog(db,listingId),since);
/** A starting folder and tier for an owner document. The advisor can change both. */
export function suggestPlacement(name:string,requests:string[]=[]):{folder:Folder;tier:Tier}{
  const t=(name+' '+requests.join(' ')).toLowerCase();
  if(/memorandum|\bcim\b|teaser/.test(t))return {folder:'Overview',tier:'After NDA'};
  if(/licen[cs]e|insurance|lease|contract|legal|permit|certificate/.test(t))return {folder:'Legal and licenses',tier:'After LOI'};
  if(/fleet|vehicle|equipment|software|vendor|supplier/.test(t))return {folder:'Operations',tier:'After NDA'};
  const k=classifyDoc(name.replace(/[-_]+/g,' '),requests);
  if(k==='pl'||k==='ledger')return {folder:'Financials',tier:'After NDA'};
  if(k==='tax')return {folder:'Financials',tier:'After LOI'};
  if(k==='agreements'||k==='mix')return {folder:'Customers',tier:/customer list|names/.test(t)?'After LOI':'After NDA'};
  if(k==='team')return {folder:'Team',tier:'After LOI'};
  return {folder:'Other',tier:'After NDA'};
}
/** A buyer question about one document, and the page they were reading. */
export function askAbout(db:FullDb,v:Viewer,itemId:string,page:number,body:string):FullDb{
  const r=R(db),it=r.roomItems.find(x=>x.id===itemId),b=buyerOf(db,v);need(it&&b&&visible(it,buyerTier(db,b,it.listingId)),'You do not have access to this document.');
  const next=askQuestion(db,v,it.listingId,body) as FullDb,q=next.questions.at(-1)!;
  return {...next,questions:next.questions.map(x=>x.id===q.id?{...x,itemId,page:Math.max(1,Math.round(page))}:x)};
}
/** A readable name for buyers, from the file name and the request it answered. */
export function suggestName(fileName:string,requests:string[]=[]){
  const base=fileName.replace(/\.[a-z0-9]+$/i,''),year=(base.match(/\b(19|20)\d{2}\b/)||[''])[0],k=classifyDoc(base.replace(/[-_]+/g,' '),requests);
  if(k==='pl')return `Profit and loss statement${year?', '+year:''}`;
  if(k==='tax')return `Business tax returns${year?', '+year:''}`;
  const words=base.replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
  return words.charAt(0).toUpperCase()+words.slice(1);
}
