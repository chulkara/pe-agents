// What the owner's buyer card should say once a deal moves past an offer. The stored portal
// stage stops at Offer made; the execution transaction is the record of what happened next, so
// it decides the card for the selected buyer and, after a close, for everyone else.
import type {Buyer} from './portal.ts';
import type {Transaction} from './transactions.ts';

export type Standing={label:string;help:string;tone:'green'|'peri'|''};
type Tx=Pick<Transaction,'buyerLabel'|'state'|'createdAt'|'closes'>;

// The stored stage names are the firm's; owners see plain words.
const ownerLabel:Partial<Record<Buyer['stage'],string>>={'Under NDA':'Signed confidentiality agreement','Reviewing information':'Reviewing your information'};
const date=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

export function buyerStanding(buyer:Pick<Buyer,'name'|'stage'>,transactions:Tx[],stageHelp:string):Standing{
  const live=transactions.filter(t=>t.state!=='Abandoned').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const closed=live.find(t=>t.state==='Closed');
  if(closed){
    const when=closed.closes[0]?.date;
    if(closed.buyerLabel===buyer.name)return {label:'Bought the business',help:`They bought the business${when?`. The sale closed on ${date(when)}`:''}.`,tone:'green'};
    return {label:'Sale closed',help:'The business was sold to another buyer. Nothing further is shared with them.',tone:''};
  }
  const active=live.find(t=>t.buyerLabel===buyer.name);
  if(active)return {label:'Working toward closing',help:'You chose their offer. Your advisor is working through the letter of intent, diligence and closing with you below.',tone:'green'};
  const tone=buyer.stage==='Offer made'?'green':buyer.stage==='Under NDA'||buyer.stage==='Reviewing information'?'peri':'';
  return {label:ownerLabel[buyer.stage]??buyer.stage,help:stageHelp,tone};
}
