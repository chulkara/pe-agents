import {id,type Company,type Workspace} from './domain.ts';
import {ops} from './operating.ts';
import {companyFlow,flowInputVersion,packetIsCurrent,publicWebsite,type OutreachPacket} from './researchFlow.ts';
import {sha256} from './agentProtocol.ts';
import {assertBuyerProfile,outreachVersion,outreachPacketBody,validateOutreachPacket,validateOutreachResult,outreachBody,type BuyerProfile,type OutreachAssignmentPacket,type OutreachResult} from './outreachProtocol.ts';
export type OutreachAssignment={packet:OutreachAssignmentPacket;requestedBy:string;status:'Exported'|'Imported'|'Cancelled';draftId?:string};
export type OutreachAgentData={scopeId:string;profile?:BuyerProfile;assignments:OutreachAssignment[]};
export const outreachData=(w:Workspace):OutreachAgentData=>ops(w).outreachAgent||{scopeId:'',assignments:[]};
export function confirmBuyerProfile(w:Workspace,input:Pick<BuyerProfile,'senderName'|'firmName'|'background'|'objective'>,by:string,confirmed:boolean):Workspace{
 if(!confirmed||!by.trim())throw Error('Confirm that the buyer identity, background and acquisition objective are accurate.');
 const profile=assertBuyerProfile({id:id(),senderName:input.senderName.trim(),firmName:input.firmName.trim(),background:input.background.trim(),objective:input.objective.trim(),confirmedBy:by.trim(),confirmedAt:new Date().toISOString()});
 const o=ops(w),previous=outreachData(w);return {...w,operating:{...o,outreachAgent:{...previous,scopeId:previous.scopeId||o.agents?.scopeId||id(),profile}}};
}
export function outreachAssignmentCurrent(w:Workspace,c:Company,p:OutreachAssignmentPacket){
 const b=companyFlow(w,c).briefs[0],data=outreachData(w);
 return data.scopeId===p.scopeId&&c.id===p.company.id&&!c.sample&&!!b?.review&&b.id===p.briefId&&packetIsCurrent(w,c,b)&&flowInputVersion(w,c)===p.inputVersion&&data.profile?.id===p.buyer.id&&JSON.stringify(data.profile)===JSON.stringify(p.buyer);
}
export async function createOutreachAssignment(w:Workspace,c:Company,input:{recipientName:string;channel:'Email'|'Letter';notes:string;factIds:string[]},by:string):Promise<{workspace:Workspace;packet:OutreachAssignmentPacket}>{
 if(c.sample||!w.companies.some(x=>x.id===c.id)||!by.trim())throw Error('Use a saved real company and responsible operator.');
 const data=outreachData(w),buyer=assertBuyerProfile(data.profile!),b=companyFlow(w,c).briefs[0];
 if(!b?.review||!packetIsCurrent(w,c,b))throw Error('Review a current sourced call brief before requesting a draft.');
 if(data.assignments.length>=20)throw Error('The pilot supports 20 saved outreach assignments. Preserve the review history before expanding storage.');
 if(!input.factIds.length||input.factIds.length>8||new Set(input.factIds).size!==input.factIds.length)throw Error('Select one to eight reviewed source statements.');
 const facts=input.factIds.map(key=>{const f=b.facts.find(f=>f.id===key);if(!f)throw Error('Select facts from the current reviewed brief.');publicWebsite(f.source);return {...f};});
 const packet:OutreachAssignmentPacket={version:1,playbook:outreachVersion,id:id(),scopeId:data.scopeId,createdAt:new Date().toISOString(),inputHash:'',company:{id:c.id,name:c.name},briefId:b.id,inputVersion:b.inputVersion,buyer:{...buyer},recipientName:input.recipientName.trim(),channel:input.channel,notes:input.notes.trim(),facts};
 packet.inputHash=await sha256(outreachPacketBody(packet));await validateOutreachPacket(packet);
 const o=ops(w);return {packet,workspace:{...w,operating:{...o,outreachAgent:{...data,assignments:[{packet,requestedBy:by,status:'Exported'},...data.assignments]}}}};
}
export async function exportedOutreachPacket(w:Workspace,c:Company,key:string){const a=outreachData(w).assignments.find(a=>a.packet.id===key);if(!a||a.status!=='Exported'||!outreachAssignmentCurrent(w,c,a.packet))throw Error('This assignment is unavailable or its sources/buyer profile changed. Export a new one.');return validateOutreachPacket(a.packet);}
export async function importOutreachResult(w:Workspace,c:Company,value:unknown,by:string):Promise<Workspace>{
 if(!by.trim())throw Error('Record the operator importing the draft.');
 const data=outreachData(w),a=data.assignments.find(a=>a.packet.id===(value as OutreachResult)?.id),p=a?.packet;
 if(!a||!p||a.status!=='Exported'||!outreachAssignmentCurrent(w,c,p))throw Error('Use a pending outreach assignment for this company with a current buyer profile and reviewed brief.');
 const r=await validateOutreachResult(value,p),flow=companyFlow(w,c),used=new Set(r.content.paragraphs.flatMap(q=>q.referenceIds));
 const packet:OutreachPacket={id:id(),version:flow.drafts.length+1,companyId:c.id,briefId:p.briefId,inputVersion:p.inputVersion,createdAt:new Date().toISOString(),preparedBy:by,body:outreachBody(p,r.content),subject:r.content.subject,recipient:p.channel==='Email'?c.email||'':'',recipientBasis:'',channel:p.channel,templateVersion:outreachVersion,buyerProfileId:p.buyer.id,generation:{assignmentId:p.id,buyer:{...p.buyer},recipientName:p.recipientName,result:r},factIds:p.facts.filter(f=>used.has(f.id)).map(f=>f.id),facts:p.facts.filter(f=>used.has(f.id)).map(f=>({...f}))};
 const o=ops(w);return {...w,operating:{...o,researchFlows:[{...flow,drafts:[packet,...flow.drafts]},...(o.researchFlows||[]).filter(f=>f.companyId!==c.id)],outreachAgent:{...data,assignments:data.assignments.map(x=>x.packet.id===p.id?{...x,status:'Imported',draftId:packet.id}:x)}}};
}
export function cancelOutreachAssignment(w:Workspace,c:Company,key:string):Workspace{const data=outreachData(w),a=data.assignments.find(a=>a.packet.id===key);if(!a||a.status!=='Exported'||a.packet.company.id!==c.id)throw Error('Only this company’s pending assignment can be cancelled.');return {...w,operating:{...ops(w),outreachAgent:{...data,assignments:data.assignments.map(x=>x===a?{...x,status:'Cancelled'}:x)}}};}
