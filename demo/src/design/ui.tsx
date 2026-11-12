// Small shared components for the advisor workspace and owner portal. Styles live in design/ui.css.
import {useId,useState,type ReactNode,type ButtonHTMLAttributes,type AnchorHTMLAttributes} from 'react';
import './ui.css';

export function Arrow({size=12}:{size?:number}){return <svg className="k-arrow" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 9 9 3M4.2 3H9v4.8" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>;}

type Tone='purple'|'green'|'peri'|'plain'|'dark'|'warn';
export function Button({tone='plain',arrow,children,className='',...rest}:ButtonHTMLAttributes<HTMLButtonElement>&{tone?:'primary'|'plain'|'quiet';arrow?:boolean}){
  return <button {...rest} className={`k-btn k-btn-${tone} ${className}`}>{children}{arrow&&<Arrow/>}</button>;
}
export function PillLink({children,arrow=true,tone='plain',className='',...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{arrow?:boolean;tone?:'primary'|'plain'}){
  return <a {...rest} className={`k-btn k-btn-${tone} ${className}`}>{children}{arrow&&<Arrow/>}</a>;
}
export function StatusPill({tone='plain',children}:{tone?:Tone;children:ReactNode}){return <span className={'k-pill k-pill-'+tone}>{children}</span>;}
export function Figure({value,label,tone,small}:{value:ReactNode;label:ReactNode;tone?:Tone;small?:boolean}){
  return <div className={'k-fig'+(tone?' k-fig-'+tone:'')+(small?' k-fig-s':'')}><span className="k-fig-n">{value}</span><span className="k-fig-l">{label}</span></div>;
}
export function Panel({tone,title,action,children,className=''}:{tone?:'purple'|'green'|'peri'|'black';title?:ReactNode;action?:ReactNode;children:ReactNode;className?:string}){
  return <section className={'k-panel'+(tone?' k-panel-'+tone:'')+' '+className}>{(title||action)&&<header className="k-panel-head">{title&&<h2>{title}</h2>}{action}</header>}{children}</section>;
}
export function KeylineList({children,className=''}:{children:ReactNode;className?:string}){return <ul className={'k-keylines '+className}>{children}</ul>;}
export function Accordion({summary,children,open:initial=false,id}:{summary:ReactNode;children:ReactNode;open?:boolean;id?:string}){
  const [open,setOpen]=useState(initial),auto=useId(),pid=(id||auto)+'-panel';
  return <div className={'k-acc'+(open?' open':'')}><button type="button" className="k-acc-sum" aria-expanded={open} aria-controls={pid} onClick={()=>setOpen(o=>!o)}>{summary}<span className="k-acc-icon" aria-hidden="true"/></button><div id={pid} className="k-acc-body" hidden={!open}>{children}</div></div>;
}
export function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="k-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
/** Keyboard reachable tabs. Arrow keys move between tabs. */
export function Tabs({tabs,current,onChange,label}:{tabs:{id:string;label?:string;count?:number}[];current:string;onChange:(id:string)=>void;label:string}){
  const key=(e:React.KeyboardEvent,i:number)=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!d)return;e.preventDefault();const n=tabs[(i+d+tabs.length)%tabs.length];onChange(n.id);(e.currentTarget.parentElement?.children[(i+d+tabs.length)%tabs.length] as HTMLElement)?.focus();};
  return <div className="k-tabs" role="tablist" aria-label={label}>{tabs.map((t,i)=><button key={t.id} role="tab" type="button" aria-selected={current===t.id} tabIndex={current===t.id?0:-1} onKeyDown={e=>key(e,i)} onClick={()=>onChange(t.id)}>{t.label||t.id}{t.count?<em aria-label={t.count+' need action'}>{t.count}</em>:null}</button>)}</div>;
}
export function EmptyState({title,children,action}:{title:string;children?:ReactNode;action?:ReactNode}){return <div className="k-empty"><h3>{title}</h3>{children&&<p>{children}</p>}{action}</div>;}
/** Segments: done in green, sent in periwinkle, the rest waiting. */
export function ProgressBar({done,sent=0,total,label}:{done:number;sent?:number;total:number;label:string}){
  const pct=(n:number)=>total?Math.round(n/total*100):0;
  return <div className="k-progress" role="img" aria-label={`${label}: ${done} of ${total} complete${sent?`, ${sent} sent for review`:''}`}><span className="k-progress-done" style={{width:pct(done)+'%'}}/><span className="k-progress-sent" style={{width:pct(sent)+'%'}}/></div>;
}
export function Avatar({name,size=32}:{name:string;size?:number}){const i=name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase()||'?';return <span className="k-avatar" style={{width:size,height:size,fontSize:size*.38}} aria-hidden="true">{i}</span>;}
export function Toast({children}:{children:ReactNode}){return children?<div className="k-toast" role="status" aria-live="polite">{children}</div>:null;}
