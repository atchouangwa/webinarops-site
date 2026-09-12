import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import type { CalcResult, ForecastForm } from '../../lib/forecast';
import { money, fmt, fitScore, QUALIFICATION_QUESTIONS } from '../../lib/forecast';

export const prerender = false;

interface SubmitBody {
  form: ForecastForm;
  calculated: { target: CalcResult; conservative: CalcResult; upside: CalcResult };
}

function getEnv(key: string): string | undefined {
  // Prefer runtime secrets on Vercel; fall back to Astro's local environment.
  return process.env[key] || (import.meta.env as Record<string, string | undefined>)[key];
}

function row(label: string, value: string): string {
  const v = value && value.trim() ? value : '—';
  return `<tr><td style="padding:4px 12px 4px 0;color:#6B7688;font-size:13px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;font-size:13px;color:#111">${escapeHtml(v)}</td></tr>`;
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
    row('Monthly media budget', money(s.budget)) +
    row('Expected cost per reg', money(s.cpr)) +
    row('Organic registrations', String(s.organic)) +
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
    row('Modelled gross revenue (target)', money(t.gross)) +
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
    <h2 style="margin:0 0 4px">New webinar forecast submission</h2>
    <p style="margin:0 0 16px;color:#6B7688;font-size:13px">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)} &middot; ${escapeHtml(c.company || 'no company given')}</p>
    <div style="display:inline-block;padding:6px 12px;border-radius:6px;background:${fitColor};color:#fff;font-size:13px;font-weight:700;margin-bottom:8px">Fit check: ${yes} / ${total} yes</div>
    ${section('Quick fit check', fitRows)}
    ${section('Modelled outcome (target scenario)', modelRows)}
    ${section('Contact', contactRows)}
    ${section('Scenario assumptions', scenarioRows)}
    ${section('Attribution', attributionRows)}
  </div>`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const POST: APIRoute = async ({ request }) => {
  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), { status: 400 });
  }

  const c = body?.form?.contact;
  if (!c || !c.firstName?.trim() || !c.lastName?.trim() || !c.email?.trim()) {
    return new Response(JSON.stringify({ error: 'First name, last name, and email are required.' }), { status: 400 });
  }
  if (!body.form.consentEstimate) {
    return new Response(JSON.stringify({ error: 'Please acknowledge that forecasts are estimates before submitting.' }), { status: 400 });
  }

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
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: c.email,
      subject: `[Fit ${yes}/${total}] New forecast: ${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ''}`,
      html: buildEmailHtml(body),
    });
    if (error) {
      console.error('submit-forecast: Resend error', error);
      return new Response(JSON.stringify({ error: 'Failed to send notification email.' }), { status: 502 });
    }
  } catch (err) {
    console.error('submit-forecast: unexpected error', err);
    return new Response(JSON.stringify({ error: 'Unexpected server error.' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
