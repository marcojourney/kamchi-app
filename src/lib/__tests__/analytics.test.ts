import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getAnalyticsConfig, isMeasurementIdConfigured } from '../../config/analytics';
import type { Borrower, Loan, LoanSchedule } from '../../types/loan';
import {
  __setAnalyticsRuntimeForTests,
  ALLOWED_ANALYTICS_EVENTS,
  ALLOWED_PARAMS_BY_EVENT,
  FORBIDDEN_PARAM_PATTERN,
  getAnalyticsConsent,
  hasSentSnapshotToday,
  maybeSendDailyPortfolioSnapshot,
  sanitizeAnalyticsPayload,
  setAnalyticsConsent,
  track,
  trackFunnelOnce,
  trackScreenView,
} from '../analytics';
import { resetAnalyticsStoreMemoryForTests } from '../analyticsStore';
import {
  buildPortfolioSnapshot,
  getAvgLoanSizeBucket,
  getAvgTermBucket,
  getLenderSizeTier,
  getOverdueRateBucket,
  PORTFOLIO_SNAPSHOT_KEYS,
} from '../portfolioSnapshot';

function makeBorrower(idx: number): Borrower {
  return {
    id: `brw_${idx}`,
    ownerId: 'local_owner',
    name: `Secret Borrower ${idx}`,
    phone: `01234567${idx}`,
    address: `Street ${idx}, Phnom Penh`,
    nationalIdNumber: `01020304${idx}`,
    notes: 'Private borrower notes that must never leave device',
    tags: [],
    riskScore: 85,
  };
}

function makeLoan(overrides: Partial<Loan> = {}, idx = 1): Loan {
  return {
    id: `ln_${idx}`,
    ownerId: 'local_owner',
    borrowerId: `brw_${idx}`,
    borrowerName: `Secret Borrower ${idx}`,
    currency: 'USD',
    principal: 250,
    interestRate: 3,
    interestType: 'flat',
    termCount: 3,
    frequency: 'monthly',
    startDate: '2026-10-01',
    adminFee: 0,
    lateFeeType: 'fixed',
    lateFeeValue: 5,
    gracePeriodDays: 3,
    status: 'active',
    totalPayable: 272.5,
    totalInterest: 22.5,
    paidPrincipal: 0,
    paidInterest: 0,
    paidPenalty: 0,
    outstandingBalance: 272.5,
    ...overrides,
  };
}

describe('analytics measurement ID & config', () => {
  it('rejects empty or placeholder Measurement IDs', () => {
    assert.equal(isMeasurementIdConfigured(undefined), false);
    assert.equal(isMeasurementIdConfigured(''), false);
    assert.equal(isMeasurementIdConfigured('G-XXXXXXXXXX'), false);
    assert.equal(isMeasurementIdConfigured('G-0000000000'), false);
    assert.equal(isMeasurementIdConfigured('G-TEST1234'), false);
    assert.equal(isMeasurementIdConfigured('INVALID'), false);
    assert.equal(isMeasurementIdConfigured('G-ABCD1234EF'), true);
    assert.equal(isMeasurementIdConfigured('G-6HVXECW1B4'), true);
  });

  it('defaults to buildDisabled=true in test mode unless explicitly enabled', () => {
    const cfgDefault = getAnalyticsConfig();
    assert.equal(cfgDefault.buildDisabled, true);
    assert.equal(cfgDefault.measurementId, 'G-6HVXECW1B4');

    const cfgProd = getAnalyticsConfig({
      DEV: false,
      PROD: true,
      MODE: 'production',
      VITE_ANALYTICS_ENABLED: 'true',
      VITE_GA4_MEASUREMENT_ID: 'G-PROD123456',
    });
    assert.equal(cfgProd.buildDisabled, false);
    assert.equal(cfgProd.measurementId, 'G-PROD123456');
  });
});

describe('analytics whitelist & privacy guardrails', () => {
  it('has no PII/forbidden patterns in whitelisted parameter keys', () => {
    for (const eventName of ALLOWED_ANALYTICS_EVENTS) {
      for (const paramKey of ALLOWED_PARAMS_BY_EVENT[eventName]) {
        if (eventName === 'screen_view' && paramKey === 'screen_name') continue;
        assert.equal(
          FORBIDDEN_PARAM_PATTERN.test(paramKey),
          false,
          `Param key "${paramKey}" on event "${eventName}" tripped FORBIDDEN_PARAM_PATTERN`
        );
      }
    }
  });

  it('drops unknown events and strips non-whitelisted or PII parameters', () => {
    assert.equal(sanitizeAnalyticsPayload('borrower_created_secret', { name: 'Sok' }), null);

    const cleanedFeature = sanitizeAnalyticsPayload('feature_used', {
      feature: 'reminder',
      borrowerName: 'Sok Dara',
      phone: '012345678',
      amount: 500,
      balance: 250,
      licenseKey: 'SECRET-KEY',
      deviceCode: 'DEV-999',
      address: 'Phnom Penh',
      notes: 'private note',
      dueDate: '2026-12-01',
      user_id: 'uid_123',
    });
    assert.deepEqual(cleanedFeature, { feature: 'reminder' });

    const invalidFeature = sanitizeAnalyticsPayload('feature_used', {
      feature: 'hacker_export_all_pii',
    });
    assert.deepEqual(invalidFeature, {});

    const cleanedScreen = sanitizeAnalyticsPayload('screen_view', {
      screen_name: 'dashboard',
      borrower_id: 'b1',
    });
    assert.deepEqual(cleanedScreen, { screen_name: 'dashboard' });
  });
});

describe('analytics consent, offline handling, cookies & funnel', () => {
  let gtagCalls: Array<[string, ...unknown[]]>;
  let loadedScripts: string[];
  let clearedCookiesCount: number;
  let online: boolean;

  beforeEach(() => {
    resetAnalyticsStoreMemoryForTests();
    gtagCalls = [];
    loadedScripts = [];
    clearedCookiesCount = 0;
    online = true;

    __setAnalyticsRuntimeForTests({
      measurementId: 'G-REAL998877',
      buildDisabled: false,
      isOnline: () => online,
      sendGtagCommand: (cmd, ...args) => {
        gtagCalls.push([cmd, ...args]);
      },
      loadScript: (id) => {
        loadedScripts.push(id);
      },
      clearCookies: () => {
        clearedCookiesCount += 1;
      },
    });
  });

  afterEach(() => {
    __setAnalyticsRuntimeForTests(null);
    resetAnalyticsStoreMemoryForTests();
  });

  it('sends zero gtag calls and loads no script before user opts in', () => {
    assert.equal(getAnalyticsConsent(), false);
    assert.equal(track('app_open', { online_state: 'online' }), false);
    assert.equal(trackScreenView('dashboard'), false);
    assert.equal(gtagCalls.length, 0);
    assert.equal(loadedScripts.length, 0);
  });

  it('configures Consent Mode v2 (ad signals denied), disables page_view, and tracks whitelisted events after opt-in', () => {
    setAnalyticsConsent(true);
    assert.equal(getAnalyticsConsent(), true);
    assert.deepEqual(loadedScripts, ['G-REAL998877']);

    const defaultConsentCall = gtagCalls.find(
      (c) => c[0] === 'consent' && c[1] === 'default'
    );
    assert.ok(defaultConsentCall);
    assert.deepEqual(defaultConsentCall[2], {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });

    const configCall = gtagCalls.find(
      (c) => c[0] === 'config' && c[1] === 'G-REAL998877'
    );
    assert.ok(configCall);
    assert.deepEqual(configCall[2], {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    assert.equal('user_id' in (configCall[2] as Record<string, unknown>), false);

    assert.equal(track('feature_used', { feature: 'theme_switch' }), true);
    assert.equal(trackScreenView('loans'), true);
    assert.equal(track('app_error', { error_type: 'qr_scan_error' }), true);

    const events = gtagCalls.filter((c) => c[0] === 'event');
    assert.equal(events.length, 3);
    assert.deepEqual(events[0], ['event', 'feature_used', { feature: 'theme_switch' }]);
    assert.deepEqual(events[1], ['event', 'screen_view', { screen_name: 'loans' }]);
    assert.deepEqual(events[2], ['event', 'app_error', { error_type: 'qr_scan_error' }]);
  });

  it('stops sending immediately and removes GA cookies when analytics are turned off', () => {
    setAnalyticsConsent(true);
    assert.equal(trackScreenView('dashboard'), true);
    const sentBeforeOptOut = gtagCalls.filter((c) => c[0] === 'event').length;
    assert.equal(sentBeforeOptOut, 1);

    setAnalyticsConsent(false);
    assert.equal(getAnalyticsConsent(), false);
    assert.equal(clearedCookiesCount, 1);

    const updateDenied = gtagCalls
      .filter((c) => c[0] === 'consent' && c[1] === 'update')
      .at(-1);
    assert.ok(updateDenied);
    assert.deepEqual(updateDenied[2], {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });

    assert.equal(track('feature_used', { feature: 'language_switch' }), false);
    const sentAfterOptOut = gtagCalls.filter((c) => c[0] === 'event').length;
    assert.equal(sentAfterOptOut, 1);
  });

  it('drops events silently when offline and never queues or replays when coming back online', () => {
    setAnalyticsConsent(true);
    online = false;

    assert.equal(track('reminder_sent', { channel: 'telegram' }), false);
    assert.equal(trackScreenView('reports'), false);
    assert.equal(gtagCalls.filter((c) => c[0] === 'event').length, 0);

    online = true;
    assert.equal(trackScreenView('settings'), true);
    const events = gtagCalls.filter((c) => c[0] === 'event');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], ['event', 'screen_view', { screen_name: 'settings' }]);
  });

  it('does nothing when Measurement ID is a placeholder or buildDisabled=true', () => {
    __setAnalyticsRuntimeForTests({
      measurementId: 'G-XXXXXXXXXX',
      buildDisabled: false,
      isOnline: () => true,
      sendGtagCommand: (cmd, ...args) => gtagCalls.push([cmd, ...args]),
      loadScript: (id) => loadedScripts.push(id),
    });
    setAnalyticsConsent(true);
    assert.equal(track('app_open', { online_state: 'online' }), false);
    assert.equal(loadedScripts.length, 0);
    assert.equal(gtagCalls.length, 0);
  });

  it('never throws if script injection fails', () => {
    __setAnalyticsRuntimeForTests({
      measurementId: 'G-REAL998877',
      buildDisabled: false,
      isOnline: () => true,
      sendGtagCommand: (cmd, ...args) => gtagCalls.push([cmd, ...args]),
      loadScript: () => {
        throw new Error('Blocked by adblocker');
      },
    });
    assert.doesNotThrow(() => {
      setAnalyticsConsent(true);
      trackScreenView('dashboard');
    });
  });

  it('sends each activation funnel event at most once per install', async () => {
    setAnalyticsConsent(true);

    assert.equal(await trackFunnelOnce('first_borrower_added'), true);
    assert.equal(await trackFunnelOnce('first_borrower_added'), false);
    assert.equal(await trackFunnelOnce('first_loan_created'), true);
    assert.equal(await trackFunnelOnce('first_loan_created'), false);

    const events = gtagCalls.filter((c) => c[0] === 'event').map((c) => c[1]);
    assert.deepEqual(events, ['first_borrower_added', 'first_loan_created']);
  });
});

describe('buildPortfolioSnapshot & daily portfolio telemetry', () => {
  beforeEach(() => {
    resetAnalyticsStoreMemoryForTests();
  });

  afterEach(() => {
    __setAnalyticsRuntimeForTests(null);
    resetAnalyticsStoreMemoryForTests();
  });

  it('verifies exact boundary buckets for loans_tier, overdue_rate_bucket, avg_loan_size_bucket, avg_term_bucket', () => {
    assert.equal(getLenderSizeTier(0), '0');
    assert.equal(getLenderSizeTier(1), '1-5');
    assert.equal(getLenderSizeTier(5), '1-5');
    assert.equal(getLenderSizeTier(6), '6-10');
    assert.equal(getLenderSizeTier(10), '6-10');
    assert.equal(getLenderSizeTier(11), '11-25');
    assert.equal(getLenderSizeTier(25), '11-25');
    assert.equal(getLenderSizeTier(26), '26-50');
    assert.equal(getLenderSizeTier(50), '26-50');
    assert.equal(getLenderSizeTier(51), '51-100');
    assert.equal(getLenderSizeTier(100), '51-100');
    assert.equal(getLenderSizeTier(101), '100+');

    assert.equal(getOverdueRateBucket(0, 10), '0');
    assert.equal(getOverdueRateBucket(1, 100), '1-10');
    assert.equal(getOverdueRateBucket(10, 100), '1-10');
    assert.equal(getOverdueRateBucket(11, 100), '11-25');
    assert.equal(getOverdueRateBucket(25, 100), '11-25');
    assert.equal(getOverdueRateBucket(26, 100), '26+');

    assert.equal(getAvgLoanSizeBucket(99.99), '<100');
    assert.equal(getAvgLoanSizeBucket(100), '100-500');
    assert.equal(getAvgLoanSizeBucket(500), '100-500');
    assert.equal(getAvgLoanSizeBucket(500.01), '500-2000');
    assert.equal(getAvgLoanSizeBucket(2000), '500-2000');
    assert.equal(getAvgLoanSizeBucket(2000.01), '>2000');

    assert.equal(getAvgTermBucket(0.9), '<1m');
    assert.equal(getAvgTermBucket(1), '1-3m');
    assert.equal(getAvgTermBucket(3), '1-3m');
    assert.equal(getAvgTermBucket(3.1), '3-6m');
    assert.equal(getAvgTermBucket(6), '3-6m');
    assert.equal(getAvgTermBucket(6.1), '>6m');
  });

  it('outputs strictly whitelisted keys and accurately aggregates USD+KHR portfolios without PII', () => {
    const borrowers = [makeBorrower(1), makeBorrower(2)];
    const loans: Loan[] = [
      makeLoan(
        {
          id: 'ln_1',
          borrowerId: 'brw_1',
          borrowerName: 'Sok Dara',
          currency: 'USD',
          principal: 400,
          interestType: 'flat',
          termCount: 4,
          frequency: 'monthly',
          status: 'active',
        },
        1
      ),
      makeLoan(
        {
          id: 'ln_2',
          borrowerId: 'brw_2',
          borrowerName: 'Chanthy',
          currency: 'KHR',
          principal: 2050000, // 500 USD at 4100
          interestType: 'reducing',
          termCount: 8,
          frequency: 'weekly',
          status: 'active',
        },
        2
      ),
      makeLoan(
        {
          id: 'ln_3',
          borrowerId: 'brw_2',
          borrowerName: 'Chanthy',
          currency: 'USD',
          principal: 150,
          interestType: 'flat',
          termCount: 2,
          frequency: 'monthly',
          status: 'settled',
        },
        3
      ),
    ];

    const schedulesByLoan: Record<string, LoanSchedule[]> = {
      ln_1: [
        {
          id: 'inst_1',
          ownerId: 'local_owner',
          loanId: 'ln_1',
          borrowerId: 'brw_1',
          installmentNumber: 1,
          dueDate: '2026-11-10',
          principalDue: 100,
          interestDue: 12,
          totalDue: 112,
          principalPaid: 0,
          interestPaid: 0,
          penaltyPaid: 0,
          status: 'overdue',
        },
      ],
    };

    const snapshot = buildPortfolioSnapshot(loans, borrowers, new Date('2026-11-26T04:00:00Z'), {
      schedulesByLoan,
      exchangeRateKhr: 4100,
      planTier: 'pro',
      appLanguage: 'km',
    });

    assert.deepEqual(Object.keys(snapshot).sort(), [...PORTFOLIO_SNAPSHOT_KEYS].sort());
    assert.deepEqual(snapshot, {
      total_loans: 3,
      active_loans: 2,
      paid_loans: 1,
      overdue_loans: 1,
      borrower_count: 2,
      loans_tier: '1-5',
      overdue_rate_bucket: '26+', // 1 / 2 active = 50%
      avg_loan_size_bucket: '100-500', // (400 + 500 + 150) / 3 = 350 USD
      avg_term_bucket: '1-3m', // (4 + (8*7/30) + 2) / 3 ≈ 2.62 months
      currency_mix: 'both',
      dominant_interest_type: 'flat', // 2 / 3 >= 60%
      dominant_frequency: 'monthly', // 2 / 3 >= 60%
      plan_tier: 'pro',
      app_language: 'km',
    });

    const serialized = JSON.stringify(snapshot);
    assert.equal(serialized.includes('Sok Dara'), false);
    assert.equal(serialized.includes('Chanthy'), false);
    assert.equal(serialized.includes('2050000'), false);
    assert.equal(serialized.includes('2026-11-10'), false);
  });

  it('sends portfolio_snapshot at most once per local calendar day and sets lender_size_tier user property when changed', async () => {
    const gtagCalls: Array<[string, ...unknown[]]> = [];
    __setAnalyticsRuntimeForTests({
      measurementId: 'G-REAL998877',
      buildDisabled: false,
      isOnline: () => true,
      sendGtagCommand: (cmd, ...args) => gtagCalls.push([cmd, ...args]),
      loadScript: () => {},
    });
    setAnalyticsConsent(true);

    const borrowers = [makeBorrower(1)];
    const loans = [makeLoan({}, 1)];

    const day1 = new Date('2026-11-26T03:00:00.000Z'); // 10:00 Phnom Penh
    const sentFirst = await maybeSendDailyPortfolioSnapshot({
      loans,
      borrowers,
      now: day1,
      useWorker: false,
    });
    assert.equal(sentFirst, true);

    const sentDuplicateSameDay = await maybeSendDailyPortfolioSnapshot({
      loans,
      borrowers,
      now: new Date('2026-11-26T15:00:00.000Z'), // 22:00 Phnom Penh same day
      useWorker: false,
    });
    assert.equal(sentDuplicateSameDay, false);

    const userPropCalls = gtagCalls.filter(
      (c) => c[0] === 'set' && c[1] === 'user_properties'
    );
    assert.equal(userPropCalls.length, 1);
    assert.deepEqual(userPropCalls[0][2], { lender_size_tier: '1-5' });

    const day2 = new Date('2026-11-27T02:00:00.000Z'); // Next day Phnom Penh
    const sentNextDay = await maybeSendDailyPortfolioSnapshot({
      loans,
      borrowers,
      now: day2,
      useWorker: false,
    });
    assert.equal(sentNextDay, true);

    // Tier stayed '1-5' so user_properties should not resend unnecessarily
    assert.equal(
      gtagCalls.filter((c) => c[0] === 'set' && c[1] === 'user_properties').length,
      1
    );

    const snapshotEvents = gtagCalls.filter(
      (c) => c[0] === 'event' && c[1] === 'portfolio_snapshot'
    );
    assert.equal(snapshotEvents.length, 2);
  });

  it('hasSentSnapshotToday checks Asia/Phnom_Penh calendar day accurately', () => {
    assert.equal(hasSentSnapshotToday(null, new Date('2026-11-26T10:00:00Z')), false);
    assert.equal(
      hasSentSnapshotToday('2026-11-26T01:00:00Z', new Date('2026-11-26T16:30:00Z')),
      true
    );
    // 2026-11-26T18:00:00Z is 2026-11-27 01:00 in Phnom Penh (+7)
    assert.equal(
      hasSentSnapshotToday('2026-11-26T10:00:00Z', new Date('2026-11-26T18:00:00Z')),
      false
    );
  });

  it('aggregates 1,200+ loans well under performance budget without blocking', () => {
    const borrowers = Array.from({ length: 400 }, (_, i) => makeBorrower(i));
    const loans = Array.from({ length: 1200 }, (_, i) =>
      makeLoan(
        {
          id: `ln_${i}`,
          borrowerId: `brw_${i % 400}`,
          currency: i % 3 === 0 ? 'KHR' : 'USD',
          principal: i % 3 === 0 ? 1200000 : 300 + (i % 5) * 100,
          status: i % 4 === 0 ? 'settled' : 'active',
        },
        i
      )
    );

    const t0 = performance.now();
    const snapshot = buildPortfolioSnapshot(loans, borrowers, new Date('2026-11-26T04:00:00Z'));
    const elapsedMs = performance.now() - t0;

    assert.equal(snapshot.total_loans, 1200);
    assert.equal(snapshot.loans_tier, '100+');
    assert.ok(elapsedMs < 500, `Expected <500ms, took ${elapsedMs.toFixed(1)}ms`);
  });
});
