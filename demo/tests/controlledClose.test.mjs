import {test} from 'node:test';import assert from 'node:assert/strict';import * as C from '../lib/controlledClose.ts';import {transactionFixture,advisor} from './transaction-fixture.mjs';
import {amounts} from './transaction-fixture.mjs';
test('closing amounts use cents, reconcile fixed consideration and keep acquisition borrowing and maximum earnout separate',()=>{assert.equal(C.validateClosingAmounts(amounts).fixed,260000000);assert.equal(C.validateClosingAmounts({...amounts,cash:240000001,fixed:260000001}).fixed,260000001);for(const a of [{...amounts,fixed:410000000},{...amounts,cash:-1},{...amounts,cash:0.1},{...amounts,earnoutRealized:30000000},{...amounts,currency:'EUR'}])assert.throws(()=>C.validateClosingAmounts(a));});
test('no checklist percentage or accepted offer substitutes for closing evidence and current authority',()=>{const {d,t}=transactionFixture();assert.ok(C.closingBlockers(d,t).some(x=>x.includes('signed LOI')));assert.throws(()=>C.prepareClose(d,t,advisor,'A complete-looking checklist cannot authorize closing.'),/blockers/);assert.throws(()=>C.recordClose(d,t,{...advisor,role:'analyst'},{commandId:crypto.randomUUID()}),/owner or administrator/);assert.equal(d.listings[0].status,'Live');});
test('closing blockers become steps that name the tab and the missing piece',()=>{
 const {t}=transactionFixture(),src={fileId:'f',page:1,excerpt:'Fictional passage.'};
 const c=(title,o)=>({id:title,kind:title,title,owner:'A',nextAction:'B',due:{kind:'Unknown',reason:'x'},audience:[],dependsOn:[],revision:2,required:true,stage:'Not required (reviewed)',details:{},sources:[src],history:[],...o});
 const tx={...t,conditions:[c('Financing',{review:{revision:1}}),c('License',{stage:'Continuity confirmed',sources:[]}),c('Escrow',{stage:'Requested'})],items:[{id:'i1',title:'Confirm earnings',status:'Resolved',revision:2,review:{revision:2}},{id:'i2',title:'Confirm earnings',status:'Open',revision:1}]};
 const steps=C.blockerSteps(tx,['Financing','License','Escrow','Confirm earnings','Review the current externally signed LOI.']);
 assert.deepEqual(steps.map(s=>s.where),['Closing','Closing','Closing','Diligence','LOI']);
 assert.match(steps[0].text,/confirmation on revision 2/);
 assert.match(steps[1].text,/add a source/);
 assert.match(steps[2].text,/completed stage/);
 assert.match(steps[3].text,/duplicates/);
});
