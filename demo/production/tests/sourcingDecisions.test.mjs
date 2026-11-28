import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {executionFixture} from './execution-helpers.mjs';

const optOut = "If you'd rather not hear from us, tell me and I won't write again.";
const letter = `Dear Fictional Owner,\n\n${optOut}\n\nFictional Advisor`;
const decideSql = 'select public.kalling_sourcing_decide($1,$2,$3,$4) as decision';
const listSql = 'select public.kalling_sourcing_list() as decisions';
const permissionDenied = {code: '42501'};
const statuses = ['New', 'Letter drafted', 'Letter approved', 'Mailed', 'Replied', 'Not interested', 'Do not contact'];
let s, analyst, admin, cpa, attorney, helper;

const decide = (user, license, status, text = null, note = null, role = 'authenticated') =>
  s.one(user, decideSql, [license, status, text, note], role);
const list = (user, role = 'authenticated') => s.one(user, listSql, [], role);
const events = async license =>
  (await s.db.query('select from_status,to_status,"by",at,note from public.kalling_sourcing_events where license_no=$1 order by id', [license])).rows;

async function account(name) {
  const id = crypto.randomUUID();
  const email = `fictional-sourcing-${name}@marketplace.invalid`;
  await s.db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, email]);
  return {id, email};
}

async function staff(role) {
  const person = await account(role);
  const token = await s.one(s.owner, 'select public.kalling_invite_member($1,$2,$3)', [s.firm, person.email, role]);
  await s.one(person.id, 'select public.kalling_accept_invite($1)', [token]);
  return person;
}

async function professional(role) {
  const person = await account(role.toLowerCase());
  const token = await s.one(s.seller, 'select public.kalling_pro_add($1,$2,$3,$4,$5,$6)', [
    'seller', `Fictional ${role}`, person.email, '', role, 30,
  ]);
  await s.one(person.id, 'select public.kalling_pro_accept($1)', [token]);
  return person;
}

before(async () => {
  s = await executionFixture();
  analyst = await staff('analyst');
  admin = await staff('admin');
  cpa = await professional('CPA');
  attorney = await professional('Attorney');
  helper = await account('helper');
  const token = await s.one(s.seller, 'select public.kalling_helper_add($1,$2,$3,$4)', [
    s.portal, 'Fictional helper', helper.email, 30,
  ]);
  await s.one(helper.id, 'select public.kalling_helper_accept($1)', [token]);
  await s.one(s.outsider, 'select public.kalling_create_firm($1,$2)', [
    'Unrelated fictional firm', {firm: {name: 'Unrelated fictional firm'}, companies: [], deals: [], events: []},
  ]);
});
after(async () => s?.db.close());

test('only house-firm advisors can call the functions; clients cannot read or write either table', async () => {
  assert.deepEqual(await list(s.owner), []);
  await decide(analyst.id, 'FICTIONAL-ACCESS', 'Letter drafted', letter);
  assert.equal((await list(admin.id))[0].letter, letter);
  const barred = [
    [s.buyer, 'authenticated'], [s.seller, 'authenticated'], [cpa.id, 'authenticated'],
    [attorney.id, 'authenticated'], [helper.id, 'authenticated'], [s.viewer, 'authenticated'],
    [s.outsider, 'authenticated'], [null, 'authenticated'], [null, 'anon'], [null, 'service_role'],
  ];
  for (const [user, role] of barred) {
    await assert.rejects(list(user, role), permissionDenied);
    await assert.rejects(decide(user, 'FICTIONAL-ACCESS', 'Do not contact', null, null, role), permissionDenied);
    for (const table of ['kalling_sourcing_decisions', 'kalling_sourcing_events']) {
      await assert.rejects(s.as(user, `select * from public.${table}`, [], role), permissionDenied);
      await assert.rejects(s.as(user, `delete from public.${table}`, [], role), permissionDenied);
    }
  }
  for (const user of [s.owner, admin.id, analyst.id]) {
    for (const table of ['kalling_sourcing_decisions', 'kalling_sourcing_events']) {
      await assert.rejects(s.as(user, `select * from public.${table}`), permissionDenied);
      await assert.rejects(s.as(user, `insert into public.${table}(license_no) values ('FICTITIOUS')`), permissionDenied);
      await assert.rejects(s.as(user, `update public.${table} set license_no='FICTITIOUS'`), permissionDenied);
    }
  }
  assert.equal((await list(analyst.id))[0].status, 'Letter drafted');
});

test('only firm owners and administrators approve or mark mailed, and approval provenance is immutable through later decisions', async () => {
  const license = 'FICTIONAL-ROLES';
  const draft = await decide(analyst.id, ' fictional-roles ', 'Letter drafted', letter, 'Fictional draft reviewed.');
  assert.equal(draft.license_no, license);
  assert.equal(draft.updated_by, analyst.email);
  assert.equal(draft.approved_by, null);
  await assert.rejects(decide(analyst.id, license, 'Letter approved'), permissionDenied);

  const approved = await decide(admin.id, license, 'Letter approved');
  assert.equal(approved.approved_by, admin.email);
  assert.equal(approved.approved_at, approved.updated_at);
  assert.equal(approved.letter, letter);
  assert.equal(approved.note, draft.note);
  await assert.rejects(decide(analyst.id, license, 'Mailed'), permissionDenied);
  await assert.rejects(decide(s.owner, license, 'Mailed', letter + ' changed'), /only change when drafting or approving/);
  const mailed = await decide(s.owner, license, 'Mailed', null, 'Fictional mailing recorded.');
  assert.equal(mailed.mailed_at, mailed.updated_at);
  assert.equal(mailed.updated_by, 'fictional-0@marketplace.invalid');
  assert.equal(mailed.approved_by, admin.email);
  assert.equal(mailed.approved_at, approved.approved_at);
  assert.equal(mailed.letter, letter);

  await assert.rejects(decide(s.owner, license, 'Letter drafted', letter), /Decisions only move forward/);
  const replied = await decide(analyst.id, license, 'Replied');
  assert.equal(replied.mailed_at, mailed.mailed_at);
  assert.equal(replied.approved_at, approved.approved_at);
  const history = await events(license);
  assert.deepEqual(history.map(e => [e.from_status, e.to_status, e.by, e.note]), [
    ['New', 'Letter drafted', analyst.email, draft.note],
    ['Letter drafted', 'Letter approved', admin.email, null],
    ['Letter approved', 'Mailed', mailed.updated_by, mailed.note],
    ['Mailed', 'Replied', analyst.email, null],
  ]);
  assert.deepEqual((await list(s.owner)).find(d => d.license_no === license), replied);
});

test('an opt-out is permanent for every advisor role, even with a differently cased key', async () => {
  const license = 'FICTIONAL-SUPPRESSION';
  await decide(analyst.id, license, 'Do not contact', null, 'Fictional owner opted out.');
  for (const user of [s.owner, admin.id, analyst.id]) {
    for (const status of statuses) {
      await assert.rejects(decide(user, '\t fictional-suppression  ', status, letter), {code: ['Letter approved', 'Mailed'].includes(status) && user === analyst.id ? '42501' : '55000'});
    }
    assert.equal((await list(user)).find(d => d.license_no === license).status, 'Do not contact');
  }
  assert.equal((await events(license)).length, 1);
  await assert.rejects(s.db.query("update public.kalling_sourcing_decisions set status='New' where license_no=$1", [license]), /Do not contact is permanent/);
  await assert.rejects(s.db.query('delete from public.kalling_sourcing_decisions where license_no=$1', [license]), /Do not contact is permanent/);
});

test('invalid approvals, transitions, license numbers and notes leave no decision or event', async () => {
  const license = 'FICTIONAL-VALIDATION';
  await assert.rejects(decide(s.owner, license, 'Mailed'), /Approve the letter before marking it mailed/);
  await assert.rejects(decide(s.owner, license, 'Replied'), /Decisions only move forward/);
  await assert.rejects(decide(s.owner, license, 'New'), /Decisions only move forward/);
  await assert.rejects(decide(s.owner, license, 'Invented status'), /Choose a sourcing decision/);
  await assert.rejects(decide(s.owner, license, 'Letter approved'), /Draft the letter/);
  await assert.rejects(decide(s.owner, license, 'Letter approved', 'Please opt out if you prefer.'), /word for word/);
  await assert.rejects(decide(s.owner, license, 'Letter approved', letter + ' --'), /single hyphens/);
  await assert.rejects(decide(s.owner, license, 'Letter approved', letter.padEnd(4001, 'x')), /4,000 characters/);
  for (const key of [null, ' \t ', 'X'.repeat(41)]) {
    await assert.rejects(decide(s.owner, key, 'Do not contact'), /between 1 and 40 characters/);
  }
  await assert.rejects(decide(s.owner, license, 'Do not contact', null, 'x'.repeat(401)), /400 characters/);
  assert.deepEqual(await events(license), []);
  assert.ok(!(await list(s.owner)).some(d => d.license_no === license));

  const exact = letter.padEnd(4000, ' ');
  const row = await decide(s.owner, 'F'.repeat(40), 'Letter approved', exact, 'N'.repeat(400));
  assert.equal(row.letter, exact, 'the approved text is preserved, including trailing spaces');
  assert.equal(row.note.length, 400);
});

test('overlapping decision requests preserve the transition order and an opt-out wins either way', async () => {
  // PGlite serializes its connection. Keep the first transaction open while the second
  // is requested so both commit orderings exercise the same RPC with distinct actors.
  function transact(user, args, afterDecision) {
    return s.db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      const result = await tx.query(decideSql, args);
      await afterDecision?.();
      return result.rows[0].decision;
    });
  }
  async function overlap(first, second) {
    let entered, release;
    const ready = new Promise(resolve => { entered = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    const a = transact(...first, async () => { entered(); await hold; });
    await Promise.race([ready, a]);
    const b = transact(...second);
    release();
    return Promise.allSettled([a, b]);
  }
  const approveFirst = 'FICTIONAL-APPROVE-RACE';
  let result = await overlap(
    [s.owner, [approveFirst, 'Letter approved', letter, null]],
    [analyst.id, [approveFirst, 'Do not contact', null, null]],
  );
  assert.deepEqual(result.map(r => r.value?.status), ['Letter approved', 'Do not contact']);
  assert.deepEqual((await events(approveFirst)).map(e => [e.from_status, e.to_status, e.by]), [
    ['New', 'Letter approved', 'fictional-0@marketplace.invalid'],
    ['Letter approved', 'Do not contact', analyst.email],
  ]);
  const suppressed = (await list(s.owner)).find(d => d.license_no === approveFirst);
  assert.equal(suppressed.status, 'Do not contact');
  assert.equal(suppressed.letter, letter, 'the earlier approved snapshot is kept for the firm');
  assert.equal(suppressed.approved_by, result[0].value.approved_by);
  assert.equal(suppressed.approved_at, result[0].value.approved_at);

  const suppressFirst = 'FICTIONAL-SUPPRESS-RACE';
  result = await overlap(
    [analyst.id, [suppressFirst, 'Do not contact', null, null]],
    [s.owner, [suppressFirst, 'Letter approved', letter, null]],
  );
  assert.equal(result[0].value?.status, 'Do not contact');
  assert.equal(result[1].status, 'rejected');
  assert.match(result[1].reason.message, /asked not to be contacted/);
  assert.deepEqual((await events(suppressFirst)).map(e => e.to_status), ['Do not contact']);
});

test('event history is append-only even for the database owner', async () => {
  const license = 'FICTIONAL-HISTORY';
  await decide(analyst.id, license, 'Letter drafted', letter);
  const before = await events(license);
  await assert.rejects(s.db.query("update public.kalling_sourcing_events set note='Changed' where license_no=$1", [license]), /history cannot be changed/);
  await assert.rejects(s.db.query('delete from public.kalling_sourcing_events where license_no=$1', [license]), /history cannot be changed/);
  await assert.rejects(s.db.query('truncate public.kalling_sourcing_events'), /history cannot be changed/);
  assert.deepEqual(await events(license), before);
});
