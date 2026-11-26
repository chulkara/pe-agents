const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {PDFDocument, StandardFonts} = require('pdf-lib');

const base = new URL(process.env.BASE || 'http://127.0.0.1:4173/');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) {
  throw Error('Data room fixtures require a loopback server.');
}

const companyId = 'fictional-ask-room-hvac';
const buyer = {kind: 'buyer', email: 'buyer@ask-room.invalid'};
const buyerName = 'Fictional Buyer';
const advisor = {kind: 'advisor', name: 'Fictional Advisor', canWrite: true};
const quote = 'Thirty-two service contracts renew in the spring.';
const lockedQuote = 'Forty-seven rooftop warranty transfers expire in July.';
const buyerQuestion = 'How many maintenance agreements renew in the spring?';
const noMatchQuestion = 'When do rooftop warranty transfers expire?';
const pendingQuote = 'Calibration records are kept in the fictional shop logbook.';
const pendingLabel = 'Not yet approved by the owner';

async function makePdf(name, texts) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = pdf.addPage();
    page.drawText(text, {x: 40, y: 740, size: 12, font});
  }
  return new File([await pdf.save()], name, {type: 'application/pdf'});
}

async function fixture() {
  const [
    {sample},
    {sampleListings},
    {LOCAL_BROKER_KEY, localBrokerStore},
    {localDataRoomStore},
    {localPortalStore, LOCAL_PORTAL_KEY},
  ] = await Promise.all([
    import('../lib/domain.ts'),
    import('../lib/brokerageSamples.ts'),
    import('../lib/brokerStore.ts'),
    import('../lib/dataRoomStore.ts'),
    import('../lib/portalStore.ts'),
  ]);
  const values = new Map();
  const kv = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const blobs = new Map();
  const bytes = {get: async id => blobs.get(id), put: async (id, blob) => blobs.set(id, blob)};
  const help = {name: advisor.name, email: 'advisor@ask-room.invalid'};
  const portalSettings = {firmId: 'local-demo', firmName: 'Fictional Kalling', team: [], kv, bytes};
  const portal = localPortalStore({...portalSettings, actor: {side: 'firm', ...help}});
  const portalId = await portal.create({
    companyId, businessName: 'Fictional HVAC', ownerName: 'Fictional Seller',
    ownerEmail: 'seller@ask-room.invalid', help,
  });
  const listing = {
    ...sampleListings[0], companyId, portalId, id: 'fictional-ask-room-listing', number: 'KL-9984',
    headline: 'Fictional HVAC contractor', confidential: {businessName: 'Fictional HVAC', city: '', website: '', details: ''},
  };
  kv.setItem(LOCAL_BROKER_KEY, JSON.stringify({listings: [listing]}));
  const buyerStore = localBrokerStore(buyer, kv);
  await buyerStore.saveProfile({
    name: buyerName, phone: '', type: 'Owner-operator', company: '', funds: '$500K to $1M',
    financing: ['Cash'], experience: 'Fictional HVAC buyer for software testing only.',
    regions: ['Central Jersey'], maxPrice: 4000000,
  });
  await buyerStore.requestAccess(listing, buyerName, true, 'Fictional diligence.');
  const advisorStore = localBrokerStore(advisor, kv);
  const [request] = await advisorStore.requests();
  await advisorStore.decide(request.id, 'Approved', 'Fictional NDA reviewed.');

  const room = localDataRoomStore(advisor, {kv, bytes});
  async function addDocument(displayName, tier, pages) {
    const original = await portal.uploadFirmFile(portalId, await makePdf(displayName + '.pdf', pages));
    return room.saveItem({
      listingId: listing.id, portalId, fileId: original.id, fileName: original.name, mime: original.mime,
      displayName, folder: 'Customers', tier, allowDownload: false, note: '',
    });
  }
  const itemId = await addDocument('Renewal schedule', 'After NDA', [
    'The parts inventory is kept at the service depot.',
    quote,
  ]);
  const lockedId = await addDocument('Warranty register', 'After LOI', [lockedQuote]);
  await room.setStatus(listing.id, 'Proposed');
  await room.ownerDecide([itemId, lockedId], 'Approved', '', [portalId]);
  await room.setStatus(listing.id, 'Published');
  await room.setWeeklySummary(listing.id, true, [portalId]);
  await addDocument('Shop handbook', 'After NDA', [pendingQuote]);

  const workspace = sample();
  workspace.firm = {...workspace.firm, name: 'Fictional Kalling', operator: advisor.name, configured: true};
  workspace.companies = [{
    ...workspace.companies[0], id: companyId, name: 'Fictional HVAC', owner: 'Fictional Seller',
    email: 'seller@ask-room.invalid', website: '', status: 'Interested', sample: true, documents: [],
  }];
  workspace.deals = [];
  workspace.events = [];
  const storage = {
    [LOCAL_BROKER_KEY]: kv.getItem(LOCAL_BROKER_KEY),
    [LOCAL_PORTAL_KEY]: kv.getItem(LOCAL_PORTAL_KEY),
    'kalling-pages-demo-v1': JSON.stringify(workspace),
    'kalling-marketplace-demo-v1': 'true',
    'kalling-cloud-disconnected-v1': 'true',
    'kalling-buyer-email': buyer.email,
  };
  const files = await Promise.all([...blobs].map(async ([id, blob]) => ({
    id, mime: blob.type, content: Buffer.from(await blob.arrayBuffer()).toString('base64'),
  })));
  return {listing, itemId, request, storage, files, brokerKey: LOCAL_BROKER_KEY};
}

async function seedBrowser(page, {storage, files}) {
  const seedUrl = new URL('ask-room-test-fixture', base).href;
  await page.route(seedUrl, route => route.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
  await page.goto(seedUrl);
  await page.evaluate(async ({storage, files}) => {
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('kalling-portal-files', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('files');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        for (const {id, mime, content} of files) {
          const bytes = Uint8Array.from(atob(content), char => char.charCodeAt(0));
          store.put(new Blob([bytes], {type: mime}), id);
        }
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, {storage, files});
}

async function search(page, question) {
  await page.getByRole('heading', {name: 'Ask the data room', exact: true}).waitFor();
  await page.getByRole('textbox', {name: 'Question about the data room', exact: true}).fill(question);
  await page.getByRole('button', {name: 'Search documents', exact: true}).click();
}

async function assertFits(page, label) {
  const {screen, content} = await page.evaluate(() => ({
    screen: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.equal(screen, 390, label + ' uses a 390px viewport');
  assert.equal(content, screen, label + ' fits without sideways scroll');
}

async function testHostedBuyer(browser, data) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const project = 'fictional-ask-room';
  const origin = `https://${project}.supabase.co`;
  const at = '2026-11-25T12:00:00Z';
  const user = {id: 'fictional-buyer', email: buyer.email, email_confirmed_at: at, app_metadata: {}, user_metadata: {}};
  const session = {
    access_token: 'fictional-access-token', refresh_token: 'fictional-refresh-token', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  const profile = {id: data.request.buyerId, email: buyer.email, name: buyerName, saved: []};
  const listing = {
    ...data.listing,
    asking_price: data.listing.askingPrice, recurring_pct: data.listing.recurringPct,
    residential_pct: data.listing.residentialPct, seller_financing: data.listing.sellerFinancing,
    real_estate: data.listing.realEstate, created_at: at, published_at: at, updated_at: at,
  };
  const access = {
    id: data.request.id, listing_id: listing.id, buyer_id: profile.id, status: 'Approved', nda: data.request.nda,
  };
  const approvedItem = {
    id: data.itemId, display_name: 'Renewal schedule', folder: 'Customers', tier: 'After NDA',
    mime: 'application/pdf', allow_download: false, note: '', open: true,
  };
  const responses = {
    '/auth/v1/user': user,
    '/rest/v1/kalling_listings': [listing],
    '/rest/v1/kalling_listing_private': [{listing_id: listing.id, business_name: 'Fictional HVAC'}],
    '/rest/v1/kalling_buyers': [profile],
    '/rest/v1/kalling_access': [access],
    '/rest/v1/kalling_listing_questions': [],
    '/rest/v1/rpc/kalling_public_cases': [],
    '/rest/v1/rpc/kalling_offer_rows': [],
    '/rest/v1/rpc/kalling_dataroom_buyer': {tier: 1, items: [approvedItem]},
    '/rest/v1/rpc/kalling_dataroom_open': {
      ticket: 'fictional-view-ticket', path: 'fixtures/renewal-schedule.pdf', name: approvedItem.display_name,
      file_name: 'renewal-schedule.pdf', mime: approvedItem.mime, allow_download: false,
      watermark: `${buyerName}, ${buyer.email}, 2026-11-25. Confidential, Kalling data room`,
    },
    '/rest/v1/rpc/kalling_dataroom_events': null,
    '/rest/v1/rpc/kalling_listing_ask': null,
  };
  const page = await context.newPage();
  const errors = [];
  const calls = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({origin, project, session}) => {
    localStorage.setItem('kalling-cloud-public-config-v1', JSON.stringify({
      url: origin, publishableKey: 'sb_publishable_fictional-browser-test',
    }));
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session));
  }, {origin, project, session});
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base.origin) return route.continue();
    if (url.origin !== origin) return route.abort();

    const headers = {
      'access-control-allow-origin': base.origin,
      'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, x-supabase-api-version',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers});

    const path = url.pathname;
    const body = request.postDataJSON();
    calls.push({path, body});
    if (path === '/rest/v1/rpc/kalling_dataroom_search') {
      const results = body?.p_question === buyerQuestion
        ? [{item_id: data.itemId, display_name: 'Renewal schedule', page: 2, quote, score: 1}]
        : [];
      return route.fulfill({json: results, headers});
    }
    if (path.endsWith('/kalling-portal/fixtures/renewal-schedule.pdf')) {
      return route.fulfill({body: Buffer.from(data.files[0].content, 'base64'), contentType: 'application/pdf', headers});
    }
    if (Object.hasOwn(responses, path)) {
      return route.fulfill({json: responses[path], headers});
    }
    errors.push('Unexpected Supabase request: ' + path);
    return route.abort();
  });
  try {
    await page.goto(new URL('#/listings/' + listing.number, base).href);
    await search(page, buyerQuestion);
    const card = page.getByRole('listitem').filter({hasText: 'Renewal schedule, page 2'});
    await card.getByText(quote, {exact: true}).waitFor();
    await assertFits(page, 'Hosted buyer search results');
    await card.getByRole('button', {name: 'Open at page 2', exact: true}).click();
    const viewer = page.getByRole('dialog', {name: 'Renewal schedule'});
    await viewer.getByText('Page 2 of 2', {exact: true}).waitFor();
    await viewer.locator('canvas').waitFor();
    assert.match(await viewer.locator('.ks-viewer-stamp').innerText(), /Fictional Buyer, buyer@ask-room\.invalid/);
    await viewer.getByRole('button', {name: 'Close', exact: true}).click();
    await search(page, noMatchQuestion);
    await page.getByText('Nothing in the documents answers that yet.', {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Ask the advisor', exact: true}).click();
    await page.getByText('Question sent. Answers appear on this listing.', {exact: true}).waitFor();

    assert.deepEqual(calls.filter(call => call.path.endsWith('/kalling_dataroom_search')).map(call => call.body), [
      {p_listing: listing.id, p_question: buyerQuestion}, {p_listing: listing.id, p_question: noMatchQuestion},
    ]);
    const openIndex = calls.findIndex(call => call.path.endsWith('/kalling_dataroom_open'));
    const downloadIndex = calls.findIndex(call => call.path.endsWith('/kalling-portal/fixtures/renewal-schedule.pdf'));
    assert.ok(openIndex >= 0 && downloadIndex > openIndex, 'opening a result requests a ticket before reading bytes');
    assert.deepEqual(calls[openIndex].body, {p_item: data.itemId});
    assert.deepEqual(calls.find(call => call.path.endsWith('/kalling_listing_ask'))?.body,
      {p_listing: listing.id, p_body: noMatchQuestion, p_buyer: null});
    assert.deepEqual(errors, []);
    console.log('Hosted buyer data room passed against mocked Supabase at 390px.');
  } finally {
    await context.close();
  }
}

(async () => {
  const data = await fixture();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    await context.route('**/*', route => {
      return new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await seedBrowser(page, data);
    await page.goto(new URL('#/listings/' + data.listing.number, base).href);
    await search(page, buyerQuestion);
    const quoteCard = page.getByRole('listitem').filter({hasText: 'Renewal schedule, page 2'});
    await quoteCard.getByText(quote, {exact: true}).waitFor();
    const openPage = quoteCard.getByRole('button', {name: 'Open at page 2', exact: true});
    await assertFits(page, 'Buyer search results');
    await openPage.click();
    const viewer = page.getByRole('dialog', {name: 'Renewal schedule'});
    await viewer.getByText('Page 2 of 2', {exact: true}).waitFor();
    await viewer.locator('canvas').waitFor();
    assert.match(await viewer.locator('.ks-viewer-stamp').innerText(), /Fictional Buyer, buyer@ask-room\.invalid/);
    await viewer.getByRole('button', {name: 'Close', exact: true}).click();
    const opens = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).views.filter(view => view.event === 'opened'), data.brokerKey);
    assert.equal(opens.length, 1, 'search results never count as document opens');
    assert.equal(opens[0].itemId, data.itemId, 'opening a citation logs the selected document');
    assert.equal(opens[0].buyerId, data.request.buyerId, 'the open is logged for the approved buyer');

    await search(page, noMatchQuestion);
    await page.getByText('Nothing in the documents answers that yet.', {exact: true}).waitFor();
    assert.equal(await page.getByText(lockedQuote, {exact: true}).count(), 0, 'the buyer has NDA access only');
    await page.getByRole('button', {name: 'Ask the advisor', exact: true}).click();
    await page.getByText('Question sent. Answers appear on this listing.', {exact: true}).waitFor();

    await page.goto(new URL('#advisor/deal/' + companyId + '/Buyers', base).href);
    const thread = page.locator('.adv-thread');
    await thread.getByText(noMatchQuestion, {exact: false}).waitFor();
    assert.equal(await thread.getByText(buyerQuestion, {exact: false}).count(), 0, 'only the question the buyer sent enters the advisor’s inbox');

    await page.getByRole('tab', {name: 'Data room', exact: true}).click();
    await search(page, noMatchQuestion);
    const approvedCard = page.getByRole('listitem').filter({hasText: 'Warranty register, page 1'});
    await approvedCard.getByText(lockedQuote, {exact: true}).waitFor();
    assert.equal(await approvedCard.getByText(pendingLabel, {exact: true}).count(), 0);
    const summary = await page.locator('.dr-summary').innerText();
    assert.match(summary, /2 questions asked/);
    assert.ok(!summary.includes(buyerQuestion) && !summary.includes(noMatchQuestion), 'owner summary does not reveal search text');
    await search(page, 'Where are calibration records kept?');
    const pendingCard = page.getByRole('listitem').filter({hasText: 'Shop handbook, page 1'});
    await pendingCard.getByText(pendingQuote, {exact: true}).waitFor();
    await pendingCard.getByText(pendingLabel, {exact: true}).waitFor();
    await assertFits(page, 'Advisor search results');

    const buyerTab = await context.newPage();
    buyerTab.on('pageerror', error => errors.push(error.message));
    await buyerTab.goto(new URL('#/listings/' + data.listing.number, base).href);
    await search(buyerTab, buyerQuestion);
    const displayedQuote = buyerTab.getByText(quote, {exact: true});
    await displayedQuote.waitFor();
    await page.evaluate(({key, id}) => {
      const db = JSON.parse(localStorage.getItem(key));
      db.access.find(request => request.id === id).status = 'Declined';
      localStorage.setItem(key, JSON.stringify(db));
    }, {key: data.brokerKey, id: data.request.id});
    await buyerTab.bringToFront();
    await displayedQuote.waitFor({state: 'detached'});
    assert.deepEqual(errors, []);
    console.log('Ask the data room passed for buyer and advisor at 390px.');
    await context.close();
    await testHostedBuyer(browser, data);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
