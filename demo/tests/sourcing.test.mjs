import test from 'node:test';import assert from 'node:assert/strict';
import {parseLicenseList,rankProspects,importRecords,emptySourcing,draftLetter,setDecision,isoDate,sourcingSummary,OPT_OUT} from '../lib/sourcing.ts';
import {sampleLicenseFile} from '../lib/sourcingSample.ts';

const today='2026-11-25';
const load=()=>importRecords(emptySourcing(),parseLicenseList(sampleLicenseFile(new Date(today+'T12:00:00Z'))).records,'Fictional sample');

test('reads the state file shape and keeps only master HVACR contractors',()=>{
  const {records,skipped}=parseLicenseList(sampleLicenseFile(new Date('2026-11-25T12:00:00Z')));
  assert.equal(records.length,36);assert.equal(skipped,2,'the nurse and the apprentice are skipped');
  assert.ok(!records.some(r=>/SAMPLE/i.test(r.name)));
  const r=records.find(x=>x.licenseNo==='19HC001000');
  assert.deepEqual([r.name,r.city,r.county,r.state,r.firstLicensed],['Anthony Calloway','Green Brook','Somerset','NJ','2022-10-26']);
  assert.equal(isoDate('03/07/1991'),'1991-03-07');assert.equal(isoDate('1991-3-7'),'1991-03-07');assert.equal(isoDate('soon'),'');
});

test('a CSV with other column names and quoted commas works; a file without dates is refused',()=>{
  const csv='Lic No,Last Name,First Name,Street,City,Zip,County,License Type,Date of Last Issue,Original Issue Date,Expiration\n"A1","O\'Brien","Pat","12 Elm St, Unit 2",Edison,08817,Middlesex County,Master HVACR Contractor,6/1/2024,6/1/1990,12/31/2027';
  const [r]=parseLicenseList(csv).records;
  assert.deepEqual([r.licenseNo,r.name,r.address,r.county,r.firstLicensed],['A1','Pat O\'Brien','12 Elm St, Unit 2','Middlesex','1990-06-01']);
  assert.throws(()=>parseLicenseList('License Number,Name\nA,B'),/first licensed/);
  assert.throws(()=>parseLicenseList('License Number,Name,Date of Initial Licensure\nA,B,1/1/1990'),/profession or license type/,'without a profession column a master license cannot be claimed');
  assert.throws(()=>parseLicenseList('License Number,Name,Profession,Date of Last Issue\nA,B,Master HVACR Contractor,1/1/2024'),/first licensed/,'a last-issue date never stands in for the first');
  assert.equal(parseLicenseList('License Number,Name,Profession,Date of Initial Licensure\nA,B,HVACR Apprentice,1/1/1990').records.length,0);
});

test('ranking: long-licensed sole licensees in the region come first, with the reason from the record',()=>{
  const ranked=rankProspects(load(),today);
  assert.equal(ranked.length,32,'four expired licenses are left out');
  assert.ok(ranked.every((p,i)=>!i||ranked[i-1].score>=p.score));
  const top=ranked[0];assert.equal(top.tier,'Contact first');assert.ok(top.years>=35);
  assert.match(top.reason,/^Licensed since \d{4} \(\d+ years\); no other master HVACR licensee at the same address; \w+ County, (Central|North|South) Jersey|Jersey Shore/);
  const shared=ranked.filter(p=>p.sharedAddress>0);assert.equal(shared.length,4,'two addresses with two licensees each');
  assert.match(shared[0].reason,/1 other licensee at the same address/);
  assert.ok(rankProspects(load(),today,{region:'Central Jersey'}).every(p=>p.region==='Central Jersey'));
});

test('the letter uses only the public record, offers a way out, and never says --',()=>{
  const p=rankProspects(load(),today)[0],l=draftLetter(p,{name:'Karan',firm:'Kalling',email:'karan@kalling.test'});
  assert.match(l,new RegExp(`^Dear ${p.record.name},`));assert.match(l,new RegExp(`since ${p.record.firstLicensed.slice(0,4)}`));
  assert.match(l,/I won't write again/);assert.doesNotMatch(l,/--|retire|age|old/i);
});

test('a person approves before anything is marked mailed; do-not-contact sticks across imports',()=>{
  let s=load();const p=rankProspects(s,today)[0],no=p.record.licenseNo;
  assert.throws(()=>setDecision(s,no,{status:'Mailed'}),/Approve the letter/);
  s=setDecision(s,no,{status:'Letter drafted',letter:draftLetter(p,{name:'Karan',firm:'Kalling'})});
  assert.throws(()=>setDecision(s,no,{status:'Letter approved'}),/name of the person/);
  assert.throws(()=>setDecision(s,no,{status:'Letter approved',approvedBy:'Karan',letter:'Hi -- there'}),/Replace --/);
  s=setDecision(s,no,{status:'Letter approved',approvedBy:'Karan'});assert.equal(s.decisions[no].approvedBy,'Karan');assert.ok(s.decisions[no].approvedAt);
  s=setDecision(s,no,{status:'Mailed'});assert.ok(s.decisions[no].mailedAt);
  const other=rankProspects(s,today)[1].record.licenseNo;
  s=setDecision(s,other,{status:'Do not contact'});
  s=importRecords(s,parseLicenseList(sampleLicenseFile(new Date(today+'T12:00:00Z'))).records,'Fictional sample again');
  assert.ok(!rankProspects(s,today).some(x=>x.record.licenseNo===other));
  assert.equal(s.decisions[no].status,'Mailed','decisions survive a new import');
  assert.deepEqual(sourcingSummary(s,rankProspects(s,today)),{ranked:31,first:6,approved:0,mailed:1,replied:0,doNotContact:1});
});

test('approval never changes or drops the letter: too long is refused, the opt-out line must stay',()=>{
  let s=load();const p=rankProspects(s,today)[0],no=p.record.licenseNo,base=draftLetter(p,{name:'Karan',firm:'Kalling'});
  assert.throws(()=>setDecision(s,no,{status:'Letter approved',approvedBy:'Karan',letter:base+'x'.repeat(4000)}),/under 4,000 characters/);
  assert.throws(()=>setDecision(s,no,{status:'Letter approved',approvedBy:'Karan',letter:base.replace(OPT_OUT,'')}),/opt-out sentence word for word/);
  assert.throws(()=>setDecision(s,no,{status:'Letter approved',approvedBy:'Karan',letter:base.replace(OPT_OUT,'There is no way to opt out of these letters.')}),/opt-out sentence word for word/,'a sentence that denies an opt-out is refused');
  s=setDecision(s,no,{status:'Letter approved',approvedBy:'Karan',letter:base});assert.equal(s.decisions[no].letter,base,'saved exactly as approved');
});

test('the sample ranks the same on any day',()=>{
  for(const d of ['2026-11-25','2027-02-01','2027-06-30','2028-03-01']){
    const s=importRecords(emptySourcing(),parseLicenseList(sampleLicenseFile(new Date(d+'T12:00:00Z'))).records,'x'),r=rankProspects(s,d);
    assert.deepEqual([r.length,r.filter(x=>x.tier==='Contact first').length],[32,7],d);
  }
});

test('decisions only move forward, so nothing can undo a mailed letter or an opt-out',()=>{
  let s=load();const [a,b]=rankProspects(s,today),na=a.record.licenseNo,nb=b.record.licenseNo,letter=draftLetter(a,{name:'Karan',firm:'Kalling'});
  s=setDecision(s,na,{status:'Letter approved',approvedBy:'Karan',letter});s=setDecision(s,na,{status:'Mailed'});
  assert.throws(()=>setDecision(s,na,{status:'Letter drafted',letter}),/already at "Mailed"/);
  assert.throws(()=>setDecision(s,na,{status:'Letter approved',approvedBy:'Karan',letter}),/already at "Mailed"/);
  s=setDecision(s,na,{status:'Replied'});assert.throws(()=>setDecision(s,na,{status:'Mailed'}),/Approve the letter before marking it mailed/);
  s=setDecision(s,nb,{status:'Do not contact'});
  for(const st of ['New','Letter drafted','Letter approved','Mailed','Replied','Not interested','Do not contact'])assert.throws(()=>setDecision(s,nb,{status:st,letter,approvedBy:'Karan'}),/asked not to be contacted/,st);
});
