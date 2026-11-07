import { id, today, nextDate, type Company, type Workspace } from './domain.ts';
import type { OwnerMemory, OwnerPromise, OperatingData, WorkItem } from './operating.ts';
export const ownerTopics = [['timing', 'Timing', 'What would make the timing right for a next chapter?'], ['employees', 'Employees', 'What would you want to protect for your employees?'], ['legacy', 'Legacy', 'What should stay the same about the name, reputation, and customer relationships?'], ['involvement', 'Life after a sale', 'How would you like to be involved after a sale?'], ['priorities', 'Other priorities', 'What else matters to you as you think about the future?']] as const;
export type OwnerTopic = typeof ownerTopics[number][0];
export const readinessOptions = ['Unknown', 'Exploring', 'Not now', 'Ready to discuss'] as const;
export function calendarDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value; }
const state = (w: Workspace): OperatingData => {
    if (!w.operating)
        throw Error('Open the acquisition workspace first.');
    return w.operating;
};
export function ownerHistory(w: Workspace, c: Company, includeRevisions = false) { return [...(w.operating?.memories || [])].filter(m => m.companyId === c.id && calendarDate(m.date) && m.date <= today() && m.source?.trim() && (includeRevisions || !m.supersededBy)).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')); }
export function ownerReadinessEntry(w: Workspace, c: Company) { return ownerHistory(w, c).find(m => m.readinessRecorded !== false); }
export function ownerContext(w: Workspace, c: Company) { const history = ownerHistory(w, c); return ownerTopics.map(([key, label, prompt]) => { const entry = history.find(m => m[key]?.trim()); return { key, label, prompt, value: entry?.[key] || '', entry }; }); }
export function companyPromises(w: Workspace, c: Company) { return [...(w.operating?.ownerPromises || [])].filter(p => p.companyId === c.id).sort((a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1) || a.due.localeCompare(b.due) || b.createdAt.localeCompare(a.createdAt)); }
export function promiseStatus(p: OwnerPromise) { return p.status === 'Open' ? (p.due < today() ? 'Overdue' : p.due === today() ? 'Due today' : 'Open') : p.status; }
export type EntryInput = {
    date: string;
    type: NonNullable<OwnerMemory['type']>;
    source: string;
    contact: string;
    summary: string;
    outcome: string;
    timing: string;
    employees: string;
    legacy: string;
    involvement: string;
    priorities: string;
    interpretation: string;
    readiness: OwnerMemory['readiness'];
    readinessRecorded: boolean;
    nextAction?: string;
    nextDue?: string;
};
export function recordOwnerEntry(w: Workspace, companyId: string, input: EntryInput, replacingId?: string): Workspace {
    const o = state(w), c = w.companies.find(c => c.id === companyId);
    if (!c)
        throw Error('Company not found.');
    if (!calendarDate(input.date) || input.date > today())
        throw Error('Use a valid conversation date, today or earlier.');
    if (!input.source.trim() || !input.summary.trim())
        throw Error('Record a conversation summary and a source reference.');
    if (input.readinessRecorded && !readinessOptions.includes(input.readiness))
        throw Error('Choose the owner’s explicitly reported readiness.');
    if (input.nextAction?.trim() && (!input.nextDue || !calendarDate(input.nextDue)))
        throw Error('Set a valid date for the next action.');
    const old = replacingId ? o.memories.find(m => m.id === replacingId && m.companyId === companyId) : undefined;
    if (replacingId && (!old || old.supersededBy))
        throw Error('Only a current relationship entry can be revised.');
    const conversationId = old?.conversationId || id(), entry: OwnerMemory = { id: id(), companyId, date: input.date, source: input.source.trim(), type: input.type, contact: input.contact.trim(), summary: input.summary.trim(), outcome: input.outcome.trim(), timing: input.timing.trim(), employees: input.employees.trim(), legacy: input.legacy.trim(), involvement: input.involvement.trim(), priorities: input.priorities.trim(), interpretation: input.interpretation.trim(), readiness: input.readinessRecorded ? input.readiness : 'Unknown', readinessRecorded: input.readinessRecorded, promises: old?.promises || '', conversationId, createdAt: new Date().toISOString(), author: w.firm.operator, ...(old ? { supersedes: old.id } : {}) };
    const conversation = { id: conversationId, type: input.type, date: input.date, body: input.summary.trim(), outcome: input.outcome.trim() || 'Relationship context recorded' };
    return { ...w, companies: w.companies.map(x => x.id !== c.id ? x : { ...x, ...(!old ? { status: x.status === 'New' ? 'Contacted' : x.status, conversations: [conversation, ...x.conversations] } : {}), ...(input.nextAction?.trim() ? { nextAction: input.nextAction.trim(), due: input.nextDue!, assignedTo: w.firm.operator } : {}) }), operating: { ...o, memories: [entry, ...o.memories.map(m => m.id === old?.id ? { ...m, supersededBy: entry.id } : m)] } };
}
export type PromiseInput = {
    text: string;
    owner: string;
    due: string;
    promisedOn: string;
    source: string;
    memoryId?: string;
    status: OwnerPromise['status'];
    resolution: string;
    changeNote?: string;
};
export function saveOwnerPromise(w: Workspace, companyId: string, input: PromiseInput, promiseId?: string): Workspace {
    const o = state(w);
    if (!w.companies.some(c => c.id === companyId))
        throw Error('Company not found.');
    if (!input.text.trim() || !input.owner.trim() || !input.source.trim())
        throw Error('Record the promise, responsible person, and source.');
    if (!calendarDate(input.due) || !calendarDate(input.promisedOn) || input.promisedOn > today())
        throw Error('Use valid dates; the promise date must be today or earlier.');
    if (input.due < input.promisedOn)
        throw Error('The due date cannot be before the promise was made.');
    if (!['Open', 'Done', 'Released'].includes(input.status))
        throw Error('Choose a valid promise status.');
    if (input.status !== 'Open' && input.resolution.trim().length < 10)
        throw Error('Record how the promise was fulfilled or why the owner released it (at least 10 characters).');
    const all = o.ownerPromises || [], old = promiseId ? all.find(p => p.id === promiseId && p.companyId === companyId) : undefined;
    if (promiseId && !old)
        throw Error('Promise not found.');
    if (input.memoryId && !o.memories.some(m => m.id === input.memoryId && m.companyId === companyId))
        throw Error('Choose a conversation from this company.');
    if (old && (old.due !== input.due || old.owner !== input.owner || old.text !== input.text || old.source !== input.source || old.promisedOn !== input.promisedOn) && !input.changeNote?.trim())
        throw Error('Explain the change to the promise, responsible person, date, or source.');
    const now = new Date().toISOString(), entry: OwnerPromise = { ...old, id: old?.id || id(), companyId, text: input.text.trim(), owner: input.owner.trim(), due: input.due, promisedOn: input.promisedOn, source: input.source.trim(), memoryId: input.memoryId || old?.memoryId, status: input.status, resolution: input.resolution.trim(), createdAt: old?.createdAt || now, updatedAt: now, history: [...(old?.history || []), { date: now, by: w.firm.operator, action: !old ? 'Promise recorded' : old.status !== input.status ? `Status changed to ${input.status}` : 'Promise updated', note: [input.changeNote?.trim(), input.resolution.trim(), `Due ${input.due} · ${input.owner}`].filter(Boolean).join(' · '), snapshot: { text: input.text.trim(), due: input.due, owner: input.owner.trim(), source: input.source.trim(), promisedOn: input.promisedOn, status: input.status } }] };
    return { ...w, operating: { ...o, ownerPromises: old ? all.map(p => p.id === old.id ? entry : p) : [entry, ...all], work: o.work.map(item => item.id !== entry.workItemId ? item : { ...item, due: entry.due, owner: entry.owner, nextDue: entry.due, title: entry.text, nextAction: entry.text, instructions:promiseInstructions(entry), ...(entry.status !== 'Open' ? { status: 'Done' as const } : item.status!=='Done'?{status:'Changes requested' as const,sourceVersion:'',reviewedBy:'',reviewedAt:''}:{}) }) } };
}
export function queueOwnerPromise(w: Workspace, promiseId: string): Workspace {
    const o = state(w), p = o.ownerPromises?.find(p => p.id === promiseId), c = w.companies.find(c => c.id === p?.companyId);
    if (!p || !c)
        throw Error('Promise not found.');
    if (p.status !== 'Open')
        throw Error('Only an open promise needs follow-up work.');
    if (p.workItemId && o.work.some(x => x.id === p.workItemId && x.status !== 'Done'))
        throw Error('This promise already has active follow-up work.');
    const item: WorkItem = { id: id(), companyId: c.id, title: p.text, kind: 'Follow-up', owner: p.owner, due: p.due, priority: p.due <= today() ? 'High' : 'Normal', status: 'Queued', instructions: promiseInstructions(p), output: '', sourceVersion: '', preparedAt: '', reviewedBy: '', reviewedAt: '', nextAction: p.text, nextDue: p.due };
    return { ...w, operating: { ...o, work: [item, ...o.work], ownerPromises: o.ownerPromises!.map(x => x.id === p.id ? { ...x, workItemId: item.id } : x) } };
}
export function relationshipPlan(w: Workspace, c: Company) {
    const entries = ownerHistory(w, c), context = ownerContext(w, c), readiness = ownerReadinessEntry(w, c), promises = companyPromises(w, c), open = promises.filter(p => p.status === 'Open'), overdue = open.filter(p => p.due < today());
    const changes = context.flatMap(topic => { const previous = entries.filter(m => m[topic.key]?.trim())[1]; return topic.entry && previous && previous[topic.key]!.trim() !== topic.value.trim() ? [{ ...topic, previous: previous[topic.key]!, previousEntry: previous }] : []; });
    const questions: string[] = [];
    if (open.length)
        questions.push(`Close the loop on “${open[0].text}” (promised ${open[0].promisedOn}; due ${open[0].due}).`);
    if (readiness?.readiness === 'Not now')
        questions.push('You said the timing was not right. Is a check-in still useful, and when would you prefer to reconnect?');
    if (changes.length)
        questions.push(`You updated your ${changes[0].key === 'involvement' ? 'preferred involvement after a sale' : changes[0].label.toLowerCase()} to “${changes[0].value.slice(0, 180)}”. Is that still right?`);
    for (const topic of context.filter(t => !t.value))
        questions.push(topic.prompt);
    const prompts: Record<OwnerTopic, string> = { timing: 'Has anything changed about your preferred timing?', employees: 'What would protecting your team look like in practice?', legacy: 'What would you want a future owner to preserve?', involvement: 'What would a comfortable handover look like for you?', priorities: 'Which of these priorities matters most to your decision?' };
    for (const topic of context.filter(t => t.value && !changes.some(x => x.key === t.key)))
        questions.push(`You mentioned “${topic.value.slice(0, 180).replace(/[.!?]+$/, '')}”. ${prompts[topic.key]}`);
    const research = (w.operating?.researchQuestions || []).filter(q => q.companyId === c.id && q.status === 'Open').map(q => q.question);
    questions.push(...research, 'What would be a useful next step, and when should we follow up?');
    const linked = new Set((w.operating?.memories || []).filter(m => m.companyId === c.id).map(m => m.conversationId).filter(Boolean));
    const olderConversations = [...c.conversations].filter(x => calendarDate(x.date) && x.date <= today() && !linked.has(x.id)).sort((a, b) => b.date.localeCompare(a.date));
    const lastConversation = [...olderConversations, ...entries.map(m => ({ id: m.id, type: m.type || 'Source note', date: m.date, body: m.summary || m.priorities || 'Owner context recorded', outcome: 'Owner relationship context' }))].sort((a, b) => b.date.localeCompare(a.date))[0];
    return { entries, context, readiness, promises, open, overdue, changes, questions: [...new Set(questions)].slice(0, 6), olderConversations, lastConversation };
}
export function relationshipCallText(w: Workspace, c: Company) { const p = relationshipPlan(w, c); return `OWNER RELATIONSHIP CONTEXT — ${c.name}\n\nSUGGESTED OPENING\n${relationshipOpener(w, c)}\n\nReadiness: ${p.readiness?.readiness || 'Unknown'}${p.readiness ? ` — ${p.readiness.date} · ${p.readiness.source}` : ''}\n\nWHAT MATTERS — LAST RECORDED PER TOPIC\n${p.context.map(t => `${t.label}: ${t.value || 'Unknown — ask the owner'}${t.entry ? `\nSource: ${t.entry.date} · ${t.entry.source}` : ''}`).join('\n\n')}\n\nPROMISES TO FOLLOW THROUGH\n${p.open.map(x => `[${promiseStatus(x)}] ${x.text}\nResponsible: ${x.owner} · Due ${x.due}\nPromised ${x.promisedOn} · ${x.source}`).join('\n\n') || 'No tracked open promises.'}\n${p.entries.filter(m => m.promises.trim()).map(m => `Earlier untracked promises: ${m.promises} — ${m.date} · ${m.source}`).join('\n')}\n\nCHANGES TO RECONFIRM\n${p.changes.map(t => `${t.label}: previously “${t.previous}” (${t.previousEntry.date}); now “${t.value}” (${t.entry!.date}).`).join('\n') || 'No recorded changes to compare.'}\n\nNEXT CALL AGENDA\n${p.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nRECENT CONVERSATION HISTORY\n${p.entries.slice(0, 5).map(m => `${m.date} · ${m.type || 'Source note'} · ${m.contact || c.owner || 'Contact not recorded'}\n${m.summary || m.priorities || 'Context recorded'}\nSource: ${m.source}${m.interpretation ? `\nOperator interpretation (not an owner statement): ${m.interpretation}` : ''}`).join('\n\n') || 'No structured owner history recorded.'}\n\nRECENT FULFILLMENT\n${p.promises.filter(x => x.status !== 'Open').slice(0, 3).map(x => `${x.status}: ${x.text} — ${x.resolution}`).join('\n') || 'No completed or released promises recorded.'}\n\nReconfirm older context. This is a structured compilation of your records; no call recording, transcription, sending, or model analysis was performed.`; }
export function ownerContextText(w: Workspace, c: Company) { const p = relationshipPlan(w, c); return `Readiness: ${p.readiness?.readiness || 'Unknown'}${p.readiness ? ` — ${p.readiness.date} · ${p.readiness.source}` : ''}\n${p.context.map(t => `${t.label}: ${t.value || 'Unknown'}${t.entry ? ` — ${t.entry.date} · ${t.entry.source}` : ''}`).join('\n')}`; }
export function relationshipOpener(w: Workspace, c: Company) { const p = relationshipPlan(w, c), name = c.owner ? `, ${c.owner.split(' ')[0]}` : ''; if (!p.entries.length && !p.lastConversation)
    return `I'm ${w.firm.operator.split(' ')[0]} with ${w.firm.name}. I'd love to learn more about ${c.name}, what you've built, and what you'd want for its next chapter.`; if (p.readiness?.readiness === 'Not now')
    return `Good to catch up${name}. You mentioned the timing wasn't right. I wanted to follow through on what we discussed and check when you'd prefer to reconnect.`; if (p.open.length)
    return `Good to speak again${name}. I'd like to start by following up on the promise to ${p.open[0].text.charAt(0).toLowerCase() + p.open[0].text.slice(1).replace(/[.!?]+$/, '')}, then hear how things have been.`; return `Good to speak again${name}. I'd like to pick up where we left off and hear what matters most to you and the business now.`; }

function promiseInstructions(p:OwnerPromise){return `Promise to owner: ${p.text}\nPromised ${p.promisedOn}; source: ${p.source}.\nPrepare the follow-through. Work completion does not prove fulfillment: record the actual result in Owner memory → Promises.`;}
