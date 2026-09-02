import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  type ForecastForm,
  type ScenarioFields,
  emptyContact,
  emptyBusiness,
  emptyBaseline,
  emptyEconomics,
  defaultScenario,
  calcScenario,
  money,
  fmt,
} from '../lib/forecast';

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: { url: string; parentElement: HTMLElement }) => void;
    };
  }
}

const CALENDLY_URL =
  'https://calendly.com/alo-webinarops/30min?hide_event_type_details=1&hide_gdpr_banner=1&background_color=05070b&text_color=ffffff&primary_color=2f6bff';
const CALENDLY_PAGE_URL = 'https://calendly.com/alo-webinarops/30min';

type Phase = 'form' | 'confirmed';
type SubmitStatus = 'idle' | 'submitting' | 'error' | 'success';

const STEP_LABELS = [
  '1 · Contact',
  '2 · Business and offer',
  '3 · Funnel baseline',
  '4 · Unit economics',
  '5 · Scenario and goals',
  '6 · Review and submit',
];

function railStyle(n: number, step: number): string {
  const base = 'padding:11px 14px;font-size:13.5px;font-weight:600;transition:color 160ms ease,border-color 160ms ease;text-align:left;background:transparent;border:none;border-left:2px solid;cursor:pointer;';
  if (n === step) return base + 'color:#fff;border-left-color:#2F6BFF;background:rgba(47,107,255,.07)';
  if (n < step) return base + 'color:#A8B3C4;border-left-color:rgba(47,107,255,.35)';
  return base + 'color:#5A6474;border-left-color:rgba(255,255,255,.1)';
}

function Field({
  label, value, onChange, placeholder, type = 'text', required = false,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}{required && ' *'}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={onChange}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function NumberField({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" value={Number.isFinite(value) ? value : ''} onChange={onChange} style={{ fontVariantNumeric: 'tabular-nums' }} />
    </div>
  );
}

export default function ForecastWizard() {
  const [phase, setPhase] = useState<Phase>('form');
  const [step, setStep] = useState(1);
  const [contact, setContact] = useState(emptyContact);
  const [business, setBusiness] = useState(emptyBusiness);
  const [baseline, setBaseline] = useState(emptyBaseline);
  const [economics, setEconomics] = useState(emptyEconomics);
  const [scenario, setScenario] = useState<ScenarioFields>(defaultScenario);
  const [consentProcessing, setConsentProcessing] = useState(false);
  const [consentEstimate, setConsentEstimate] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  const [booked, setBooked] = useState(false);

  const calRef = useRef<HTMLDivElement | null>(null);
  const calTimer = useRef<ReturnType<typeof setTimeout>>();

  // Capture first-touch attribution once, client-side only.
  const attribution = useMemo(() => {
    if (typeof window === 'undefined') {
      return { landingPage: '', referrer: '', utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: '', capturedAt: '' };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      landingPage: window.location.pathname + window.location.search,
      referrer: document.referrer || '',
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
      utmTerm: params.get('utm_term') || '',
      utmContent: params.get('utm_content') || '',
      capturedAt: new Date().toISOString(),
    };
  }, []);

  useEffect(() => {
    if (phase !== 'confirmed') return;
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.event === 'calendly.event_scheduled') setBooked(true);
    };
    window.addEventListener('message', onMessage);

    const initCal = () => {
      const el = calRef.current;
      if (!el || el.getAttribute('data-cal-ready')) return;
      if (window.Calendly && window.Calendly.initInlineWidget) {
        el.setAttribute('data-cal-ready', '1');
        window.Calendly.initInlineWidget({ url: CALENDLY_URL, parentElement: el });
      } else {
        calTimer.current = setTimeout(initCal, 300);
      }
    };
    initCal();

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(calTimer.current);
    };
  }, [phase, booked]);

  const target = useMemo(() => calcScenario(scenario, 1), [scenario]);
  const cons = useMemo(() => calcScenario(scenario, 0.78), [scenario]);
  const up = useMemo(() => calcScenario(scenario, 1.18), [scenario]);

  const setScenarioField = (key: keyof ScenarioFields) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setScenario((s) => ({ ...s, [key]: v === '' ? 0 : Number(v) }));
  };

  const goStep = (n: number) => { setStep(Math.max(1, Math.min(6, n))); window.scrollTo(0, 0); };
  const next = () => goStep(step + 1);
  const back = () => goStep(step - 1);

  const canSubmit = contact.firstName.trim() && contact.lastName.trim() && contact.email.trim() && consentEstimate;

  const handleSubmit = async () => {
    if (!canSubmit || submitStatus === 'submitting') return;
    setSubmitStatus('submitting');
    setSubmitError('');
    const payload: ForecastForm = {
      contact, business, baseline, economics, scenario, attribution,
      consentProcessing, consentEstimate,
    };
    try {
      const res = await fetch('/api/submit-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: payload, calculated: { target, conservative: cons, upside: up } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      setSubmitStatus('success');
      setPhase('confirmed');
      window.scrollTo(0, 0);
    } catch (err) {
      setSubmitStatus('error');
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const stepPct = (step / 6) * 100 + '%';

  const contactReported = [contact.firstName, contact.lastName, contact.email, contact.phone, contact.company, contact.website, contact.countryTz, contact.role].filter((v) => v.trim()).length;
  const businessReported = Object.values(business).filter((v) => v.trim()).length;
  const baselineReported = Object.values(baseline).filter((v) => v.trim()).length;
  const economicsReported = Object.values(economics).filter((v) => v.trim()).length;

  const showRate = (() => {
    const regs = Number(baseline.totalRegistrations);
    const att = Number(baseline.attendeesLive);
    if (!regs || !att) return null;
    return { regs, att, pct: ((att / regs) * 100).toFixed(1) };
  })();
  const coreConv = (() => {
    const att = Number(baseline.attendeesLive);
    const purch = Number(baseline.totalPurchasers);
    if (!att || !purch) return null;
    return { att, purch, pct: ((purch / att) * 100).toFixed(1) };
  })();

  if (phase === 'confirmed') {
    return (
      <main>
        <section className="section section--alt">
          <div className="container" style={{ maxWidth: 1180, padding: '72px 32px 56px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27D17F' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.2em', color: '#27D17F' }}>FORECAST SUBMITTED</span>
            </div>
            <h1 className="h1" style={{ maxWidth: '26ch', fontSize: 'clamp(30px,3.6vw,50px)', lineHeight: 1.06, letterSpacing: '-.03em' }}>
              Your Inputs Are In. Now Let&rsquo;s Review What the Numbers Actually Mean.
            </h1>
            <p style={{ margin: '26px 0 36px', maxWidth: '66ch', fontSize: 17, lineHeight: 1.6, color: '#A8B3C4' }}>
              Choose a time below for a Webinar Forecast Review. We&rsquo;ll pressure-test the assumptions, identify the biggest constraint in the model, and determine whether WebinarOps is the right operating partner for the next stage.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 10, overflow: 'hidden', maxWidth: 760 }}>
              <div style={{ background: '#05070B', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: '#27D17F', fontSize: 14, fontWeight: 700 }}>&check;</span><span style={{ fontSize: 13.5, fontWeight: 600, color: '#DCE5F3' }}>Submission received</span></div>
              <div style={{ background: '#05070B', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: '#27D17F', fontSize: 14, fontWeight: 700 }}>&check;</span><span style={{ fontSize: 13.5, fontWeight: 600, color: '#DCE5F3' }}>Forecast queued for review</span></div>
              {booked ? (
                <div style={{ background: 'rgba(39,209,127,.1)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: '#27D17F', fontSize: 14, fontWeight: 700 }}>&check;</span><span style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>Call booked</span></div>
              ) : (
                <div style={{ background: 'rgba(243,185,68,.08)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F3B944', flex: 'none' }} /><span style={{ fontSize: 13.5, fontWeight: 700, color: '#F3B944' }}>Call not booked yet</span></div>
              )}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container" style={{ maxWidth: 1180, padding: '56px 32px', display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 48, alignItems: 'start' }}>
            <div>
              {!booked ? (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,.09)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#DCE5F3' }}>Webinar Forecast Review &middot; 30 minutes</span>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: '#6B7688' }}>SELECT A TIME</span>
                  </div>
                  <div style={{ padding: '8px 8px 14px' }}>
                    <div ref={calRef} data-url={CALENDLY_URL} style={{ minWidth: 320, height: 700 }} />
                    <div style={{ padding: '0 14px', fontSize: 12.5, color: '#6B7688' }}>
                      Calendar not loading? <a href={CALENDLY_PAGE_URL} target="_blank" rel="noopener">Open the booking page in a new tab.</a>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid rgba(39,209,127,.3)', borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(180deg,rgba(39,209,127,.07),rgba(39,209,127,0))' }}>
                  <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(39,209,127,.22)', fontSize: 11, fontWeight: 600, letterSpacing: '.16em', color: '#27D17F' }}>CALL BOOKED</div>
                  <div style={{ padding: '30px 22px' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', marginBottom: 8 }}>Your Webinar Forecast Review is booked.</div>
                    <div style={{ fontSize: 14, color: '#A8B3C4', marginBottom: 24 }}>30 minutes &middot; details are in the confirmation email you just received.</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#8D9AAF' }}>Calendar invitation and reminders are sent automatically before the call. Reschedule and cancel links are in that same email.</div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 40 }}>
                <div className="eyebrow" style={{ marginBottom: 24 }}>WHAT HAPPENS ON THE CALL</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 10, overflow: 'hidden' }}>
                  {[
                    'Validate the inputs and assumptions you entered.',
                    'Map the economics from registration through backend monetization.',
                    'Identify the highest-leverage constraint in the model.',
                    'Decide whether to build, optimize, or wait.',
                  ].map((t, i) => (
                    <div key={t} style={{ background: '#05070B', padding: '18px 20px', display: 'flex', gap: 14 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#2F6BFF', paddingTop: 2 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ fontSize: 14.5, lineHeight: 1.5, color: '#DCE5F3' }}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 20 }}>PREPARE FOR THE REVIEW</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
                {[
                  'Recent traffic and registration numbers',
                  'Webinar attendance and conversion data, if available',
                  'Offer pricing and payment-plan details',
                  'Media-spend data',
                  'Sales close rates and backend economics, if applicable',
                  'Other decision-makers who should attend',
                ].map((t) => <div key={t} className="dot-item" style={{ paddingLeft: 18 }}>{t}</div>)}
              </div>
              <div className="eyebrow" style={{ marginBottom: 16 }}>QUESTIONS</div>
              <div className="faq-list">
                <details><summary>Is the forecast a guarantee?</summary><div className="faq-answer" style={{ fontSize: 13.5 }}>No. It is a model of the assumptions you entered, and its purpose is to make those assumptions arguable before spend.</div></details>
                <details><summary>Who should attend?</summary><div className="faq-answer" style={{ fontSize: 13.5 }}>Whoever can approve budget and whoever owns the current funnel numbers. Two people is usually right.</div></details>
                <details><summary>What if my data is incomplete?</summary><div className="faq-answer" style={{ fontSize: 13.5 }}>That is itself a finding, and often the first constraint. Bring what you have.</div></details>
                <details><summary>Is this a fit if we have never run a webinar?</summary><div className="faq-answer" style={{ fontSize: 13.5 }}>Sometimes. The requirement is a validated offer with real customers, not prior webinar history.</div></details>
                <details><summary>What happens after the review?</summary><div className="faq-answer" style={{ fontSize: 13.5 }}>Recommendations and next steps depend on what the forecast review surfaces. Nothing is committed on the call.</div></details>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={{ background: '#000' }}>
      <div className="section section--alt">
        <div className="container" style={{ maxWidth: 1180, padding: '44px 32px 0' }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>WEBINAR FORECAST</div>
          <h1 className="h1" style={{ maxWidth: '24ch', fontSize: 'clamp(28px,3.2vw,42px)', lineHeight: 1.08, letterSpacing: '-.03em' }}>
            Model the economics before you scale the spend.
          </h1>
          <p style={{ margin: '0 0 28px', maxWidth: '62ch', fontSize: 16, lineHeight: 1.6, color: '#8D9AAF' }}>
            Six steps, roughly nine minutes. Enter what you know and mark what you do not - unknown values stay unknown rather than being treated as zero.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 20 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.09)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#2F6BFF', borderRadius: 2, transition: 'width 280ms cubic-bezier(.23,1,.32,1)', width: stepPct }} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#8D9AAF', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>Step {step} of 6</div>
          </div>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 1180, padding: '44px 32px 96px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 48, alignItems: 'start' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 96 }}>
          {STEP_LABELS.map((label, i) => (
            <button key={label} type="button" style={{ ...cssTextToObj(railStyle(i + 1, step)) }} onClick={() => goStep(i + 1)}>{label}</button>
          ))}
        </nav>

        <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, background: '#05070B', overflow: 'hidden' }}>

          {step === 1 && (
            <div style={{ padding: '36px 36px 32px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: '-.02em' }}>Contact and attribution</h2>
              <p style={{ margin: '0 0 32px', fontSize: 14.5, lineHeight: 1.6, color: '#6B7688', maxWidth: '62ch' }}>So the forecast reaches the right person, and so we know which promise you saw before you got here.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <Field label="First name" required value={contact.firstName} placeholder="Alex" onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))} />
                <Field label="Last name" required value={contact.lastName} placeholder="Mercer" onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))} />
                <Field label="Business email" required type="email" value={contact.email} placeholder="alex@company.com" onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
                <Field label="Phone" value={contact.phone} placeholder="+1 555 0100" onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
                <Field label="Company or brand" value={contact.company} placeholder="Company" onChange={(e) => setContact((c) => ({ ...c, company: e.target.value }))} />
                <Field label="Website" value={contact.website} placeholder="company.com" onChange={(e) => setContact((c) => ({ ...c, website: e.target.value }))} />
                <Field label="Country and time zone" value={contact.countryTz} placeholder="United States · ET" onChange={(e) => setContact((c) => ({ ...c, countryTz: e.target.value }))} />
                <Field label="Role" value={contact.role} placeholder="Founder" onChange={(e) => setContact((c) => ({ ...c, role: e.target.value }))} />
              </div>
              <div style={{ marginTop: 26, display: 'flex', gap: 12, alignItems: 'flex-start', padding: 16, border: '1px solid rgba(255,255,255,.08)', borderRadius: 8 }}>
                <input type="checkbox" checked={consentProcessing} onChange={(e) => setConsentProcessing(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2F6BFF' }} />
                <span style={{ fontSize: 13, lineHeight: 1.6, color: '#8D9AAF' }}>I agree to WebinarOps processing this information to produce and review my forecast, as described in the <a href="#">Privacy Policy</a>. Separately, you may send me occasional operating notes on webinar economics.</span>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ padding: '36px 36px 32px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: '-.02em' }}>Business and offer</h2>
              <p style={{ margin: '0 0 32px', fontSize: 14.5, lineHeight: 1.6, color: '#6B7688', maxWidth: '62ch' }}>The offer decides what the funnel can afford to pay for a registrant. Everything downstream is priced against these numbers.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <Field label="Business model or niche" value={business.niche} placeholder="Certification programme" onChange={(e) => setBusiness((b) => ({ ...b, niche: e.target.value }))} />
                <Field label="Who buys" value={business.whoBuys} placeholder="Operations managers, 30-45" onChange={(e) => setBusiness((b) => ({ ...b, whoBuys: e.target.value }))} />
                <Field label="Core offer name" value={business.offerName} placeholder="The Operator Programme" onChange={(e) => setBusiness((b) => ({ ...b, offerName: e.target.value }))} />
                <Field label="Offer format" value={business.offerFormat} placeholder="Course + community" onChange={(e) => setBusiness((b) => ({ ...b, offerFormat: e.target.value }))} />
                <Field label="Price and currency" value={business.price} placeholder="1997 USD" onChange={(e) => setBusiness((b) => ({ ...b, price: e.target.value }))} />
                <Field label="Cash collected at purchase" value={business.cashCollectedAtPurchase} placeholder="e.g. 60% on a 3-pay plan" onChange={(e) => setBusiness((b) => ({ ...b, cashCollectedAtPurchase: e.target.value }))} />
                <Field label="Refund or guarantee structure" value={business.refundPolicy} placeholder="14-day, no conditions" onChange={(e) => setBusiness((b) => ({ ...b, refundPolicy: e.target.value }))} />
                <SelectField label="Current monthly revenue" value={business.monthlyRevenue} options={['$50k - $100k', '$100k - $250k', '$250k - $500k', '$500k+', 'Prefer not to say']} onChange={(e) => setBusiness((b) => ({ ...b, monthlyRevenue: e.target.value }))} />
                <Field label="Fulfillment capacity per month" value={business.fulfillmentCapacity} placeholder="120 new customers" onChange={(e) => setBusiness((b) => ({ ...b, fulfillmentCapacity: e.target.value }))} />
                <Field label="Customers to date" value={business.customersToDate} placeholder="Approximate is fine" onChange={(e) => setBusiness((b) => ({ ...b, customersToDate: e.target.value }))} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ padding: '36px 36px 32px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: '-.02em' }}>Current funnel baseline</h2>
              <p style={{ margin: '0 0 24px', fontSize: 14.5, lineHeight: 1.6, color: '#6B7688', maxWidth: '62ch' }}>Raw counts are more useful than remembered rates. Enter the counts you have and the model derives the rate, showing the formula it used.</p>
              <div style={{ marginBottom: 28, padding: '14px 16px', border: '1px solid rgba(47,107,255,.28)', background: 'rgba(47,107,255,.05)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: '#DCE5F3' }}>
                Every field here accepts <strong style={{ color: '#fff' }}>Not currently tracked</strong>. Nothing is converted to zero on your behalf.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                <SelectField label="Webinar history" value={baseline.webinarHistory} options={['Recurring live', 'Occasional', 'Automated', 'Hybrid', 'Never']} onChange={(e) => setBaseline((b) => ({ ...b, webinarHistory: e.target.value }))} />
                <Field label="Current frequency" value={baseline.frequency} placeholder="2 per month" onChange={(e) => setBaseline((b) => ({ ...b, frequency: e.target.value }))} />
                <Field label="Traffic sources" value={baseline.trafficSources} placeholder="Meta, YouTube, list" onChange={(e) => setBaseline((b) => ({ ...b, trafficSources: e.target.value }))} />
                <Field label="Monthly ad spend" value={baseline.monthlyAdSpend} placeholder="$24,000" onChange={(e) => setBaseline((b) => ({ ...b, monthlyAdSpend: e.target.value }))} />
                <Field label="Visitors in period" value={baseline.visitors} placeholder="41,200" onChange={(e) => setBaseline((b) => ({ ...b, visitors: e.target.value }))} />
                <Field label="Total registrations" value={baseline.totalRegistrations} placeholder="1,740" onChange={(e) => setBaseline((b) => ({ ...b, totalRegistrations: e.target.value }))} />
                <Field label="Paid / organic mix" value={baseline.paidOrganicMix} placeholder="80 / 20" onChange={(e) => setBaseline((b) => ({ ...b, paidOrganicMix: e.target.value }))} />
                <Field label="VIP price" value={baseline.vipPrice} placeholder="$97 · none yet" onChange={(e) => setBaseline((b) => ({ ...b, vipPrice: e.target.value }))} />
                <Field label="VIP take rate" value={baseline.vipTakeRate} placeholder="Not currently tracked" onChange={(e) => setBaseline((b) => ({ ...b, vipTakeRate: e.target.value }))} />
                <Field label="Attendees (live)" value={baseline.attendeesLive} placeholder="668" onChange={(e) => setBaseline((b) => ({ ...b, attendeesLive: e.target.value }))} />
                <Field label="Total purchasers" value={baseline.totalPurchasers} placeholder="42" onChange={(e) => setBaseline((b) => ({ ...b, totalPurchasers: e.target.value }))} />
                <Field label="Replay views / sales" value={baseline.replayViewsSales} placeholder="410 / 11" onChange={(e) => setBaseline((b) => ({ ...b, replayViewsSales: e.target.value }))} />
                <Field label="Checkout starts / completed" value={baseline.checkoutStartsCompleted} placeholder="Not currently tracked" onChange={(e) => setBaseline((b) => ({ ...b, checkoutStartsCompleted: e.target.value }))} />
                <Field label="Call show / close rate" value={baseline.callShowClose} placeholder="No call step" onChange={(e) => setBaseline((b) => ({ ...b, callShowClose: e.target.value }))} />
                <Field label="Refund / chargeback rate" value={baseline.refundChargebackRate} placeholder="6.5%" onChange={(e) => setBaseline((b) => ({ ...b, refundChargebackRate: e.target.value }))} />
              </div>
              <div style={{ marginTop: 24, padding: '16px 18px', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12, lineHeight: 1.8, color: '#6B7688' }}>
                DERIVED FROM YOUR ENTRIES<br />
                {showRate ? (
                  <>show_rate = attendees / registrations = {showRate.att} / {showRate.regs} = <span style={{ color: '#5D8BFF' }}>{showRate.pct}%</span><br /></>
                ) : (
                  <>show_rate = attendees / registrations = <span style={{ color: '#5A6474' }}>enter both above</span><br /></>
                )}
                {coreConv ? (
                  <>core_conversion = purchasers / attendees = {coreConv.purch} / {coreConv.att} = <span style={{ color: '#5D8BFF' }}>{coreConv.pct}%</span></>
                ) : (
                  <>core_conversion = purchasers / attendees = <span style={{ color: '#5A6474' }}>enter both above</span></>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ padding: '36px 36px 32px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: '-.02em' }}>Unit economics and monetization</h2>
              <p style={{ margin: '0 0 32px', fontSize: 14.5, lineHeight: 1.6, color: '#6B7688', maxWidth: '62ch' }}>This is the section most teams cannot complete, and the reason is usually the finding rather than the inconvenience.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                <Field label="Gross revenue in period" value={economics.grossRevenue} placeholder="$104,800" onChange={(e) => setEconomics((v) => ({ ...v, grossRevenue: e.target.value }))} />
                <Field label="Cash collected in period" value={economics.cashCollected} placeholder="$71,300" onChange={(e) => setEconomics((v) => ({ ...v, cashCollected: e.target.value }))} />
                <Field label="Fulfillment cost per customer" value={economics.fulfillmentCostPerCustomer} placeholder="$140" onChange={(e) => setEconomics((v) => ({ ...v, fulfillmentCostPerCustomer: e.target.value }))} />
                <Field label="Sales commissions" value={economics.salesCommissions} placeholder="10% of collected" onChange={(e) => setEconomics((v) => ({ ...v, salesCommissions: e.target.value }))} />
                <Field label="Processing fees" value={economics.processingFees} placeholder="2.9% + $0.30" onChange={(e) => setEconomics((v) => ({ ...v, processingFees: e.target.value }))} />
                <Field label="Other campaign costs" value={economics.otherCosts} placeholder="Not currently tracked" onChange={(e) => setEconomics((v) => ({ ...v, otherCosts: e.target.value }))} />
                <Field label="Order bump price / take" value={economics.bumpPriceTake} placeholder="$197 / 22%" onChange={(e) => setEconomics((v) => ({ ...v, bumpPriceTake: e.target.value }))} />
                <Field label="Upsell price / take" value={economics.upsellPriceTake} placeholder="$1,500 / 9%" onChange={(e) => setEconomics((v) => ({ ...v, upsellPriceTake: e.target.value }))} />
                <Field label="Downsell price / take" value={economics.downsellPriceTake} placeholder="None yet" onChange={(e) => setEconomics((v) => ({ ...v, downsellPriceTake: e.target.value }))} />
                <Field label="High-ticket price" value={economics.highTicketPrice} placeholder="$8,000" onChange={(e) => setEconomics((v) => ({ ...v, highTicketPrice: e.target.value }))} />
                <Field label="Ascension booking / close" value={economics.ascensionBookingClose} placeholder="Not currently tracked" onChange={(e) => setEconomics((v) => ({ ...v, ascensionBookingClose: e.target.value }))} />
                <Field label="Continuity revenue per month" value={economics.continuityRevenue} placeholder="$47 / member" onChange={(e) => setEconomics((v) => ({ ...v, continuityRevenue: e.target.value }))} />
                <Field label="Retention or churn" value={economics.retentionChurn} placeholder="4.1 months average" onChange={(e) => setEconomics((v) => ({ ...v, retentionChurn: e.target.value }))} />
                <Field label="Customer lifetime value" value={economics.ltv} placeholder="Not currently tracked" onChange={(e) => setEconomics((v) => ({ ...v, ltv: e.target.value }))} />
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ padding: '36px 36px 32px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: '-.02em' }}>Forecast scenario and goals</h2>
              <p style={{ margin: '0 0 32px', fontSize: 14.5, lineHeight: 1.6, color: '#6B7688', maxWidth: '62ch' }}>These are the assumptions the model runs on. Change one and the range below moves with it - that is the point of doing this before the spend.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 32 }}>
                <NumberField label="Monthly media budget ($)" value={scenario.budget} onChange={setScenarioField('budget')} />
                <NumberField label="Expected cost per reg ($)" value={scenario.cpr} onChange={setScenarioField('cpr')} />
                <NumberField label="Organic registrations" value={scenario.organic} onChange={setScenarioField('organic')} />
                <NumberField label="Attendance rate (%)" value={scenario.show} onChange={setScenarioField('show')} />
                <NumberField label="Attendee conversion (%)" value={scenario.conv} onChange={setScenarioField('conv')} />
                <NumberField label="Core offer price ($)" value={scenario.price} onChange={setScenarioField('price')} />
                <NumberField label="Replay uplift on buyers (%)" value={scenario.replay} onChange={setScenarioField('replay')} />
                <NumberField label="VIP take rate (%)" value={scenario.vipTake} onChange={setScenarioField('vipTake')} />
                <NumberField label="VIP price ($)" value={scenario.vipPrice} onChange={setScenarioField('vipPrice')} />
                <NumberField label="Bump take rate (%)" value={scenario.bumpTake} onChange={setScenarioField('bumpTake')} />
                <NumberField label="Bump price ($)" value={scenario.bumpPrice} onChange={setScenarioField('bumpPrice')} />
                <NumberField label="Upsell take rate (%)" value={scenario.upTake} onChange={setScenarioField('upTake')} />
                <NumberField label="Upsell price ($)" value={scenario.upPrice} onChange={setScenarioField('upPrice')} />
              </div>

              <div style={{ border: '1px solid rgba(47,107,255,.28)', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg,rgba(47,107,255,.06),rgba(47,107,255,0))' }}>
                <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(47,107,255,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.14em', color: '#5D8BFF' }}>LIVE MODEL · TARGET SCENARIO</span>
                  <span className="badge badge--amber">ESTIMATE</span>
                </div>
                <div style={{ padding: '26px 22px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 8, overflow: 'hidden', marginBottom: 22 }}>
                    <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>REGISTRATIONS</div><div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(target.regs)}</div></div>
                    <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>ATTENDEES</div><div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(target.attendees)}</div></div>
                    <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>BUYERS</div><div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(target.buyers)}</div></div>
                    <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>REV / REGISTRANT</div><div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>${target.rpr.toFixed(2)}</div></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, alignItems: 'start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ background: '#07090E', padding: '13px 18px', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13.5, color: '#8D9AAF' }}>Core offer revenue</span><span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(target.core)}</span></div>
                      <div style={{ background: '#07090E', padding: '13px 18px', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13.5, color: '#8D9AAF' }}>VIP revenue</span><span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(target.vip)}</span></div>
                      <div style={{ background: '#07090E', padding: '13px 18px', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13.5, color: '#8D9AAF' }}>Order bump revenue</span><span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(target.bump)}</span></div>
                      <div style={{ background: '#07090E', padding: '13px 18px', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13.5, color: '#8D9AAF' }}>Upsell revenue</span><span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(target.up)}</span></div>
                      <div style={{ background: '#07090E', padding: '13px 18px', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13.5, color: '#8D9AAF' }}>Media spend</span><span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#8D9AAF' }}>&minus;{money(target.spend)}</span></div>
                      <div style={{ background: 'rgba(47,107,255,.1)', padding: '15px 18px', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>Contribution before delivery</span><span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{money(target.contribution)}</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 12 }}>SENSITIVITY</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '14px 16px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 12, letterSpacing: '.1em', color: '#8D9AAF' }}>CONSERVATIVE</span><span style={{ fontSize: 12, color: '#6B7688', fontVariantNumeric: 'tabular-nums' }}>{cons.roas.toFixed(2)}x</span></div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(cons.gross)}</div></div>
                        <div style={{ border: '1px solid rgba(47,107,255,.4)', borderRadius: 8, padding: '14px 16px', background: 'rgba(47,107,255,.07)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 12, letterSpacing: '.1em', color: '#5D8BFF' }}>TARGET</span><span style={{ fontSize: 12, color: '#5D8BFF', fontVariantNumeric: 'tabular-nums' }}>{target.roas.toFixed(2)}x</span></div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(target.gross)}</div></div>
                        <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '14px 16px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 12, letterSpacing: '.1em', color: '#8D9AAF' }}>UPSIDE</span><span style={{ fontSize: 12, color: '#6B7688', fontVariantNumeric: 'tabular-nums' }}>{up.roas.toFixed(2)}x</span></div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(up.gross)}</div></div>
                      </div>
                    </div>
                  </div>
                  <details style={{ marginTop: 22 }}>
                    <summary style={{ cursor: 'pointer', listStyle: 'none', fontSize: 13, fontWeight: 600, color: '#5D8BFF' }}>How this is calculated</summary>
                    <div style={{ marginTop: 14, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 11.5, lineHeight: 1.9, color: '#6B7688' }}>
                      paid_registrations = media_budget / cost_per_registration<br />
                      registrations = paid_registrations + organic_registrations<br />
                      attendees = registrations &times; attendance_rate<br />
                      core_buyers = attendees &times; attendee_conversion<br />
                      replay_buyers = core_buyers &times; replay_uplift<br />
                      vip_revenue = registrations &times; vip_take &times; vip_price<br />
                      bump_revenue = buyers &times; bump_take &times; bump_price<br />
                      upsell_revenue = buyers &times; upsell_take &times; upsell_price<br />
                      contribution = gross_revenue &minus; media_spend &minus; variable_costs<br />
                      conservative = target &times; 0.78 &middot; upside = target &times; 1.18
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div style={{ padding: '36px 36px 32px' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 700, letterSpacing: '-.02em' }}>Review and submit</h2>
              <p style={{ margin: '0 0 28px', fontSize: 14.5, lineHeight: 1.6, color: '#6B7688', maxWidth: '62ch' }}>Every value is labelled by how it got here. Edit any section before generating the forecast.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                <ReviewRow title="Contact and attribution" detail={`8 fields · ${contactReported} reported`} status={contactReported === 8 ? 'complete' : `${8 - contactReported} unknown`} onEdit={() => goStep(1)} />
                <ReviewRow title="Business and offer" detail={`10 fields · ${businessReported} reported`} status={businessReported === 10 ? 'complete' : `${10 - businessReported} unknown`} onEdit={() => goStep(2)} />
                <ReviewRow title="Current funnel baseline" detail={`15 fields · ${baselineReported} reported`} status={baselineReported === 15 ? 'complete' : `${15 - baselineReported} unknown`} onEdit={() => goStep(3)} />
                <ReviewRow title="Unit economics" detail={`14 fields · ${economicsReported} reported`} status={economicsReported === 14 ? 'complete' : `${14 - economicsReported} unknown`} onEdit={() => goStep(4)} />
                <ReviewRow title="Scenario and goals" detail="13 assumptions · all estimated by you" status="estimated" onEdit={() => goStep(5)} />
              </div>
              <div style={{ padding: '18px 20px', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={consentEstimate} onChange={(e) => setConsentEstimate(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2F6BFF' }} />
                  <span style={{ fontSize: 13.5, lineHeight: 1.65, color: '#A8B3C4' }}>I understand that forecasts are estimates based on the information and assumptions provided, and are not guarantees of revenue, profitability, advertising performance, or business results. *</span>
                </div>
              </div>
              {submitStatus === 'error' && (
                <div style={{ marginBottom: 20, padding: '14px 16px', border: '1px solid rgba(255,98,98,.35)', background: 'rgba(255,98,98,.06)', borderRadius: 8, fontSize: 13.5, lineHeight: 1.5, color: '#FFB3B3' }}>
                  {submitError || 'Something went wrong sending your forecast.'} Please try again, or email <a href="mailto:hello@webinarops.com">hello@webinarops.com</a> directly.
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitStatus === 'submitting'} className="btn btn-primary" style={{ opacity: !canSubmit || submitStatus === 'submitting' ? 0.6 : 1, cursor: !canSubmit || submitStatus === 'submitting' ? 'not-allowed' : 'pointer' }}>
                  {submitStatus === 'submitting' ? 'Submitting…' : 'Generate My Webinar Forecast'}
                </button>
                <span style={{ fontSize: 12.5, color: '#6B7688', maxWidth: '38ch', lineHeight: 1.5 }}>
                  {canSubmit ? 'Submitted once. A duplicate click cannot create a second record.' : 'First name, last name, business email, and the acknowledgement above are required.'}
                </span>
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid rgba(255,255,255,.09)', padding: '20px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#04060A' }}>
            <button type="button" onClick={back} disabled={step === 1} className="btn btn-secondary" style={{ visibility: step === 1 ? 'hidden' : 'visible' }}>Back</button>
            {step < 6 && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: '#6B7688' }}>Saved · about {Math.max(1, 7 - step)} minutes left</span>
                <button type="button" onClick={next} className="btn btn-light">Continue</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function ReviewRow({ title, detail, status, onEdit }: { title: string; detail: string; status: 'complete' | 'estimated' | string; onEdit: () => void }) {
  const badge = status === 'complete'
    ? <span className="badge badge--green">COMPLETE</span>
    : status === 'estimated'
      ? <span className="badge badge--blue">ESTIMATED</span>
      : <span className="badge badge--amber">{status.toUpperCase()}</span>;
  return (
    <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#6B7688' }}>{detail}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {badge}
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', color: '#5D8BFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit</button>
      </div>
    </div>
  );
}

function cssTextToObj(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  css.split(';').forEach((decl) => {
    const [k, v] = decl.split(':');
    if (!k || !v) return;
    const camel = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v.trim();
  });
  return out;
}
