// Reads text out of the owner's documents in the browser, page by page, so drafts can cite
// a file and a page. Nothing leaves the browser here. Scanned files are flagged, not guessed.
import {unzipSync,strFromU8} from 'fflate';

export const EXTRACTOR_VERSION='kalling-extract-1';
export type ExtractStatus='ok'|'scanned'|'unsupported'|'failed';
export type Extract={fileId:string;status:ExtractStatus;pages:{page:number;text:string}[];textHash:string;extractor:string;chars:number;note:string;extractedAt:string};
type PdfJs={getDocument(o:{data:Uint8Array}):{promise:Promise<{numPages:number;getPage(n:number):Promise<{getTextContent():Promise<{items:unknown[]}>}>}>;destroy():Promise<void>}};
export type Loaders={pdf?:()=>Promise<PdfJs>};
const MAX_PAGES=60,MAX_CHARS=400000;

async function defaultPdf():Promise<PdfJs>{const pdfjs=await import('pdfjs-dist');if(typeof document!=='undefined')pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',document.baseURI).href;return pdfjs as unknown as PdfJs;}
export async function hashText(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const xmlText=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&amp;/g,'&');

async function pdfPages(bytes:Uint8Array,load:()=>Promise<PdfJs>){
  const pdfjs=await load(),task=pdfjs.getDocument({data:bytes.slice()});
  try{const doc=await task.promise,out:{page:number;text:string}[]=[];
    for(let i=1;i<=Math.min(doc.numPages,MAX_PAGES);i++){const c=await (await doc.getPage(i)).getTextContent();
      out.push({page:i,text:c.items.map(it=>{const x=it as {str?:string;hasEOL?:boolean};return typeof x.str==='string'?x.str+(x.hasEOL?'\n':' '):'';}).join('').replace(/[ \t]+\n/g,'\n').trim()});}
    return {pages:out,truncated:doc.numPages>MAX_PAGES};}
  finally{await task.destroy();}
}
/** Spreadsheet rows as tab-separated text. One "page" per sheet. Handles shared strings and inline strings. */
export function xlsxPages(bytes:Uint8Array){
  const z=unzipSync(bytes),get=(n:string)=>z[n]?strFromU8(z[n]):'';
  const shared=[...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));
  const wb=get('xl/workbook.xml'),names=[...wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m=>({name:xmlText(m[1]),rid:m[2]}));
  const rels=Object.fromEntries([...get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m=>[m[1],m[2].replace(/^\/?xl\//,'')]));
  const sheets=names.length?names.map(n=>({name:n.name,path:'xl/'+(rels[n.rid]||'')})):Object.keys(z).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).map((path,i)=>({name:'Sheet '+(i+1),path}));
  return sheets.map((s,i)=>{const rows=[...get(s.path).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(r=>[...r[1].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)].map(c=>{const attrs=c[1]||'',body=c[2]||'',t=(attrs.match(/t="([^"]+)"/)||[])[1],v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
      if(t==='s')return shared[Number(v)]??'';if(t==='inlineStr')return xmlText([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join(''));return v!==undefined?xmlText(v):'';}).join('\t'));
    return {page:i+1,text:`Sheet: ${s.name}\n`+rows.filter(r=>r.trim()).join('\n')};});
}
export function docxPages(bytes:Uint8Array){
  const z=unzipSync(bytes),x=z['word/document.xml']?strFromU8(z['word/document.xml']):'';
  const text=xmlText(x.replace(/<w:tab\/>/g,'\t').replace(/<\/w:p>/g,'\n').replace(/<w:br[^>]*\/>/g,'\n').replace(/<[^>]+>/g,'')).replace(/\n{3,}/g,'\n\n').trim();
  return chunk(text,3500);
}
/** Long plain text split into page-sized pieces so citations stay specific. */
export function chunk(text:string,size=3500){const lines=text.split('\n'),out:{page:number;text:string}[]=[];let cur='';for(const l of lines){if((cur+l).length>size&&cur){out.push({page:out.length+1,text:cur.trim()});cur='';}cur+=l+'\n';}if(cur.trim())out.push({page:out.length+1,text:cur.trim()});return out;}

export async function extractText(fileId:string,bytes:Uint8Array,name:string,mime:string,l:Loaders={}):Promise<Extract>{
  const base={fileId,extractor:EXTRACTOR_VERSION,extractedAt:new Date().toISOString()};
  const done=async(status:ExtractStatus,pages:{page:number;text:string}[],note:string)=>{let total=0;const kept=pages.map(p=>{const t=p.text.slice(0,Math.max(0,MAX_CHARS-total));total+=t.length;return {...p,text:t};});return {...base,status,pages:kept,chars:total,note,textHash:await hashText(kept.map(p=>p.page+'\n'+p.text).join('\n\f'))};};
  try{
    if(/\.pdf$/i.test(name)||mime==='application/pdf'){const {pages,truncated}=await pdfPages(bytes,l.pdf||defaultPdf);const chars=pages.reduce((n,p)=>n+p.text.replace(/\s/g,'').length,0);
      if(chars<40*Math.max(1,pages.length))return done('scanned',pages,'Scanned, text not readable. Ask the owner for a digital copy, or enter the key figures by hand with this page as the source.');
      return done('ok',pages,truncated?`Only the first ${MAX_PAGES} pages were read.`:'');}
    if(/\.(csv|txt)$/i.test(name)||/^text\//.test(mime))return done('ok',chunk(new TextDecoder().decode(bytes),3500),'');
    if(/\.xlsx$/i.test(name))return done('ok',xlsxPages(bytes),'');
    if(/\.docx$/i.test(name))return done('ok',docxPages(bytes),'');
    if(/\.(png|jpe?g)$/i.test(name)||/^image\//.test(mime))return done('scanned',[],'An image has no readable text. Ask the owner for a digital copy, or enter the key figures by hand.');
    if(/\.(xls|doc)$/i.test(name))return done('unsupported',[],'Older Excel and Word files cannot be read here. Ask the owner for a PDF, an .xlsx or a .docx file.');
    return done('unsupported',[],'This file type cannot be read.');
  }catch(e){return done('failed',[],'Could not read this file: '+(e instanceof Error?e.message:String(e)).slice(0,200));}
}
/** Files that feed AI drafts: those linked to requests the advisor accepted. */
export function acceptedInputs(b:{requests:{status:string;fileIds:string[];title:string}[];files:{id:string;name:string;mime:string;sha256:string}[]}){
  const out=new Map<string,{fileId:string;name:string;mime:string;sha256:string;requests:string[]}>();
  for(const r of b.requests.filter(r=>r.status==='Accepted'))for(const id of r.fileIds){const f=b.files.find(x=>x.id===id);if(!f)continue;const e=out.get(id)||{fileId:id,name:f.name,mime:f.mime,sha256:f.sha256,requests:[]};e.requests.push(r.title);out.set(id,e);}
  return [...out.values()];
}
