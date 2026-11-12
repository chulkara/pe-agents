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

  if(OUT){await tab('Materials');await shot(adv,'materials-1440');}
  console.log('errors:',errs.join(' | ')||'none');
  }finally{await b.close();for(const p of procs)p.kill();}
  if(errs.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
