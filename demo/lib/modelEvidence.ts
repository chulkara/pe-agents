import {legacyUWResult} from './underwriting.ts';
import { id, number, money, type Company, type Workspace, type Evidence } from './domain.ts';
import { activeDocuments, fingerprint, sourceLocation } from './documents.ts';
import { calculateModel, modelDefaults, latestFinancial, type ModelInputs, type Scenario } from './operating.ts';
export const modelFields = [
    { key: 'ebitda', label: 'Starting annual EBITDA', unit: 'USD', section: 'Operating base', aliases: ['ebitda'] },
    { key: 'price', label: 'Purchase enterprise value', unit: 'USD', section: 'Purchase & funding', aliases: ['purchase_price', 'enterprise_value', 'price'] },
    { key: 'fees', label: 'Transaction fees', unit: 'USD', section: 'Purchase & funding', aliases: ['transaction_fees', 'fees'] },
    { key: 'initialWC', label: 'Additional working capital at close', unit: 'USD', section: 'Purchase & funding', aliases: ['initial_working_capital', 'working_capital_at_close', 'working_capital'] },
    { key: 'debt', label: 'Senior debt', unit: 'USD', section: 'Financing terms', aliases: ['senior_debt', 'debt_amount'] },
    { key: 'rate', label: 'Senior interest rate', unit: '%', section: 'Financing terms', aliases: ['senior_rate', 'interest_rate'] },
    { key: 'amortYears', label: 'Senior amortization', unit: 'years', section: 'Financing terms', aliases: ['amortization_years'] },
    { key: 'sellerNote', label: 'Seller note', unit: 'USD', section: 'Financing terms', aliases: ['seller_note'] },
    { key: 'sellerRate', label: 'Seller note interest rate', unit: '%', section: 'Financing terms', aliases: ['seller_rate'] },
    { key: 'growth', label: 'Annual EBITDA growth', unit: '%', section: 'Operating & exit assumptions', aliases: ['historical_growth', 'growth_assumption'] },
    { key: 'tax', label: 'Cash tax rate', unit: '%', section: 'Operating & exit assumptions', aliases: ['tax_rate'] },
    { key: 'capex', label: 'Annual capital spending', unit: 'USD', section: 'Operating & exit assumptions', aliases: ['capex', 'capital_spending'] },
    { key: 'annualWC', label: 'Annual working-capital investment', unit: 'USD', section: 'Operating & exit assumptions', aliases: ['annual_working_capital'] },
    { key: 'exitMultiple', label: 'Exit EBITDA multiple', unit: '×', section: 'Operating & exit assumptions', aliases: ['exit_multiple'] },
    { key: 'years', label: 'Hold period', unit: 'years', section: 'Operating & exit assumptions', aliases: ['hold_years'] }
] as const;
export type ModelField = typeof modelFields[number]['key'];
export type ModelSource = {
    evidenceId: string;
    field: string;
    value: number;
    rawValue: string;
    source: string;
    excerpt: string;
    locator: string;
    documentId?: string;
    documentVersion?: number;
    documentName?: string;
    period: string;
    date: string;
};
export type InputBasis = {
    kind: 'Reported' | 'Assumption';
    reason: string;
    sources: ModelSource[];
};
export type ModelBasis = Record<ModelField, InputBasis>;
export type ModelDraft = {
    inputs: ModelInputs;
    basis: ModelBasis;
    parentId?: string;
};
export type ModelChange = {
    field: ModelField | 'name';
    label: string;
    before: string;
    after: string;
    beforeKind: string;
    afterKind: string;
    reason: string;
    beforeSources: ModelSource[];
    afterSources: ModelSource[];
};
export type ModelAudit = {
    schemaVersion: 1;
    engineVersion: 'annual-cashflow-v1';
    parentId?: string;
    author: string;
    changeReason: string;
    basis: ModelBasis;
    evidenceFingerprint: string;
    changes: ModelChange[];
    result: ReturnType<typeof calculateModel>;
    reviews: {
        decision: 'Needs work' | 'Reviewed';
        notes: string;
        by: string;
        date: string;
    }[];
};
const fields = () => modelFields.map(f => f.key);
const actual = (c: Company) => [...c.evidence, ...activeDocuments(c).flatMap(d => d.evidence)].filter(e => !e.supersededBy);
export function modelEvidenceFingerprint(c: Company) { return fingerprint(JSON.stringify({ docs: activeDocuments(c).map(d => [d.id, d.version || 1, fingerprint(d.text)]), evidence: actual(c).filter(e => number(e.value.replace(/%$/, '')) !== null).map(e => [e.id, e.field, e.value, e.source, e.excerpt, e.kind, e.disputed, e.basis, e.periodKind, e.observedOn, e.date, e.locator]) })); }
function fieldMatches(e: Evidence, key: ModelField) { const name = e.field.replace(/_20\d{2}$/, ''); return (modelFields.find(f => f.key === key)!.aliases as readonly string[]).includes(name); }
export function modelSourceCandidates(c: Company, key: ModelField): ModelSource[] { return actual(c).filter(e => fieldMatches(e, key) && e.kind === 'reported' && !e.disputed && e.source.trim() && e.excerpt.trim() && (e.periodKind || 'Annual') === 'Annual' && !(key === 'ebitda' && (/^adjusted\s+ebitda/i.test(e.excerpt) || e.basis === 'Adjusted EBITDA'))).flatMap(e => { const value = number(e.value.replace(/%$/, '')); if (value === null || !Number.isFinite(value))
    return []; const doc = activeDocuments(c).find(d => d.id === e.docId || d.evidence.some(x => x.id === e.id)); return [{ evidenceId: e.id, field: e.field, value, rawValue: e.value, source: e.source, excerpt: e.excerpt, locator: e.locator || (doc ? sourceLocation(doc, e.excerpt) : 'Recorded observation'), documentId: doc?.id, documentVersion: doc?.version || 1, documentName: doc?.name, period: e.field.match(/20\d{2}$/)?.[0] || 'Undated', date: e.observedOn || e.date }]; }).sort((a, b) => b.period.localeCompare(a.period)); }
export function sourceStillCurrent(c: Company, s: ModelSource) { return actual(c).some(e => e.id === s.evidenceId && e.kind === 'reported' && !e.disputed && number(e.value.replace(/%$/, '')) === s.value && e.source === s.source && e.excerpt === s.excerpt && (e.observedOn || e.date) === s.date); }
export function inputDisplay(key: ModelField | 'name', value: unknown) { if (key === 'name')
    return String(value); const def = modelFields.find(f => f.key === key)!; return typeof value !== 'number' || !Number.isFinite(value) ? 'Not entered' : def.unit === 'USD' ? money(value) : `${value}${def.unit === 'years' ? ' years' : def.unit}`; }
export function createModelDraft(c: Company, base?: Scenario): ModelDraft {
    const basis = {} as ModelBasis;
    for (const key of fields())
        basis[key] = { kind: 'Assumption', reason: '', sources: [] };
    if (base)
        return { inputs: { ...base.inputs }, basis: base.audit ? structuredClone(base.audit.basis) : basis, parentId: base.id };
    const inputs = modelDefaults(c), reported = latestFinancial(c, 'ebitda'), sources = modelSourceCandidates(c, 'ebitda').filter(s => reported.sources.some(e => e.id === s.evidenceId));
    if (!reported.conflict && reported.value !== null && sources.length) {
        basis.ebitda = { kind: 'Reported', reason: 'Starting EBITDA uses the unambiguous reported annual figure.', sources };
        inputs.ebitda = reported.value;
        inputs.ebitdaBasis = sources.map(s => `${s.period} · ${s.source} · ${s.locator}`).join('; ');
    }
    else {
        inputs.ebitda = NaN;
        inputs.ebitdaBasis = 'No unambiguous reported EBITDA; enter an explicit assumption.';
    }
    // Zero purchase price is a placeholder, not an entered bid.
    inputs.price = NaN;
    return { inputs, basis };
}
export function changeModelInput(d: ModelDraft, key: ModelField, value: number): ModelDraft { if (d.basis[key].kind === 'Reported')
    throw Error('Switch to a user assumption before changing a reported value.'); return { ...d, inputs: { ...d.inputs, [key]: value, ...(key === 'ebitda' ? { ebitdaBasis: 'User assumption; see the input rationale and version notes.' } : {}) }, basis: { ...d.basis, [key]: { ...d.basis[key], kind: 'Assumption', reason: '' } } }; }
export function useModelSource(c: Company, d: ModelDraft, key: ModelField, evidenceId: string): ModelDraft {
    const source = modelSourceCandidates(c, key).find(s => s.evidenceId === evidenceId);
    if (!source)
        throw Error('Choose current, undisputed source evidence for this input.');
    if (key === 'ebitda') {
        const relevant = actual(c).filter(e => e.field === source.field && e.kind === 'reported' && (e.periodKind || 'Annual') === 'Annual');
        if (relevant.some(e => e.disputed) || new Set(relevant.map(e => number(e.value)).filter(v => v !== null)).size > 1)
            throw Error('Reported EBITDA sources disagree for this period. Resolve them or use an explicit assumption.');
    }
    const sources = key === 'ebitda' ? modelSourceCandidates(c, key).filter(s => s.field === source.field && s.value === source.value) : [source];
    return { ...d, inputs: { ...d.inputs, [key]: source.value, ...(key === 'ebitda' ? { ebitdaBasis: sources.map(s => `${s.period} · ${s.source} · ${s.locator}`).join('; ') } : {}) }, basis: { ...d.basis, [key]: { kind: key === 'ebitda' ? 'Reported' : 'Assumption', reason: '', sources } } };
}
export function sourceIssues(c: Company, d: ModelDraft) { return fields().flatMap(key => { const basis = d.basis[key], lost = basis.sources.filter(s => !sourceStillCurrent(c, s)); const problems = lost.map(s => ({ key, source: s, message: `${modelFields.find(f => f.key === key)!.label}: the saved source was revised, disputed, or is no longer current.` })); if (key === 'ebitda' && basis.kind === 'Reported' && basis.sources.length) {
    const s = basis.sources[0], all = actual(c).filter(e => e.field === s.field && e.kind === 'reported' && (e.periodKind || 'Annual') === 'Annual');
    if (all.some(e => e.disputed) || new Set(all.map(e => number(e.value)).filter(v => v !== null)).size > 1)
        problems.push({ key, source: s, message: 'Reported EBITDA sources now disagree for the selected period.' });
} return problems; }); }
function basisSignature(b: InputBasis) { return JSON.stringify([b.kind, b.reason, b.sources.map(s => [s.evidenceId, s.field, s.value, s.excerpt, s.source])]); }
export function modelChanges(before: ModelDraft | undefined, after: ModelDraft, reason: string): ModelChange[] { const changes: ModelChange[] = []; for (const f of modelFields) {
    const old = before?.basis[f.key], next = after.basis[f.key];
    if (!before || before.inputs[f.key] !== after.inputs[f.key] || basisSignature(old!) !== basisSignature(next))
        changes.push({ field: f.key, label: f.label, before: before ? inputDisplay(f.key, before.inputs[f.key]) : 'Not previously saved', after: inputDisplay(f.key, after.inputs[f.key]), beforeKind: old?.kind || 'Not recorded', afterKind: next.kind, reason: next.reason.trim() || reason, beforeSources: old?.sources || [], afterSources: next.sources });
} if (before?.inputs.name !== after.inputs.name)
    changes.push({ field: 'name', label: 'Scenario name', before: before?.inputs.name || 'Not previously saved', after: after.inputs.name, beforeKind: 'Label', afterKind: 'Label', reason, beforeSources: [], afterSources: [] }); return changes; }
export function saveModelVersion(w: Workspace, companyId: string, d: ModelDraft, reason: string): Workspace {
    const o = w.operating, c = w.companies.find(c => c.id === companyId);
    if (!o || !c)
        throw Error('Company not found.');
    if (reason.trim().length < 20)
        throw Error('Explain this version and why its assumptions changed in at least 20 characters.');
    const result = calculateModel(d.inputs), parent = d.parentId ? o.models.find(m => m.id === d.parentId && m.companyId === c.id) : undefined;
    if (d.parentId && !parent)
        throw Error('The selected parent version was not found.');
    for (const key of fields()) {
        const b = d.basis[key];
        if (!b || !['Reported', 'Assumption'].includes(b.kind))
            throw Error('Classify every model input.');
        if (b.kind === 'Reported' && (key !== 'ebitda' || !b.sources.length || b.sources.some(s => s.value !== d.inputs[key] || !modelSourceCandidates(c, key).some(x => x.evidenceId === s.evidenceId && x.field === s.field && x.value === s.value && x.excerpt === s.excerpt))))
            throw Error('A reported input must match its current supporting evidence.');
    }
    const issues = sourceIssues(c, d);
    if (issues.some(i => d.basis[i.key].kind === 'Reported'))
        throw Error('Refresh or replace the reported evidence before saving this version.');
    // Historical evidence may remain background for an assumption, with an explicit explanation.
    for (const issue of issues)
        if (d.basis[issue.key].kind === 'Assumption' && d.basis[issue.key].reason.trim().length < 10)
            throw Error('Explain why you are retaining an assumption supported by older evidence.');
    const changes = modelChanges(parent ? createModelDraft(c, parent) : undefined, d, reason.trim());
    const audit: ModelAudit = { schemaVersion: 1, engineVersion: 'annual-cashflow-v1', parentId: parent?.id, author: w.firm.operator, changeReason: reason.trim(), basis: structuredClone(d.basis), evidenceFingerprint: modelEvidenceFingerprint(c), changes: structuredClone(changes), result: structuredClone(result), reviews: [] };
    const m: Scenario = { id: id(), companyId: c.id, version: Math.max(0, ...o.models.filter(m => m.companyId === c.id).map(m => m.version)) + 1, createdAt: new Date().toISOString(), sourceVersion: audit.evidenceFingerprint, inputs: { ...d.inputs }, audit };
    return { ...w, operating: { ...o, models: [m, ...o.models] } };
}
export function reviewModelVersion(w: Workspace, scenarioId: string, notes: string, decision: 'Needs work' | 'Reviewed'): Workspace { const o = w.operating, m = o?.models.find(m => m.id === scenarioId), c = w.companies.find(c => c.id === m?.companyId); if (!o || !m?.audit || !c)
    throw Error('Save an evidence-linked model before recording a review.'); if (m.audit.evidenceFingerprint !== modelEvidenceFingerprint(c))
    throw Error('The evidence changed. Save a current version before reviewing.'); if (sourceIssues(c, createModelDraft(c, m)).some(i => m.audit!.basis[i.key].kind === 'Reported'))
    throw Error('The reported evidence needs refreshing.'); if (notes.trim().length < 20)
    throw Error('Record your review and remaining risks in at least 20 characters.'); if (!['Needs work', 'Reviewed'].includes(decision))
    throw Error('Choose a review decision.'); const review = { decision, notes: notes.trim(), by: w.firm.reviewer, date: new Date().toISOString() }; return { ...w, operating: { ...o, models: o.models.map(x => x.id === m.id ? { ...x, audit: { ...m.audit!, reviews: [review, ...m.audit!.reviews] } } : x) } }; }
export function scenarioResult(m: Scenario) { return m.underwritingV2?legacyUWResult(m.underwritingV2.results[m.underwritingV2.activeCase]):m.audit?.result || calculateModel(m.inputs); }
export function compareModels(before: Scenario, after: Scenario) { const c = { id: after.companyId } as Company, changes = modelChanges(createModelDraft(c, before), createModelDraft(c, after), after.audit?.changeReason || 'No rationale recorded in this earlier version.'); const a = scenarioResult(before), b = scenarioResult(after); return { changes, directParent: after.audit?.parentId === before.id, metrics: [{ label: 'Initial equity', before: a.equity, after: b.equity, unit: 'USD' }, { label: 'Equity MOIC', before: a.moic, after: b.moic, unit: '×' }, { label: 'Annual equity IRR', before: a.irr === null ? null : a.irr * 100, after: b.irr === null ? null : b.irr * 100, unit: '%' }, { label: 'Year-one cash to equity', before: a.rows[0].cash, after: b.rows[0].cash, unit: 'USD' }, { label: 'Equity proceeds at exit', before: a.exitEquity, after: b.exitEquity, unit: 'USD' }] }; }
export function modelVersionText(c: Company, m: Scenario) { return `ACQUISITION MODEL — ${c.name}\nVersion ${m.version} · ${m.inputs.name}\nSaved ${m.createdAt}\n${m.audit ? `Author: ${m.audit.author}\nReason: ${m.audit.changeReason}\nEngine: ${m.audit.engineVersion}` : 'Legacy version: input sources and change reasons were not captured.'}\n\nINPUT LEDGER\n${modelFields.map(f => { const b = m.audit?.basis[f.key]; return `${f.label}: ${inputDisplay(f.key, m.inputs[f.key])}\nBasis: ${b?.kind || 'Legacy / unclassified'}\nReason: ${b?.reason || m.audit?.changeReason || 'Not recorded'}\n${(b?.sources || []).map(s => `Source: ${s.source} · ${s.locator} · ${s.period}${s.documentId ? ' · document v' + s.documentVersion : ''}\nQuoted value: ${s.rawValue}\nExcerpt: ${s.excerpt}`).join('\n')}`; }).join('\n\n')}\n\nCHANGES FROM PARENT\n${(m.audit?.changes || []).map(x => `${x.label}: ${x.before} → ${x.after}\n${x.beforeKind} → ${x.afterKind}\nWhy: ${x.reason}`).join('\n\n')}\n\nRESULTS\n${JSON.stringify(scenarioResult(m), null, 2)}\n\nREVIEW HISTORY\n${(m.audit?.reviews || []).map(r => `${r.date} · ${r.by} · ${r.decision}\n${r.notes}`).join('\n') || 'No review recorded.'}`; }
