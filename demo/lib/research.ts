import { id, today, number, type Company, type Evidence, type Workspace } from './domain.ts';
import { allEvidence, researchFields, ops, newWork, type ResearchQuestion } from './operating.ts';
export const topicHelp: Record<string, {
    prompt: string;
    question: string;
}> = {
    service_mix: { prompt: 'Services, revenue mix, recurring work, and what the business actually does.', question: 'Which services drive revenue, and how much work is recurring or contracted?' },
    customers: { prompt: 'Customer segments, concentration, retention, and routes to market.', question: 'Who are the main customers, and how concentrated is revenue?' },
    locations: { prompt: 'Operating locations, service area, branches, and territory overlap.', question: 'Where does the business operate, and which territories does it serve?' },
    ownership: { prompt: 'Legal ownership, decision-makers, tenure, and succession evidence.', question: 'Who owns the business and who can make a sale decision?' },
    team: { prompt: 'Staff, management responsibilities, owner involvement, and key-person risk.', question: 'Which responsibilities depend on the owner, and who leads the team?' },
    competitors: { prompt: 'Named competitors, geography, service overlap, and differentiation.', question: 'Which businesses compete for the same customers, and how do they differ?' }
};
export const sourceTypes = ['Company website', 'Owner conversation', 'Financial document', 'Public registry', 'Maps listing', 'Trade source', 'Analyst assumption', 'Other'];
export function validSourceDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value && value <= today(); }
export function topicEvidence(c: Company, field: string) { const all = allEvidence(c).filter(e => e.field === field), active = all.filter(e => !e.supersededBy), reported = active.filter(e => !e.disputed && e.kind === 'reported' && e.source.trim() && e.excerpt.trim() && e.value.trim()), assumptions = active.filter(e => e.kind === 'assumption' && !e.disputed), disputed = active.filter(e => e.disputed); return { all, active, reported, assumptions, disputed, status: disputed.length ? 'Disputed evidence' : reported.length ? 'Source recorded' : assumptions.length ? 'Assumption only' : 'Unknown' }; }
export function researchSummary(c: Company) { const active = allEvidence(c).filter(e => !e.supersededBy); return { sources: new Set(active.filter(e => e.source.trim()).map(e => e.source.trim())).size, checked: active.filter(e => e.checkedAt && !e.disputed).length, assumptions: active.filter(e => e.kind === 'assumption').length, disputed: active.filter(e => e.disputed).length, older: active.filter(e => { const d = e.observedOn || e.date.slice(0, 10); return validSourceDate(d) && Date.parse(today() + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z') > 180 * 86400000; }).length }; }
export type EvidenceInput = {
    field: string;
    value: string;
    source: string;
    excerpt: string;
    kind: Evidence['kind'];
    sourceType: string;
    observedOn: string;
};
export function recordEvidence(c: Company, input: EvidenceInput, replacingId?: string): Company { for (const key of ['field', 'value', 'source', 'excerpt'] as const)
    if (!input[key].trim())
        throw Error('A topic, observation, source, and exact excerpt are required.'); if (input.observedOn && !validSourceDate(input.observedOn))
    throw Error('Use a valid source date, today or earlier; leave it blank if unknown.'); if (/^(revenue|ebitda|sde)(_|$)/.test(input.field) && number(input.value) === null)
    throw Error('Financial observations need an amount such as $3.2M.'); const old = replacingId ? allEvidence(c).find(e => e.id === replacingId) : undefined; if (replacingId && (!old || old.supersededBy))
    throw Error('Only a current observation can be revised.'); const e: Evidence = { ...input, kind: input.sourceType === 'Analyst assumption' ? 'assumption' : input.kind, id: id(), date: new Date().toISOString(), ...(old ? { supersedes: old.id } : {}) }; const mark = (x: Evidence) => x.id === old?.id ? { ...x, supersededBy: e.id } : x; return { ...c, status: c.status === 'New' ? 'Researching' : c.status, evidence: [...c.evidence.map(mark), e], documents: c.documents.map(d => ({ ...d, evidence: d.evidence.map(mark) })) }; }
export function reviewEvidence(c: Company, evidenceId: string, action: 'check' | 'dispute' | 'clear', reviewer: string, reason = ''): Company { const e = allEvidence(c).find(e => e.id === evidenceId); if (!e || e.supersededBy)
    throw Error('Select a current observation.'); if (action === 'dispute' && reason.trim().length < 10)
    throw Error('Explain the disagreement in at least 10 characters.'); const trail = [...(e.reviewHistory || []), { action: action === 'check' ? 'Excerpt checked' : action === 'dispute' ? 'Disagreement flagged' : 'Dispute cleared', date: new Date().toISOString(), by: reviewer, reason: reason.trim() }]; const patch = (x: Evidence): Evidence => x.id !== evidenceId ? x : action === 'check' ? { ...x, reviewHistory: trail, checkedAt: new Date().toISOString(), checkedBy: reviewer } : action === 'dispute' ? { ...x, reviewHistory: trail, disputed: true, disputeReason: reason.trim(), checkedAt: undefined, checkedBy: undefined } : { ...x, reviewHistory: trail, disputed: false, disputeReason: undefined, checkedAt: undefined, checkedBy: undefined }; return { ...c, evidence: c.evidence.map(patch), documents: c.documents.map(d => ({ ...d, evidence: d.evidence.map(patch) })) }; }
export function saveQuestion(w: Workspace, q: ResearchQuestion): Workspace { if (!w.companies.some(c => c.id === q.companyId))
    throw Error('Company not found.'); if (q.question.trim().length < 10 || !q.owner.trim() || !q.due)
    throw Error('Write a question and assign an owner and date.'); if (q.status === 'Answered' && (!q.answer.trim() || !q.source.trim()))
    throw Error('An answered question needs an answer and source reference.'); const o = ops(w), questions = o.researchQuestions || []; return { ...w, operating: { ...o, researchQuestions: questions.some(x => x.id === q.id) ? questions.map(x => x.id === q.id ? q : x) : [q, ...questions] } }; }
export function queueQuestion(w: Workspace, questionId: string): Workspace { const o = ops(w), q = o.researchQuestions?.find(q => q.id === questionId), c = w.companies.find(c => c.id === q?.companyId); if (!q || !c)
    throw Error('Question not found.'); if (q.status !== 'Open')
    throw Error('Only an open question can be queued.'); if (q.workItemId && o.work.some(x => x.id === q.workItemId && x.status !== 'Done'))
    throw Error('This question already has active follow-up work.'); const item = { ...newWork(c, 'Follow-up', q.owner), title: q.question, instructions: `Research question: ${q.question}\nRecord the answer and its source in the company research workspace.`, due: q.due, nextAction: q.question, nextDue: q.due }; return { ...w, operating: { ...o, work: [item, ...o.work], researchQuestions: o.researchQuestions!.map(x => x.id === q.id ? { ...x, workItemId: item.id } : x) } }; }
export function defaultQuestion(w: Workspace, c: Company, topic: string): ResearchQuestion { return { id: id(), companyId: c.id, topic, question: topicHelp[topic]?.question || '', owner: w.firm.operator, due: today(), status: 'Open', answer: '', source: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }
export function researchTopicName(field: string) { return researchFields.find(([key]) => key === field)?.[1] || field.replaceAll('_', ' '); }
