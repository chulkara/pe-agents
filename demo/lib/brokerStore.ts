import {localAlertStore,type AlertStore} from './alertStore.ts';
import {localOfferVersionStore,type OfferVersionStore} from './offerVersionStore.ts';
import {localLenderStore,type LenderStore} from './lenderStore.ts';
import * as B from './brokerage.ts';
import {sampleListings} from './brokerageSamples.ts';
import {sha256Hex} from './portal.ts';
import {localVerificationStore,type VerificationStore} from './verificationStore.ts';
import type {BrokerDb,Viewer,Listing,Lead,Buyer,BuyerCheck,FundsCheck,AccessRequest,Offer,Question,ListingStatus,LeadStatus} from './brokerage.ts';

export type ViewListing=ReturnType<typeof B.listingFor>;
export type BuyerProfileInput=Parameters<typeof B.registerBuyer>[2];
export type OfferInput=Parameters<typeof B.submitOffer>[3];
export type LeadInput=Parameters<typeof B.submitLead>[1];
export interface BrokerStore{
  mode:'local'|'cloud';viewer:Viewer;
  lenders:LenderStore;offerDesk:OfferVersionStore;verification:VerificationStore;alerts:AlertStore;
  listings():Promise<ViewListing[]>;
  listing(idOrNumber:string):Promise<ViewListing>;
  submitLead(input:LeadInput):Promise<void>;
  // buyers
  me():Promise<ReturnType<typeof B.buyerActivity>>;
  saveProfile(input:BuyerProfileInput):Promise<void>;
  toggleSaved(listingId:string):Promise<void>;
  requestAccess(l:Pick<Listing,'id'|'number'|'headline'>,signedName:string,agreed:boolean,message:string):Promise<void>;
  ask(listingId:string,body:string,buyerId?:string):Promise<void>;
  offer(listingId:string,o:OfferInput):Promise<void>;
  setOffer(id:string,status:Offer['status'],note:string):Promise<void>;
  // advisors
  leads():Promise<Lead[]>;
  updateLead(id:string,patch:{status?:LeadStatus;notes?:string}):Promise<void>;
  saveListing(input:Partial<Listing>&{id?:string}):Promise<string>;
  setStatus(id:string,status:ListingStatus):Promise<void>;
  buyers():Promise<Buyer[]>;
  vet(id:string,status:Buyer['status'],note:string):Promise<void>;
  checks():Promise<BuyerCheck[]>;
  check(buyerId:string,funds:FundsCheck,note:string):Promise<void>;
  requests():Promise<AccessRequest[]>;
  decide(id:string,status:'Approved'|'Declined',note:string):Promise<void>;
  offers():Promise<Offer[]>;
  questions(listingId?:string):Promise<Question[]>;
}
export const ndaHash=(l:Pick<Listing,'number'|'headline'>)=>sha256Hex(new TextEncoder().encode(B.ndaText(l)).buffer as ArrayBuffer);

export const LOCAL_BROKER_KEY='kalling-broker-demo-v1';
type KV={getItem(k:string):string|null;setItem(k:string,v:string):void};
/** One-browser demo marketplace. Buyers "sign in" with an email; the advisor console uses the same records. */
export function localBrokerStore(viewer:Viewer,kv:KV=localStorage):BrokerStore{
  const read=():BrokerDb=>{try{const v=JSON.parse(kv.getItem(LOCAL_BROKER_KEY)||'null');if(v&&Array.isArray(v.listings))return {...B.emptyBrokerDb(),...v};}catch{/* reset */}return {...B.emptyBrokerDb(),listings:sampleListings};};
  const write=(db:BrokerDb)=>kv.setItem(LOCAL_BROKER_KEY,JSON.stringify(db));
  const apply=async(fn:(db:BrokerDb)=>BrokerDb)=>{write(fn(read()));};
  const find=(db:BrokerDb,key:string)=>{const l=db.listings.find(x=>x.id===key||x.number.toLowerCase()===key.toLowerCase());if(!l)throw Error('This listing is not available.');return l;};
  const adv=()=>{if(viewer.kind!=='advisor')throw Error('Only a Kalling advisor can do this.');};
  return {
    mode:'local',viewer,lenders:localLenderStore(viewer,kv),offerDesk:localOfferVersionStore(viewer,kv),alerts:localAlertStore(viewer,kv),verification:localVerificationStore(viewer,{kv}),
    async listings(){return B.publicListings(read(),viewer);},
    async listing(key){const db=read();return B.listingFor(db,viewer,find(db,key));},
    async submitLead(input){await apply(db=>B.submitLead(db,input));},
    async me(){return B.buyerActivity(read(),viewer);},
    async saveProfile(input){if(viewer.kind!=='buyer')throw Error('Sign in first.');await apply(db=>B.registerBuyer(db,viewer.email,input));},
    async toggleSaved(id){await apply(db=>B.toggleSaved(db,viewer,id));},
    async requestAccess(l,name,agreed,message){const h=await ndaHash(l);await apply(db=>B.requestAccess(db,viewer,l.id,name,agreed,message,h));},
    async ask(listingId,body,buyerId){await apply(db=>B.askQuestion(db,viewer,listingId,body,buyerId));},
    async offer(listingId,o){await apply(db=>B.submitOffer(db,viewer,listingId,o));},
    async setOffer(id,status,note){await apply(db=>B.updateOffer(db,viewer,id,status,note));},
    async leads(){adv();return read().leads;},
    async updateLead(id,patch){await apply(db=>B.updateLead(db,viewer,id,patch));},
    async saveListing(input){const out=B.saveListing(read(),viewer,input);write(out.db);return out.id;},
    async setStatus(id,status){await apply(db=>B.setListingStatus(db,viewer,id,status));},
    async buyers(){adv();return read().buyers;},
    async vet(id,status,note){await apply(db=>B.vetBuyer(db,viewer,id,status,note));},
    async checks(){adv();return read().checks||[];},
    async check(id,funds,note){await apply(db=>B.checkBuyer(db,viewer,id,funds,note));},
    async requests(){adv();return read().access;},
    async decide(id,status,note){await apply(db=>B.decideAccess(db,viewer,id,status,note));},
    async offers(){adv();return read().offers;},
    async questions(listingId){const db=read();if(viewer.kind==='advisor')return db.questions.filter(q=>!listingId||q.listingId===listingId);const b=B.buyerOf(db,viewer);return b?db.questions.filter(q=>q.buyerId===b.id&&(!listingId||q.listingId===listingId)):[];},
  };
}
