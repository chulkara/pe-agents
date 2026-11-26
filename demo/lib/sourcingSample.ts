// A fictional licensee list shaped like New Jersey's public file, for the demo and tests. Every name
// and street is invented. Towns and counties are real so ranking by region can be shown.
const first=['Anthony','Linda','Robert','Patricia','Joseph','Maria','Thomas','Susan','Frank','Donna','Michael','Karen','Vincent','Diane','Richard','Gloria','Daniel','Teresa'];
const last=['Calloway','Brenner','Okafor','Delvecchio','Haverford','Lindqvist','Marchetti','Ostrowski','Pellegrino','Quintero','Rasmussen','Szabo','Tolliver','Vandermeer','Whitcombe','Yarrow','Zielinski','Abernathy'];
const towns:[string,string,string][]=[['Green Brook','Somerset','08812'],['Bridgewater','Somerset','08807'],['Edison','Middlesex','08817'],['Piscataway','Middlesex','08854'],['Flemington','Hunterdon','08822'],['Hamilton','Mercer','08690'],
  ['Morristown','Morris','07960'],['Wayne','Passaic','07470'],['Paramus','Bergen','07652'],['Westfield','Union','07090'],['Freehold','Monmouth','07728'],['Toms River','Ocean','08753'],['Cherry Hill','Camden','08002'],['Vineland','Cumberland','08360']];
const streets=['Maple Ridge Rd','Quarry Hollow Ln','Old Mill Ct','Juniper Way','Foxglove Dr','Lantern Hill Rd'];

/** 36 fictional master HVACR licensees, tab-separated with the state file's column names. Dates are
 *  set relative to `today` so the ranking is the same on any day: tenure is whole years plus a month,
 *  renewals fall 60 days out for some, and four licenses expired a month ago. */
export function sampleLicenseFile(today=new Date()){
  const day=(d:Date)=>`${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${d.getUTCFullYear()}`;
  const iso=(d:Date)=>d.toISOString().slice(0,10);
  const shift=(years:number,days:number)=>{const d=new Date(Date.UTC(today.getUTCFullYear()-years,today.getUTCMonth(),today.getUTCDate()));d.setUTCDate(d.getUTCDate()+days);return d;};
  const rows=['License Number\tFull Name\tAddress Line 1\tCity\tState\tZip\tCounty\tProfession\tDate of Initial Licensure\tExpiration Date\tStatus'];
  for(let i=0;i<36;i++){
    const [city,county,zip]=towns[i%towns.length],years=4+((i*7)%36),street=`${100+((i*37)%800)} ${streets[i%streets.length]}`;
    // Two pairs share an address, as partners or a family business would.
    const address=i===7?`${100+((6*37)%800)} ${streets[6%streets.length]}`:i===20?`${100+((19*37)%800)} ${streets[19%streets.length]}`:street;
    const addrTown=i===7?towns[6%towns.length]:i===20?towns[19%towns.length]:[city,county,zip];
    const expired=i%9===4,expires=expired?shift(0,-30):i%5===0?shift(0,60):shift(-1,200);
    rows.push([`19HC${String(1000+i*13).padStart(6,'0')}`,`${first[i%first.length]} ${last[(i*5)%last.length]}`.toUpperCase(),address.toUpperCase(),addrTown[0].toUpperCase(),'NJ',addrTown[2],addrTown[1].toUpperCase(),
      'Master HVACR Contractor',day(shift(years,-30)),iso(expires),expired?'Expired':'Active'].join('\t'));
  }
  rows.push(['24RG00000101','JAMIE SAMPLE','1 JUNIPER WAY','EDISON','NJ','08817','MIDDLESEX','Registered Nurse','03/01/2010',iso(shift(-1,0)),'Active'].join('\t'));
  rows.push(['19HA00000202','RILEY SAMPLE','2 JUNIPER WAY','EDISON','NJ','08817','MIDDLESEX','HVACR Apprentice','03/01/2020',iso(shift(-1,0)),'Active'].join('\t'));
  return rows.join('\n');
}
