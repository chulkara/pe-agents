import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';
export async function marketplaceFixture(){const db=new PGlite();await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')&&!f.startsWith('002')).sort();for(const f of files)await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const ids=Array.from({length:6},()=>crypto.randomUUID()),[owner,buyer,other,seller,viewer,outsider]=ids;
 const as=async(uid,sql,args=[],role='authenticated')=>{await db.exec('begin;set local role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid||'']);const r=await db.query(sql,args);await db.exec('commit');return r.rows;}catch(e){await db.exec('rollback');throw e;}};
 const one=async(u,q,a=[],role='authenticated')=>Object.values((await as(u,q,a,role))[0]||{})[0];
 for(let i=0;i<ids.length;i++)await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[ids[i],`fictional-${i}@marketplace.invalid`]);
 const firm=await one(owner,'select public.kalling_create_firm($1,$2)',['Fictional brokerage',{firm:{name:'Fictional brokerage'},companies:[{id:'c1',name:'Fictional HVAC'}],deals:[],events:[]}]);await one(owner,'select public.kalling_brokerage_set_house($1)',[firm]);
 const invite=await one(owner,'select public.kalling_invite_member($1,$2,$3)',[firm,'fictional-4@marketplace.invalid','viewer']);await one(viewer,'select public.kalling_accept_invite($1)',[invite]);
 const profile={name:'Fictional Buyer',type:'Owner-operator',funds:'Under $250K',experience:'Fictional software testing only with no real buyer.',regions:['Central Jersey'],maxPrice:1000000};
 const b1=await one(buyer,'select public.kalling_buyer_save_profile($1)',[profile]),b2=await one(other,'select public.kalling_buyer_save_profile($1)',[{...profile,name:'Second Buyer'}]);
 return {db,ids,owner,buyer,other,seller,viewer,outsider,firm,b1,b2,as,one};
}
