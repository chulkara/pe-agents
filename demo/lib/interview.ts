// Text onboarding: the owner's business questions asked one at a time, like a conversation.
// Answers land in the same fields as the form, so the memorandum draft and the advisor see
// the same thing whichever way the owner answers.
import {answerQuestions,type OwnerAnswers} from './portal.ts';

export type AnswerKey=keyof Omit<OwnerAnswers,'portalId'|'updatedAt'>;
export type Answers=Record<AnswerKey,string>;
export type Turn={key:AnswerKey;prompt:string;hint:string;followUp:boolean;index:number;total:number};

/** Below this, one gentle follow-up asks for a little more. */
export const SHORT=40;

const openers:Record<AnswerKey,string>={
  history:'Let’s start at the beginning.',
  services:'Thanks. Next, the work itself.',
  strengths:'That helps a lot.',
  team:'Now your people.',
  afterSale:'Last one.',
};

/** The next thing to ask, or null when every question has a full enough answer. */
export function nextTurn(a:Answers,followedUp:ReadonlySet<AnswerKey>):Turn|null{
  const total=answerQuestions.length;
  for(const [index,[key,q,hint]] of answerQuestions.entries()){
    const v=(a[key]||'').trim();
    if(!v)return {key,prompt:`${openers[key]} ${q}`,hint,followUp:false,index,total};
    if(v.length<SHORT&&!followedUp.has(key))return {key,prompt:`Could you say a little more? ${hint}`,hint,followUp:true,index,total};
  }
  return null;
}

/** A follow-up reply adds to what the owner already said; a first answer replaces nothing. */
export function applyReply(a:Answers,t:Turn,reply:string):Answers{
  const r=reply.trim();if(!r)return a;
  const old=(a[t.key]||'').trim();
  return {...a,[t.key]:(t.followUp&&old?`${old} ${r}`:r).slice(0,3000)};
}

/** How many questions have an answer. */
export const answered=(a:Answers)=>answerQuestions.filter(([k])=>(a[k]||'').trim()).length;
