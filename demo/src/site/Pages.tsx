import {href,useAsync,useSession,Arrow} from './BrokerSite';
import {QuickEstimate} from './Valuation';
import {Nameplate} from './Market';

const steps=[
  {t:'Find out what it’s worth',time:'Week 1',you:'Answer a few questions and talk it through with an advisor.',we:'Compare your numbers with HVAC sales in the region and tell you what buyers will push on.'},
  {t:'Get ready to sell',time:'Weeks 2 to 5',you:'Upload statements, agreements and licenses to your private owner portal, at your own pace.',we:'Recast earnings, write the anonymous listing and the confidential memorandum, and agree a price with you.'},
  {t:'Meet vetted buyers',time:'Months 2 to 4',you:'Review buyer summaries and take the calls you want.',we:'Market the listing without your name, collect signed NDAs, and check each buyer’s funds and experience before sharing anything.'},
  {t:'Choose an offer',time:'Months 3 to 5',you:'Compare offers side by side and decide.',we:'Negotiate price, terms, seller financing and your transition role, then manage the letter of intent.'},
  {t:'Close and hand over',time:'Months 5 to 9',you:'Work with your attorney and accountant on the purchase agreement.',we:'Run diligence requests, coordinate the lender and license transition, and keep the closing on schedule.'},
];
const faqs:[string,string][]=[
  ['What does it cost?','You pay only if your company sells. Your advisor explains the success fee in writing before you sign anything, and the valuation and first review are free.'],
  ['Will my employees or customers find out?','We don’t tell them, and listings never show your name, town or website. A buyer sees those details only after signing a confidentiality agreement and being approved, and every approval is recorded.'],
  ['I hold the master HVACR license. Can I still sell?','Yes. In New Jersey the business needs a licensed bona fide representative, so the plan is agreed early: a licensed employee, a licensed buyer, or you staying on for a transition. New York licensing depends on the municipality, and we plan for that too.'],
  ['How long does a sale take?','Most sales take six to nine months from the first conversation to closing. Lender-financed deals take longer than cash deals.'],
  ['What if I’m not ready yet?','Many owners start two or three years early. The valuation shows what would raise the price, such as more maintenance agreements or less dependence on you, and you can come back when it makes sense.'],
  ['Who buys HVAC companies?','Licensed technicians ready to own a shop, people buying their first business with an SBA loan, regional HVAC operators adding territory, and investor-backed groups. Each is checked before seeing your details.'],
];
const drivers:[string,string,'up'|'down',string][]=[
  ['Maintenance agreements','+0.8×','up','Repeat service revenue that stays after you leave.'],
  ['A manager runs the day','+0.25×','up','The business doesn’t depend on you.'],
  ['You run everything','−0.45×','down','A buyer has to replace sales, dispatch and the hard calls.'],
  ['Builder work','−0.8×','down','New construction rides on a few contractors and the housing cycle.'],
];

export function Steps({long=false}:{long?:boolean}){
  return <div className="ks-acc">{steps.map((s,i)=><details key={s.t} open={long||i===0}><summary><span className="ks-acc-n">{i+1}</span><span className="ks-acc-t">{s.t}</span><span className="ks-acc-time">{s.time}</span></summary>
    <div className="ks-acc-body"><p><b>You</b>{s.you}</p><p><b>Kalling</b>{s.we}</p></div></details>)}</div>;
}
export function Faq(){return <div className="ks-acc ks-acc-faq">{faqs.map(([q,a])=><details key={q}><summary><span className="ks-acc-t">{q}</span></summary><div className="ks-acc-body"><p>{a}</p></div></details>)}</div>;}

export function HomePage(){
  const {store}=useSession();const recent=useAsync(()=>store.listings(),[store]);
  const live=(recent.data||[]).filter(l=>l.status!=='Sold');
  return <>
    <section className="ks-hero"><div className="ks-wrap">
      <h1 className="ks-display ks-display-hero">Sell your HVAC company.<br/>Or buy one.</h1>
      <div className="ks-hero-meta">
        <p>Kalling is a brokerage for heating, cooling and refrigeration companies in New Jersey and New York. Owners sell confidentially, and we check every buyer before they learn a company’s name.</p>
        <ul><li>HVAC and refrigeration only</li><li>New Jersey and New York</li><li>Pay only if it sells</li></ul>
      </div>
      <div className="ks-doors">
        <a className="ks-door ks-door-dark" href={href('/value')}><span className="ks-door-who">For owners</span><span className="ks-door-title">See what your company is worth</span><span className="ks-door-foot">Free and confidential, about two minutes<Arrow/></span></a>
        <a className="ks-door ks-door-green" href={href('/listings')}><span className="ks-door-who">For buyers</span><span className="ks-door-title">Browse HVAC companies for sale</span><span className="ks-door-foot">{recent.data?`${live.length} open listings`:'Open listings'}<Arrow/></span></a>
        <div className="ks-door ks-door-mist"><QuickEstimate/></div>
      </div>
    </div></section>

    <section className="ks-wrap ks-sec">
      <div className="ks-sec-head"><h2>What buyers pay for</h2><p>How each factor changes the earnings multiple in our HVAC valuation model. HVAC buyers ask about these first.</p></div>
      <div className="ks-drivers">{drivers.map(([t,n,dir,w])=><article key={t}><p className={'ks-big '+dir}><span aria-hidden="true">{dir==='up'?'↑':'↓'}</span>{n}</p><h3>{t}</h3><p>{w}</p></article>)}</div>
    </section>

    <section className="ks-wrap ks-sec ks-split">
      <div><h2>How a sale works</h2><p className="ks-muted">Most sales take six to nine months, from the first call to the day you hand over the keys.</p><a className="ks-btn" href={href('/sell')}>Read the selling guide<Arrow/></a></div>
      <Steps/>
    </section>

    <section className="ks-field-green"><div className="ks-wrap ks-split ks-portal">
      <div><h2>See where your sale stands at any time</h2><p>Every seller gets a private owner portal. It shows which buyers are interested and how far along they are, which documents are still needed and why, and what happens next. You can message your advisor there, and uploads save as you go.</p><a className="ks-btn ks-btn-light" href={href('/sell')}>What sellers see<Arrow/></a></div>
      <ul className="ks-portal-mock" aria-label="Example of the owner portal">
        <li><span>Buyer 2 · Strategic HVAC operator</span><b>Reviewing</b></li>
        <li><span>Buyer 1, owner-operator with an SBA lender</span><b>Under NDA</b></li>
        <li><span>Profit and loss, last 3 years</span><b>Complete</b></li>
        <li><span>Maintenance agreement list</span><b className="due">Due Dec 4</b></li>
      </ul>
    </div></section>

    <section className="ks-wrap ks-sec">
      <div className="ks-sec-head ks-sec-head-row"><h2>For sale now</h2><a className="ks-btn" href={href('/listings')}>All listings<Arrow/></a></div>
      {recent.error&&<p className="ks-error">{recent.error}</p>}
      <div className="ks-plates">{live.slice(0,3).map(l=><Nameplate key={l.id} l={l}/>)}</div>
    </section>

    <section className="ks-field-black"><div className="ks-wrap ks-split">
      <div><h2>Buying an HVAC company?</h2><p>Create a free profile with your region and budget. Sign a listing’s NDA online and an advisor reviews your request, usually within one business day.</p></div>
      <div className="ks-actions ks-actions-end"><a className="ks-btn ks-btn-light" href={href('/account?next=profile')}>Create a buyer profile<Arrow/></a><a className="ks-btn ks-btn-ghost" href={href('/buy')}>How buying works</a></div>
    </div></section>

    <section className="ks-wrap ks-sec">
      <div className="ks-sec-head"><h2>Different from a typical broker</h2></div>
      <div className="ks-compare">
        {([['Who we sell','Any business','HVAC and refrigeration companies in NJ and NY'],['First valuation','A meeting, then a report weeks later','An instant estimate with every adjustment shown, then an advisor review'],['Knowing what’s happening','Phone calls and email threads','A live owner portal: buyers, documents and next steps'],['Buyer screening','Varies','Signed NDA, a buyer profile and an advisor’s approval before your name is revealed'],['Preparation','Done by hand','Research, document requests and drafts prepared with AI, checked by your advisor']] as const).map(([k,a,b])=><div key={k} className="ks-compare-row"><h3>{k}</h3><p><span>Typical broker</span>{a}</p><p><span>Kalling</span>{b}</p></div>)}
      </div>
    </section>

    <section className="ks-wrap ks-sec ks-split"><div><h2>Questions owners ask</h2></div><Faq/></section>
    <section className="ks-wrap ks-final"><a href={href('/value')} className="ks-final-link">Value my company<Arrow/></a></section>
  </>;
}

export function SellPage(){
  return <>
    <section className="ks-wrap ks-page-head"><h1 className="ks-display ks-display-s">Selling your HVAC company</h1><p>What happens at each step, what to prepare, and how we keep your name private until you choose a buyer.</p><a className="ks-btn ks-btn-dark" href={href('/value')}>Start with a valuation<Arrow/></a></section>
    <section className="ks-wrap ks-sec ks-split"><div><h2>Five steps</h2><p className="ks-muted">Usually six to nine months. You decide at every step.</p></div><Steps long/></section>
    <section className="ks-wrap ks-sec ks-split">
      <div><h2>What to gather</h2><p className="ks-muted">You don’t need all of it on day one. Your owner portal asks for each item, explains why, and saves as you go.</p></div>
      <ul className="ks-list"><li>Three years of profit and loss statements and business tax returns</li><li>This year’s statements to date</li><li>Maintenance agreements, with renewal dates</li><li>Your ten largest customers by revenue (names can be hidden)</li><li>Licenses, EPA certifications and insurance certificates</li><li>Vehicles and major equipment, owned or leased</li><li>Your lease, or deed if you own the building</li><li>A team list with roles and tenure, no Social Security numbers</li></ul>
    </section>
    <section className="ks-field-green"><div className="ks-wrap ks-split">
      <div><h2>Confidential from the first call</h2></div>
      <ul className="ks-list ks-list-light"><li>Listings describe the region and the kind of work, never your name, town or website. Every listing is checked for identifying details before it goes live.</li><li>Buyers create a profile, sign a confidentiality agreement for your listing, and wait for an advisor’s approval.</li><li>Only approved buyers see your name and documents. You see each buyer’s type and progress in your portal.</li><li>Buyers agree not to contact your staff, customers or suppliers except through Kalling.</li></ul>
    </div></section>
    <section className="ks-wrap ks-sec ks-split"><div><h2>Common questions</h2></div><Faq/></section>
    <section className="ks-wrap ks-final"><a href={href('/value')} className="ks-final-link">Value my company<Arrow/></a></section>
  </>;
}
