// End-to-end seller flow with a scripted local model: qualify, letter, documents, AI drafts, data room.
// Run `npm run build && npx vite preview --port 4173`, then `node e2e/seller-flow.cjs [screenshot-dir]`.
// Starts a fake Ollama on 127.0.0.1:11434 and the Kalling worker on 127.0.0.1:47311 in a temporary folder.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawn}=require('node:child_process');
const H=require('./helpers.cjs');
const U=process.env.BASE||'http://127.0.0.1:4173/',OUT=process.argv[2]||'',FX=path.join(__dirname,'fixtures');
const shot=async(page,name,full=true)=>{if(OUT)await page.screenshot({path:`${OUT}/${name}.png`,fullPage:full});};
const step=(n,t)=>console.log(`${n}. ${t}`);
const until=async(fn,ms=60000)=>{const end=Date.now()+ms;for(;;){const v=await fn().catch(()=>false);if(v)return v;if(Date.now()>end)throw Error('Timed out');await new Promise(r=>setTimeout(r,400));}};

(async()=>{
  if(OUT)fs.mkdirSync(OUT,{recursive:true});
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'kalling-e2e-')),procs=[];
  const start=(args,env={})=>{const p=spawn(process.execPath,['--experimental-strip-types','--no-warnings',...args],{cwd:path.join(__dirname,'..'),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});procs.push(p);p.stderr.on('data',d=>process.env.DEBUG&&process.stderr.write(d));return p;};
  const ready=(p,re)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(Error('process did not start')),20000);p.stdout.on('data',d=>{if(re.test(String(d))){clearTimeout(t);res();}});p.on('exit',c=>rej(Error('exited '+c)));});
  const ollama=start(['e2e/fake-ollama.mjs']);await ready(ollama,/fake ollama ready/);
  const worker=start(['scripts/kalling-worker.mjs','start'],{KALLING_AGENT_HOME:home,HOME:home});await ready(worker,/Local Kalling demo connection ready/);
  const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:1440,height:900}}),errs=[];
  const watch=(p,tag)=>{p.on('pageerror',e=>errs.push(tag+': '+e.message));};
  try{
  const site=await ctx.newPage();watch(site,'site');
  await H.submitLead(site,U);step(1,'lead submitted');
  const adv=await ctx.newPage();watch(adv,'advisor');await adv.goto(U+'#advisor/today');await adv.waitForSelector('text=Needs you');
  await H.qualifyLead(adv);await shot(adv,'qualified-1440');step(2,'qualified');
  const link=await H.prepareLetter(adv,n=>shot(adv,n+'-1440'));step(3,'letter blocked with empty fees, then ready');
  const owner=await ctx.newPage();watch(owner,'owner');await H.ownerSigns(owner,link);await shot(owner,'letter-owner-1440');step(4,'owner saw only the letter and signed');
  await H.countersign(adv);await shot(adv,'signed-advisor-1440');
  await owner.reload();await owner.waitForSelector('.portal-request');const titles=await owner.locator('.portal-request-title strong').allInnerTexts();
  assert.ok(titles.some(t=>/Profit and loss statements for \d{4}, \d{4} and \d{4}/.test(t)),'years filled in');step(5,'countersigned; requests open with years filled in');

  // 6. The owner uploads fictional documents.
  const up=async(title,files)=>{const r=owner.locator('.portal-request').filter({hasText:title}).first();if(!(await r.getAttribute('class')).includes('open'))await r.locator('.portal-request-head').click();
    await r.locator('input[type=file]').setInputFiles(files.map(f=>path.join(FX,f)));await owner.waitForTimeout(400);await r.getByRole('button',{name:'Send for review'}).click();await owner.waitForTimeout(300);};
  await up('Profit and loss statements',['pl-2023.pdf','pl-2024.pdf','pl-2025.pdf']);await up('Business tax returns',['tax-returns.pdf']);await up('Maintenance agreement list',['agreements.csv']);await up('Team overview',['team.xlsx']);
  await owner.locator('#portal-about textarea').first().fill('Pat Russo started the business in 2007 out of his garage and added a second van in 2009.');await owner.waitForSelector('text=Saved');
  await shot(owner,'owner-requests-1440');step(6,'owner uploaded documents and answered about the business');

  // 7. The advisor accepts the documents; their text is read in the browser.
  const tab=async name=>{await adv.getByRole('tab',{name:new RegExp('^'+name)}).click();await adv.waitForTimeout(300);};
  await adv.reload();await adv.waitForSelector('.deal-head h1');await tab('Documents');
  for(let i=0;i<4;i++){const r=adv.locator('.portal-admin-request.submitted').first();await r.getByRole('button',{name:'Accept'}).click();await adv.waitForSelector('text=Reading',{state:'detached',timeout:30000}).catch(()=>{});await adv.waitForTimeout(500);}
  await until(async()=>(await adv.locator('text=Text read').count())>=5);step(7,'documents accepted and read');

  // 8. Recast from documents: skip one line, apply the rest.
  await tab('Valuation and recast');await adv.locator('.drf-panel').getByRole('button',{name:'Draft recast'}).click();
  await adv.waitForSelector('text=Apply accepted lines',{timeout:60000});await shot(adv,'recast-draft-1440');
  assert.match(await adv.locator('.drf-mismatch').innerText(),/2024: Net income against ordinary business income differ/);
  const spouse=adv.locator('.drf-props tr').filter({hasText:'spouse'});await adv.getByRole('button',{name:'Accept supported, skip the rest'}).click();
  assert.match(await spouse.getAttribute('class'),/skipped/);
  await adv.getByRole('button',{name:'Apply accepted lines'}).click();await adv.waitForSelector('text=Applied');
  const sde=await adv.locator('.deal-figs').innerText();assert.match(sde,/\$2\.6M/);step(8,'recast drafted, one line skipped, the rest applied: '+sde.replace(/\s+/g,' ').slice(0,80));

  // 9. Teaser from the recast: a planted town is caught and blocks publishing.
  await tab('Listing');await adv.locator('.drf-panel').getByRole('button',{name:'Draft teaser'}).click();await adv.waitForSelector('text=Use the whole draft',{timeout:60000});
  assert.match(await adv.locator('.drf-findings').innerText(),/Edison/);await adv.getByRole('button',{name:'Use the whole draft'}).click();await adv.waitForTimeout(300);
  await adv.getByRole('textbox',{name:'City',exact:true}).fill('Edison');await adv.waitForTimeout(200);
  assert.ok(await adv.locator('.adv-listing-form').getByRole('button',{name:'Publish listing'}).isDisabled(),'blocked by the town');await shot(adv,'teaser-blocked-1440');
  await adv.locator('#anon-check').getByRole('button',{name:'Use suggestion'}).first().click();await adv.waitForTimeout(200);
  for(const box of await adv.locator('.anon-warn input').all())await box.fill('Checked, rounded already');
  await adv.locator('.adv-listing-form').getByRole('button',{name:'Save draft'}).click();await adv.waitForSelector('text=Saved as a draft');step(9,'teaser drafted; town caught and fixed');

  // 10. Memorandum: an unsourced sentence blocks release; the advisor resolves it, approves, and the owner approves.
  await tab('Materials');await adv.getByRole('button',{name:'Draft memorandum'}).click();
  await adv.getByRole('button',{name:'Use this draft'}).click({timeout:90000});await adv.waitForSelector('.cim-checks');
  assert.match(await adv.locator('.cim-checks').innerText(),/Not ready to release/);
  assert.ok(await adv.getByRole('button',{name:'Approve as advisor'}).isDisabled(),'blocked by the unsourced sentence');await shot(adv,'cim-blocked-1440');
  for(let i=0;i<10&&(await adv.locator('.cim-para.needs').count());i++){await adv.locator('.cim-para.needs').first().getByRole('button',{name:'Remove sentence'}).click();await adv.waitForTimeout(300);}
  await until(async()=>/Ready to release/.test(await adv.locator('.cim-checks').innerText()),15000);
  await adv.getByRole('button',{name:'Approve as advisor'}).click();await adv.getByRole('button',{name:'Send to owner for review'}).click();await adv.waitForSelector('text=Sent to the owner’s portal');
  await owner.reload();await owner.waitForSelector('#portal-memo');await shot(owner,'cim-owner-1440');await owner.getByRole('button',{name:'Approve the memorandum'}).click();await owner.waitForSelector('text=You approved version');
  await adv.reload();await adv.waitForSelector('.deal-head h1');await tab('Materials');await adv.waitForSelector('text=Approved by you and the owner',{timeout:30000});step(10,'memorandum blocked, resolved, approved by advisor and owner');

  // 11. Publish the anonymous listing.
  await tab('Listing');const headline=await adv.getByLabel('Headline').inputValue();
  assert.ok(Number((await adv.getByRole('textbox',{name:'Revenue',exact:true}).inputValue()).replace(/\D/g,''))>0&&Number((await adv.getByRole('textbox',{name:'Earnings (SDE)',exact:true}).inputValue()).replace(/\D/g,''))>0,'revenue and SDE come from the recast');
  await adv.getByRole('textbox',{name:'Asking price',exact:true}).fill('2,200,000');await adv.waitForTimeout(200);
  await adv.locator('.adv-listing-form').getByRole('button',{name:'Publish listing'}).click();await adv.waitForSelector('text=The deal is now Listed');step(11,'listing published: '+headline);

  // 12. Data room: the memorandum and two owner documents, approved by the owner, then published.
  await tab('Data room');await adv.getByRole('button',{name:'Add memorandum'}).click();await adv.waitForSelector('text=Memorandum added');
  for(const f of ['pl-2025.pdf','tax-returns.pdf']){await adv.locator('.dr-choices li').filter({hasText:f}).getByRole('button',{name:'Add'}).click();await adv.getByRole('button',{name:'Add to data room'}).click();await adv.waitForSelector('text=Added. Send it to the owner');}
  assert.ok(await adv.getByRole('button',{name:'Publish data room'}).isDisabled(),'publishing waits for the owner');
  await adv.getByRole('button',{name:'Send to owner for approval'}).click();await adv.waitForSelector('text=Sent to the owner.');await shot(adv,'dataroom-advisor-1440');
  await owner.reload();await owner.waitForSelector('#portal-dataroom');await shot(owner,'dataroom-owner-1440');
  await owner.getByRole('button',{name:/^Approve all 3/}).click();await owner.waitForSelector('text=Approved every document.');
  await adv.reload();await adv.waitForSelector('.dr-status');await adv.getByRole('button',{name:'Publish data room'}).click();await adv.waitForSelector('text=The data room is open to approved buyers.');step(12,'data room approved by the owner and published');

  // 13. A buyer signs the NDA and is approved.
  await site.goto(U+'#/listings');await site.waitForTimeout(600);await site.getByText(headline).first().click();await site.waitForTimeout(500);
  await site.getByRole('link',{name:'Sign in to request details'}).click();await site.waitForTimeout(300);
  await site.fill('input[name=email]','alex@buyer.test');await site.getByRole('button',{name:'Continue'}).click();await site.waitForTimeout(300);
  await site.fill('input[name=name]','Alex Morgan');await site.selectOption('select[name=funds]','$500K to $1M');await site.fill('input[name=maxPrice]','4,000,000');await site.check('input[value="SBA 7(a) loan"]');await site.check('input[value="Central Jersey"]');
  await site.fill('textarea[name=experience]','Ten years running field operations for a regional mechanical contractor; NJ master HVACR license.');
  await site.getByRole('button',{name:'Save profile'}).click();await site.waitForSelector('text=Review and sign the NDA');
  await site.getByRole('button',{name:'Review and sign the NDA'}).click();await site.check('.ks-nda input[type=checkbox]');await site.fill('.ks-nda input:not([type=checkbox])','Alex Morgan');
  await site.getByRole('button',{name:'Sign and request access'}).click();await site.waitForSelector('text=Request received');const listingUrl=site.url();
  await adv.reload();await adv.waitForSelector('.deal-head h1');await tab('Buyers');await adv.getByRole('button',{name:'Approve and share details'}).click();await adv.waitForSelector('text=Approved');step(13,'buyer signed the NDA and was approved');

  // 14. The buyer opens the memorandum with a watermark; the after-LOI tax returns stay locked.
  await site.reload();await site.waitForSelector('.ks-dr');
  const tax=site.locator('.ks-dr-folder li').filter({hasText:/tax returns/i});assert.match(await tax.innerText(),/After LOI/);
  await site.locator('.ks-dr-folder li').filter({hasText:'Confidential memorandum'}).getByRole('button',{name:'Open'}).click();
  await site.waitForSelector('.ks-viewer canvas');await site.waitForTimeout(800);
  assert.match(await site.locator('.ks-viewer-stamp').innerText(),/^Alex Morgan, alex@buyer\.test, \d{4}-\d{2}-\d{2}\. Confidential, Kalling data room$/);
  await shot(site,'viewer-1440',false);await site.keyboard.press('ArrowRight');await site.waitForTimeout(1300);assert.match(await site.locator('.ks-viewer-page').innerText(),/Page 2 of/);
  await site.keyboard.press('Escape');await site.waitForSelector('.ks-viewer',{state:'detached'});
  await site.goto(U+'#/account');await site.waitForSelector('text=Documents you’ve opened');step(14,'buyer opened the memorandum with a watermark; tax returns locked until LOI');

  // 15. The owner sees an anonymous label; a restricted buyer is refused and the refusal is logged.
  await owner.reload();await owner.waitForSelector('#portal-opened');const opened=await owner.locator('#portal-opened').innerText();
  assert.match(opened,/Buyer 1, owner-operator opened it once/);assert.doesNotMatch(opened,/Alex/);await shot(owner,'opened-owner-1440');
  await site.goto(listingUrl);await site.waitForSelector('.ks-dr');
  const buyers=await ctx.newPage();watch(buyers,'buyers');await buyers.goto(U+'#advisor/buyers');await buyers.getByRole('tab',{name:/^All buyers/}).click();
  await buyers.getByLabel('Status for Alex Morgan').selectOption('Restricted');await buyers.waitForTimeout(600);await buyers.close();
  await site.locator('.ks-dr-folder li').filter({hasText:'Confidential memorandum'}).getByRole('button',{name:'Open'}).click();
  await site.waitForSelector('.ks-dr .ks-error');assert.match(await site.locator('.ks-dr .ks-error').innerText(),/do not have access/);
  await adv.reload();await adv.waitForSelector('.deal-head h1');await tab('Data room');await adv.waitForSelector('.dr-table');
  const dr=await adv.locator('.dr').innerText();assert.match(dr,/Alex Morgan/);assert.match(dr,/Alex Morgan was refused 1 time/);await shot(adv,'dataroom-engaged-1440');
  step(15,'owner saw “Buyer 1, owner-operator”; restricted buyer lost access');

  // No horizontal page scroll at tablet and phone widths on the three sides of the data room.
  await site.goto(listingUrl);await site.waitForTimeout(500);
  for(const w of [1024,390])for(const [pg,tag] of [[adv,'advisor'],[owner,'owner'],[site,'buyer']]){await pg.setViewportSize({width:w,height:900});await pg.waitForTimeout(250);
    const over=await pg.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert.ok(over<=1,`${tag} overflows by ${over}px at ${w}`);}
  for(const pg of [adv,owner,site])await pg.setViewportSize({width:1440,height:900});
  if(OUT){for(const [pg,name] of [[adv,'dataroom-advisor'],[owner,'dataroom-owner-portal']]){await pg.setViewportSize({width:390,height:844});await pg.waitForTimeout(300);await shot(pg,name+'-390');await pg.setViewportSize({width:1440,height:900});}}
  console.log('errors:',errs.join(' | ')||'none');
  }finally{await b.close();for(const p of procs)p.kill();}
  if(errs.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
