// Anonymity and privacy checks for anything buyers will read. A teaser must not identify the
// business; a memorandum may name it but must not expose customers, employees or the owner's
// personal details. Each finding says what was found, why it matters and how to fix it.
import type {Region} from './brokerage.ts';

export type Severity='block'|'warn';
export type FindingKind='business'|'owner'|'town'|'address'|'phone'|'email'|'domain'|'license'|'customer'|'employee'|'founding'|'phrase'|'ssn'|'bank'|'dob'|'personal-email';
export type Finding={kind:FindingKind;severity:Severity;text:string;field:string;why:string;suggestion:string};
export type AnonymityContext={businessName:string;legalName?:string;ownerName?:string;city?:string;address?:string;website?:string;businessEmail?:string;businessPhone?:string;licenseNumbers?:string[];customerNames?:string[];employeeNames?:string[];websitePhrases?:string[];region?:Region|''};

/** A short list of towns per region. Any of them in public text points to a location. */
export const regionTowns:Record<Region,string[]>={
  'North Jersey':['Newark','Jersey City','Paterson','Clifton','Hackensack','Montclair','Morristown','Parsippany','Paramus','Bayonne','Hoboken','Elizabeth','Livingston','Fort Lee','Teaneck','Wayne'],
  'Central Jersey':['Edison','New Brunswick','Piscataway','Woodbridge','Somerville','Bridgewater','Princeton','Trenton','Hamilton','Sayreville','Old Bridge','East Brunswick','Plainfield','Westfield','Green Brook','Flemington'],
  'South Jersey':['Camden','Cherry Hill','Vineland','Voorhees','Mount Laurel','Moorestown','Glassboro','Millville','Pennsauken','Deptford'],
  'Jersey Shore':['Toms River','Asbury Park','Long Branch','Red Bank','Point Pleasant','Freehold','Manasquan','Atlantic City','Ocean City','Belmar'],
  'New York City':['Manhattan','Brooklyn','Queens','Bronx','Staten Island','Astoria','Flushing','Harlem','Williamsburg'],
  'Long Island':['Hempstead','Huntington','Babylon','Islip','Garden City','Massapequa','Levittown','Hicksville','Smithtown','Riverhead','Southampton','Patchogue'],
  'Hudson Valley':['Poughkeepsie','Newburgh','Kingston','Middletown','New Paltz','Fishkill','Peekskill'],
  'Westchester & Rockland':['White Plains','Yonkers','New Rochelle','Mount Vernon','Scarsdale','Nyack','New City','Spring Valley','Tarrytown','Ossining'],
};
export const allTowns=Object.values(regionTowns).flat();
export const townRegion=(t:string)=>(Object.entries(regionTowns).find(([,ts])=>ts.some(x=>x.toLowerCase()===t.toLowerCase()))?.[0]||'') as Region|'';
const generic=new Set(['the','and','of','heating','air','cooling','hvac','mechanical','services','service','plumbing','refrigeration','comfort','climate','systems','conditioning','company','co','inc','llc','corp','corporation','group','home','pro','pros','energy','solutions','contractors','contracting','family','brothers','sons','garden','state','north','south','east','west','jersey','new','york','central','shore','island','valley','business','contractor','contractors','repair','installation','residential','commercial','county','metro','express','quality','best','american','premier','care','total','tech','technical','experts','supply','mechanicals','enterprises','associates','holdings']);
const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const word=(s:string)=>new RegExp('(^|[^a-z0-9])'+esc(s.toLowerCase())+"(?:'s|’s)?(?=$|[^a-z0-9])",'i');
/** Close variants of a business name: with and without company suffixes, plus distinctive words. */
export function nameVariants(name:string){
  const base=name.trim();if(base.length<3)return {full:[] as string[],distinctive:[] as string[]};
  const stripped=base.replace(/[,.]?\s*\b(inc|llc|l\.l\.c|co|corp|corporation|company|ltd)\.?$/i,'').replace(/\s*&\s*co\.?$/i,'').trim();
  const full=[...new Set([base,stripped,stripped.replace(/&/g,'and'),stripped.replace(/\band\b/gi,'&')])].filter(x=>x.length>=4);
  const distinctive=[...new Set(stripped.split(/[^A-Za-z0-9']+/).map(w=>w.replace(/'s$/i,'')).filter(w=>w.length>=4&&!generic.has(w.toLowerCase())))];
  return {full,distinctive};
}
const domainOf=(w?:string)=>String(w||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
const phoneRe=/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g;
const emailRe=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const streetRe=/\b\d{1,6}\s+(?:[A-Z][A-Za-z]+\s){0,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Highway|Hwy|Route|Rt|Court|Ct|Place|Pl|Parkway|Pkwy|Way)\b\.?/g;
const licenseRe=/\b(?:\d{2}HC\d{6,8}|(?:license|lic\.?)\s*(?:no\.?|number|#)?\s*:?\s*(?=[A-Z0-9-]*\d{3})[A-Z0-9-]{5,})\b/gi;
const foundingRe=/\b(?:founded|established|since|started)\s+(?:in\s+)?(19\d\d|20\d\d)\b/gi;
const personalMail=/@(gmail|yahoo|hotmail|aol|icloud|outlook|me|msn|comcast|verizon|optonline)\./i;

type Fields=Record<string,string|string[]|undefined>;
const textsOf=(f:Fields)=>Object.entries(f).flatMap(([k,v])=>(Array.isArray(v)?v:[v||'']).map(t=>({field:k,text:String(t)}))).filter(x=>x.text.trim());
function push(out:Finding[],f:Finding){if(!out.some(x=>x.kind===f.kind&&x.text.toLowerCase()===f.text.toLowerCase()&&x.field===f.field))out.push(f);}
const regionWord=(r?:string)=>r||'the region';

/** Teaser mode: nothing that identifies the business. */
export function checkTeaser(fields:Fields,c:AnonymityContext):Finding[]{
  const out:Finding[]=[],{full,distinctive}=nameVariants(c.businessName);const legal=c.legalName?nameVariants(c.legalName):{full:[],distinctive:[]};
  for(const {field,text} of textsOf(fields)){
    for(const v of [...full,...legal.full])if(word(v).test(text))push(out,{kind:'business',severity:'block',text:v,field,why:'This is the business’s name.',suggestion:'Use “the business” or “the company”.'});
    for(const v of [...distinctive,...legal.distinctive]){const m=text.match(word(v));if(m)push(out,{kind:'business',severity:'block',text:v,field,why:'This word is part of the business’s name and can identify it.',suggestion:'Remove it or describe the business by its work and region.'});}
    if(c.ownerName){const parts=c.ownerName.trim().split(/\s+/);for(const v of [c.ownerName.trim(),parts[parts.length-1]].filter(x=>x&&x.length>=3))if(word(v).test(text))push(out,{kind:'owner',severity:'block',text:v,field,why:'This is the owner’s name.',suggestion:'Use “the owner”.'});}
    const towns=[...new Set([...(c.city?[c.city]:[]),...allTowns])];
    for(const t of towns)if(t.length>=4&&word(t).test(text))push(out,{kind:'town',severity:'block',text:t,field,why:t.toLowerCase()===(c.city||'').toLowerCase()?'This is the town where the business is based.':'A town name narrows the location enough to identify a local business.',suggestion:`Use “${regionWord(c.region||townRegion(t))}” instead.`});
    for(const m of text.matchAll(streetRe))push(out,{kind:'address',severity:'block',text:m[0],field,why:'A street address identifies the business.',suggestion:'Remove the address.'});
    for(const m of text.matchAll(phoneRe))push(out,{kind:'phone',severity:'block',text:m[0],field,why:'A phone number identifies the business.',suggestion:'Remove it. Buyers contact Kalling.'});
    for(const m of text.matchAll(emailRe))push(out,{kind:'email',severity:'block',text:m[0],field,why:'An email address identifies the business.',suggestion:'Remove it. Buyers contact Kalling.'});
    const d=domainOf(c.website);if(d.length>=4&&text.toLowerCase().includes(d))push(out,{kind:'domain',severity:'block',text:d,field,why:'This is the business’s website.',suggestion:'Remove the website.'});
    for(const m of text.matchAll(licenseRe))push(out,{kind:'license',severity:'block',text:m[0],field,why:'A license number is public and points to one business.',suggestion:'Say “licensed” without the number.'});
    for(const n of c.licenseNumbers||[])if(n.length>=5&&text.includes(n))push(out,{kind:'license',severity:'block',text:n,field,why:'A license number is public and points to one business.',suggestion:'Say “licensed” without the number.'});
    for(const n of c.customerNames||[])if(n.length>=4&&word(n).test(text))push(out,{kind:'customer',severity:'block',text:n,field,why:'Customer names are confidential and identify the business.',suggestion:'Describe customers by type, for example “a property manager”.'});
    for(const n of c.employeeNames||[])if(n.length>=4&&word(n).test(text))push(out,{kind:'employee',severity:'block',text:n,field,why:'Employee names are confidential and identify the business.',suggestion:'Describe the role instead.'});
    for(const m of text.matchAll(foundingRe))push(out,{kind:'founding',severity:'warn',text:m[0],field,why:'A founding year together with the region can point to one business.',suggestion:'Use a rounded figure such as “over 15 years”.'});
    for(const p of c.websitePhrases||[]){const hit=sharedRun(text,p,8);if(hit)push(out,{kind:'phrase',severity:'warn',text:hit,field,why:'These words match the business’s own website, so a search would find it.',suggestion:'Rewrite in your own words.'});}
  }
  return out;
}
/** Memorandum mode: the business may be named; customers, employees and personal data may not. */
export function checkConfidential(fields:Fields,c:AnonymityContext):Finding[]{
  const out:Finding[]=[];
  for(const {field,text} of textsOf(fields)){
    for(const n of c.customerNames||[])if(n.length>=4&&word(n).test(text))push(out,{kind:'customer',severity:'block',text:n,field,why:'Customer names stay confidential until a buyer is under LOI.',suggestion:'Use Customer A, Customer B and so on.'});
    for(const n of c.employeeNames||[])if(n.length>=4&&word(n).test(text))push(out,{kind:'employee',severity:'block',text:n,field,why:'Employee names are shared only with the owner’s approval.',suggestion:'Describe the role instead.'});
    out.push(...piiScan(text,field,c));
  }
  return out;
}
/** Personal data that never belongs in buyer materials. */
export function piiScan(text:string,field='text',c:Pick<AnonymityContext,'businessEmail'|'businessPhone'|'address'>={}):Finding[]{
  const out:Finding[]=[];
  for(const m of text.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g))push(out,{kind:'ssn',severity:'block',text:m[0],field,why:'This looks like a Social Security number.',suggestion:'Remove it.'});
  for(const m of text.matchAll(/\b(?:account|acct|routing|aba)\s*(?:number|no\.?|#)?\s*:?\s*\d{6,17}\b/gi))push(out,{kind:'bank',severity:'block',text:m[0],field,why:'This looks like a bank account or routing number.',suggestion:'Remove it.'});
  for(const m of text.matchAll(/\b(?:date of birth|dob|born on)\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi))push(out,{kind:'dob',severity:'block',text:m[0],field,why:'This is a date of birth.',suggestion:'Remove it.'});
  for(const m of text.matchAll(emailRe))if(m[0].toLowerCase()!==String(c.businessEmail||'').toLowerCase()&&personalMail.test(m[0]))push(out,{kind:'personal-email',severity:'block',text:m[0],field,why:'This looks like a personal email address.',suggestion:'Remove it or use the business contact.'});
  for(const m of text.matchAll(streetRe))if(!c.address||!c.address.toLowerCase().includes(m[0].toLowerCase()))push(out,{kind:'address',severity:'block',text:m[0],field,why:'This looks like a home or other private address.',suggestion:'Remove it. The business address is shared separately.'});
  return out;
}
/** The first run of n or more consecutive words shared by two texts. */
export function sharedRun(a:string,b:string,n:number){const A=a.toLowerCase().match(/[a-z0-9']+/g)||[],B=b.toLowerCase().match(/[a-z0-9']+/g)||[];if(A.length<n||B.length<n)return '';const grams=new Set<string>();for(let i=0;i+n<=B.length;i++)grams.add(B.slice(i,i+n).join(' '));for(let i=0;i+n<=A.length;i++){const g=A.slice(i,i+n).join(' ');if(grams.has(g))return g;}return '';}
export const blocking=(f:Finding[])=>f.filter(x=>x.severity==='block');
/** Replace a finding's text with its suggested wording, where there is an obvious replacement. */
export function applySuggestion(text:string,f:Finding,region?:string){
  const to=f.kind==='town'?(region||'the region'):f.kind==='business'?'the business':f.kind==='owner'?'the owner':'';
  return text.replace(new RegExp(esc(f.text)+"(?:'s|’s)?",'gi'),to).replace(/\s{2,}/g,' ').replace(/\s+([,.])/g,'$1').trim();
}
