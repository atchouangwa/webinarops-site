import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  type ForecastForm,
  type ScenarioFields,
  type QualificationFields,
  type ContactFields,
  type FitAnswer,
  type Question,
  ALL_QUESTIONS,
  emptyQualification,
  emptyContact,
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

const FIT_OPTIONS: { value: FitAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
];

export default function ForecastWizard() {
  const [phase, setPhase] = useState<Phase>('form');
  // 0..ALL_QUESTIONS.length-1 = a question; ALL_QUESTIONS.length = the final consent/submit screen.
  const [qIndex, setQIndex] = useState(0);
  const [qualification, setQualification] = useState<QualificationFields>(emptyQualification);
  const [contact, setContact] = useState<ContactFields>(emptyContact);
  const [scenario, setScenario] = useState<ScenarioFields>(defaultScenario);
  const [consentEstimate, setConsentEstimate] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [booked, setBooked] = useState(false);

  const calRef = useRef<HTMLDivElement | null>(null);
  const calTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const total = ALL_QUESTIONS.length;
  const question: Question | null = qIndex < total ? ALL_QUESTIONS[qIndex] : null;

  useEffect(() => {
    setValidationError('');
    if (question && (question.kind === 'text' || question.kind === 'email' || question.kind === 'number')) {
      inputRef.current?.focus();
    }
  }, [qIndex]);

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

  function valueFor(q: Question): string {
    if (q.kind === 'fit') return qualification[q.id];
    if (q.kind === 'number') return String(scenario[q.id]);
    return contact[q.id];
  }

  function setValue(q: Question, v: string) {
    if (q.kind === 'fit') {
      setQualification((s) => ({ ...s, [q.id]: v as FitAnswer }));
    } else if (q.kind === 'number') {
      setScenario((s) => ({ ...s, [q.id]: v === '' ? 0 : Number(v) }));
    } else {
      setContact((s) => ({ ...s, [q.id]: v }));
    }
  }

  const goNext = () => {
    if (!question) return;
    if ((question.kind === 'text' || question.kind === 'email') && question.required && !valueFor(question).trim()) {
      setValidationError('This one is required.');
      return;
    }
    if (question.kind === 'email' && valueFor(question).trim() && !/\S+@\S+\.\S+/.test(valueFor(question))) {
      setValidationError('That doesn’t look like a valid email.');
      return;
    }
    setValidationError('');
    setQIndex((i) => Math.min(total, i + 1));
  };
  const goBack = () => setQIndex((i) => Math.max(0, i - 1));

  const canSubmit = contact.firstName.trim() && contact.lastName.trim() && contact.email.trim() && consentEstimate;

  const handleSubmit = async () => {
    if (!canSubmit || submitStatus === 'submitting') return;
    setSubmitStatus('submitting');
    setSubmitError('');
    const payload: ForecastForm = { qualification, contact, scenario, attribution, consentEstimate };
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

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goNext();
    }
  };

  if (phase === 'confirmed') {
    return (
      <main>
        <section className="section section--alt">
          <div className="container" style={{ maxWidth: 1180, padding: '72px 32px 56px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27D17F' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.2em', color: '#27D17F' }}>FORECAST BUILT</span>
            </div>
            <h1 className="h1" style={{ maxWidth: '26ch', fontSize: 'clamp(30px,3.6vw,50px)', lineHeight: 1.06, letterSpacing: '-.03em' }}>
              Here&rsquo;s Your Modelled Forecast.
            </h1>
            <p style={{ margin: '26px 0 36px', maxWidth: '66ch', fontSize: 17, lineHeight: 1.6, color: '#A8B3C4' }}>
              Built from the assumptions you entered, below. If you want a second pair of eyes on those assumptions and the constraint capping the model, book a 30-minute Webinar Forecast Review.
            </p>
            <div className="stack-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 10, overflow: 'hidden', maxWidth: 760 }}>
              <div style={{ background: '#05070B', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: '#27D17F', fontSize: 14, fontWeight: 700 }}>&check;</span><span style={{ fontSize: 13.5, fontWeight: 600, color: '#DCE5F3' }}>Submission received</span></div>
              <div style={{ background: '#05070B', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: '#27D17F', fontSize: 14, fontWeight: 700 }}>&check;</span><span style={{ fontSize: 13.5, fontWeight: 600, color: '#DCE5F3' }}>Forecast built</span></div>
              {booked ? (
                <div style={{ background: 'rgba(39,209,127,.1)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: '#27D17F', fontSize: 14, fontWeight: 700 }}>&check;</span><span style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>Call booked</span></div>
              ) : (
                <div style={{ background: 'rgba(243,185,68,.08)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F3B944', flex: 'none' }} /><span style={{ fontSize: 13.5, fontWeight: 700, color: '#F3B944' }}>Call not booked yet</span></div>
              )}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container" style={{ maxWidth: 1180, padding: '56px 32px' }}>
            <div style={{ border: '1px solid rgba(47,107,255,.28)', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg,rgba(47,107,255,.06),rgba(47,107,255,0))' }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(47,107,255,.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.14em', color: '#5D8BFF' }}>YOUR MODELLED FORECAST · TARGET SCENARIO</span>
                <span className="badge badge--amber">ESTIMATE</span>
              </div>
              <div style={{ padding: '26px 22px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.14em', color: '#6B7688', marginBottom: 8 }}>MODELLED MONTHLY GROSS</div>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1, marginBottom: 22, fontVariantNumeric: 'tabular-nums' }}>{money(target.gross)}</div>
                <div className="grid-2-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 8, overflow: 'hidden', marginBottom: 22 }}>
                  <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>REGISTRATIONS</div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(target.regs)}</div></div>
                  <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>ATTENDEES</div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(target.attendees)}</div></div>
                  <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>BUYERS</div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(target.buyers)}</div></div>
                  <div style={{ background: '#07090E', padding: '16px 18px' }}><div style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#6B7688', marginBottom: 8 }}>REV / REGISTRANT</div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>${target.rpr.toFixed(2)}</div></div>
                </div>
                <div className="grid-2-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 22 }}>
                  <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '14px 16px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 12, letterSpacing: '.1em', color: '#8D9AAF' }}>CONSERVATIVE</span><span style={{ fontSize: 12, color: '#6B7688', fontVariantNumeric: 'tabular-nums' }}>{cons.roas.toFixed(2)}x</span></div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(cons.gross)}</div></div>
                  <div style={{ border: '1px solid rgba(47,107,255,.4)', borderRadius: 8, padding: '14px 16px', background: 'rgba(47,107,255,.07)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 12, letterSpacing: '.1em', color: '#5D8BFF' }}>TARGET</span><span style={{ fontSize: 12, color: '#5D8BFF', fontVariantNumeric: 'tabular-nums' }}>{target.roas.toFixed(2)}x</span></div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(target.gross)}</div></div>
                  <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '14px 16px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 12, letterSpacing: '.1em', color: '#8D9AAF' }}>UPSIDE</span><span style={{ fontSize: 12, color: '#6B7688', fontVariantNumeric: 'tabular-nums' }}>{up.roas.toFixed(2)}x</span></div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{money(up.gross)}</div></div>
                </div>
                <details>
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
                <div style={{ marginTop: 18, fontSize: 12, lineHeight: 1.55, color: '#6B7688' }}>Forecasts are estimates based on the information and assumptions you provided. They are not guarantees of revenue, profitability, advertising performance, or business results.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container stack-mobile" style={{ maxWidth: 1180, padding: '0 32px 56px', display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 48, alignItems: 'start' }}>
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
                    'Validate the inputs and assumptions behind the number above.',
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

  const progressPct = ((qIndex) / (total + 1)) * 100 + '%';

  return (
    <main style={{ background: '#000', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 3, background: 'rgba(255,255,255,.08)', flex: 'none' }}>
        <div style={{ height: '100%', background: '#2F6BFF', transition: 'width 220ms cubic-bezier(.23,1,.32,1)', width: progressPct }} />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 24px', minHeight: '76vh' }}>
        <div key={qIndex} className="q-enter" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
          {qIndex > 0 && (
            <button type="button" onClick={goBack} style={{ background: 'none', border: 'none', color: '#5A6474', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
              &larr; Back
            </button>
          )}

          {question ? (
            <QuestionScreen
              question={question}
              value={valueFor(question)}
              onChange={(v) => { setValidationError(''); setValue(question, v); }}
              onAdvance={goNext}
              inputRef={inputRef}
              onKeyDown={onKeyDown}
              index={qIndex}
              total={total}
              error={validationError}
            />
          ) : (
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>LAST STEP</div>
              <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(24px,3.4vw,32px)', fontWeight: 800, letterSpacing: '-.02em' }}>Ready to build it.</h2>
              <p style={{ margin: '0 0 28px', fontSize: 15.5, lineHeight: 1.6, color: '#8D9AAF' }}>
                We&rsquo;ll model your numbers instantly on the next screen, and email a copy to {contact.email || 'you'}.
              </p>
              <div style={{ padding: '16px 18px', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, marginBottom: 24 }}>
                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={consentEstimate} onChange={(e) => setConsentEstimate(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2F6BFF', flex: 'none' }} />
                  <span style={{ fontSize: 13.5, lineHeight: 1.6, color: '#A8B3C4' }}>I understand that forecasts are estimates based on the information and assumptions provided, and are not guarantees of revenue, profitability, advertising performance, or business results.</span>
                </label>
              </div>
              {submitStatus === 'error' && (
                <div style={{ marginBottom: 20, padding: '14px 16px', border: '1px solid rgba(255,98,98,.35)', background: 'rgba(255,98,98,.06)', borderRadius: 8, fontSize: 13.5, lineHeight: 1.5, color: '#FFB3B3' }}>
                  {submitError || 'Something went wrong sending your forecast.'} Please try again, or email <a href="mailto:hello@webinarops.com">hello@webinarops.com</a> directly.
                </div>
              )}
              <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitStatus === 'submitting'} className="btn btn-primary" style={{ fontSize: 16, padding: '16px 32px', opacity: !canSubmit || submitStatus === 'submitting' ? 0.6 : 1, cursor: !canSubmit || submitStatus === 'submitting' ? 'not-allowed' : 'pointer' }}>
                {submitStatus === 'submitting' ? 'Building…' : 'Build My Webinar Forecast'}
              </button>
              {!canSubmit && <div style={{ marginTop: 12, fontSize: 12.5, color: '#6B7688' }}>The acknowledgement above is required to continue.</div>}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function QuestionScreen({
  question, value, onChange, onAdvance, inputRef, onKeyDown, index, total, error,
}: {
  question: Question;
  value: string;
  onChange: (v: string) => void;
  onAdvance: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  index: number;
  total: number;
  error: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.1em', color: '#5A6474', marginBottom: 14, fontVariantNumeric: 'tabular-nums' }}>
        {index + 1} / {total}
      </div>

      {question.kind === 'fit' ? (
        <FitQuestionBody question={question} value={value as FitAnswer} onChange={onChange} onAdvance={onAdvance} />
      ) : (
        <TextOrNumberQuestion
          question={question}
          value={value}
          onChange={onChange}
          onAdvance={onAdvance}
          inputRef={inputRef}
          onKeyDown={onKeyDown}
          error={error}
        />
      )}
    </div>
  );
}

function TextOrNumberQuestion({
  question, value, onChange, onAdvance, inputRef, onKeyDown, error,
}: {
  question: Extract<Question, { kind: 'text' | 'email' | 'number' }>;
  value: string;
  onChange: (v: string) => void;
  onAdvance: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  error: string;
}) {
  const isNumber = question.kind === 'number';
  const placeholder = question.kind === 'text' || question.kind === 'email' ? question.placeholder : undefined;
  const prefix = isNumber ? question.prefix : undefined;
  const suffix = isNumber ? question.suffix : undefined;

  return (
    <>
      <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,3.6vw,34px)', fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.2 }}>
        {question.label}
      </h2>
      {isNumber && (
        <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.5, color: '#6B7688' }}>{question.help}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: isNumber ? 0 : 28 }}>
        {prefix && <span style={{ fontSize: 26, fontWeight: 700, color: '#5A6474' }}>{prefix}</span>}
        <input
          ref={inputRef}
          type={isNumber ? 'number' : question.kind === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', borderBottom: '2px solid rgba(255,255,255,.16)',
            color: '#fff', fontSize: 'clamp(22px,4vw,30px)', fontWeight: 700, padding: '8px 2px', outline: 'none',
            fontVariantNumeric: 'tabular-nums',
          }}
          onFocus={(e) => (e.currentTarget.style.borderBottomColor = '#2F6BFF')}
          onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,.16)')}
        />
        {suffix && <span style={{ fontSize: 26, fontWeight: 700, color: '#5A6474' }}>{suffix}</span>}
      </div>
      {error && <div style={{ marginTop: 10, fontSize: 13, color: '#FF8A8A' }}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 28 }}>
        <button type="button" onClick={onAdvance} className="btn btn-primary" style={{ fontSize: 15, padding: '13px 26px' }}>
          OK
        </button>
        <span style={{ fontSize: 12.5, color: '#5A6474' }}>press <strong style={{ color: '#8D9AAF' }}>Enter ↵</strong></span>
      </div>
    </>
  );
}

function FitQuestionBody({
  question, value, onChange, onAdvance,
}: {
  question: Extract<Question, { kind: 'fit' }>;
  value: FitAnswer;
  onChange: (v: string) => void;
  onAdvance: () => void;
}) {
  return (
    <div>
      <h2 style={{ margin: '0 0 28px', fontSize: 'clamp(24px,3.6vw,34px)', fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.25 }}>
        {question.label}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {FIT_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setTimeout(onAdvance, 140); }}
              style={{
                fontSize: 16, fontWeight: 700, padding: '16px 28px', borderRadius: 10, cursor: 'pointer',
                border: active ? '1px solid #2F6BFF' : '1px solid rgba(255,255,255,.14)',
                background: active ? 'rgba(47,107,255,.16)' : 'transparent',
                color: active ? '#fff' : '#DCE5F3',
                transition: 'transform 140ms ease,background 140ms ease,border-color 140ms ease',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 20, fontSize: 12.5, color: '#5A6474' }}>Tap one to continue.</div>
    </div>
  );
}
