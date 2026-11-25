import assert from 'node:assert/strict';
import {test} from 'node:test';
import {searchRoom} from '../lib/askRoom.ts';

const question = 'How many maintenance agreements renew in the spring?';
const docs = [
  {
    itemId: 'schedule',
    displayName: 'Renewal schedule',
    pages: [
      {page: 1, text: 'Spring is our busiest season. There is a separate maintenance agreement template.'},
      {page: 2, text: 'Spring is the busiest season. We renew 45 maintenance agreements. That count excludes commercial customers.'},
      {page: 3, text: 'This is the annual schedule.  Thirty maintenance agreements renew in spring.\nFall has a different schedule.'},
    ],
  },
  {
    itemId: 'handbook',
    displayName: 'Service handbook',
    pages: [
      {page: 4, text: 'All 12 service contracts renewed in spring.'},
      {page: 5, text: 'The air conditioning units are serviced in March.'},
    ],
  },
];

test('pages with the query phrase rank ahead of scattered keywords', () => {
  const results = searchRoom(question, docs);
  assert.deepEqual(results.map(({itemId, page}) => [itemId, page]), [
    ['handbook', 4],
    ['schedule', 3],
    ['schedule', 2],
  ]);
  assert.ok(results[0].score > results[2].score);
});

test('quotes are exact substrings of their pages with only the matching context', () => {
  const results = searchRoom(question, docs);
  assert.equal(results.length, 3);
  for (const {itemId, page, quote} of results) {
    const source = docs.find(doc => doc.itemId === itemId).pages.find(part => part.page === page);
    assert.ok(source.text.includes(quote));
  }
  assert.equal(results.find(result => result.page === 3).quote, 'Thirty maintenance agreements renew in spring.');
  assert.equal(results.find(result => result.page === 2).quote, 'Spring is the busiest season. We renew 45 maintenance agreements.');
});

test('service contracts, maintenance plans, and HVAC abbreviations match the corresponding language', () => {
  assert.ok(searchRoom('Do the maintenance plans renew in spring?', docs).some(hit => hit.page === 4));
  assert.ok(searchRoom('Do agreements renew in spring?', docs).some(hit => hit.page === 4));
  assert.equal(searchRoom('Is A/C serviced in March?', docs)[0].page, 5);
  assert.equal(searchRoom('When do you service A/C in March?', docs)[0].page, 5);
});

test('missing concepts, stop words, and empty documents produce no matches', () => {
  assert.deepEqual(searchRoom('Do maintenance agreements renew in winter?', docs), []);
  assert.deepEqual(searchRoom('How much?', docs), []);
  assert.deepEqual(searchRoom(question, []), []);
});

test('the default and explicit limits cap results', () => {
  const many = Array.from({length: 8}, (_, i) => ({
    itemId: String(i),
    displayName: 'Fictional renewal list',
    pages: [{page: 1, text: 'The maintenance agreements renew in spring.'}],
  }));
  assert.equal(searchRoom(question, many).length, 5);
  assert.equal(searchRoom(question, many, 2).length, 2);
  assert.deepEqual(searchRoom(question, many, 0), []);
});
