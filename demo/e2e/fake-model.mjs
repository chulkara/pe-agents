// A scripted stand-in for local Qwen used by tests. It answers each drafting playbook with JSON
// built from the text it is given, so citations point at real excerpts, plus a few deliberate
// mistakes the application must catch: one figure with a wrong amount, a city name in the teaser,
// and one memorandum paragraph with no source.
import {recastSystem,teaserSystem,cimSystem,compsSystem,compExtractSystem} from '../lib/drafting.ts';

const rules=[
  [/Revenue, service and installation/,'revenue'],[/Cost of goods sold \(equipment and parts\)/,'cogs'],[/Gross profit/,'grossProfit'],[/Net income before tax/,'netIncome'],
  [/Depreciation/,'depreciation'],[/Interest expense/,'interest'],[/Officer salary, Pat Russo/,'ownerSalary'],[/Officer health insurance/,'ownerHealth'],
  [/Payroll, Maria Russo \(spouse, not active in business\)/,'addBack','family payroll','The owner’s spouse is paid but does not work in the business.'],
  [/Personal travel charged to business/,'addBack','personal expense','Personal travel paid by the business.'],
  [/Ordinary business income/,'taxIncome'],[/Compensation of officers/,'taxOfficerComp'],
];
function recast(input){
  const lines=[];
  for(const p of input.pages){let year=Number((p.text.match(/(?:December|Tax year)\s+(20\d\d)/)||[])[1])||0;
    // Tax summaries list several years; track the year as we read down the page.
    const parts=p.text.split(/(?=Tax year 20\d\d)/);
    for(const part of parts){year=Number((part.match(/(?:December|Tax year)\s+(20\d\d)/)||[])[1])||year;
      for(const [re,field,category,reason] of rules){const m=part.match(new RegExp(re.source+'\\s+([\\d,]+)'));if(!m)continue;
        lines.push({year,field,label:m[0].replace(/\s+[\d,]+$/,''),amount:Number(m[1].replace(/,/g,'')),page:p.page,excerpt:parts.length>1?part.slice(0,m.index+m[0].length).trim():m[0],...(category?{category,reason}:{})});}
      const legal=part.match(/Legal and professional fees\s+([\d,]+) \(40,000 one-time settlement\)/);
      if(legal)lines.push({year,field:'addBack',label:'Legal and professional fees',amount:40000,page:p.page,excerpt:legal[0],category:'one-time legal',reason:'One-time lawsuit settlement included in legal fees.'});
    }
    // A deliberate mistake: an amount that does not appear in its excerpt. The app must drop it.
    if(/Net income before tax/.test(p.text))lines.push({year,field:'revenue',label:'Revenue',amount:9999999,page:p.page,excerpt:'Revenue, service and installation'});
  }
  return {lines};
}
function teaser(input){const f=input.facts||{};
  return {headline:`${f.region||'New Jersey'} residential HVAC service company with ${f.agreements||'recurring'} maintenance agreements`,
    summary:`An established residential HVAC service and replacement company based near Edison with a trained team of ${f.technicians||'four'} technicians. About ${f.recurringPct||50}% of revenue comes from service and maintenance work, and the owner is ready to help a buyer through the transition.`,
    highlights:[`${f.agreements||'Hundreds of'} active maintenance agreements`,`${f.technicians||'Four'} experienced field technicians`,`In business for ${f.years||'over ten'} years`],
    growth:['Add commercial maintenance contracts','Raise agreement prices toward market rates'],reason:f.reason||'Owner is retiring'};}
function cim(input){const src=input.sources||[],ids=src.map(s=>s.id);
  if(/Growth/i.test(input.section))return {paragraphs:[{text:'Kalling sees room to grow commercial maintenance work and to add a second dispatcher during peak season.',sources:[]}]};
  const first=src.find(s=>!s.id.startsWith('F'))||src[0];
  return {paragraphs:[{text:`${input.section}: ${(first?.text||'The business provides HVAC services.').replace(/\s+/g,' ').slice(0,220)}`,sources:ids.slice(0,2)}]};}
function comps(input){const c=input.comparables||[];return {commentary:`The closest sales sold for ${c.slice(0,2).map(x=>x.multiple+' times earnings').join(' and ')}. This business is similar in size and mix.`,cited:c.slice(0,2).map(x=>x.id)};}
function extract(input){const out=[];for(const m of String(input.text).matchAll(/([A-Za-z ]*HVAC[A-Za-z ]*) in ([A-Za-z ]+), (NJ|NY) sold in (20\d\d) for \$([\d,]+) on \$([\d,]+) revenue and \$([\d,]+) SDE/g))out.push({businessType:m[1].trim(),region:m[2].trim(),state:m[3],year:Number(m[4]),price:Number(m[5].replace(/,/g,'')),revenue:Number(m[6].replace(/,/g,'')),sde:Number(m[7].replace(/,/g,'')),excerpt:m[0]});return {candidates:out};}

/** Returns an Ollama /api/chat reply for a request body, or null if it is not a drafting call. */
export function scriptedReply(body){
  const sys=body.messages?.[0]?.content||'',input=JSON.parse(body.messages?.[1]?.content||'{}');
  const content=sys===recastSystem?recast(input):sys===teaserSystem?teaser(input):sys===cimSystem?cim(input):sys===compsSystem?comps(input):sys===compExtractSystem?extract(input):null;
  return content?{done:true,done_reason:'stop',prompt_eval_count:500,eval_count:200,message:{content:JSON.stringify(content)}}:null;
}
export function fakeRequest(){return async(path,body)=>{
  if(path==='/api/status')return {cloud:{disabled:true,source:'config'}};
  if(path==='/api/tags')return {models:['qwen3:4b','qwen3:8b','qwen3:14b'].map(name=>({name,size:2500000000,digest:'a'.repeat(64)}))};
  if(path==='/api/show')return {modelfile:'FROM /local/weights'};
  const r=scriptedReply(body);if(!r)throw Error('Unexpected prompt');return r;};}
