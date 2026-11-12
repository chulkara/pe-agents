// Drafts, the memorandum and comparable sales for each company, stored with the workspace.
import type {Company,Workspace} from './domain.ts';
import type {DraftKind,Comp,CimKey,Source} from './drafting.ts';
import {compMultiple} from './drafting.ts';
import type {DealCompany} from './deals.ts';

const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
function need(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg);}

export type DraftStatus='queued'|'ready'|'applied'|'dismissed'|'failed';
export type DraftRecord={id:string;kind:DraftKind;inputHash:string;requestedAt:string;requestedBy:string;status:DraftStatus;model?:string;result?:unknown;error?:string;decidedAt?:string;decidedBy?:string;usedAnyway?:{note:string;at:string;by:string}};
export type CimParagraph={text:string;sources:string[];needsConfirmation:boolean;confirmedNote?:string};
export type CimSection={key:CimKey|string;title:string;by:'code'|'model'|'advisor';paragraphs:CimParagraph[]};
export type CimStatus='Draft'|'Advisor approved'|'Ready for owner'|'Changes requested'|'Owner approved';
export type CimVersion={version:number;createdAt:string;createdBy:string;draftId?:string;inputHash?:string;model?:string;sections:CimSection[];sources:Source[];status:CimStatus;advisorApproval?:{by:string;at:string};ownerApproval?:{at:string};reviewId?:string;comments:{section:string;by:string;text:string;at:string;side:'firm'|'owner'}[];pdfFileId?:string};
export type Materials={drafts:DraftRecord[];cim:CimVersion[];comps?:{ids:string[];includeInCim:boolean;commentary?:string;cited?:string[];at?:string}};
export type MaterialsCompany=DealCompany&{materials?:Materials};
export type WorkspaceWithComps=Workspace&{comps?:Comp[]};

export const materialsOf=(c:Company):Materials=>{const m=(c as MaterialsCompany).materials;return {drafts:m?.drafts||[],cim:m?.cim||[],...(m?.comps?{comps:m.comps}:{})};};
export function withMaterials(w:Workspace,companyId:string,fn:(m:Materials)=>Materials):Workspace{
  const c=w.companies.find(x=>x.id===companyId);need(c,'Company not found.');
  return {...w,companies:w.companies.map(x=>x.id===companyId?{...x,materials:fn(materialsOf(x))} as MaterialsCompany:x)};
}
export const latestDraft=(m:Materials,kind:DraftKind)=>m.drafts.filter(d=>d.kind===kind).sort((a,b)=>b.requestedAt.localeCompare(a.requestedAt))[0];
/** A draft is stale when the inputs it was made from have changed since. */
export const isStale=(d:DraftRecord|undefined,currentHash:string|undefined)=>!!d&&!!currentHash&&d.inputHash!==currentHash&&!d.usedAnyway;
export function recordDraft(w:Workspace,companyId:string,d:{id:string;kind:DraftKind;inputHash:string},actor:string):Workspace{
  return withMaterials(w,companyId,m=>({...m,drafts:[{...d,requestedAt:now(),requestedBy:actor,status:'queued' as const},...m.drafts.filter(x=>x.id!==d.id)].slice(0,40)}));
}
export function updateDraft(w:Workspace,companyId:string,id:string,patch:Partial<DraftRecord>):Workspace{
  return withMaterials(w,companyId,m=>({...m,drafts:m.drafts.map(x=>x.id===id?{...x,...patch}:x)}));
}
export function useAnyway(w:Workspace,companyId:string,id:string,note:string,actor:string):Workspace{
  need(note.trim().length>=5,'Say why the draft is still right to use.');
  return updateDraft(w,companyId,id,{usedAnyway:{note:note.trim().slice(0,300),at:now(),by:actor}});
}

// ── Comparable sales library ────────────────────────────────────────────────────────────────
export const compsOf=(w:Workspace)=>(w as WorkspaceWithComps).comps||[];
export function validateComp(c:Partial<Comp>):string[]{
  const p:string[]=[];
  if(!c.businessType||c.businessType.trim().length<3)p.push('Enter the type of business.');
  if(!c.state||!/^[A-Z]{2}$/.test(c.state))p.push('Enter a two-letter state.');
  if(!c.year||c.year<1990||c.year>new Date().getFullYear())p.push('Enter the year of sale.');
  if(!(Number(c.price)>0))p.push('Enter the sale price.');
  if(!(Number(c.sde)>0))p.push('Enter SDE or EBITDA.');
  if(!c.source||c.source.trim().length<3)p.push('Name the source.');
  if(c.sourceUrl&&!/^https:\/\//.test(c.sourceUrl))p.push('Use a full https link for the source.');
  return p;
}
export function saveComp(w:Workspace,c:Partial<Comp>,actor:string):Workspace{
  const p=validateComp(c);need(!p.length,p.join(' '));
  const comp:Comp={id:c.id||'comp-'+uid().slice(0,8),businessType:c.businessType!.trim(),region:(c.region||'').trim(),state:c.state!,year:Number(c.year),revenue:Math.round(Number(c.revenue)||0),sde:Math.round(Number(c.sde)),price:Math.round(Number(c.price)),notes:(c.notes||'').trim().slice(0,600),source:c.source!.trim().slice(0,160),...(c.sourceUrl?{sourceUrl:c.sourceUrl}:{}),...(c.recurringPct!==undefined?{recurringPct:c.recurringPct}:{}),recordedAt:c.recordedAt||now(),recordedBy:c.recordedBy||actor,status:c.status||'confirmed'};
  const list=compsOf(w);return {...w,comps:[comp,...list.filter(x=>x.id!==comp.id)]} as Workspace;
}
export function removeComp(w:Workspace,id:string):Workspace{return {...w,comps:compsOf(w).filter(x=>x.id!==id)} as Workspace;}
/** CSV with a header row: business_type,region,state,year,revenue,sde,price,source,source_url,notes. */
export function parseCompsCsv(text:string,actor:string):{comps:Comp[];errors:string[]}{
  const rows=text.split(/\r?\n/).filter(r=>r.trim()&&!r.startsWith('#'));if(!rows.length)return {comps:[],errors:['The file is empty.']};
  const split=(r:string)=>{const out:string[]=[];let cur='',q=false;for(const ch of r){if(ch==='"'){q=!q;continue;}if(ch===','&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out.map(x=>x.trim());};
  const head=split(rows[0]).map(h=>h.toLowerCase().replace(/\s+/g,'_'));const col=(r:string[],k:string)=>r[head.indexOf(k)]??'';
  for(const k of ['business_type','state','year','sde','price','source'])if(!head.includes(k))return {comps:[],errors:[`The header needs a ${k} column.`]};
  const comps:Comp[]=[],errors:string[]=[];const n=(s:string)=>Number(s.replace(/[$,\s]/g,''))||0;
  rows.slice(1).forEach((r,i)=>{const v=split(r);const c:Partial<Comp>={businessType:col(v,'business_type'),region:col(v,'region'),state:col(v,'state').toUpperCase(),year:n(col(v,'year')),revenue:n(col(v,'revenue')),sde:n(col(v,'sde')),price:n(col(v,'price')),source:col(v,'source'),sourceUrl:col(v,'source_url')||undefined,notes:col(v,'notes')};
    const p=validateComp(c);if(p.length)errors.push(`Row ${i+2}: ${p.join(' ')}`);else comps.push({...c,id:'comp-'+uid().slice(0,8),recordedAt:now(),recordedBy:actor,status:'confirmed'} as Comp);});
  return {comps,errors};
}
/** When a Kalling deal closes, its final price becomes a comparable sale. */
export function closedDealComp(c:DealCompany,price:number,actor:string,year=new Date().getFullYear()):Partial<Comp>{
  const r=c.recast,sde=r?Math.max(0,(r.inputs.ownerPay||0)+(r.inputs.netProfit||0)+r.addBacks.reduce((s,a)=>s+a.amount,0)):0;
  return {businessType:/refrigerat/i.test(c.industry)?'Commercial refrigeration':'Residential HVAC',region:c.region||'',state:c.state,year,revenue:r?.inputs.revenue||0,sde,price,source:'Kalling closed deal',notes:`Recorded from the closing of ${c.name}.`,recurringPct:r?.inputs.maintenancePct,recordedBy:actor,status:'confirmed'};
}
export {compMultiple};
