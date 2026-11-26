import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {executionFixture, signedLoi} from './execution-helpers.mjs';

let s, maintenance, covenant, removed, pending, compressors;
const search = (user, question, listing = s.l) =>
  s.one(user, 'select public.kalling_dataroom_search($1,$2)', [listing, question]);
const advisorSearch = (user, question, listing = s.l) =>
  s.one(user, 'select public.kalling_dataroom_search_advisor($1,$2)', [listing, question]);
const activity = user =>
  s.one(user, 'select public.kalling_dataroom_search_activity($1)', [s.l]);
const history = user =>
  s.as(user, 'select listing_id, buyer_id, question from public.kalling_dataroom_searches where listing_id=$1', [s.l]);

async function addItem({name, pages, tier = 'After NDA', status = 'Approved'}) {
  const path = s.portal + '/' + crypto.randomUUID() + '.pdf';
  const hash = createHash('sha256').update(JSON.stringify(pages)).digest('hex');
  const {rows: [{id: file}]} = await s.db.query(
    `insert into public.kalling_portal_files
      (portal_id,name,mime,size,sha256,object_path,status,uploaded_by,uploader_name,side)
      values ($1,$2,'application/pdf',100,$3,$4,'stored',$5,'Fictional Advisor','firm') returning id`,
    [s.portal, name + '.pdf', hash, path, s.owner],
  );
  await s.db.query("insert into storage.objects(bucket_id,name,metadata) values('kalling-portal',$1,'{}')", [path]);
  await s.one(s.owner, 'select public.kalling_portal_save_text($1,$2)', [
    file,
    {status: 'ok', pages, textHash: hash, extractor: 'fictional-fixture'},
  ]);
  const id = await s.one(s.owner, 'select public.kalling_dataroom_save_item($1)', [{
    listingId: s.l, portalId: s.portal, fileId: file, displayName: name, folder: 'Operations', tier,
  }]);
  if (status !== 'Pending') {
    await s.one(s.seller, 'select public.kalling_dataroom_owner_decide($1,$2,$3)', [
      [id], status, status === 'Removed' ? 'Do not share this fictional file.' : '',
    ]);
  }
  return {id, file, pages};
}

before(async () => {
  s = await executionFixture();
  maintenance = await addItem({name: 'Renewal schedule', pages: [
    {page: 2, text: 'The fictional service contracts renew in April. The schedule lists 22 customers.'},
  ]});
  covenant = await addItem({name: 'Covenant schedule', tier: 'After LOI', pages: [
    {page: 3, text: 'The fictional debt covenant uses an amber threshold.'},
  ]});
  removed = await addItem({name: 'Removed access notes', status: 'Removed', pages: [
    {page: 4, text: 'The fictional warehouse has a violet loading dock.'},
  ]});
  compressors = await addItem({name: 'Equipment inspection', pages: Array.from({length: 7}, (_, index) => ({
    page: index + 1,
    text: 'general fictional notes '.repeat(60) + `the compressor on line ${index + 1} passed inspection ` +
      'with reviewer comments in the appendix, '.repeat(40) + 'end of appendix.',
  }))});
  await s.one(s.owner, 'select public.kalling_dataroom_set_status($1,$2)', [s.l, 'Proposed']);
  await s.one(s.owner, 'select public.kalling_dataroom_set_status($1,$2)', [s.l, 'Published']);
  pending = await addItem({name: 'Unapproved site notes', status: 'Pending', pages: [
    {page: 5, text: 'The fictional warehouse has a yellow loading dock.'},
  ]});
});
after(async () => s?.db.close());

test('the current buyer tier controls passages, including a reviewed LOI', async () => {
  const query = 'amber covenant';
  assert.equal((await s.one(s.buyer, 'select public.kalling_dataroom_buyer($1)', [s.l])).tier, 1);
  assert.deepEqual(await search(s.buyer, query), []);
  const [hit] = await search(s.buyer, 'maintenance plans renew April');
  assert.equal(hit.item_id, maintenance.id);
  assert.equal(hit.page, 2);
  assert.match(hit.quote, /service contracts renew in April/);

  await signedLoi(s);
  assert.equal((await s.one(s.buyer, 'select public.kalling_dataroom_buyer($1)', [s.l])).tier, 2);
  assert.deepEqual((await search(s.buyer, query)).map(hit => hit.item_id), [covenant.id]);
  assert.deepEqual(await search(s.other, query), [], 'the other approved buyer stays at After NDA');
});

test('declines, withdrawals, restrictions and an unpublished room immediately stop buyer search', async () => {
  const query = 'compressor';
  assert.ok((await search(s.other, query)).length);
  const count = (await history(s.other)).length;
  const cases = [
    ["update public.kalling_access set status='Declined' where listing_id=$1 and buyer_id=$2",
      "update public.kalling_access set status='Approved' where listing_id=$1 and buyer_id=$2", [s.l, s.b2]],
    ["update public.kalling_access set status='Withdrawn' where listing_id=$1 and buyer_id=$2",
      "update public.kalling_access set status='Approved' where listing_id=$1 and buyer_id=$2", [s.l, s.b2]],
    ["update public.kalling_buyers set status='Restricted' where id=$1",
      "update public.kalling_buyers set status='Registered' where id=$1", [s.b2]],
    ["update public.kalling_dataroom_rooms set status='Unpublished' where listing_id=$1",
      "update public.kalling_dataroom_rooms set status='Published' where listing_id=$1", [s.l]],
  ];
  for (const [revoke, restore, args] of cases) {
    await s.db.query(revoke, args);
    try {
      assert.deepEqual(await search(s.other, query), [], revoke);
      assert.equal((await history(s.other)).length, count, 'denied searches do not log');
    } finally {
      await s.db.query(restore, args);
    }
  }
});

test('the seller, a stranger and a member of another firm cannot read the room passages', async () => {
  for (const user of [s.seller, s.outsider]) {
    assert.deepEqual(await search(user, 'compressor'), []);
    await assert.rejects(advisorSearch(user, 'compressor'), {code: '42501'});
  }
  await s.one(s.outsider, 'select public.kalling_create_firm($1,$2)', [
    'Other fictional firm', {firm: {name: 'Other fictional firm'}, companies: [], deals: [], events: []},
  ]);
  assert.deepEqual(await search(s.outsider, 'compressor'), []);
  await assert.rejects(advisorSearch(s.outsider, 'compressor'), {code: '42501'});
  await assert.rejects(
    s.one(null, 'select public.kalling_dataroom_search($1,$2)', [s.l, 'compressor'], 'anon'),
    {code: '42501'},
  );
  for (const user of [s.buyer, s.seller]) {
    const rows = await s.as(user, 'select pages from public.kalling_portal_file_text where file_id=$1', [compressors.file]);
    assert.deepEqual(rows, []);
  }
});

test('removed documents are excluded for everyone and pending documents are firm-only', async () => {
  const buyerHits = await search(s.buyer, 'loading dock');
  assert.deepEqual(buyerHits, []);
  const advisorHits = await search(s.owner, 'loading dock');
  assert.deepEqual(advisorHits.map(hit => hit.item_id), [pending.id]);
  const explicitAdvisorHits = await advisorSearch(s.owner, 'loading dock');
  assert.ok(explicitAdvisorHits.every(hit => hit.item_id !== removed.id));
  assert.deepEqual(explicitAdvisorHits.map(hit => hit.item_id), [pending.id]);
});

test('the search returns at most five exact passages of at most 600 characters each', async () => {
  const hits = await search(s.buyer, 'compressor inspection');
  assert.equal(hits.length, 5);
  for (const hit of hits) {
    assert.equal(hit.item_id, compressors.id);
    assert.equal(hit.display_name, 'Equipment inspection');
    const source = compressors.pages.find(part => part.page === hit.page);
    assert.ok(hit.quote.length <= 600);
    assert.ok(source.text.includes(hit.quote), 'the excerpt is copied verbatim from the cited page');
    assert.match(hit.quote, /compressor/);
    assert.ok(Number.isFinite(hit.score) && hit.score > 0);
  }
});

test('only the firm and the searching buyer can read question text, while the seller sees the weekly count', async () => {
  const beforeCount = (await history(s.owner)).length;
  const [ownerRoomBefore] = await s.one(s.seller, 'select public.kalling_dataroom_owner()');
  const weekly = room => Number(room.summary.match(/(\d+) questions? asked/)?.[1] || 0);
  const buyerQuestion = 'What is the fictional comet inspection policy?';
  const otherQuestion = 'What is the fictional moon renewal policy?';
  const advisorQuestion = 'What is the fictional star inventory?';
  assert.deepEqual(await search(s.buyer, buyerQuestion), []);
  assert.deepEqual(await search(s.other, otherQuestion), []);
  assert.deepEqual(await advisorSearch(s.owner, advisorQuestion), []);

  const firmRows = await history(s.owner);
  assert.equal(firmRows.length, beforeCount + 2);
  assert.ok(firmRows.some(row => row.question === buyerQuestion && row.buyer_id === s.b1));
  assert.ok(firmRows.some(row => row.question === otherQuestion && row.buyer_id === s.b2));
  assert.equal((await history(s.viewer)).length, firmRows.length);
  assert.ok((await history(s.buyer)).every(row => row.buyer_id === s.b1));
  assert.ok((await history(s.other)).every(row => row.buyer_id === s.b2));
  assert.deepEqual(await history(s.seller), []);
  assert.deepEqual(await history(s.outsider), []);

  const advisor = await activity(s.owner);
  assert.ok(advisor.searches.some(row => row.question === buyerQuestion));
  assert.ok(advisor.searches.some(row => row.question === otherQuestion));
  assert.equal(advisor.search_question_count, beforeCount + 2);
  for (const user of [s.seller, s.buyer, s.outsider]) await assert.rejects(activity(user), {code: '42501'});

  const [ownerRoom] = await s.one(s.seller, 'select public.kalling_dataroom_owner()');
  assert.equal(weekly(ownerRoom), weekly(ownerRoomBefore) + 2);
  assert.doesNotMatch(JSON.stringify(ownerRoom), /comet inspection|moon renewal|fictional-1@marketplace\.invalid/);
  for (const user of [s.buyer, s.seller, s.owner]) {
    await assert.rejects(s.as(user,
      'insert into public.kalling_dataroom_searches(listing_id,buyer_id,question) values($1,$2,$3)',
      [s.l, s.b1, 'Fictional forged search'],
    ), {code: '42501'});
  }
});

test('searches enforce the question length and a rolling 30-per-hour buyer limit', async () => {
  await s.db.query("update public.kalling_dataroom_searches set at=now()-interval '61 minutes' where buyer_id=$1", [s.b2]);
  const count = (await history(s.other)).length;
  await assert.rejects(search(s.other, 'x'));
  await assert.rejects(search(s.other, 'x'.repeat(3001)));
  assert.equal((await history(s.other)).length, count, 'invalid searches do not consume the limit');

  for (let i = 0; i < 30; i++) await search(s.other, 'compressor');
  await assert.rejects(search(s.other, 'compressor'), /30|wait|hour/i);
  assert.equal((await history(s.other)).length, count + 30);
  assert.ok((await search(s.buyer, 'compressor')).length, 'each buyer has a separate limit');

  await s.db.query("update public.kalling_dataroom_searches set at=now()-interval '61 minutes' where buyer_id=$1", [s.b2]);
  assert.ok((await search(s.other, 'compressor')).length, 'a search is allowed after the window expires');
});
