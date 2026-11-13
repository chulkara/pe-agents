// One shared load of marketplace and owner-portal data for every advisor page and the Deal Room.
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {BrokerStore} from '../../lib/brokerStore';
import {localBrokerStore} from '../../lib/brokerStore';
import {localDataRoomStore,type DataRoomStore} from '../../lib/dataRoomStore';
import {anonymousBuyerLabel,type Lead,type Listing,type Buyer,type BuyerCheck,type AccessRequest,type Offer,type Question,type BrokerDb} from '../../lib/brokerage';
import type {Company} from '../../lib/domain';
import type {Portal,PortalBundle} from '../../lib/portal';
import {dealStage,type SellStage} from '../../lib/deals';
import {PortalContextRef} from '../OwnerPortalAdmin';

export type BrokerData={leads:Lead[];listings:Listing[];buyers:Buyer[];requests:AccessRequest[];offers:Offer[];questions:Question[];checks:BuyerCheck[]};
type Ctx={alerts:import('../../lib/listingAlerts').AlertMessage[];introductions:import('../../lib/lenderPreparation').Introduction[];marketplaceError:string;verification:import('../../lib/buyerVerification').Verification[];verificationError:string;d:BrokerData|null;error:string;busy:boolean;store:BrokerStore;room:DataRoomStore;canWrite:boolean;
  act:(fn:()=>Promise<unknown>)=>Promise<boolean>;reload:()=>Promise<void>;
  portals:Record<string,{portal:Portal;bundle?:PortalBundle}>;reloadPortals:()=>Promise<void>;
  syncPortal:(listing:Listing|undefined,buyer:Buyer|undefined,stage:'Under NDA'|'Offer made'|'Not proceeding')=>Promise<void>};
const C=createContext<Ctx|null>(null);
export function useAdvisor(){const c=useContext(C);if(!c)throw Error('Advisor data is not loaded.');return c;}

export function AdvisorDataProvider({store:given,room:givenRoom,operator,canWrite,children}:{store?:BrokerStore;room?:DataRoomStore;operator:string;canWrite:boolean;children:ReactNode}){
  const room=useMemo(()=>givenRoom||localDataRoomStore({kind:'advisor',name:operator,canWrite}),[givenRoom,operator,canWrite]);
  const store=useMemo(()=>given||localBrokerStore({kind:'advisor',name:operator,canWrite}),[given,operator,canWrite]);
  const portal=useContext(PortalContextRef);
  const [d,setD]=useState<BrokerData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[portals,setPortals]=useState<Ctx['portals']>({});
  const [verification,setVerification]=useState<import('../../lib/buyerVerification').Verification[]>([]),[verificationError,setVerificationError]=useState('');
  const [alerts,setAlerts]=useState<Ctx['alerts']>([]),[introductions,setIntroductions]=useState<Ctx['introductions']>([]),[marketplaceError,setMarketplaceError]=useState('');
  const dRef=useRef(d);dRef.current=d;
  const reload=useCallback(async()=>{try{const [leads,listings,buyers,requests,offers,questions,checks]=await Promise.all([store.leads(),store.listings(),store.buyers(),store.requests(),store.offers(),store.questions(),store.checks().catch(()=>[])]);setD({leads,listings,buyers,requests,offers,questions,checks});setError('');if(canWrite)try{const [a,i]=await Promise.all([store.alerts.queue(),store.lenders.requests()]);setAlerts(a);setIntroductions(i);setMarketplaceError('');}catch(e){setMarketplaceError((e as Error).message);}if(canWrite)try{setVerification(await store.verification.list());setVerificationError('');}catch(e){setVerificationError((e as Error).message);}}catch(e){setError((e as Error).message);setD(x=>x||{leads:[],listings:[],buyers:[],requests:[],offers:[],questions:[],checks:[]});}},[store,canWrite]);
  const reloadPortals=useCallback(async()=>{const s=portal.store;if(!s)return;try{const list=(await s.firmPortals()).filter(p=>p.status!=='Closed');const out:Ctx['portals']={};for(const p of list){if(out[p.companyId])continue;out[p.companyId]={portal:p,bundle:await s.load(p.id).catch(()=>undefined)};}setPortals(out);}catch{/* portal tables may not exist yet */}},[portal.store]);
  useEffect(()=>{void reload();void reloadPortals();const t=setInterval(()=>{if(document.visibilityState!=='hidden'){void reload();void reloadPortals();}},20000);return()=>clearInterval(t);},[reload,reloadPortals]);
  const act=useCallback(async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await reload();await reloadPortals();return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}},[reload,reloadPortals]);
  /** Approved buyers and shared offers show up, without names, in the owner's portal. */
  const syncPortal=useCallback<Ctx['syncPortal']>(async(listing,buyer,stage)=>{
    const cur=dRef.current;if(!listing?.companyId||!buyer||!portal.store||!cur)return;const p=(await portal.store.listForCompany(listing.companyId)).find(x=>x.status!=='Closed');if(!p)return;
    const db={listings:cur.listings,buyers:cur.buyers,access:await store.requests(),offers:cur.offers,questions:cur.questions,leads:cur.leads} as BrokerDb;
    const name=anonymousBuyerLabel(db,buyer,listing.id),existing=(await portal.store.load(p.id)).buyers.find(b=>b.name===name);
    await portal.store.saveBuyer(p.id,{id:existing?.id,name,summary:`${buyer.type}. ${buyer.funds} available; plans to pay with ${buyer.financing.join(', ')||'a method to be confirmed'}. Approved by your advisor after signing the NDA.`,stage});
  },[portal.store,store]);
  return <C.Provider value={{alerts,introductions,marketplaceError,verification,verificationError,d,error,busy,store,room,canWrite,act,reload,portals,reloadPortals,syncPortal}}>{children}</C.Provider>;
}

/** The listing that represents this company on the marketplace, if any. */
export function listingOf(d:BrokerData|null,c:Company){return d?.listings.filter(l=>l.companyId===c.id&&l.status!=='Withdrawn').sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];}
export function stageOf(x:Pick<Ctx,'d'|'portals'>,c:Company):SellStage{return dealStage(c,{listing:listingOf(x.d,c),portal:x.portals[c.id]?.portal});}
/** The last message in a buyer thread came from the buyer. */
export function unansweredThreads(qs:Question[]){const m=new Map<string,Question[]>();for(const q of qs){const k=q.listingId+'|'+q.buyerId;m.set(k,[...(m.get(k)||[]),q]);}return [...m.values()].filter(t=>t[t.length-1].side==='buyer');}
export const openOffer=(o:Offer)=>['Submitted','Shared with seller','Countered'].includes(o.status);
