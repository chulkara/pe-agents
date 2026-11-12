// PDF output built with pdf-lib (open source, runs in the browser): the signed engagement letter
// with its signature certificate, documents for review, and watermarked data room downloads.
import {PDFDocument,StandardFonts,rgb,degrees,type PDFFont,type PDFPage} from 'pdf-lib';
import type {Letter} from './portal.ts';

const A4={w:612,h:792},M=56;
/** Helvetica in pdf-lib covers Windows-1252 only; replace anything else so a PDF always builds. */
export function pdfSafe(s:string){return s.replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g,'?');}
export function wrap(text:string,font:PDFFont,size:number,width:number){
  const out:string[]=[];
  for(const para of pdfSafe(text).split('\n')){if(!para.trim()){out.push('');continue;}let line='';for(const word of para.split(/\s+/)){const t=line?line+' '+word:word;if(font.widthOfTextAtSize(t,size)>width&&line){out.push(line);line=word;}else line=t;}out.push(line);}
  return out;
}
type Writer={page:PDFPage;y:number};
function writer(doc:PDFDocument,font:PDFFont,footer:string){
  const pages:PDFPage[]=[];
  const add=()=>{const page=doc.addPage([A4.w,A4.h]);pages.push(page);return {page,y:A4.h-M} as Writer;};
  let w=add();
  const line=(text:string,o:{size?:number;bold?:PDFFont;gap?:number;color?:[number,number,number]}={})=>{const size=o.size||10.5,f=o.bold||font;for(const l of wrap(text,f,size,A4.w-2*M)){if(w.y<M+30)w=add();w.page.drawText(l,{x:M,y:w.y,size,font:f,color:rgb(...(o.color||[0,0,0]))});w.y-=size*1.45;}w.y-=o.gap||0;};
  const finish=()=>{pages.forEach((p,i)=>p.drawText(pdfSafe(`${footer}   Page ${i+1} of ${pages.length}`),{x:M,y:28,size:8,font,color:rgb(.4,.4,.4)}));};
  return {line,finish,newPage:()=>{w=add();}};
}
const stamp=(d:string)=>new Date(d).toISOString().replace('T',' ').slice(0,19)+' UTC';

/** The countersigned letter, followed by a certificate page that records both signatures and the hash. */
export async function letterPdf(l:Letter){
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`Engagement letter v${l.version}`);doc.setCreator('Kalling');doc.setProducer('Kalling');
  const w=writer(doc,font,`Engagement letter v${l.version}, ${l.templateVersion}, SHA-256 ${l.textHash.slice(0,16)}...`);
  const [first,...rest]=l.text.split('\n');w.line(first,{size:15,bold,gap:6});
  for(const t of rest){if(/^\d+\. /.test(t))w.line(t,{bold,gap:2});else w.line(t);}
  w.newPage();
  w.line('Signature certificate',{size:15,bold,gap:8});
  w.line('This page records how the letter above was signed. The SHA-256 hash is a fingerprint of the exact letter text; any change to the text gives a different hash.',{gap:8});
  const rows:[string,string][]=[['Letter',`Version ${l.version}`],['Template',l.templateVersion],['Text SHA-256',l.textHash],['Status',l.status],
    ['Owner signature',l.ownerSignature?`${l.ownerSignature.name} (${l.ownerSignature.email}), ${stamp(l.ownerSignature.at)}, agreed to sign electronically`:'Not signed'],
    ['Kalling signature',l.firmSignature?`${l.firmSignature.name} (${l.firmSignature.email}), ${stamp(l.firmSignature.at)}, agreed to sign electronically`:'Not signed']];
  for(const [k,v] of rows){w.line(k,{bold,size:9.5});w.line(v,{gap:6});}
  w.line('History',{bold,size:9.5});for(const e of l.events)w.line(`${stamp(e.at)}  ${e.status}  by ${e.by}${e.note?'  ('+e.note+')':''}`,{size:9});
  w.line('',{gap:4});w.line('No IP address or device information was recorded.',{size:9,color:[.35,.35,.35]});
  w.finish();return new Blob([await doc.save() as BlobPart],{type:'application/pdf'});
}

/** A plain document (for example a memorandum) with a stamp on every page. */
export async function textPdf(o:{title:string;sections:{heading:string;body:string}[];stamp:string;cover?:string[]}){
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfSafe(o.title));doc.setCreator('Kalling');
  const w=writer(doc,font,o.stamp);w.line(o.title,{size:20,bold,gap:10});for(const c of o.cover||[])w.line(c,{gap:4});
  for(const s of o.sections){w.line('',{gap:6});w.line(s.heading,{size:13,bold,gap:4});w.line(s.body);}
  w.finish();
  for(const p of doc.getPages())p.drawText(pdfSafe('CONFIDENTIAL'),{x:A4.w-M-70,y:A4.h-30,size:9,font:bold,color:rgb(.45,.1,.1)});
  return new Blob([await doc.save() as BlobPart],{type:'application/pdf'});
}

/** Stamp every page of a PDF with a diagonal watermark and a footer line. */
export async function watermarkPdf(bytes:ArrayBuffer,mark:string){
  const doc=await PDFDocument.load(bytes,{ignoreEncryption:true}),font=await doc.embedFont(StandardFonts.Helvetica);
  for(const p of doc.getPages()){const {width,height}=p.getSize();const t=pdfSafe(mark);
    p.drawText(t,{x:width*0.12,y:height*0.3,size:Math.min(22,width/(t.length*0.32)),font,color:rgb(.45,.45,.6),opacity:0.22,rotate:degrees(35)});
    p.drawText(t,{x:24,y:14,size:7,font,color:rgb(.3,.3,.3),opacity:0.8});}
  return new Blob([await doc.save() as BlobPart],{type:'application/pdf'});
}
