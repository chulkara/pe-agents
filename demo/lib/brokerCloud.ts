import type {SupabaseClient} from '@supabase/supabase-js';
import type {BrokerStore,ViewListing} from './brokerStore.ts';
import {ndaHash} from './brokerStore.ts';
import type {Listing,Buyer,AccessRequest,Offer,Question,Lead,Viewer,BuyerCheck} from './brokerage.ts';

type LRow={id:string;number:string;status:Listing['status'];sample:boolean;headline:string;region:Listing['region'];focus:Listing['focus'];asking_price:number;revenue:number;sde:number;established:number;employees:number;technicians:number;agreements:number;recurring_pct:number;residential_pct:number;vehicles:number;real_estate:Listing['realEstate'];seller_financing:boolean;reason:string;summary:string;highlights:string[];growth:string[];created_at:string;published_at:string|null;updated_at:string};
type PRow={listing_id:string;business_name:string;city:string;website:string;details:string;company_id:string|null};
const listing=(r:LRow,p?:PRow):Listing=>({id:r.id,number:r.number,status:r.status,sample:r.sample,headline:r.headline,region:r.region,focus:r.focus,askingPrice:Number(r.asking_price),revenue:Number(r.revenue),sde:Number(r.sde),established:r.established,employees:r.employees,technicians:r.technicians,agreements:r.agreements,recurringPct:r.recurring_pct,residentialPct:r.residential_pct,vehicles:r.vehicles,realEstate:r.real_estate,sellerFinancing:r.seller_financing,reason:r.reason,summary:r.summary,highlights:r.highlights||[],growth:r.growth||[],confidential:{businessName:p?.business_name||'',city:p?.city||'',website:p?.website||'',details:p?.details||''},companyId:p?.company_id||undefined,createdAt:r.created_at,publishedAt:r.published_at||undefined,updatedAt:r.updated_at});
type BRow={id:string;email:string;name:string;phone:string;type:Buyer['type'];company:string;funds:Buyer['funds'];financing:string[];experience:string;regions:Buyer['regions'];max_price:number;status:Buyer['status'];advisor_note:string;saved:string[];alerts:boolean;created_at:string};
const buyer=(r:BRow):Buyer=>({id:r.id,email:r.email,name:r.name,phone:r.phone,type:r.type,company:r.company,funds:r.funds,financing:r.financing||[],experience:r.experience,regions:r.regions||[],maxPrice:Number(r.max_price),status:r.status,advisorNote:r.advisor_note,saved:r.saved||[],alerts:r.alerts,createdAt:r.created_at});
const access=(r:{id:string;listing_id:string;buyer_id:string;status:AccessRequest['status'];nda:AccessRequest['nda'];message:string;decision_note:string;decided_at:string|null;created_at:string}):AccessRequest=>({id:r.id,listingId:r.listing_id,buyerId:r.buyer_id,status:r.status,nda:r.nda,message:r.message,decisionNote:r.decision_note,decidedAt:r.decided_at||undefined,createdAt:r.created_at});
const offer=(r:{id:string;listing_id:string;buyer_id:string;kind:Offer['kind'];price:number;cash_at_close:number;seller_note:number;earnout:number;financing:string;close_days:number;conditions:string;status:Offer['status'];advisor_note:string;created_at:string;updated_at:string}):Offer=>({id:r.id,listingId:r.listing_id,buyerId:r.buyer_id,kind:r.kind,price:Number(r.price),cashAtClose:Number(r.cash_at_close),sellerNote:Number(r.seller_note),earnout:Number(r.earnout),financing:r.financing,closeDays:r.close_days,conditions:r.conditions,status:r.status,advisorNote:r.advisor_note,createdAt:r.created_at,updatedAt:r.updated_at});
const question=(r:{id:string;listing_id:string;buyer_id:string;side:Question['side'];author:string;body:string;created_at:string}):Question=>({id:r.id,listingId:r.listing_id,buyerId:r.buyer_id,side:r.side,author:r.author,body:r.body,createdAt:r.created_at});
const lead=(r:{id:string;created_at:string;name:string;email:string;phone:string;business_name:string;region:Lead['region'];timing:string;message:string;valuation:Lead['valuation']|null;status:Lead['status'];notes:string;source:Lead['source']}):Lead=>({id:r.id,createdAt:r.created_at,name:r.name,email:r.email,phone:r.phone,businessName:r.business_name,region:r.region,timing:r.timing,message:r.message,valuation:r.valuation||undefined,status:r.status,notes:r.notes,source:r.source});

/** Supabase-backed marketplace. Row-level security decides what each viewer can read. */
export function cloudBrokerStore(client:SupabaseClient,viewer:Viewer):BrokerStore{
  async function rows<T>(q:PromiseLike<{data:unknown;error:{message:string}|null}>):Promise<T[]>{const {data,error}=await q;if(error)throw Error(error.message);return (data||[]) as T[];}
  async function call(name:string,args:Record<string,unknown>){const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data;}
  async function mine(){if(viewer.kind!=='buyer')return null;const [b]=await rows<BRow>(client.from('kalling_buyers').select('*').eq('email',viewer.email));return b?buyer(b):null;}
  async function view(ls:LRow[]):Promise<ViewListing[]>{
    const ids=ls.map(l=>l.id);if(!ids.length)return [];
    const priv=viewer.kind==='public'?[]:await rows<PRow>(client.from('kalling_listing_private').select('*').in('listing_id',ids));
    const b=await mine(),acc=b?(await rows<Parameters<typeof access>[0]>(client.from('kalling_access').select('*').eq('buyer_id',b.id))).map(access):[];
    return ls.map(r=>{const l=listing(r,priv.find(p=>p.listing_id===r.id)),a=acc.filter(x=>x.listingId===r.id).at(-1);return {...l,...(viewer.kind==='advisor'?{}:{companyId:undefined}),access:viewer.kind==='advisor'?'Advisor' as const:a?.status||'None'};});
  }
  const store:BrokerStore={
    mode:'cloud',viewer,
    async listings(){const ls=await rows<LRow>(client.from('kalling_listings').select('*').order('published_at',{ascending:false,nullsFirst:false}));return (await view(ls)).sort((a,b)=>(a.status==='Sold'?1:0)-(b.status==='Sold'?1:0));},
    async listing(key){const col=/^KL-\d+$/i.test(key)?'number':'id';const ls=await rows<LRow>(client.from('kalling_listings').select('*').eq(col,col==='number'?key.toUpperCase():key));if(!ls.length)throw Error('This listing is not available.');return (await view(ls))[0];},
    async submitLead(i){await call('kalling_submit_lead',{p:i});},
    async me(){const b=await mine();if(!b)return null;const [a,o,q]=await Promise.all([rows<Parameters<typeof access>[0]>(client.from('kalling_access').select('*').eq('buyer_id',b.id)),rows<Parameters<typeof offer>[0]>(client.from('kalling_offers').select('*').eq('buyer_id',b.id)),rows<Parameters<typeof question>[0]>(client.from('kalling_listing_questions').select('*').eq('buyer_id',b.id).order('created_at'))]);return {buyer:b,access:a.map(access),offers:o.map(offer),questions:q.map(question)};},
    async saveProfile(i){await call('kalling_buyer_save_profile',{p:i});},
    async toggleSaved(id){await call('kalling_buyer_toggle_saved',{p_listing:id});},
    async requestAccess(l,name,agreed,message){await call('kalling_buyer_request_access',{p_listing:l.id,p_signed_name:name,p_agreed:agreed,p_message:message,p_text_hash:await ndaHash(l)});},
    async ask(listingId,body,buyerId){await call('kalling_listing_ask',{p_listing:listingId,p_body:body,p_buyer:buyerId??null});},
    async offer(listingId,o){await call('kalling_buyer_offer',{p_listing:listingId,p:o});},
    async setOffer(id,status,note){await call('kalling_offer_update',{p_offer:id,p_status:status,p_note:note});},
    async leads(){return (await rows<Parameters<typeof lead>[0]>(client.from('kalling_leads').select('*').order('created_at',{ascending:false}).limit(500))).map(lead);},
    async updateLead(id,p){await call('kalling_lead_update',{p_lead:id,p_status:p.status??null,p_notes:p.notes??null});},
    async saveListing(input){return String(await call('kalling_listing_save',{p:input}));},
    async setStatus(id,status){await call('kalling_listing_set_status',{p_listing:id,p_status:status});},
    async buyers(){return (await rows<BRow>(client.from('kalling_buyers').select('*').order('created_at',{ascending:false}))).map(buyer);},
    async vet(id,status,note){await call('kalling_buyer_vet',{p_buyer:id,p_status:status,p_note:note});},
    async checks(){const {data,error}=await client.from('kalling_buyer_checks').select('*');if(error){if(/kalling_buyer_checks/.test(error.message))return [];throw Error(error.message);}return ((data||[]) as {buyer_id:string;funds:string;note:string;checked_at:string;checked_by_email:string}[]).map(r=>({buyerId:r.buyer_id,funds:r.funds as BuyerCheck['funds'],note:r.note,checkedAt:r.checked_at,checkedBy:r.checked_by_email}));},
    async check(id,funds,note){await call('kalling_buyer_check',{p_buyer:id,p_funds:funds,p_note:note});},
    async requests(){return (await rows<Parameters<typeof access>[0]>(client.from('kalling_access').select('*').order('created_at',{ascending:false}))).map(access);},
    async decide(id,status,note){await call('kalling_access_decide',{p_request:id,p_status:status,p_note:note});},
    async offers(){return (await rows<Parameters<typeof offer>[0]>(client.from('kalling_offers').select('*').order('created_at',{ascending:false}))).map(offer);},
    async questions(listingId){let q=client.from('kalling_listing_questions').select('*').order('created_at');if(listingId)q=q.eq('listing_id',listingId);return (await rows<Parameters<typeof question>[0]>(q)).map(question);},
  };
  return store;
}
/** True when the brokerage tables exist on the connected project. */
export async function brokerageReady(client:SupabaseClient){const {error}=await client.from('kalling_listings').select('id').limit(1);return !error;}
