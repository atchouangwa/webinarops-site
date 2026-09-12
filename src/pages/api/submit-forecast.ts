import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { createHash } from 'node:crypto';
import type { CalcResult, ForecastForm } from '../../lib/forecast';
import { money, fmt, fitScore, calcScenario, defaultScenario, emptyQualification, QUALIFICATION_QUESTIONS } from '../../lib/forecast';

export const prerender = false;

interface SubmitBody {
  form: ForecastForm;
  calculated: { target: CalcResult; conservative: CalcResult; upside: CalcResult };
}

function getEnv(key: string): string | undefined {
  // Prefer runtime secrets on Vercel; fall back to Astro's local environment.
  return process.env[key]?.trim() || (import.meta.env as Record<string, string | undefined>)[key]?.trim();
}

// Allow deployment checks without sending an email or exposing secret values.
// A successful check confirms configuration presence, not Resend delivery.
export const HEAD: APIRoute = () => new Response(null, {
  status: getEnv('RESEND_API_KEY') ? 204 : 503,
  headers: { 'Cache-Control': 'no-store' },
});

function row(label: string, value: string): string {
  const v = value && value.trim() ? value : '—';
  return `<tr><td style="padding:4px 12px 4px 0;color:#6B7688;font-size:13px;vertical-align:top">${label}</td><td style="padding:4px 0;font-size:13px;color:#111">${escapeHtml(v)}</td></tr>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function section(title: string, rows: string): string {
  return `<h3 style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#111">${title}</h3><table style="border-collapse:collapse;width:100%">${rows}</table>`;
}

function buildEmailHtml(body: SubmitBody): string {
  const { form, calculated } = body;
  const c = form.contact;
  const s = form.scenario;
  const t = calculated.target;

  const contactRows =
    row('Name', `${c.firstName} ${c.lastName}`) +
    row('Email', c.email) +
    row('Company', c.company);

  const scenarioRows =
    row('Forecast basis', 'One webinar, including its replay and follow-up sales') +
    row('Ad budget for this webinar', money(s.budget)) +
    row('Expected cost per reg', money(s.cpr)) +
    row('Organic registrations for this webinar', String(s.organic)) +
    row('Attendance rate', s.show + '%') +
    row('Attendee conversion', s.conv + '%') +
    row('Core offer price', money(s.price)) +
    row('Replay uplift', s.replay + '%') +
    row('VIP take / price (default)', `${s.vipTake}% / ${money(s.vipPrice)}`) +
    row('Bump take / price (default)', `${s.bumpTake}% / ${money(s.bumpPrice)}`) +
    row('Upsell take / price (default)', `${s.upTake}% / ${money(s.upPrice)}`);

  const modelRows =
    row('Modelled registrations', fmt(t.regs)) +
    row('Modelled attendees', fmt(t.attendees)) +
    row('Modelled buyers', fmt(t.buyers)) +
    row('Gross revenue per webinar (target)', money(t.gross)) +
    row('Conservative gross revenue', money(calculated.conservative.gross)) +
    row('Upside gross revenue', money(calculated.upside.gross)) +
    row('Target ROAS', t.roas.toFixed(2) + 'x') +
    row('Revenue per registrant', '$' + t.rpr.toFixed(2));

  const attributionRows =
    row('Landing page', form.attribution.landingPage) +
    row('Referrer', form.attribution.referrer) +
    row('utm_source', form.attribution.utmSource) +
    row('utm_medium', form.attribution.utmMedium) +
    row('utm_campaign', form.attribution.utmCampaign) +
    row('Captured at', form.attribution.capturedAt);

  const { yes, total } = fitScore(form.qualification);
  const fitColor = yes === total ? '#0A8A4B' : yes >= total / 2 ? '#B7791F' : '#B42318';
  const fitRows = QUALIFICATION_QUESTIONS
    .map((q) => row(q.label, form.qualification[q.key] ? capitalize(form.qualification[q.key]) : 'Not answered'))
    .join('');

  return `
  <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;max-width:640px">
    <h2 style="margin:0 0 4px">New per-webinar forecast submission</h2>
    <p style="margin:0 0 16px;color:#6B7688;font-size:13px">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)} &middot; ${escapeHtml(c.company || 'no company given')}</p>
    <div style="display:inline-block;padding:6px 12px;border-radius:6px;background:${fitColor};color:#fff;font-size:13px;font-weight:700;margin-bottom:8px">Fit check: ${yes} / ${total} yes</div>
    ${section('Quick fit check', fitRows)}
    ${section('One webinar — modelled outcome (target scenario)', modelRows)}
    ${section('Contact', contactRows)}
    ${section('Scenario assumptions', scenarioRows)}
    ${section('Attribution', attributionRows)}
  </div>`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildCustomerEmail(body: SubmitBody) {
  const { form, calculated } = body;
  const s = form.scenario;
  const t = calculated.target;
  const bookingUrl = 'https://calendly.com/alo-webinarops/30min';
  const metrics: [string, string][] = [
    ['Ad spend for this webinar', money(s.budget)],
    ['Registrations', fmt(t.regs)],
    ['Live attendees', fmt(t.attendees)],
    ['Buyers, including replay', fmt(t.buyers)],
    ['Conservative gross revenue', money(calculated.conservative.gross)],
    ['Target gross revenue', money(t.gross)],
    ['Upside gross revenue', money(calculated.upside.gross)],
    ['Target ROAS', s.budget > 0 ? `${t.roas.toFixed(2)}x` : 'Not applicable — no ad spend'],
  ];
  const assumptions: [string, string][] = [
    ['Cost per registration', money(s.cpr)],
    ['Organic registrations', fmt(s.organic)],
    ['Live attendance rate', `${s.show}%`],
    ['Attendee purchase rate', `${s.conv}%`],
    ['Core offer price', money(s.price)],
    ['Additional replay buyers', `${s.replay}% of live buyers`],
    ['VIP take rate / price', `${s.vipTake}% / ${money(s.vipPrice)}`],
    ['Order-bump take rate / price', `${s.bumpTake}% / ${money(s.bumpPrice)}`],
    ['Upsell take rate / price', `${s.upTake}% / ${money(s.upPrice)}`],
  ];
  const caveat = 'This models one webinar and its replay/follow-up sales. Figures are estimates, not guaranteed results. Gross revenue is not cash collected or profit and does not deduct ad spend, fees, refunds, taxes, fulfillment, or other costs. VIP, bump, and upsell assumptions are included; review them if those offers do not apply to your business.';
  const text = [
    `Hi ${form.contact.firstName},`,
    'Here is your forecast for one webinar, based on the numbers you submitted.',
    ...metrics.map(([label, value]) => `${label}: ${value}`),
    'YOUR ASSUMPTIONS',
    ...assumptions.map(([label, value]) => `${label}: ${value}`),
    'Want to pressure-test these numbers? Book a 30-minute Webinar Forecast Review:',
    bookingUrl,
    'Already booked? Keep your existing appointment. No need to book again.',
    'Questions or corrections? Reply to this email to reach the WebinarOps team.',
    caveat,
    'Earnings disclaimer: https://www.webinarops.io/earnings-disclaimer',
    'Privacy policy: https://www.webinarops.io/privacy-policy',
    'You received this email because this address was submitted through the WebinarOps forecaster. If you did not request it, reply to let us know.',
  ].join('\n\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <div style="max-width:600px;margin:0 auto;background:#fff">
      <div style="padding:28px 24px;background:#05070b;color:#fff"><div style="font-size:18px;font-weight:700">Webinar<span style="color:#5d8bff">Ops</span></div><h1 style="font-size:27px;line-height:1.2;margin:22px 0 8px">Your forecast for one webinar.</h1><p style="color:#a8b3c4;font-size:14px;line-height:1.6;margin:0">A copy of your model, ready to review.</p></div>
      <div style="padding:28px 24px">
        <p style="font-size:15px;line-height:1.7">Hi ${escapeHtml(form.contact.firstName)},</p>
        <p style="font-size:15px;line-height:1.7">Here are the numbers from your forecast, including this webinar’s replay and follow-up sales.</p>
        ${section('Your per-webinar forecast', metrics.map(([label, value]) => row(label, value)).join(''))}
        ${section('Assumptions included in your model', assumptions.map(([label, value]) => row(label, value)).join(''))}
        <h2 style="font-size:20px;margin:30px 0 10px">Let’s pressure-test the assumptions.</h2>
        <p style="font-size:14px;line-height:1.7">Book a 30-minute Webinar Forecast Review to check the inputs and discuss the next step for your business.</p>
        <a href="${bookingUrl}" style="display:inline-block;background:#2f6bff;color:#fff;padding:15px 20px;border-radius:7px;font-size:14px;font-weight:700;text-decoration:none">Book My Forecast Review</a>
        <p style="font-size:12px;line-height:1.7;color:#6b7688">Already booked? Keep your existing appointment. No need to book again.</p>
        <p style="font-size:14px;line-height:1.7">Questions or corrections? Reply to this email to reach our team.</p>
        <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.7;color:#6b7688">
          <p>${caveat}</p><p><a href="https://www.webinarops.io/earnings-disclaimer" style="color:#2458cf">Earnings disclaimer</a> &middot; <a href="https://www.webinarops.io/privacy-policy" style="color:#2458cf">Privacy policy</a></p>
          <p>You received this email because this address was submitted through the WebinarOps forecaster. If you did not request it, reply to let us know.</p>
        </div>
      </div>
    </div>
  </body></html>`;
  return { html, text };
}

export const POST: APIRoute = async ({ request }) => {
  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), { status: 400 });
  }

  const c = body?.form?.contact;
  if (!c || ![c.firstName, c.lastName, c.email].every(value => typeof value === 'string' && value.trim() && value.length <= 254)) {
    return new Response(JSON.stringify({ error: 'First name, last name, and email are required.' }), { status: 400 });
  }
  c.firstName = c.firstName.trim();
  c.lastName = c.lastName.trim();
  c.email = c.email.trim();
  c.company = typeof c.company === 'string' ? c.company.trim().slice(0, 254) : '';
  // Only a single mailbox is accepted; never allow recipient lists or header markup.
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(c.email) || /[\r\n]/.test(c.firstName + c.lastName + c.company)) {
    return new Response(JSON.stringify({ error: 'Please enter a valid name and email address.' }), { status: 400 });
  }
  if (body.form.consentEstimate !== true) {
    return new Response(JSON.stringify({ error: 'Please acknowledge that forecasts are estimates before submitting.' }), { status: 400 });
  }

  const scenario = body.form.scenario;
  if (!scenario || Object.keys(defaultScenario).some(key => {
    const value = scenario[key as keyof typeof scenario];
    return typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9;
  })) {
    return new Response(JSON.stringify({ error: 'Please check your forecast inputs.' }), { status: 400 });
  }
  // Email calculated results from validated inputs, not client-supplied totals.
  body.calculated = { target: calcScenario(scenario, 1), conservative: calcScenario(scenario, 0.78), upside: calcScenario(scenario, 1.18) };
  const qualification = { ...emptyQualification };
  for (const key of Object.keys(qualification) as (keyof typeof qualification)[]) {
    const value = body.form.qualification?.[key];
    qualification[key] = value === 'yes' || value === 'no' || value === 'unsure' ? value : '';
  }
  body.form.qualification = qualification;
  const attribution: ForecastForm['attribution'] = { landingPage: '', referrer: '', utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: '', capturedAt: '' };
  for (const key of Object.keys(attribution) as (keyof typeof attribution)[]) {
    const value = body.form.attribution?.[key];
    attribution[key] = typeof value === 'string' ? value.slice(0, 2000) : '';
  }
  body.form.attribution = attribution;

  const apiKey = getEnv('RESEND_API_KEY');
  const to = getEnv('FORECAST_NOTIFY_TO') || 'alo@webinarops.io';
  const from = getEnv('FORECAST_NOTIFY_FROM') || 'WebinarOps Forecast <forecast@updates.webinarops.io>';

  if (!apiKey) {
    console.error('submit-forecast: RESEND_API_KEY is not configured.');
    return new Response(JSON.stringify({ error: 'Email is not configured on the server yet.' }), { status: 500 });
  }

  try {
    const resend = new Resend(apiKey);
    const { yes, total } = fitScore(body.form.qualification);
    const customerEmail = buildCustomerEmail(body);
    const emails = [{
      from,
      to,
      replyTo: c.email,
      subject: `[Fit ${yes}/${total}] New forecast: ${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ''}`,
      html: buildEmailHtml(body),
    }, {
      from,
      to: c.email,
      replyTo: 'alo@webinarops.io',
      subject: 'Your per-webinar forecast | WebinarOps',
      ...customerEmail,
    }];
    const idempotencyKey = `forecast-v2/${createHash('sha256').update(JSON.stringify(emails)).digest('hex')}`;
    const { data, error } = await resend.batch.send(emails, { idempotencyKey });
    if (error || data?.data?.length !== 2) {
      console.error('submit-forecast: Resend batch failed', { name: error?.name ?? 'incomplete_response' });
      return new Response(JSON.stringify({ error: 'We could not send your forecast emails. Please try again.' }), { status: 502 });
    }
  } catch (err) {
    console.error('submit-forecast: unexpected error', err);
    return new Response(JSON.stringify({ error: 'Unexpected server error.' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
