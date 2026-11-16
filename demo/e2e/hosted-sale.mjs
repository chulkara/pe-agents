// Complete hosted sale rehearsal: one fictional HVAC sale from inquiry to handover,
// driven through the app's own screens against hosted Supabase Auth and Storage, with
// separate advisor, seller and buyer browser sessions at phone, tablet and desktop widths.
//
//   1. Run production/fixtures/prepare-sale-rehearsal.sql in the Supabase SQL editor.
//   2. From demo/:  npm ci && npm run build
//   3. Keep Ollama and the research computer running:
//      node --experimental-strip-types scripts/kalling-worker.mjs install
//   4. node e2e/hosted-sale.mjs run --confirm-fictional --prompt \
//        --output "$HOME/Downloads/kalling-sale-rehearsal.json" \
//        --shots "$HOME/Downloads/kalling-sale-rehearsal-shots"
//
// Three passwords are read with hidden prompts (owner_a as the advisor, seller, buyer);
// --accounts <file> outside the repository works like the other hosted runners. Nothing
// is emailed, no model other than the local research computer is called, and every step
// that cannot be driven automatically turns into a guided prompt that waits for you.
import {spawn,execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {readHiddenPassword} from '../scripts/hosted-validation.mjs';
import {deployedCloudProject} from '../lib/cloudProject.ts';

const here=path.dirname(fileURLToPath(import.meta.url)),demo=path.join(here,'..');
const args=process.argv.slice(2);
const flag=n=>args.includes(n);
const opt=(n,d='')=>{const i=args.indexOf(n);return i>=0&&args[i+1]?args[i+1]:d;};
const ROLES=['owner_a','seller','buyer'];
const EMAILS={owner_a:'owner-a-20261114@kalling-validation.invalid',seller:'seller-20261114@kalling-validation.invalid',buyer:'buyer-20261114@kalling-validation.invalid'};
const WIDTHS=[390,1024,1440];
const report={mode:'hosted-sale-rehearsal',project:deployedCloudProject.url,startedAt:new Date().toISOString(),runtime:'',steps:[],guided:[],screenshots:[],result:'incomplete'};
const out=opt('--output',path.join(os.homedir(),'Downloads','kalling-sale-rehearsal.json'));
const shots=opt('--shots','');
const FROM=opt('--from','');
let started=!FROM;
const log=m=>console.log(m);
const save=()=>{report.savedAt=new Date().toISOString();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,1));};

function fail(msg){throw Error(msg);}
async function until(fn,ms=30000,every=500){const end=Date.now()+ms;for(;;){const v=await fn().catch(()=>false);if(v)return v;if(Date.now()>end)throw Error('Timed out waiting: '+ms+'ms');await new Promise(r=>setTimeout(r,every));}}

// A guided step: the runner says exactly what to do in the visible browser window and
// watches the page until `done` reports the result. Human judgment stays human.
async function guided(page,what,done,ms=15*60000){
  log('\n  HAND: '+what+'\n  The browser window is open; the runner continues as soon as it sees the result.');
  report.guided.push({what,at:new Date().toISOString()});
  return until(done,ms,1000);
}

async function shoot(page,name){if(!shots)return;fs.mkdirSync(shots,{recursive:true});const p=path.join(shots,name+'.png');await page.screenshot({path:p,fullPage:name.includes('-full')});report.screenshots.push(name+'.png');}
async function noOverflow(page,tag){const over=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);if(over>1)fail(tag+' overflows sideways by '+over+'px');}
async function sweep(page,name,extra=async()=>{}){
  const old=page.viewportSize();
  for(const w of WIDTHS){await page.setViewportSize({width:w,height:w<768?844:900});await page.waitForTimeout(350);await noOverflow(page,name+' at '+w);await shoot(page,`${name}-${w}`);await extra(w);}
  await page.setViewportSize(old);await page.waitForTimeout(250);
}

async function collectAccounts(){
  const prompting=flag('--prompt'),file=opt('--accounts');
  if(!flag('--confirm-fictional')||prompting===!!file)fail('Run needs --confirm-fictional and exactly one of --prompt or --accounts <file outside the repository>.');
  if(file){
    const abs=path.resolve(file);if(abs.startsWith(path.resolve(demo,'..')))fail('Keep the accounts file outside the repository.');
    const raw=JSON.parse(fs.readFileSync(abs,'utf8'));
    return Object.fromEntries(ROLES.map(r=>{const a=raw[r];if(!a?.password||a.email!==EMAILS[r])fail('Accounts file must hold '+r+' with email '+EMAILS[r]);return [r,a.password];}));
  }
  log('Enter the three fictional account passwords. Input stays hidden and is never saved.');
  const o={};for(const r of ROLES)o[r]=await readHiddenPassword(r+' ('+EMAILS[r]+'): ');
  return o;
}

async function startPreview(){
  if(!fs.existsSync(path.join(demo,'dist','index.html')))fail('Build first: npm run build');
  const p=spawn('npx',['vite','preview','--port','4186','--host','127.0.0.1'],{cwd:demo,stdio:['ignore','pipe','pipe']});
  await new Promise((res,rej)=>{const t=setTimeout(()=>rej(Error('vite preview did not start')),20000);p.stdout.on('data',d=>{if(String(d).includes('4186')){clearTimeout(t);res();}});p.on('exit',c=>rej(Error('preview exited '+c)));});
  return p;
}

const step=async(name,fn)=>{
  if(!started){if(name===FROM)started=true;else{log('skip  '+name);return;}}
  log('\n== '+name);const t=Date.now();
  try{await fn();report.steps.push({name,ok:true,ms:Date.now()-t});}
  catch(e){report.steps.push({name,ok:false,ms:Date.now()-t,error:String(e.message||e)});save();throw e;}
  save();
};

(async()=>{
  report.runtime=execSync('git rev-parse HEAD',{cwd:demo}).toString().trim();
  const passwords=await collectAccounts();
  const health=await fetch(deployedCloudProject.url+'/auth/v1/health',{headers:{apikey:deployedCloudProject.publishableKey}}).catch(e=>fail('Hosted Auth is not reachable from this machine ('+(e.cause?.message||e.message)+'). Run this on a computer with ordinary internet access.'));
  if(!health.ok)fail('Hosted Auth answered '+health.status+'. Check the project status before rehearsing.');

  // A direct client for read-only corroboration (quotes against stored page text).
  const {createClient}=await import('@supabase/supabase-js');
  const sb=createClient(deployedCloudProject.url,deployedCloudProject.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const preview=await startPreview();
  const U='http://127.0.0.1:4186/';
  const {chromium}=await import('playwright');
  // Headed by default: the guided steps hand the visible windows to you.
  const browser=await chromium.launch({headless:flag('--headless')});
  const errs=[];
  const mk=async(w,h)=>{const c=await browser.newContext({viewport:{width:w,height:h}});return c;};
  // Separate sessions: each context keeps its own cookies and storage, so the advisor,
  // seller and buyer are signed in at the same time with their own tokens.
  const advCtx=await mk(1440,900),selCtx=await mk(390,844),buyCtx=await mk(390,844),pubCtx=await mk(390,844);
  const adv=await advCtx.newPage(),sel=await selCtx.newPage(),buy=await buyCtx.newPage(),pub=await pubCtx.newPage();
  for(const [p,tag] of [[adv,'advisor'],[sel,'seller'],[buy,'buyer'],[pub,'public']])p.on('pageerror',e=>errs.push(tag+': '+e.message));

  const signIn=async(page,role,hash)=>{
    await page.goto(U+hash);await page.waitForTimeout(800);
    if(await page.locator('input[name=password]').count()===0)return; // already signed in
    await page.fill('input[name=email]',EMAILS[role]);await page.fill('input[name=password]',passwords[role]);
    await page.locator('form:has(input[name=password]) button[type=submit], form:has(input[name=password]) button:not([type=button])').first().click();
    await until(async()=>!(await page.locator('input[name=password]').count()),30000);
  };
  const tab=async name=>{await adv.getByRole('tab',{name:new RegExp('^'+name)}).click();await adv.waitForTimeout(400);};
  let portalLink='';

  try{

  if(FROM){
    // Resuming mid-run: every role signs back in first, and the advisor reopens the deal.
    await signIn(adv,'owner_a','#advisor');
    const open=adv.getByRole('button',{name:/Open workspace|Open this firm|Open/}).first();if(await open.count())await open.click().catch(()=>{});
    await until(async()=>(await adv.getByRole('button',{name:'Sellers',exact:true}).count())>0,30000);
    await adv.getByRole('button',{name:'Sellers',exact:true}).click();await adv.waitForTimeout(500);
    const deal=adv.getByRole('button',{name:'Open Deal Room'}).first();if(await deal.count())await deal.click().catch(()=>{});
    await signIn(sel,'seller','#owner');
    await signIn(buy,'buyer','#/account');
  }

  await step('public site is honest while intake is paused',async()=>{
    await pub.goto(U);await pub.waitForSelector('text=Sell your HVAC company');await noOverflow(pub,'home at 390');await shoot(pub,'public-home-390');
    // Anonymous visitors can open a listing page: the regression that broke every
    // public detail page for signed-out users stays fixed.
    await pub.goto(U+'#/listings');await pub.waitForSelector('.ks-plate');
    await pub.locator('.ks-plate').first().click();await pub.waitForSelector('.ks-listing-head h1',{timeout:15000});
    if((await pub.getByText('permission denied').count())>0)fail('A public listing page showed a raw database error.');
    await shoot(pub,'public-listing-390');
    if((await pub.getByText('Sample HVAC closing-file validation').count())>0)fail('A sold validation fixture is still on the public marketplace.');
    // The paused seller form refuses politely; the fixture lead stands in for it.
    await pub.goto(U+'#/value');await pub.waitForTimeout(400);
    await pub.fill('input[name=name]','Pat Russo (fictional)');await pub.fill('input[name=email]',EMAILS.seller);
    await pub.fill('input[name=businessName]','Sample: Russo Heating & Air (fictional)');await pub.selectOption('select[name=region]','Central Jersey');await pub.check('input[name=consent]');
    await pub.getByRole('button',{name:'Request a confidential review'}).click();
    await pub.waitForSelector('text=Seller inquiries are not open yet');await shoot(pub,'public-intake-paused-390');
  });

  await step('advisor signs in and the research computer is connected',async()=>{
    await signIn(adv,'owner_a','#advisor');
    await until(async()=>(await adv.getByText(/Fictional hosted validation A/).count())>0,30000);
    const open=adv.getByRole('button',{name:/Open workspace|Open this firm|Open/}).first();
    if(await open.count())await open.click();
    await until(async()=>(await adv.getByRole('button',{name:'Sellers',exact:true}).count())>0,30000);
    await shoot(adv,'advisor-home-1440');
  });

  await step('advisor qualifies the fictional inquiry',async()=>{
    await adv.getByRole('button',{name:'Sellers',exact:true}).click();
    await until(async()=>(await adv.getByText('Pat Russo (fictional)').count())>0,20000);
    await adv.getByRole('button',{name:'Qualify',exact:true}).first().click();
    const panel=adv.locator('.eng-qualify');
    for(const l of ['Revenue and earnings in range','Speaking with the decision maker','Books kept by an accountant or bookkeeper','Three years of tax returns available'])await panel.getByLabel(l).check();
    await panel.getByLabel('Why they want to sell').fill('Retiring after thirty years (fictional rehearsal)');
    await panel.getByLabel('When').fill('Within a year');
    await panel.getByLabel('Who holds the master HVACR license').selectOption('Owner only');
    await panel.getByRole('button',{name:'Qualified',exact:true}).click();
    await adv.waitForSelector('.deal-head h1');
    await sweep(adv,'advisor-deal-owner');
  });

  await step('engagement letter: blocked empty, then ready, both signatures',async()=>{
    await adv.waitForSelector('.eng-letter');const L=adv.locator('.eng-letter');
    if(!await L.getByRole('button',{name:'Ready for owner'}).isDisabled())fail('Empty fees must block the letter.');
    await L.getByLabel('Firm address').fill('1 Main Street, Green Brook, NJ 08812');
    await L.getByLabel('Success fee, %').fill('8');await L.getByLabel('Minimum success fee, $').fill('60000');
    await L.getByLabel('Fee is calculated on').selectOption({index:1});await L.getByLabel(/^Retainer/).first().selectOption('none');
    await L.getByLabel('Exclusivity, months').fill('9');await L.getByLabel('Tail period, months').fill('12');await L.getByLabel('Termination notice, days').fill('30');
    await L.getByLabel('Expenses').fill('Kalling pays its own expenses.');
    await adv.waitForSelector('text=The letter is complete.');
    await L.getByRole('button',{name:'Ready for owner'}).click();
    await adv.waitForSelector('text=Send this link to the owner yourself');
    portalLink=await adv.inputValue('.eng-link input');
    if(!portalLink.includes('#owner'))fail('No owner link produced.');
    portalLink=U+portalLink.slice(portalLink.indexOf('#'));
    // The seller signs in with their own hosted account and sees only the letter.
    await sel.goto(portalLink);await sel.waitForTimeout(700);
    if(await sel.locator('input[name=password]').count()){await sel.fill('input[name=email]',EMAILS.seller);await sel.fill('input[name=password]',passwords.seller);await sel.locator('form:has(input[name=password]) button').first().click();}
    await sel.waitForSelector('#portal-letter',{timeout:30000});
    if(await sel.locator('.portal-request').count())fail('Requests must stay hidden before signing.');
    await sweep(sel,'seller-letter');
    await sel.getByLabel(/I agree to sign/).check();await sel.getByLabel(/Type your full name/).fill('Pat Russo (fictional)');
    await sel.getByRole('button',{name:'Sign the letter'}).click();await sel.waitForSelector('text=will countersign');
    await adv.reload();await adv.waitForSelector('.eng-sign');
    await adv.locator('.eng-sign').getByLabel('I agree to sign electronically').check();
    await adv.locator('.eng-sign').getByLabel(/to countersign/).fill('Dana Advisor (fictional)');
    await adv.locator('.eng-sign').getByRole('button',{name:'Countersign'}).click();
    await adv.waitForSelector('text=Countersigned. The owner');
    await sel.reload();await sel.waitForSelector('.portal-request');
  });

  await step('seller uploads fictional documents',async()=>{
    const FX=path.join(here,'fixtures');
    const up=async(title,files)=>{const r=sel.locator('.portal-request').filter({hasText:title}).first();
      if(!(await r.getAttribute('class')).includes('open'))await r.locator('.portal-request-head').click();
      await r.locator('input[type=file]').setInputFiles(files.map(f=>path.join(FX,f)));await sel.waitForTimeout(900);
      await r.getByRole('button',{name:'Send for review'}).click();await sel.waitForTimeout(500);};
    await up('Profit and loss statements',['pl-2023.pdf','pl-2024.pdf','pl-2025.pdf']);
    await up('Business tax returns',['tax-returns.pdf']);
    await up('Maintenance agreement list',['agreements.csv']);
    await up('Team overview',['team.xlsx']);
    await sel.locator('#portal-about textarea').first().fill('Pat started the business in 2007 out of his garage and added a second van in 2009. (Fictional rehearsal text.)');
    await sel.waitForSelector('text=Saved');
    await sweep(sel,'seller-requests');
  });

  await step('advisor accepts documents; text is read in the browser',async()=>{
    await adv.reload();await adv.waitForSelector('.deal-head h1');await tab('Documents');
    for(let i=0;i<4;i++){const r=adv.locator('.portal-admin-request.submitted').first();if(!await r.count())break;
      await r.getByRole('button',{name:'Accept'}).click();await adv.waitForTimeout(900);}
    await until(async()=>(await adv.locator('text=Text read').count())>=4,90000);
  });

  await step('recast draft on the research computer, reviewed and applied',async()=>{
    await tab('Valuation and recast');
    await adv.locator('.drf-panel').getByRole('button',{name:'Draft recast'}).click();
    log('  Waiting for the local model. If nothing starts, run: node --experimental-strip-types scripts/kalling-worker.mjs install');
    await adv.waitForSelector('text=Apply accepted lines',{timeout:20*60000});
    await shoot(adv,'recast-draft-1440');
    const skip=adv.getByRole('button',{name:'Accept supported, skip the rest'});
    if(await skip.count())await skip.click();
    await adv.getByRole('button',{name:'Apply accepted lines'}).click();await adv.waitForSelector('text=Recast saved.');
  });

  await step('teaser draft, anonymity findings resolved, listing published',async()=>{
    await tab('Listing');
    await adv.locator('.drf-panel').getByRole('button',{name:'Draft teaser'}).click();
    await adv.waitForSelector('text=Use the whole draft',{timeout:20*60000});
    await adv.getByRole('button',{name:'Use the whole draft'}).click();await adv.waitForTimeout(400);
    const sugg=adv.locator('#anon-check').getByRole('button',{name:'Use suggestion'});
    while(await sugg.count()){await sugg.first().click();await adv.waitForTimeout(250);}
    for(const box of await adv.locator('.anon-warn input').all())await box.fill('Checked and rounded for the rehearsal');
    const price=adv.getByRole('textbox',{name:'Asking price',exact:true});
    if(await price.count()&&!(await price.inputValue()).trim())await price.fill('1,150,000');
    const form=adv.locator('.adv-listing-form');
    await form.getByRole('button',{name:'Save draft'}).click();await adv.waitForSelector('text=Saved as a draft');
    await until(async()=>!await form.getByRole('button',{name:'Publish listing'}).isDisabled(),20000);
    await form.getByRole('button',{name:'Publish listing'}).click();
    await adv.waitForSelector('text=The deal is now Listed',{timeout:30000});
    await sweep(adv,'advisor-listing');
    log('\n  PAUSE: run production/fixtures/mark-rehearsal-listing-sample.sql in the SQL editor now,');
    log('  so the published rehearsal listing is labeled a sample like every other fictional row.');
    await until(async()=>{const {data}=await sb.from('kalling_listings').select('sample').eq('sample',false);return (data||[]).length===0;},15*60000,3000);
  });

  await step('memorandum drafted, unsourced text resolved, both approvals',async()=>{
    await tab('Materials');
    await adv.getByRole('button',{name:'Draft memorandum'}).click();
    await adv.getByRole('button',{name:'Use this draft'}).click({timeout:30*60000});
    await adv.waitForSelector('.cim-checks');
    for(let i=0;i<12&&await adv.locator('.cim-para.needs').count();i++){await adv.locator('.cim-para.needs').first().getByRole('button',{name:'Remove sentence'}).click();await adv.waitForTimeout(350);}
    await until(async()=>/Ready to release/.test(await adv.locator('.cim-checks').innerText()),30000);
    await adv.getByRole('button',{name:'Approve as advisor'}).click();
    await adv.getByRole('button',{name:'Send to owner for review'}).click();await adv.waitForSelector('text=Sent to the owner’s portal');
    await sel.reload();await sel.waitForSelector('#portal-memo');await sweep(sel,'seller-memorandum');
    await sel.getByRole('button',{name:'Approve the memorandum'}).click();await sel.waitForSelector('text=You approved version');
  });

  await step('data room approved by the owner and published',async()=>{
    await adv.reload();await adv.waitForSelector('.deal-head h1');await tab('Data room');
    await adv.getByRole('button',{name:'Add memorandum'}).click();await adv.waitForSelector('text=Memorandum added');
    for(const f of ['pl-2025.pdf','tax-returns.pdf']){
      await adv.locator('.dr-choices li').filter({hasText:f}).getByRole('button',{name:'Add'}).click();
      await adv.getByRole('button',{name:'Add to data room'}).click();await adv.waitForSelector('text=Added. Send it to the owner');}
    await adv.getByRole('button',{name:'Send to owner for approval'}).click();await adv.waitForSelector('text=Sent to the owner.');
    await sel.reload();await sel.waitForSelector('#portal-dataroom');
    await sel.getByRole('button',{name:/^Approve all/}).click();await sel.waitForSelector('text=Approved every document.');
    await adv.reload();await adv.waitForSelector('.dr-status');
    await adv.getByRole('button',{name:'Publish data room'}).click();await adv.waitForSelector('text=The data room is open to approved buyers.');
    await sweep(adv,'advisor-dataroom');
  });

  await step('buyer verifies, signs the NDA and is approved',async()=>{
    await signIn(buy,'buyer','#/account');
    await until(async()=>(await buy.locator('input[name=password]').count())===0,30000);
    // Profile: the private pilot allows this fictional buyer only.
    const saveBtn=buy.getByRole('button',{name:'Save profile'});
    if(await saveBtn.count()){
      const fill=async(n,v)=>{const el=buy.locator(`input[name=${n}]`);if(await el.count())await el.fill(v);};
      await fill('name','Alex Morgan (fictional)');await fill('maxPrice','4,000,000');
      const funds=buy.locator('select[name=funds]');if(await funds.count())await funds.selectOption({index:1});
      const exp=buy.locator('textarea[name=experience]');if(await exp.count())await exp.fill('Ten fictional years running field operations for a mechanical contractor.');
      for(const v of ['SBA 7(a) loan','Central Jersey']){const b=buy.locator(`input[value="${v}"]`);if(await b.count())await b.check();}
      await saveBtn.click();await buy.waitForTimeout(800);
    }
    // Verification evidence: a fictional proof file, then advisor review.
    const proof=buy.locator('input[type=file]');
    if(await proof.count()){
      await proof.first().setInputFiles(path.join(here,'fixtures','tax-returns.pdf'));
      await buy.waitForTimeout(1200);
      const attest=buy.locator('input[type=checkbox]');
      for(const c of await attest.all())if(!(await c.isChecked()))await c.check().catch(()=>{});
      const submit=buy.getByRole('button',{name:/Submit|Send for review/}).first();
      if(await submit.count())await submit.click();
      await buy.waitForTimeout(800);
    }else{
      await guided(buy,'On the buyer account page, add the fictional proof file (any rehearsal PDF) and submit it for review.',async()=>(await buy.getByText(/Submitted|In review/).count())>0);
    }
    await shoot(buy,'buyer-verification-390');
    // Advisor verifies, then the buyer signs the listing NDA.
    await adv.getByRole('button',{name:'Buyers',exact:true}).click();await adv.waitForTimeout(600);
    const verify=adv.getByRole('button',{name:/Verify|Mark verified|Verified/}).first();
    if(await verify.count())await verify.click().catch(()=>{});
    else await guided(adv,'Open the fictional buyer Alex Morgan and record a Verified review of the proof.',async()=>(await adv.getByText('Verified').count())>0);
    const n=await sb.from('kalling_listings').select('number,status,sample').eq('status','Live').order('created_at',{ascending:false}).limit(1);
    const number=n.data?.[0]?.number;if(!number)fail('No live rehearsal listing found.');
    await buy.goto(U+'#/listings/'+number);await buy.waitForSelector('.ks-listing-head h1');
    await buy.getByRole('button',{name:/Review and sign the NDA|Request the confidential details/}).first().click();
    await buy.waitForSelector('.ks-nda');
    await buy.check('.ks-nda input[type=checkbox]');await buy.fill('.ks-nda input:not([type=checkbox])','Alex Morgan (fictional)');
    await buy.getByRole('button',{name:'Sign and request access'}).click();await buy.waitForSelector('text=Request received');
    await adv.reload();await adv.waitForSelector('.deal-head h1',{timeout:30000}).catch(async()=>{await adv.goto(U+'#advisor/today');});
    const approve=adv.getByRole('button',{name:'Approve and share details'}).first();
    if(await approve.count())await approve.click();
    else{await adv.goto(U+'#advisor/buyers');await guided(adv,'Approve the fictional buyer’s NDA request for the rehearsal listing.',async()=>(await adv.getByText(/Approved/).count())>0);}
    await buy.reload();await buy.waitForSelector('.ks-dr',{timeout:30000});
    await sweep(buy,'buyer-listing');
  });

  await step('buyer reads the data room with a watermark; reads are logged',async()=>{
    await buy.locator('.ks-dr-folder li').filter({hasText:'Confidential memorandum'}).getByRole('button',{name:'Open'}).click();
    await buy.waitForSelector('.ks-viewer canvas',{timeout:60000});await buy.waitForTimeout(900);
    const stamp=await buy.locator('.ks-viewer-stamp').innerText();
    if(!stamp.includes('Alex Morgan')||!stamp.includes(EMAILS.buyer))fail('The watermark must carry the buyer identity: '+stamp);
    await noOverflow(buy,'viewer at 390');await shoot(buy,'buyer-viewer-390');
    await buy.keyboard.press('Escape');await buy.waitForSelector('.ks-viewer',{state:'detached'});
    // The seller sees the read under an anonymous label, never the buyer's name.
    await sel.reload();await sel.waitForSelector('#portal-opened',{timeout:30000});
    const opened=await sel.locator('#portal-opened').innerText();
    if(!/Buyer \d/.test(opened))fail('The owner log must show an anonymous label.');
    if(opened.includes('Alex'))fail('The owner log leaked a buyer name.');
    await shoot(sel,'seller-opened-390');
  });

  await step('offer, seller acceptance, Under LOI',async()=>{
    await buy.goto(U+'#/listings/'+(await sb.from('kalling_listings').select('number').eq('status','Live').order('created_at',{ascending:false}).limit(1)).data[0].number);
    await buy.waitForSelector('.ks-listing-head h1');
    const offerBtn=buy.getByRole('button',{name:/Make an offer|Start an offer|Write an offer/}).first();
    if(await offerBtn.count()){
      await offerBtn.click();await buy.waitForTimeout(500);
      const set=async(n,v)=>{const el=buy.locator(`input[name=${n}]`);if(await el.count())await el.fill(v);};
      await set('price','1,100,000');await set('cashAtClose','900,000');await set('sellerNote','200,000');
      const kind=buy.locator('select[name=kind]');if(await kind.count())await kind.selectOption({label:'Letter of intent'}).catch(()=>{});
      const send=buy.getByRole('button',{name:/Submit|Send offer|Send/}).first();await send.click();await buy.waitForTimeout(800);
    }else await guided(buy,'Submit a fictional letter-of-intent offer of about $1.1M on the rehearsal listing.',async()=>(await buy.getByText(/Offer|Letter of intent/).count())>0);
    await shoot(buy,'buyer-offer-390');
    await adv.goto(U+'#advisor/today');await adv.waitForTimeout(600);
    await guided(adv,'Open the rehearsal deal’s Offers tab, share the fictional offer with the seller, then have the runner continue once the seller portal shows it.',
      async()=>{await sel.reload().catch(()=>{});return (await sel.getByText(/offer|Offer/).count())>0;});
    await guided(sel,'In the seller portal, review the shared fictional offer and accept it.',
      async()=>(await sb.from('kalling_listings').select('status').in('status',['Under LOI']).limit(1)).data?.length>0,20*60000);
    await sweep(sel,'seller-offer');
  });

  await step('execution: sourced proposal reviewed in the app against the PDF',async()=>{
    await adv.reload();await adv.waitForSelector('.deal-head h1').catch(()=>{});
    const exec=adv.getByRole('tab',{name:/Execution|Transaction/}).first();
    if(await exec.count())await exec.click();
    else await guided(adv,'Open the rehearsal deal’s execution workspace (the transaction created by the accepted offer).',async()=>(await adv.getByText(/Execution documents|execution/).count())>0);
    const confirm=adv.getByRole('button',{name:'Confirm permitted input snapshot'}).first();
    if(await confirm.count())await confirm.click().catch(()=>{});
    const start=adv.getByRole('button',{name:'Prepare a sourced proposal'}).first();
    if(await start.count())await start.click();
    else await guided(adv,'In Optional sourced preparation, confirm the permitted input and start Prepare a sourced proposal.',async()=>(await adv.getByText(/Proposal for reviewer judgment|Waiting for the research computer|running/).count())>0);
    await until(async()=>(await adv.getByText('Proposal for reviewer judgment').count())>0,20*60000,2000);
    await shoot(adv,'execution-proposal-1440');
    // The proposal's quotation must be real text from the stored source page: compare
    // against kalling_portal_file_text with the advisor's own session, read-only.
    const quote=(await adv.locator('blockquote p').first().innerText()).trim();
    const src=await adv.locator('blockquote small').first().innerText();
    const {error:authErr}=await sb.auth.signInWithPassword({email:EMAILS.owner_a,password:passwords.owner_a});
    if(authErr)fail('Advisor corroboration sign-in failed: '+authErr.message);
    const texts=await sb.from('kalling_portal_file_text').select('pages');
    const all=JSON.stringify(texts.data||[]);
    const needle=quote.slice(0,80).replace(/\s+/g,' ');
    if(!all.replace(/\\n/g,' ').replace(/\s+/g,' ').includes(needle))fail('The proposal quotation was not found in the stored source text: "'+needle+'" ('+src+')');
    await sb.auth.signOut();
    report.proposal={quote,source:src,verified:'quotation found in stored source text'};
    await guided(adv,'Read the proposal and record YOUR judgment in the app (accept into the record, or dismiss). The runner never records a judgment for you.',
      async()=>(await adv.getByText(/Imported|Dismissed|Reviewed/).count())>0,30*60000);
    await sweep(adv,'execution-workspace');
  });

  await step('diligence, closing and handover (guided, verified by state)',async()=>{
    await guided(adv,'Work the fictional transaction through diligence and the closing timeline to Closed, as the advisor, with the seller and buyer windows for their approvals. Every control stays in the app; the runner watches the listing until it reads Sold.',
      async()=>(await sb.from('kalling_listings').select('status').eq('status','Sold').eq('sample',true).order('created_at',{ascending:false}).limit(1)).data?.length>0,120*60000);
    await sweep(adv,'execution-closed');
    await buy.goto(U+'#/account');await buy.waitForTimeout(800);await sweep(buy,'buyer-closed');
    await sel.reload();await sel.waitForTimeout(800);await sweep(sel,'seller-closed');
  });

  await step('final checks: intake still paused, no real rows, no page errors',async()=>{
    const leads=await sb.from('kalling_leads').select('email');
    for(const l of leads.data||[])if(!l.email.endsWith('@kalling-validation.invalid'))fail('A non-fictional lead appeared: '+l.email);
    const real=await sb.from('kalling_listings').select('number').eq('sample',false);
    if((real.data||[]).length)fail('Unlabeled listings remain: '+JSON.stringify(real.data));
    const errsNow=errs.filter(e=>!/ResizeObserver/.test(e));
    if(errsNow.length)fail('Browser page errors: '+errsNow.join(' | '));
    report.result='passed';
  });

  }finally{
    save();
    await browser.close().catch(()=>{});
    preview.kill();
    log('\nReport: '+out+(shots?'\nScreenshots: '+shots:''));
    log('Result: '+report.result);
  }
})().catch(e=>{console.error('\nFAILED: '+(e.message||e));process.exitCode=1;});
