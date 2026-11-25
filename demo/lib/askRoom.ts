export type RoomSearchDocument = {
  itemId: string;
  displayName: string;
  pages: readonly {page: number; text: string}[];
};

export type RoomSearchResult = {
  itemId: string;
  displayName: string;
  page: number;
  quote: string;
  score: number;
};

const stopWords = new Set([
  'a', 'about', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'by', 'can',
  'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i',
  'in', 'is', 'it', 'many', 'me', 'much', 'of', 'on', 'or', 'our', 'please', 's',
  'show', 'tell', 'that', 'the', 'their', 'there', 'these', 'they', 'this', 'to',
  'us', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'will', 'with',
  'would', 'you', 'your',
]);
const sentences = new Intl.Segmenter('en', {granularity: 'sentence'});

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 4 && /(?:ches|shes|sses|xes|zzes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && /[^sui]s$/.test(word)) word = word.slice(0, -1);
  if (word.length > 5 && word.endsWith('ing')) word = word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) word = word.slice(0, -2);
  if (word.length > 4 && /[^aeiou]e$/.test(word)) word = word.slice(0, -1);
  return word;
}

function terms(text: string): string[] {
  // Normalize phrases for scoring only. Quotes always use the original text.
  const normalized = text.toLowerCase()
    .replace(/\b(?:maintenance[\s-]+(?:plans?|contracts?)|service[\s-]+(?:plans?|contracts?|agreements?))\b/g, 'maintenance agreement')
    .replace(/\b(?:ac|a\/c|air[\s-]+conditioning)\b/g, 'airconditioning')
    .replace(/\b(?:preventative|preventive)\b/g, 'preventive')
    .replace(/\brenewals?\b/g, 'renew');
  return (normalized.match(/[\p{L}\p{N}]+/gu) || [])
    .filter(word => !stopWords.has(word))
    .map(stem);
}

/** Search only the documents already authorized for this viewer. */
export function searchRoom(
  question: string,
  docs: readonly RoomSearchDocument[],
  limit = 5,
): RoomSearchResult[] {
  const query = terms(question);
  const wanted = new Set(query);
  if (!wanted.size || !Number.isFinite(limit) || limit < 1) return [];

  // A stray keyword should not make an unrelated page look like an answer.
  const minimumMatches = wanted.size <= 4 ? wanted.size : Math.ceil(wanted.size * 0.65);
  const queryPairs = new Set(query.slice(1).map((word, index) => query[index] + ' ' + word));
  const hits: RoomSearchResult[] = [];
  for (const doc of docs) {
    for (const page of doc.pages) {
      const sections = Array.from(sentences.segment(page.text), ({index, segment}) => ({
        index,
        end: index + segment.length,
        terms: terms(segment),
      }));
      let best = {score: 0, quote: ''};
      for (let start = 0; start < sections.length; start++) {
        let windowTerms: string[] = [];
        for (const end of sections.slice(start, start + 3)) {
          windowTerms = windowTerms.concat(end.terms);
          const matches = new Set(windowTerms.filter(word => wanted.has(word))).size;
          if (matches < minimumMatches) continue;
          const pairs = new Set(windowTerms.slice(1).map((word, index) => windowTerms[index] + ' ' + word));
          const phraseMatches = [...queryPairs].filter(pair => pairs.has(pair)).length;
          const score = 10 * matches + 2 * phraseMatches;
          if (score < best.score) continue;
          const quote = page.text.slice(sections[start].index, end.end).trim();
          if (score > best.score || quote.length < best.quote.length) best = {score, quote};
        }
      }
      if (best.score) hits.push({itemId: doc.itemId, displayName: doc.displayName, page: page.page, ...best});
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.quote.length - b.quote.length).slice(0, limit);
}
