import { id, today, money, type Workspace, type Company } from './domain.ts';
import { calculateModel, hundredDayPlan, latestFinancial, latestReports, type Holding, type ExecutionTask, type OperatingReport, type Scenario, type ModelInputs } from './operating.ts';
import { executionItem } from './execution.ts';
import { modelEvidenceFingerprint,scenarioResult } from './modelEvidence.ts';
export const operatingWorkstreams = ['Customer retention', 'Staffing', 'Financial reporting', 'Improvement projects', 'Investment case'] as const;
export type OperatingWorkstream = typeof operatingWorkstreams[number];
export type TransitionFinding = {
    id: string;
    originId: string;
    origin: 'Deal execution' | 'Company research' | 'Investment brief' | 'Owner commitment';
    title: string;
    detail: string;
    status: string;
    owner: string;
    due: string;
    source: string;
    nextAction: string;
    unresolved: boolean;
    references: {
        label: string;
        excerpt: string;
        locator?: string;
    }[];
};
export type TransitionRecord = {
    version: 1;
    capturedAt: string;
    capturedBy: string;
    legacy: boolean;
    model?: Scenario;
    modelEvidenceState: 'Current when captured' | 'Earlier evidence when captured' | 'Legacy snapshot' | 'Illustrative assumptions' | 'No model recorded';
    findings: TransitionFinding[];
    reportedFinancials: {
        metric: string;
        value: number | null;
        period: string;
        sources: {
            label: string;
            excerpt: string;
        }[];
    }[];
    brief?: {
        id: string;
        version: number;
        approved: boolean;
        body: string;
    };
    ownerContext: {
        topic: string;
        text: string;
        source: string;
        date: string;
    }[];
};
export type OperatingProjectSnapshot = {
    title: string;
    category: string;
    owner: string;
    due: string;
    status: ExecutionTask['status'];
    nextAction: string;
    evidence: string;
    notes: string;
    outcome: string;
    measure: string;
    agreement: 'Proposed' | 'Agreed';
    findingIds: string[];
};
export type OperatingProjectContext = {
    outcome: string;
    measure: string;
    agreement: 'Proposed' | 'Agreed';
    agreedBy: string;
    agreedAt: string;
    findingIds: string[];
    history: {
        id: string;
        date: string;
        by: string;
        reason: string;
        before?: OperatingProjectSnapshot;
        after: OperatingProjectSnapshot;
    }[];
};
export type OperatingMetrics = {
    customerCohort: number | null;
    retainedCustomers: number | null;
    employeesAtClose: number | null;
    headcount: number | null;
    capex: number | null;
    workingCapital: number | null;
};
export type OperatingReportDetails = {
    fullMonth: boolean;
    operations: OperatingMetrics;
    changeReason: string;
    recordedBy: string;
    revisionOf?: string;
    revision: number;
    nextAction: string;
    owner: string;
    due: string;
};
export type OperatingReportInput = Pick<OperatingReport, 'period' | 'revenue' | 'ebitda' | 'cash' | 'budgetRevenue' | 'budgetEbitda' | 'source' | 'notes'> & Pick<OperatingReportDetails, 'fullMonth' | 'operations' | 'changeReason' | 'nextAction' | 'owner' | 'due'>;
export const emptyOperatingMetrics = (): OperatingMetrics => ({ customerCohort: null, retainedCustomers: null, employeesAtClose: null, headcount: null, capex: null, workingCapital: null });
export function dateValid(s: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        return false;
    const d = new Date(s + 'T12:00:00Z');
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}
export function operatingDate(start: string, days: number) { const d = new Date(start + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function dayOfOwnership(h: Holding, asOf = today()) { return Math.floor((Date.parse(asOf + 'T12:00:00Z') - Date.parse(h.closedOn + 'T12:00:00Z')) / 86400000) + 1; }
export function projectContext(t: ExecutionTask): OperatingProjectContext { return t.operating || { outcome: 'Define the intended operating outcome.', measure: 'Agree on a measure of completion.', agreement: 'Proposed', agreedBy: '', agreedAt: '', findingIds: [], history: [] }; }
export function projectSnapshot(t: ExecutionTask): OperatingProjectSnapshot { const o = projectContext(t); return { title: t.title, category: t.category, owner: t.owner, due: t.due, status: t.status, nextAction: t.nextAction || '', evidence: t.evidence, notes: t.notes, outcome: o.outcome, measure: o.measure, agreement: o.agreement, findingIds: [...o.findingIds] }; }
const workstream = (text: string): OperatingWorkstream => /customer|client|retention|contract|renew/i.test(text) ? 'Customer retention' : /staff|employee|team|technician|people|hire/i.test(text) ? 'Staffing' : /financ|report|account|cash|earnings/i.test(text) ? 'Financial reporting' : 'Improvement projects';
function decoratePlan(plan: ExecutionTask[], owner: string): ExecutionTask[] { const steps = [['Staffing', 'A clear responsibility for every employee and key role.', 'Employee conversations completed; responsibilities and retention risks documented.', 'Meet key staff and record retention risks and ownership of each role.'], ['Customer retention', 'Preserve the acquired customer relationships.', 'Contact key customers and track retention of the acquisition customer cohort.', 'Contact key customers and review renewals and continuity concerns.'], ['Financial reporting', 'Reliable monthly financial and cash reporting.', 'Monthly close calendar agreed; first sourced report delivered.', 'Agree on the monthly close calendar, reporting owner, and cash controls.'], ['Improvement projects', 'Resolve post-close diligence follow-ups.', 'Each carried finding has an owner, evidence, and a resolution.', 'Review carried diligence findings and agree on the improvement priorities.'], ['Investment case', 'Understand performance against the acquisition case.', 'Review complete operating months, explain variances, and agree corrective actions.', 'Compare sourced results with the saved acquisition assumptions.']]; return plan.map((t, i) => { const [category, outcome, measure, nextAction] = steps[({ People: 0, Customers: 1, Finance: 2, Risk: 3, Strategy: 4 } as Record<string, number>)[t.category]] || [(operatingWorkstreams as readonly string[]).includes(t.category) ? t.category : workstream(t.category + ' ' + t.title), 'Define the intended operating outcome.', 'Agree on evidence of completion.', 'Agree on the next step for this priority.']; return { ...t, category: t.operating ? t.category : category, nextAction: t.nextAction || nextAction, operating: t.operating || { outcome, measure, agreement: 'Proposed', agreedBy: '', agreedAt: '', findingIds: [], history: [] } }; }); }
function parseSavedModel(h: Holding): Scenario | undefined {
    try {
        const data = JSON.parse(h.modelSnapshot);
        const inputs = data.inputs || data;
        if (!data.underwritingV2 && (!inputs?.ebitda || !inputs?.price))
            return undefined;
        if (!data.underwritingV2) calculateModel(inputs);
        else if (data.underwritingV2.engineVersion !== 'annual-underwriting-v2' || !data.underwritingV2.results?.[data.underwritingV2.activeCase]) return undefined;
        return { id: 'legacy-close-model', companyId: h.companyId, version: 0, createdAt: h.closedOn, sourceVersion: 'Legacy close snapshot', inputs: structuredClone(inputs), audit: data.audit ? structuredClone(data.audit) : undefined,underwritingV2:data.underwritingV2?structuredClone(data.underwritingV2):undefined };
    }
    catch {
        return undefined;
    }
}
function findingsAtClose(w: Workspace, h: Holding): TransitionFinding[] {
    const o = w.operating!, out: TransitionFinding[] = [], execution = o.execution.find(p => p.dealId === h.dealId);
    for (const raw of execution?.tasks || []) {
        const t = executionItem(raw);
        out.push({ id: id(), originId: t.id, origin: 'Deal execution', title: t.title, detail: [t.evidence, t.notes].filter(Boolean).join('\n'), status: t.status, owner: t.owner, due: t.due, source: 'Deal execution record · revision ' + t.revision, nextAction: t.nextAction, unresolved: t.status !== 'Done', references: t.sources.map(s => ({ label: s.name + ' · v' + s.version, excerpt: s.excerpt, locator: s.locator })) });
    }
    for (const q of o.researchQuestions || [])
        if (q.companyId === h.companyId && q.status !== 'Answered' && !execution?.tasks.some(t => t.origin === 'research:' + q.id))
            out.push({ id: id(), originId: q.id, origin: 'Company research', title: q.question, detail: [q.answer, q.source].filter(Boolean).join('\n'), status: q.status, owner: q.owner, due: q.due, source: q.source || 'Company research question', nextAction: 'Obtain a sourced answer to: ' + q.question, unresolved: true, references: [] });
    const b = o.briefs.find(b => b.companyId === h.companyId && b.approved) || o.briefs.find(b => b.companyId === h.companyId);
    if (b?.snapshot)
        for (const f of [...b.snapshot.concentration, ...b.snapshot.inconsistencies, ...b.snapshot.quality.filter(x => x.status !== 'Unknown')])
            out.push({ id: id(), originId: b.id + ':' + f.key, origin: 'Investment brief', title: f.title, detail: f.text, status: f.status + (b.approved ? ' · reviewed brief' : ' · draft brief'), owner: w.firm.operator, due: '', source: 'Investment brief v' + b.version, nextAction: 'Review this finding and agree any post-close action.', unresolved: false, references: f.sourceIds.flatMap(key => { const s = b.snapshot!.sources.find(s => s.id === key); return s ? [{ label: s.label, excerpt: s.excerpt, locator: s.locator }] : []; }) });
    for (const p of o.ownerPromises || [])
        if (p.companyId === h.companyId && p.status === 'Open')
            out.push({ id: id(), originId: p.id, origin: 'Owner commitment', title: p.text, detail: p.source, status: 'Open commitment', owner: p.owner, due: p.due, source: p.source, nextAction: 'Confirm responsibility for the owner commitment and follow through: ' + p.text, unresolved: true, references: [] });
    return out;
}
function projectFromFinding(h: Holding, f: TransitionFinding, operator: string): ExecutionTask { const due = f.due > h.closedOn ? f.due : operatingDate(h.closedOn, 14); return { id: id(), title: f.title, category: workstream(f.title + ' ' + f.detail), owner: f.owner || operator, due, status: 'Open', dependsOn: [], evidence: '', notes: `Carried from ${f.origin.toLowerCase()}: ${f.source}. Original status: ${f.status}.${f.due ? ' Original due date: ' + f.due + '.' : ''}\n${f.detail}`, critical: false, nextAction: f.nextAction || 'Agree a next step for this carried finding.', operating: { outcome: 'Resolve the carried finding and protect continuity after close.', measure: 'A sourced answer or confirmation closes the finding.', agreement: 'Proposed', agreedBy: '', agreedAt: '', findingIds: [f.id], history: [] } }; }
export function captureTransition(w: Workspace, h: Holding, modelId?: string, legacy = false): Holding {
    const c = w.companies.find(c => c.id === h.companyId);
    if (!c || !w.operating)
        throw Error('Company not found.');
    let model: Scenario | undefined;
    if (legacy)
        model = parseSavedModel(h);
    else if (modelId === 'none')
        model = undefined;
    else if (modelId) {
        model = w.operating.models.find(m => m.id === modelId && m.companyId === h.companyId);
        if (!model)
            throw Error('Choose an acquisition model belonging to this company.');
    }
    else
        model = w.operating.models.find(m => m.companyId === h.companyId);
    const findings = legacy ? [] : findingsAtClose(w, h), b = legacy ? undefined : w.operating.briefs.find(b => b.companyId === h.companyId && b.approved) || w.operating.briefs.find(b => b.companyId === h.companyId), memories = legacy ? [] : w.operating.memories.filter(m => m.companyId === h.companyId && !m.supersededBy && m.date <= today()).sort((a, b) => b.date.localeCompare(a.date));
    const ownerContext: TransitionRecord['ownerContext'] = [];
    for (const key of ['employees', 'legacy', 'timing', 'priorities', 'involvement'] as const) {
        const m = memories.find(m => m[key]?.trim());
        if (m)
            ownerContext.push({ topic: key, text: m[key]!, source: m.source, date: m.date });
    }
    const transition: TransitionRecord = { version: 1, capturedAt: new Date().toISOString(), capturedBy: w.firm.operator, legacy, model: model ? structuredClone(model) : undefined, modelEvidenceState: !model ? 'No model recorded' : legacy ? 'Legacy snapshot' : (model.underwritingV2?.evidenceFingerprint||model.audit?.evidenceFingerprint) === modelEvidenceFingerprint(c) ? 'Current when captured' : 'Earlier evidence when captured', findings: structuredClone(findings), reportedFinancials: legacy ? [] : ['revenue', 'ebitda'].map(metric => { const f = latestFinancial(c, metric); return { metric, value: f.value, period: f.period, sources: f.sources.map(s => ({ label: s.source, excerpt: s.excerpt })) }; }), brief: b ? { id: b.id, version: b.version, approved: b.approved, body: b.body } : undefined, ownerContext };
    const plan = [...decoratePlan(h.plan, w.firm.operator), ...findings.filter(f => f.unresolved).map(f => projectFromFinding(h, f, w.firm.operator))];
    for (const t of plan)
        if (!projectContext(t).history.length) {
            const context = projectContext(t);
            t.operating = { ...context, history: [{ id: id(), date: transition.capturedAt, by: w.firm.operator, reason: legacy ? 'Prepared from the stored close record; historical diligence context was not reconstructed.' : 'Prepared at close. This is a proposed priority until the operating team agrees it.', after: projectSnapshot(t) }] };
        }
    return { ...h, transition, modelSnapshot: legacy ? h.modelSnapshot : model ? JSON.stringify({ inputs: model.inputs, audit: model.audit,underwritingV2:model.underwritingV2 }, null, 2) : 'No underwriting scenario recorded.', plan };
}
function holding(w: Workspace, holdingId: string) {
    const o = w.operating, h = o?.holdings.find(h => h.id === holdingId);
    if (!o || !h)
        throw Error('Operating company not found.');
    return { o, h };
}
function put(w: Workspace, h: Holding): Workspace { return { ...w, operating: { ...w.operating!, holdings: w.operating!.holdings.map(x => x.id === h.id ? h : x) } }; }
export function prepareLegacyTransition(w: Workspace, holdingId: string): Workspace {
    const { h } = holding(w, holdingId);
    if (h.transition)
        throw Error('The acquisition baseline is already preserved.');
    return put(w, captureTransition(w, h, undefined, true));
}
export function saveOperatingProject(w: Workspace, holdingId: string, projectId: string | undefined, input: OperatingProjectSnapshot, reason: string): Workspace {
    const { h } = holding(w, holdingId), old = h.plan.find(t => t.id === projectId);
    if (projectId && !old)
        throw Error('Operating project not found.');
    if (!input.title.trim() || !input.owner.trim() || !input.nextAction.trim() && input.status !== 'Done')
        throw Error('A project needs a title, responsible owner, and next step.');
    if (!operatingWorkstreams.includes(input.category as OperatingWorkstream))
        throw Error('Choose an operating workstream.');
    if (!dateValid(input.due) || input.due < h.closedOn)
        throw Error('Use a valid deadline on or after close.');
    if (!['Open', 'In progress', 'Blocked', 'Done'].includes(input.status) || !['Proposed', 'Agreed'].includes(input.agreement))
        throw Error('Choose valid project status and agreement.');
    if (!input.outcome.trim() || !input.measure.trim())
        throw Error('Define the outcome and how completion will be measured.');
    if (reason.trim().length < 20)
        throw Error('Explain the project or update in at least 20 characters.');
    if (input.status === 'Blocked' && !input.notes.trim())
        throw Error('Record the blocker and how it will be addressed.');
    if (input.status === 'Done' && (input.agreement !== 'Agreed' || !input.evidence.trim()))
        throw Error('Agree the project and record completion evidence before marking it done.');
    if (input.findingIds.some(key => !h.transition?.findings.some(f => f.id === key)))
        throw Error('Choose a finding captured in this company’s handoff.');
    const date = new Date().toISOString(), context = old ? projectContext(old) : undefined, t: ExecutionTask = { ...(old || { id: id(), dependsOn: [], critical: false }), ...structuredClone(input), title: input.title.trim(), owner: input.owner.trim(), operating: { outcome: input.outcome.trim(), measure: input.measure.trim(), agreement: input.agreement, agreedBy: input.agreement === 'Agreed' ? w.firm.operator : '', agreedAt: input.agreement === 'Agreed' ? date : '', findingIds: [...input.findingIds], history: [] } };
    const after = projectSnapshot(t);
    t.operating!.history = [{ id: id(), date, by: w.firm.operator, reason: reason.trim(), before: old ? projectSnapshot(old) : undefined, after }, ...(context?.history || [])];
    return put(w, { ...h, plan: old ? h.plan.map(x => x.id === old.id ? t : x) : [...h.plan, t] });
}
export function addFindingProject(w: Workspace, holdingId: string, findingId: string) {
    const { h } = holding(w, holdingId), f = h.transition?.findings.find(f => f.id === findingId);
    if (!f)
        throw Error('Handoff finding not found.');
    if (h.plan.some(t => projectContext(t).findingIds.includes(findingId)))
        throw Error('This finding already has an operating project.');
    const t = projectFromFinding(h, f, w.firm.operator);
    return saveOperatingProject(w, h.id, undefined, projectSnapshot(t), 'Create a proposed operating priority from the captured diligence finding.');
}
export function saveOperatingReport(w: Workspace, holdingId: string, input: OperatingReportInput): Workspace {
    const { h } = holding(w, holdingId);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) || input.period < h.closedOn.slice(0, 7) || input.period > today().slice(0, 7))
        throw Error('Choose a reporting month from close through the current month.');
    for (const key of ['revenue', 'ebitda', 'cash'] as const)
        if (!Number.isFinite(input[key]))
            throw Error('Enter finite actual financial figures.');
    if (input.revenue < 0)
        throw Error('Revenue cannot be negative.');
    for (const key of ['budgetRevenue', 'budgetEbitda'] as const)
        if (input[key] !== null && !Number.isFinite(input[key]))
            throw Error('Budget values must be finite or left unknown.');
    if (input.budgetRevenue !== null && input.budgetRevenue < 0)
        throw Error('Revenue budget cannot be negative.');
    const metrics = input.operations;
    for (const [key, value] of Object.entries(metrics)) {
        if (value === null)
            continue;
        if (!Number.isFinite(value) || (value < 0 && key !== 'workingCapital') || (['customerCohort', 'retainedCustomers', 'employeesAtClose', 'headcount'].includes(key) && !Number.isInteger(value)))
            throw Error('Operating counts must be nonnegative whole numbers; capital spending must be nonnegative; working-capital releases may be negative.');
    }
    if (metrics.retainedCustomers !== null && (metrics.customerCohort === null || metrics.retainedCustomers > metrics.customerCohort))
        throw Error('Retained customers need a valid acquisition cohort and cannot exceed that cohort.');
    if (!input.source.trim())
        throw Error('Cite the management accounts or operating report source.');
    if (input.changeReason.trim().length < 20)
        throw Error('Explain the report or revision in at least 20 characters.');
    if (!input.nextAction.trim() || !input.owner.trim() || !dateValid(input.due))
        throw Error('Record a responsible owner, next action, and follow-up deadline.');
    const previous = latestReports(h.reports).find(r => r.period === input.period), r: OperatingReport = { ...structuredClone(input), id: id(), metric: previous?.metric || '', metricValue: previous?.metricValue || '', createdAt: new Date().toISOString(), recordedBy: w.firm.operator, revisionOf: previous?.id, revision: (previous?.revision || (previous ? 1 : 0)) + 1 };
    return put(w, { ...h, reports: [r, ...h.reports] });
}
function anniversary(start: string, offset: number) { const [year, month, day] = start.split('-').map(Number), y = year + offset, last = new Date(Date.UTC(y, month, 0)).getUTCDate(); return `${y}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`; }
export function baselineResult(h: Holding) {
    const m = h.transition?.model;
    if (!m)
        return undefined;
    try {
        return scenarioResult(m);
    }
    catch {
        return undefined;
    }
}
export function reportCaseComparison(h: Holding, r: OperatingReport, asOf = today()) {
    const model = h.transition?.model, result = baselineResult(h), first = r.period + '-01', last = new Date(Date.UTC(Number(r.period.slice(0, 4)), Number(r.period.slice(5, 7)), 0)).toISOString().slice(0, 10);
    let reason = '';
    if (!model || !result)
        reason = 'No acquisition model was captured.';
    else if (r.fullMonth !== true)
        reason = 'A complete calendar month has not been confirmed.';
    else if (r.period >= asOf.slice(0, 7))
        reason = 'The reporting month is not yet complete.';
    else if (first < h.closedOn)
        reason = 'The month includes days before the acquisition.';
    const row = !reason ? result!.rows.find(row => first >= anniversary(h.closedOn, row.year - 1) && last < anniversary(h.closedOn, row.year)) : undefined;
    if (!reason && !row)
        reason = 'The month spans an acquisition-year boundary or is outside the saved model horizon.';
    return { eligible: !!row, reason, year: row?.year || null, ebitda: row ? row.ebitda / 12 : null, capex: row ? (model!.underwritingV2?.results[model!.underwritingV2.activeCase].rows.find(y=>y.year===row.year)?.capex??model!.inputs.capex) / 12 : null, workingCapital: row ? (model!.underwritingV2?.results[model!.underwritingV2.activeCase].rows.find(y=>y.year===row.year)?.deltaNwc??model!.inputs.annualWC) / 12 : null, variance: row ? r.ebitda - row.ebitda / 12 : null };
}
export function operatingPerformance(h: Holding, asOf = today()) {
    const reports = latestReports(h.reports), rows = reports.map(report => ({ report, ...reportCaseComparison(h, report, asOf) })), included = rows.filter(r => r.eligible), actual = included.reduce((s, r) => s + r.report.ebitda, 0), expected = included.reduce((s, r) => s + r.ebitda!, 0), latest = reports[0], m = latest?.operations, retention = m?.customerCohort && m.retainedCustomers !== null ? m.retainedCustomers / m.customerCohort * 100 : null;
    const cohorts = [...new Set(reports.map(r => r.operations?.customerCohort).filter(v => v !== undefined && v !== null))];
    return { reports, rows, included, actual: included.length ? actual : null, expected: included.length ? expected : null, variance: included.length ? actual - expected : null, variancePercent: included.length && expected !== 0 ? (actual - expected) / Math.abs(expected) * 100 : null, retention, cohortChanged: cohorts.length > 1, staffBaselineChanged: new Set(reports.map(r => r.operations?.employeesAtClose).filter(v => v !== undefined && v !== null)).size > 1, staffChange: m && m.headcount !== null && m.employeesAtClose !== null ? m.headcount - m.employeesAtClose : null, open: h.plan.filter(t => t.status !== 'Done'), overdue: h.plan.filter(t => t.status !== 'Done' && t.due < asOf), proposed: h.plan.filter(t => projectContext(t).agreement === 'Proposed') };
}
export function operatingUpdateText(c: Company, h: Holding) { const p = operatingPerformance(h), r = p.reports[0], m = h.transition?.model, fmt = (v: number | null | undefined) => v === null || v === undefined ? 'Unknown' : money(v); return `OPERATING UPDATE — ${c.name}${h.sample ? ' (FICTIONAL SAMPLE)' : ''}\nActual close: ${h.closedOn} · Day ${dayOfOwnership(h)}\nOriginal acquisition case: ${m ? m.inputs.name + ' · v' + m.version : 'No captured model'}\n${p.included.length} complete comparable months\nEBITDA actual ${fmt(p.actual)} · acquisition-case monthly guide ${fmt(p.expected)} · variance ${fmt(p.variance)}\nMethod: saved annual acquisition-year EBITDA divided by 12; even monthly allocation, no seasonality. Excludes partial, unconfirmed, unfinished, and acquisition-year boundary months. ${m?.underwritingV2 ? 'Revenue and operating cash assumptions are retained in the saved annual underwriting case; this operating comparison currently uses EBITDA.' : 'Revenue and cash balance have no acquisition-case forecast in this model.'}\n\nLATEST OPERATING REPORT\n${r ? `${r.period} · revision ${r.revision || 1}\nRevenue ${money(r.revenue)} · management budget ${fmt(r.budgetRevenue)}\nEBITDA ${money(r.ebitda)} · management budget ${fmt(r.budgetEbitda)}\nCash balance ${money(r.cash)}\nCustomer retention ${p.retention === null ? 'Unknown' : p.retention.toFixed(1) + '%'} · staff change ${p.staffChange ?? 'Unknown'}\nSource: ${r.source}\nNotes: ${r.notes}\nNext: ${r.nextAction || 'Not recorded'} · ${r.owner || 'Unassigned'} · ${r.due || 'Unscheduled'}` : 'No operating results recorded.'}\n\nFIRST 100 DAYS\n${h.plan.map(t => `${t.status} · ${t.title}\n${projectContext(t).agreement} · ${t.owner} · ${t.due}\nNext: ${t.nextAction || 'Not recorded'}\nOutcome: ${projectContext(t).outcome}\nMeasure: ${projectContext(t).measure}\nEvidence: ${t.evidence || 'Not recorded'}`).join('\n\n')}\n\nCARRIED FINDINGS\n${h.transition?.findings.map(f => `${f.origin} · ${f.title}\nStatus at handoff: ${f.status}\n${f.detail}\nSource: ${f.source}\n${f.references.map(r => r.label + '\n' + r.excerpt).join('\n')}`).join('\n\n') || 'No historical findings captured.'}\n\nPrepared from manually recorded sources. Original acquisition assumptions remain unchanged; current reports are not independently verified.`; }
export function createOperatingExample(w: Workspace): Workspace {
    const o = w.operating, c = w.companies.find(c => c.sample && c.documents.length) || w.companies.find(c => c.sample);
    if (!o || !c)
        throw Error('A fictional sample company is required.');
    if (o.holdings.some(h => h.dealId === 'illustrative-transition'))
        throw Error('The fictional transition example is already loaded.');
    const now = new Date(today() + 'T12:00:00Z');
    now.setUTCDate(1);
    now.setUTCMonth(now.getUTCMonth() - 2);
    const closedOn = now.toISOString().slice(0, 10), inputs: ModelInputs = { name: 'Illustrative acquisition case', ebitda: 640000, price: 3200000, fees: 120000, initialWC: 100000, debt: 1600000, rate: 9, amortYears: 10, sellerNote: 320000, sellerRate: 6, growth: 3, exitMultiple: 5, years: 5, tax: 25, capex: 40000, annualWC: 20000, ebitdaBasis: 'FICTIONAL EXAMPLE — illustrative starting EBITDA.' }, model: Scenario = { id: 'example-transition-case', companyId: c.id, version: 1, createdAt: closedOn, sourceVersion: 'Fictional example', inputs };
    let h: Holding = { id: id(), companyId: c.id, dealId: 'illustrative-transition', closedOn, investmentCase: 'FICTIONAL EXAMPLE: Preserve customer continuity, retain the technical team, and improve reporting. No real acquisition is represented.', modelSnapshot: JSON.stringify({ inputs }), sample: true, plan: hundredDayPlan(w.firm.operator, closedOn), reports: [] };
    h = captureTransition({ ...w, operating: { ...o, models: [model] } }, h, model.id, true);
    h.transition!.model = model;
    h.transition!.legacy = false;
    h.transition!.modelEvidenceState = 'Illustrative assumptions';
    const f: TransitionFinding = { id: id(), originId: 'example-renewals', origin: 'Deal execution', title: 'Two key customer contracts renew during the first 90 days', detail: 'FICTIONAL EXAMPLE: Agree renewal owners and customer continuity plans.', status: 'Open at illustrative handoff', owner: w.firm.operator, due: operatingDate(closedOn, 30), source: 'Fictional diligence findings', nextAction: 'Call the two key accounts and agree renewal plans.', unresolved: true, references: [{ label: 'Fictional diligence note', excerpt: 'Two key customer contracts renew during the first 90 days.' }] };
    h.transition!.findings = [f];
    h.plan = [...h.plan, projectFromFinding(h, f, w.firm.operator)];
    const next = { ...w, operating: { ...o, holdings: [h, ...o.holdings] } };
    let result: Workspace = next;
    for (let i = 0; i < 2; i++) {
        const d = new Date(closedOn + 'T12:00:00Z');
        d.setUTCMonth(d.getUTCMonth() + i);
        const report: OperatingReportInput = { period: d.toISOString().slice(0, 7), revenue: i ? 280000 : 265000, ebitda: i ? 56000 : 51000, cash: i ? 120000 : 100000, budgetRevenue: 275000, budgetEbitda: 55000, source: 'FICTIONAL management accounts and customer / staff schedules', notes: i ? 'One customer left the original cohort; revenue recovered. Review retention and the open technician role.' : 'Transition costs reduced earnings. Confirm renewal ownership and establish a monthly close routine.', fullMonth: true, operations: { customerCohort: 50, retainedCustomers: i ? 47 : 48, employeesAtClose: 12, headcount: i ? 11 : 12, capex: i ? 4000 : 3000, workingCapital: i ? 2000 : 1500 }, changeReason: 'Illustrative monthly results to demonstrate operating performance against the acquisition case.', owner: w.firm.operator, nextAction: 'Review customer renewals and the staffing gap at the next operating meeting.', due: operatingDate(today(), 7) };
        result = saveOperatingReport(result, h.id, report);
    }
    return result;
}
