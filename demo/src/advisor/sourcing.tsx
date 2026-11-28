// Only fictional licenses are loaded here. The hosted store records decisions, not prospect records.
import {useEffect,useMemo,useState} from 'react';
import {rankProspects,parseLicenseList,importRecords,emptySourcing,draftLetter,sourcingSummary,type SourcingState,type Prospect,type ProspectStatus,type Tier} from '../../lib/sourcing';
import {sampleLicenseFile} from '../../lib/sourcingSample';
import {localSourcingStore,type SourcingDecisionStore} from '../../lib/sourcingStore';
import {regions,type Region} from '../../lib/brokerage';
import {Button,StatusPill,Panel,EmptyState,Field} from '../design/ui';

const tone=(t:Tier)=>t==='Contact first'?'green':t==='Worth a letter'?'peri':'plain';
const njRegions=regions.filter(r=>/Jersey/.test(r));

export function SourcingPanel({actor,hostedStore,canApprove}:{actor:string;hostedStore?:SourcingDecisionStore;canApprove:boolean}){
  const store=useMemo(()=>hostedStore??localSourcingStore(actor),[hostedStore,actor]);
  const hosted=store.mode==='cloud';
  const [s,setS]=useState<SourcingState>(emptySourcing),[region,setRegion]=useState<Region|''>(''),[shown,setShown]=useState(10);
  const [open,setOpen]=useState(''),[draft,setDraft]=useState(''),[contact,setContact]=useState(''),[err,setErr]=useState(''),[msg,setMsg]=useState('');
  const [loadState,setLoadState]=useState<'loading'|'ready'|'failed'>('loading'),[loadAttempt,setLoadAttempt]=useState(0),[busy,setBusy]=useState(false);
  const today=new Date().toISOString().slice(0,10);
  const ranked=useMemo(()=>rankProspects(s,today,{region}),[s,today,region]),sum=sourcingSummary(s,ranked);

  useEffect(()=>{
    let active=true;
    setLoadState('loading');setErr('');
    void store.list().then(decisions=>{
      if(!active)return;
      setS(latest=>({...latest,...decisions}));setLoadState('ready');
    }).catch((error:Error)=>{
      if(!active)return;
      setErr(error.message);setLoadState('failed');
    });
    return ()=>{active=false;};
  },[store,loadAttempt]);

  function loadSample(){
    const {records}=parseLicenseList(sampleLicenseFile());
    setS(latest=>importRecords(latest,records,'Fictional sample list'));
    setMsg(`Loaded ${records.length} fictional licensees.`);setErr('');
  }

  async function refreshDecisions(){
    const snapshot=await store.list();
    setS(latest=>({...latest,...snapshot}));
    return snapshot;
  }

  async function startLetter(p:Prospect){
    const license=p.record.licenseNo;
    setBusy(true);setErr('');setMsg('');
    try{
      const current=hosted?(await refreshDecisions()).decisions[license]:p.decision;
      if(current?.status==='Do not contact')throw Error('This owner is marked do not contact.');
      if(current&&current.status!=='New'&&current.status!=='Letter drafted')throw Error('This letter has already moved to the next step.');
      setOpen(license);
      setDraft(current?.letter||draftLetter(p,{name:actor,firm:'Kalling',email:contact}));
    }catch(error){setErr((error as Error).message);}
    finally{setBusy(false);}
  }

  async function decide(p:Prospect,status:ProspectStatus,letter?:string){
    const {licenseNo,name}=p.record;
    setBusy(true);setErr('');setMsg('');
    try{
      const saved=await store.decide(licenseNo,{status,letter});
      setS(latest=>({...latest,decisions:{...latest.decisions,[licenseNo]:saved},
        doNotContact:saved.status==='Do not contact'?[...new Set([...latest.doNotContact,licenseNo])]:latest.doNotContact}));
      setOpen(current=>current===licenseNo?'':current);
      if(status==='Letter approved')setMsg(`Saved. Letter to ${name} approved by ${saved.approvedBy}. Print and mail it, then mark it mailed.`);
      else if(status==='Do not contact')setMsg(hosted?`Saved. ${name} is marked do not contact and will stay off future lists.`:
        `Saved. ${name} is marked do not contact and hidden from this list until you leave this page.`);
      else setMsg(`Saved. ${name}: ${status.toLowerCase()}.`);
    }catch(error){
      setErr((error as Error).message);
      // Refresh the status after another advisor's decision, keeping a draft that is still editable.
      if(hosted){
        try{
          const latest=(await refreshDecisions()).decisions[licenseNo];
          if(latest&&latest.status!=='New'&&latest.status!=='Letter drafted')setOpen(current=>current===licenseNo?'':current);
        }catch{/* The save error is the actionable message. */}
      }
    }finally{setBusy(false);}
  }

  async function copy(p:Prospect){
    setBusy(true);setErr('');setMsg('');
    try{
      const current=hosted?(await refreshDecisions()).decisions[p.record.licenseNo]:p.decision;
      if(current?.status!=='Letter approved'||!current.letter)throw Error('This letter is no longer available to copy.');
      if(!navigator.clipboard)throw Error('Copy did not work in this browser.');
      await navigator.clipboard.writeText(current.letter).catch(()=>{throw Error('Copy did not work in this browser.');});
      setMsg('Letter copied.');
    }catch(error){setErr((error as Error).message);}
    finally{setBusy(false);}
  }

  return <Panel title="Find owners likely to sell">
    <div className="src">
      <p className="adv-muted">The fictional sample ranks New Jersey master HVACR contractors by years licensed, other license holders at the same address, and location. A firm owner or admin approves each letter. Your team mails approved letters by hand.</p>
      <p className="adv-muted">{hosted?'Decisions are saved for your firm. Owners marked do not contact stay off future lists.':'In this demo, decisions are kept until you leave this page or reload.'}</p>
      {err&&<p className="error-banner" role="alert">{err}</p>}{msg&&<p className="src-ok" role="status">{msg}</p>}
      {loadState==='loading'&&<p role="status">Loading sourcing decisions…</p>}
      {loadState==='failed'&&<Button onClick={()=>setLoadAttempt(n=>n+1)}>Try again</Button>}
      {loadState==='ready'&&<div className="src-load">
        <Button disabled={busy} onClick={loadSample}>{s.records.length?'Reload fictional sample':'Load fictional sample'}</Button>
      </div>}
      {loadState==='ready'&&(!s.records.length?<EmptyState title="No list loaded">Load the fictional sample to see how ranking works.</EmptyState>:<>
        <div className="src-bar">
          <p><strong>{sum.ranked.toLocaleString()}</strong> owners to consider from {s.source}, <strong>{sum.first}</strong> to contact first. {sum.approved} letter{sum.approved===1?'':'s'} approved, {sum.mailed} mailed, {sum.replied} replied, {sum.doNotContact} not to contact.</p>
          <Field label="Region"><select value={region} onChange={e=>{setRegion(e.target.value as Region|'');setShown(10);}}><option value="">All of New Jersey</option>{njRegions.map(r=><option key={r}>{r}</option>)}</select></Field>
          <Field label="Your phone or email, for letters"><input value={contact} onChange={e=>setContact(e.target.value)} placeholder="you@example.com"/></Field>
        </div>
        <ol className="src-list">{ranked.slice(0,shown).map(p=>{const d=p.decision,no=p.record.licenseNo;return <li key={no}>
          <div className="src-head"><div><strong>{p.record.name}</strong><small>{[p.record.city,p.record.county&&p.record.county+' County'].filter(Boolean).join(', ')}. License {no}</small></div>
            <div className="src-pills"><StatusPill tone={tone(p.tier)}>{p.tier}</StatusPill>{d&&<StatusPill tone={d.status==='Mailed'||d.status==='Replied'?'green':'plain'}>{d.status}</StatusPill>}</div></div>
          <p className="src-why">{p.reason}</p>
          {open!==no&&<div className="adv-buttons">
            {(!d||d.status==='New'||d.status==='Letter drafted')&&<Button tone="primary" disabled={busy} onClick={()=>void startLetter(p)}>{d?.letter?'Edit letter':'Draft letter'}</Button>}
            {d?.status==='Letter approved'&&<><Button disabled={busy} onClick={()=>void copy(p)}>Copy letter</Button>{canApprove&&<Button tone="primary" disabled={busy} onClick={()=>void decide(p,'Mailed')}>Mark mailed</Button>}</>}
            {d?.status==='Mailed'&&<><Button disabled={busy} onClick={()=>void decide(p,'Replied')}>They replied</Button><Button tone="quiet" disabled={busy} onClick={()=>void decide(p,'Not interested')}>Not interested</Button></>}
            <Button tone="quiet" disabled={busy} onClick={()=>void decide(p,'Do not contact')}>Do not contact</Button></div>}
          {open===no&&<div className="src-letter">
            <Field label={`Letter to ${p.record.name}`} hint="Drafted from the license record. A firm owner or admin approves it before it can be marked mailed."><textarea rows={14} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/></Field>
            <div className="adv-buttons">
              {canApprove&&<Button tone="primary" disabled={busy||!draft.trim()} onClick={()=>void decide(p,'Letter approved',draft)}>{hosted?'Approve letter':`Approve as ${actor}`}</Button>}
              <Button disabled={busy} onClick={()=>void decide(p,'Letter drafted',draft)}>Save draft</Button>
              <Button tone="quiet" disabled={busy} onClick={()=>setOpen('')}>Cancel</Button></div>
          </div>}
          {d?.status==='Replied'&&<p className="adv-muted">Add them as an inquiry once you have their email, so the engagement starts from Sellers.</p>}
        </li>;})}</ol>
        {ranked.length>shown&&<Button tone="quiet" onClick={()=>setShown(n=>n+20)}>Show {Math.min(20,ranked.length-shown)} more</Button>}
      </>)}
    </div>
  </Panel>;
}
