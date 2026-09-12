// Shared types + the forecast calculator, used by both the client-side
// wizard (src/components/ForecastWizard.tsx) and the email endpoint
// (src/pages/api/submit-forecast.ts) so the numbers a lead sees always
// match the numbers that land in the notification email.
//
// The form asks only what it needs to (a) produce a real forecast number
// and (b) let WebinarOps triage fit before a call - not a full intake.
// Deeper business/funnel/economics detail is gathered live, on the call.

export interface ContactFields {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
}

export const emptyContact: ContactFields = {
  firstName: '', lastName: '', email: '', company: '',
};

export interface ScenarioFields {
  /** Total ad spend to promote one webinar. */
  budget: number;
  cpr: number;
  /** Unpaid registrations for that same webinar. */
  organic: number;
  show: number;
  conv: number;
  price: number;
  vipTake: number;
  vipPrice: number;
  bumpTake: number;
  bumpPrice: number;
  upTake: number;
  upPrice: number;
  replay: number;
}

/**
 * Defaults for every scenario input. Only the ones listed in
 * CORE_SCENARIO_QUESTIONS are actually asked in the wizard - the rest
 * (VIP/bump/upsell take rates and prices) are common-case assumptions
 * that stay fixed rather than adding seven more screens to the flow.
 */
export const defaultScenario: ScenarioFields = {
  budget: 30000, cpr: 14, organic: 400, show: 38, conv: 6, price: 1997,
  vipTake: 8, vipPrice: 97, bumpTake: 22, bumpPrice: 197, upTake: 9, upPrice: 1500, replay: 35,
};

export type FitAnswer = '' | 'yes' | 'no' | 'unsure';

export interface QualificationFields {
  validatedOffer: FitAnswer;
  repeatCadence: FitAnswer;
  paidAcquisition: FitAnswer;
  fulfillmentCapacity: FitAnswer;
  dataDriven: FitAnswer;
  onePartner: FitAnswer;
}

export const QUALIFICATION_QUESTIONS: { key: keyof QualificationFields; label: string }[] = [
  { key: 'validatedOffer', label: 'Do you have a validated offer with real, paying customers?' },
  { key: 'repeatCadence', label: 'Willing to run the webinar repeatedly, not just once?' },
  { key: 'paidAcquisition', label: 'Able to invest in paid acquisition, paid directly to the ad platforms?' },
  { key: 'fulfillmentCapacity', label: 'Fulfillment capacity to serve more customers?' },
  { key: 'dataDriven', label: 'Comfortable making decisions from performance data?' },
  { key: 'onePartner', label: 'Looking for one accountable partner rather than several vendors?' },
];

export const emptyQualification: QualificationFields = {
  validatedOffer: '', repeatCadence: '', paidAcquisition: '', fulfillmentCapacity: '', dataDriven: '', onePartner: '',
};

/** Count of "yes" answers out of the total question count, for lead triage. */
export function fitScore(q: QualificationFields): { yes: number; total: number } {
  const total = QUALIFICATION_QUESTIONS.length;
  const yes = QUALIFICATION_QUESTIONS.filter((item) => q[item.key] === 'yes').length;
  return { yes, total };
}

export interface AttributionInfo {
  landingPage: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  capturedAt: string;
}

export interface ForecastForm {
  qualification: QualificationFields;
  contact: ContactFields;
  scenario: ScenarioFields;
  attribution: AttributionInfo;
  consentEstimate: boolean;
}

export interface CalcResult {
  regs: number;
  attendees: number;
  buyers: number;
  core: number;
  vip: number;
  bump: number;
  up: number;
  gross: number;
  spend: number;
  roas: number;
  contribution: number;
  rpr: number;
}

const n = (x: unknown): number => Number(x) || 0;

/** Models one webinar and its associated replay/follow-up sales.
 * Budget and registrations refer to that event; no calendar or run multiplier applies.
 * mult changes the attendance/conversion assumptions for the scenario, not the run count.
 */
export function calcScenario(f: ScenarioFields, mult: number): CalcResult {
  const paidRegs = n(f.cpr) > 0 ? n(f.budget) / n(f.cpr) : 0;
  const regs = paidRegs + n(f.organic);
  const attendees = regs * (n(f.show) / 100) * mult;
  const coreBuyers = attendees * (n(f.conv) / 100) * mult;
  const replayBuyers = coreBuyers * (n(f.replay) / 100);
  const buyers = coreBuyers + replayBuyers;
  const core = buyers * n(f.price);
  const vip = regs * (n(f.vipTake) / 100) * n(f.vipPrice);
  const bump = buyers * (n(f.bumpTake) / 100) * n(f.bumpPrice);
  const up = buyers * (n(f.upTake) / 100) * n(f.upPrice);
  const gross = core + vip + bump + up;
  const spend = n(f.budget);
  return {
    regs, attendees, buyers, core, vip, bump, up, gross, spend,
    roas: spend > 0 ? gross / spend : 0,
    contribution: gross - spend,
    rpr: regs > 0 ? gross / regs : 0,
  };
}

export function money(v: number): string {
  return '$' + Math.round(v).toLocaleString('en-US');
}

export function fmt(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

// ---------- the question flow ----------
// One entry = one full-screen question in ForecastWizard. Order here is
// the order they're asked in.

export type Question =
  | { kind: 'text' | 'email'; id: keyof ContactFields; label: string; placeholder: string; required?: boolean }
  | { kind: 'fit'; id: keyof QualificationFields; label: string }
  | { kind: 'number'; id: keyof ScenarioFields; label: string; help: string; prefix?: string; suffix?: string };

export const CONTACT_QUESTIONS: Question[] = [
  { kind: 'text', id: 'firstName', label: 'First, what’s your first name?', placeholder: 'Alex', required: true },
  { kind: 'text', id: 'lastName', label: 'And your last name?', placeholder: 'Mercer', required: true },
  { kind: 'email', id: 'email', label: 'What’s the best email to send this to?', placeholder: 'alex@company.com', required: true },
  { kind: 'text', id: 'company', label: 'Company or brand? (optional)', placeholder: 'Company' },
];

/** The 7 scenario inputs actually asked - the rest stay at defaultScenario. */
export const CORE_SCENARIO_QUESTIONS: Question[] = [
  { kind: 'number', id: 'budget', label: 'What’s your ad budget for this webinar?', help: 'Total ad spend to promote one webinar, across the full registration campaign.', prefix: '$' },
  { kind: 'number', id: 'cpr', label: 'Expected cost per registration?', help: 'Expected ad cost per registrant for this webinar. Use your historical average or best estimate.', prefix: '$' },
  { kind: 'number', id: 'organic', label: 'How many organic registrations for this webinar?', help: 'Registrants expected for this one webinar from email, social, referrals, or other unpaid sources. Enter 0 if none.' },
  { kind: 'number', id: 'show', label: 'What share of registrants attend live?', help: 'Your attendance / show-up rate.', suffix: '%' },
  { kind: 'number', id: 'conv', label: 'What share of attendees buy?', help: 'Your live conversion rate on the core offer.', suffix: '%' },
  { kind: 'number', id: 'price', label: 'What’s the price of your core offer?', help: 'Full price, before any bumps or upsells.', prefix: '$' },
  { kind: 'number', id: 'replay', label: 'How much do replay buyers add?', help: 'Purchases from this webinar’s replay and follow-up window, as a percentage on top of its live buyers.', suffix: '%' },
];

export const FIT_QUESTIONS: Question[] = QUALIFICATION_QUESTIONS.map((q) => ({
  kind: 'fit',
  id: q.key,
  label: q.label,
}));

export const ALL_QUESTIONS: Question[] = [...CONTACT_QUESTIONS, ...FIT_QUESTIONS, ...CORE_SCENARIO_QUESTIONS];
