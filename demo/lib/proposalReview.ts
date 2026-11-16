// A recorded human judgment on a model proposal. The judgment is the record of a person reading
// the proposal against its sources. It changes nothing else: no approval, no message, no
// transaction edit flows from it, and the transaction revision does not move.
import {requireTx,txWriter,safeText,type TxDb,type Transaction,type ExecutionActor} from './transactions.ts';

export const proposalDecisions=['Reviewed','Changes needed','Dismissed'] as const;
export type ProposalDecision=typeof proposalDecisions[number];
export type ProposalReview={id:string;transactionId:string;packetId:string;inputHash:string;decision:ProposalDecision;note:string;by:string;at:string};
export type ProposalReviewInput={packetId:string;inputHash:string;packetRevision:number;decision:ProposalDecision;note:string};

/** What a decision requires before it can be recorded. Returns the problems, empty when recordable. */
export function reviewProblems(t:Transaction,p:{packetRevision:number;decision:ProposalDecision;note:string}):string[]{
  const out:string[]=[];
  if(!proposalDecisions.includes(p.decision))out.push('Choose Reviewed, Changes needed or Dismissed.');
  if(p.decision==='Changes needed'&&p.note.trim().length<5)out.push('Say what needs to change, so the next preparation can address it.');
  if(p.decision==='Reviewed'&&p.packetRevision!==t.revision)out.push('The transaction changed since this proposal was prepared. A stale proposal can be dismissed, not marked reviewed.');
  if(p.decision==='Changes needed'&&p.packetRevision!==t.revision)out.push('The transaction changed since this proposal was prepared. Dismiss it and prepare a fresh one.');
  return out;
}
export function recordProposalReview(d:TxDb,t:Transaction,a:ExecutionActor,p:ProposalReviewInput):TxDb{
  requireTx(txWriter(a),'Only a brokerage reviewer can record a judgment.');
  requireTx(/^[\w-]{8,120}$/.test(p.packetId)&&/^[0-9a-f]{64}$/.test(p.inputHash),'The judgment must name the exact proposal snapshot.');
  const problems=reviewProblems(t,p);requireTx(!problems.length,problems.join(' '));
  const note=p.decision==='Changes needed'?safeText(p.note,5,2000):safeText(p.note,0,2000);
  const review:ProposalReview={id:crypto.randomUUID(),transactionId:t.id,packetId:p.packetId,inputHash:p.inputHash,decision:p.decision,note,by:a.kind==='advisor'?a.name:'',at:new Date().toISOString()};
  // History is append-only; the newest judgment for a packet is the standing one.
  return {...d,proposalReviews:[review,...(d.proposalReviews||[])]};
}
export const latestJudgment=(reviews:ProposalReview[],packetId:string)=>reviews.find(r=>r.packetId===packetId);
