// The advisor's approval queue. Every waiting item across all deals in one list, ordered by
// what most blocks a sale from closing, then by how long it has waited.
export const needOrder=['Diligence review','Engagement letter','Offer','Financing evidence','Seller inquiry','Seller documents','NDA request','Buyer question','Memorandum','Changed inputs','AI draft','Comparable sales','Sale-ready update','Lender request','Listing alert','Follow-up'] as const;
export type NeedKind=typeof needOrder[number];
export type QueueItem={id:string;date:string;kind:string;text:string;action:string;deal?:string};

const rank=(kind:string)=>{const i=(needOrder as readonly string[]).indexOf(kind);return i<0?needOrder.length:i;};

/** Days an item has waited, or null when it has no date. */
export function waitingDays(date:string,today=new Date()):number|null{
  const t=Date.parse(date);if(!Number.isFinite(t))return null;
  return Math.max(0,Math.floor((today.getTime()-t)/864e5));
}

/** Most closing-critical kind first; within a kind, the longest wait first; undated items last. */
export function orderNeeds<T extends QueueItem>(items:T[]):T[]{
  return [...items].sort((a,b)=>rank(a.kind)-rank(b.kind)||(a.date&&b.date?a.date.localeCompare(b.date):a.date?-1:b.date?1:0)||a.id.localeCompare(b.id));
}

/** A sale-ready item when the owner has joined and the page is missing, stale or older than a month. */
export function saleReadyNeed(o:{ownerName:string;businessName:string;portalActive:boolean;recastUpdatedAt?:string;lastSharedAt?:string},today=new Date()):{text:string;date:string}|null{
  if(!o.portalActive||!o.recastUpdatedAt)return null;
  const first=o.ownerName.split(' ')[0]||o.ownerName;
  if(!o.lastSharedAt)return {text:`Share a first sale-ready page with ${first} for ${o.businessName}`,date:o.recastUpdatedAt};
  if(o.recastUpdatedAt>o.lastSharedAt)return {text:`The recast for ${o.businessName} changed since ${first}'s last sale-ready page`,date:o.recastUpdatedAt};
  const age=waitingDays(o.lastSharedAt,today);
  if(age!==null&&age>=30)return {text:`Monthly sale-ready update for ${first} is due`,date:new Date(Date.parse(o.lastSharedAt)+30*864e5).toISOString()};
  return null;
}
