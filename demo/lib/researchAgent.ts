import {id,today,type Workspace,type Company} from './domain.ts';
import {ops,effectiveFirm,newWork,allEvidence} from './operating.ts';
import {companyFlow,flowInputVersion,publicWebsite} from './researchFlow.ts';
import {recordEvidence} from './research.ts';
import {agentVersion,sha256,packetBody,validatePacket,validateResult,type AgentPacket,type AgentResult} from './agentProtocol.ts';
export type ClaimReview='Supported'|'Unsupported'|'Unclear';
export type AgentAssignment={id:string;companyId:string;scopeId:string;createdAt:string;requestedBy:string;inputHash:string;recordVersion:string;workId:string;status:'Exported'|'In review'|'Reviewed'|'Cancelled';sources:{id:string;url:string;hash:string;retrievedAt:string}[];result?:AgentResult;review?:{by:string;at:string;seconds:number;decisions:Record<string,ClaimReview>;notes:string;acceptedEvidenceIds:string[]}};
export type AgentData={scopeId:string;runs:AgentAssignment[]};
export const agentRuns=(w:Workspace,c:Company)=>ops(w).agents?.runs.filter(r=>r.companyId===c.id)||[];
function scopeData(w:Workspace):AgentData{return ops(w).agents||{scopeId:id(),runs:[]};}
async function packetFor(w:Workspace,c:Company,run:Pick<AgentAssignment,'id'|'scopeId'|'createdAt'>):Promise<AgentPacket>{
  const f=effectiveFirm(w,c),sources:AgentPacket['sources']=[],seen=new Set<string>();
  for(const capture of companyFlow(w,c).runs){for(const s of capture.sources){
    if(seen.has(s.url)||sources.length>=6)continue;seen.add(s.url);
    if(s.text.length>6000)throw Error('A captured source exceeds the local model bound. Save a shorter exact excerpt.');
    sources.push({id:s.id,url:s.url,title:s.title,text:s.text,retrievedAt:s.retrievedAt,hash:await sha256(s.text)});
  }}
  const p:AgentPacket={version:1,playbook:agentVersion,id:run.id,scopeId:run.scopeId,createdAt:run.createdAt,inputHash:'',company:{id:c.id,name:c.name,website:publicWebsite(c.website),city:c.city,state:c.state},strategy:{industries:f.industries,states:f.states,strategy:f.strategy},peers:w.companies.filter(x=>!x.sample&&x.id!==c.id).slice(0,100).map(x=>({id:x.id,name:x.name,website:x.website,city:x.city,state:x.state})),sources};
  p.inputHash=await sha256(packetBody(p));return validatePacket(p);
}
async function recordVersion(w:Workspace,c:Company){return sha256(JSON.stringify({flow:flowInputVersion(w,c),facts:allEvidence(c),peers:w.companies.filter(x=>!x.sample).map(x=>[x.id,x.name,x.website,x.city,x.state])}));}
function replace(w:Workspace,run:AgentAssignment):Workspace{const o=ops(w),agents=o.agents!;return {...w,operating:{...o,agents:{...agents,runs:agents.runs.map(x=>x.id===run.id?run:x)}}};}
export async function createResearchAssignment(w:Workspace,c:Company,by:string):Promise<{workspace:Workspace;packet:AgentPacket}>{
  if(c.sample||!w.companies.some(x=>x.id===c.id))throw Error('Use a saved real company for the research pilot.');
  if(!by.trim())throw Error('Record the responsible operator.');
  if(companyFlow(w,c).runs[0]?.status==='Researching')throw Error('Finish or pause the website capture before exporting an assignment.');
  const agents=scopeData(w);if(agents.runs.length>=30)throw Error('The pilot assignment limit is 30. Export the review history before expanding storage.');
  const now=new Date().toISOString(),work=newWork(c,'Research dossier',by),base={id:id(),scopeId:agents.scopeId,createdAt:now};
  const packet=await packetFor(w,c,base);
  const run:AgentAssignment={...base,companyId:c.id,requestedBy:by,inputHash:packet.inputHash,recordVersion:await recordVersion(w,c),workId:work.id,status:'Exported',sources:packet.sources.map(({id,url,hash,retrievedAt})=>({id,url,hash,retrievedAt}))};
  const o=ops(w);return {packet,workspace:{...w,operating:{...o,agents:{...agents,runs:[run,...agents.runs]},work:[{...work,agentRunId:run.id,title:'Local research · '+c.name,instructions:'Run the exported assignment on your Mac, import the result, and review every proposed claim in Company → Research.',output:'',due:today()},...o.work]}}};
}
export async function assignmentPacket(w:Workspace,c:Company,runId:string){const run=agentRuns(w,c).find(x=>x.id===runId);if(!run||run.status!=='Exported')throw Error('Only an exported assignment can be downloaded.');const p=await packetFor(w,c,run);if(p.inputHash!==run.inputHash||await recordVersion(w,c)!==run.recordVersion)throw Error('Sources or company context changed. Cancel this assignment and export a new one.');return p;}
export async function importResearchResult(w:Workspace,c:Company,value:unknown):Promise<Workspace>{
  const run=agentRuns(w,c).find(x=>x.id===(value as AgentResult)?.id);if(!run||run.status!=='Exported')throw Error('Select an exported assignment in this company; results can only be imported once.');
  const p=await assignmentPacket(w,c,run.id),result=await validateResult(value,p);let next=replace(w,{...run,status:'In review',result});const o=ops(next);next={...next,operating:{...o,work:o.work.map(x=>x.id===run.workId?{...x,status:'In review',preparedAt:result.completedAt,output:'Local model proposals are ready. Review source excerpts in the company research workspace.'}:x)}};return next;
}
export async function researchAssignmentCurrent(w:Workspace,c:Company,run:AgentAssignment){if(run.status==='Reviewed'||run.status==='Cancelled')return true;try{const p=await packetFor(w,c,run);return p.inputHash===run.inputHash&&await recordVersion(w,c)===run.recordVersion;}catch{return false;}}
export async function reviewResearchResult(w:Workspace,c:Company,runId:string,input:{by:string;seconds:number;decisions:Record<string,ClaimReview>;notes:string;nextAction:string;due:string;confirmed:boolean}):Promise<Workspace>{
  const run=agentRuns(w,c).find(x=>x.id===runId);if(!run||run.status!=='In review'||!run.result)throw Error('Import a result before reviewing it.');
  if(!await researchAssignmentCurrent(w,c,run))throw Error('Sources or company context changed. Export a new assignment before accepting proposals.');
  const r=run.result,p=await packetFor(w,c,run);await validateResult(r,p);
  if(!input.confirmed||!input.by.trim()||!Number.isFinite(input.seconds)||input.seconds<0||input.seconds>86400||input.notes.length>3000||!input.nextAction.trim()||input.nextAction.length>1000||!/^\d{4}-\d{2}-\d{2}$/.test(input.due)||Number.isNaN(Date.parse(input.due)))throw Error('Confirm the source review, reviewer, review time, and next action/date.');
  if(Object.keys(input.decisions).length!==r.claims.length||r.claims.some(x=>!['Supported','Unsupported','Unclear'].includes(input.decisions[x.id])))throw Error('Classify every proposed claim before finishing the review.');
  let company=c;const before=new Set(c.evidence.map(x=>x.id));
  for(const claim of r.claims.filter(x=>input.decisions[x.id]==='Supported')){
    const s=p.sources.find(x=>x.id===claim.sourceId)!;
    company=recordEvidence(company,{field:claim.topic,value:claim.value,source:s.url,excerpt:claim.quote,kind:'reported',sourceType:'Company website',observedOn:''});
    const e=company.evidence.at(-1)!;company={...company,evidence:company.evidence.map(x=>x.id!==e.id?x:{...x,captureId:s.id,retrievedAt:s.retrievedAt,locator:`Local research ${run.id} · snapshot ${s.hash}`,checkedAt:new Date().toISOString(),checkedBy:input.by,reviewHistory:[{action:'Excerpt and interpretation reviewed',date:new Date().toISOString(),by:input.by,reason:'Human classified this local-model proposal as supported.'}]})};
  }
  company={...company,nextAction:input.nextAction.trim(),due:input.due};
  const now=new Date().toISOString(),review={by:input.by.trim(),at:now,seconds:input.seconds,decisions:input.decisions,notes:input.notes.trim(),acceptedEvidenceIds:company.evidence.filter(e=>!before.has(e.id)).map(e=>e.id)};
  let next=replace({...w,companies:w.companies.map(x=>x.id===c.id?company:x)},{...run,status:'Reviewed',review});const o=ops(next);
  next={...next,operating:{...o,work:o.work.map(x=>x.id===run.workId?{...x,status:'Done',reviewedBy:review.by,reviewedAt:now,nextAction:company.nextAction,nextDue:company.due,output:`Reviewed ${r.claims.length} proposals; accepted ${review.acceptedEvidenceIds.length}. Duplicate candidates and source comparisons require separate investigation.`}:x)}};return next;
}
export function cancelResearchAssignment(w:Workspace,c:Company,runId:string):Workspace{const run=agentRuns(w,c).find(x=>x.id===runId);if(!run||!['Exported','In review'].includes(run.status))throw Error('Only pending assignments can be cancelled.');let next=replace(w,{...run,status:'Cancelled'});const o=ops(next);return {...next,operating:{...o,work:o.work.map(x=>x.id===run.workId?{...x,status:'Done',output:'Assignment cancelled in the workspace. Stop any local worker separately; later imports are blocked.'}:x)}};}
export function agentEvaluation(w:Workspace){const runs=ops(w).agents?.runs||[],reviewed=runs.filter(r=>r.review&&r.result);const decisions=reviewed.flatMap(r=>Object.values(r.review!.decisions));const supported=decisions.filter(x=>x==='Supported').length,unsupported=decisions.filter(x=>x==='Unsupported').length;return {assignments:runs.length,humanReviewedTargets:new Set(reviewed.map(r=>r.companyId)).size,supported,unsupported,unclear:decisions.filter(x=>x==='Unclear').length,sourceAccuracy:supported+unsupported?supported/(supported+unsupported):null,reviewSeconds:reviewed.reduce((n,r)=>n+r.review!.seconds,0),apiCostUSD:runs.reduce((n,r)=>n+(r.result?.metrics.apiCostUSD||0),0),resumedRuns:runs.filter(r=>r.result?.metrics.resumed).length,usageIncomplete:runs.some(r=>r.result?.metrics.usageIncomplete)};}
