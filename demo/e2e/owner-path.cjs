// The owner's path on a phone, from the free valuation to the portal, held to the polish bar:
// no sideways scroll, plain words, nothing empty or stale on screen, and buttons big enough to tap.
// Run the app on port 4173, then `node e2e/owner-path.cjs [screenshot-dir]`.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const H=require('./helpers.cjs');
const U=process.env.BASE||'http://127.0.0.1:4173/',OUT=process.argv[2]||'',PHONE={width:390,height:844};
const step=(n,t)=>console.log(`${n}. ${t}`);

// Words an owner should never meet, and screens that should never show.
const banned=[[/--/,'a double hyphen'],[/\bNDA\b/,'the abbreviation NDA'],[/\bKL-\d/,'an internal listing number'],[/this browser\)/,'a browser label'],
  [/Not reviewed/,'an unexplained review status'],[/will add next steps here/,'an empty next steps section'],[/No buyers are listed yet/,'an empty buyers section'],
  [/Drag files/,'a mouse-only instruction'],[/Press Enter/,'a keyboard-only instruction'],[/pre-checked/,'an unverified financing claim'],[/nothing yet/,'a vague file label']];

async function phoneCheck(page,where,{shot}={}){
  const text=await page.locator('body').innerText();
  for(const [re,what] of banned)assert.doesNotMatch(text,re,`${where}: shows ${what}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${where}: scrolls sideways at 390px`);
  // Every visible button and expander in the owner's portal is at least 40px tall: thumbs, not mouse pointers.
  const small=await page.evaluate(()=>[...document.querySelectorAll('.portal-shell button, .portal-shell .btn, .portal-shell summary, .portal-mobilebar a')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&!el.closest('details:not([open]) > :not(summary)')&&r.height<40;}).map(el=>(el.textContent||el.getAttribute('aria-label')||el.className).trim().slice(0,40)));
  assert.deepEqual(small,[],`${where}: buttons smaller than 40px`);
  if(OUT&&shot)await page.screenshot({path:`${OUT}/${shot}.png`,fullPage:true});
}

(async()=>{
  if(OUT)fs.mkdirSync(OUT,{recursive:true});
  const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:1440,height:900}}),errs=[];
  const watch=(p,tag)=>p.on('pageerror',e=>errs.push(tag+': '+e.message));
  try{
    // 1. The free valuation, on a phone.
    const site=await ctx.newPage();watch(site,'site');await site.setViewportSize(PHONE);
    await site.context().addInitScript(()=>{localStorage.setItem('kalling-marketplace-demo-v1','true');localStorage.setItem('kalling-cloud-disconnected-v1','true');});
    await site.goto(U+'#/value');await site.waitForSelector('.ks-page-head');
    assert.match(await site.locator('.ks-page-head').innerText(),/typical company, to start you off\. Replace them with yours/);
    assert.equal(await site.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'valuation scrolls sideways');
    if(OUT)await site.screenshot({path:OUT+'/1-valuation-390.png',fullPage:true});
    await H.submitLead(site,U);assert.match(await site.locator('body').innerText(),/An advisor will call or email within one business day/);step(1,'free valuation on a phone, with what happens next');

    // 2. The advisor qualifies the lead and readies the letter (desktop).
    const adv=await ctx.newPage();watch(adv,'advisor');await adv.goto(U+'#advisor/today');await adv.waitForSelector('text=Needs you');
    await H.qualifyLead(adv);const link=await H.prepareLetter(adv);

    // 3. The owner signs on a phone; the home then says what happens next, not that the letter is being prepared.
    const owner=await ctx.newPage();watch(owner,'owner');await owner.setViewportSize(PHONE);
    await H.ownerSigns(owner,link);
    const home=owner.locator('.oh');assert.match(await home.innerText(),/You signed your engagement letter[\s\S]*Karan will countersign it next/);
    assert.doesNotMatch(await home.innerText(),/is preparing your engagement letter/);
    assert.equal(await owner.locator('.portal-welcome').count(),0,'the welcome that says "start by signing" is gone once signed');
    assert.equal(await owner.locator('.portal-mobilebar button').count(),0,'no Upload button before requests open');
    assert.equal(await owner.locator('.portal-help').isVisible(),false,'one way to reach the advisor on a phone, not three');
    await phoneCheck(owner,'signed, waiting for countersignature',{shot:'2-signed-390'});step(2,'owner signed on a phone; next step says Karan countersigns next');

    // 4. Countersigned: requests open. Only sections with something in them show.
    await H.countersign(adv);await owner.reload();await owner.waitForSelector('.portal-request');
    assert.match(await home.innerText(),/Your next step[\s\S]*Send your profit and loss statements/);
    assert.equal(await owner.locator('#portal-buyers').count(),0,'no empty buyers section');
    const open=owner.locator('.portal-request.open').first();
    assert.equal(await open.getByRole('button',{name:'Choose files'}).isVisible(),true,'a real button to choose files on a phone');
    assert.match(await owner.locator('#portal-messages .portal-contact').innerText(),/Or reach Karan directly: team@local\.demo/);
    const up=owner.locator('.portal-mobilebar button',{hasText:'Upload'});assert.equal(await up.isVisible(),true);
    await up.click();await owner.waitForTimeout(300);
    const target=owner.locator('.portal-request.open');assert.equal(await target.count(),1);
    assert.equal(await target.getByRole('button',{name:'Choose files'}).isVisible(),true,'Upload opens a request that still takes files');
    for(const s of ['.portal-pros details.pro-add'])for(const d of await owner.locator(s).all())assert.equal(await d.getAttribute('open'),null,'staff and CPA forms start folded');
    await phoneCheck(owner,'requests open',{shot:'3-requests-390'});step(3,'requests open; empty sections hidden; forms folded; choose-files button');

    // 5. The sample portal, mid-sale, on a phone: buyers in plain words.
    const sample=await ctx.newPage();watch(sample,'sample');await sample.setViewportSize(PHONE);await sample.goto(U+'#sample');await sample.waitForSelector('.portal-buyers');
    const buyers=await sample.locator('#portal-buyers').innerText();
    assert.match(buyers,/Signed confidentiality agreement/);assert.match(buyers,/Reviewing your information/);assert.match(buyers,/Financing not checked yet/);
    await phoneCheck(sample,'sample portal',{shot:'4-sample-390'});step(4,'sample portal mid-sale: buyer stages and checks in plain words');
  }finally{assert.deepEqual(errs,[]);await b.close();}
  console.log('owner path: passed on a phone');
})().catch(e=>{console.error(e);process.exit(1);});
