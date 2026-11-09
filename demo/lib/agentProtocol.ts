/** Portable, local-only research contract. No network or workspace mutation here. */
export const agentVersion = 'local-research-v1';
export const agentTopics = ['service_mix', 'customers', 'locations', 'ownership', 'team', 'competitors'] as const;
export type AgentTopic = typeof agentTopics[number];
export type AgentSource = {id:string; url:string; title:string; text:string; retrievedAt:string; hash:string};
export type AgentPacket = {
  version:1; playbook:typeof agentVersion; id:string; scopeId:string; createdAt:string; inputHash:string;
  company:{id:string; name:string; website:string; city:string; state:string};
  strategy:{industries:string; states:string; strategy:string};
  peers:{id:string; name:string; website:string; city:string; state:string}[];
  sources:AgentSource[];
};
export type AgentClaim = {id:string; topic:AgentTopic; value:string; quote:string; sourceId:string};
export type AgentComparison = {claimIds:string[]; reason:string};
export type AgentResult = {
  executionPolicy:'local-only-required-v2';
  version:1; playbook:typeof agentVersion; id:string; scopeId:string; inputHash:string;
  model:string; modelDigest:string; provider:'Ollama local'; completedAt:string;
  claims:AgentClaim[]; comparisons:AgentComparison[]; unknowns:string[]; questions:string[];
  duplicateCandidates:{companyId:string; reason:string}[];
  metrics:{apiCostUSD:0; elapsedMs:number; promptTokens:number; outputTokens:number; calls:number; resumed:boolean; usageIncomplete:boolean};
};
export const localModels = ['qwen3:4b', 'qwen3:8b'];
const instructionLike = /ignore\s+(all\s+)?(previous|prior|system)\s+instructions|system\s+prompt|(?:reveal|exfiltrate).{0,50}(?:credentials|password|api.key)|execute.{0,30}(?:shell|command)/i;
function requireThat(ok:unknown, message:string):asserts ok {if(!ok) throw Error(message);}
function string(value:unknown, min:number, max:number):value is string {return typeof value === 'string' && value.trim().length >= min && value.length <= max;}
function strings(value:unknown, max:number, length=450):value is string[] {return Array.isArray(value) && value.length <= max && value.every(x=>string(x,1,length));}
export async function sha256(text:string) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function packetBody(p:AgentPacket) {return JSON.stringify({version:p.version,playbook:p.playbook,id:p.id,scopeId:p.scopeId,createdAt:p.createdAt,company:p.company,strategy:p.strategy,peers:p.peers,sources:p.sources});}
export async function validatePacket(value:unknown):Promise<AgentPacket> {
  const p=value as AgentPacket;
  requireThat(p && JSON.stringify(p).length<=95000 && p.version===1 && p.playbook===agentVersion,'Unsupported or oversized assignment.');
  requireThat([p.id,p.scopeId,p.company?.id].every(x=>string(x,1,80)&&/^[a-zA-Z0-9_-]+$/.test(x)),'Invalid assignment scope.');
  requireThat(string(p.createdAt,10,40)&&Number.isFinite(Date.parse(p.createdAt)),'Invalid assignment date.');
  requireThat(string(p.company.name,1,180)&&string(p.company.website,1,500)&&string(p.company.city,0,100)&&string(p.company.state,0,30),'Invalid company.');
  requireThat(p.strategy && string(p.strategy.industries,0,1000)&&string(p.strategy.states,0,200)&&string(p.strategy.strategy,0,3000),'Invalid strategy.');
  requireThat(Array.isArray(p.peers)&&p.peers.length<=100&&p.peers.every(x=>x&&string(x.id,1,80)&&string(x.name,1,180)&&string(x.website,0,500)&&string(x.city,0,100)&&string(x.state,0,30)),'Invalid peer list.');
  requireThat(Array.isArray(p.sources)&&p.sources.length>0&&p.sources.length<=6,'Use one to six captured sources.');
  requireThat(new Set(p.sources.map(x=>x.id)).size===p.sources.length,'Duplicate source identifiers.');
  for(const s of p.sources){
    requireThat(s&&string(s.id,1,100)&&string(s.text,40,6000)&&string(s.url,1,500)&&string(s.title,1,180)&&string(s.retrievedAt,10,40)&&Number.isFinite(Date.parse(s.retrievedAt)),'Invalid source snapshot.');
    let u:URL;try{u=new URL(s.url);}catch{throw Error('Invalid source URL.');}
    requireThat(u.protocol==='https:'&&!u.username&&!u.password,'Sources need public HTTPS references.');
    requireThat(s.hash===await sha256(s.text),'A source snapshot was changed.');
  }
  requireThat(p.inputHash===await sha256(packetBody(p)),'The assignment changed; export a fresh assignment.');
  return p;
}
export const extractionSchema = {type:'object',additionalProperties:false,properties:{claims:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,properties:{topic:{type:'string',enum:agentTopics},value:{type:'string',maxLength:240},quote:{type:'string',maxLength:420}},required:['topic','value','quote']}},questions:{type:'array',maxItems:3,items:{type:'string',maxLength:300}}},required:['claims','questions']};
export function validateExtraction(value:unknown, source:AgentSource):{claims:AgentClaim[];questions:string[]} {
  const v=value as {claims:Omit<AgentClaim,'id'|'sourceId'>[];questions:string[]};
  requireThat(v&&Array.isArray(v.claims)&&v.claims.length<=3&&strings(v.questions,3,300),'The model did not return a bounded extraction.');
  const claims=v.claims.map((c,i)=>{
    requireThat(c&&agentTopics.includes(c.topic)&&string(c.value,1,240)&&string(c.quote,15,420),'The model returned an invalid claim.');
    requireThat(source.text.includes(c.quote)&&!instructionLike.test(c.quote)&&!instructionLike.test(c.value),'A proposed claim does not match a safe exact source excerpt.');
    return {...c,id:source.id+'-claim-'+i,sourceId:source.id};
  });
  requireThat(new Set(claims.map(c=>c.topic+'|'+c.quote)).size===claims.length,'The model repeated a claim.');
  return {claims,questions:v.questions};
}
export const comparisonSchema={type:'object',additionalProperties:false,properties:{comparisons:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,properties:{claimIds:{type:'array',minItems:2,maxItems:4,items:{type:'string'}},reason:{type:'string',maxLength:450}},required:['claimIds','reason']}}},required:['comparisons']};
export function validateComparisons(value:unknown,claims:AgentClaim[]):AgentComparison[]{
  const v=value as {comparisons:AgentComparison[]};
  requireThat(v&&Array.isArray(v.comparisons)&&v.comparisons.length<=6,'Invalid comparison result.');
  for(const c of v.comparisons) requireThat(c&&strings(c.claimIds,4,120)&&new Set(c.claimIds).size>=2&&c.claimIds.every(id=>claims.some(x=>x.id===id))&&string(c.reason,1,450),'A comparison references unknown claims.');
  return v.comparisons;
}
function site(value:string){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
export function duplicateCandidates(p:AgentPacket){const h=site(p.company.website);return p.peers.filter(c=>c.id!==p.company.id&&h&&site(c.website)===h).map(c=>({companyId:c.id,reason:'Same website host. Could be a duplicate listing, a branch, or a shared brand; confirm the legal entity before merging.'}));}
export function researchUnknowns(claims:AgentClaim[]){return [...agentTopics.filter(t=>!claims.some(c=>c.topic===t)).map(t=>'No supported proposal for '+t.replaceAll('_',' ')+'.'),'Current ownership requires verification; founding history alone does not establish it.','Owner willingness to sell is unknown.','Revenue, earnings, customer concentration and recurring revenue require separate evidence.'];}
export async function validateResult(value:unknown,p:AgentPacket):Promise<AgentResult>{
  await validatePacket(p);const r=value as AgentResult;
  requireThat(r&&JSON.stringify(r).length<=80000&&r.version===1&&r.playbook===agentVersion&&r.id===p.id&&r.scopeId===p.scopeId&&r.inputHash===p.inputHash,'This result belongs to another assignment or source version.');
  requireThat(r.executionPolicy==='local-only-required-v2','This result uses an older or unknown worker safety policy. Update the local worker and run the assignment again with live local-only checks.');
  requireThat(r.provider==='Ollama local'&&localModels.includes(r.model)&&string(r.modelDigest,1,120)&&string(r.completedAt,10,40)&&Number.isFinite(Date.parse(r.completedAt)),'Invalid local model metadata.');
  requireThat(Array.isArray(r.claims)&&r.claims.length<=18&&new Set(r.claims.map(c=>c.id)).size===r.claims.length,'Invalid claim list.');
  for(const c of r.claims){const s=p.sources.find(s=>s.id===c.sourceId);requireThat(s,'Unknown source reference.');const checked=validateExtraction({claims:[c],questions:[]},s);requireThat(checked.claims.length===1&&string(c.id,1,120),'Invalid cited claim.');}
  validateComparisons({comparisons:r.comparisons},r.claims);
  requireThat(strings(r.unknowns,12)&&strings(r.questions,18,300)&&JSON.stringify(r.unknowns)===JSON.stringify(researchUnknowns(r.claims)),'Invalid unknowns or questions.');
  requireThat(JSON.stringify(r.duplicateCandidates)===JSON.stringify(duplicateCandidates(p)),'Duplicate candidates do not match the scoped company list.');
  const m=r.metrics;requireThat(m&&m.apiCostUSD===0&&[m.elapsedMs,m.promptTokens,m.outputTokens,m.calls].every(n=>Number.isFinite(n)&&n>=0)&&m.calls<=14&&typeof m.resumed==='boolean'&&typeof m.usageIncomplete==='boolean','Invalid usage metrics.');
  return r;
}
