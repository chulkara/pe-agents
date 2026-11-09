import {id,today,type Workspace} from './domain.ts';
import {fingerprint,makeDocument,addDocument,activeDocuments} from './documents.ts';
import {ops,latestReports} from './operating.ts';
import {dateValid,saveOperatingReport,emptyOperatingMetrics} from './transition.ts';

export const accountClasses=['Revenue','COGS','Operating expense','D&A','Interest','Tax','Cash','Exclude'] as const;
export type AccountClass=typeof accountClasses[number];
export type AccountMapping={account:string;classification:AccountClass|'';invert:boolean;reason:string};
export type AccountingRow={period:string;account:string;amount:number;rawAmount:string;line:number;column:string};
export type AccountingConfig={layout:'Long'|'Wide';accountColumn:string;periodColumn:string;amountColumn:string;months:{column:string;period:string}[]};
export type AccountingPeriod={period:string;revenue:number;cogs:number;opex:number;da:number;interest:number;tax:number;cash:number;ebitda:number;lines:number[];issues:string[]};
export type AccountingControl={period:string;revenue:number|null;ebitda:number|null;cash:number|null;source:string;fullMonth:boolean};
export type AccountingImport={id:string;holdingId:string;companyId:string;documentId?:string;filename:string;hash:string;rawHash:string;sourceSystem:string;basis:'Accrual'|'Cash';currency:'USD';createdAt:string;by:string;reason:string;config:AccountingConfig;rows:AccountingRow[];mappings:AccountMapping[];periods:AccountingPeriod[];controls:AccountingControl[];reportIds:string[]};
export type AccountingData={imports:AccountingImport[]};
export const accounting=(w:Workspace):AccountingData=>ops(w).accounting||{imports:[]};
export function csvTable(text:string){
  if(text.length>2_000_000)throw Error('Use a CSV smaller than 2 MB.');
  const rows:string[][]=[],rowLines:number[]=[];let row:string[]=[],value='',quoted=false,closed=false,physicalLine=1,startLine=1;const raw=text.replace(/^\uFEFF/,'');
  for(let i=0;i<=raw.length;i++){const ch=raw[i];if(quoted){if(ch==='"'){if(raw[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else if(ch===undefined)throw Error('An opening CSV quote has no closing quote.');else{value+=ch;if(ch==='\n'||ch==='\r'&&raw[i+1]!=='\n')physicalLine++;}continue;}
    if(ch==='"'){if(value||closed)throw Error('A CSV quote must start a cell.');quoted=true;continue;}
    if(ch===','||ch==='\n'||ch==='\r'||ch===undefined){row.push(value.trim());value='';closed=false;if(ch!==','){if(row.some(v=>v!=='')){rows.push(row);rowLines.push(startLine);}row=[];if(ch!==undefined)physicalLine++;startLine=physicalLine;if(ch==='\r'&&raw[i+1]==='\n')i++;}continue;}
    if(closed&&ch.trim())throw Error('Unexpected characters after a closing CSV quote.');value+=ch;
  }
  if(rows.length<2)throw Error('The CSV needs a header and at least one account row.');if(rows.length>10001)throw Error('Use at most 10,000 account rows per import.');
  const headers=rows.shift()!;rowLines.shift();if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error('Each CSV column needs a distinct, nonempty heading.');
  if(rows.some(r=>r.length!==headers.length))throw Error('CSV rows have inconsistent column counts. Quote amounts containing commas.');
  return {headers,rows,rowLines};
}
export function accountingAmount(text:string){let s=text.trim();if(!s)throw Error('A blank accounting amount is unknown; enter an explicit zero if appropriate.');let negative=false;if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}s=s.replace(/^\$/,'').trim();if(s.includes(',')&&!/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(s))throw Error('Use US thousands separators, for example 1,234.50.');s=s.replace(/,/g,'');if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)||negative&&/^[+-]/.test(s))throw Error('Use a plain USD amount; percentages, dash placeholders, and mixed signs are not amounts.');const n=Number(s)*(negative?-1:1);if(!Number.isFinite(n)||Math.abs(n)>1e13)throw Error('Accounting amount is outside the supported range.');return n;}
export function parseAccounting(text:string,config:AccountingConfig):AccountingRow[]{
  const {headers,rows,rowLines}=csvTable(text),currencyIndex=headers.findIndex(h=>/^currency(?: code)?$/i.test(h));if(currencyIndex>=0&&rows.some(r=>r[currencyIndex].toUpperCase()!=='USD'))throw Error('Only USD source rows are supported; separate or translate other currencies before importing.');if(config.layout==='Long'&&/ytd|year.to.date|cumulative|budget|forecast/i.test(config.amountColumn)||config.layout==='Wide'&&config.months.some(m=>/ytd|year.to.date|cumulative|budget|forecast/i.test(m.column)))throw Error('Choose monthly actual columns, not cumulative, budget, or forecast amounts.');const index=(key:string)=>{const at=headers.indexOf(key);if(at<0)throw Error('Choose a valid CSV column for '+key);return at;},account=index(config.accountColumn),out:AccountingRow[]=[];
  const month=(period:string)=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('Use YYYY-MM for every calendar month, not YTD or cumulative periods.');return period;};
  if(config.layout==='Long'){const p=index(config.periodColumn),a=index(config.amountColumn);if(new Set([account,p,a]).size!==3)throw Error('Account, period, and amount require separate columns.');rows.forEach((r,i)=>out.push({period:month(r[p]),account:r[account],amount:accountingAmount(r[a]),rawAmount:r[a],line:rowLines[i],column:config.amountColumn}));}
  else if(config.layout==='Wide'){if(!config.months.length||config.months.length>24)throw Error('Map 1–24 monthly columns.');if(new Set(config.months.map(m=>m.column)).size!==config.months.length||new Set(config.months.map(m=>m.period)).size!==config.months.length)throw Error('Each month and monthly column must be mapped once.');for(const m of config.months){const a=index(m.column);if(a===account)throw Error('The account column cannot also be a monthly amount.');month(m.period);rows.forEach((r,i)=>out.push({period:m.period,account:r[account],amount:accountingAmount(r[a]),rawAmount:r[a],line:rowLines[i],column:m.column}));}}
  else throw Error('Choose a supported accounting layout.');
  if(out.some(r=>!r.account.trim()))throw Error('Every row needs an account name or code.');
  const keys=new Set<string>();for(const r of out){const key=r.period+'\u0000'+r.account;if(keys.has(key))throw Error(`Duplicate monthly balance for ${r.account} in ${r.period}; remove duplicate or subtotal rows before import.`);keys.add(key);}
  if(out.length>24000)throw Error('Use at most 24,000 monthly account balances.');return out;
}
export function suggestAccountMappings(w:Workspace,companyId:string,rows:AccountingRow[]):AccountMapping[]{const previous=accounting(w).imports.find(i=>i.companyId===companyId)?.mappings||[];return [...new Set(rows.map(r=>r.account))].map(account=>structuredClone(previous.find(m=>m.account===account)||{account,classification:'',invert:false,reason:''}));}
export function reconcileAccounting(rows:AccountingRow[],mappings:AccountMapping[]):AccountingPeriod[]{
  if(new Set(mappings.map(m=>m.account)).size!==mappings.length)throw Error('Map each account once.');
  const out:AccountingPeriod[]=[];for(const period of [...new Set(rows.map(r=>r.period))].sort()){const data=rows.filter(r=>r.period===period),p:AccountingPeriod={period,revenue:0,cogs:0,opex:0,da:0,interest:0,tax:0,cash:0,ebitda:0,lines:[],issues:[]},seen=new Set<string>();
    for(const row of data){const m=mappings.find(m=>m.account===row.account);if(!m||!accountClasses.includes(m.classification as AccountClass)){p.issues.push('Map account: '+row.account);continue;}if(m.classification==='Exclude'){if(m.reason.trim().length<10)p.issues.push('Explain why '+row.account+' is excluded.');continue;}
      if(/^(?:total\b|net income\b|gross profit\b|operating income\b|ebitda\b)|\btotal$/i.test(row.account))p.issues.push('Subtotal or calculated line must be excluded: '+row.account);
      const key=({'Revenue':'revenue','COGS':'cogs','Operating expense':'opex','D&A':'da','Interest':'interest','Tax':'tax','Cash':'cash'} as const)[m.classification as Exclude<AccountClass,'Exclude'>];p[key]+=row.amount*(m.invert?-1:1);p.lines.push(row.line);seen.add(m.classification);
    }
    for(const name of ['Revenue','COGS','Operating expense','Cash'])if(!seen.has(name))p.issues.push('Missing '+name+' accounts; include an explicit zero account where appropriate.');
    if(p.revenue<0)p.issues.push('Mapped revenue is negative; check credit/debit signs.');p.ebitda=p.revenue-p.cogs-p.opex;out.push(p);
  }return out;
}
export type AccountingCommit={filename:string;text:string;config:AccountingConfig;mappings:AccountMapping[];sourceSystem:string;basis:'Accrual'|'Cash';currency:string;controls:AccountingControl[];reason:string;owner:string;nextAction:string;due:string;confirmed:boolean;reviseConfirmed:boolean};
export function commitAccountingImport(w:Workspace,holdingId:string,input:AccountingCommit,actor:string):Workspace{
  const h=ops(w).holdings.find(h=>h.id===holdingId);if(!h)throw Error('Operating company not found.');
  const company=w.companies.find(c=>c.id===h.companyId);if(!company)throw Error('Company record not found.');
  if(!actor.trim()||!input.filename.trim()||!input.sourceSystem.trim()||input.reason.trim().length<20)throw Error('Record the source file, system, preparer, and reconciliation explanation.');
  if(input.currency!=='USD'||!['Accrual','Cash'].includes(input.basis))throw Error('This import supports one USD accounting basis at a time.');
  if(!input.confirmed)throw Error('Confirm monthly balances, account signs, separated D&A/interest/tax, and source controls.');
  if(!input.owner.trim()||!input.nextAction.trim()||!dateValid(input.due))throw Error('Assign reporting follow-up ownership and a deadline.');
  const rows=parseAccounting(input.text,input.config),periods=reconcileAccounting(rows,input.mappings),hash=fingerprint(JSON.stringify([rows.map(({period,account,amount})=>({period,account,amount})).sort((a,b)=>(a.period+'|'+a.account).localeCompare(b.period+'|'+b.account)),input.mappings.map(({account,classification,invert})=>({account,classification,invert})).sort((a,b)=>a.account.localeCompare(b.account)),input.basis,input.currency]));
  if(accounting(w).imports.some(i=>i.holdingId===holdingId&&i.hash===hash))throw Error('These monthly balances have already been imported for this company.');
  if(periods.some(p=>p.issues.length))throw Error(periods.flatMap(p=>p.issues.map(s=>p.period+': '+s)).join(' '));
  if(input.controls.length!==periods.length||new Set(input.controls.map(c=>c.period)).size!==periods.length)throw Error('Enter one independent set of source controls for every month.');
  if(periods.some(p=>latestReports(h.reports).some(r=>r.period===p.period))&&!input.reviseConfirmed)throw Error('Confirm that overlapping months create report revisions while retaining earlier actuals.');
  for(const p of periods){const control=input.controls.find(c=>c.period===p.period);if(!control||control.source.trim().length<10)throw Error('Cite independent control totals for '+p.period);for(const key of ['revenue','ebitda','cash'] as const)if(control[key]===null||!Number.isFinite(control[key])||Math.abs(control[key]!-p[key])>.01)throw Error(`${p.period}: ${key} differs from the independent control or has not been entered.`);if(control.fullMonth&&p.period===h.closedOn.slice(0,7)&&!h.closedOn.endsWith('-01'))throw Error('The acquisition month is partial ownership; leave the full-month confirmation unchecked.');}
  const key=id(),reportIds:string[]=[];let next=w;
  for(const p of periods){const previous=latestReports(h.reports).find(r=>r.period===p.period),control=input.controls.find(c=>c.period===p.period)!;
    next=saveOperatingReport(next,h.id,{period:p.period,revenue:p.revenue,ebitda:p.ebitda,cash:p.cash,budgetRevenue:previous?.budgetRevenue??null,budgetEbitda:previous?.budgetEbitda??null,fullMonth:control.fullMonth,operations:previous?.operations||emptyOperatingMetrics(),source:`Accounting import ${input.filename} · ${input.sourceSystem} · ${input.basis} USD · CSV lines ${[...new Set(p.lines)].join(', ')}. Controls: ${control.source}`,notes:input.reason,changeReason:input.reason,nextAction:input.nextAction,owner:input.owner,due:input.due,accountingBasis:input.basis,accountingImportId:key});
    reportIds.push(ops(next).holdings.find(x=>x.id===h.id)!.reports[0].id);
  }
  const previousImport=accounting(w).imports.find(i=>i.holdingId===h.id&&i.filename===input.filename),replaceId=previousImport?.documentId&&activeDocuments(company).some(d=>d.id===previousImport.documentId)?previousImport.documentId:undefined;
  const sourceText=`MONTHLY ACCOUNTING SOURCE — ${input.basis} USD\nOriginal file: ${input.filename}\nSource fingerprint: ${fingerprint(input.text)}\nMonthly activity for income/expenses; month-end balance for cash. Not annual acquisition financials.\n${input.text.length>60000?'SOURCE EXCERPT ONLY — full mapped rows are retained in Accounting import history.\n':''}\n${input.text.slice(0,60000)}`;
  const sourceDoc={...makeDocument('Accounting source — '+input.filename,sourceText),evidence:[],warnings:['Monthly accounting source. Annual screening observations are not inferred from this export.',...(input.text.length>60000?['Only an opening excerpt is stored here. Use the complete mapped rows and original CSV for review.']:[])]},updatedCompany=addDocument(company,sourceDoc,replaceId);
  next={...next,companies:next.companies.map(c=>c.id===company.id?updatedCompany:c)};
  const entry:AccountingImport={id:key,holdingId:h.id,companyId:h.companyId,documentId:sourceDoc.id,filename:input.filename,hash,rawHash:fingerprint(input.text),sourceSystem:input.sourceSystem,basis:input.basis,currency:'USD',createdAt:new Date().toISOString(),by:actor.trim(),reason:input.reason.trim(),config:structuredClone(input.config),rows:structuredClone(rows),mappings:structuredClone(input.mappings),periods:structuredClone(periods),controls:structuredClone(input.controls),reportIds};
  return {...next,operating:{...ops(next),accounting:{imports:[entry,...accounting(next).imports]}}};
}
export const accountingExample='Period,Account,Amount\n2026-09,Service revenue,260000\n2026-09,Direct service costs,110000\n2026-09,Operating expenses,98000\n2026-09,Depreciation,4000\n2026-09,Interest expense,6000\n2026-09,Cash at month end,110000';
