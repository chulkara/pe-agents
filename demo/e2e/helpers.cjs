// Shared steps for the browser tests: a lead, qualification and a signed engagement letter.
const assert=require('node:assert/strict');

async function submitLead(site,U,o={}){
  if(!['127.0.0.1','localhost'].includes(new URL(U).hostname))throw Error('Fictional browser tests require a loopback preview.');
  await site.context().addInitScript(()=>{localStorage.setItem('kalling-marketplace-demo-v1','true');localStorage.setItem('kalling-cloud-disconnected-v1','true');localStorage.removeItem('kalling-cloud-public-config-v1');});
  await site.goto(U+'#/value');await site.waitForTimeout(500);
  await site.fill('input[name=name]',o.name||'Pat Russo');await site.fill('input[name=email]',o.email||'pat@russohvac.test');await site.fill('input[name=businessName]',o.business||'Russo Heating & Air');
  await site.selectOption('select[name=region]',o.region||'Central Jersey');await site.check('input[name=consent]');
  await site.getByRole('button',{name:'Request a confidential review'}).click();await site.waitForSelector('text=Thank you, '+(o.name||'Pat Russo').split(' ')[0]);
}

/** Sellers > Qualify > Qualified. Leaves the advisor in the Deal Room on the Owner tab. */
async function qualifyLead(adv,o={}){
  await adv.getByRole('button',{name:'Sellers',exact:true}).click();await adv.getByRole('button',{name:'Qualify',exact:true}).first().click();
  const panel=adv.locator('.eng-qualify');
  for(const l of ['Revenue and earnings in range','Speaking with the decision maker','Books kept by an accountant or bookkeeper','Three years of tax returns available'])await panel.getByLabel(l).check();
  await panel.getByLabel('Why they want to sell').fill(o.reason||'Retiring after 30 years');await panel.getByLabel('When').fill('Within a year');
  await panel.getByLabel('Who holds the master HVACR license').selectOption('Owner only');
  await panel.getByRole('button',{name:'Qualified',exact:true}).click();
  await adv.waitForSelector('.deal-head h1');assert.equal(await adv.inputValue('.deal-stage select'),'Qualified');
}

/** Fill the letter, check that empty fees block it, mark it ready and return the owner's link. */
async function prepareLetter(adv,shot=async()=>{}){
  await adv.waitForSelector('.eng-letter');const L=adv.locator('.eng-letter');
  assert.ok(await L.getByRole('button',{name:'Ready for owner'}).isDisabled(),'empty fees block the letter');
  assert.match(await L.locator('.eng-problems').innerText(),/success fee percentage/);
  await L.getByLabel('Firm address').fill('1 Main Street, Green Brook, NJ 08812');
  await L.getByLabel('Success fee, %').fill('8');await L.getByLabel('Minimum success fee, $').fill('60000');
  await L.getByLabel('Fee is calculated on').selectOption({index:1});await L.getByLabel(/^Retainer/).first().selectOption('none');
  await L.getByLabel('Exclusivity, months').fill('9');await L.getByLabel('Tail period, months').fill('12');await L.getByLabel('Termination notice, days').fill('30');
  await L.getByLabel('Expenses').fill('Kalling pays its own expenses.');
  await adv.waitForSelector('text=The letter is complete.');await shot('letter-advisor');
  await L.getByRole('button',{name:'Ready for owner'}).click();await adv.waitForSelector('text=Send this link to the owner yourself');
  return adv.inputValue('.eng-link input');
}

/** The owner opens the link, sees only the letter, and signs. */
async function ownerSigns(owner,link,o={}){
  await owner.goto(link);await owner.fill('input[name=email]',o.email||'pat@russohvac.test');await owner.getByRole('button',{name:'Open my portal'}).click();
  await owner.waitForSelector('#portal-letter');
  assert.match(await owner.locator('#portal-requests').innerText(),/open here once the engagement letter is signed/);
  assert.equal(await owner.locator('.portal-request').count(),0,'no requests before signing');
  await owner.getByLabel(/I agree to sign/).check();await owner.getByLabel(/Type your full name/).fill(o.name||'Pat Russo');
  await owner.getByRole('button',{name:'Sign the letter'}).click();await owner.waitForSelector('text=will countersign');
}

/** The advisor countersigns; the deal moves to Engaged. */
async function countersign(adv,advisor='Karan'){
  await adv.reload();await adv.waitForSelector('.eng-sign');
  await adv.locator('.eng-sign').getByLabel('I agree to sign electronically').check();await adv.locator('.eng-sign').getByLabel(/to countersign/).fill(advisor);
  await adv.locator('.eng-sign').getByRole('button',{name:'Countersign'}).click();await adv.waitForSelector('text=Countersigned. The owner');
  await adv.waitForFunction(()=>document.querySelector('.deal-stage select')?.value==='Engaged');
}
module.exports={submitLead,qualifyLead,prepareLetter,ownerSigns,countersign};
