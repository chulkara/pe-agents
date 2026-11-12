import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractText,acceptedInputs,chunk} from '../lib/extract.ts';

const fx=n=>readFile(new URL('../e2e/fixtures/'+n,import.meta.url)).then(b=>new Uint8Array(b));
const pdf=()=>import('pdfjs-dist/legacy/build/pdf.mjs');

test('PDF text is read page by page with a stable hash',async()=>{
  const a=await extractText('f1',await fx('pl-2025.pdf'),'pl-2025.pdf','application/pdf',{pdf});
  assert.equal(a.status,'ok');assert.equal(a.pages[0].page,1);assert.match(a.pages[0].text,/Net income before tax/);assert.match(a.pages[0].text,/2,600,000/);
  const b=await extractText('f1',await fx('pl-2025.pdf'),'pl-2025.pdf','application/pdf',{pdf});assert.equal(a.textHash,b.textHash);assert.match(a.textHash,/^[0-9a-f]{64}$/);
});
test('scanned PDFs and images are flagged, never guessed',async()=>{
  const s=await extractText('f2',await fx('scanned-license.pdf'),'scanned-license.pdf','application/pdf',{pdf});assert.equal(s.status,'scanned');assert.match(s.note,/digital copy/);
  const img=await extractText('f3',new Uint8Array([1,2,3]),'photo.jpg','image/jpeg');assert.equal(img.status,'scanned');
  const old=await extractText('f4',new Uint8Array([1,2,3]),'old.xls','application/vnd.ms-excel');assert.equal(old.status,'unsupported');assert.match(old.note,/\.xlsx/);
  const bad=await extractText('f5',new Uint8Array([1,2,3]),'broken.pdf','application/pdf',{pdf});assert.equal(bad.status,'failed');
});
test('CSV and XLSX become text rows',async()=>{
  const c=await extractText('f6',await fx('agreements.csv'),'agreements.csv','text/csv');assert.equal(c.status,'ok');assert.match(c.pages[0].text,/Comfort Club Plus,289/);
  const x=await extractText('f7',await fx('team.xlsx'),'team.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(x.status,'ok');assert.match(x.pages[0].text,/^Sheet: Team/);assert.match(x.pages[0].text,/Lead technician\t2012\t\$85K to \$95K/);
  assert.equal(chunk('a\n'.repeat(5000),1000).length>3,true);
});
test('only files on accepted requests feed drafts',()=>{
  const files=[{id:'1',name:'a.pdf',mime:'application/pdf',sha256:'x'},{id:'2',name:'b.pdf',mime:'application/pdf',sha256:'y'}];
  const r=acceptedInputs({files,requests:[{status:'Accepted',fileIds:['1'],title:'P&L'},{status:'Submitted',fileIds:['2'],title:'Tax'},{status:'Accepted',fileIds:['1'],title:'Again'}]});
  assert.deepEqual(r.map(x=>x.fileId),['1']);assert.deepEqual(r[0].requests,['P&L','Again']);
});
