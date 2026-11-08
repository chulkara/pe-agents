import {responsibleFor} from './experience.ts';
import { id, today, nextDate, type Company, type Workspace } from './domain.ts';
import { activeDocuments, fingerprint } from './documents.ts';
import type { ExecutionTask, ExecutionPlan } from './operating.ts';
export const executionKinds = ['Document request', 'Diligence question', 'Advisor task', 'Lender request', 'Approval'] as const;
export type ExecutionKind = typeof executionKinds[number];
export type ExecutionSource = {
    documentId: string;
    name: string;
    version: number;
    hash: string;
    excerpt: string;
    locator: string;
};
export type ExecutionReview = {
    id: string;
    decision: 'Approved' | 'Changes requested';
    notes: string;
    by: string;
    recordedBy: string;
    date: string;
    revision: number;
};
export type ExecutionSnapshot = {
    title: string;
    kind: ExecutionKind;
    category: string;
    owner: string;
    due: string;
    nextAction: string;
    requestedFrom: string;
    advisorId: string;
    priority: 'Normal' | 'High';
    status: ExecutionTask['status'];
    critical: boolean;
    dependsOn: string[];
    evidence: string;
    notes: string;
    requiresApproval: boolean;
    approver: string;
    sources: ExecutionSource[];
    revision: number;
};
export type ExecutionHistory = {
    id: string;
    date: string;
    by: string;
    action: string;
    reason: string;
    before?: ExecutionSnapshot;
    after: ExecutionSnapshot;
};
export type ExecutionDetails = {
    kind: ExecutionKind;
    nextAction: string;
    requestedFrom: string;
    advisorId: string;
    priority: 'Normal' | 'High';
    requiresApproval: boolean;
    approver: string;
    revision: number;
    reviews: ExecutionReview[];
    history: ExecutionHistory[];
    sources: ExecutionSource[];
    origin?: string;
};
export type ExecutionItem = ExecutionTask & ExecutionDetails;
export type DealAdvisor = {
    id: string;
    name: string;
    role: string;
    firm: string;
    responsibility: string;
    createdAt: string;
    updatedAt: string;
    history: {
        date: string;
        by: string;
        note: string;
        before?: string;
        after: string;
    }[];
};
export type ExecutionEdit = Pick<ExecutionSnapshot, 'title' | 'kind' | 'category' | 'owner' | 'due' | 'nextAction' | 'requestedFrom' | 'advisorId' | 'priority' | 'status' | 'critical' | 'dependsOn' | 'evidence' | 'notes' | 'requiresApproval' | 'approver' | 'sources'>;
export function executionItem(t: ExecutionTask): ExecutionItem { return { ...t, kind: t.kind || 'Advisor task', nextAction: t.nextAction || '', requestedFrom: t.requestedFrom || '', advisorId: t.advisorId || '', priority: t.priority || 'Normal', requiresApproval: t.requiresApproval || t.kind === 'Approval', approver: t.approver || '', revision: t.revision || 1, reviews: t.reviews || [], history: t.history || [], sources: t.sources || [] }; }
export function executionSnapshot(t: ExecutionTask): ExecutionSnapshot { const x = executionItem(t); return structuredClone({ title: x.title, kind: x.kind, category: x.category, owner: x.owner, due: x.due, nextAction: x.nextAction, requestedFrom: x.requestedFrom, advisorId: x.advisorId, priority: x.priority, status: x.status, critical: x.critical, dependsOn: x.dependsOn, evidence: x.evidence, notes: x.notes, requiresApproval: x.requiresApproval, approver: x.approver, sources: x.sources, revision: x.revision }); }
export function executionSource(c: Company, documentId: string): ExecutionSource { const doc = activeDocuments(c).find(d => d.id === documentId); if (!doc)
    throw Error('Choose a current company document.'); return { documentId: doc.id, name: doc.name, version: doc.version || 1, hash: fingerprint(doc.text), excerpt: doc.text.slice(0, 1200), locator: 'Opening excerpt · first 1,200 characters at most' }; }
export function executionSourceCurrent(c: Company, s: ExecutionSource) { return activeDocuments(c).some(d => d.id === s.documentId && (d.version || 1) === s.version && fingerprint(d.text) === s.hash); }
export function currentExecutionApproval(t: ExecutionTask) { const x = executionItem(t); return x.reviews.find(r => r.revision === x.revision)?.decision === 'Approved'; }
export function executionItemBlockers(plan: ExecutionPlan, c: Company, t: ExecutionTask, seen = new Set<string>()): string[] {
    if (seen.has(t.id))
        return ['Circular dependency'];
    const branch = new Set(seen).add(t.id), x = executionItem(t), out: string[] = [];
    if (x.sources.some(s => !executionSourceCurrent(c, s)))
        out.push('Supporting document revised or removed');
    if (x.status === 'Done' && x.requiresApproval && !currentExecutionApproval(x))
        out.push('Current revision needs approval');
    for (const depId of x.dependsOn) {
        const dep = plan.tasks.find(d => d.id === depId);
        if (!dep)
            out.push('Dependency no longer exists');
        else if (dep.status !== 'Done')
            out.push('Waiting on: ' + dep.title);
        else if (executionItemBlockers(plan, c, dep, branch).length)
            out.push('Dependency needs review: ' + dep.title);
    }
    return [...new Set(out)];
}
export function executionCloseBlockers(plan: ExecutionPlan, c: Company) { return plan.tasks.filter(t => t.critical && (t.status !== 'Done' || executionItemBlockers(plan, c, t).length)).map(t => t.title); }
function dateValid(s: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
    return false; const d = new Date(s + 'T12:00:00Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s; }
function room(w: Workspace, dealId: string) { const o = w.operating, deal = w.deals.find(d => d.id === dealId), c = w.companies.find(c => c.id === deal?.companyId), plan = o?.execution.find(p => p.dealId === dealId); if (!o || !deal || !c || !plan)
    throw Error('Open an execution workspace for this opportunity first.'); if (['Closed', 'Passed'].includes(deal.stage))
    throw Error('This opportunity is closed or passed; its execution record is read-only.'); return { o, deal, c, plan }; }
function put(w: Workspace, plan: ExecutionPlan): Workspace { return { ...w, operating: { ...w.operating!, execution: w.operating!.execution.map(p => p.id === plan.id ? plan : p) } }; }
function validateGraph(tasks: ExecutionTask[]) { const visit = (key: string, path: Set<string>) => { if (path.has(key))
    throw Error('Dependencies cannot form a cycle.'); const t = tasks.find(t => t.id === key); if (!t)
    throw Error('Choose a dependency in this opportunity.'); for (const d of t.dependsOn)
    visit(d, new Set(path).add(key)); }; for (const t of tasks)
    visit(t.id, new Set()); }
export function createExecutionRoom(w: Workspace, dealId: string): Workspace {
    const o = w.operating, deal = w.deals.find(d => d.id === dealId);
    if (!o || !deal || !w.companies.some(c => c.id === deal.companyId))
        throw Error('A reviewed opportunity is required.');
    if (['Closed', 'Passed'].includes(deal.stage))
        throw Error('Choose an active opportunity.');
    if (o.execution.some(p => p.dealId === dealId))
        throw Error('This opportunity already has an execution workspace.');
    const templates: [
        string,
        ExecutionKind,
        string,
        string,
        boolean
    ][] = [
        ['NDA & information access', 'Document request', 'Process', 'Confirm the NDA and request access to the owner’s information.', false],
        ['Financial statements & earnings review', 'Document request', 'Financial', 'Request three years of financial statements and the current year-to-date accounts.', false],
        ['Customer concentration & retention', 'Diligence question', 'Commercial', 'Ask for customer-level revenue and renewal history; identify the largest exposures.', false],
        ['Ownership, contracts & legal review', 'Advisor task', 'Legal', 'Assign counsel and request an ownership, contracts, and legal-risk review.', false],
        ['Financing terms & funding readiness', 'Lender request', 'Financing', 'Ask the lender for the underwriting checklist, indicative terms, and funding conditions.', false],
        ['Confirm investment case & open risks', 'Approval', 'Review', 'Review diligence findings and decide whether the investment case still holds.', true],
        ['Closing documents & advisor sign-off', 'Approval', 'Closing', 'Obtain advisor sign-offs on the final closing documents and unresolved conditions.', true],
        ['Confirm close with human authorization', 'Approval', 'Closing', 'Confirm funding and executed documents before recording the acquisition.', true]
    ];
    const tasks: ExecutionItem[] = templates.map(([title, kind, category, nextAction, approval], i) => ({ id: id(), title, kind, category, nextAction, requiresApproval: approval, approver: approval ? w.firm.reviewer : '', owner: responsibleFor(w,'Execution'), due: nextDate(3 + i * 4), status: 'Open', dependsOn: [], evidence: '', notes: '', critical: true, requestedFrom: '', advisorId: '', priority: 'Normal', revision: 1, reviews: [], history: [], sources: [] }));
    tasks[5].dependsOn = tasks.slice(0, 5).map(t => t.id);
    tasks[6].dependsOn = [tasks[5].id];
    tasks[7].dependsOn = [tasks[6].id];
    for (const t of tasks)
        t.history = [{ id: id(), date: new Date().toISOString(), by: w.firm.operator, action: 'Created from playbook', reason: 'Initial deal execution plan; tailor requests and dates to this opportunity.', after: executionSnapshot(t) }];
    const plan: ExecutionPlan = { id: id(), dealId, tasks, advisors: [], workspaceVersion: 1 };
    return { ...w, operating: { ...o, execution: [plan, ...o.execution] } };
}
export function saveExecutionItem(w: Workspace, dealId: string, taskId: string | undefined, input: ExecutionEdit, reason: string): Workspace {
    const { plan, c } = room(w, dealId), old = taskId ? plan.tasks.find(t => t.id === taskId) : undefined;
    if (taskId && !old)
        throw Error('Execution item not found.');
    if (reason.trim().length < 10)
        throw Error('Explain the update in at least 10 characters.');
    const n: ExecutionItem = { ...(old ? executionItem(old) : { id: id(), revision: 0, reviews: [], history: [] }), ...structuredClone(input), title: input.title.trim(), owner: input.owner.trim(), nextAction: input.nextAction.trim(), requiresApproval: input.requiresApproval || input.kind === 'Approval', approver: input.approver.trim(), revision: (old?.revision || (old ? 1 : 0)) + 1 } as ExecutionItem;
    if (!executionKinds.includes(n.kind) || !['Open', 'In progress', 'Blocked', 'Awaiting approval', 'Done'].includes(n.status))
        throw Error('Choose a valid item type and status.');
    if (!n.title || !n.category.trim() || !n.owner)
        throw Error('Every item needs a title, workstream, and responsible owner.');
    if (!dateValid(n.due))
        throw Error('Set a valid deadline.');
    if (n.status !== 'Done' && !n.nextAction)
        throw Error('An unresolved item needs a concrete next step.');
    if (n.status === 'Blocked' && !n.notes.trim())
        throw Error('Explain the blocker and the action that will unblock it.');
    if (n.requiresApproval && !n.approver)
        throw Error('Name the person responsible for approving this item.');
    if (n.advisorId && !(plan.advisors || []).some(a => a.id === n.advisorId))
        throw Error('Choose an advisor assigned to this opportunity.');
    if (old?.critical && !n.critical && reason.trim().length < 20)
        throw Error('Explain why this item no longer blocks close in at least 20 characters.');
    if (n.sources.some(s => !executionSourceCurrent(c, s)))
        throw Error('Refresh or remove revised document references before saving. The earlier snapshot remains in history.');
    if (old?.status === 'Done' && plan.tasks.some(t => t.status === 'Done' && t.dependsOn.includes(old.id)))
        throw Error('Reopen completed dependent items before changing this completed item.');
    const tasks = old ? plan.tasks.map(t => t.id === old.id ? n : t) : [...plan.tasks, n], next = { ...plan, tasks };
    validateGraph(tasks);
    if (['Done', 'Awaiting approval'].includes(n.status)) {
        if (!n.evidence.trim())
            throw Error('Record an answer, evidence, or advisor confirmation before completion or approval.');
        if (executionItemBlockers(next, c, { ...n, status: 'Open' }).length)
            throw Error('Complete dependency items and refresh their evidence first.');
    }
    if (n.status === 'Done' && n.requiresApproval)
        throw Error('Save as Awaiting approval, then record a decision on the saved revision.');
    if (n.status === 'Awaiting approval' && !n.requiresApproval)
        throw Error('Enable approval and name an approver first.');
    const event: ExecutionHistory = { id: id(), date: new Date().toISOString(), by: w.firm.operator, action: old ? 'Updated item' : 'Created item', reason: reason.trim(), before: old ? executionSnapshot(old) : undefined, after: executionSnapshot(n) };
    n.history = [event, ...n.history];
    return put(w, { ...next, workspaceVersion: 1 });
}
export function reviewExecutionItem(w: Workspace, dealId: string, taskId: string, decision: ExecutionReview['decision'], notes: string): Workspace {
    const { plan, c } = room(w, dealId), old = plan.tasks.find(t => t.id === taskId);
    if (!old)
        throw Error('Execution item not found.');
    const x = executionItem(old);
    if (!x.requiresApproval || x.status !== 'Awaiting approval')
        throw Error('Save this item as Awaiting approval before recording a decision.');
    if (!x.approver.trim())
        throw Error('Name the approver first.');
    if (!['Approved', 'Changes requested'].includes(decision))
        throw Error('Choose a review decision.');
    if (notes.trim().length < 20)
        throw Error('Record the decision and reasoning in at least 20 characters.');
    if (executionItemBlockers(plan, c, x).length)
        throw Error('Resolve dependencies and refresh supporting evidence before review.');
    if (!x.evidence.trim())
        throw Error('Record the supporting answer or confirmation first.');
    const date = new Date().toISOString(), review: ExecutionReview = { id: id(), decision, notes: notes.trim(), by: x.approver, recordedBy: w.firm.operator, date, revision: x.revision };
    const next: ExecutionItem = { ...x, status: decision === 'Approved' ? 'Done' : 'In progress', reviews: [review, ...x.reviews], nextAction: decision === 'Approved' ? '' : `Address review feedback: ${notes.trim()}` };
    next.history = [{ id: id(), date, by: w.firm.operator, action: decision, reason: notes.trim(), before: executionSnapshot(x), after: executionSnapshot(next) }, ...next.history];
    return put(w, { ...plan, tasks: plan.tasks.map(t => t.id === taskId ? next : t) });
}
export function saveDealAdvisor(w: Workspace, dealId: string, advisorId: string | undefined, input: Pick<DealAdvisor, 'name' | 'role' | 'firm' | 'responsibility'>, reason: string): Workspace { const { plan } = room(w, dealId), old = (plan.advisors || []).find(a => a.id === advisorId); if (advisorId && !old)
    throw Error('Advisor not found.'); if (!input.name.trim() || !input.role.trim() || !input.responsibility.trim())
    throw Error('Name the advisor, their role, and their responsibility.'); if (reason.trim().length < 10)
    throw Error('Explain the assignment or change in at least 10 characters.'); const date = new Date().toISOString(), data = { name: input.name.trim(), role: input.role.trim(), firm: input.firm.trim(), responsibility: input.responsibility.trim() }, a: DealAdvisor = { ...data, id: old?.id || id(), createdAt: old?.createdAt || date, updatedAt: date, history: [{ date, by: w.firm.operator, note: reason.trim(), before: old ? JSON.stringify({ name: old.name, role: old.role, firm: old.firm, responsibility: old.responsibility }) : undefined, after: JSON.stringify(data) }, ...(old?.history || [])] }; return put(w, { ...plan, advisors: old ? (plan.advisors || []).map(x => x.id === old.id ? a : x) : [...(plan.advisors || []), a] }); }
export function importExecutionQuestions(w: Workspace, dealId: string): Workspace { const { plan, c } = room(w, dealId), questions = (w.operating!.researchQuestions || []).filter(q => q.companyId === c.id && q.status !== 'Answered' && !plan.tasks.some(t => t.origin === 'research:' + q.id)); if (!questions.length)
    throw Error('No new unresolved research questions to bring into this opportunity.'); let result = w; for (const q of questions) {
    const tasksBefore = result.operating!.execution.find(p => p.dealId === dealId)!.tasks;
    result = saveExecutionItem(result, dealId, undefined, { title: q.question, kind: 'Diligence question', category: q.topic || 'Research', owner: q.owner || w.firm.operator, due: dateValid(q.due) ? q.due : nextDate(7), nextAction: 'Ask the owner or advisor for a sourced answer to: ' + q.question, requestedFrom: '', advisorId: '', priority: 'Normal', status: 'Open', critical: false, dependsOn: [], evidence: '', notes: `Carried from company research (${q.status}). ${q.answer || ''} ${q.source || ''}`.trim(), requiresApproval: false, approver: '', sources: [] }, 'Carry this unresolved research question into deal diligence.');
    const p = result.operating!.execution.find(p => p.dealId === dealId)!;
    result = put(result, { ...p, tasks: p.tasks.map(t => tasksBefore.some(o => o.id === t.id) ? t : { ...t, origin: 'research:' + q.id }) });
} return result; }
export function executionSummary(plan: ExecutionPlan, c: Company, asOf = today()) { const items = plan.tasks.map(executionItem), open = items.filter(t => t.status !== 'Done'), attention = items.filter(t => t.status === 'Blocked' || executionItemBlockers(plan, c, t).length || (t.status !== 'Done' && (!t.owner.trim() || !t.nextAction.trim() || t.due < asOf))); return { items, open, attention, overdue: open.filter(t => t.due < asOf), approvals: items.filter(t => t.status === 'Awaiting approval'), blockers: executionCloseBlockers(plan, c) }; }
export function executionExport(plan: ExecutionPlan, c: Company) { return `DEAL EXECUTION — ${c.name}${c.sample ? ' (FICTIONAL SAMPLE)' : ''}\nOpportunity: ${plan.dealId}\n\n${plan.tasks.map(t => { const x = executionItem(t); return `${x.title}\n${x.kind} · ${x.category} · ${x.status}${x.critical ? ' · Blocks close' : ''}\nOwner: ${x.owner || 'Unassigned'} · Due: ${x.due}\nNext step: ${x.nextAction || 'Not recorded'}\nRequested from: ${x.requestedFrom || 'Not recorded'}\nAdvisor: ${(plan.advisors || []).find(a => a.id === x.advisorId)?.name || 'Not assigned'}\nDependencies: ${x.dependsOn.map(d => plan.tasks.find(t => t.id === d)?.title || 'Missing').join('; ') || 'None'}\nAnswer / confirmation: ${x.evidence || 'Not recorded'}\nNotes: ${x.notes}\n${x.sources.map(s => `Source: ${s.name} · v${s.version}${executionSourceCurrent(c, s) ? '' : ' · REVISED / REMOVED'}\n${s.locator}\n${s.excerpt}`).join('\n')}\nReview history:\n${x.reviews.map(r => `${r.decision} · revision ${r.revision} · ${r.by} · recorded by ${r.recordedBy} · ${r.date}\n${r.notes}`).join('\n') || 'None'}\nChange history:\n${x.history.map(h => `${h.date} · ${h.by} · ${h.action}\n${h.reason}\nBefore: ${h.before ? JSON.stringify(h.before) : 'New item'}\nAfter: ${JSON.stringify(h.after)}`).join('\n')}`; }).join('\n\n')}\n\nADVISOR RESPONSIBILITIES\n${(plan.advisors || []).map(a => `${a.name} · ${a.role} · ${a.firm}\n${a.responsibility}`).join('\n\n') || 'No advisors recorded.'}\n\nLocal coordination record. Requests are not sent; recorded decisions do not verify identity or grant access.`; }
