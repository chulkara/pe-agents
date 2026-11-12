// The confidential information memorandum: sources in, sections out, checks before release.
import type {Company} from './domain.ts';
import type {Source,CimKey,CimParagraph as DraftParagraph} from './drafting.ts';
import {cimSections} from './drafting.ts';
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
  if(r){fact('Revenue',`Revenue for the last full year was ${usd(r.inputs.revenue)}.`);fact('Earnings',`Seller’s discretionary earnings are ${usd(recastSde(r))}.`);
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

export function financialSection(c:DealCompany,years?:YearRow[]):CimSection{
  const rows=years?.length?years:c.recast?[{year:new Date().getFullYear()-1,revenue:c.recast.inputs.revenue,netIncome:c.recast.inputs.netProfit,ownerPay:c.recast.inputs.ownerPay,addBacks:c.recast.addBacks.reduce((s,x)=>s+x.amount,0),sde:recastSde(c.recast)} as YearRow]:[];
  const paragraphs:CimSection['paragraphs']=rows.length?[{text:'Year, revenue, net income, owner pay, add-backs and seller’s discretionary earnings (SDE), from the reviewed recast.',sources:['F2'],needsConfirmation:false},
    ...rows.map(r=>({text:`${r.year}: revenue ${usd(r.revenue)}, net income ${usd(r.netIncome)}, owner pay ${usd(r.ownerPay)}, add-backs ${usd(r.addBacks+(r.depreciation||0)+(r.amortization||0)+(r.interest||0))}, SDE ${usd(r.sde)}.`,sources:['F2'],needsConfirmation:false})),
    ...(c.recast?.addBacks.length?[{text:'Add-backs: '+c.recast.addBacks.map(a=>`${a.item} ${usd(a.amount)} (${a.reason}${a.evidence?'; '+a.evidence:''})`).join('; ')+'.',sources:['F2'],needsConfirmation:false}]:[])]
    :[{text:'The financial summary appears once the recast is saved.',sources:[],needsConfirmation:true}];
  return {key:'financials',title:'Financial summary',by:'code',paragraphs};
}
export const disclaimers='This memorandum was prepared by Kalling from information provided by the owner and has not been audited or independently verified. It does not contain all the information a buyer may need. Buyers should do their own diligence and rely only on the terms of a signed purchase agreement. This memorandum is confidential and is shared only under a signed confidentiality agreement.';

/** Put model sections and code sections together, in the fixed order. */
export function assembleCim(o:{prev?:CimVersion;draft?:Record<string,DraftParagraph[]>;draftId?:string;inputHash?:string;model?:string;sources:Source[];company:DealCompany;years?:YearRow[];actor:string;only?:string[]}):CimVersion{
  const prev=o.prev;
  const sections=cimSections.map(s=>{
    if(s.key==='cover')return {key:s.key,title:s.title,by:'code' as const,paragraphs:[{text:`Confidential information memorandum. ${o.company.name}, ${o.company.industry}, ${o.company.region||o.company.state}. Prepared by Kalling. Shared only with buyers who have signed a confidentiality agreement and been approved.`,sources:[],needsConfirmation:false}]};
    if(s.key==='financials')return financialSection(o.company,o.years);
    if(s.key==='disclaimers')return {key:s.key,title:s.title,by:'code' as const,paragraphs:[{text:disclaimers,sources:[],needsConfirmation:false}]};
    const fresh=o.draft?.[s.key];const keep=prev?.sections.find(x=>x.key===s.key);
    if(fresh&&(!o.only||o.only.includes(s.key)))return {key:s.key,title:s.title,by:'model' as const,paragraphs:fresh.map(p=>({...p}))};
    return keep||{key:s.key,title:s.title,by:'model' as const,paragraphs:[]};
  });
  return {version:(prev?.version||0)+1,createdAt:now(),createdBy:o.actor,...(o.draftId?{draftId:o.draftId}:{}),...(o.inputHash?{inputHash:o.inputHash}:{}),...(o.model?{model:o.model}:{}),sections,sources:o.sources,status:'Draft',comments:prev?.comments||[]};
}
export const unresolved=(v:CimVersion)=>v.sections.flatMap(s=>s.paragraphs.map((p,i)=>({section:s.key,title:s.title,i,p}))).filter(x=>x.p.needsConfirmation&&!x.p.confirmedNote&&x.p.text.trim());
export function cimFindings(v:CimVersion,ctx:AnonymityContext):Finding[]{return checkConfidential(Object.fromEntries(v.sections.map(s=>[s.title,s.paragraphs.map(p=>p.text)])),ctx);}
/** Everything that stops a version from going to the owner or the data room. */
export function releaseProblems(v:CimVersion,ctx:AnonymityContext):string[]{
  const p:string[]=[];const u=unresolved(v);
  if(u.length)p.push(`${u.length} sentence${u.length===1?'':'s'} need${u.length===1?'s':''} confirmation: give each a source or confirm it with the owner.`);
  for(const f of blocking(cimFindings(v,ctx)))p.push(`${f.field}: ${f.why} (“${f.text}”)`);
  if(v.sections.every(s=>s.by==='code'||!s.paragraphs.length))p.push('Draft the memorandum sections first.');
  return p;
}
export const canShareInDataRoom=(v:CimVersion|undefined)=>!!v&&v.status==='Owner approved'&&!!v.advisorApproval&&!!v.ownerApproval;
export const reviewSections=(v:CimVersion)=>v.sections.map(s=>({key:String(s.key),title:s.title,text:s.paragraphs.map(p=>p.text).join('\n\n')}));
export const currentCim=(m:Materials)=>m.cim[0];
export const sectionTitle=(k:string)=>cimSections.find(s=>s.key===k)?.title||k;
export type {CimKey};
export function companyContext(c:Company,extra:Partial<AnonymityContext>={}):AnonymityContext{const d=c as DealCompany;return {businessName:c.name,ownerName:c.owner,city:c.city,website:c.website,businessEmail:c.email,businessPhone:c.phone,region:d.region||'',...extra};}
