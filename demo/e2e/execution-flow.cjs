// CI counterpart to the development-only fictional test bench. No hosted data or model calls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const U=process.env.BASE||'http://127.0.0.1:4173/';
const OUT=process.argv[2]||'';
if(!['127.0.0.1','localhost'].includes(new URL(U).hostname))throw Error('Execution fixtures require a loopback server.');
(async()=>{
  if(OUT)fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1512,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(U+'e2e/phase5.html');
    await page.getByRole('button',{name:'Run fictional acquisition',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('PASS: twelve'),null,{timeout:30000});
    assert.match(await page.locator('#result').innerText(),/Stopped branch: no Sold transition/);
    console.log('PASS: twelve fictional acquisition stages.');
    const frame=page.frameLocator('#app');
    const headings={advisor:'Fictional HVAC',owner:'Fictional HVAC',buyer:'Welcome back, Fictional',public:'Fictional HVAC execution example',guest:'Transaction specialist'};
    for(const surface of Object.keys(headings)){
      await page.locator('#surface').selectOption(surface);
      await frame.getByRole('heading',{name:headings[surface],exact:true,level:1}).waitFor();
      if(['advisor','owner','buyer'].includes(surface))await frame.getByRole('heading',{name:surface==='owner'?'Your completed sale':'Your completed acquisition',exact:true}).waitFor();
      if(surface==='owner'){
        // The owner's closed sale reads in plain words: no deal jargon, no cents on whole amounts, no business questions after the sale.
        // Quotes from documents stay word for word, so they are left out of the wording check.
        const text=await frame.locator('.ex-workspace').evaluate(el=>{const c=el.cloneNode(true);c.querySelectorAll('q,blockquote,.ex-sources').forEach(n=>n.remove());return c.innerText||c.textContent;});
        for(const w of ['Fixed consideration','Cash consideration at close','Maximum contingent consideration','Accountable coordinator','Execution documents','Transaction attempt'])assert.ok(!text.includes(w),'owner sees '+w);
        assert.equal(await frame.locator('#portal-about').count(),0,'no business questions after the sale has closed');
        assert.doesNotMatch(text,/\$[\d,]+\.00\b/,'whole amounts show without cents');assert.doesNotMatch(text,/\d{4}-\d{2}-\d{2} New York/,'deadlines read as dates');
        for(const w of ['Price, not counting any earnout','Cash at closing','Earnout, the most it can pay','Sale documents','Questions and requests'])assert.ok(text.includes(w),'owner should see '+w);
        assert.equal(await frame.getByRole('button',{name:'Letter of intent'}).count(),1,'the LOI tab is spelled out for the owner');
      }
      for(const width of ['1440','1024','390']){
        await page.locator('#width').selectOption(width);
        await page.getByRole('button',{name:'Assert layout and privacy',exact:true}).click();
        assert.match(await page.locator('#result').innerText(),new RegExp('^PASS: '+surface+' at '+width+'px;'));
        if(OUT&&['advisor','owner','buyer'].includes(surface))await page.screenshot({path:OUT+'/'+surface+'-'+width+'.jpg'});
        console.log('PASS: '+surface+' at '+width+'px.');
      }
    }
    // In-app proposal review: evidence shown in the source, and a recorded judgment that persists.
    await page.locator('#surface').selectOption('advisor');
    await page.locator('#width').selectOption('1440');
    await frame.getByText('Proposal for reviewer judgment').waitFor();
    await frame.locator('.ex-evidence summary').first().click();
    await frame.locator('.ex-evidence-text mark').first().waitFor();
    assert.equal(await frame.locator('.ex-evidence-text mark').first().innerText(),'Approved SDE: USD 500,000. Revenue: USD 3,000,000.');
    await frame.getByText('No judgment is recorded for this proposal yet').waitFor();
    await frame.getByRole('button',{name:'Record reviewed judgment'}).click();
    await frame.locator('.ex-judgment-standing').waitFor();
    assert.match(await frame.locator('.ex-judgment-standing').innerText(),/^Reviewed by /);
    // Switch views one at a time: on a slow runner a second switch can be overtaken by the first view finishing its load.
    await page.locator('#surface').selectOption('owner');
    await frame.getByText('Proposal for reviewer judgment').waitFor({state:'detached'}); // the owner view has replaced the advisor view
    await page.locator('#surface').selectOption('advisor');
    await frame.getByText('Proposal for reviewer judgment').waitFor();
    await frame.locator('.ex-judgment-standing').waitFor();
    assert.match(await frame.locator('.ex-judgment-standing').innerText(),/^Reviewed by /,'the judgment survives a reload');
    console.log('PASS: in-app proposal judgment recorded against the marked source and kept.');
    assert.deepEqual(errors,[],'Unexpected browser page errors');
    await page.getByRole('button',{name:'Restore previous demo',exact:true}).click();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
