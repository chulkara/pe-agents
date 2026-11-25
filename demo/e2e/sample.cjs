// One-tap sample: #sample opens Pat Russo's fictional portal on a phone, saves nothing, and Start over resets it.
const {chromium,devices}=require('playwright');const assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://127.0.0.1:4173/',OUT=process.argv[2];
(async()=>{const b=await chromium.launch();const p=await b.newPage({...devices['iPhone 13']});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'#sample');await p.waitForSelector('#portal-sale-ready');
  assert.equal(await p.evaluate(()=>scrollY),0,'opens at the top');
  assert.match(await p.innerText('#portal-sale-ready'),/master HVACR license is only in your name/);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390,'no sideways scroll');
  const msgs=p.locator('#portal-messages');await msgs.locator('textarea').fill('Is the license really the biggest thing?');await msgs.getByRole('button',{name:'Send',exact:true}).click();
  await p.getByText('Is the license really the biggest thing?').waitFor();
  assert.deepEqual(await p.evaluate(()=>Object.keys(localStorage)),[],'nothing saved in the browser');
  if(OUT)await p.screenshot({path:OUT+'/sample.png'});
  await p.getByRole('button',{name:'Start over'}).click();await p.waitForSelector('#portal-sale-ready');
  assert.equal(await p.getByText('Is the license really the biggest thing?').count(),0,'Start over resets');
  assert.deepEqual(errs,[]);console.log('sample: passed');await b.close();})().catch(e=>{console.error(e);process.exit(1);});
