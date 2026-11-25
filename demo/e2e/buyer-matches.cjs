// A buyer saves a profile and sees the live listings that fit it, each with a one-line reason.
const {chromium,devices}=require('playwright');const assert=require('node:assert/strict');
const U=process.env.BASE||'http://127.0.0.1:4173/';
(async()=>{const b=await chromium.launch();const p=await b.newPage({...devices['iPhone 13']});await p.addInitScript(()=>localStorage.setItem('kalling-marketplace-demo-v1','true'));const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(U+'#/account');await p.fill('input[name=email]','maria@buyer.test');await p.getByRole('button',{name:'Continue'}).click();
  await p.fill('input[name=name]','Maria Lopez');await p.selectOption('select[name=type]','Owner-operator');await p.selectOption('select[name=funds]','$250K to $500K');await p.fill('input[name=maxPrice]','2,500,000');
  await p.check('input[value="SBA 7(a) loan"]');await p.check('input[value="Central Jersey"]');await p.check('input[value="Jersey Shore"]');
  await p.fill('textarea[name=experience]','Twelve years as an HVAC service manager in Middlesex County, EPA 608 certified.');
  await p.getByRole('button',{name:'Save profile'}).click();await p.waitForTimeout(800);
  await p.goto(U+'#/account');await p.waitForSelector('.ks-matches');
  const items=await p.locator('.ks-match-why').allInnerTexts();
  assert.equal(items[0],'Strong fit. In your Jersey Shore region, it is sized for an owner who runs it and it uses your HVAC background.');
  assert.ok(!(await p.innerText('.ks-matches')).includes('KL-1047'),'over the buyer’s limit is left out');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errs,[]);console.log('buyer matches: passed');await b.close();})().catch(e=>{console.error(e);process.exit(1);});
