// Fictional decisions are saved while Sellers is open. Leaving or refreshing clears the demo.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const U=process.env.BASE||'http://127.0.0.1:4173/',OUT=process.argv[2];
const base=new URL(U);
assert.ok(['127.0.0.1','localhost'].includes(base.hostname),'sourcing fixtures require a loopback server');

async function saved(page){
  await page.locator('.src .src-ok[role=status]').filter({hasText:/^Saved\./}).waitFor();
}

async function noOverflow(page,width){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no sideways scroll at '+width);
}

(async()=>{const b=await chromium.launch();const errs=[];
  for(const width of [1440,390]){
    const ctx=await b.newContext({viewport:{width,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
    await ctx.addInitScript(()=>localStorage.setItem('kalling-cloud-disconnected-v1','true'));
    await ctx.route('**/*',route=>new URL(route.request().url()).origin===base.origin?route.continue():route.abort());
    await p.goto(U+'#advisor/sellers');await p.waitForSelector('.src');
    await p.getByRole('button',{name:'Load fictional sample'}).click();await p.waitForSelector('.src-list li');
    assert.equal(await p.locator('.src input[type=file]').count(),0,'no real-data import in this cut');
    assert.match(await p.innerText('.src-bar p'),/32 owners to consider from Fictional sample list, 7 to contact first/);
    const first=p.locator('.src-list > li').first();const name=(await first.locator('strong').innerText()).trim();
    assert.match(await first.innerText(),/Contact first/);assert.match(await first.locator('.src-why').innerText(),/^Licensed since \d{4} \(\d+ years\)/);
    await noOverflow(p,width);
    await p.getByLabel('Your phone or email, for letters',{exact:true}).fill('advisor@kalling.test');
    await first.getByRole('button',{name:'Draft letter'}).click();
    const draft=await first.locator('textarea').inputValue();
    assert.ok(draft.startsWith('Dear '+name));assert.match(draft,/advisor@kalling\.test/);assert.doesNotMatch(draft,/--/);
    const letter=draft.replace('Sincerely,','Please mention the fictional sample when you reply.\n\nSincerely,');
    await first.locator('textarea').fill(letter);
    await noOverflow(p,width);
    await first.getByRole('button',{name:'Save draft',exact:true}).click();
    await first.getByText('Letter drafted',{exact:true}).waitFor();
    await saved(p);
    await first.getByRole('button',{name:'Edit letter',exact:true}).click();
    assert.equal(await first.locator('textarea').inputValue(),letter,'the exact saved draft reopens');
    // Replacing the opt-out sentence, even with one that mentions opting out, blocks approval.
    await first.locator('textarea').fill(letter.replace("If you'd rather not hear from us, tell me and I won't write again.",'There is no way to opt out of these letters.'));
    await first.getByRole('button',{name:/^Approve as /}).click();
    await p.locator('.src [role=alert]').filter({hasText:/opt-out sentence word for word/}).waitFor();
    assert.equal(await p.locator('.src-ok').count(),0,'a refused decision does not show Saved');
    await first.locator('textarea').fill(letter);await first.getByRole('button',{name:/^Approve as /}).click();
    await first.getByText('Letter approved',{exact:true}).waitFor();
    await saved(p);assert.match(await p.innerText('.src-ok'),/approved by/);
    await first.getByRole('button',{name:'Mark mailed'}).click();
    await first.getByText('Mailed',{exact:true}).waitFor();
    await saved(p);
    assert.equal(await first.getByRole('button',{name:/Draft letter|Edit letter/}).count(),0,'a mailed letter cannot be reopened');
    const second=p.locator('.src-list > li').nth(1),gone=(await second.locator('strong').innerText()).trim();
    await second.getByRole('button',{name:'Do not contact'}).click();
    await p.locator('.src-list strong').filter({hasText:gone}).waitFor({state:'detached'});
    await saved(p);
    assert.match(await p.innerText('.src-ok'),/until you leave this page/,'the opt-out note promises only this session');
    assert.doesNotMatch(await p.innerText('.src-ok'),/will not appear again/);
    assert.ok(!(await p.locator('.src-list strong').allInnerTexts()).includes(gone));
    await p.getByRole('button',{name:'Reload fictional sample',exact:true}).click();
    await p.locator('.src-ok').filter({hasText:/Loaded 36 fictional licensees/}).waitFor();
    assert.ok(!(await p.locator('.src-list strong').allInnerTexts()).includes(gone),'reloading the sample on the same page keeps opt-outs');
    assert.match(await p.innerText('.src-bar p'),/1 mailed, 0 replied, 1 not to contact/);
    await noOverflow(p,width);
    if(OUT)await p.screenshot({path:`${OUT}/sourcing-${width}.png`});

    // Nothing about prospects, letters or the advisor's contact details is kept in browser storage.
    const stored=await p.evaluate(()=>JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage}));
    assert.doesNotMatch(stored,/Dear |advisor@kalling\.test|19HC|sourcing/,'no sourcing data in storage');
    await p.reload();await p.getByRole('heading',{name:'No list loaded',exact:true}).waitFor();
    await p.getByRole('button',{name:'Load fictional sample',exact:true}).click();
    await p.locator('.src-list li').first().waitFor();
    assert.match(await p.innerText('.src-bar p'),/0 mailed, 0 replied, 0 not to contact/,'a full reload starts over');
    assert.ok((await p.locator('.src-list strong').allInnerTexts()).includes(gone));

    const restored=p.locator('.src-list > li').filter({hasText:gone});
    await restored.getByRole('button',{name:'Do not contact',exact:true}).click();
    await restored.waitFor({state:'detached'});
    const nav=p.getByRole('navigation',{name:'Workspace',exact:true});
    if(width===390)await p.getByRole('button',{name:'Open navigation',exact:true}).click();
    await nav.getByRole('button',{name:'Today',exact:true}).click();
    await p.locator('.src').waitFor({state:'detached'});
    if(width===390)await p.getByRole('button',{name:'Open navigation',exact:true}).click();
    await nav.getByRole('button',{name:'Sellers',exact:true}).click();
    await p.getByRole('heading',{name:'No list loaded',exact:true}).waitFor();
    await p.getByRole('button',{name:'Load fictional sample',exact:true}).click();
    await restored.waitFor();
    assert.match(await p.innerText('.src-bar p'),/0 not to contact/,'leaving Sellers resets demo decisions');
    await ctx.close();
  }
  assert.deepEqual(errs,[]);console.log('sourcing: passed at 1440px and 390px');await b.close();})().catch(e=>{console.error(e);process.exit(1);});
