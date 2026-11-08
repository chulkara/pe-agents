import { id, extract, number, type Company, type Doc, type Evidence } from './domain.ts';
export const activeDocuments = (c: Company) => c.documents.filter(d => !d.supersededBy);
export function fingerprint(text: string) { let n = 2166136261; for (let i = 0; i < text.length; i++) {
    n ^= text.charCodeAt(i);
    n = Math.imul(n, 16777619);
} return (n >>> 0).toString(16); }
export function sourceLocation(doc: Doc, excerpt: string) { const offset = doc.text.indexOf(excerpt); if (offset < 0)
    return 'Captured excerpt'; if (doc.pages?.length) {
    let start = 0;
    for (const page of doc.pages) {
        if (offset < start + page.text.length + 1)
            return `Page ${page.page}`;
        start += page.text.length + 1;
    }
} return `Line ${doc.text.slice(0, offset).split('\n').length}`; }
const labels: [
    string,
    RegExp
][] = [['service_mix', /^(?:services|service mix|revenue mix|business overview)\s*[:=]\s*(.+)/i], ['customers', /^(?:customers|customer profile|customer segments)\s*[:=]\s*(.+)/i], ['ownership', /^(?:ownership|owners?|shareholders?)\s*[:=]\s*(.+)/i], ['locations', /^(?:locations?|service area|territory)\s*[:=]\s*(.+)/i], ['team', /^(?:employees|team|management|owner involvement|owner dependence)\s*[:=]\s*(.+)/i], ['competitors', /^(?:competitors?|competition)\s*[:=]\s*(.+)/i], ['recurring_revenue', /^(?:recurring revenue|contracted revenue|recurring work)\s*(?:\((20\d{2})\))?\s*[:=]\s*(.+)/i], ['customer_concentration', /^(?:largest customer|top customer|top [1-9][0-9]* customers?|customer concentration)\s*(?:\((20\d{2})\))?\s*[:=]\s*(.+)/i]];
export function makeDocument(name: string, text: string, pages?: Doc['pages']): Doc {
    if (!name.trim() || text.trim().length < 10)
        throw Error('The document needs readable text.');
    if (text.length > 80000)
        throw Error('Use a shorter document (up to 80,000 extracted characters).');
    const doc: Doc = { id: id(), name, text, evidence: [], stored: false, sample: false, uploadedAt: new Date().toISOString(), version: 1, pages, warnings: [] };
    doc.familyId = doc.id;
    const head = text.split('\n').slice(0, 8).join('\n'), scale = /\b(?:in thousands|\$\s*000s?|USD\s*000s?)\b/i.test(head) ? 1000 : /\bin millions\b/i.test(head) ? 1000000 : 1;
    if (scale !== 1)
        doc.warnings!.push(`Financial amounts use the document's stated ${scale === 1000 ? 'thousands' : 'millions'} scale unless an explicit K/M/B suffix appears.`);
    const foreign = /\b(?:EUR|GBP|CAD|AUD|INR)\b|[€£₹]/i.test(head);
    if (foreign)
        doc.warnings!.push('Non-USD currency detected. Financial amounts are retained for review but excluded from USD screening and automatic trends.');
    for (const e of financialText(text, name)) {
        const exact = text.indexOf(e.excerpt), fallback = text.split('\n').find(l => l.replace(/[\s"]/g, '') === e.excerpt.replace(/[\s"]/g, '')), at = exact >= 0 ? exact : fallback ? text.indexOf(fallback) : 0, start = text.lastIndexOf('\n', at) + 1, end = text.indexOf('\n', at), line = text.slice(start, end < 0 ? undefined : end), adjusted = /\badjusted\s+ebitda\b/i.test(line), forecast = /\b(?:forecast|projected|projection|budget)\b/i.test(line + ' ' + name), periodKind = /\bTTM\b|trailing twelve/i.test(line) ? 'TTM' : /\bYTD\b|year.to.date/i.test(line) ? 'YTD' : 'Annual';
        if (text.slice(at + e.excerpt.length).trimStart().startsWith('%') || /%/.test(line) && /recurring|concentration|margin|growth/i.test(line))
            continue;
        const rawSuffix = /\d(?:\.\d+)?\s*[kmb]\b/i.test(e.excerpt);
        doc.evidence.push({ ...e, field: adjusted ? e.field.replace(/^ebitda/, 'adjusted_ebitda') : e.field, value: String(Number(e.value) * (scale !== 1 && !rawSuffix ? scale : 1)), excerpt: line.trim() || e.excerpt, docId: doc.id, locator: sourceLocation(doc, line.trim() || e.excerpt), sourceType: 'Uploaded document', basis: foreign ? 'Currency review' : forecast ? 'Forecast' : adjusted ? 'Adjusted EBITDA' : 'Reported', periodKind, kind: foreign || forecast ? 'assumption' : 'reported' });
    }
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        for (const [field, re] of labels) {
            const m = trimmed.match(re);
            if (!m)
                continue;
            const value = m[m.length - 1]?.trim();
            if (!value)
                continue;
            doc.evidence.push({ id: id(), field, value: field === 'customer_concentration' ? trimmed : value, source: name, excerpt: trimmed, kind: 'reported', date: new Date().toISOString(), docId: doc.id, locator: sourceLocation(doc, trimmed), sourceType: 'Uploaded document', basis: 'Source reported' });
        }
    }
    const modelTerms:[string,RegExp,boolean][]=[['purchase_price',/^(?:purchase price|purchase enterprise value|enterprise value)\s*[:=]\s*(.+)/i,true],['transaction_fees',/^(?:transaction fees|deal fees|fees)\s*[:=]\s*(.+)/i,true],['initial_working_capital',/^(?:additional working capital|working capital at close|initial working capital)\s*[:=]\s*(.+)/i,true],['senior_debt',/^senior debt\s*[:=]\s*(.+)/i,true],['senior_rate',/^(?:senior interest rate|senior rate|interest rate)\s*[:=]\s*(.+)/i,false],['amortization_years',/^(?:amortization years|senior amortization)\s*[:=]\s*(.+)/i,false],['seller_note',/^seller note\s*[:=]\s*(.+)/i,true],['seller_rate',/^(?:seller note interest rate|seller rate)\s*[:=]\s*(.+)/i,false],['capex',/^(?:annual capital spending|capital spending|capex)\s*[:=]\s*(.+)/i,true],['annual_working_capital',/^annual working.capital investment\s*[:=]\s*(.+)/i,true],['tax_rate',/^cash tax rate\s*[:=]\s*(.+)/i,false],['exit_multiple',/^exit (?:EBITDA )?multiple\s*[:=]\s*(.+)/i,false],['hold_years',/^hold period\s*[:=]\s*(.+)/i,false]];
    for(const line of text.split('\n'))for(const [field,re,currency]of modelTerms){const match=line.trim().match(re);if(!match)continue;const token=match[1].match(/^(-?\$?\s*[\d,]+(?:\.\d+)?\s*[kmb]?)(?:\s*(?:%|x|×|years?))?(?:\s*\(.*\))?\s*$/i)?.[1];if(!token)continue;const n=number(token);if(n===null)continue;const value=n*(currency&&scale!==1&&!/[kmb]\s*$/i.test(token)?scale:1);doc.evidence.push({id:id(),field,value:String(value),source:name,excerpt:line.trim(),kind:currency&&foreign?'assumption':'reported',date:new Date().toISOString(),docId:doc.id,locator:sourceLocation(doc,line.trim()),sourceType:'Uploaded document',basis:'Quoted term'});}
    return doc;
}
export function addDocument(c: Company, doc: Doc, replacingId?: string): Company {
    const old = replacingId ? c.documents.find(d => d.id === replacingId) : undefined;
    if (replacingId && (!old || old.supersededBy))
        throw Error('Choose a current document to revise.');
    if (old && old.text === doc.text)
        throw Error('The document text is unchanged.');
    if (!old && activeDocuments(c).some(d => d.name === doc.name && d.text === doc.text))
        throw Error('This document is already in the company record.');
    const next = { ...doc, ...(old ? { revisionOf: old.id, familyId: old.familyId || old.id, version: (old.version || 1) + 1 } : {}) };
    return { ...c, documents: [...c.documents.map(d => d.id === old?.id ? { ...d, supersededBy: next.id } : d), next] };
}
function financialText(text: string, source: string): Evidence[] { const out = extract(text, source), lines = text.split('\n'); let years: string[] = []; for (const line of lines) {
    if (/^(?:metric\s+)?(?:20\d{2}\s*){2,}$/i.test(line.trim())) {
        years = line.match(/20\d{2}/g) || [];
        continue;
    }
    if (!years.length)
        continue;
    const match = line.match(/^(Revenue|Net sales|EBITDA|Adjusted EBITDA|SDE)\s+(.+)$/i);
    if (!match)
        continue;
    const raw = match[2].match(/\(?\$?\s*-?[\d,]+(?:\.\d+)?\s*[kmb]?\)?/ig) || [];
    if (raw.length !== years.length)
        continue;
    const metric = /revenue|sales/i.test(match[1]) ? 'revenue' : /ebitda/i.test(match[1]) ? 'ebitda' : 'sde';
    raw.forEach((value, i) => { const n = number(value.trim().replace(/^\((.+)\)$/, '-$1')); if (n === null || out.some(e => e.field === metric + '_' + years[i] && e.value === String(n) && e.excerpt === line))
        return; out.push({ id: id(), field: metric + '_' + years[i], value: String(n), source, excerpt: line, kind: 'reported', date: new Date().toISOString() }); });
} return out; }
