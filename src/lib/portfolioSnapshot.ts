import type { AppLanguage, Borrower, Loan, LoanSchedule } from '../types/loan';
import type { EffectivePlan } from './entitlements';
import { DEFAULT_TIMEZONE, getLocalIsoDate } from './notificationDates';

export type LoansTier = '0' | '1-5' | '6-10' | '11-25' | '26-50' | '51-100' | '100+';
export type OverdueRateBucket = '0' | '1-10' | '11-25' | '26+';
export type AvgLoanSizeBucket = '<100' | '100-500' | '500-2000' | '>2000';
export type AvgTermBucket = '<1m' | '1-3m' | '3-6m' | '>6m';
export type CurrencyMix = 'usd' | 'khr' | 'both';
export type DominantInterestType = 'flat' | 'reducing' | 'interest_only' | 'mixed';
export type DominantFrequency = 'daily' | 'weekly' | 'monthly' | 'mixed';

export interface PortfolioSnapshot {
  total_loans: number;
  active_loans: number;
  paid_loans: number;
  overdue_loans: number;
  borrower_count: number;
  loans_tier: LoansTier;
  overdue_rate_bucket: OverdueRateBucket;
  avg_loan_size_bucket: AvgLoanSizeBucket;
  avg_term_bucket: AvgTermBucket;
  currency_mix: CurrencyMix;
  dominant_interest_type: DominantInterestType;
  dominant_frequency: DominantFrequency;
  plan_tier: EffectivePlan;
  app_language: AppLanguage;
}

export interface PortfolioSnapshotContext {
  schedulesByLoan?: Record<string, LoanSchedule[]>;
  exchangeRateKhr?: number;
  planTier?: EffectivePlan;
  appLanguage?: AppLanguage;
  timeZone?: string;
}

export const PORTFOLIO_SNAPSHOT_KEYS = [
  'total_loans',
  'active_loans',
  'paid_loans',
  'overdue_loans',
  'borrower_count',
  'loans_tier',
  'overdue_rate_bucket',
  'avg_loan_size_bucket',
  'avg_term_bucket',
  'currency_mix',
  'dominant_interest_type',
  'dominant_frequency',
  'plan_tier',
  'app_language',
] as const;

export function getLenderSizeTier(totalLoans: number): LoansTier {
  const n = Math.max(0, Math.floor(Number.isFinite(totalLoans) ? totalLoans : 0));
  if (n === 0) return '0';
  if (n <= 5) return '1-5';
  if (n <= 10) return '6-10';
  if (n <= 25) return '11-25';
  if (n <= 50) return '26-50';
  if (n <= 100) return '51-100';
  return '100+';
}

export function getOverdueRateBucket(
  overdueLoans: number,
  activeLoans: number
): OverdueRateBucket {
  if (overdueLoans <= 0 || activeLoans <= 0) return '0';
  const pct = (overdueLoans / activeLoans) * 100;
  if (pct <= 10) return '1-10';
  if (pct <= 25) return '11-25';
  return '26+';
}

export function getAvgLoanSizeBucket(avgUsdPrincipal: number): AvgLoanSizeBucket {
  if (!Number.isFinite(avgUsdPrincipal) || avgUsdPrincipal < 100) return '<100';
  if (avgUsdPrincipal <= 500) return '100-500';
  if (avgUsdPrincipal <= 2000) return '500-2000';
  return '>2000';
}

export function getAvgTermBucket(avgMonths: number): AvgTermBucket {
  if (!Number.isFinite(avgMonths) || avgMonths < 1) return '<1m';
  if (avgMonths <= 3) return '1-3m';
  if (avgMonths <= 6) return '3-6m';
  return '>6m';
}

function estimateTermMonths(loan: Loan): number {
  const count = Math.max(0, Number(loan.termCount) || 0);
  if (loan.frequency === 'monthly') return count;
  if (loan.frequency === 'weekly') return (count * 7) / 30;
  if (loan.frequency === 'daily') return count / 30;
  const intervalDays = Math.max(1, Number(loan.customIntervalDays) || 10);
  return (count * intervalDays) / 30;
}

function addIsoDaysSimple(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return dt.toISOString().slice(0, 10);
}

function isLoanOverduePure(
  loan: Loan,
  schedules: LoanSchedule[] | undefined,
  todayIso: string
): boolean {
  if (loan.status !== 'active') return false;
  if (schedules && schedules.length > 0) {
    for (const s of schedules) {
      if (s.status === 'paid') continue;
      if (s.status === 'overdue' || (s.dueDate && s.dueDate < todayIso)) {
        return true;
      }
    }
    return false;
  }
  if (loan.promiseToPayDate && loan.promiseToPayDate < todayIso && loan.outstandingBalance > 0) {
    return true;
  }
  if (loan.startDate && loan.outstandingBalance > 0) {
    const approxDurationDays = Math.max(1, Math.round(estimateTermMonths(loan) * 30));
    const approxMaturity = addIsoDaysSimple(loan.startDate, approxDurationDays);
    if (approxMaturity < todayIso) {
      return true;
    }
  }
  return false;
}

/**
 * Pure, privacy-preserving aggregator that outputs strictly whitelisted counts,
 * bucketed ranges, and fixed categories — zero borrower/loan identifiers or exact values.
 */
export function buildPortfolioSnapshot(
  loans: Loan[],
  borrowers: Borrower[],
  now: Date = new Date(),
  context: PortfolioSnapshotContext = {}
): PortfolioSnapshot {
  const rate =
    context.exchangeRateKhr && context.exchangeRateKhr > 0
      ? context.exchangeRateKhr
      : 4100;
  const timeZone = context.timeZone || DEFAULT_TIMEZONE;
  const todayIso = getLocalIsoDate(now, timeZone);

  const totalLoans = loans.length;
  let activeLoans = 0;
  let paidLoans = 0;
  let overdueLoans = 0;
  let sumUsdPrincipal = 0;
  let sumTermMonths = 0;
  let hasUsd = false;
  let hasKhr = false;

  const interestCounts: Record<'flat' | 'reducing' | 'interest_only', number> = {
    flat: 0,
    reducing: 0,
    interest_only: 0,
  };
  const freqCounts: Record<'daily' | 'weekly' | 'monthly', number> = {
    daily: 0,
    weekly: 0,
    monthly: 0,
  };

  for (const loan of loans) {
    if (loan.status === 'active') activeLoans += 1;
    else if (loan.status === 'settled') paidLoans += 1;

    if (isLoanOverduePure(loan, context.schedulesByLoan?.[loan.id], todayIso)) {
      overdueLoans += 1;
    }

    const principal = Math.max(0, Number(loan.principal) || 0);
    if (loan.currency === 'KHR') {
      hasKhr = true;
      sumUsdPrincipal += principal / rate;
    } else {
      hasUsd = true;
      sumUsdPrincipal += principal;
    }

    sumTermMonths += estimateTermMonths(loan);

    if (
      loan.interestType === 'flat' ||
      loan.interestType === 'reducing' ||
      loan.interestType === 'interest_only'
    ) {
      interestCounts[loan.interestType] += 1;
    }

    if (
      loan.frequency === 'daily' ||
      loan.frequency === 'weekly' ||
      loan.frequency === 'monthly'
    ) {
      freqCounts[loan.frequency] += 1;
    }
  }

  const currencyMix: CurrencyMix =
    hasUsd && hasKhr ? 'both' : hasKhr ? 'khr' : 'usd';

  let dominantInterestType: DominantInterestType = 'flat';
  if (totalLoans > 0) {
    const entries = Object.entries(interestCounts) as Array<
      ['flat' | 'reducing' | 'interest_only', number]
    >;
    entries.sort((a, b) => b[1] - a[1]);
    const [topKey, topCount] = entries[0];
    const secondCount = entries[1]?.[1] ?? 0;
    if (topCount / totalLoans >= 0.6 && topCount > secondCount) {
      dominantInterestType = topKey;
    } else if (topCount > 0) {
      dominantInterestType = 'mixed';
    }
  }

  let dominantFrequency: DominantFrequency = 'monthly';
  if (totalLoans > 0) {
    const entries = Object.entries(freqCounts) as Array<
      ['daily' | 'weekly' | 'monthly', number]
    >;
    entries.sort((a, b) => b[1] - a[1]);
    const [topKey, topCount] = entries[0];
    const secondCount = entries[1]?.[1] ?? 0;
    if (topCount / totalLoans >= 0.6 && topCount > secondCount) {
      dominantFrequency = topKey;
    } else {
      dominantFrequency = 'mixed';
    }
  }

  const planTier: EffectivePlan =
    context.planTier === 'pro' || context.planTier === 'business'
      ? context.planTier
      : 'free';
  const appLanguage: AppLanguage = context.appLanguage === 'km' ? 'km' : 'en';

  return {
    total_loans: totalLoans,
    active_loans: activeLoans,
    paid_loans: paidLoans,
    overdue_loans: overdueLoans,
    borrower_count: borrowers.length,
    loans_tier: getLenderSizeTier(totalLoans),
    overdue_rate_bucket: getOverdueRateBucket(overdueLoans, activeLoans),
    avg_loan_size_bucket: getAvgLoanSizeBucket(
      totalLoans > 0 ? sumUsdPrincipal / totalLoans : 0
    ),
    avg_term_bucket: getAvgTermBucket(
      totalLoans > 0 ? sumTermMonths / totalLoans : 0
    ),
    currency_mix: currencyMix,
    dominant_interest_type: dominantInterestType,
    dominant_frequency: dominantFrequency,
    plan_tier: planTier,
    app_language: appLanguage,
  };
}
