// Find owners likely to sell. First cut: the fictional sample list only, held in this page's memory.
// Nothing is saved in the browser, so nothing can leak between people sharing a computer or be lost
// between tabs; reloading starts over. Real license data and saved decisions come with database storage.
// Nothing is sent: the advisor approves each letter, mails it by hand, and records what happened.
import {useMemo,useState} from 'react';
import {rankProspects,parseLicenseList,importRecords,emptySourcing,draftLetter,setDecision,sourcingSummary,type SourcingState,type Prospect,type ProspectStatus,type Tier} from '../../lib/sourcing';
import {sampleLicenseFile} from '../../lib/sourcingSample';
import {regions,type Region} from '../../lib/brokerage';
import {Button,StatusPill,Panel,EmptyState,Field} from '../design/ui';

const tone=(t:Tier)=>t==='Contact first'?'green':t==='Worth a letter'?'peri':'plain';
const njRegions=regions.filter(r=>/Jersey/.test(r));

export function SourcingPanel({actor,readOnly}:{actor:string;readOnly:boolean}){
  const [s,setS]=useState<SourcingState>(emptySourcing),[region,setRegion]=useState<Region|''>(''),[shown,setShown]=useState(10);
  const [open,setOpen]=useState(''),[draft,setDraft]=useState(''),[contact,setContact]=useState(''),[err,setErr]=useState(''),[msg,setMsg]=useState('');
  const today=new Date().toISOString().slice(0,10);
  const ranked=useMemo(()=>rankProspects(s,today,{region}),[s,today,region]),sum=sourcingSummary(s,ranked);
  const act=(fn:(latest:SourcingState)=>SourcingState,note='')=>{try{const next=fn(s);setS(next);setMsg(note);setErr('');return true;}catch(e){setErr((e as Error).message);setMsg('');return false;}};
  const loadSample=()=>act(latest=>importRecords(latest,parseLicenseList(sampleLicenseFile()).records,'Fictional sample list'),'Loaded 36 fictional licensees.');
  const startLetter=(p:Prospect)=>{setOpen(p.record.licenseNo);setDraft(p.decision?.letter||draftLetter(p,{name:actor,firm:'Kalling',email:contact}));setErr('');setMsg('');};
  const decide=(p:Prospect,status:ProspectStatus,extra:{letter?:string;approvedBy?:string}={})=>act(latest=>setDecision(latest,p.record.licenseNo,{status,...extra}),
    status==='Letter approved'?`Letter to ${p.record.name} approved by ${actor}. Print and mail it, then mark it mailed.`:status==='Do not contact'?`${p.record.name} is marked do not contact and hidden from this list until you leave this page. Saved opt-outs come with database storage.`:`${p.record.name}: ${status.toLowerCase()}.`);
  const copy=(text:string)=>void navigator.clipboard?.writeText(text).then(()=>setMsg('Letter copied.'),()=>setErr('Copy did not work in this browser. Select the text instead.'));

  return <Panel title="Find owners likely to sell">
    <div className="src">
      <p className="adv-muted">Ranked from New Jersey's public list of licensed master HVACR contractors: how long each has held the license, whether anyone else is licensed at the same address, and where they are. Owners licensed for decades are more likely to be planning a handover. Nothing is sent: you approve each letter and mail it yourself. This first version uses a fictional list and saves nothing, so reloading the page starts over. Real license data comes with saved decisions in the database.</p>
      {!readOnly&&<div className="src-load">
        <Button onClick={loadSample}>{s.records.length?'Reload fictional sample':'Load fictional sample'}</Button>
      </div>}
      {err&&<p className="error-banner" role="alert">{err}</p>}{msg&&<p className="src-ok" role="status">{msg}</p>}
      {!s.records.length?<EmptyState title="No list loaded">Load the fictional sample to see how ranking works.</EmptyState>:<>
        <div className="src-bar">
          <p><strong>{sum.ranked.toLocaleString()}</strong> owners to consider from {s.source}, <strong>{sum.first}</strong> to contact first. {sum.approved} letter{sum.approved===1?'':'s'} approved, {sum.mailed} mailed, {sum.replied} replied, {sum.doNotContact} not to contact.</p>
          <Field label="Region"><select value={region} onChange={e=>{setRegion(e.target.value as Region|'');setShown(10);}}><option value="">All of New Jersey</option>{njRegions.map(r=><option key={r}>{r}</option>)}</select></Field>
          <Field label="Your phone or email, for letters"><input value={contact} onChange={e=>setContact(e.target.value)} placeholder="you@example.com" disabled={readOnly}/></Field>
        </div>
        <ol className="src-list">{ranked.slice(0,shown).map(p=>{const d=p.decision,no=p.record.licenseNo;return <li key={no}>
          <div className="src-head"><div><strong>{p.record.name}</strong><small>{[p.record.city,p.record.county&&p.record.county+' County'].filter(Boolean).join(', ')}. License {no}</small></div>
            <div className="src-pills"><StatusPill tone={tone(p.tier)}>{p.tier}</StatusPill>{d&&<StatusPill tone={d.status==='Mailed'||d.status==='Replied'?'green':'plain'}>{d.status}</StatusPill>}</div></div>
          <p className="src-why">{p.reason}</p>
          {!readOnly&&open!==no&&<div className="adv-buttons">
            {(!d||d.status==='New'||d.status==='Letter drafted')&&<Button tone="primary" onClick={()=>startLetter(p)}>{d?.letter?'Edit letter':'Draft letter'}</Button>}
            {d?.status==='Letter approved'&&<><Button onClick={()=>copy(d.letter||'')}>Copy letter</Button><Button tone="primary" onClick={()=>decide(p,'Mailed')}>Mark mailed</Button></>}
            {d?.status==='Mailed'&&<><Button onClick={()=>decide(p,'Replied')}>They replied</Button><Button tone="quiet" onClick={()=>decide(p,'Not interested')}>Not interested</Button></>}
            <Button tone="quiet" onClick={()=>decide(p,'Do not contact')}>Do not contact</Button></div>}
          {open===no&&<div className="src-letter">
            <Field label={`Letter to ${p.record.name}`} hint="Built only from the public license record. Edit freely; you approve it before it can be marked mailed."><textarea rows={14} value={draft} onChange={e=>setDraft(e.target.value)}/></Field>
            <div className="adv-buttons">
              <Button tone="primary" disabled={draft.trim().length<40} onClick={()=>{if(decide(p,'Letter approved',{letter:draft,approvedBy:actor}))setOpen('');}}>Approve as {actor}</Button>
              <Button onClick={()=>{if(decide(p,'Letter drafted',{letter:draft}))setOpen('');}}>Save draft</Button>
              <Button tone="quiet" onClick={()=>setOpen('')}>Cancel</Button></div>
          </div>}
          {d?.status==='Replied'&&<p className="adv-muted">Add them as an inquiry once you have their email, so the engagement starts from Sellers.</p>}
        </li>;})}</ol>
        {ranked.length>shown&&<Button tone="quiet" onClick={()=>setShown(n=>n+20)}>Show {Math.min(20,ranked.length-shown)} more</Button>}
      </>}
    </div>
  </Panel>;
}
