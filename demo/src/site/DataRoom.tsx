// Buyer side of the data room: the folder list on a listing, and a watermarked read-only viewer.
// Opening a document writes the log row first; the viewer then reports which pages were read and for how long.
import {useCallback,useEffect,useRef,useState,type KeyboardEvent as KE} from 'react';
import type {DataRoomStore,BuyerRoom,Opened} from '../../lib/dataRoomStore';
import {folders} from '../../lib/dataRoom';
import {watermarkPdf} from '../../lib/pdf';
import {csvTable} from '../../lib/accounting';
import {xlsxPages} from '../../lib/extract';
import type {Question} from '../../lib/brokerage';

const isPdf=(m:string)=>m==='application/pdf';
const isSheet=(m:string,n:string)=>/csv|spreadsheet|excel/.test(m)||/\.(csv|xlsx)$/i.test(n);
const isImage=(m:string)=>/^image\//.test(m);

export function BuyerDataRoom({room,listingId,questions,onAsked}:{room:DataRoomStore;listingId:string;questions:Question[];onAsked:()=>void}){
  const [r,setR]=useState<BuyerRoom|null>(null),[open,setOpen]=useState<Opened|null>(null),[err,setErr]=useState(''),[busy,setBusy]=useState('');
  const opener=useRef<HTMLElement|null>(null);
  const load=useCallback(async()=>{try{setR(await room.buyerRoom(listingId));}catch{setR({tier:0,items:[]});}},[room,listingId]);
  useEffect(()=>{void load();},[load]);
  if(!r||!r.tier||!r.items.length)return null;
  async function view(id:string,el:HTMLElement){setBusy(id);setErr('');opener.current=el;try{setOpen(await room.open(id));}catch(e){setErr((e as Error).message);}finally{setBusy('');}}
  const names=Object.fromEntries(r.items.map(i=>[i.id,i.displayName]));
  return <section className="ks-dr" aria-labelledby="ks-dr-h"><h2 id="ks-dr-h">Data room</h2>
    <p className="ks-fine">Documents the owner approved for buyers under NDA. Every page shows your name and email. Opening a document is recorded so the advisor and owner know which documents were read.</p>
    {folders.filter(f=>r.items.some(i=>i.folder===f)).map(f=><div key={f} className="ks-dr-folder"><h3>{f}</h3><ul>{r.items.filter(i=>i.folder===f).map(i=><li key={i.id}>
      <span><strong>{i.displayName}</strong><small>{i.open?(i.allowDownload&&isPdf(i.mime)?'View or download a stamped copy':'View only'):'Opens after a signed letter of intent'}{i.note?`. ${i.note}`:''}</small></span>
      {i.open?<button className="ks-btn" disabled={!!busy} onClick={e=>void view(i.id,e.currentTarget)}>{busy===i.id?'Opening…':'Open'}</button>:<span className="ks-dr-lock">After LOI</span>}
    </li>)}</ul></div>)}
    {err&&<p className="ks-error" role="alert">{err}</p>}
    {questions.some(q=>q.itemId)&&<div className="ks-dr-qs"><h3>Your questions about documents</h3>{questions.filter(q=>q.itemId).map(q=><p key={q.id} className={'ks-q '+q.side}>{q.body}<small>{names[q.itemId!]||'A document'}, page {q.page}</small></p>)}</div>}
    {open&&<Viewer room={room} doc={open} onClose={()=>{setOpen(null);requestAnimationFrame(()=>opener.current?.focus());}} onAsked={onAsked}/>}
  </section>;
}

function Viewer({room,doc,onClose,onAsked}:{room:DataRoomStore;doc:Opened;onClose:()=>void;onAsked:()=>void}){
  const {item,watermark}=doc,box=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const [page,setPage]=useState(1),[pages,setPages]=useState(1),[zoom,setZoom]=useState(1),[pdf,setPdf]=useState<{getPage(n:number):Promise<{getViewport(o:{scale:number}):{width:number;height:number};render(o:{canvasContext:CanvasRenderingContext2D;viewport:unknown}):{promise:Promise<void>}}>}|null>(null);
  const [table,setTable]=useState<{name:string;rows:string[][]}[]|null>(null),[img,setImg]=useState(''),[err,setErr]=useState(''),[note,setNote]=useState(''),[q,setQ]=useState('');
  // Page timing: one event per page visit, sent in small batches.
  const started=useRef(Date.now()),queue=useRef<{page:number;seconds:number}[]>([]),pageRef=useRef(1);
  const flush=useCallback(()=>{const ev=queue.current.splice(0,50);if(ev.length)void room.logPages(doc.ticket,ev).catch(()=>{});},[room,doc.ticket]);
  const mark=useCallback(()=>{const s=Math.round((Date.now()-started.current)/1000);if(s>=1)queue.current.push({page:pageRef.current,seconds:Math.min(600,s)});started.current=Date.now();},[]);
  useEffect(()=>{const t=setInterval(()=>{mark();flush();},15000);return()=>{clearInterval(t);mark();flush();};},[mark,flush]);
  const go=(n:number)=>{const next=Math.min(pages,Math.max(1,n));if(next===pageRef.current)return;mark();pageRef.current=next;setPage(next);};
  useEffect(()=>{box.current?.focus();},[]);
  useEffect(()=>{let live=true;void (async()=>{try{
    if(isPdf(item.mime)){const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',document.baseURI).href;const d=await pdfjs.getDocument({data:new Uint8Array(await doc.blob.arrayBuffer())}).promise;if(!live)return;setPdf(d as never);setPages(d.numPages);}
    else if(isSheet(item.mime,item.fileName)){const xlsx=/\.xlsx$/i.test(item.fileName)||/spreadsheetml/.test(item.mime);
      const sheets=xlsx?xlsxPages(new Uint8Array(await doc.blob.arrayBuffer())).map(p=>{const [h,...rest]=p.text.split('\n');return {name:h.replace(/^Sheet: /,''),rows:rest.map(l=>l.split('\t'))};})
        :[] as {name:string;rows:string[][]}[];
      if(!xlsx){const t=csvTable(await doc.blob.text());sheets.push({name:item.displayName,rows:[t.headers,...t.rows]});}
      if(!live)return;setTable(sheets);setPages(sheets.length);}
    else if(isImage(item.mime)){setImg(URL.createObjectURL(doc.blob));}
    else setErr('This file type can’t be shown here. Ask the advisor for a PDF copy.');
  }catch{if(live)setErr('This document could not be displayed. Ask the advisor for a new copy.');}})();return()=>{live=false;};},[doc,item.mime,item.fileName]);
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
        {item.allowDownload&&isPdf(item.mime)&&<button className="ks-btn" onClick={()=>void download()}>Download stamped copy</button>}
        <button className="ks-btn ks-btn-primary" onClick={onClose}>Close</button>
      </div>
    </div>
    <div className="ks-viewer-body" ref={box} tabIndex={0} aria-label={`${item.displayName}, ${unit.toLowerCase()} ${page}. Use the arrow keys to turn pages, plus and minus to zoom, Escape to close.`}>
      <div className="ks-viewer-page-wrap">
        {pdf&&<canvas ref={canvas} aria-hidden="true"/>}
        {table&&<div className="ks-viewer-table"><table><caption>{table[page-1]?.name}</caption><tbody>{table[page-1]?.rows.slice(0,500).map((r,i)=><tr key={i}>{r.map((c,j)=>i===0?<th key={j} scope="col">{c}</th>:<td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
        {img&&<img src={img} alt={item.displayName}/>}
        {(table||img)&&<div className="ks-viewer-mark" aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i}>{watermark}</span>)}</div>}
        {err&&<p className="ks-error" role="alert">{err}</p>}
        {!pdf&&!table&&!img&&!err&&<p className="ks-fine">Loading…</p>}
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
