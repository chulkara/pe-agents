import type {SupabaseClient} from '@supabase/supabase-js';
import {transitionDecision,type Decision,type ProspectStatus,type SourcingDecisions} from './sourcing.ts';

export type SourcingDecisionInput={status:ProspectStatus;letter?:string;note?:string};
export type SourcingDecisionStore={
  mode:'local'|'cloud';
  list():Promise<SourcingDecisions>;
  decide(licenseNo:string,input:SourcingDecisionInput):Promise<Decision>;
};

export function localSourcingStore(actor:string):SourcingDecisionStore{
  let state:SourcingDecisions={decisions:{},doNotContact:[]};
  return {
    mode:'local',
    async list(){return structuredClone(state);},
    async decide(licenseNo,{status,letter,note}){
      const license=licenseNo.replace(/\s+/g,' ').trim().toUpperCase();
      if(!license||[...license].length>40)throw Error('Enter a license number between 1 and 40 characters.');
      if(note!==undefined&&[...note].length>400)throw Error('Keep the note to 400 characters or fewer.');
      state=transitionDecision(state,license,{
        status,updatedBy:actor,
        ...(status==='Letter approved'?{approvedBy:actor}:{}),
        ...(letter!==undefined?{letter}:{}),
        ...(note!==undefined?{note}:{}),
      });
      return {...state.decisions[license]};
    },
  };
}

type DecisionRow={
  license_no:string;
  status:ProspectStatus;
  letter:string|null;
  approved_by:string|null;
  approved_at:string|null;
  mailed_at:string|null;
  note:string|null;
  updated_by:string;
  updated_at:string;
};

function decisionFromRow(row:DecisionRow):Decision{
  return {
    status:row.status,
    letter:row.letter??undefined,
    approvedBy:row.approved_by??undefined,
    approvedAt:row.approved_at??undefined,
    mailedAt:row.mailed_at??undefined,
    note:row.note??undefined,
    updatedBy:row.updated_by,
    updatedAt:row.updated_at,
  };
}

export function cloudSourcingStore(client:SupabaseClient):SourcingDecisionStore{
  return {
    mode:'cloud',
    async list(){
      const {data,error}=await client.rpc('kalling_sourcing_list');
      if(error)throw Error(error.code==='PGRST202'?'Saved sourcing decisions are not available yet.':error.message);
      if(!Array.isArray(data))throw Error('Could not load saved sourcing decisions. Try again.');
      const rows:DecisionRow[]=data;
      return {
        decisions:Object.fromEntries(rows.map(row=>[row.license_no,decisionFromRow(row)])),
        doNotContact:rows.filter(row=>row.status==='Do not contact').map(row=>row.license_no),
      };
    },
    async decide(licenseNo,{status,letter,note}){
      const {data,error}=await client.rpc('kalling_sourcing_decide',{
        p_license:licenseNo,
        p_status:status,
        p_letter:letter??null,
        p_note:note??null,
      });
      if(error)throw Error(error.code==='PGRST202'?'Saved sourcing decisions are not available yet.':error.message);
      if(!data||data.status!==status)throw Error('Could not confirm the sourcing decision. Reload the list and try again.');
      return decisionFromRow(data);
    },
  };
}
