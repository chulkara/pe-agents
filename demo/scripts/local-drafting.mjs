// Drafting runners for the research computer: recast, teaser, memorandum sections and comparable
// sales commentary. Each uses the shared local-only runner (checkpoints, call budget, model checks).
// The model's output is validated against lib/drafting.ts; anything without a citation is dropped.
import {runLocalPlaybook} from './local-agent-runner.mjs';
import * as D from '../lib/drafting.ts';

/** Ask, validate, and on invalid output ask again with the error, up to two more times. */
async function ask(step,key,schema,messages,validate,onProgress,label){
  let last='';
  for(let attempt=0;attempt<3;attempt++){
    const msgs=last?[...messages,{role:'user',content:'Your previous answer was rejected: '+last+' Return only JSON that matches the schema and the rules.'}]:messages;
    try{onProgress({step:key,label,status:'Running'});return await step(`${key}:try${attempt}`,schema,msgs,validate);}
    catch(e){const m=String(e.message||e);if(!/invalid JSON|did not return|too short|needs at least|must cite|incomplete response/i.test(m)||attempt===2)throw Error(attempt===2?`The local model could not produce a valid ${label.toLowerCase()} after three tries: ${m}`:m);last=m;}
  }
}
const label=(event)=>event.label;

export function runLocalDraft(packet,options={}){
  const p0=D.validateDraftPacket(packet);
  const definition={version:p0.playbook,maxCalls:p0.kind==='recast'?90:p0.kind==='cim'?40:8,validatePacket:async p=>D.validateDraftPacket(p,p0.kind),validateResult:async r=>{if(!r||r.kind!==p0.kind)throw Error('Draft result does not match its assignment.');},
    execute:async(p,step,onProgress)=>{
      const progress=(e)=>onProgress({...e,label:label(e)});
      if(p.kind==='recast'){
        const docs=(p.data.documents||[]),groups=D.pageGroups(docs,p.budgetTokens),lines=[];let rejected=0;
        for(const [i,g] of groups.entries()){const pages=g.pages.map(x=>x.page);
          const out=await ask(step,`recast:${g.fileId}:${pages[0]}`,D.recastSchema,[{role:'system',content:D.recastSystem},{role:'user',content:JSON.stringify({document:g.name,years:p.data.years,pages:g.pages,responseSchema:D.recastSchema})}],v=>D.validateRecastLines(v,g),progress,`Reading ${g.name}, page ${pages[0]}${pages.length>1?' to '+pages[pages.length-1]:''} of ${docs.find(d=>d.fileId===g.fileId)?.pages.length||pages.length} (${i+1} of ${groups.length})`);
          lines.push(...out.lines);rejected+=out.rejected;}
        progress({step:'recast:check',label:'Checking figures against the tax return'});
        return {kind:'recast',lines,rejected,documents:docs.map(d=>({fileId:d.fileId,name:d.name,textHash:d.textHash}))};
      }
      if(p.kind==='teaser'){
        const t=await ask(step,'teaser',D.teaserSchema,[{role:'system',content:D.teaserSystem},{role:'user',content:JSON.stringify({facts:p.data.facts,goals:p.data.goals,responseSchema:D.teaserSchema})}],D.validateTeaser,progress,'Writing the teaser');
        return {kind:'teaser',teaser:t};
      }
      if(p.kind==='cim'){
        const sources=p.data.sources||[],keys=(p.data.sections||D.cimSections.filter(s=>s.by==='model').map(s=>s.key)),sections={};
        for(const [i,key] of keys.entries()){const title=D.cimSections.find(s=>s.key===key)?.title||key,src=D.sourcesFor(key,sources,p.budgetTokens);
          sections[key]=await ask(step,'cim:'+key,D.cimSchema,[{role:'system',content:D.cimSystem},{role:'user',content:JSON.stringify({section:title,business:{region:p.company.region,industry:p.company.industry},sources:src,responseSchema:D.cimSchema})}],v=>D.validateCimSection(v,src),progress,`Writing ${title.toLowerCase()} (${i+1} of ${keys.length})`);}
        return {kind:'cim',sections};
      }
      if(p.kind==='comps'){
        if(p.data.mode==='extract'){const page=p.data.page;const c=await ask(step,'comps:extract',D.compExtractSchema,[{role:'system',content:D.compExtractSystem},{role:'user',content:JSON.stringify({url:page.url,text:String(page.text).slice(0,Math.floor(p.budgetTokens*3)),responseSchema:D.compExtractSchema})}],v=>D.validateCompCandidates(v,page),progress,'Reading the page for sold businesses');return {kind:'comps',mode:'extract',candidates:c};}
        const ranked=p.data.ranked||[];
        if(ranked.length<3)return {kind:'comps',mode:'commentary',commentary:D.fewCompsMessage,cited:[],ranked};
        const ids=ranked.map(r=>r.comp.id);
        const out=await ask(step,'comps:commentary',D.compsSchema,[{role:'system',content:D.compsSystem},{role:'user',content:JSON.stringify({subject:p.data.subject,comparables:ranked.map(r=>({id:r.comp.id,businessType:r.comp.businessType,region:r.comp.region,year:r.comp.year,revenue:r.comp.revenue,sde:r.comp.sde,price:r.comp.price,multiple:r.multiple,similarity:r.score})),responseSchema:D.compsSchema})}],v=>D.validateCompsCommentary(v,ids),progress,'Comparing with sold businesses');
        return {kind:'comps',mode:'commentary',...out,ranked};
      }
      throw Error('Unsupported drafting assignment.');
    }};
  return runLocalPlaybook(p0,definition,options);
}
