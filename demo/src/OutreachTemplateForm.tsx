import {useState,type FormEvent} from 'react';
import {Mail} from 'lucide-react';
import {outreachTemplates,type OutreachPreparation,type OutreachTemplateId} from '../lib/outreachTemplates';
import type {FactSnapshot} from '../lib/researchFlow';

export default function OutreachTemplateForm(p:{companyName:string;owner:string;sender:string;facts:FactSnapshot[];locked:boolean;hasDraft:boolean;onPrepare:(input:OutreachPreparation)=>Promise<void>}){
 const [templateId,setTemplateId]=useState<OutreachTemplateId>(p.owner?'acquisition-inquiry':'owner-introduction');
 const [factId,setFactId]=useState(p.facts.find(f=>f.topic==='service_mix')?.id||p.facts[0]?.id||'');
 const fact=p.facts.find(f=>f.id===factId);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const values=new FormData(e.currentTarget);await p.onPrepare({templateId,factId,senderName:String(values.get('senderName')),addressee:String(values.get('addressee')),rationale:String(values.get('rationale')),channel:values.get('channel') as 'Email'|'Letter'});}
 return <details className="panel flow-template" open={!p.hasDraft}><summary>{p.hasDraft?'Prepare a replacement from a formal template':'Prepare acquisition correspondence'}</summary><form className="flow-form" onSubmit={e=>void submit(e)}>
  <div className="flow-two-col"><label className="field"><span>Correspondence template</span><select value={templateId} disabled={p.locked} onChange={e=>setTemplateId(e.target.value as OutreachTemplateId)}>{outreachTemplates.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select><small>{outreachTemplates.find(t=>t.id===templateId)?.description}</small></label><label className="field"><span>Channel</span><select name="channel" disabled={p.locked}><option>Email</option><option>Letter</option></select></label></div>
  <div className="flow-two-col"><label className="field"><span>Sender name</span><input name="senderName" defaultValue={p.sender.includes('@')?'':p.sender} required maxLength={180} disabled={p.locked} placeholder="Full professional name"/></label><label className="field"><span>Salutation · Dear …</span><input name="addressee" defaultValue={p.owner||p.companyName+' Management Team'} required maxLength={180} disabled={p.locked}/><small>Confirm the recipient’s name. No title or ownership status is inferred.</small></label></div>
  <label className="field"><span>Source supporting the reason for this inquiry</span><select value={factId} disabled={p.locked} required onChange={e=>setFactId(e.target.value)}>{p.facts.map(f=><option key={f.id} value={f.id}>{f.topic.replaceAll('_',' ')} · {f.value.slice(0,160)}</option>)}</select></label>
  {fact&&<div className="flow-template-source"><blockquote>“{fact.quote}”</blockquote><p>{/^https:\/\//.test(fact.source)?<a href={fact.source} target="_blank" rel="noreferrer">{fact.source}</a>:fact.source}</p><small>Checked by {fact.checkedBy} · {fact.locator}</small></div>}
  <label className="field"><span>Reason for contacting this company</span><textarea name="rationale" rows={3} minLength={20} maxLength={500} required disabled={p.locked} placeholder="Write one or two sentences connecting a verified company activity to your acquisition interest."/><small>This sentence will appear in the letter. Check it against the selected source; use specific business terms and avoid unsupported praise.</small></label>
  <p className="flow-footnote">Original acquisition templates. The source excerpt stays in the review record. Confirm the recipient and review the complete draft before use.</p>
  <button className="btn primary" disabled={p.locked||!fact}><Mail size={15}/>{p.hasDraft?'Prepare replacement draft':'Prepare formal draft'}</button>
 </form></details>;
}
