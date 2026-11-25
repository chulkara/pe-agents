// A one-tap sample of the owner's portal for showing Kalling on a phone. Everything lives in
// memory for this page only: it is rebuilt on every visit and never touches saved demo data.
import {useEffect,useMemo,useState} from 'react';
import {Loader2,Lock,RotateCcw} from 'lucide-react';
import {memoryBytes,type PortalStore} from '../lib/portalStore';
import {seedSample,memoryKV,OWNER} from '../lib/sample';
import {localDataRoomStore} from '../lib/dataRoomStore';
import {localProfessionalStore} from '../lib/professionalStore';
import {localHelperStore} from '../lib/helperStore';
import SellerPortal from './SellerPortal';
import './portal.css';

export default function SampleOwnerApp(){
  const [run,setRun]=useState(0),[state,setState]=useState<{id:string;store:PortalStore;kv:ReturnType<typeof memoryKV>}|null>(null),[error,setError]=useState('');
  useEffect(()=>{let live=true;setState(null);setError('');const kv=memoryKV();
    void seedSample(kv).then(({id,owner})=>{if(live)setState({id,store:owner,kv});}).catch(e=>{if(live)setError((e as Error).message);});
    return()=>{live=false;};},[run]);
  const room=useMemo(()=>state?localDataRoomStore({kind:'public'},{kv:state.kv,bytes:memoryBytes()}):undefined,[state]);
  const pros=useMemo(()=>state?localProfessionalStore({party:{kind:'seller',email:OWNER.email,name:OWNER.name},kv:state.kv,portalBytes:memoryBytes(),txBytes:memoryBytes()}):undefined,[state]);
  const helpers=useMemo(()=>state?localHelperStore({owner:{side:'seller',name:OWNER.name,email:OWNER.email},kv:state.kv,bytes:memoryBytes()}):undefined,[state]);
  return <div className="portal-page">
    <header className="portal-topbar"><span className="portal-brand">kalling<span>.</span></span><span className="portal-secure"><Lock size={13}/>Private owner portal</span><button className="text-link" onClick={()=>setRun(n=>n+1)}><RotateCcw size={14}/>Start over</button></header>
    <p className="portal-sample-note" role="note">Sample portal for a fictional business, Russo Heating &amp; Air. Nothing here is saved; tap Start over to reset.</p>
    {error?<div className="portal-gate"><p className="error-banner" role="alert">{error}</p></div>
      :state?<SellerPortal key={state.id} store={state.store} portalId={state.id} room={room} pros={pros} helpers={helpers}/>
      :<div className="portal-gate"><Loader2 className="spin"/></div>}
  </div>;
}
