import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 20261125060000: the firm shares the sale-ready page; the owner and the firm read it.
let db,firm,portal;
const owner='00000000-0000-0000-0000-0000000000e1',analyst='00000000-0000-0000-0000-0000000000e2',viewer='00000000-0000-0000-0000-0000000000e3',seller='00000000-0000-0000-0000-0000000000e4',stranger='00000000-0000-0000-0000-0000000000e5';
async function as(user,sql,args=[]){await db.exec('begin;set local role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);try{const r=await db.query(sql,args);await db.exec('commit;');return r.rows;}catch(e){await db.exec('rollback;');throw e;}}
const one=async(u,sql,a)=>{const r=await as(u,sql,a);return r[0]?Object.values(r[0])[0]:null;};
const input=(revenue=2600000)=>({businessName:'Russo Heating & Air',inputs:{revenue,ownerPay:168000,netProfit:243000,addBacks:0},addBacks:[{item:'Settlement',amount:40000,evidence:'pl-2025.pdf, page 1'}],requests:[{title:'P&L',status:'Accepted'}],asOf:'2026-11-25'});
const note='Pat, here is where the business stands this month.';
before(async()=>{db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
  for(const f of ['001_foundation.sql','20261108215809_kalling_invitation_rls.sql','003_agent_workers.sql','004_owner_portal.sql','20261125060000_kalling_sale_ready.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
  for(const [id,e] of [[owner,'o@k.test'],[analyst,'a@k.test'],[viewer,'v@k.test'],[seller,'pat@russohvac.test'],[stranger,'x@k.test']])await db.query('insert into auth.users values($1,$2,now())',[id,e]);
  firm=await one(owner,'select public.kalling_create_firm($1,$2)',['Kalling',{firm:{name:'Kalling'},companies:[{id:'co-1',name:'Russo'}],deals:[],events:[]}]);
  for(const [u,e,r] of [[analyst,'a@k.test','analyst'],[viewer,'v@k.test','viewer']]){const t=await one(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,e,r]);await one(u,'select public.kalling_accept_invite($1)',[t]);}
  portal=await one(analyst,'select public.kalling_portal_create($1,$2,$3,$4,$5,$6,$7)',[firm,'co-1','Russo Heating & Air','Pat Russo','pat@russohvac.test',{name:'Karan',email:'a@k.test'},'']);
  const tok=await one(analyst,'select public.kalling_portal_invite($1)',[portal]);await one(seller,'select public.kalling_portal_accept($1)',[tok]);});
after(async()=>db?.close());

const share=(u,i=input(),n=note)=>one(u,'select public.kalling_portal_share_sale_ready($1,$2,$3)',[portal,i,n]);

test('only firm writers share, with a note and a recast',async()=>{
  await assert.rejects(share(seller),/access denied/);
  await assert.rejects(share(viewer),/access denied/);
  await assert.rejects(share(stranger),/access denied/);
  await assert.rejects(share(analyst,input(),'Too short.'),/at least 20 characters/);
  await assert.rejects(share(analyst,input(0)),/Enter the recast/);
  await assert.rejects(share(analyst,{...input(),inputs:{revenue:'lots'}}),/Enter the recast/);
  await assert.rejects(share(analyst,{businessName:'x'}),/missing its numbers/);
  await assert.rejects(share(analyst,{...input(),requests:'x'.repeat(70000)}),/missing its numbers|too large/);
});
test('versions count up; the owner and the firm read them, signed by the owner’s contact',async()=>{
  await share(analyst);await share(owner,input(2700000));
  const rows=await as(seller,'select version,note,by_name,input from public.kalling_portal_sale_ready where portal_id=$1 order by version',[portal]);
  assert.deepEqual(rows.map(r=>r.version),[1,2]);assert.equal(rows[0].by_name,'Karan');assert.equal(rows[1].input.inputs.revenue,2700000);assert.equal(rows[0].note,note);
  assert.equal((await as(viewer,'select 1 from public.kalling_portal_sale_ready')).length,2);
  assert.equal((await as(stranger,'select 1 from public.kalling_portal_sale_ready')).length,0);
});
test('nobody writes the table directly',async()=>{
  await assert.rejects(as(analyst,'insert into public.kalling_portal_sale_ready(portal_id,version,input,note,by_name,created_by) values($1,9,$2,$3,$4,$5)',[portal,input(),note,'Karan',analyst]),/permission denied/);
  await assert.rejects(as(seller,'update public.kalling_portal_sale_ready set note=$1',['x'.repeat(30)]),/permission denied/);
  await assert.rejects(as(analyst,'delete from public.kalling_portal_sale_ready'),/permission denied/);
});
test('a closed portal takes no new pages',async()=>{
  await as(analyst,'select public.kalling_portal_update($1,$2)',[portal,{close:true}]);
  await assert.rejects(share(analyst),/closed/);
  assert.equal((await as(seller,'select 1 from public.kalling_portal_sale_ready')).length,0,'a closed portal hides it from the owner');
});
