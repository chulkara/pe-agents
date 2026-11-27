// The owner's home: where the sale is, like a package tracker, and the one thing to do next.
// Everything is derived from the portal bundle and the transaction record; nothing is stored.
import {currentLetter,requestOrder,unread,type PortalBundle} from './portal.ts';
import {answered} from './interview.ts';
import type {Transaction} from './transactions.ts';

export const saleStages=[
  {key:'ready',label:'Getting ready',now:'We are gathering your records and preparing how buyers will see the business.'},
  {key:'buyers',label:'Meeting buyers',now:'Approved buyers are learning about the business. Your name stays private until you agree.'},
  {key:'offers',label:'Choosing an offer',now:'You have an offer to consider. Your advisor will walk you through each one before you decide.'},
  {key:'closing',label:'Closing',now:'You chose a buyer. Lawyers, lenders and both sides are working through the checklist to close.'},
  {key:'sold',label:'Sold',now:'The sale has closed.'},
] as const;
export type SaleStage=typeof saleStages[number]['key'];
type Tx=Pick<Transaction,'state'>;

export function saleStage(b:Pick<PortalBundle,'buyers'>,txs:Tx[]):number{
  const live=txs.filter(t=>t.state!=='Abandoned');
  if(live.some(t=>t.state==='Closed'))return 4;
  if(live.length)return 3;
  const stages=b.buyers.map(x=>x.stage);
  if(stages.includes('Offer made'))return 2;
  if(stages.some(s=>s!=='Not proceeding'))return 1;
  return 0;
}

export type NextAction={title:string;why:string;button:string;target:string;yours:boolean};

/** The single most useful thing for the owner to do now, in plain words. */
export function nextAction(b:PortalBundle,txs:Tx[]=[]):NextAction{
  const first=b.portal.help.name.split(' ')[0]||b.portal.firmName;
  const letter=currentLetter(b.letters);
  if(letter&&(letter.status==='Ready to sign'||letter.status==='Viewed by owner'))
    return {title:'Sign your engagement letter',why:'It sets out how '+b.portal.firmName+' works for you and what it costs. Your records list opens once it is signed by both of us.',button:'Read and sign',target:'portal-letter',yours:true};
  if(letter&&letter.status==='Signed by owner')
    return {title:'You signed your engagement letter',why:first+' will countersign it next. Then your list of records to send opens here, and you will get a message.',button:'Message '+first,target:'portal-messages',yours:false};
  if(b.portal.requestsHidden)
    return {title:'Nothing needed from you right now',why:first+' is preparing your engagement letter. It will appear here to read and sign.',button:'Message '+first,target:'portal-messages',yours:false};
  const stage=saleStage(b,txs),n=unread(b);
  const messages={title:'Read '+(n===1?'a new message':n+' new messages')+' from '+first,why:'Reply here, or call if it is easier.',button:'Open messages',target:'portal-messages',yours:true};
  if(b.reviews.some(r=>r.status==='Waiting for owner'))
    return {title:'Review your memorandum',why:'This is how buyers will first see the business. Approve it or say what to change.',button:'Review it',target:'portal-memo',yours:true};
  const reqs=[...b.requests].sort((x,y)=>requestOrder(x)-requestOrder(y));
  const fix=reqs.find(r=>r.status==='Needs changes');
  if(fix)return {title:'Update '+lower(fix.title),why:fix.reviewNote||first+' asked for a change before this can be used.',button:'See what to change',target:'req-'+fix.id,yours:true};
  if(n)return messages;
  const open=reqs.find(r=>r.status==='Open'||r.status==='In progress');
  if(open)return {title:(open.status==='In progress'?'Finish sending ':'Send your ')+lower(open.title),why:open.why||open.needed,button:open.status==='In progress'?'Finish it':'Upload it',target:'req-'+open.id,yours:true};
  const left=5-answered({history:'',services:'',strengths:'',team:'',afterSale:'',...(b.answers||{})});
  // The business story is for buyers to read, so it stops being asked for once an offer is in.
  if(left>0&&stage<2)return {title:left===1?'Answer one last question about your business':'Answer '+left+' questions about your business',why:'Buyers want the story in your words. It takes about ten minutes, by talking or typing.',button:'Start',target:'portal-about',yours:true};
  const step=b.steps.filter(s=>s.owner==='You'&&!s.done).sort((x,y)=>(x.due||'9').localeCompare(y.due||'9'))[0];
  if(step)return {title:step.text,why:step.due?'By '+new Date(step.due+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})+'.':'When you can.',button:'See next steps',target:'portal-steps',yours:true};
  // After closing, anything still owed above comes first; otherwise the home says the sale is done.
  if(stage===4)return {title:'Your sale has closed',why:'Your records stay here for you. '+first+' will message you about anything still to settle after closing, such as a seller note or an earnout.',button:'Message '+first,target:'portal-messages',yours:false};
  return {title:'Nothing needed from you right now',why:first+' is working on the next step. You will see it here, and get a message, when there is something for you.',button:'Message '+first,target:'portal-messages',yours:false};
}
const lower=(t:string)=>/^[A-Z][a-z]/.test(t)?t.charAt(0).toLowerCase()+t.slice(1):t;
