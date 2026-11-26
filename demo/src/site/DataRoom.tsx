// Buyer side of the data room: the folder list on a listing, and a watermarked read-only viewer.
// Opening a document writes the log row first; the viewer then reports which pages were read and for how long.
import {useCallback,useEffect,useRef,useState,type KeyboardEvent as KE} from 'react';
import type {DataRoomStore,BuyerRoom,Opened} from '../../lib/dataRoomStore';
import {folders} from '../../lib/dataRoom';
import {LOCAL_BROKER_KEY} from '../../lib/brokerStore';
import {watermarkPdf} from '../../lib/pdf';
import {csvTable} from '../../lib/accounting';
import {extractText,xlsxPages} from '../../lib/extract';
import type {Question} from '../../lib/brokerage';
import {AskRoom} from '../AskRoom';

const isPdf=(m:string,n='')=>m==='application/pdf'||/\.pdf$/i.test(n);
const isSheet=(m:string,n:string)=>/csv|spreadsheet|excel/.test(m)||/\.(csv|xlsx)$/i.test(n);
const isCsv=(m:string,n:string)=>m.includes('csv')||/\.csv$/i.test(n);
const isImage=(m:string)=>/^image\//.test(m);

export function BuyerDataRoom({room,listingId,questions,onAsked,askAdvisor}:{room:DataRoomStore;listingId:string;questions:Question[];onAsked:()=>void;askAdvisor:(question:string)=>Promise<void>}){
  const [r,setR]=useState<BuyerRoom|null>(null),[open,setOpen]=useState<{doc:Opened;page?:number}|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState('');
  const [searchAccess,setSearchAccess]=useState<BuyerRoom|null>(null);
  const opener=useRef<HTMLElement|null>(null);
  // Revalidate the viewer and displayed quotes when room access changes.
  useEffect(()=>{let live=true,checking=false;
    const check=async(visibleOnly=true)=>{if(checking||(visibleOnly&&document.visibilityState==='hidden'))return;checking=true;try{
      const next=await room.buyerRoom(listingId);if(!live)return;
      setSearchAccess(next);
      if(!visibleOnly||open)setR(next);
      if(open&&!next.items.some(i=>i.id===open.doc.item.id&&i.open)){setOpen(null);setErr('Access to this document has changed. Ask your advisor before opening it again.');requestAnimationFrame(()=>opener.current?.focus());}
    }catch{if(live){setSearchAccess(null);if(!visibleOnly||open)setR({tier:0,items:[]});if(open){setOpen(null);setErr('Document access could not be confirmed. Reopen it when connected.');}}}finally{checking=false;}};
    void check(false);
    const timer=setInterval(()=>void check(),15000),focus=()=>void check();
    const storage=(e:StorageEvent)=>{if(room.mode==='local'&&(e.key===LOCAL_BROKER_KEY||e.key===null))void check();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);window.addEventListener('storage',storage);
    return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);window.removeEventListener('storage',storage);};
  },[open,room,listingId]);
  if(!r||!r.tier||!r.items.length)return err?<section className="ks-dr"><p className="ks-error" role="alert">{err}</p></section>:null;
  async function view(id:string,el:HTMLElement,page?:number){setBusy(id);setErr('');opener.current=el;try{setOpen({doc:await room.open(id),page});}catch(e){setErr((e as Error).message);}finally{setBusy('');}}
  const names=Object.fromEntries(r.items.map(i=>[i.id,i.displayName]));
  return <section className="ks-dr" aria-labelledby="ks-dr-h"><h2 id="ks-dr-h">Data room</h2>
    <p className="ks-fine">Documents the owner approved for buyers under NDA. Every page shows your name and email. Opening a document is recorded so the advisor and owner know which documents were read.</p>
    {!!searchAccess?.tier&&<AskRoom key={searchAccess.revision} search={question=>room.search(listingId,question)}
      askAdvisor={async question=>{await askAdvisor(question);onAsked();}} buttonClass="ks-btn"
      opening={!!busy} open={(result,button)=>void view(result.itemId,button,result.page)}/>}
    {folders.filter(f=>r.items.some(i=>i.folder===f)).map(f=><div key={f} className="ks-dr-folder"><h3>{f}</h3><ul>{r.items.filter(i=>i.folder===f).map(i=><li key={i.id}>
      <span><strong>{i.displayName}</strong><small>{i.open?(i.allowDownload&&isPdf(i.mime)?'View or download a stamped copy':'View only'):'Opens after a signed letter of intent'}{i.note?`. ${i.note}`:''}</small></span>
      {i.open?<button className="ks-btn" disabled={!!busy} onClick={e=>void view(i.id,e.currentTarget)}>{busy===i.id?'Opening…':'Open'}</button>:<span className="ks-dr-lock">After LOI</span>}
    </li>)}</ul></div>)}
    {err&&<p className="ks-error" role="alert">{err}</p>}
    {questions.some(q=>q.itemId)&&<div className="ks-dr-qs"><h3>Your questions about documents</h3>{questions.filter(q=>q.itemId).map(q=><p key={q.id} className={'ks-q '+q.side}>{q.body}<small>{names[q.itemId!]||'A document'}, page {q.page}</small></p>)}</div>}
    {open&&<Viewer key={open.doc.ticket} room={room} doc={open.doc} initialPage={open.page} onClose={()=>{setOpen(null);requestAnimationFrame(()=>opener.current?.focus());}} onAsked={onAsked}/>}
  </section>;
}

function Viewer({room,doc,initialPage,onClose,onAsked}:{room:DataRoomStore;doc:Opened;initialPage?:number;onClose:()=>void;onAsked:()=>void}){
  const {item,watermark}=doc,box=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const [page,setPage]=useState(1),[pages,setPages]=useState(1),[zoom,setZoom]=useState(1),[pdf,setPdf]=useState<{getPage(n:number):Promise<{getViewport(o:{scale:number}):{width:number;height:number};render(o:{canvasContext:CanvasRenderingContext2D;viewport:unknown}):{promise:Promise<void>}}>}|null>(null);
  const [table,setTable]=useState<{name:string;rows:string[][]}[]|null>(null),[img,setImg]=useState(''),[err,setErr]=useState(''),[note,setNote]=useState(''),[q,setQ]=useState('');
  const [textPages,setTextPages]=useState<{page:number;text:string}[]|null>(null);
  // Page timing: one event per page visit, sent in small batches.
  const started=useRef<number|null>(null),queue=useRef<{page:number;seconds:number}[]>([]),pageRef=useRef(1);
  const flush=useCallback(()=>{const ev=queue.current.splice(0,50);if(ev.length)void room.logPages(doc.ticket,ev).catch(()=>{});},[room,doc.ticket]);
  const mark=useCallback(()=>{if(started.current===null)return;const s=Math.round((Date.now()-started.current)/1000);if(s>=1)queue.current.push({page:pageRef.current,seconds:Math.min(600,s)});started.current=Date.now();},[]);
  useEffect(()=>{const t=setInterval(()=>{mark();flush();},15000);return()=>{clearInterval(t);mark();flush();};},[mark,flush]);
  const go=(n:number)=>{const next=Math.min(pages,Math.max(1,n));if(next===pageRef.current)return;mark();pageRef.current=next;setPage(next);};
  useEffect(()=>{box.current?.focus();},[]);
  useEffect(()=>{let live=true;
    const start=(count:number)=>{const first=Math.max(1,Math.min(initialPage??1,count));pageRef.current=first;started.current=Date.now();setPage(first);setPages(count);};
    const showText=async()=>{
      const extracted=await extractText(item.id,new Uint8Array(await doc.blob.arrayBuffer()),item.fileName,item.mime);
      if(!live)return;
      if(extracted.status!=='ok'||!extracted.pages.length)throw Error('No readable text');
      start(extracted.pages.length);setTextPages(extracted.pages);
    };
    void (async()=>{try{
    if(isPdf(item.mime,item.fileName)){const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',document.baseURI).href;const d=await pdfjs.getDocument({data:new Uint8Array(await doc.blob.arrayBuffer())}).promise;if(!live)return;start(d.numPages);setPdf(d as never);}
    // Hosted CSV citations use the same page breaks as the stored text extraction.
    else if(room.mode==='cloud'&&initialPage!==undefined&&isCsv(item.mime,item.fileName)){await showText();}
    else if(isSheet(item.mime,item.fileName)){const xlsx=/\.xlsx$/i.test(item.fileName)||/spreadsheetml/.test(item.mime);
      const sheets=xlsx?xlsxPages(new Uint8Array(await doc.blob.arrayBuffer())).map(p=>{const [h,...rest]=p.text.split('\n');return {name:h.replace(/^Sheet: /,''),rows:rest.map(l=>l.split('\t'))};})
        :[] as {name:string;rows:string[][]}[];
      if(!xlsx){const t=csvTable(await doc.blob.text());sheets.push({name:item.displayName,rows:[t.headers,...t.rows]});}
      if(!live)return;start(sheets.length);setTable(sheets);}
    else if(isImage(item.mime)){start(1);setImg(URL.createObjectURL(doc.blob));}
    else if(/\.(txt|docx)$/i.test(item.fileName)||item.mime.startsWith('text/')){await showText();}
    else setErr('This file type can’t be shown here. Ask the advisor for a PDF copy.');
  }catch{if(live)setErr('This document could not be displayed. Ask the advisor for a new copy.');}})();return()=>{live=false;};},[doc,initialPage,item,room.mode]);
  useEffect(()=>()=>{if(img)URL.revokeObjectURL(img);},[img]);
  useEffect(()=>{if(!pdf||!canvas.current)return;let live=true;void (async()=>{const p=await pdf.getPage(page);if(!live||!canvas.current)return;
    const fit=Math.min(900,(box.current?.clientWidth||900)-24)/p.getViewport({scale:1}).width,dpr=Math.min(2,window.devicePixelRatio||1);
    const vp=p.getViewport({scale:fit*zoom*dpr}),c=canvas.current,ctx=c.getContext('2d')!;c.width=vp.width;c.height=vp.height;c.style.width=`${vp.width/dpr}px`;
    await p.render({canvasContext:ctx,viewport:vp}).promise;if(!live)return;
    // The watermark is drawn into the page pixels too, so a screenshot of the page carries it.
    ctx.save();ctx.globalAlpha=.16;ctx.fillStyle='#2a2650';ctx.font=`${Math.round(vp.width/42)}px system-ui, sans-serif`;ctx.translate(vp.width/2,vp.height/2);ctx.rotate(-Math.PI/7);
    for(let y=-vp.height;y<vp.height;y+=vp.width/6)ctx.fillText(watermark,-ctx.measureText(watermark).width/2,y);ctx.restore();})();return()=>{live=false;};},[pdf,page,zoom,watermark]);
  async function download(){setNote('');try{const out=await room.open(item.id,'downloaded');const bytes=await watermarkPdf(await out.blob.arrayBuffer(),out.watermark);
    const u=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'})),a=document.createElement('a');a.href=u;a.download=item.displayName.replace(/[^\w .-]+/g,'')+' (stamped).pdf';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);setNote('Downloaded a copy stamped with your name.');}catch(e){setNote((e as Error).message);}}
  async function ask(){try{await room.ask(item.id,page,q);setQ('');setNote(`Question sent about page ${page}. The answer appears on this listing.`);onAsked();}catch(e){setNote((e as Error).message);}}
  const key=(e:KE)=>{if((e.target as HTMLElement).closest('textarea,input'))return;
    if(e.key==='Escape'){e.preventDefault();onClose();}else if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();go(page+1);}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();go(page-1);}
    else if(e.key==='Home'){e.preventDefault();go(1);}else if(e.key==='End'){e.preventDefault();go(pages);}else if(e.key==='+'||e.key==='='){setZoom(z=>Math.min(2.5,z+.25));}else if(e.key==='-'){setZoom(z=>Math.max(.5,z-.25));}};
  const unit=table?'Sheet':'Page';
  return <div className="ks-viewer" role="dialog" aria-modal="true" aria-labelledby="ks-viewer-title" onKeyDown={key}>
    <div className="ks-viewer-bar">
      <h2 id="ks-viewer-title">{item.displayName}</h2>
      <div className="ks-viewer-tools" role="toolbar" aria-label="Document controls">
        {pages>1&&<><button className="ks-btn" onClick={()=>go(page-1)} disabled={page<=1} aria-label={`Previous ${unit.toLowerCase()}`}>‹</button><span aria-live="polite" className="ks-viewer-page">{unit} {page} of {pages}</span><button className="ks-btn" onClick={()=>go(page+1)} disabled={page>=pages} aria-label={`Next ${unit.toLowerCase()}`}>›</button></>}
        {pdf&&<><button className="ks-btn" onClick={()=>setZoom(z=>Math.max(.5,z-.25))} aria-label="Zoom out">−</button><button className="ks-btn" onClick={()=>setZoom(z=>Math.min(2.5,z+.25))} aria-label="Zoom in">+</button></>}
        {item.allowDownload&&isPdf(item.mime,item.fileName)&&<button className="ks-btn" onClick={()=>void download()}>Download stamped copy</button>}
        <button className="ks-btn ks-btn-primary" onClick={onClose}>Close</button>
      </div>
    </div>
    <div className="ks-viewer-body" ref={box} tabIndex={0} aria-label={`${item.displayName}, ${unit.toLowerCase()} ${page}. Use the arrow keys to turn pages, plus and minus to zoom, Escape to close.`}>
      <div className="ks-viewer-page-wrap">
        {pdf&&<canvas ref={canvas} aria-hidden="true"/>}
        {table&&<div className="ks-viewer-table"><table><caption>{table[page-1]?.name}</caption><tbody>{table[page-1]?.rows.slice(0,500).map((r,i)=><tr key={i}>{r.map((c,j)=>i===0?<th key={j} scope="col">{c}</th>:<td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
        {img&&<img src={img} alt={item.displayName}/>}
        {textPages&&<pre className="ks-viewer-text">{textPages[page-1]?.text}</pre>}
        {(table||img||textPages)&&<div className="ks-viewer-mark" aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i}>{watermark}</span>)}</div>}
        {err&&<p className="ks-error" role="alert">{err}</p>}
        {!pdf&&!table&&!img&&!textPages&&!err&&<p className="ks-fine">Loading…</p>}
      </div>
      <p className="ks-viewer-stamp">{watermark}</p>
    </div>
    <form className="ks-viewer-ask" onSubmit={e=>{e.preventDefault();void ask();}}>
      <label className="ks-field"><span>Ask the advisor about {unit.toLowerCase()} {page}</span><textarea rows={1} value={q} onChange={e=>setQ(e.target.value)} maxLength={3000}/></label>
      <button className="ks-btn" disabled={q.trim().length<2}>Send question</button><p className="ks-fine" aria-live="polite">{note}</p>
    </form>
  </div>;
}

export function OpenedHistory({room}:{room:DataRoomStore}){
  const [h,setH]=useState<Awaited<ReturnType<DataRoomStore['history']>>>([]);
  useEffect(()=>{void room.history().then(setH).catch(()=>setH([]));},[room]);
  if(!h.length)return null;
  return <section className="ks-history"><h2>Documents you’ve opened</h2><p className="ks-fine">The advisor and the business owner can see when you open data room documents. The owner sees an anonymous label, not your name.</p>
    <ul>{h.slice(0,50).map((x,i)=><li key={i}><span>{x.document}</span><small>Listing {x.listing}, {new Date(x.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></li>)}</ul></section>;
}
