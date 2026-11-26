// The advisor loads the fictional licensee list, sees owners ranked with a reason, drafts and approves
// a letter, marks it mailed, and marks another owner do-not-contact. Nothing is sent, the demo cannot
// import real data, and nothing (drafts, contact details, decisions) is stored in the browser.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const U=process.env.BASE||'http://127.0.0.1:4173/',OUT=process.argv[2];
(async()=>{const b=await chromium.launch();const errs=[];
  for(const width of [1440,390]){
    const ctx=await b.newContext({viewport:{width,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
    await p.goto(U+'#advisor/sellers');await p.waitForSelector('.src');
    assert.equal(await p.locator('.src input[type=file]').count(),0,'no real-data import in this cut');
    await p.getByRole('button',{name:'Load fictional sample'}).click();await p.waitForSelector('.src-list li');
    assert.match(await p.innerText('.src-bar p'),/32 owners to consider from Fictional sample list, 7 to contact first/);
    const first=p.locator('.src-list > li').first();const name=(await first.locator('strong').innerText()).trim();
    assert.match(await first.innerText(),/Contact first/);assert.match(await first.locator('.src-why').innerText(),/^Licensed since \d{4} \(\d+ years\)/);
    await first.getByRole('button',{name:'Draft letter'}).click();
    const letter=await first.locator('textarea').inputValue();assert.match(letter,new RegExp('^Dear '+name));assert.doesNotMatch(letter,/--/);
    await p.fill('input[placeholder="you@example.com"]','advisor@kalling.test');
    // Replacing the opt-out sentence, even with one that mentions opting out, blocks approval.
    await first.locator('textarea').fill(letter.replace("If you'd rather not hear from us, tell me and I won't write again.",'There is no way to opt out of these letters.'));
    await first.getByRole('button',{name:/^Approve as /}).click();assert.match(await p.innerText('[role=alert]'),/opt-out sentence word for word/);
    await first.locator('textarea').fill(letter);await first.getByRole('button',{name:/^Approve as /}).click();
    await p.waitForSelector('.src-ok');assert.match(await p.innerText('.src-ok'),/approved by/);
    await first.getByRole('button',{name:'Mark mailed'}).click();assert.match(await first.innerText(),/Mailed/);
    assert.equal(await first.getByRole('button',{name:/Draft letter|Edit letter/}).count(),0,'a mailed letter cannot be reopened');
    const second=p.locator('.src-list > li').nth(1),gone=(await second.locator('strong').innerText()).trim();
    await second.getByRole('button',{name:'Do not contact'}).click();
    assert.match(await p.innerText('.src-ok'),/until you leave this page/,'the opt-out note promises only this session');
    assert.doesNotMatch(await p.innerText('.src-ok'),/will not appear again/);
    assert.ok(!(await p.locator('.src-list strong').allInnerTexts()).includes(gone));
    assert.match(await p.innerText('.src-bar p'),/1 mailed, 0 replied, 1 not to contact/);
    // Nothing about prospects, letters or the advisor's contact details is kept in browser storage.
    const stored=await p.evaluate(()=>JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage}));
    assert.doesNotMatch(stored,/Dear |advisor@kalling\.test|19HC|sourcing/,'no sourcing data in storage');
    await p.reload();await p.waitForSelector('.src');assert.equal(await p.locator('.src-list li').count(),0,'reloading starts over');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no sideways scroll at '+width);
    if(OUT)await p.screenshot({path:`${OUT}/sourcing-${width}.png`});
    await ctx.close();
  }
  assert.deepEqual(errs,[]);console.log('sourcing: passed at 1440px and 390px');await b.close();})().catch(e=>{console.error(e);process.exit(1);});
