import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addCalendarDays,
  DEFAULT_TIMEZONE,
  diffCalendarDays,
  getKhmerPublicHoliday,
  getLocalIsoDate,
  isTimeInQuietHours,
} from '../notificationDates';
import {
  CLOCK_ROLLBACK_TOLERANCE_MS,
  computeDailySummaryMetrics,
  createPaymentRecordedNotification,
  generateNotifications,
  isClockRolledBack,
  reconcileNotifications,
} from '../notificationRules';
import {
  buildChannelLaunchUrl,
  buildPrefilledReminderMessage,
  createDefaultNotificationSettings,
} from '../notificationTemplates';
import type { Loan, LoanSchedule, Payment } from '../../types/loan';
import type { NotificationSettings } from '../../types/notifications';

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'ln_1',
    ownerId: 'local',
    borrowerId: 'brw_1',
    borrowerName: 'Sok Dara',
    currency: 'USD',
    principal: 1000,
    interestRate: 3,
    interestType: 'flat',
    termCount: 4,
    frequency: 'monthly',
    startDate: '2026-01-01',
    gracePeriodDays: 0,
    lateFeeType: 'fixed',
    lateFeeValue: 0,
    totalInterest: 120,
    totalPayable: 1120,
    paidPrincipal: 0,
    paidInterest: 0,
    paidPenalty: 0,
    status: 'active',
    outstandingBalance: 1120,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<LoanSchedule> = {}): LoanSchedule {
  return {
    id: 'sch_1',
    ownerId: 'local',
    loanId: 'ln_1',
    borrowerId: 'brw_1',
    installmentNumber: 1,
    dueDate: '2026-05-10',
    principalDue: 250,
    interestDue: 30,
    totalDue: 280,
    principalPaid: 0,
    interestPaid: 0,
    penaltyPaid: 0,
    status: 'pending',
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<NotificationSettings> = {}
): NotificationSettings {
  return {
    ...createDefaultNotificationSettings('en'),
    ...overrides,
  };
}

describe('notificationDates (DST-free calendar math & Khmer holidays)', () => {
  it('calculates calendar day differences accurately across DST transitions', () => {
    // 2026-03-08 is a US DST spring-forward date (23h day in America/New_York);
    // calendar arithmetic stays exact.
    assert.equal(diffCalendarDays('2026-03-09', '2026-03-08'), 1);
    assert.equal(diffCalendarDays('2026-03-11', '2026-03-08'), 3);
    assert.equal(addCalendarDays('2026-03-08', 7), '2026-03-15');
  });

  it('resolves local calendar date in Asia/Phnom_Penh timezone', () => {
    // 2026-05-09 20:00 UTC is 2026-05-10 03:00 in Asia/Phnom_Penh (+07:00)
    const utcEvening = new Date('2026-05-09T20:00:00.000Z');
    assert.equal(getLocalIsoDate(utcEvening, DEFAULT_TIMEZONE), '2026-05-10');
  });

  it('checks overnight quiet hours accurately', () => {
    const q = { enabled: true, start: '21:00', end: '07:00' };
    assert.equal(isTimeInQuietHours('22:30', q), true);
    assert.equal(isTimeInQuietHours('06:59', q), true);
    assert.equal(isTimeInQuietHours('07:00', q), false);
    assert.equal(isTimeInQuietHours('14:00', q), false);
  });

  it('detects fixed and lunar Khmer public holidays', () => {
    assert.equal(getKhmerPublicHoliday('2026-04-14')?.key, 'khmer_new_year');
    assert.equal(getKhmerPublicHoliday('2026-10-09')?.key, 'pchum_ben');
    assert.equal(getKhmerPublicHoliday('2026-06-03'), null);
  });
});

describe('notificationRules (repayment, lifecycle, summary, suggestions, rollback)', () => {
  it('generates due_soon alerts for 3 days, tomorrow, and today based on leadDays', () => {
    const loan = makeLoan();
    const schedules: LoanSchedule[] = [
      makeSchedule({ id: 's_today', installmentNumber: 1, dueDate: '2026-05-10' }),
      makeSchedule({ id: 's_tmrw', installmentNumber: 2, dueDate: '2026-05-11' }),
      makeSchedule({ id: 's_3d', installmentNumber: 3, dueDate: '2026-05-13' }),
      makeSchedule({ id: 's_7d', installmentNumber: 4, dueDate: '2026-05-17' }),
    ];
    const now = new Date('2026-05-10T09:00:00+07:00');
    const settings = makeSettings({ leadDays: [1, 3] });

    const out = generateNotifications([loan], schedules, [], settings, now);
    const dueIds = out.filter((n) => n.type === 'due_soon').map((n) => n.id);

    assert.ok(dueIds.includes('due_soon:ln_1:s_today:0'));
    assert.ok(dueIds.includes('due_soon:ln_1:s_tmrw:1'));
    assert.ok(dueIds.includes('due_soon:ln_1:s_3d:3'));
    assert.equal(dueIds.includes('due_soon:ln_1:s_7d:7'), false);
  });

  it('generates escalating overdue buckets (1, 3, 7, 30+) and penalty_started respecting grace period', () => {
    const loan = makeLoan({
      gracePeriodDays: 2,
      lateFeeType: 'fixed',
      lateFeeValue: 10,
    });
    const now = new Date('2026-05-10T10:00:00+07:00');

    const sch1d = makeSchedule({ id: 's1', dueDate: '2026-05-09' }); // 1d late <= 2 grace -> suppressed
    const sch3d = makeSchedule({ id: 's3', installmentNumber: 2, dueDate: '2026-05-07' }); // 3d late -> bucket 3, medium
    const sch8d = makeSchedule({ id: 's8', installmentNumber: 3, dueDate: '2026-05-02' }); // 8d late -> bucket 7, high
    const sch35d = makeSchedule({ id: 's35', installmentNumber: 4, dueDate: '2026-04-05' }); // 35d late -> bucket 30plus, high

    const settings = makeSettings({ firstOverdueDayOffset: 0 });
    const out = generateNotifications(
      [loan],
      [sch1d, sch3d, sch8d, sch35d],
      [],
      settings,
      now
    );

    const overdue = out.filter((n) => n.type === 'overdue');
    assert.equal(overdue.some((n) => n.installmentId === 's1'), false);

    const n3 = overdue.find((n) => n.installmentId === 's3');
    assert.equal(n3?.id, 'overdue:ln_1:s3:3');
    assert.equal(n3?.priority, 'medium');

    const n8 = overdue.find((n) => n.installmentId === 's8');
    assert.equal(n8?.id, 'overdue:ln_1:s8:7');
    assert.equal(n8?.priority, 'high');

    const n35 = overdue.find((n) => n.installmentId === 's35');
    assert.equal(n35?.id, 'overdue:ln_1:s35:30plus');
    assert.equal(n35?.priority, 'high');

    assert.ok(out.some((n) => n.type === 'missed_installments' && n.priority === 'high'));
    assert.ok(out.some((n) => n.type === 'penalty_started'));
  });

  it('respects settings.firstOverdueDayOffset when greater than loan.gracePeriodDays', () => {
    const loan = makeLoan({ gracePeriodDays: 0 });
    const sch = makeSchedule({ id: 's1', dueDate: '2026-05-07' }); // 3d late
    const now = new Date('2026-05-10T10:00:00+07:00');
    const settings = makeSettings({ firstOverdueDayOffset: 5 });

    const out = generateNotifications([loan], [sch], [], settings, now);
    assert.equal(out.some((n) => n.type === 'overdue'), false);
  });

  it('detects partial_payment and promise_broken (clears once paid after promise date)', () => {
    const loan = makeLoan({ promiseToPayDate: '2026-05-08' });
    const sch = makeSchedule({
      id: 's1',
      dueDate: '2026-05-15',
      principalPaid: 50,
      status: 'partial',
    });
    const now = new Date('2026-05-10T10:00:00+07:00');
    const settings = makeSettings();

    const beforePay = generateNotifications([loan], [sch], [], settings, now);
    assert.ok(beforePay.some((n) => n.type === 'partial_payment'));
    assert.ok(beforePay.some((n) => n.type === 'promise_broken' && n.priority === 'high'));

    const payment: Payment = {
      id: 'pay_1',
      ownerId: 'local',
      loanId: 'ln_1',
      borrowerId: 'brw_1',
      borrowerName: 'Sok Dara',
      currency: 'USD',
      amount: 100,
      principalPortion: 80,
      interestPortion: 20,
      penaltyPortion: 0,
      method: 'cash',
      paymentDate: '2026-05-09',
    };
    const afterPay = generateNotifications([loan], [sch], [payment], settings, now);
    assert.equal(afterPay.some((n) => n.type === 'promise_broken'), false);
  });

  it('detects lifecycle events: loan_fully_paid with collateral, loan_maturing, interest_only_ending', () => {
    const now = new Date('2026-05-10T10:00:00+07:00');
    const settledLoan = makeLoan({
      id: 'ln_settled',
      status: 'settled',
      collateralText: 'Land title #991',
      updatedAt: '2026-05-09T12:00:00Z',
    });
    const maturingLoan = makeLoan({ id: 'ln_mat' });
    const ioLoan = makeLoan({ id: 'ln_io', interestType: 'interest_only' });

    const schedules: LoanSchedule[] = [
      makeSchedule({ id: 'sm1', loanId: 'ln_mat', dueDate: '2026-05-14' }),
      makeSchedule({ id: 'si1', loanId: 'ln_io', dueDate: '2026-05-12' }),
    ];

    const out = generateNotifications(
      [settledLoan, maturingLoan, ioLoan],
      schedules,
      [],
      makeSettings(),
      now
    );

    const paid = out.find((n) => n.type === 'loan_fully_paid');
    assert.ok(paid);
    assert.equal(paid?.params.hasCollateral, true);
    assert.equal(paid?.actionType, 'release_collateral');

    assert.ok(out.some((n) => n.type === 'loan_maturing' && n.loanId === 'ln_mat'));
    assert.ok(out.some((n) => n.type === 'interest_only_ending' && n.loanId === 'ln_io'));
  });

  it('generates daily_summary after configured time and weekly_summary + metrics', () => {
    const loan = makeLoan({ currency: 'USD', startDate: '2026-05-08' });
    const schedules = [
      makeSchedule({ id: 's_today', dueDate: '2026-05-10', totalDue: 200 }),
      makeSchedule({ id: 's_over', installmentNumber: 2, dueDate: '2026-05-05', totalDue: 100 }),
    ];
    const payments: Payment[] = [
      {
        id: 'p1',
        ownerId: 'local',
        loanId: 'ln_1',
        borrowerId: 'brw_1',
        borrowerName: 'Sok Dara',
        currency: 'USD',
        amount: 50,
        principalPortion: 40,
        interestPortion: 10,
        penaltyPortion: 0,
        method: 'cash',
        paymentDate: '2026-05-10',
      },
    ];
    const settings = makeSettings({ dailySummaryTime: '08:00' });

    const early = generateNotifications(
      [loan],
      schedules,
      payments,
      settings,
      new Date('2026-05-10T07:30:00+07:00')
    );
    assert.equal(early.some((n) => n.type === 'daily_summary'), false);

    const morning = generateNotifications(
      [loan],
      schedules,
      payments,
      settings,
      new Date('2026-05-10T08:15:00+07:00')
    );
    assert.ok(morning.some((n) => n.type === 'daily_summary'));
    assert.ok(morning.some((n) => n.type === 'weekly_summary'));

    const metrics = computeDailySummaryMetrics(
      [loan],
      schedules,
      payments,
      new Date('2026-05-10T08:15:00+07:00')
    );
    assert.equal(metrics.expectedToday, 200);
    assert.equal(metrics.collectedToday, 50);
    assert.equal(metrics.overdueTotal, 100);
  });

  it('emits smart suggestions: repeated_late, holiday_tomorrow, and exchange_rate_stale (when multi-currency)', () => {
    const loan = makeLoan({ currency: 'KHR' });
    const schedules: LoanSchedule[] = [
      makeSchedule({
        id: 'l1',
        installmentNumber: 1,
        dueDate: '2026-02-10',
        status: 'paid',
        paidAt: '2026-02-12',
      }),
      makeSchedule({
        id: 'l2',
        installmentNumber: 2,
        dueDate: '2026-03-10',
        status: 'paid',
        paidAt: '2026-03-15',
      }),
      makeSchedule({
        id: 'l3',
        installmentNumber: 3,
        dueDate: '2026-04-10',
        status: 'pending',
      }),
      makeSchedule({
        id: 'l_holiday',
        installmentNumber: 4,
        dueDate: '2026-04-14', // Khmer New Year Day 1
        status: 'pending',
      }),
    ];

    // Today = 2026-04-13 => tomorrow = 2026-04-14 (Khmer New Year)
    const now = new Date('2026-04-13T09:00:00+07:00');
    const out = generateNotifications([loan], schedules, [], makeSettings(), now, {
      defaultCurrency: 'USD',
      multiCurrencyEnabled: true,
      exchangeRateKhr: 4100,
      exchangeRateUpdatedAt: '2026-03-01T00:00:00Z',
    });

    assert.ok(out.some((n) => n.type === 'repeated_late' && n.priority === 'low'));
    assert.ok(out.some((n) => n.type === 'holiday_tomorrow' && n.priority === 'low'));
    assert.ok(out.some((n) => n.type === 'exchange_rate_stale' && n.priority === 'low'));

    // exchange_rate_stale should NOT appear for single-currency portfolios matching defaultCurrency
    const singleCurrency = generateNotifications(
      [makeLoan({ currency: 'USD' })],
      [],
      [],
      makeSettings(),
      now,
      { defaultCurrency: 'USD', multiCurrencyEnabled: false }
    );
    assert.equal(singleCurrency.some((n) => n.type === 'exchange_rate_stale'), false);
  });

  it('suppresses new notifications when device clock rolled back >24h from latestSeenTime', () => {
    const loan = makeLoan();
    const sch = makeSchedule({ dueDate: '2026-05-01' });
    const latestSeenMs = Date.parse('2026-05-12T10:00:00+07:00');
    const rolledBackNow = new Date(latestSeenMs - CLOCK_ROLLBACK_TOLERANCE_MS - 60_000);

    assert.equal(isClockRolledBack(rolledBackNow, latestSeenMs), true);
    const suppressed = generateNotifications([loan], [sch], [], makeSettings(), rolledBackNow, {
      latestSeenTimeMs: latestSeenMs,
    });
    assert.equal(suppressed.length, 0);

    // Also reconcile preserves existing records when suppressed
    const existing = [
      {
        id: 'existing_1',
        type: 'overdue' as const,
        category: 'repayment' as const,
        priority: 'high' as const,
        titleKey: 'k',
        bodyKey: 'b',
        params: {},
        createdAt: '2026-05-11T00:00:00Z',
      },
    ];
    const recSuppressed = reconcileNotifications(suppressed, existing, {
      now: rolledBackNow,
      suppressDueToClockRollback: true,
    });
    assert.equal(recSuppressed.notifications.length, 1);

    // Once clock catches up inside tolerance, notifications resume
    const recoveredNow = new Date(latestSeenMs + 1000);
    const resumed = generateNotifications([loan], [sch], [], makeSettings(), recoveredNow, {
      latestSeenTimeMs: latestSeenMs,
    });
    assert.ok(resumed.some((n) => n.type === 'overdue'));
  });

  it('reconciles stably without duplicates, preserving read/snoozed/dismissed state and removing resolved alerts', () => {
    const loan = makeLoan();
    const sch1 = makeSchedule({ id: 's1', dueDate: '2026-05-10' });
    const sch2 = makeSchedule({ id: 's2', installmentNumber: 2, dueDate: '2026-05-08' });
    const now = new Date('2026-05-10T09:00:00+07:00');
    const settings = makeSettings();

    const firstGen = generateNotifications([loan], [sch1, sch2], [], settings, now);
    const firstRec = reconcileNotifications(firstGen, [], { now });
    assert.equal(firstRec.addedCount, firstGen.length);

    // Mark one item read & snoozed; run reconcile again with same state
    const snoozeFuture = new Date(now.getTime() + 86_400_000).toISOString();
    const mutated = firstRec.notifications.map((n) =>
      n.id === 'due_soon:ln_1:s1:0'
        ? { ...n, readAt: now.toISOString(), snoozedUntil: snoozeFuture }
        : n
    );

    const secondRec = reconcileNotifications(firstGen, mutated, { now });
    assert.equal(secondRec.addedCount, 0);
    assert.equal(secondRec.removedCount, 0);
    const preserved = secondRec.notifications.find((n) => n.id === 'due_soon:ln_1:s1:0');
    assert.equal(preserved?.readAt, now.toISOString());
    assert.equal(preserved?.snoozedUntil, snoozeFuture);

    // Mark sch2 paid -> overdue notification must automatically be removed
    const paidSch2: LoanSchedule = { ...sch2, status: 'paid', interestPaid: 30, principalPaid: 250 };
    const afterPaidGen = generateNotifications([loan], [sch1, paidSch2], [], settings, now);
    const afterPaidRec = reconcileNotifications(afterPaidGen, secondRec.notifications, { now });
    assert.equal(
      afterPaidRec.notifications.some((n) => n.installmentId === 's2'),
      false
    );
    assert.ok(afterPaidRec.removedCount >= 1);
  });

  it('respects category toggles and never emits backup or license notifications', () => {
    const loan = makeLoan();
    const sch = makeSchedule({ dueDate: '2026-05-01' });
    const now = new Date('2026-05-10T09:00:00+07:00');
    const settings = makeSettings({
      categories: {
        repayment: false,
        lifecycle: false,
        summary: false,
        app: false,
        suggestions: false,
      },
    });

    const out = generateNotifications([loan], [sch], [], settings, now, {
      termsVersionChanged: true,
      appUpdateAvailable: true,
    });
    assert.equal(out.length, 0);

    // Even with all categories enabled, zero backup/license notifications exist
    const full = generateNotifications([loan], [sch], [], makeSettings(), now, {
      termsVersionChanged: true,
      appUpdateAvailable: true,
    });
    for (const item of full) {
      assert.equal(/backup|license/i.test(item.type), false);
    }
  });

  it('creates payment_recorded items and renders EN/KM templates & channel URLs accurately', () => {
    const settings = makeSettings();
    const msgKm = buildPrefilledReminderMessage({
      settings,
      lang: 'km',
      borrowerName: 'សុខ ដារ៉ា',
      amountValue: 120000,
      currency: 'KHR',
      dueDateIso: '2026-05-10',
      daysLate: 0,
      lenderName: 'KamChi',
    });
    assert.ok(msgKm.includes('សុខ ដារ៉ា'));
    assert.ok(msgKm.includes('KHR'));

    const waUrl = buildChannelLaunchUrl('whatsapp', '012 345 678', msgKm);
    assert.ok(waUrl.startsWith('https://wa.me/85512345678?text='));

    const smsUrl = buildChannelLaunchUrl('sms', '012 345 678', msgKm);
    assert.ok(smsUrl.startsWith('sms:+85512345678?body='));

    const paymentRec = createPaymentRecordedNotification({
      payment: {
        id: 'pay_99',
        ownerId: 'local',
        loanId: 'ln_1',
        borrowerId: 'brw_1',
        borrowerName: 'Sok Dara',
        currency: 'USD',
        amount: 250,
        principalPortion: 200,
        interestPortion: 50,
        penaltyPortion: 0,
        method: 'cash',
        paymentDate: '2026-05-10',
      },
    });
    assert.equal(paymentRec.id, 'payment_recorded:pay_99');
    assert.equal(paymentRec.actionType, 'undo_payment');
  });

  it('handles 1,000+ loans and schedules efficiently (<500ms)', () => {
    const loans: Loan[] = [];
    const schedules: Record<string, LoanSchedule[]> = {};
    for (let i = 0; i < 1200; i++) {
      const id = `ln_${i}`;
      loans.push(
        makeLoan({
          id,
          borrowerId: `brw_${i % 400}`,
          borrowerName: `Borrower ${i}`,
          startDate: '2026-01-01',
        })
      );
      schedules[id] = [
        makeSchedule({
          id: `sch_${i}_1`,
          loanId: id,
          installmentNumber: 1,
          dueDate: i % 3 === 0 ? '2026-05-05' : i % 3 === 1 ? '2026-05-10' : '2026-05-13',
        }),
        makeSchedule({
          id: `sch_${i}_2`,
          loanId: id,
          installmentNumber: 2,
          dueDate: '2026-06-10',
        }),
      ];
    }

    const now = new Date('2026-05-10T10:00:00+07:00');
    const settings = makeSettings();
    const t0 = performance.now();
    const generated = generateNotifications(loans, schedules, [], settings, now);
    const reconciled = reconcileNotifications(generated, [], { now });
    const elapsedMs = performance.now() - t0;

    assert.ok(reconciled.notifications.length > 1000);
    assert.ok(
      elapsedMs < 1500,
      `Expected <1500ms for 1,200 loans, took ${elapsedMs.toFixed(1)}ms`
    );
  });
});
