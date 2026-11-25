// The top of the owner's portal on a phone: where the sale is, and the one thing to do next.
import {ArrowRight,Check} from 'lucide-react';
import {saleStages,saleStage,nextAction} from '../lib/ownerHome';
import type {PortalBundle} from '../lib/portal';
import type {Transaction} from '../lib/transactions';

export default function OwnerHome({b,txs,go}:{b:PortalBundle;txs:Pick<Transaction,'state'>[];go:(target:string)=>void}){
  const at=saleStage(b,txs),next=nextAction(b,txs),stage=saleStages[at],fit=Math.max(0,Math.floor(Number(b.saleReady?.[0]?.input.buyerFit?.total)||0));
  return <section className="oh" aria-label="Where your sale is">
    <ol className="oh-track" aria-label={'Step '+(at+1)+' of '+saleStages.length+': '+stage.label}>
      {saleStages.map((s,i)=><li key={s.key} className={i<at?'done':i===at?'now':''} aria-current={i===at?'step':undefined}>
        <span className="oh-dot">{i<at?<Check size={11} strokeWidth={3}/>:null}</span><span className="oh-label">{s.label}</span></li>)}
    </ol>
    <p className="oh-now"><strong>{stage.label}</strong>, step {at+1} of {saleStages.length}. {stage.now}</p>
    {fit>0&&at<2&&<p className="oh-fit"><strong>{fit}</strong> {fit===1?'buyer':'buyers'} in our directory already {fit===1?'fits':'fit'} your business. <button type="button" className="text-link" onClick={()=>go('portal-sale-ready')}>See who</button></p>}
    <div className={'oh-next'+(next.yours?'':' quiet')}>
      <p className="oh-kicker">{next.yours?'Your next step':'Up to date'}</p>
      <h2>{next.title}</h2>
      <p>{next.why}</p>
      <button type="button" className={next.yours?'btn primary':'btn'} onClick={()=>go(next.target)}>{next.button}<ArrowRight size={16}/></button>
    </div>
  </section>;
}
