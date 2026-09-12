// Run after npm run build. All Resend requests are mocked; no emails are sent.
import assert from 'node:assert/strict';
import { page } from '../.vercel/output/functions/_render.func/dist/server/pages/api/submit-forecast.astro.mjs';

const { POST } = page();
const originalFetch = globalThis.fetch;
const originalKey = process.env.RESEND_API_KEY;
const originalTo = process.env.FORECAST_NOTIFY_TO;
const originalFrom = process.env.FORECAST_NOTIFY_FROM;
const calls = [];
let mode = 'success';
globalThis.fetch = async (url, options) => {
  calls.push({ url, emails: JSON.parse(options.body), headers: new Headers(options.headers) });
  if (mode === 'network-error') throw new Error('Test network failure');
  if (mode === 'provider-error') return Response.json({ name: 'validation_error', message: 'Test rejection' }, { status: 422 });
  return Response.json({ data: mode === 'partial' ? [{ id: 'team' }] : [{ id: 'team' }, { id: 'customer' }] });
};
process.env.RESEND_API_KEY = 're_test_placeholder';
process.env.FORECAST_NOTIFY_TO = 'team@example.com';
process.env.FORECAST_NOTIFY_FROM = 'WebinarOps Forecast <forecast@updates.webinarops.io>';

const payload = {
  form: {
    contact: { firstName: 'Alex <b>test</b>', lastName: 'Example', email: 'lead@example.com', company: 'Example' },
    qualification: { validatedOffer: 'yes' },
    attribution: { landingPage: '/forecast?utm_source=internal-marker', capturedAt: '2026-09-12T12:00:00Z' },
    consentEstimate: true,
    scenario: { budget: 5000, cpr: 10, organic: 0, show: 40, conv: 10, price: 1000, replay: 20, vipTake: 0, vipPrice: 97, bumpTake: 0, bumpPrice: 197, upTake: 0, upPrice: 1500 },
  },
  calculated: { target: { gross: 999999999 } }, // Must never be trusted.
};
const submit = (body) => POST({ request: new Request('https://www.webinarops.io/api/submit-forecast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });

try {
  assert.equal((await submit(payload)).status, 200);
  const first = calls[0];
  assert.match(String(first.url), /\/emails\/batch$/);
  assert.equal(first.emails.length, 2);
  const [team, customer] = first.emails;
  assert.equal(team.to, 'team@example.com');
  assert.equal(customer.to, 'lead@example.com');
  assert.equal(team.reply_to, 'lead@example.com');
  assert.equal(customer.reply_to, 'alo@webinarops.io');
  assert.equal(customer.from, process.env.FORECAST_NOTIFY_FROM);
  assert.match(team.html, /Fit check/);
  assert.doesNotMatch(customer.html + customer.text, /Fit check|internal-marker/);
  assert.match(customer.html, /Alex &lt;b&gt;test&lt;\/b&gt;/);
  assert.match(customer.html, /\$24,000/);
  assert.doesNotMatch(customer.html, /999,999,999/);
  assert.match(customer.text, /https:\/\/calendly.com\/alo-webinarops\/30min/);
  assert.match(customer.text, /one webinar/);
  assert.match(customer.text, /VIP take rate/);
  assert.match(first.headers.get('Idempotency-Key'), /^forecast-v2\/[a-f0-9]{64}$/);
  await submit(payload);
  assert.equal(calls[1].headers.get('Idempotency-Key'), first.headers.get('Idempotency-Key'));

  const before = calls.length;
  const badEmail = structuredClone(payload); badEmail.form.contact.email = 'lead@example.com,other@example.com';
  assert.equal((await submit(badEmail)).status, 400);
  const badNumber = structuredClone(payload); badNumber.form.scenario.budget = 'invalid';
  assert.equal((await submit(badNumber)).status, 400);
  const noConsent = structuredClone(payload); noConsent.form.consentEstimate = false;
  assert.equal((await submit(noConsent)).status, 400);
  assert.equal((await submit({ form: { contact: { firstName: 123 } } })).status, 400);
  assert.equal(calls.length, before);
  delete process.env.RESEND_API_KEY;
  assert.equal((await submit(payload)).status, 500);
  assert.equal(calls.length, before);
  process.env.RESEND_API_KEY = 're_test_placeholder';
  for (mode of ['provider-error', 'partial', 'network-error']) {
    assert.equal((await submit(payload)).status, 502);
  }
  console.log('PASS: separate recipients and content; server-calculated totals; HTML escaping; stable retry keys; input validation; missing-key and delivery-failure handling. No live emails sent.');
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [['RESEND_API_KEY', originalKey], ['FORECAST_NOTIFY_TO', originalTo], ['FORECAST_NOTIFY_FROM', originalFrom]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
