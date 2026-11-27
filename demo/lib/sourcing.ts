// Seller sourcing: rank licensed HVAC owners who may be ready to sell, from public license records,
// and draft a first letter for a person to approve. Code does all the ranking and writes every
// reason from the record itself. Nothing is sent: an advisor approves a letter, mails it by hand,
// and records what happened. Owners who ask not to be contacted are never shown again.
import type {Region} from './brokerage.ts';

export type LicenseRecord={licenseNo:string;name:string;address:string;city:string;state:string;zip:string;county:string;firstLicensed:string;expires:string;status:string};
export type ProspectStatus='New'|'Letter drafted'|'Letter approved'|'Mailed'|'Replied'|'Not interested'|'Do not contact';
export type Decision={status:ProspectStatus;letter?:string;approvedBy?:string;approvedAt?:string;mailedAt?:string;note?:string;updatedBy?:string;updatedAt:string};
export type SourcingState={source:string;importedAt:string;records:LicenseRecord[];decisions:Record<string,Decision>;doNotContact:string[]};
export type SourcingDecisions=Pick<SourcingState,'decisions'|'doNotContact'>;
export type Tier='Contact first'|'Worth a letter'|'Later';
export type Prospect={record:LicenseRecord;region:Region|null;years:number;sharedAddress:number;renewalDue:boolean;score:number;tier:Tier;reason:string;decision?:Decision};

export const njCounties:Record<string,Region>={
  bergen:'North Jersey',essex:'North Jersey',hudson:'North Jersey',morris:'North Jersey',passaic:'North Jersey',sussex:'North Jersey',union:'North Jersey',warren:'North Jersey',
  hunterdon:'Central Jersey',mercer:'Central Jersey',middlesex:'Central Jersey',somerset:'Central Jersey',
  monmouth:'Jersey Shore',ocean:'Jersey Shore',
  atlantic:'South Jersey',burlington:'South Jersey',camden:'South Jersey','cape may':'South Jersey',cumberland:'South Jersey',gloucester:'South Jersey',salem:'South Jersey',
};
export const emptySourcing=():SourcingState=>({source:'',importedAt:'',records:[],decisions:{},doNotContact:[]});
const clean=(s:unknown,max=200)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,max);
const titleCase=(s:string)=>s.toLowerCase().replace(/\b([a-z])/g,m=>m.toUpperCase()).replace(/\bMc([a-z])/g,(_,c)=>'Mc'+c.toUpperCase());

/** Dates as they appear in state files: MM/DD/YYYY, YYYY-MM-DD or MM-DD-YYYY. Returns YYYY-MM-DD or ''. */
export function isoDate(s:string){
  const t=clean(s,40);let m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m=t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);if(m)return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return '';
}
function splitLine(line:string,sep:string){
  if(sep==='\t')return line.split('\t');
  const out:string[]=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){const ch=line[i];if(q){if(ch==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(ch==='"')q=false;else cur+=ch;}else if(ch==='"')q=true;else if(ch===','){out.push(cur);cur='';}else cur+=ch;}
  out.push(cur);return out;
}
const want:Record<string,RegExp>={
  licenseNo:/^licen[cs]e\s*(no|num|number|#)|^lic\s*(no|#|num)/i,name:/^(full\s*)?name$|^licensee(\s*name)?$/i,first:/^first(\s*name)?$/i,middle:/^middle/i,last:/^last(\s*name)?$/i,suffix:/suffix/i,
  address:/^(address(\s*(line)?\s*1)?|street)$/i,address2:/^address\s*(line)?\s*2$/i,city:/^city$/i,state:/^state$/i,zip:/^zip|postal/i,county:/^count(y|ies)$/i,
  firstLicensed:/initial|original|first\s*licen|first\s*issue/i,expires:/expir/i,status:/^(license\s*)?status$/i,profession:/profession|licen[cs]e\s*type|board|occupation/i,
};
/** Reads a licensee list (CSV or tab-separated) with any of the usual column names. Keeps master HVACR
 *  contractors when the file covers several professions. */
export function parseLicenseList(text:string,limit=50000):{records:LicenseRecord[];skipped:number}{
  const lines=text.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)throw Error('The file needs a header row and at least one licensee.');
  const sep=lines[0].includes('\t')?'\t':',',head=splitLine(lines[0],sep).map(h=>clean(h,80));
  const col:Record<string,number>={};for(const [k,re] of Object.entries(want)){const i=head.findIndex(h=>re.test(h)&&!(k==='firstLicensed'&&/last|renew|expir/i.test(h)));if(i>=0)col[k]=i;}
  if(col.licenseNo===undefined)throw Error('Could not find a license number column.');
  if(col.name===undefined&&col.last===undefined)throw Error('Could not find a name column.');
  if(col.firstLicensed===undefined)throw Error('Could not find the date each person was first licensed (for example "Date of Initial Licensure").');
  if(col.profession===undefined)throw Error('Could not find a profession or license type column, so master HVACR contractors cannot be told apart.');
  const records:LicenseRecord[]=[];let skipped=0;const seen=new Set<string>();
  for(const line of lines.slice(1,limit+1)){
    const c=splitLine(line,sep),g=(k:string)=>col[k]===undefined?'':clean(c[col[k]]);
    // Letters state a master HVACR license, so only rows that say so are kept.
    if(!(/master/i.test(g('profession'))&&/hvac/i.test(g('profession')))){skipped++;continue;}
    const licenseNo=g('licenseNo').toUpperCase(),firstLicensed=isoDate(g('firstLicensed'));
    const name=titleCase(col.name!==undefined?g('name'):[g('first'),g('middle'),g('last'),g('suffix')].filter(Boolean).join(' '));
    if(!licenseNo||!name||!firstLicensed||seen.has(licenseNo)){skipped++;continue;}
    seen.add(licenseNo);
    records.push({licenseNo,name,address:titleCase([g('address'),g('address2')].filter(Boolean).join(', ')),city:titleCase(g('city')),state:(g('state')||'NJ').toUpperCase().slice(0,2),zip:g('zip').slice(0,5),county:titleCase(g('county').replace(/\s+county$/i,'')),firstLicensed,expires:isoDate(g('expires')),status:g('status')});
  }
  return {records,skipped};
}

const addrKey=(r:LicenseRecord)=>(r.address+'|'+r.zip).toLowerCase().replace(/[^a-z0-9|]/g,'');
const fmt=(iso:string)=>new Date(iso+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const inactive=(r:LicenseRecord,today:string)=>(r.expires&&r.expires<today)||/expired|inactive|revoked|suspended|retired|surrender/i.test(r.status);

/** Ranks every record that can be contacted. Expired licenses and do-not-contact owners are left out. */
export function rankProspects(s:SourcingState,today=new Date().toISOString().slice(0,10),filter:{region?:Region|''}={}):Prospect[]{
  const shared=new Map<string,number>();for(const r of s.records)if(r.address)shared.set(addrKey(r),(shared.get(addrKey(r))||0)+1);
  const dnc=new Set(s.doNotContact),soon=new Date(Date.parse(today+'T12:00:00Z')+120*864e5).toISOString().slice(0,10);
  const out:Prospect[]=[];
  for(const r of s.records){
    const d=s.decisions[r.licenseNo];
    if(dnc.has(r.licenseNo)||d?.status==='Do not contact'||inactive(r,today))continue;
    const region=r.state==='NJ'?njCounties[r.county.toLowerCase()]||null:null;
    if(filter.region&&region!==filter.region)continue;
    const years=Math.max(0,Math.floor((Date.parse(today)-Date.parse(r.firstLicensed))/(365.25*864e5)));
    const others=r.address?(shared.get(addrKey(r))||1)-1:0,renewalDue=!!r.expires&&r.expires<=soon;
    const tenure=years>=35?40:years>=30?35:years>=25?28:years>=20?20:years>=15?10:3;
    const score=tenure+(others===0?15:8)+(region?15:0)+(renewalDue?10:0);
    const tier:Tier=score>=70?'Contact first':score>=50?'Worth a letter':'Later';
    const parts=[`Licensed since ${r.firstLicensed.slice(0,4)} (${years} years)`,others===0?'no other master HVACR licensee at the same address':`${others} other licensee${others===1?'':'s'} at the same address, so a handover may be easier`,
      r.county?`${r.county} County${region?', '+region:''}`:'county not listed'];
    if(renewalDue)parts.push(`license renewal due ${fmt(r.expires)}`);
    out.push({record:r,region,years,sharedAddress:others,renewalDue,score,tier,reason:parts.join('; ')+'.',decision:d});
  }
  return out.sort((a,b)=>b.score-a.score||b.years-a.years||a.record.name.localeCompare(b.record.name));
}

/** A first letter built only from the public record. The advisor edits and approves it. */
export function draftLetter(p:Pick<Prospect,'record'>,from:{name:string;firm:string;phone?:string;email?:string}){
  const r=p.record,town=r.city||'your area',contact=[from.phone,from.email].filter(Boolean).join(' or ');
  return [`Dear ${r.name},`,'',
    `My name is ${from.name}. I'm an advisor at ${from.firm}, a firm that helps owners of heating and cooling businesses in New Jersey plan what comes next: selling in a few years, bringing in a partner, or simply knowing what the business is worth today.`,'',
    `You've held your master HVACR license since ${r.firstLicensed.slice(0,4)}. If you have started thinking about the future of your business in ${town}, it can help to know where you stand.`,'',
    `We offer a free, private sale-ready check: what the business is worth today and the few things that would raise its value. There is no cost and no commitment, and nothing is shared without your permission.`,'',
    contact?`If you'd like one, reach me at ${contact}. ${OPT_OUT}`:`If you'd like one, reply to this letter. ${OPT_OUT}`,'',
    'Sincerely,',from.name,from.firm].join('\n');
}

const now=()=>new Date().toISOString();
/** Kalling's opt-out sentence. Every letter must contain it word for word before it can be approved. */
export const OPT_OUT="If you'd rather not hear from us, tell me and I won't write again.";
/** Decisions only move forward: a mailed, answered or opted-out owner never returns to an earlier step. */
const next_:Record<ProspectStatus,ProspectStatus[]>={
  'New':['Letter drafted','Letter approved','Do not contact'],
  'Letter drafted':['Letter drafted','Letter approved','Do not contact'],
  'Letter approved':['Mailed','Do not contact'],
  'Mailed':['Replied','Not interested','Do not contact'],
  'Replied':['Not interested','Do not contact'],
  'Not interested':['Do not contact'],
  'Do not contact':[],
};
export function setDecision(s:SourcingState,licenseNo:string,next:Partial<Decision>&{status:ProspectStatus}):SourcingState{
  if(!s.records.some(r=>r.licenseNo===licenseNo))throw Error('That owner is not in the current list.');
  return {...s,...transitionDecision(s,licenseNo,next)};
}
export function transitionDecision(s:SourcingDecisions,licenseNo:string,next:Partial<Decision>&{status:ProspectStatus}):SourcingDecisions{
  const prev=s.decisions[licenseNo],from:ProspectStatus=s.doNotContact.includes(licenseNo)?'Do not contact':prev?.status||'New';
  if(!next_[from].includes(next.status))throw Error(from==='Do not contact'?'This owner asked not to be contacted.':next.status==='Mailed'?'Approve the letter before marking it mailed.':`This owner is already at "${from}". Decisions only move forward.`);
  if(next.letter!==undefined&&String(next.letter).length>4000)throw Error('Keep the letter under 4,000 characters.');
  if(next.status!=='Letter drafted'&&next.status!=='Letter approved'&&next.letter!==undefined&&next.letter!==prev?.letter)throw Error('The letter can only change when drafting or approving it.');
  if(next.status==='Letter approved'){
    if(!clean(next.letter??prev?.letter,4000))throw Error('Draft the letter before approving it.');
    if(!clean(next.approvedBy,120))throw Error('Approving a letter needs the name of the person approving it.');
    const text=String(next.letter??prev?.letter??'');
    if(/--/.test(text))throw Error('Replace -- with - before approving.');
    if(!text.includes(OPT_OUT))throw Error(`Keep Kalling's opt-out sentence word for word: "${OPT_OUT}"`);
  }
  const d:Decision={...prev,...next,letter:next.letter!==undefined?String(next.letter):prev?.letter,approvedAt:next.status==='Letter approved'?now():prev?.approvedAt,mailedAt:next.status==='Mailed'?now():prev?.mailedAt,updatedAt:now()};
  const dnc=next.status==='Do not contact'&&!s.doNotContact.includes(licenseNo)?[...s.doNotContact,licenseNo]:s.doNotContact;
  return {decisions:{...s.decisions,[licenseNo]:d},doNotContact:dnc};
}
/** Replaces the list but keeps every decision and the do-not-contact list. */
export function importRecords(s:SourcingState,records:LicenseRecord[],source:string):SourcingState{
  return {...s,records,source:clean(source,120),importedAt:now()};
}
export function sourcingSummary(s:SourcingState,ranked:Prospect[]){
  const count=(st:ProspectStatus)=>Object.values(s.decisions).filter(d=>d.status===st).length;
  return {ranked:ranked.length,first:ranked.filter(p=>p.tier==='Contact first').length,approved:count('Letter approved'),mailed:count('Mailed'),replied:count('Replied'),doNotContact:s.doNotContact.length};
}
