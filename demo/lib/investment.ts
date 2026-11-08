import {reviewPolicyVersion} from './experience.ts';
import { id, today, nextDate, money, number, screen, type Company, type Workspace, type Evidence, type Firm } from './domain.ts';
import { activeDocuments, fingerprint, sourceLocation } from './documents.ts';
import { ownerContext } from './relationships.ts';
import type { InvestmentBrief } from './operating.ts';
export type BriefSource = {
    id: string;
    key: string;
    label: string;
    locator: string;
    excerpt: string;
    documentId?: string;
    documentName?: string;
    documentVersion?: number;
    documentText?: string;
    kind: string;
};
export type BriefClaim = {
    key: string;
    title: string;
    text: string;
    status: 'Reported' | 'Calculated' | 'Discrepancy' | 'Unknown' | 'Assumption' | 'Suggested request';
    sourceIds: string[];
    formula?: string;
    topic?: string;
};
export type BriefFinancial = {
    period: string;
    kind: string;
    revenue: BriefClaim;
    ebitda: BriefClaim;
    adjusted: BriefClaim;
    margin: BriefClaim;
    growth: BriefClaim;
};
export type BriefManifest = {
    id: string;
    familyId: string;
    name: string;
    version: number;
    hash: string;
    text?: string;
};
export type BriefSnapshot = {
    engineVersion: 1;
    companyName: string;
    sample: boolean;
    preparedAt: string;
    sourceVersion: string;
    sources: BriefSource[];
    documents: BriefManifest[];
    quality: BriefClaim[];
    financials: BriefFinancial[];
    concentration: BriefClaim[];
    inconsistencies: BriefClaim[];
    questions: BriefClaim[];
    requests: BriefClaim[];
    owner: BriefClaim[];
    limitations: string[];
};
const topics = [['service_mix', 'Services & revenue mix', 'Send a revenue breakdown by service, including recurring and project work.'], ['customers', 'Customers & retention', 'Send customer-level revenue for the last three years, with lost and newly won customers.'], ['ownership', 'Ownership', 'Confirm the legal owners, ownership percentages, and who can authorize a sale.'], ['locations', 'Locations & territory', 'Provide the operating locations, service territory, and lease schedule.'], ['team', 'Team & owner dependence', 'Provide an employee roster and explain which responsibilities depend on the owner.'], ['competitors', 'Competition', 'Identify the main competitors and explain how customers choose between them.'], ['recurring_revenue', 'Recurring revenue', 'Provide contract terms, renewal dates, and evidence supporting recurring revenue.']] as const;
const evidence = (c: Company) => [...c.evidence, ...activeDocuments(c).flatMap(d => d.evidence)].filter(e => !e.supersededBy);
function firmFor(w: Workspace, c: Company): Firm { const p = w.operating?.platforms.find(x => x.id === w.operating?.assignments[c.id]); return p ? { ...w.firm, ...p } : w.firm; }
export function investmentFingerprint(w: Workspace, c: Company) { return fingerprint(JSON.stringify({ name: c.name, city: c.city, state: c.state, industry: c.industry, docs: c.documents, evidence: c.evidence, firm: firmFor(w, c), reviewPolicy:reviewPolicyVersion(w), memories: w.operating?.memories.filter(m => m.companyId === c.id) })); }
export function buildBriefSnapshot(w: Workspace, c: Company): BriefSnapshot {
    const sources: BriefSource[] = [], seen = new Map<string, string>(), docs = activeDocuments(c), rows = evidence(c), questions: BriefClaim[] = [], requests: BriefClaim[] = [], inconsistencies: BriefClaim[] = [];
    const addSource = (e: Evidence) => { if (seen.has(e.id))
        return seen.get(e.id)!; const doc = docs.find(d => d.id === e.docId || d.evidence.some(x => x.id === e.id)); const ref = 'S' + (sources.length + 1); seen.set(e.id, ref); sources.push({ id: ref, key: e.id, label: e.source || doc?.name || 'Reference not recorded', locator: e.locator || (doc ? sourceLocation(doc, e.excerpt) : 'Recorded observation'), excerpt: e.excerpt, documentId: doc?.id, documentName: doc?.name, documentVersion: doc?.version || 1, kind: e.disputed ? 'Disputed' : e.kind === 'assumption' ? 'Assumption' : 'Source reported' }); return ref; };
    const claim = (key: string, title: string, text: string, status: BriefClaim['status'], es: Evidence[] = [], formula?: string): BriefClaim => ({ key, title, text, status, sourceIds: es.map(addSource), ...(formula ? { formula } : {}) });
    const ask = (key: string, title: string, text: string, es: Evidence[] = []) => { questions.push(claim('question:' + key, title, text, 'Unknown', es)); };
    const request = (key: string, title: string, text: string, es: Evidence[] = [], topic?: string) => requests.push({ ...claim('request:' + key, title, text, 'Suggested request', es), topic });
    const quality: BriefClaim[] = [];
    for (const [field, label, followup] of topics) {
        const all = rows.filter(e => e.field === field), reported = all.filter(e => e.kind === 'reported' && !e.disputed && e.excerpt.trim() && e.source.trim());
        if (reported.length)
            for (const e of reported)
                quality.push(claim(`quality:${field}:${docs.find(d => d.evidence.some(x => x.id === e.id))?.familyId || e.docId || e.id}:${e.excerpt.split(/[:=]/)[0].trim()}`, label, e.value, 'Reported', [e]));
        else {
            quality.push(claim('quality:' + field, label, 'No current sourced observation recorded.', 'Unknown'));
            ask(field, label, `What evidence establishes ${label.toLowerCase()}?`);
            request(field, label, followup, [], field);
        }
        for (const e of all.filter(e => e.kind === 'assumption' || e.disputed))
            quality.push(claim('review:' + e.id, label, e.value, e.disputed ? 'Discrepancy' : 'Assumption', [e]));
        if (all.some(e => e.disputed))
            inconsistencies.push(claim('disputed:' + field, `Disputed ${label.toLowerCase()}`, 'An observation has been flagged for disagreement. Resolve it before relying on this topic.', 'Discrepancy', all.filter(e => e.disputed)));
    }
    // Unstructured passages remain quotations, without turning keyword matches into conclusions.
    const passageRules: [
        string,
        string,
        RegExp
    ][] = [['service_mix', 'Services passage', /\b(?:provides?|installs?|maintains?|specializes?|services include)\b/i], ['customers', 'Customer passage', /\b(?:customers?|clients?|retention|churn)\b/i], ['team', 'Team passage', /\b(?:employees?|technicians?|owner.depend|management team)\b/i], ['recurring_revenue', 'Recurring-revenue passage', /\b(?:recurring|contracted|renewals?)\b/i]];
    for (const [field, label, re] of passageRules) {
        if (rows.some(e => e.field === field && e.kind === 'reported' && !e.disputed))
            continue;
        let count = 0;
        for (const doc of docs) {
            for (const line of doc.text.split('\n').map(x => x.trim()).filter(x => x.length >= 30 && x.length <= 1200)) {
                if (!re.test(line) || rows.some(e => e.excerpt === line) || count >= 2)
                    continue;
                const e: Evidence = { id: `passage:${doc.id}:${field}:${count}`, field, value: line, source: doc.name, excerpt: line, kind: 'reported', date: doc.uploadedAt || '', docId: doc.id };
                quality.push(claim(`passage:${doc.familyId || doc.id}:${field}:${count}`, label, line, 'Reported', [e]));
                count++;
            }
        }
    }
    const fin = rows.filter(e => /^(?:revenue|ebitda|adjusted_ebitda|sde)(?:_|$)/.test(e.field));
    const metricOf = (e: Evidence) => e.field.startsWith('adjusted_ebitda') || /^adjusted\s+ebitda/i.test(e.excerpt) ? 'adjusted_ebitda' : e.field.split('_')[0];
    const periodOf = (e: Evidence) => e.field.match(/20\d{2}$/)?.[0] || 'Undated';
    const periods = [...new Set(fin.map(e => periodOf(e) + '|' + (e.periodKind || 'Annual')))].sort((a, b) => a.localeCompare(b));
    const financials: BriefFinancial[] = [];
    const usable = (es: Evidence[]) => es.filter(e => e.kind === 'reported' && !e.disputed && e.excerpt.trim() && e.source.trim());
    const metric = (period: string, kind: string, m: string, label: string) => {
        const all = fin.filter(e => periodOf(e) === period && (e.periodKind || 'Annual') === kind && metricOf(e) === m), es = usable(all), vals = [...new Set(es.map(e => number(e.value)).filter((x): x is number => x !== null))], conflict = all.some(e => e.disputed) || vals.length > 1;
        const key = `financial:${period}:${kind}:${m}`;
        if (conflict) {
            const q = claim(key, label, `CONFLICT — ${all.map(e => money(number(e.value))).join(' vs ')}. Resolve the reported figures for ${period} ${kind}.`, 'Discrepancy', all);
            inconsistencies.push(q);
            request(key, label, `Reconcile ${label.toLowerCase()} for ${period} ${kind}; explain the source, period, accounting basis, and adjustments.`, all);
            return { value: null, claim: q, es: all };
        }
        if (vals.length === 1)
            return { value: vals[0], claim: claim(key, label, money(vals[0]), 'Reported', es), es };
        return { value: null, claim: claim(key, label, 'Unknown — no usable reported figure.', 'Unknown', all), es: all };
    };
    let previous: {
        year: number;
        value: number;
        es: Evidence[];
    } | undefined;
    for (const p of periods) {
        const [period, kind] = p.split('|'), r = metric(period, kind, 'revenue', 'Revenue'), e = metric(period, kind, 'ebitda', 'EBITDA'), a = metric(period, kind, 'adjusted_ebitda', 'Adjusted EBITDA');
        let margin = claim(`margin:${p}`, 'EBITDA margin', 'Not calculated — reported revenue and EBITDA for the same period are required.', 'Unknown');
        if (period !== 'Undated' && r.value !== null && r.value > 0 && e.value !== null)
            margin = claim(`margin:${p}`, 'EBITDA margin', `${(e.value / r.value * 100).toFixed(1)}%`, 'Calculated', [...r.es, ...e.es], `EBITDA ${e.value} ÷ revenue ${r.value} × 100. Adjusted EBITDA is excluded.`);
        let growth = claim(`growth:${p}`, 'Revenue growth', 'Not calculated — comparable consecutive annual periods are required.', 'Unknown');
        if (kind === 'Annual' && period !== 'Undated' && r.value !== null) {
            const year = Number(period);
            if (previous && previous.year === year - 1 && previous.value > 0)
                growth = claim(`growth:${p}`, 'Revenue growth', `${((r.value / previous.value - 1) * 100).toFixed(1)}% year over year`, 'Calculated', [...previous.es, ...r.es], `(${r.value} ÷ ${previous.value} − 1) × 100; ${previous.year} to ${period}.`);
            previous = { year, value: r.value, es: r.es };
        }
        financials.push({ period, kind, revenue: r.claim, ebitda: e.claim, adjusted: a.claim, margin, growth });
    }
    if (!financials.length) {
        ask('financials', 'Financial history', 'What are reported revenue and EBITDA for the last three completed fiscal years?');
        request('financials', 'Financial statements', 'Provide three years of annual P&Ls, balance sheets, and recent monthly results, with currency, reporting units, and period labels.');
    }
    else {
        if (fin.some(e => periodOf(e) === 'Undated')) {
            ask('periods', 'Reporting periods', 'Which reporting periods do the undated figures cover?');
            request('periods', 'Period labels', 'Label each financial figure with its fiscal year or exact interim period; undated figures cannot establish a trend.');
        }
        const annual = financials.filter(x => x.kind === 'Annual' && x.period !== 'Undated');
        if (annual.length < 2) {
            ask('trend', 'Comparable history', 'Is there enough comparable annual history to assess a trend?');
            request('trend', 'Comparable history', 'Provide at least two consecutive years of financial statements on a consistent accounting basis.');
        }
        if (annual.some(x => x.ebitda.status === 'Unknown'))
            request('ebitda', 'Reported earnings', 'Provide reported EBITDA and a bridge to any adjusted EBITDA or SDE.');
        if (fin.some(e => metricOf(e) === 'sde'))
            request('sde', 'Earnings definitions', 'Reconcile SDE to EBITDA; separate owner compensation and every proposed add-back.', fin.filter(e => metricOf(e) === 'sde'));
    }
    for (const e of fin.filter(e => e.kind === 'assumption' || e.disputed))
        if (!inconsistencies.some(x => x.sourceIds.includes(addSource(e))))
            inconsistencies.push(claim('financial-review:' + e.id, 'Financial basis needs review', `${e.field}: ${e.value}. ${e.basis || e.kind} figures are excluded from clean reported trends.`, 'Discrepancy', [e]));
    const concentrations = rows.filter(e => e.field === 'customer_concentration' || e.field === 'supplier_concentration'), concentration: BriefClaim[] = [];
    for (const e of concentrations)
        concentration.push(claim('concentration:' + (docs.find(d => d.evidence.some(x => x.id === e.id))?.familyId || e.docId || e.id) + ':' + e.excerpt.split(/[:=]/)[0].trim(), e.excerpt.split(/[:=]/)[0].trim() || 'Concentration reported', e.value, e.disputed ? 'Discrepancy' : e.kind === 'assumption' ? 'Assumption' : 'Reported', [e]));
    const concentrationGroups = new Map<string, Evidence[]>();
    for (const e of concentrations) {
        if (e.kind !== 'reported' || e.disputed)
            continue;
        const label = e.excerpt.split(/[:=]/)[0].trim().toLowerCase();
        if (!/largest customer|top (?:customer|[0-9]+ customers)/.test(label))
            continue;
        const pct = e.value.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
        if (!pct)
            continue;
        if (Number(pct[1]) > 100)
            inconsistencies.push(claim('concentration-invalid:' + e.id, 'Invalid concentration percentage', 'The reported concentration exceeds 100%. Check the source and denominator.', 'Discrepancy', [e]));
        concentrationGroups.set(label, [...(concentrationGroups.get(label) || []), e]);
    }
    for (const [key, es] of concentrationGroups) {
        const values = new Set(es.map(e => e.value.match(/([0-9]+(?:\.[0-9]+)?)\s*%/)?.[1]));
        if (values.size > 1) {
            inconsistencies.push(claim('concentration-conflict:' + key, 'Concentration sources disagree', 'Current sources report different shares for ' + key + '. Reconcile the period and revenue denominator.', 'Discrepancy', es));
            request('concentration-conflict:' + key, 'Reconcile concentration', 'Reconcile the differing shares for ' + key + ' against customer-level revenue.', es, 'customers');
        }
    }
    if (!concentration.length) {
        concentration.push(claim('concentration:unknown', 'Customer concentration', 'Unknown — customer-level revenue has not established concentration.', 'Unknown'));
        ask('concentration', 'Customer concentration', 'How much revenue comes from the largest customer and the top five customers?');
    }
    request('concentration', 'Customer dependency', 'Provide customer-level revenue by year, the largest/top-five shares, contract expiry dates, and any related-party revenue.', concentrations, 'customers');
    for (const doc of docs)
        for (const warning of doc.warnings || []) {
            const e: Evidence = { id: 'warning:' + doc.id + ':' + warning, field: 'document_review', value: warning, source: doc.name, excerpt: doc.text.split('\n').slice(0, 8).join('\n'), kind: 'reported', date: doc.uploadedAt || '', docId: doc.id };
            if (warning.startsWith('Non-USD'))
                inconsistencies.push(claim('warning:' + doc.id, 'Currency needs review', warning, 'Discrepancy', [e]));
        }
    const recurring = rows.filter(e => e.field === 'recurring_revenue' && e.kind === 'reported' && !e.disputed);
    if (recurring.length) {
        ask('recurring-validation', 'Recurring-revenue quality', 'How much recurring work is under signed contracts, and what are renewal and cancellation rates?', recurring);
        request('recurring-validation', 'Contracted revenue', 'Provide the contract register, renewal/cancellation history, and a reconciliation to the reported recurring-revenue share.', recurring, 'recurring_revenue');
    }
    const team = rows.filter(e => e.field === 'team' && e.kind === 'reported' && !e.disputed);
    if (team.length) {
        ask('owner-dependence', 'Management continuity', 'Which customer relationships and operating decisions depend on the owner, and who can take them over?', team);
        request('owner-dependence', 'Owner handover', 'Provide the responsibility map, key-person retention plans, and the proposed owner transition schedule.', team, 'team');
    }
    const adjusted = fin.filter(e => metricOf(e) === 'adjusted_ebitda' && e.kind === 'reported' && !e.disputed);
    if (adjusted.length) {
        ask('addbacks', 'Earnings adjustments', 'What adjustments bridge reported EBITDA to adjusted EBITDA, and which are recurring?', adjusted);
        request('addbacks', 'EBITDA adjustment bridge', 'Provide an itemized reported-to-adjusted EBITDA bridge, supporting invoices, and explanations for each add-back.', adjusted);
    }
    if (concentrations.length)
        ask('customer-retention', 'Customer durability', 'What are the largest customers’ renewal dates, cancellation rights, and recent retention history?', concentrations);
    const owner = ownerContext(w, c).filter(t => t.value).map(t => { const e: Evidence = { id: 'owner:' + t.entry!.id + ':' + t.key, field: t.key, value: t.value, source: t.entry!.source, excerpt: t.value, kind: 'reported', date: t.entry!.date }; return claim('owner:' + t.key, t.label, t.value, 'Reported', [e]); });
    const limits = ['Structured first-pass compilation of recorded evidence; model-powered analysis and OCR are not connected.', 'Source reported means the source makes the claim; it is not independent verification.', 'No earnings normalization, quality-of-earnings review, valuation recommendation, or completeness guarantee.', 'Financial amounts display in USD conventions. Confirm currency, units, accounting basis, and annual versus interim periods before relying on comparisons.', ...docs.flatMap(d => d.warnings || [])];
    return { engineVersion: 1, companyName: c.name, sample: c.sample, preparedAt: new Date().toISOString(), sourceVersion: investmentFingerprint(w, c), documents: docs.map(d => ({ id: d.id, familyId: d.familyId || d.id, name: d.name, version: d.version || 1, hash: fingerprint(d.text), text: d.text })), sources, quality, financials, concentration, inconsistencies, questions, requests, owner, limitations: limits };
}
export function allClaims(s: BriefSnapshot) { return [...s.quality, ...s.financials.flatMap(f => [f.revenue, f.ebitda, f.adjusted, f.margin, f.growth]), ...s.concentration, ...s.inconsistencies, ...s.questions, ...s.requests, ...s.owner]; }
export function briefText(s: BriefSnapshot) { const render = (items: BriefClaim[]) => items.map(c => `${c.title}: ${c.text} [${c.status}] ${c.sourceIds.map(x => '[' + x + ']').join(' ')}${c.formula ? '\nCalculation: ' + c.formula : ''}`).join('\n\n'); return `INVESTMENT BRIEF — ${s.companyName}${s.sample ? ' (FICTIONAL SAMPLE)' : ''}\nPrepared ${s.preparedAt}\n\nBUSINESS QUALITY — EVIDENCE TO REVIEW\n${render(s.quality)}\n\nFINANCIAL TRENDS\n${s.financials.map(f => `${f.period} · ${f.kind}\n${render([f.revenue, f.ebitda, f.adjusted, f.margin, f.growth])}`).join('\n\n') || 'No usable financial periods recorded.'}\n\nCONCENTRATION\n${render(s.concentration)}\n\nINCONSISTENCIES\n${render(s.inconsistencies) || 'No conflicts detected in the limited extracted checks. This does not establish consistency of the complete documents.'}\n\nUNANSWERED QUESTIONS\n${render(s.questions)}\n\nSUGGESTED FOLLOW-UP REQUESTS\n${render(s.requests)}\n\nOWNER CONTEXT\n${render(s.owner) || 'Owner priorities are not recorded.'}\n\nSOURCE REGISTER\n${s.sources.map(r => `[${r.id}] ${r.label} · ${r.locator}${r.documentId ? ' · Document v' + r.documentVersion : ''}\n${r.excerpt}\nBasis: ${r.kind}`).join('\n\n')}\n\nPREPARATION LIMITS\n${s.limitations.join('\n')}`; }
export function prepareInvestmentBrief(w: Workspace, c: Company): InvestmentBrief { const versions = w.operating?.briefs.filter(b => b.companyId === c.id) || [], snapshot = buildBriefSnapshot(w, c); return { id: id(), companyId: c.id, version: Math.max(0, ...versions.map(b => b.version)) + 1, createdAt: new Date().toISOString(), sourceVersion: snapshot.sourceVersion, body: briefText(snapshot), snapshot, caseNotes: '', decision: 'Needs information', approved: false, reviewer: '', reviewedAt: '' }; }
export function compareBriefs(before: BriefSnapshot, after: BriefSnapshot) { const docs = after.documents.flatMap(d => { const old = before.documents.find(o => o.familyId === d.familyId); return !old ? [`Added ${d.name} (v${d.version}).`] : old.hash !== d.hash || old.id !== d.id ? [`Revised ${d.name}: v${old.version} → v${d.version}.`] : []; }); for (const d of before.documents)
    if (!after.documents.some(x => x.familyId === d.familyId))
        docs.push(`Removed from current inputs: ${d.name}.`); const old = new Map(allClaims(before).map(c => [c.key, c])), next = new Map(allClaims(after).map(c => [c.key, c])); const changes: {
    title: string;
    before: string;
    after: string;
}[] = []; for (const [key, c] of next) {
    const prev = old.get(key);
    if (!prev || prev.text !== c.text || prev.status !== c.status)
        changes.push({ title: c.title, before: prev?.text || 'Not previously recorded', after: c.text });
} for (const [key, c] of old)
    if (!next.has(key))
        changes.push({ title: c.title, before: c.text, after: 'No longer in the current brief' }); return { documents: docs, claims: changes }; }
export function reviewInvestmentBrief(w: Workspace, briefId: string, caseNotes: string, decision: InvestmentBrief['decision']): Workspace { const o = w.operating, b = o?.briefs.find(b => b.id === briefId), c = w.companies.find(c => c.id === b?.companyId); if (!o || !b || !c)
    throw Error('Brief not found.'); if (!b.snapshot || b.sourceVersion !== investmentFingerprint(w, c))
    throw Error('Prepare a current brief before approving.'); if (caseNotes.trim().length < 20)
    throw Error('Record your judgment and remaining risks in at least 20 characters.'); if (!['Needs information', 'Advance', 'Pass'].includes(decision))
    throw Error('Choose a review decision.'); return { ...w, operating: { ...o, briefs: o.briefs.map(x => x.id === b.id ? { ...x, approved: true, caseNotes: caseNotes.trim(), decision, reviewer: w.firm.reviewer, reviewedAt: new Date().toISOString() } : x) } }; }
export function queueInvestmentRequest(w: Workspace, briefId: string, requestKey: string): Workspace { const o = w.operating, b = o?.briefs.find(b => b.id === briefId), c = w.companies.find(c => c.id === b?.companyId); if (!o || !b?.snapshot || !c || b.sourceVersion !== investmentFingerprint(w, c))
    throw Error('Prepare a current brief before queuing its requests.'); const request = b.snapshot.requests.find(r => r.key === requestKey); if (!request)
    throw Error('Request not found.'); if (o.work.some(x => x.companyId === c.id && x.briefRequestKey === request.key && x.status !== 'Done'))
    throw Error('This request already has active work.'); const refs = b.snapshot.sources.filter(s => request.sourceIds.includes(s.id)); const item: import('./operating.ts').WorkItem = { id: id(), companyId: c.id, kind: 'Follow-up', title: request.title + ' · ' + c.name, owner: w.firm.operator, due: nextDate(2), priority: 'Normal', status: 'Queued', instructions: `Suggested information request from investment brief v${b.version}:\n${request.text}\n${refs.map(s => `[${s.id}] ${s.label} · ${s.locator}\n${s.excerpt}`).join('\n')}\nDraft only. Review and contact the owner yourself; nothing is sent.`, output: '', sourceVersion: '', preparedAt: '', reviewedBy: '', reviewedAt: '', nextAction: request.text, nextDue: nextDate(2), briefId: b.id, briefRequestKey: request.key }; return { ...w, operating: { ...o, work: [item, ...o.work] } }; }
