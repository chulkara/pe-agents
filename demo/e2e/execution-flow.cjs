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
      for(const width of ['1440','1024','390']){
        await page.locator('#width').selectOption(width);
        await page.getByRole('button',{name:'Assert layout and privacy',exact:true}).click();
        assert.match(await page.locator('#result').innerText(),new RegExp('^PASS: '+surface+' at '+width+'px;'));
        if(OUT&&['advisor','owner','buyer'].includes(surface))await page.screenshot({path:OUT+'/'+surface+'-'+width+'.jpg'});
        console.log('PASS: '+surface+' at '+width+'px.');
      }
    }
    assert.deepEqual(errors,[],'Unexpected browser page errors');
    await page.getByRole('button',{name:'Restore previous demo',exact:true}).click();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
