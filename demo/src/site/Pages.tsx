import {href,useAsync,useSession} from './BrokerSite';
import {QuickEstimate} from './Valuation';
import {Nameplate} from './Market';

const steps=[
  {t:'Find out what it’s worth',you:'Answer a few questions and talk it through with an advisor.',we:'Compare your numbers with HVAC sales in the region and tell you what buyers will push on.',time:'Week 1'},
  {t:'Get ready to sell',you:'Upload statements, agreements and licenses to your private owner portal, at your own pace.',we:'Recast earnings, write the anonymous listing and the confidential memorandum, and agree a price with you.',time:'Weeks 2–5'},
  {t:'Meet vetted buyers',you:'Review buyer summaries and take the calls you want.',we:'Market the listing without your name, collect signed NDAs, check each buyer’s funds and experience before sharing anything.',time:'Months 2–4'},
  {t:'Choose an offer',you:'Compare offers side by side and decide.',we:'Negotiate price, terms, seller financing and your transition role, then manage the letter of intent.',time:'Months 3–5'},
  {t:'Close and hand over',you:'Work with your attorney and accountant on the purchase agreement.',we:'Run diligence requests, coordinate the lender and license transition, and keep the closing on schedule.',time:'Months 5–9'},
];
const faqs:[string,string][]=[
  ['What does it cost?','You pay only if your company sells. Your advisor explains the success fee in writing before you sign anything, and the valuation and first review are free.'],
  ['Will my employees or customers find out?','Not from us. Listings never show your name, town or website. A buyer sees those details only after signing a confidentiality agreement and being approved, and every approval is recorded.'],
  ['I hold the master HVACR license. Can I still sell?','Yes. In New Jersey the business needs a licensed bona fide representative, so the plan is agreed early: a licensed employee, a licensed buyer, or you staying on for a transition. New York licensing depends on the municipality, and we plan for that too.'],
  ['How long does a sale take?','Most sales take six to nine months from the first conversation to closing. Lender-financed deals take longer than cash deals.'],
  ['What if I’m not ready yet?','Many owners start two or three years early. The valuation shows what would raise the price, such as more maintenance agreements or less dependence on you, and you can come back when it makes sense.'],
  ['Who buys HVAC companies?','Licensed technicians ready to own a shop, people buying their first business with an SBA loan, regional HVAC operators adding territory, and investor-backed groups. Each is checked before seeing your details.'],
];

export function HomePage(){
  const {store}=useSession();const recent=useAsync(()=>store.listings(),[store]);
  const live=(recent.data||[]).filter(l=>l.status!=='Sold').slice(0,3);
  return <>
    <section className="ks-hero"><div className="ks-wrap ks-hero-grid">
      <div className="ks-hero-copy">
        <h1>Sell your HVAC company to a buyer who will keep it running.</h1>
        <p>Kalling brokers heating, cooling and refrigeration companies in New Jersey and New York, and nothing else. See what yours could be worth in two minutes, then sell it confidentially to buyers we have checked.</p>
        <div className="ks-actions"><a className="ks-btn ks-btn-primary" href={href('/value')}>Value my company</a><a className="ks-btn" href={href('/listings')}>Browse companies for sale</a></div>
        <ul className="ks-promise"><li>Pay only if it sells</li><li>Your name stays private</li><li>Every buyer signs an NDA and is vetted</li></ul>
      </div>
      <QuickEstimate/>
    </div></section>

    <section className="ks-wrap ks-why">
      <h2>Priced the way HVAC buyers think</h2>
      <p className="ks-lede">A general broker values your company like a dry cleaner. Buyers of HVAC companies look at four things first, and so do we.</p>
      <div className="ks-why-grid">
        <article><h3>Maintenance agreements</h3><p>Scheduled visits and replacement leads that keep coming after you leave. They are often the biggest single driver of price.</p></article>
        <article><h3>Technicians and the license</h3><p>How deep the bench is, and who will be the licensed representative after closing. We plan the license hand-off before buyers ask.</p></article>
        <article><h3>How much runs through you</h3><p>If you do sales, dispatch and the hardest calls, buyers discount for it. A manager or lead tech in place raises the multiple.</p></article>
        <article><h3>Service versus construction</h3><p>Repeat service and replacement work for homeowners and building managers is worth more than builder work that depends on a few contractors.</p></article>
      </div>
    </section>

    <section className="ks-band"><div className="ks-wrap">
      <h2>How a sale works</h2>
      <ol className="ks-steps">{steps.map(s=><li key={s.t}><div className="ks-step-head"><h3>{s.t}</h3><span>{s.time}</span></div><p><b>You:</b> {s.you}</p><p><b>Kalling:</b> {s.we}</p></li>)}</ol>
      <a className="ks-btn" href={href('/sell')}>Read the full selling guide</a>
    </div></section>

    <section className="ks-wrap ks-portal-pitch">
      <div><h2>See every step, without chasing anyone</h2><p>Sellers get a private owner portal. It shows which buyers are interested and how far along they are, the documents still needed and why, messages with your advisor, and what happens next. Uploads save as you go, and you never send the same document twice.</p><a className="ks-btn" href={href('/sell')}>What sellers see</a></div>
      <ul className="ks-portal-mock" aria-label="Example of what the owner portal shows">
        <li><span>Buyer 2 · Strategic HVAC operator</span><b>Reviewing information</b></li>
        <li><span>Buyer 1 · Owner-operator, SBA pre-approved</span><b>Under NDA</b></li>
        <li><span>Profit and loss, last 3 years</span><b>Complete</b></li>
        <li><span>Maintenance agreement list</span><b className="due">Needed by Dec 4</b></li>
      </ul>
    </section>

    <section className="ks-wrap ks-listings-preview">
      <div className="ks-section-head"><h2>Companies for sale now</h2><a href={href('/listings')}>All listings</a></div>
      {recent.error&&<p className="ks-error">{recent.error}</p>}
      <div className="ks-plates">{live.map(l=><Nameplate key={l.id} l={l}/>)}</div>
    </section>

    <section className="ks-band ks-band-dark"><div className="ks-wrap ks-buyers-pitch">
      <div><h2>Buying an HVAC company?</h2><p>Create a free buyer profile and tell us your region and budget. Sign one listing’s NDA online and an advisor reviews your request, usually within one business day. You hear about new listings that fit before anyone else.</p></div>
      <div className="ks-actions"><a className="ks-btn ks-btn-light" href={href('/account?next=profile')}>Create a buyer profile</a><a className="ks-btn ks-btn-ghost" href={href('/buy')}>How buying works</a></div>
    </div></section>

    <section className="ks-wrap ks-compare">
      <h2>What’s different about Kalling</h2>
      <table><thead><tr><th scope="col"/><th scope="col">Typical business broker</th><th scope="col">Kalling</th></tr></thead><tbody>
        <tr><th scope="row">Who they sell</th><td>Any business</td><td>Only HVAC and refrigeration companies in NJ and NY</td></tr>
        <tr><th scope="row">First valuation</th><td>A meeting, then a report weeks later</td><td>An instant estimate with every adjustment shown, then an advisor review</td></tr>
        <tr><th scope="row">Knowing what’s happening</th><td>Phone calls and email threads</td><td>A live owner portal showing buyers, documents and next steps</td></tr>
        <tr><th scope="row">Buyer screening</th><td>Varies</td><td>Signed NDA, buyer profile and an advisor’s approval before the name is revealed</td></tr>
        <tr><th scope="row">Preparation</th><td>Done by hand</td><td>Research, document requests and draft materials prepared with AI, checked by your advisor</td></tr>
      </tbody></table>
    </section>

    <section className="ks-wrap ks-faq"><h2>Questions owners ask</h2>{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
    <section className="ks-wrap ks-final"><h2>Find out what your company is worth.</h2><a className="ks-btn ks-btn-primary" href={href('/value')}>Value my company</a></section>
  </>;
}

export function SellPage(){
  return <>
    <section className="ks-wrap ks-page-head"><h1>Selling your HVAC company</h1><p>How a sale works with Kalling, what you need to prepare, and how your identity stays protected until you choose a buyer.</p><div className="ks-actions"><a className="ks-btn ks-btn-primary" href={href('/value')}>Start with a valuation</a></div></section>
    <section className="ks-wrap ks-sell-steps"><ol className="ks-steps ks-steps-long">{steps.map(s=><li key={s.t}><div className="ks-step-head"><h3>{s.t}</h3><span>{s.time}</span></div><p><b>You:</b> {s.you}</p><p><b>Kalling:</b> {s.we}</p></li>)}</ol></section>
    <section className="ks-band"><div className="ks-wrap ks-two">
      <div><h2>What to gather</h2><p className="ks-lede">You don’t need all of it on day one. Your owner portal asks for each item, explains why, and saves as you go.</p>
        <ul className="ks-checklist"><li>Three years of profit and loss statements and business tax returns</li><li>This year’s statements to date</li><li>A list of maintenance agreements, with renewal dates</li><li>Your ten largest customers by revenue (names can be hidden)</li><li>Licenses, EPA certifications and insurance certificates</li><li>Vehicles and major equipment, owned or leased</li><li>Your lease, or deed if you own the building</li><li>A team list with roles and tenure (no Social Security numbers)</li></ul></div>
      <div><h2>How we keep it confidential</h2><ul className="ks-checklist"><li>Listings describe the region and the kind of work, never your name, town or website. We check every listing for identifying details before it goes live.</li><li>Buyers create a profile, sign a confidentiality agreement for your listing, and wait for an advisor to approve them.</li><li>Only approved buyers see your name and documents. You see each buyer’s type and progress in your portal.</li><li>Buyers agree not to contact your staff, customers or suppliers except through Kalling.</li></ul></div>
    </div></section>
    <section className="ks-wrap ks-faq"><h2>Common questions</h2>{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
    <section className="ks-wrap ks-final"><h2>Talk to an advisor in confidence.</h2><a className="ks-btn ks-btn-primary" href={href('/value')}>Value my company</a></section>
  </>;
}
