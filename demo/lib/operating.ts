import {captureTransition,operatingUpdateText,dateValid} from './transition.ts';
import type {TransitionRecord,OperatingProjectContext,OperatingReportDetails} from './transition.ts';
import {executionCloseBlockers} from './execution.ts';
import type {ExecutionDetails,DealAdvisor} from './execution.ts';
import type {ModelAudit} from './modelEvidence.ts';
import {buildBriefSnapshot,briefText,type BriefSnapshot} from './investment.ts';
import { relationshipCallText, relationshipPlan, ownerReadinessEntry, ownerContextText } from './relationships.ts';
import { id, today, nextDate, number, money, screen, brief, draft, type Workspace, type Company, type Firm, type Evidence } from './domain.ts';
export type WorkKind = 'Research dossier' | 'Owner call brief' | 'Outreach draft' | 'Investment brief' | 'Follow-up';
export type WorkItem = {
    briefId?:string;briefRequestKey?:string;
    id: string;
    companyId: string;
    title: string;
    kind: WorkKind;
    owner: string;
    due: string;
    priority: 'Normal' | 'High';
    status: 'Queued' | 'In review' | 'Approved' | 'Changes requested' | 'Done';
    instructions: string;
    output: string;
    sourceVersion: string;
    preparedAt: string;
    reviewedBy: string;
    reviewedAt: string;
    nextAction: string;
    nextDue: string;
};
export type OwnerPromise = {
    id:string;companyId:string;memoryId?:string;text:string;owner:string;due:string;promisedOn:string;source:string;
    status:'Open'|'Done'|'Released';resolution:string;workItemId?:string;createdAt:string;updatedAt:string;
    history:{date:string;by:string;action:string;note:string;snapshot?:{text:string;due:string;owner:string;source:string;promisedOn:string;status:string}}[];
};
export type OwnerMemory = {
    employees?:string;legacy?:string;summary?:string;outcome?:string;interpretation?:string;contact?:string;
    type?:'Call'|'Meeting'|'Email'|'Note'|'Document';author?:string;createdAt?:string;
    conversationId?:string;readinessRecorded?:boolean;supersedes?:string;supersededBy?:string;
    id: string;
    companyId: string;
    date: string;
    readiness: 'Unknown' | 'Exploring' | 'Not now' | 'Ready to discuss';
    timing: string;
    priorities: string;
    involvement: string;
    promises: string;
    source: string;
};
export type Platform = {
    id: string;
    name: string;
    industries: string;
    states: string;
    revenueMin: number;
    revenueMax: number;
    earningsMin: number;
    earningsMax: number;
    strategy: string;
};
export type InvestmentBrief = {
    snapshot?:BriefSnapshot;
    id: string;
    companyId: string;
    version: number;
    createdAt: string;
    sourceVersion: string;
    body: string;
    caseNotes: string;
    decision: 'Needs information' | 'Advance' | 'Pass';
    approved: boolean;
    reviewer: string;
    reviewedAt: string;
};
export type ModelInputs = {
    name: string;
    ebitda: number;
    price: number;
    fees: number;
    initialWC: number;
    debt: number;
    rate: number;
    amortYears: number;
    sellerNote: number;
    sellerRate: number;
    growth: number;
    exitMultiple: number;
    years: number;
    tax: number;
    capex: number;
    annualWC: number;
    ebitdaBasis: string;
};
export type Scenario = {
    audit?:ModelAudit;
    id: string;
    companyId: string;
    version: number;
    createdAt: string;
    sourceVersion: string;
    inputs: ModelInputs;
};
export type ExecutionTask = Partial<ExecutionDetails> & {
    operating?:OperatingProjectContext;
    id: string;
    title: string;
    category: string;
    owner: string;
    due: string;
    status: 'Open' | 'In progress' | 'Blocked' | 'Awaiting approval' | 'Done';
    dependsOn: string[];
    evidence: string;
    notes: string;
    critical: boolean;
};
export type ExecutionPlan = {
    workspaceVersion?:1;
    advisors?:DealAdvisor[];
    id: string;
    dealId: string;
    tasks: ExecutionTask[];
};
export type OperatingReport = Partial<OperatingReportDetails> & {
    id: string;
    period: string;
    revenue: number;
    ebitda: number;
    cash: number;
    budgetRevenue: number|null;
    budgetEbitda: number|null;
    source: string;
    notes: string;
    metric: string;
    metricValue: string;
    createdAt: string;
};
export type Holding = {
    transition?:TransitionRecord;
    id: string;
    companyId: string;
    dealId: string;
    closedOn: string;
    investmentCase: string;
    modelSnapshot: string;
    sample: boolean;
    plan: ExecutionTask[];
    reports: OperatingReport[];
};
export type Investor = {
    id: string;
    name: string;
    email: string;
    vehicle: string;
    committed: number;
    funded: number;
    nextAction: string;
    due: string;
    notes: string;
};
export type ResearchQuestion = {id:string;companyId:string;topic:string;question:string;owner:string;due:string;status:'Open'|'Answered'|'Deferred';answer:string;source:string;workItemId?:string;createdAt:string;updatedAt:string};
export type ResearchNote={id:string;companyId:string;body:string;evidenceIds:string[];date:string;author:string};
export type OperatingData = {
 ownerPromises?:OwnerPromise[];researchQuestions?:ResearchQuestion[];researchNotes?:ResearchNote[];
    schemaVersion: 1;
    mode: 'Guided' | 'Team';
    work: WorkItem[];
    memories: OwnerMemory[];
    platforms: Platform[];
    assignments: Record<string, string>;
    briefs: InvestmentBrief[];
    models: Scenario[];
    execution: ExecutionPlan[];
    holdings: Holding[];
    investors: Investor[];
};
export const studioPages = ['Work queue', 'Investment briefs', 'Underwriting', 'Execution', 'Portfolio', 'Investors', 'Playbook'];
export function hydrate(w: Workspace): Workspace { if (w.operating)
    return w; const work = w.companies.slice(0, 2).map((c, i) => newWork(c, i ? 'Owner call brief' : 'Research dossier', w.firm.operator)); return { ...w, operating: { schemaVersion: 1, mode: 'Guided', work, memories: [], platforms: [], assignments: {}, briefs: [], models: [], execution: [], holdings: [], investors: [] } }; }
export function ops(w: Workspace): OperatingData { return hydrate(w).operating!; }
export function effectiveFirm(w: Workspace, c: Company): Firm { const p = ops(w).platforms.find(p => p.id === ops(w).assignments[c.id]); return p ? { ...w.firm, ...p, name: w.firm.name + ' / ' + p.name } : w.firm; }
export function allEvidence(c: Company): Evidence[] { return [...c.evidence, ...c.documents.filter(d=>!d.supersededBy).flatMap(d => d.evidence)]; }
export function sourceVersion(w: Workspace, c: Company): string { const o = ops(w); const data = JSON.stringify({ company: [c.name, c.city, c.state, c.industry, c.owner, c.website, c.email, c.phone, c.nextAction, c.due, c.evidence, c.documents, c.conversations], firm: effectiveFirm(w, c), memory: o.memories.filter(m => m.companyId === c.id),ownerPromises:(o.ownerPromises||[]).filter(m=>m.companyId===c.id),researchNotes:(o.researchNotes||[]).filter(n=>n.companyId===c.id),researchQuestions:(o.researchQuestions||[]).filter(q=>q.companyId===c.id) }); let hash = 2166136261; for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
} return (hash >>> 0).toString(16); }
export function latestFinancial(c: Company, field: string) { const rows = allEvidence(c).filter(e => !e.supersededBy && e.kind === 'reported' && (e.periodKind||'Annual')==='Annual' && !/^adjusted\s+ebitda/i.test(e.excerpt) && (e.field === field || e.field.startsWith(field + '_'))); const period = Math.max(0, ...rows.map(e => Number(e.field.split('_')[1]) || 0)); const latest = rows.filter(e => (Number(e.field.split('_')[1]) || 0) === period); const disputed=latest.some(e=>e.disputed);const values = [...new Set(latest.filter(e=>!e.disputed).map(e => number(e.value)).filter((x): x is number => x !== null))]; return { value: !disputed&&values.length === 1 ? values[0] : null, conflict: disputed||values.length > 1, period: period ? String(period) : 'Undated', sources: latest }; }
export const researchFields = [['service_mix', 'Services & revenue mix'], ['ownership', 'Ownership'], ['customers', 'Customer profile'], ['locations', 'Locations & territory'], ['team', 'Team & owner dependence'], ['competitors', 'Competitors']] as const;
export function latestOwnerMemory(w:Workspace,c:Company){return ownerReadinessEntry(w,c);}
export function researchAssessment(w:Workspace,c:Company){const e=allEvidence(c).filter(e=>!e.supersededBy&&!e.disputed&&e.kind==='reported'&&e.value.trim()&&e.source.trim()&&e.excerpt.trim());const covered=researchFields.filter(([field])=>e.some(x=>x.field===field));const memory=latestOwnerMemory(w,c),fitScreen=screen(c,effectiveFirm(w,c));const matched=fitScreen.checks.filter(x=>x.result==='pass').length,unknown=fitScreen.checks.filter(x=>x.result==='unknown'||x.result==='review').length,failed=fitScreen.checks.filter(x=>x.result==='fail').length,conflicts=fitScreen.checks.filter(x=>x.result==='conflict').length;return {covered:covered.length,total:researchFields.length,percent:Math.round(covered.length/researchFields.length*100),missing:researchFields.filter(([field])=>!e.some(x=>x.field===field)).map(([,label])=>label),readiness:memory?.readiness||'Unknown',fit:failed?'Outside buy box':conflicts?'Resolve fit evidence':unknown?'Aligned on known criteria':'Fits current buy box',matched,unknown,failed,conflicts,checks:fitScreen.checks};}
export function researchDossier(w: Workspace, c: Company) { const a = researchAssessment(w, c); return `RESEARCH DOSSIER — ${c.name}${c.sample ? ' (FICTIONAL SAMPLE)' : ''}\n${c.city}, ${c.state} · ${c.industry}\nStrategy fit: ${a.fit}\nResearch coverage: ${a.covered}/${a.total} topics with reported source excerpts\nOwner readiness: ${a.readiness}\n\nRECORDED EVIDENCE\n${allEvidence(c).map(e => `${e.field}: ${e.value} [${e.supersededBy?'superseded':e.disputed?'disputed':e.kind}]\nSource: ${e.source}\nExcerpt: ${e.excerpt}`).join('\n\n') || 'No evidence recorded.'}\n\nOPEN RESEARCH\n${a.missing.map(s => '- ' + s).join('\n') || 'Core research topics covered; verify accuracy and freshness.'}\n\nANALYST NOTES\n${(ops(w).researchNotes||[]).filter(n=>n.companyId===c.id).map(n=>n.body+' — '+n.author+' · '+n.date).join('\n')||'None recorded.'}\n\nRESEARCH QUESTIONS\n${(ops(w).researchQuestions||[]).filter(q=>q.companyId===c.id).map(q=>q.status+': '+q.question+(q.answer?' Answer: '+q.answer+' — '+q.source:'')).join('\n')||'No explicit questions recorded.'}\n\n${relationshipCallText(w,c)}\n\nReview recorded sources manually. No live web discovery or model analysis was performed.`; }
export function investmentBrief(w:Workspace,c:Company){return briefText(buildBriefSnapshot(w,c));}
export function newWork(c: Company, kind: WorkKind, owner: string): WorkItem { return { id: id(), companyId: c.id, title: kind === 'Follow-up' ? 'Follow up with the owner' : `${kind} · ${c.name}`, kind, owner, due: today(), priority: 'Normal', status: 'Queued', instructions: '', output: '', sourceVersion: '', preparedAt: '', reviewedBy: '', reviewedAt: '', nextAction: kind === 'Research dossier' ? 'Prepare an owner call' : kind === 'Owner call brief' ? 'Introduce yourself to the owner' : kind === 'Outreach draft' ? 'Review contact details and use approved outreach' : 'Review open questions with the owner', nextDue: nextDate(2) }; }
export function prepareWork(w: Workspace, item: WorkItem): WorkItem { const c = w.companies.find(c => c.id === item.companyId); if (!c)
    throw Error('The linked company no longer exists.'); const f = effectiveFirm(w, c); let output = item.kind === 'Research dossier' ? researchDossier(w, c) : item.kind === 'Owner call brief' ? callBrief(w, c) : item.kind === 'Outreach draft' ? draft(c, f) : item.kind === 'Investment brief' ? investmentBrief(w, c) : `FOLLOW-UP — ${c.name}\nLast conversation: ${c.conversations[0]?.body || 'No conversation recorded.'}\nNext action: ${c.nextAction || 'Agree on a next step.'}\n\n${item.instructions || 'Review the relationship and record your follow-up.'}`; if (item.instructions)
    output += '\n\nOPERATOR INSTRUCTIONS\n' + item.instructions; return { ...item, output, sourceVersion: sourceVersion(w, c), preparedAt: new Date().toISOString(), status: 'In review', reviewedBy: '', reviewedAt: '' }; }
export function approveWork(w: Workspace, itemId: string, output: string, nextAction: string, nextDue: string): Workspace { const o = ops(w), item = o.work.find(i => i.id === itemId), c = w.companies.find(c => c.id === item?.companyId); if (!item || !c)
    throw Error('Work item not found.'); if (item.status !== 'In review')
    throw Error('Prepare this item before approving it.'); if (item.sourceVersion !== sourceVersion(w, c))
    throw Error('The company record changed. Prepare a fresh output before approving.'); if (!output.trim() || !nextAction.trim() || !nextDue)
    throw Error('An output, next action, and date are required.'); let updated = { ...c, nextAction, due: nextDue }; if (item.kind === 'Outreach draft')
    updated = { ...updated, drafts: [{ id: id(), body: output, approved: true }, ...c.drafts] }; return { ...w, companies: w.companies.map(x => x.id === c.id ? updated : x), operating: { ...o, work: o.work.map(x => x.id === itemId ? { ...x, output, nextAction, nextDue, status: 'Approved', reviewedBy: w.firm.reviewer, reviewedAt: new Date().toISOString() } : x) } }; }
export function modelDefaults(c: Company): ModelInputs { const e = latestFinancial(c, 'ebitda'); return { name: 'Base case', ebitda: e.value || 0, price: 0, fees: 0, initialWC: 0, debt: 0, rate: 9, amortYears: 10, sellerNote: 0, sellerRate: 6, growth: 3, exitMultiple: 5, years: 5, tax: 25, capex: 0, annualWC: 0, ebitdaBasis: e.value !== null ? `${e.period} · ${e.sources.map(s => s.source).join('; ')}` : 'User assumption — no unambiguous reported EBITDA' }; }
export function validateModel(i: ModelInputs) { const nums = ['ebitda', 'price', 'fees', 'initialWC', 'debt', 'rate', 'amortYears', 'sellerNote', 'sellerRate', 'growth', 'exitMultiple', 'years', 'tax', 'capex', 'annualWC'] as const; for (const k of nums)
    if (!Number.isFinite(i[k]))
        throw Error(`Enter a finite ${k} value.`); if (i.ebitda <= 0 || i.price <= 0)
    throw Error('Positive EBITDA and purchase price are required.'); for (const k of ['fees', 'initialWC', 'debt', 'sellerNote', 'rate', 'sellerRate', 'exitMultiple', 'capex', 'annualWC'] as const)
    if (i[k] < 0)
        throw Error(`${k} cannot be negative.`); if (i.debt + i.sellerNote >= i.price + i.fees + i.initialWC)
    throw Error('Financing must leave a positive equity contribution.'); if (!Number.isInteger(i.years) || i.years < 1 || i.years > 10 || !Number.isInteger(i.amortYears) || i.amortYears < 1 || i.amortYears > 30)
    throw Error('Hold period must be 1–10 whole years; amortization 1–30 years.'); if (i.growth <= -100 || i.growth > 100 || i.tax < 0 || i.tax > 60 || i.rate > 100 || i.sellerRate > 100 || i.exitMultiple > 30)
    throw Error('Check growth, interest, tax, and exit assumptions.'); if (!i.name.trim() || !i.ebitdaBasis.trim())
    throw Error('Name the scenario and explain the EBITDA basis.'); }
function irr(flows: number[]): number | null { const npv = (r: number) => flows.reduce((s, c, t) => s + c / (1 + r) ** t, 0); let lo = -.9999, hi = 1000; const flo = npv(lo), fhi = npv(hi); if (!Number.isFinite(flo) || flo * fhi > 0)
    return null; for (let j = 0; j < 200; j++) {
    const m = (lo + hi) / 2;
    if (npv(m) > 0)
        lo = m;
    else
        hi = m;
} return (lo + hi) / 2; }
export function calculateModel(i: ModelInputs) { validateModel(i); const uses = i.price + i.fees + i.initialWC; if (!Number.isFinite(uses))
    throw Error('Total uses must be finite.'); const equity = uses - i.debt - i.sellerNote, r = i.rate / 100, payment = i.debt ? (r ? i.debt * r / (1 - (1 + r) ** -i.amortYears) : i.debt / i.amortYears) : 0; let balance = i.debt; const rows: {
    year: number;
    ebitda: number;
    interest: number;
    principal: number;
    debt: number;
    tax: number;
    cash: number;
    coverage: number | null;
}[] = []; const flows = [-equity]; for (let y = 1; y <= i.years; y++) {
    const e = i.ebitda * (1 + i.growth / 100) ** y, seniorInterest = balance * r, sellerInterest = i.sellerNote * i.sellerRate / 100, principal = Math.min(balance, Math.max(0, payment - seniorInterest)), interest = seniorInterest + sellerInterest, tax = Math.max(0, e - interest) * i.tax / 100, service = principal + interest;
    balance = Math.max(0, balance - principal);
    const cash = e - tax - i.capex - i.annualWC - service;
    rows.push({ year: y, ebitda: e, interest, principal, debt: balance, tax, cash, coverage: service ? (e - tax - i.capex - i.annualWC) / service : null });
    flows.push(cash);
} const exitEV = rows.at(-1)!.ebitda * i.exitMultiple, exitEquity = Math.max(0, exitEV - balance - i.sellerNote); flows[flows.length - 1] += exitEquity; if (![exitEV, exitEquity, ...flows, ...rows.flatMap(r => [r.ebitda, r.interest, r.principal, r.debt, r.tax, r.cash])].every(Number.isFinite))
    throw Error('These assumptions exceed the supported numeric range.'); const invested = -flows.filter(v => v < 0).reduce((s, v) => s + v, 0), returned = flows.filter(v => v > 0).reduce((s, v) => s + v, 0); let signChanges = 0; let last = 0; for (const f of flows) {
    const sign = Math.sign(f);
    if (sign && last && sign !== last)
        signChanges++;
    if (sign)
        last = sign;
} return { uses, equity, payment, rows, exitEV, exitEquity, flows, moic: returned / invested, irr: signChanges === 1 ? irr(flows) : null, warnings: [...(rows.some(r => r.cash < 0) ? ['Negative annual cash flow requires additional equity funding.'] : []), ...(exitEV < balance + i.sellerNote ? ['Exit enterprise value is below remaining financing; modeled equity proceeds are zero.'] : []), ...(rows.some(r => r.coverage !== null && r.coverage < 1) ? ['Modeled cash available does not cover debt service in at least one year.'] : [])] }; }
export function sensitivity(i: ModelInputs) { return [-1, 0, 1].map(delta => ({ multiple: Math.max(0, i.exitMultiple + delta), cells: [i.growth - 3, i.growth, i.growth + 3].map(g => { try {
        return calculateModel({ ...i, growth: g, exitMultiple: Math.max(0, i.exitMultiple + delta) }).moic;
    }
    catch {
        return null;
    } }) })); }
export function executionTemplate(owner: string): ExecutionTask[] { const items = [['NDA & information access', 'Process', true], ['Financial statements & earnings review', 'Financial', true], ['Customer concentration & retention', 'Commercial', true], ['Ownership, contracts & legal review', 'Legal', true], ['Financing terms & funding readiness', 'Financing', true], ['Confirm investment case & open risks', 'Review', true], ['Closing documents & advisor sign-off', 'Closing', true], ['Confirm close with human authorization', 'Closing', true]] as const; const out: ExecutionTask[] = items.map(([title, category, critical], i) => ({ id: id(), title, category, critical, owner, due: nextDate(3 + i * 4), status: 'Open', dependsOn: [], evidence: '', notes: '' })); out[5].dependsOn = out.slice(1, 5).map(t => t.id); out[6].dependsOn = [out[5].id]; out[7].dependsOn = [out[6].id]; return out; }
export function completeExecution(tasks: ExecutionTask[], taskId: string, patch: Partial<ExecutionTask>) { const item = tasks.find(x => x.id === taskId); if (!item)
    throw Error('Task not found.'); if (patch.status === 'Done') {
    if (!(patch.evidence ?? item.evidence).trim())
        throw Error('Record evidence or advisor confirmation before completing this task.');
    if (item.dependsOn.some(id => tasks.find(x => x.id === id)?.status !== 'Done'))
        throw Error('Complete the dependency tasks first.');
} if (item.status === 'Done' && patch.status && patch.status !== 'Done' && tasks.some(x => x.status === 'Done' && x.dependsOn.includes(item.id)))
    throw Error('Reopen completed dependent tasks first.'); return tasks.map(x => x.id === taskId ? { ...x, ...patch } : x); }
export function hundredDayPlan(owner: string, start = today()): ExecutionTask[] { return [['Meet employees and agree on responsibilities', 'People', 7], ['Contact key customers and protect continuity', 'Customers', 14], ['Set reporting, cash controls, and budget', 'Finance', 30], ['Address open diligence findings', 'Risk', 45], ['Review the acquisition case against actuals', 'Strategy', 100]].map(([title, category, days]) => ({ id: id(), title: String(title), category: String(category), owner, due: (() => { const date = new Date(start + 'T12:00:00'); date.setDate(date.getDate() + Number(days)); return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); })(), status: 'Open', dependsOn: [], evidence: '', notes: '', critical: false })); }
export function closeToHolding(w: Workspace, dealId: string, closedOn: string, modelId?:string): Workspace { const o = ops(w), deal = w.deals.find(d => d.id === dealId), plan = o.execution.find(p => p.dealId === dealId); if (!deal || !plan)
    throw Error('Set up the execution plan first.'); if (o.holdings.some(h => h.dealId === dealId))
    throw Error('This deal is already in the portfolio.'); if (plan.tasks.some(t => t.critical && t.status !== 'Done'))
    throw Error('Complete all critical closing workstreams first.'); if (plan.workspaceVersion && executionCloseBlockers(plan,w.companies.find(c=>c.id===deal.companyId)!).length)
    throw Error('Resolve critical execution evidence and approval blockers before recording the close.'); if (deal.stage === 'Passed')
    throw Error('A passed opportunity cannot be recorded as closed.'); if (!dateValid(closedOn) || closedOn > today())
    throw Error('Use the actual close date, today or earlier.'); const model = o.models.find(m => m.companyId === deal.companyId); const holding: Holding = { id: id(), companyId: deal.companyId, dealId, closedOn, investmentCase: deal.memo, modelSnapshot: model ? JSON.stringify({inputs:model.inputs,audit:model.audit}, null, 2) : 'No underwriting scenario recorded.', sample: w.companies.find(c => c.id === deal.companyId)?.sample || false, plan: hundredDayPlan(w.firm.operator, closedOn), reports: [] }; return { ...w, deals: w.deals.map(d => d.id === dealId ? { ...d, stage: 'Closed' } : d), operating: { ...o, holdings: [captureTransition(w,holding,modelId), ...o.holdings] } }; }
export function latestReports(reports: OperatingReport[]) { const seen = new Set<string>(); return [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter(r => { if (seen.has(r.period))
    return false; seen.add(r.period); return true; }).sort((a, b) => b.period.localeCompare(a.period)); }
export function reportNarrative(c:Company,h:Holding){return operatingUpdateText(c,h);}
export function callBrief(w:Workspace,c:Company){
 const plan=relationshipPlan(w,c),sorted={...c,conversations:[...c.conversations].filter(x=>x.date<=today()).sort((a,b)=>b.date.localeCompare(a.date))};
 if(plan.lastConversation)sorted.conversations=[plan.lastConversation];
 const base=brief(sorted,effectiveFirm(w,c)).replace(/QUESTIONS FOR THE OWNER\n[\s\S]*?\n\nLAST CONVERSATION/,`QUESTIONS FOR THE NEXT CALL\n${plan.questions.map((q,i)=>`${i+1}. ${q}`).join('\n')}\n\nLAST CONVERSATION`);
 return base+'\n\n'+relationshipCallText(w,c);
}
