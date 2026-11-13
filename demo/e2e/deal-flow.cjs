// End-to-end check of a whole sale in the local demo. Run `npm run build && npx vite preview --port 4173`,
// then `node e2e/deal-flow.cjs [screenshot-dir]`. Uses one browser profile, so the public site, the advisor
// workspace and the owner portal share the demo's local storage, as they would for one person testing.
const {chromium}=require('playwright');const H=require('./helpers.cjs');const assert=require('node:assert/strict');const fs=require('node:fs');
const U=process.env.BASE||'http://127.0.0.1:4173/',OUT=process.argv[2]||'';
const shot=async(page,name,full=true)=>{if(OUT)await page.screenshot({path:`${OUT}/${name}.png`,fullPage:full});};
const step=(n,t)=>console.log(`${n}. ${t}`);

(async()=>{
  if(OUT)fs.mkdirSync(OUT,{recursive:true});
  const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:1440,height:900}}),errs=[];
  const watch=(p,tag)=>{p.on('pageerror',e=>errs.push(tag+': '+e.message));};
  const site=await ctx.newPage();watch(site,'site');
  // 1. An owner asks for a valuation on the public site.
  await H.submitLead(site,U);step(1,'lead submitted');

  // 2. The advisor qualifies the lead and the owner signs the engagement letter.
  const adv=await ctx.newPage();watch(adv,'advisor');
  await adv.goto(U+'#advisor/today');await adv.waitForSelector('text=Needs you');
  assert.ok(await adv.getByText('Call Pat Russo').count(),'the lead shows on Today');await shot(adv,'today-1440',false);
  await H.qualifyLead(adv);const link0=await H.prepareLetter(adv);
  const signer=await ctx.newPage();watch(signer,'owner');await H.ownerSigns(signer,link0);await H.countersign(adv);
  // 3. The Deal Room is at Engaged with the owner's requests open.
  assert.match(adv.url(),/#advisor\/deal\/.+\/Owner$/);assert.equal(await adv.locator('.deal-head h1').innerText(),'Russo Heating & Air');
  await adv.waitForSelector('text=Owner has joined');step(3,'Deal Room open at Engaged after the letter');
  const tab=async name=>{await adv.getByRole('tab',{name:new RegExp('^'+name)}).click();await adv.waitForTimeout(250);};

  // 4. Recast with an add-back.
  await tab('Valuation and recast');
  const field=label=>adv.getByLabel(label,{exact:true});
  await field('Revenue, last full year').fill('2600000');await field('Pre-tax profit').fill('310000');await field('Owner’s pay and benefits').fill('150000');
  await field('Active maintenance agreements').fill('850');await field('Service and maintenance, % of revenue').fill('55');
  await adv.getByRole('button',{name:'Add a line'}).click();await adv.getByLabel('Item 1').fill('One-time lawsuit settlement');await adv.getByLabel('Amount 1').fill('40000');await adv.getByLabel('Reason 1').fill('Settled in 2025 and will not recur');await adv.getByLabel('Evidence 1').fill('2025 P&L, line 61');
  await field('Asking price').fill('1950000');
  assert.match(await adv.locator('.deal-recast-figs').innerText(),/\$500K/);
  await adv.getByRole('button',{name:'Save recast'}).click();await adv.waitForSelector('text=Recast saved.');
  assert.match(await adv.locator('.deal-figs').innerText(),/\$500K/);step(4,'recast saved, SDE $500K');

  // 5. Listing: blocked by the anonymity check, fixed, published.
  await tab('Listing');
  await adv.getByRole('textbox',{name:'City',exact:true}).fill('Edison');
  await adv.getByLabel('Headline').fill('Edison residential HVAC company with 850 maintenance agreements');
  await adv.getByLabel(/^Summary/).fill('A residential service and replacement company with a steady base of maintenance agreements, a trained team of technicians and an owner ready to help with the transition.');
  await adv.getByLabel('Highlights, one per line').fill('850 active maintenance agreements\nFour licensed technicians\nOwner will stay for a transition period');
  await adv.getByRole('button',{name:'Save draft'}).click();await adv.waitForTimeout(400);
  assert.match(await adv.locator('#anon-check').innerText(),/“Edison” in headline/);assert.ok(await adv.locator('.adv-listing-form').getByRole('button',{name:'Publish listing'}).isDisabled(),'publish waits for the check');
  assert.equal(await adv.inputValue('.deal-stage select'),'Preparing');await shot(adv,'deal-listing-blocked-1440');
  await adv.getByLabel('Headline').fill('Central Jersey residential HVAC company with 850 maintenance agreements');
  await adv.locator('.adv-listing-form').getByRole('button',{name:'Publish listing'}).click();await adv.waitForSelector('text=The deal is now Listed');
  assert.equal(await adv.inputValue('.deal-stage select'),'Listed');step(5,'listing blocked, fixed and published');

  // 6. A buyer signs the NDA on the public site.
  await site.goto(U+'#/listings');await site.waitForTimeout(600);await site.getByText('Central Jersey residential HVAC company with 850').click();await site.waitForTimeout(500);
  const number=(site.url().match(/KL-\d+/)||[])[0];assert.ok(number,'listing has a number');
  await site.getByRole('link',{name:'Sign in to request details'}).click();await site.waitForTimeout(300);
  await site.fill('input[name=email]','alex@buyer.test');await site.getByRole('button',{name:'Continue'}).click();await site.waitForTimeout(300);
  await site.fill('input[name=name]','Alex Morgan');await site.selectOption('select[name=funds]','$500K to $1M');await site.fill('input[name=maxPrice]','4,000,000');await site.check('input[value="SBA 7(a) loan"]');await site.check('input[value="Central Jersey"]');
  await site.fill('textarea[name=experience]','Ten years running field operations for a regional mechanical contractor; NJ master HVACR license.');
  await site.getByRole('button',{name:'Save profile'}).click();await site.waitForSelector('text=Review and sign the NDA');
  await site.getByRole('button',{name:'Review and sign the NDA'}).click();await site.check('.ks-nda input[type=checkbox]');await site.fill('.ks-nda input:not([type=checkbox])','Alex Morgan');
  await site.getByRole('button',{name:'Sign and request access'}).click();await site.waitForSelector('text=Request received');step(6,'buyer signed the NDA for '+number);
  const listingUrl=site.url();

  // 7. The advisor approves from the Deal Room.
  await adv.reload();await adv.waitForSelector('.deal-head h1');assert.match(adv.url(),/\/Listing$/,'reload keeps the tab');
  await adv.waitForSelector('role=tab[name=/^Buyers 1/]');await tab('Buyers');assert.match(await adv.locator('.adv-facts').first().innerText(),/Alex Morgan/);
  await shot(adv,'deal-buyers-1440');await adv.getByRole('button',{name:'Approve and share details'}).click();await adv.waitForSelector('text=Approved');step(7,'approved in the Deal Room');

  // 8. The owner portal shows the buyer without a name.
  const owner=signer;await owner.reload();
  await owner.waitForSelector('text=Document requests');const ownerText=await owner.locator('body').innerText();
  assert.match(ownerText,/Buyer 1, owner-operator/);assert.doesNotMatch(ownerText,/Alex Morgan/);step(8,'owner portal shows Buyer 1 without a name');
  await shot(owner,'owner-home-1440');

  // 9. The buyer makes an offer.
  await site.goto(listingUrl);await site.reload();await site.waitForTimeout(600);await site.locator('.ks-offer select[name=kind]').selectOption('Letter of intent');await site.fill('.ks-offer input[name=price]','1900000');await site.fill('.ks-offer input[name=cashAtClose]','1900000');await site.getByRole('button',{name:'Submit offer'}).click();await site.waitForTimeout(500);step(9,'offer submitted');

  // 10. The advisor shares the exact offer; 11. the recorded owner instruction opens unconfirmed execution.
  await adv.reload();await adv.waitForSelector('.deal-head h1');await adv.getByRole('button',{name:'Share offer with seller'}).first().click();await adv.waitForTimeout(300);
  assert.match(adv.url(),/\/Offers$/);await shot(adv,'deal-offers-1440');
  await adv.locator('textarea[name=ownerNote]').fill('Fictional offer terms prepared for the seller to discuss.');await adv.getByRole('button',{name:'Share version 1 with seller',exact:true}).click();await adv.getByRole('columnheader').filter({hasText:'Shared with seller'}).waitFor();step(10,'offer shared');
  await adv.locator('textarea[name=instruction]').fill('Fictional owner confirmed version 1 by telephone for this software test.');await adv.getByRole('button',{name:'Record owner instruction for version 1',exact:true}).click();await adv.waitForSelector('text=Owner instruction recorded.');
  assert.notEqual(await adv.inputValue('.deal-stage select'),'Under LOI');await adv.waitForSelector('text=No execution transaction yet');step(11,'owner instruction recorded; signed LOI remains unconfirmed');
  await owner.reload();await owner.waitForSelector('text=Document requests');assert.match(await owner.locator('body').innerText(),/Offer made/);

  // Back button returns to the same Deal Room tab.
  await adv.getByRole('button',{name:'Deals',exact:true}).click();await adv.waitForSelector('.adv-board, .adv-table');await adv.goBack();await adv.waitForSelector('.deal-head h1');
  assert.match(adv.url(),/\/LOI$/);assert.equal(await adv.getByRole('tab',{selected:true}).innerText(),'LOI');console.log('back button keeps the execution tab');

  if(OUT){
    await adv.goto(U+'#advisor/deals');await adv.waitForSelector('.adv-board');await shot(adv,'deals-1440',false);
    await adv.goto(U+'#advisor/today');await adv.waitForSelector('text=Needs you');await shot(adv,'today-after-1440',false);
    const id=decodeURIComponent((await adv.evaluate(()=>JSON.parse(localStorage.getItem('kalling-pages-demo-v1')).companies[0].id)));
    for(const t of ['Overview','Valuation and recast','Listing','Buyers','Offers','Documents','Owner','Research and drafting','Activity']){await adv.goto(U+'#advisor/deal/'+id+'/'+encodeURIComponent(t));await adv.waitForSelector('.deal-head h1');await adv.waitForTimeout(400);await shot(adv,'deal-'+t.toLowerCase().replace(/ /g,'-')+'-1440');}
    await owner.locator('.portal-request-head').first().click().catch(()=>{});await owner.waitForTimeout(300);await shot(owner,'owner-request-open-1440');
    const m=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});const state=await adv.evaluate(()=>({...localStorage}));
    const mp=await m.newPage();watch(mp,'mobile');await mp.addInitScript(s=>{for(const [k,v] of Object.entries(s))localStorage.setItem(k,v);sessionStorage.setItem('kalling-portal-local-owner','pat@russohvac.test');},state);
    const pages=[['today','#advisor/today'],['deals','#advisor/deals'],['deal-overview','#advisor/deal/'+id+'/Overview'],['deal-recast','#advisor/deal/'+id+'/Valuation%20and%20recast'],['deal-offers','#advisor/deal/'+id+'/Offers'],['owner-home','#owner']];
    for(const [name,h] of pages){await mp.goto(U+h);await mp.waitForTimeout(900);const over=await mp.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(over,false,'Page-wide overflow on '+name+' at 390px');await shot(mp,name+'-390');}
  }
  console.log('errors:',errs.join(' | ')||'none');await b.close();if(errs.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
