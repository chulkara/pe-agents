// The confidential information memorandum: sources in, sections out, checks before release.
import type {Company} from './domain.ts';
import type {Source,CimKey,CimParagraph as DraftParagraph} from './drafting.ts';
import {cimSections,stable} from './drafting.ts';
import type {CimVersion,CimSection,Materials} from './materials.ts';
import type {OwnerAnswers} from './portal.ts';
import type {Extract} from './extract.ts';
import type {DealCompany} from './deals.ts';
import {recastSde} from './deals.ts';
import {checkConfidential,blocking,type AnonymityContext,type Finding} from './anonymity.ts';
import type {YearRow} from './recastDraft.ts';

const now=()=>new Date().toISOString();
const usd=(n:number|null|undefined)=>n===null||n===undefined?'not stated':'$'+Math.round(n).toLocaleString('en-US');
export type CimInputs={company:DealCompany;answers?:OwnerAnswers;docs:{fileId:string;name:string;kind:string;extract?:Extract}[];years?:YearRow[];listingFacts?:Record<string,string|number>};

/** Numbered sources: F facts from Kalling's records, Q owner answers, D document pages, R research. */
export function buildSources(i:CimInputs):Source[]{
  const c=i.company,r=c.recast,q=(c as DealCompany&{qualification?:{reason:string;timing:string;license:string}}).qualification,out:Source[]=[];let f=0,d=0,a=0,re=0;
  const fact=(label:string,text:string)=>{if(text)out.push({id:'F'+(++f),label,text});};
  fact('Region',`The business operates in ${c.region||c.state}.`);fact('Industry',`The business does ${c.industry} work.`);
  if(r){out.push(...financialSources(c,new Set(i.docs.map(d=>d.fileId))));
    fact('Maintenance',`About ${r.inputs.maintenancePct}% of revenue comes from service and maintenance, with ${r.inputs.agreements} active maintenance agreements.`);
    fact('Team',`There are ${r.inputs.technicians} field technicians.`);fact('Mix',`Commercial work is about ${r.inputs.commercialPct}% of revenue and new construction about ${r.inputs.newConstructionPct}%.`);
    fact('Years',`The business has operated for about ${r.inputs.years} years.`);}
  if(q){fact('Reason for sale',`The owner’s reason for selling: ${q.reason}. Timing: ${q.timing}.`);fact('License',`Master HVACR license held by: ${q.license}.`);}
  for(const [k,v] of Object.entries(i.listingFacts||{}))fact(k,`${k}: ${v}`);
  const ans=i.answers;if(ans)for(const [k,label] of [['history','Owner on the history'],['services','Owner on services'],['strengths','Owner on strengths'],['team','Owner on the team'],['afterSale','Owner on after the sale']] as const)if(ans[k])out.push({id:'Q'+(++a),label,text:ans[k]});
  for(const doc of i.docs)for(const p of doc.extract?.status==='ok'?doc.extract.pages:[])if(p.text.trim())out.push({id:'D'+(++d),label:`${doc.name}, page ${p.page}`,text:p.text.slice(0,2400)});
  for(const e of [...c.evidence,...c.documents.flatMap(x=>x.evidence)])out.push({id:'R'+(++re),label:e.source,text:`${e.field.replace(/_/g,' ')}: ${e.value}. ${e.excerpt||''}`.slice(0,800)});
  return out;
}

/** Reviewed amounts and the original excerpts are kept distinct, including advisor edits. */
export function financialSources(c:DealCompany,allowedFiles?:Set<string>):Source[]{
  const r=c.recast;if(!r)return [];const accepted=(r.review?.lines||[]).filter(l=>l.decision==='accept');
  const evidence=(ls:typeof accepted)=>ls.map(l=>`${l.citation.name}, page ${l.citation.page}: “${l.citation.excerpt}”${l.amount!==l.reportedAmount?` Advisor adjustment: reported ${usd(l.reportedAmount)}, applied ${usd(l.amount)}.`:''}`).join(' ');
  const supported=(ls:typeof accepted)=>ls.length>0&&ls.every(l=>!!l.citation.fileId&&l.citation.page>=1&&!!l.citation.excerpt&&(!allowedFiles||allowedFiles.has(l.citation.fileId)));
  const entry=(id:string,label:string,value:number,ls:typeof accepted,complete:boolean):Source=>({id,label:`${label}, reviewed recast v${r.version||1}`,text:`${label}: ${usd(value)}. Saved by ${r.updatedBy||'the advisor'}${r.review?` for ${r.review.year}`:''}. ${evidence(ls)||'Advisor-entered value; no document citation is recorded.'}`,needsConfirmation:!complete});
  const revenue=accepted.filter(l=>l.target==='revenue'&&l.amount===r.inputs.revenue),net=accepted.filter(l=>l.target==='netProfit'&&l.amount===r.inputs.netProfit),owner=accepted.filter(l=>l.target==='ownerPay'),backs=accepted.filter(l=>l.target==='addBack');
  const ownerOk=supported(owner)&&owner.reduce((n,l)=>n+l.amount,0)===r.inputs.ownerPay;
  const backsOk=r.addBacks.length>0&&r.addBacks.every(a=>backs.some(l=>l.item===a.item&&l.amount===a.amount));
  const sources=[entry('FR-revenue','Revenue',r.inputs.revenue,revenue,supported(revenue)),entry('FR-profit','Net profit',r.inputs.netProfit,net,supported(net)),entry('FR-owner','Owner pay included in recast',r.inputs.ownerPay,owner,ownerOk),entry('FR-addbacks','Accepted add-backs',r.addBacks.reduce((n,a)=>n+a.amount,0),backs,supported(backs)&&backsOk)];
  // Zero additions describe the review decision, not a claim that no owner pay/expense existed.
  if(r.review&&r.inputs.ownerPay===0&&owner.length===0){sources[2].needsConfirmation=false;sources[2].text='No owner-pay addition was accepted in the reviewed recast.';}
  if(r.review&&r.addBacks.length===0){sources[3].needsConfirmation=false;sources[3].text='No add-backs were accepted in the reviewed recast.';}
  sources.push({id:'FR-sde',label:`SDE calculation, reviewed recast v${r.version||1}`,text:`SDE = net profit ${usd(r.inputs.netProfit)} + owner pay ${usd(r.inputs.ownerPay)} + accepted add-backs ${usd(r.addBacks.reduce((n,a)=>n+a.amount,0))} = ${usd(recastSde(r))}. Computed by Kalling from FR-profit, FR-owner and FR-addbacks.`,needsConfirmation:sources.slice(1).some(s=>s.needsConfirmation)});
  return sources;
}
/** Never rebuild release figures from unreviewed extraction rows, including skipped lines. */
export function financialSection(c:DealCompany,_extractedYears?:YearRow[],sources:Source[]=financialSources(c)):CimSection{
  const r=c.recast;if(!r)return {key:'financials',title:'Financial summary',by:'code',paragraphs:[{text:'The financial summary appears once the recast is saved.',sources:[],needsConfirmation:true}]};
  const refs=['FR-revenue','FR-profit','FR-owner','FR-addbacks','FR-sde'],known=refs.filter(id=>sources.some(s=>s.id===id));
  const missing=refs.some(id=>!sources.some(s=>s.id===id&&!s.needsConfirmation));
  return {key:'financials',title:'Financial summary',by:'code',paragraphs:[
    {text:`${r.review?'Financial year '+r.review.year:'Current recast, financial year to confirm'}. Reviewed recast version ${r.version||1}. Figures below reflect the saved advisor decisions. Earlier extracted years are not presented as reviewed financials.`,sources:known,needsConfirmation:!r.review},
    {text:`Revenue ${usd(r.inputs.revenue)}, net profit ${usd(r.inputs.netProfit)}, owner pay included ${usd(r.inputs.ownerPay)}, accepted add-backs ${usd(r.addBacks.reduce((n,a)=>n+a.amount,0))}, SDE ${usd(recastSde(r))}.`,sources:known,needsConfirmation:missing},
    ...(r.addBacks.length?[{text:'Accepted add-backs: '+r.addBacks.map(a=>`${a.item} ${usd(a.amount)} (${a.reason}${a.evidence?'; '+a.evidence:''})`).join('; ')+'.',sources:['FR-addbacks'],needsConfirmation:!sources.some(s=>s.id==='FR-addbacks'&&!s.needsConfirmation)}]:[])]};
}
export function cimFinancialsCurrent(v:CimVersion,c:Company){return v.financialIntegrity?.version===1&&stable(v.financialIntegrity.recast)===stable((c as DealCompany).recast||null);}
export const disclaimers='This memorandum was prepared by Kalling from information provided by the owner and has not been audited or independently verified. It does not contain all the information a buyer may need. Buyers should do their own diligence and rely only on the terms of a signed purchase agreement. This memorandum is confidential and is shared only under a signed confidentiality agreement.';

/** Put model sections and code sections together, in the fixed order. */
export function assembleCim(o:{prev?:CimVersion;draft?:Record<string,DraftParagraph[]>;draftId?:string;inputHash?:string;model?:string;sources:Source[];company:DealCompany;years?:YearRow[];actor:string;only?:string[]}):CimVersion{
  const prev=o.prev;
  const sections=cimSections.map(s=>{
    if(s.key==='cover')return {key:s.key,title:s.title,by:'code' as const,paragraphs:[{text:`Confidential information memorandum. ${o.company.name}, ${o.company.industry}, ${o.company.region||o.company.state}. Prepared by Kalling. Shared only with buyers who have signed a confidentiality agreement and been approved.`,sources:[],needsConfirmation:false}]};
    if(s.key==='financials')return financialSection(o.company,undefined,o.sources);
    if(s.key==='disclaimers')return {key:s.key,title:s.title,by:'code' as const,paragraphs:[{text:disclaimers,sources:[],needsConfirmation:false}]};
    const fresh=o.draft?.[s.key];const keep=prev?.sections.find(x=>x.key===s.key);
    if(fresh&&(!o.only||o.only.includes(s.key)))return {key:s.key,title:s.title,by:'model' as const,paragraphs:fresh.map(p=>({...p}))};
    return keep||{key:s.key,title:s.title,by:'model' as const,paragraphs:[]};
  });
  return {financialIntegrity:{version:1,recast:structuredClone(o.company.recast||null)},version:(prev?.version||0)+1,createdAt:now(),createdBy:o.actor,...(o.draftId?{draftId:o.draftId}:{}),...(o.inputHash?{inputHash:o.inputHash}:{}),...(o.model?{model:o.model}:{}),sections,sources:o.sources,status:'Draft',comments:prev?.comments||[]};
}
export const unresolved=(v:CimVersion)=>v.sections.flatMap(s=>s.paragraphs.map((p,i)=>({section:s.key,title:s.title,i,p}))).filter(x=>x.p.needsConfirmation&&!x.p.confirmedNote&&x.p.text.trim());
export function cimFindings(v:CimVersion,ctx:AnonymityContext):Finding[]{return checkConfidential(Object.fromEntries(v.sections.map(s=>[s.title,s.paragraphs.map(p=>p.text)])),ctx);}
/** Everything that stops a version from going to the owner or the data room. */
export function releaseProblems(v:CimVersion,ctx:AnonymityContext,company?:Company):string[]{
  const p:string[]=[];const u=unresolved(v);
  if(v.financialIntegrity?.version!==1)p.push('Refresh the financial section and review it before releasing this older memorandum.');
  else if(company&&!cimFinancialsCurrent(v,company))p.push('The recast changed. Refresh the financial section and obtain new advisor and owner approvals.');
  if(u.length)p.push(`${u.length} sentence${u.length===1?'':'s'} need${u.length===1?'s':''} confirmation: give each a source or confirm it with the owner.`);
  for(const f of blocking(cimFindings(v,ctx)))p.push(`${f.field}: ${f.why} (“${f.text}”)`);
  if(v.sections.every(s=>s.by==='code'||!s.paragraphs.length))p.push('Draft the memorandum sections first.');
  return p;
}
export const canShareInDataRoom=(v:CimVersion|undefined,c?:Company)=>!!v&&v.financialIntegrity?.version===1&&(!c||cimFinancialsCurrent(v,c))&&v.status==='Owner approved'&&!!v.advisorApproval&&!!v.ownerApproval&&unresolved(v).length===0;
export const reviewSections=(v:CimVersion)=>v.sections.map(s=>({key:String(s.key),title:s.title,text:s.paragraphs.map(p=>p.text).join('\n\n')}));
export const currentCim=(m:Materials)=>m.cim[0];
export const sectionTitle=(k:string)=>cimSections.find(s=>s.key===k)?.title||k;
export type {CimKey};
export function companyContext(c:Company,extra:Partial<AnonymityContext>={}):AnonymityContext{const d=c as DealCompany;return {businessName:c.name,ownerName:c.owner,city:c.city,website:c.website,businessEmail:c.email,businessPhone:c.phone,region:d.region||'',...extra};}
