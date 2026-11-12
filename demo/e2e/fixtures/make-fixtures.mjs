// Builds the fictional seller documents used by the tests. Run: node e2e/fixtures/make-fixtures.mjs
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {zipSync,strToU8} from 'fflate';
import {writeFile} from 'node:fs/promises';
const dir=new URL('./',import.meta.url),NOTE='FICTIONAL SAMPLE, NOT REAL FINANCIAL DATA';
const $=n=>n.toLocaleString('en-US');
async function pdf(name,title,lines){const d=await PDFDocument.create(),f=await d.embedFont(StandardFonts.Helvetica),b=await d.embedFont(StandardFonts.HelveticaBold);
  let p=d.addPage([612,792]),y=740;const put=(t,o={})=>{if(y<60){p=d.addPage([612,792]);y=740;}p.drawText(t,{x:56,y,size:o.size||10.5,font:o.bold?b:f});y-=(o.size||10.5)*1.6;};
  put(NOTE,{size:8});put(title,{size:15,bold:true});y-=6;for(const l of lines)Array.isArray(l)?(p.drawText(l[0],{x:56,y,size:10.5,font:f}),p.drawText(l[1],{x:340,y,size:10.5,font:f}),y-=17):put(l.text??l,l);
  await writeFile(new URL(name,dir),await d.save());}
const years={2023:{rev:2310000,cogs:1201200,payroll:402000,owner:140000,rent:72000,veh:38000,ins:41000,legal:6000,other:147800,dep:42000,int:18000,health:16000,spouse:48000,personal:7200},
  2024:{rev:2450000,cogs:1249500,payroll:428000,owner:145000,rent:72000,veh:40500,ins:43000,legal:5500,other:139500,dep:44000,int:16000,health:17000,spouse:50000,personal:8100},
  2025:{rev:2600000,cogs:1300000,payroll:452000,owner:150000,rent:74000,veh:42000,ins:45500,legal:46000,other:108000,dep:46000,int:14000,health:18000,spouse:52000,personal:9500}};
for(const [y,v] of Object.entries(years)){const opex=v.payroll+v.owner+v.rent+v.veh+v.ins+v.legal+v.other+v.health+v.spouse+v.personal,ni=v.rev-v.cogs-opex-v.dep-v.int;v.ni=ni;
  await pdf(`pl-${y}.pdf`,`Russo Heating & Air LLC, Profit and loss, January to December ${y}`,[['Revenue, service and installation',$(v.rev)],['Cost of goods sold (equipment and parts)',$(v.cogs)],['Gross profit',$(v.rev-v.cogs)],'',{text:'Operating expenses',bold:true},['Technician and office payroll',$(v.payroll)],['Officer salary, Pat Russo',$(v.owner)],['Officer health insurance',$(v.health)],['Payroll, Maria Russo (spouse, not active in business)',$(v.spouse)],['Rent',$(v.rent)],['Vehicle expenses',$(v.veh)],['Insurance',$(v.ins)],['Legal and professional fees',$(v.legal)+(y==='2025'?' (40,000 one-time settlement)':'')],['Personal travel charged to business',$(v.personal)],['Other operating expenses',$(v.other)],['Depreciation',$(v.dep)],['Interest expense',$(v.int)],'',['Net income before tax',$(ni)]]);}
const taxIncome={2023:years[2023].ni-2500,2024:Math.round(years[2024].ni*0.94),2025:years[2025].ni-4000};
await pdf('tax-returns.pdf','Russo Heating & Air LLC, Form 1120-S summary, tax years 2023 to 2025',[...Object.entries(taxIncome).flatMap(([y,n])=>[{text:`Tax year ${y}`,bold:true},['Gross receipts',$(years[y].rev)],['Compensation of officers',$(years[y].owner)],['Ordinary business income',$(n)],''])]);
const rows=[['Agreement','Plan','Price','Renewal month','Auto-renew']];const plans=[['Comfort Club',189],['Comfort Club Plus',289],['Commercial PM',1200]];
for(let i=1;i<=60;i++){const pl=plans[i%7===0?2:i%3===0?1:0];rows.push([`A-${String(i).padStart(4,'0')}`,pl[0],String(pl[1]),['Jan','Mar','Apr','May','Sep','Oct'][i%6],i%5===0?'No':'Yes']);}
await writeFile(new URL('agreements.csv',dir),'# '+NOTE+'\n'+rows.map(r=>r.join(',')).join('\n')+'\n');
const sheet=(cells)=>`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells.map((r,i)=>`<row r="${i+1}">${r.map(c=>typeof c==='number'?`<c><v>${c}</v></c>`:`<c t="inlineStr"><is><t>${c.replace(/&/g,'&amp;')}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
const team=[[NOTE],['Role','Start year','Pay range','Certifications'],['Lead technician',2012,'$85K to $95K','EPA 608 Universal, NATE'],['Technician',2016,'$70K to $80K','EPA 608'],['Technician',2019,'$65K to $72K','EPA 608'],['Technician',2022,'$58K to $64K','EPA 608'],['Office manager',2014,'$55K to $60K',''],['Dispatcher',2020,'$45K to $50K','']];
const xlsx=zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
 '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
 'xl/workbook.xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Team" sheetId="1" r:id="rId1"/></sheets></workbook>'),
 'xl/_rels/workbook.xml.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
 'xl/worksheets/sheet1.xml':strToU8(sheet(team))});
await writeFile(new URL('team.xlsx',dir),xlsx);
{const d=await PDFDocument.create();const p=d.addPage([612,792]);p.drawRectangle({x:60,y:300,width:480,height:400,color:rgb(.85,.85,.85)});await writeFile(new URL('scanned-license.pdf',dir),await d.save());}
console.log('fixtures written');
