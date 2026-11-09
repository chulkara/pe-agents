import {id,today,type Workspace,type Company} from './domain.ts';
import {ops,type ExecutionTask} from './operating.ts';
import {activeDocuments,fingerprint} from './documents.ts';
import {executionSource,executionSourceCurrent,executionSnapshot,saveExecutionItem,type ExecutionSource} from './execution.ts';
import {dateValid,saveOperatingProject} from './transition.ts';
import {portfolioPackCurrent,portfolioPackText} from './portfolioReporting.ts';

export type Communication = {
  id:string;rootId:string;revision:number;companyId:string;dealId?:string;holdingId?:string;
  purpose:'Diligence'|'Lender'|'Advisor'|'Operating'|'Portfolio';recipient:string;email:string;recipientSource:string;
  subject:string;body:string;owner:string;followUp:string;due:string;sources:ExecutionSource[];
  taskId?:string;taskFingerprint?:string;portfolioPackId?:string;
  createdAt:string;createdBy:string;reason:string;
  reviews:{id:string;decision:'Approved'|'Changes requested';notes:string;by:string;at:string;hash:string;confirmed:boolean}[];
  copies:{at:string;by:string;hash:string}[];
  delivery?:{date:string;reference:string;by:string;at:string;hash:string};
  outcome?:{at:string;by:string;notes:string};
};
export type CommunicationInput=Pick<Communication,'purpose'|'recipient'|'email'|'recipientSource'|'subject'|'body'|'owner'|'followUp'|'due'|'sources'>;
export type DocumentMonitor={
  id:string;companyId:string;dealId?:string;holdingId?:string;label:string;familyId:string;owner:string;due:string;nextAction:string;critical:boolean;
  reviews:{at:string;by:string;notes:string;document:ExecutionSource;nextReview:string}[];
  history:{at:string;by:string;reason:string}[];followUpId?:string;followUpScope?:string;
};
export type ContinuityData={communications:Communication[];monitors:DocumentMonitor[]};
export const continuity=(w:Workspace):ContinuityData=>ops(w).continuity||{communications:[],monitors:[]};
const put=(w:Workspace,data:ContinuityData):Workspace=>({...w,operating:{...ops(w),continuity:data}});
function context(w:Workspace,companyId:string,dealId?:string,holdingId?:string){
  const c=w.companies.find(c=>c.id===companyId);if(!c)throw Error('Company not found.');
  if(dealId&&!w.deals.some(d=>d.id===dealId&&d.companyId===companyId))throw Error('Choose an opportunity belonging to this company.');
  if(holdingId&&!ops(w).holdings.some(h=>h.id===holdingId&&h.companyId===companyId&&(!dealId||h.dealId===dealId)))throw Error('Choose this company’s operating record.');
  return c;
}
function actorName(actor:string){if(!actor.trim())throw Error('A recorded operator is required.');return actor.trim();}
export const communicationHash=(m:Communication)=>fingerprint(JSON.stringify([m.revision,m.recipient,m.email,m.recipientSource,m.purpose,m.subject,m.body,m.owner,m.followUp,m.due,m.sources,m.taskId,m.taskFingerprint,m.portfolioPackId]));
export const latestCommunications=(w:Workspace,companyId?:string)=>continuity(w).communications.filter(m=>(!companyId||m.companyId===companyId)&&!continuity(w).communications.some(n=>n.rootId===m.rootId&&n.revision>m.revision));
export function communicationBlockers(w:Workspace,m:Communication){
  const c=w.companies.find(c=>c.id===m.companyId),out:string[]=[];
  if(!c)return ['Company no longer exists'];
  if(continuity(w).communications.some(n=>n.rootId===m.rootId&&n.revision>m.revision))out.push('A newer communication revision exists');
  if(m.sources.some(s=>!executionSourceCurrent(c,s)))out.push('A supporting document changed or was removed');
  if(m.taskId){const t=ops(w).execution.find(p=>p.dealId===m.dealId)?.tasks.find(t=>t.id===m.taskId);if(!t||fingerprint(JSON.stringify(executionSnapshot(t)))!==m.taskFingerprint)out.push('The linked diligence item changed; prepare a new revision');}
  if(m.portfolioPackId){const pack=(ops(w).portfolioPacks||[]).find(p=>p.id===m.portfolioPackId);if(!pack||!portfolioPackCurrent(w,pack)||pack.reviews[0]?.decision!=='Approved')out.push('The portfolio report needs a current approval');}
  return out;
}
export function communicationStatus(w:Workspace,m:Communication){if(m.delivery)return m.outcome?'Follow-up complete':'Recorded sent';if(communicationBlockers(w,m).length)return 'Needs recheck';return m.reviews[0]?.hash===communicationHash(m)?m.reviews[0].decision:'Draft';}
export function saveCommunication(w:Workspace,scope:{companyId:string;dealId?:string;holdingId?:string},input:CommunicationInput,oldId:string|undefined,reason:string,actor:string,dependency?:{taskId?:string;portfolioPackId?:string}):Workspace{
  const c=context(w,scope.companyId,scope.dealId,scope.holdingId),data=continuity(w),old=oldId?data.communications.find(m=>m.id===oldId&&m.companyId===c.id):undefined;
  if(oldId&&!old)throw Error('Communication not found in this company.');
  if(old&&!latestCommunications(w,c.id).some(m=>m.id===old.id))throw Error('Revise the latest communication version.');
  if(!['Diligence','Lender','Advisor','Operating','Portfolio'].includes(input.purpose))throw Error('Choose the communication purpose.');
  if(!input.recipient.trim()||!/^[^\s@,;<>]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(input.email)||/[\r\n]/.test(input.email+input.subject+input.recipient))throw Error('Record a recipient, a valid single email address, and a single-line subject.');
  if(input.recipientSource.trim().length<10)throw Error('Record how this recipient and address were verified.');
  if(!input.subject.trim()||input.body.trim().length<20||input.body.length>30000)throw Error('Record a subject and a message between 20 and 30,000 characters.');
  if(!input.owner.trim()||!input.followUp.trim()||!dateValid(input.due))throw Error('Assign the follow-up owner, next action, and deadline.');
  if(reason.trim().length<20)throw Error('Explain this revision in at least 20 characters.');
  if(input.sources.some(s=>!executionSourceCurrent(c,s)))throw Error('Choose current documents from this company.');
  const taskId=dependency&&'taskId' in dependency?dependency.taskId:old?.taskId,task=ops(w).execution.find(p=>p.dealId===scope.dealId)?.tasks.find(t=>t.id===taskId);
  if(taskId&&!task)throw Error('The linked diligence item does not belong to this opportunity.');
  const portfolioPackId=dependency&&'portfolioPackId' in dependency?dependency.portfolioPackId:old?.portfolioPackId;
  if(portfolioPackId&&!(ops(w).portfolioPacks||[]).some(p=>p.id===portfolioPackId&&p.snapshot.rows.some(r=>r.companyId===c.id)))throw Error('Choose a portfolio report containing this company.');
  const payload:CommunicationInput={purpose:input.purpose,recipient:input.recipient,recipientSource:input.recipientSource,email:input.email,subject:input.subject,body:input.body,owner:input.owner,followUp:input.followUp,due:input.due,sources:structuredClone(input.sources)};const key=id(),m:Communication={...payload,...scope,id:key,rootId:old?.rootId||key,revision:(old?.revision||0)+1,email:input.email.trim(),taskId,taskFingerprint:task?fingerprint(JSON.stringify(executionSnapshot(task))):undefined,portfolioPackId,createdAt:new Date().toISOString(),createdBy:actorName(actor),reason:reason.trim(),reviews:[],copies:[]};
  return put(w,{...data,communications:[m,...data.communications]});
}
export function reviewCommunication(w:Workspace,key:string,decision:'Approved'|'Changes requested',notes:string,confirmed:boolean,actor:string){
  const data=continuity(w),m=data.communications.find(m=>m.id===key);if(!m)throw Error('Communication not found.');
  if(m.delivery)throw Error('A sent record is preserved; create a new revision.');
  if(!['Approved','Changes requested'].includes(decision)||notes.trim().length<20)throw Error('Choose a decision and record at least 20 characters of review reasoning.');
  if(decision==='Approved'&&(!confirmed||communicationBlockers(w,m).length))throw Error('Check the exact recipient, message, disclosure permission, and current sources before approval.');
  const review={id:id(),decision,notes:notes.trim(),by:actorName(actor),at:new Date().toISOString(),hash:communicationHash(m),confirmed};
  return put(w,{...data,communications:data.communications.map(x=>x.id===key?{...x,reviews:[review,...x.reviews]}:x)});
}
export function approvedCommunicationText(w:Workspace,key:string){const m=continuity(w).communications.find(m=>m.id===key);if(!m||communicationStatus(w,m)!=='Approved')throw Error('Only the latest, currently approved message can be copied for delivery.');return `To: ${m.recipient} <${m.email}>\nSubject: ${m.subject}\n\n${m.body}`;}
export function recordCommunicationCopy(w:Workspace,key:string,actor:string){approvedCommunicationText(w,key);const data=continuity(w);return put(w,{...data,communications:data.communications.map(m=>m.id===key?{...m,copies:[{at:new Date().toISOString(),by:actorName(actor),hash:communicationHash(m)},...m.copies]}:m)});}
export function recordCommunicationDelivery(w:Workspace,key:string,date:string,reference:string,confirmed:boolean,actor:string){
  approvedCommunicationText(w,key);if(!confirmed||!dateValid(date)||date>today()||reference.trim().length<10)throw Error('Confirm external delivery, its actual date, and a sent-mail reference or receipt.');
  const data=continuity(w);return put(w,{...data,communications:data.communications.map(m=>m.id===key?{...m,delivery:{date,reference:reference.trim(),by:actorName(actor),at:new Date().toISOString(),hash:communicationHash(m)}}:m)});
}
export function completeCommunicationFollowUp(w:Workspace,key:string,notes:string,actor:string){
  const data=continuity(w),m=data.communications.find(m=>m.id===key);if(!m?.delivery)throw Error('Record the external delivery before resolving its follow-up.');if(m.outcome)throw Error('This follow-up is already complete.');if(notes.trim().length<20)throw Error('Record the response, outcome, or reason for completing the follow-up.');
  return put(w,{...data,communications:data.communications.map(x=>x.id===key?{...x,outcome:{at:new Date().toISOString(),by:actorName(actor),notes:notes.trim()}}:x)});
}
export function connectionQueue(w:Workspace,asOf=today()){
  const items:{id:string;companyId:string;company:string;title:string;owner:string;due:string;nextAction:string;page:string;focus:{holdingId?:string;dealId?:string;view:string;communicationId?:string}}[]=[];
  const target=(companyId:string,dealId:string|undefined,view:string,holdingId?:string)=>{const h=ops(w).holdings.find(h=>holdingId?h.id===holdingId:h.companyId===companyId&&(!dealId||h.dealId===dealId));return h?{page:'Portfolio',focus:{holdingId:h.id,view}}:{page:'Execution',focus:{dealId,view}};};
  for(const m of continuity(w).monitors){const state=monitorState(w,m,asOf);if(state.status!=='Current')items.push({id:m.id,companyId:m.companyId,company:w.companies.find(c=>c.id===m.companyId)?.name||'Unknown company',title:state.status+': '+m.label,owner:m.owner,due:m.due,nextAction:m.nextAction,...target(m.companyId,m.dealId,'Documents',m.holdingId)});}
  for(const m of latestCommunications(w)){if(m.outcome||m.delivery&&m.due>asOf)continue;const status=communicationStatus(w,m);items.push({id:m.id,companyId:m.companyId,company:w.companies.find(c=>c.id===m.companyId)?.name||'Unknown company',title:(m.delivery?'Follow up':status==='Approved'?'Approved handoff':status==='Needs recheck'?'Recheck message':'Review message')+': '+m.subject,owner:m.owner,due:m.due,nextAction:m.delivery?m.followUp:status==='Approved'?'Deliver the approved message in your email tool, then record its reference.':'Check the current recipient, wording, sources, and reviewer feedback.',...target(m.companyId,m.dealId,'Communications',m.holdingId),focus:{...target(m.companyId,m.dealId,'Communications',m.holdingId).focus,communicationId:m.id}});}
  return items.sort((a,b)=>a.due.localeCompare(b.due)||a.company.localeCompare(b.company));
}
export function taskCommunicationInput(w:Workspace,dealId:string,taskId:string):CommunicationInput{
  const t=ops(w).execution.find(p=>p.dealId===dealId)?.tasks.find(t=>t.id===taskId);if(!t)throw Error('Diligence item not found.');
  return {purpose:t.kind==='Lender request'?'Lender':t.kind==='Advisor task'?'Advisor':'Diligence',recipient:t.requestedFrom||'',email:'',recipientSource:'',subject:t.title,body:`Hello,\n\nCould you help with the following request?\n\n${t.nextAction||t.title}\n\nRequested by ${t.due}. Please let us know if you need context or a different timeline.\n\nThank you,\n${t.owner}`,owner:t.owner,followUp:'Confirm receipt and follow up on: '+t.title,due:t.due,sources:structuredClone(t.sources||[])};
}
export function portfolioCommunicationInput(w:Workspace,packId:string):CommunicationInput{const pack=(ops(w).portfolioPacks||[]).find(p=>p.id===packId);if(!pack)throw Error('Portfolio report not found.');return {purpose:'Portfolio',recipient:'',email:'',recipientSource:'',subject:`${w.firm.name} — ${pack.period} portfolio report`,body:portfolioPackText(pack),owner:w.firm.operator,followUp:'Confirm receipt and resolve reporting questions.',due:today(),sources:[]};}

export function monitorState(w:Workspace,m:DocumentMonitor,asOf=today()){
  const c=w.companies.find(c=>c.id===m.companyId),doc=c&&activeDocuments(c).find(d=>(d.familyId||d.id)===m.familyId),review=m.reviews[0];
  if(!doc)return {status:'Missing',doc,reason:'No current document is linked to this requirement.'};
  if(!review)return {status:'Unreviewed',doc,reason:'The current document has not been checked.'};
  if(doc.id!==review.document.documentId||(doc.version||1)!==review.document.version||fingerprint(doc.text)!==review.document.hash)return {status:'Changed',doc,reason:'A replacement or changed document needs review.'};
  if(m.due<=asOf)return {status:'Review due',doc,reason:'The next review date has arrived.'};
  return {status:'Current',doc,reason:'Reviewed against the current document version.'};
}
export function monitorCloseBlockers(w:Workspace,companyId:string,dealId:string){return continuity(w).monitors.filter(m=>m.companyId===companyId&&m.dealId===dealId&&m.critical&&monitorState(w,m).status!=='Current').map(m=>'Document check: '+m.label);}
export function saveDocumentMonitor(w:Workspace,scope:{companyId:string;dealId?:string;holdingId?:string},input:Pick<DocumentMonitor,'label'|'familyId'|'owner'|'due'|'nextAction'|'critical'>,key:string|undefined,reason:string,actor:string){
  const c=context(w,scope.companyId,scope.dealId,scope.holdingId),data=continuity(w),old=key?data.monitors.find(m=>m.id===key&&m.companyId===c.id):undefined;
  if(key&&!old)throw Error('Document requirement not found.');if(!input.label.trim()||!input.owner.trim()||!input.nextAction.trim()||!dateValid(input.due)||reason.trim().length<20)throw Error('Record a requirement, owner, review deadline, next step, and a reason of at least 20 characters.');
  if(input.familyId&&!activeDocuments(c).some(d=>(d.familyId||d.id)===input.familyId))throw Error('Choose a current document family from this company.');
  const m:DocumentMonitor={...old,...structuredClone(input),...scope,id:old?.id||id(),reviews:old?.reviews||[],history:[{at:new Date().toISOString(),by:actorName(actor),reason:reason.trim()},...(old?.history||[])]};
  return put(w,{...data,monitors:old?data.monitors.map(x=>x.id===key?m:x):[m,...data.monitors]});
}
export function reviewDocumentMonitor(w:Workspace,key:string,documentId:string,nextReview:string,notes:string,confirmed:boolean,actor:string){
  const data=continuity(w),m=data.monitors.find(m=>m.id===key);if(!m)throw Error('Document requirement not found.');const c=context(w,m.companyId,m.dealId,m.holdingId),doc=activeDocuments(c).find(d=>d.id===documentId);
  if(!doc||(m.familyId&&(doc.familyId||doc.id)!==m.familyId))throw Error('Choose the current version of the required document.');
  if(!confirmed||!dateValid(nextReview)||nextReview<=today()||notes.trim().length<20)throw Error('Check the document, explain the findings, and set a future review date.');
  const review={at:new Date().toISOString(),by:actorName(actor),notes:notes.trim(),document:executionSource(c,doc.id),nextReview};
  return put(w,{...data,monitors:data.monitors.map(x=>x.id===key?{...x,familyId:doc.familyId||doc.id,due:nextReview,reviews:[review,...x.reviews]}:x)});
}
export function coordinateDocumentMonitor(w:Workspace,key:string,actor:string):Workspace{
  const m=continuity(w).monitors.find(m=>m.id===key);if(!m)throw Error('Document requirement not found.');
  const h=ops(w).holdings.find(h=>h.companyId===m.companyId&&(!m.dealId||h.dealId===m.dealId));let next:Workspace,taskId:string,scope:string;
  if(h){const old=h.plan.find(t=>t.id===m.followUpId&&t.status!=='Done');if(old)throw Error('An open operating follow-up already exists.');next=saveOperatingProject(w,h.id,undefined,{title:'Review '+m.label,category:'Financial reporting',owner:m.owner,due:m.due,status:'Open',nextAction:m.nextAction,evidence:'',notes:monitorState(w,m).reason,outcome:'Resolve the document exception.',measure:'Current document checked and findings recorded.',agreement:'Proposed',findingIds:[]},'Created from document monitoring: '+m.label);taskId=ops(next).holdings.find(x=>x.id===h.id)!.plan.at(-1)!.id;scope=h.id;}
  else{const plan=ops(w).execution.find(p=>p.dealId===m.dealId);if(!plan)throw Error('Create this opportunity’s execution workspace first.');if(plan.tasks.some(t=>t.id===m.followUpId&&t.status!=='Done'))throw Error('An open diligence follow-up already exists.');next=saveExecutionItem(w,plan.dealId,undefined,{title:'Review '+m.label,kind:'Document request',category:'Document monitoring',owner:m.owner,due:m.due,status:'Open',nextAction:m.nextAction,requestedFrom:'',advisorId:'',priority:'High',critical:m.critical,dependsOn:[],evidence:'',notes:monitorState(w,m).reason,requiresApproval:false,approver:'',sources:[]},'Created from document monitoring: '+m.label);taskId=ops(next).execution.find(p=>p.id===plan.id)!.tasks.at(-1)!.id;scope=plan.dealId;}
  const data=continuity(next);return put(next,{...data,monitors:data.monitors.map(x=>x.id===key?{...x,followUpId:taskId,followUpScope:scope,history:[{at:new Date().toISOString(),by:actorName(actor),reason:'Assigned a follow-up from the document exception.'},...x.history]}:x)});
}
