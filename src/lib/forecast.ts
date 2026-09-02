// Shared types + the forecast calculator, used by both the client-side
// wizard (src/components/ForecastWizard.tsx) and the email endpoint
// (src/pages/api/submit-forecast.ts) so the numbers a lead sees always
// match the numbers that land in the notification email.

export interface ContactFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  countryTz: string;
  role: string;
}

export interface BusinessFields {
  niche: string;
  whoBuys: string;
  offerName: string;
  offerFormat: string;
  price: string;
  cashCollectedAtPurchase: string;
  refundPolicy: string;
  monthlyRevenue: string;
  fulfillmentCapacity: string;
  customersToDate: string;
}

export interface BaselineFields {
  webinarHistory: string;
  frequency: string;
  trafficSources: string;
  monthlyAdSpend: string;
  visitors: string;
  totalRegistrations: string;
  paidOrganicMix: string;
  vipPrice: string;
  vipTakeRate: string;
  attendeesLive: string;
  totalPurchasers: string;
  replayViewsSales: string;
  checkoutStartsCompleted: string;
  callShowClose: string;
  refundChargebackRate: string;
}

export interface EconomicsFields {
  grossRevenue: string;
  cashCollected: string;
  fulfillmentCostPerCustomer: string;
  salesCommissions: string;
  processingFees: string;
  otherCosts: string;
  bumpPriceTake: string;
  upsellPriceTake: string;
  downsellPriceTake: string;
  highTicketPrice: string;
  ascensionBookingClose: string;
  continuityRevenue: string;
  retentionChurn: string;
  ltv: string;
}

export interface ScenarioFields {
  budget: number;
  cpr: number;
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
  contact: ContactFields;
  business: BusinessFields;
  baseline: BaselineFields;
  economics: EconomicsFields;
  scenario: ScenarioFields;
  attribution: AttributionInfo;
  consentProcessing: boolean;
  consentEstimate: boolean;
}

export const emptyContact: ContactFields = {
  firstName: '', lastName: '', email: '', phone: '', company: '', website: '', countryTz: '', role: '',
};

export const emptyBusiness: BusinessFields = {
  niche: '', whoBuys: '', offerName: '', offerFormat: '', price: '', cashCollectedAtPurchase: '',
  refundPolicy: '', monthlyRevenue: '', fulfillmentCapacity: '', customersToDate: '',
};

export const emptyBaseline: BaselineFields = {
  webinarHistory: '', frequency: '', trafficSources: '', monthlyAdSpend: '', visitors: '',
  totalRegistrations: '', paidOrganicMix: '', vipPrice: '', vipTakeRate: '', attendeesLive: '',
  totalPurchasers: '', replayViewsSales: '', checkoutStartsCompleted: '', callShowClose: '', refundChargebackRate: '',
};

export const emptyEconomics: EconomicsFields = {
  grossRevenue: '', cashCollected: '', fulfillmentCostPerCustomer: '', salesCommissions: '', processingFees: '',
  otherCosts: '', bumpPriceTake: '', upsellPriceTake: '', downsellPriceTake: '', highTicketPrice: '',
  ascensionBookingClose: '', continuityRevenue: '', retentionChurn: '', ltv: '',
};

export const defaultScenario: ScenarioFields = {
  budget: 30000, cpr: 14, organic: 400, show: 38, conv: 6, price: 1997,
  vipTake: 8, vipPrice: 97, bumpTake: 22, bumpPrice: 197, upTake: 9, upPrice: 1500, replay: 35,
};

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

/** Mirrors Component.calc() from the original Claude Design mockup. */
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
