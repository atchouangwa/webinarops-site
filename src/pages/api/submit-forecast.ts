import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import type { CalcResult, ForecastForm } from '../../lib/forecast';
import { money, fmt } from '../../lib/forecast';

export const prerender = false;

interface SubmitBody {
  form: ForecastForm;
  calculated: { target: CalcResult; conservative: CalcResult; upside: CalcResult };
}

function getEnv(key: string): string | undefined {
  // import.meta.env is statically replaced at build time for server code;
  // process.env covers platforms (e.g. Vercel) that inject secrets at runtime.
  return (import.meta.env as Record<string, string | undefined>)[key] ?? process.env[key];
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
  const b = form.business;
  const fl = form.baseline;
  const e = form.economics;
  const s = form.scenario;
  const t = calculated.target;

  const contactRows =
    row('Name', `${c.firstName} ${c.lastName}`) +
    row('Email', c.email) +
    row('Phone', c.phone) +
    row('Company', c.company) +
    row('Website', c.website) +
    row('Country / TZ', c.countryTz) +
    row('Role', c.role);

  const businessRows =
    row('Niche', b.niche) +
    row('Who buys', b.whoBuys) +
    row('Offer name', b.offerName) +
    row('Offer format', b.offerFormat) +
    row('Price', b.price) +
    row('Cash collected at purchase', b.cashCollectedAtPurchase) +
    row('Refund / guarantee', b.refundPolicy) +
    row('Current monthly revenue', b.monthlyRevenue) +
    row('Fulfillment capacity / mo', b.fulfillmentCapacity) +
    row('Customers to date', b.customersToDate);

  const baselineRows =
    row('Webinar history', fl.webinarHistory) +
    row('Frequency', fl.frequency) +
    row('Traffic sources', fl.trafficSources) +
    row('Monthly ad spend', fl.monthlyAdSpend) +
    row('Visitors', fl.visitors) +
    row('Total registrations', fl.totalRegistrations) +
    row('Paid / organic mix', fl.paidOrganicMix) +
    row('VIP price', fl.vipPrice) +
    row('VIP take rate', fl.vipTakeRate) +
    row('Attendees (live)', fl.attendeesLive) +
    row('Total purchasers', fl.totalPurchasers) +
    row('Replay views / sales', fl.replayViewsSales) +
    row('Checkout starts / completed', fl.checkoutStartsCompleted) +
    row('Call show / close rate', fl.callShowClose) +
    row('Refund / chargeback rate', fl.refundChargebackRate);

  const economicsRows =
    row('Gross revenue in period', e.grossRevenue) +
    row('Cash collected in period', e.cashCollected) +
    row('Fulfillment cost / customer', e.fulfillmentCostPerCustomer) +
    row('Sales commissions', e.salesCommissions) +
    row('Processing fees', e.processingFees) +
    row('Other campaign costs', e.otherCosts) +
    row('Order bump price / take', e.bumpPriceTake) +
    row('Upsell price / take', e.upsellPriceTake) +
    row('Downsell price / take', e.downsellPriceTake) +
    row('High-ticket price', e.highTicketPrice) +
    row('Ascension booking / close', e.ascensionBookingClose) +
    row('Continuity revenue / mo', e.continuityRevenue) +
    row('Retention / churn', e.retentionChurn) +
    row('LTV', e.ltv);

  const scenarioRows =
    row('Monthly media budget', money(s.budget)) +
    row('Expected cost per reg', money(s.cpr)) +
    row('Organic registrations', String(s.organic)) +
    row('Attendance rate', s.show + '%') +
    row('Attendee conversion', s.conv + '%') +
    row('Core offer price', money(s.price)) +
    row('Replay uplift', s.replay + '%') +
    row('VIP take / price', `${s.vipTake}% / ${money(s.vipPrice)}`) +
    row('Bump take / price', `${s.bumpTake}% / ${money(s.bumpPrice)}`) +
    row('Upsell take / price', `${s.upTake}% / ${money(s.upPrice)}`);

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

  return `
  <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;max-width:640px">
    <h2 style="margin:0 0 4px">New webinar forecast submission</h2>
    <p style="margin:0 0 16px;color:#6B7688;font-size:13px">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)} &middot; ${escapeHtml(c.company || 'no company given')}</p>
    ${section('Modelled outcome (target scenario)', modelRows)}
    ${section('Contact', contactRows)}
    ${section('Business and offer', businessRows)}
    ${section('Funnel baseline', baselineRows)}
    ${section('Unit economics', economicsRows)}
    ${section('Scenario assumptions', scenarioRows)}
    ${section('Attribution', attributionRows)}
  </div>`;
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
  const from = getEnv('FORECAST_NOTIFY_FROM') || 'WebinarOps Forecast <onboarding@resend.dev>';

  if (!apiKey) {
    console.error('submit-forecast: RESEND_API_KEY is not configured.');
    return new Response(JSON.stringify({ error: 'Email is not configured on the server yet.' }), { status: 500 });
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: c.email,
      subject: `New forecast: ${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ''}`,
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
