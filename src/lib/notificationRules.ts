import {
  computeScheduleLateFee,
  convertCurrency,
  formatCurrency,
  roundMoney,
} from './finance';
import {
  addCalendarDays,
  DEFAULT_TIMEZONE,
  diffCalendarDays,
  getIsoWeekKey,
  getKhmerPublicHoliday,
  getLocalHHMM,
  getLocalIsoDate,
  resolveDeviceTimeZone,
} from './notificationDates';
import type {
  AppLanguage,
  CurrencyCode,
  Loan,
  LoanSchedule,
  Payment,
} from '../types/loan';
import type {
  NotificationCandidate,
  NotificationRecord,
  NotificationSettings,
} from '../types/notifications';

export const CLOCK_ROLLBACK_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const PAYMENT_RECORDED_RETENTION_DAYS = 30;
const SETTLED_LOAN_WINDOW_DAYS = 14;
const EXCHANGE_RATE_STALE_DAYS = 14;

export interface GenerateNotificationsContext {
  timeZone?: string;
  latestSeenTimeMs?: number | null;
  defaultCurrency?: CurrencyCode;
  exchangeRateKhr?: number;
  exchangeRateUpdatedAt?: string;
  multiCurrencyEnabled?: boolean;
  displayLang?: AppLanguage;
  useKhmerNumerals?: boolean;
  termsVersionChanged?: boolean;
  currentTermsVersion?: string;
  appUpdateAvailable?: boolean;
  appUpdateVersion?: string;
}

export interface DailySummaryMetrics {
  dateIso: string;
  currency: CurrencyCode;
  expectedToday: number;
  collectedToday: number;
  overdueTotal: number;
  expectedTodayFormatted: string;
  collectedTodayFormatted: string;
  overdueTotalFormatted: string;
  dueTodayCount: number;
  overdueCount: number;
}

export function isClockRolledBack(
  now: Date | number,
  latestSeenTimeMs?: number | null
): boolean {
  if (typeof latestSeenTimeMs !== 'number' || !Number.isFinite(latestSeenTimeMs)) {
    return false;
  }
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return nowMs < latestSeenTimeMs - CLOCK_ROLLBACK_TOLERANCE_MS;
}

function normalizeSchedulesMap(
  schedules: Record<string, LoanSchedule[]> | LoanSchedule[]
): Map<string, LoanSchedule[]> {
  const map = new Map<string, LoanSchedule[]>();
  if (Array.isArray(schedules)) {
    for (const s of schedules) {
      let arr = map.get(s.loanId);
      if (!arr) {
        arr = [];
        map.set(s.loanId, arr);
      }
      arr.push(s);
    }
  } else if (schedules && typeof schedules === 'object') {
    for (const [loanId, list] of Object.entries(schedules)) {
      if (Array.isArray(list) && list.length > 0) {
        map.set(loanId, list);
      }
    }
  }
  return map;
}

function extractIsoDate(raw: unknown): string | null {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  if (raw && typeof raw === 'object' && 'toDate' in raw && typeof (raw as { toDate: () => Date }).toDate === 'function') {
    try {
      return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }
  return null;
}

export function computeDailySummaryMetrics(
  loans: Loan[],
  schedules: Record<string, LoanSchedule[]> | LoanSchedule[],
  payments: Payment[],
  now: Date | number,
  context: GenerateNotificationsContext = {}
): DailySummaryMetrics {
  const timeZone = resolveDeviceTimeZone(context.timeZone || DEFAULT_TIMEZONE);
  const nowDate = typeof now === 'number' ? new Date(now) : now;
  const todayIso = getLocalIsoDate(nowDate, timeZone);
  const currency = context.defaultCurrency || 'USD';
  const rate = context.exchangeRateKhr || 4100;
  const lang = context.displayLang || 'en';
  const useKh = Boolean(context.useKhmerNumerals);
  const scheduleMap = normalizeSchedulesMap(schedules);

  let expectedToday = 0;
  let overdueTotal = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;

  for (const loan of loans) {
    if (loan.status !== 'active') continue;
    const schList = scheduleMap.get(loan.id) || [];
    for (const sch of schList) {
      if (sch.status === 'paid') continue;
      const unpaid = Math.max(0, sch.totalDue - (sch.principalPaid + sch.interestPaid));
      if (unpaid <= 0.005) continue;
      const { accruedPenalty } = computeScheduleLateFee(sch, loan, todayIso);
      const totalUnpaid = unpaid + Math.max(0, accruedPenalty - sch.penaltyPaid);
      const converted = convertCurrency(totalUnpaid, loan.currency, currency, rate);

      if (sch.dueDate === todayIso) {
        expectedToday += converted;
        dueTodayCount += 1;
      } else if (sch.dueDate < todayIso) {
        overdueTotal += converted;
        overdueCount += 1;
      }
    }
  }

  let collectedToday = 0;
  for (const p of payments) {
    if (p.paymentDate === todayIso) {
      collectedToday += convertCurrency(p.amount, p.currency, currency, rate);
    }
  }

  expectedToday = roundMoney(expectedToday, currency);
  collectedToday = roundMoney(collectedToday, currency);
  overdueTotal = roundMoney(overdueTotal, currency);

  return {
    dateIso: todayIso,
    currency,
    expectedToday,
    collectedToday,
    overdueTotal,
    expectedTodayFormatted: formatCurrency(expectedToday, currency, lang, useKh),
    collectedTodayFormatted: formatCurrency(collectedToday, currency, lang, useKh),
    overdueTotalFormatted: formatCurrency(overdueTotal, currency, lang, useKh),
    dueTodayCount,
    overdueCount,
  };
}

/**
 * Pure, deterministic rules engine returning the full set of notifications that SHOULD exist
 * given current loans, schedules, payments, settings, and timestamp.
 */
export function generateNotifications(
  loans: Loan[],
  schedules: Record<string, LoanSchedule[]> | LoanSchedule[],
  payments: Payment[],
  settings: NotificationSettings,
  now: Date | number,
  context: GenerateNotificationsContext = {}
): NotificationCandidate[] {
  const nowDate = typeof now === 'number' ? new Date(now) : now;
  const nowMs = nowDate.getTime();

  // Clock rollback protection: do not generate new notifications if clock jumped >24h backwards
  if (isClockRolledBack(nowMs, context.latestSeenTimeMs)) {
    return [];
  }

  const timeZone = resolveDeviceTimeZone(context.timeZone || DEFAULT_TIMEZONE);
  const todayIso = getLocalIsoDate(nowDate, timeZone);
  const tomorrowIso = addCalendarDays(todayIso, 1);
  const localHHMM = getLocalHHMM(nowDate, timeZone);
  const displayLang = context.displayLang || settings.defaultReminderLanguage || 'en';
  const useKh = Boolean(context.useKhmerNumerals);
  const currency = context.defaultCurrency || 'USD';
  const rate = context.exchangeRateKhr || 4100;

  const scheduleMap = normalizeSchedulesMap(schedules);
  const paymentsByLoan = new Map<string, Payment[]>();
  for (const p of payments) {
    let arr = paymentsByLoan.get(p.loanId);
    if (!arr) {
      arr = [];
      paymentsByLoan.set(p.loanId, arr);
    }
    arr.push(p);
  }

  const leadSet = new Set(settings.leadDays || []);
  const results: NotificationCandidate[] = [];

  // Track borrower-level installment timeliness for smart suggestions (repeated_late)
  const borrowerTimeline = new Map<
    string,
    { borrowerName: string; records: Array<{ dueDate: string; late: boolean }> }
  >();

  let dueTomorrowCount = 0;
  let expectedToday = 0;
  let overdueTotal = 0;
  let dueTodayCount = 0;
  let overdueTotalCount = 0;
  const currenciesSeen = new Set<CurrencyCode>();

  for (const loan of loans) {
    currenciesSeen.add(loan.currency);
    const schList = scheduleMap.get(loan.id) || [];
    const loanPayments = paymentsByLoan.get(loan.id) || [];

    // Record timeline for repeated_late suggestion
    if (settings.categories.suggestions && schList.length > 0) {
      let entry = borrowerTimeline.get(loan.borrowerId);
      if (!entry) {
        entry = { borrowerName: loan.borrowerName, records: [] };
        borrowerTimeline.set(loan.borrowerId, entry);
      }
      for (const s of schList) {
        if (s.status === 'paid') {
          if (s.paidAt && s.paidAt > s.dueDate) {
            entry.records.push({ dueDate: s.dueDate, late: true });
          } else {
            entry.records.push({ dueDate: s.dueDate, late: false });
          }
        } else if (s.dueDate < todayIso) {
          entry.records.push({ dueDate: s.dueDate, late: true });
        }
      }
    }

    // Lifecycle: loan_fully_paid (within 14 days)
    if (settings.categories.lifecycle && loan.status === 'settled') {
      const updatedIso =
        extractIsoDate(loan.updatedAt) ||
        loanPayments.reduce<string | null>(
          (latest, p) => (!latest || p.paymentDate > latest ? p.paymentDate : latest),
          null
        );
      const ageDays = updatedIso ? diffCalendarDays(todayIso, updatedIso) : 0;
      if (ageDays >= 0 && ageDays <= SETTLED_LOAN_WINDOW_DAYS) {
        const hasCollateral = Boolean(loan.collateralText?.trim() || loan.collateralPhotoUrl);
        results.push({
          id: `loan_fully_paid:${loan.id}`,
          type: 'loan_fully_paid',
          category: 'lifecycle',
          priority: 'low',
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          titleKey: 'items.loan_fully_paid.title',
          bodyKey: hasCollateral
            ? 'items.loan_fully_paid.bodyWithCollateral'
            : 'items.loan_fully_paid.body',
          params: {
            borrowerName: loan.borrowerName,
            hasCollateral,
            collateralText: loan.collateralText || '',
            amountFormatted: formatCurrency(loan.totalPayable, loan.currency, displayLang, useKh),
          },
          eventDate: updatedIso || todayIso,
          actionType: hasCollateral ? 'release_collateral' : undefined,
          currency: loan.currency,
          amountValue: loan.totalPayable,
        });
      }
      continue;
    }

    if (loan.status !== 'active') continue;

    // Sort schedules once per active loan if needed to locate final installment
    let maxDueDate = '';
    for (const s of schList) {
      if (!maxDueDate || s.dueDate > maxDueDate) {
        maxDueDate = s.dueDate;
      }
    }

    // Lifecycle: loan_maturing & interest_only_ending (final due date within 0..7 days)
    if (settings.categories.lifecycle && maxDueDate) {
      const daysToMaturity = diffCalendarDays(maxDueDate, todayIso);
      if (daysToMaturity >= 0 && daysToMaturity <= 7) {
        if (loan.interestType === 'interest_only') {
          results.push({
            id: `interest_only_ending:${loan.id}`,
            type: 'interest_only_ending',
            category: 'lifecycle',
            priority: 'medium',
            loanId: loan.id,
            borrowerId: loan.borrowerId,
            titleKey: 'items.interest_only_ending.title',
            bodyKey: 'items.interest_only_ending.body',
            params: {
              borrowerName: loan.borrowerName,
              days: daysToMaturity,
              dueDate: maxDueDate,
              amountFormatted: formatCurrency(
                loan.outstandingBalance,
                loan.currency,
                displayLang,
                useKh
              ),
            },
            eventDate: todayIso,
            actionType: 'record_payment',
            currency: loan.currency,
            amountValue: loan.outstandingBalance,
            dueDate: maxDueDate,
          });
        } else {
          results.push({
            id: `loan_maturing:${loan.id}`,
            type: 'loan_maturing',
            category: 'lifecycle',
            priority: 'low',
            loanId: loan.id,
            borrowerId: loan.borrowerId,
            titleKey: 'items.loan_maturing.title',
            bodyKey: 'items.loan_maturing.body',
            params: {
              borrowerName: loan.borrowerName,
              days: daysToMaturity,
              dueDate: maxDueDate,
              amountFormatted: formatCurrency(
                loan.outstandingBalance,
                loan.currency,
                displayLang,
                useKh
              ),
            },
            eventDate: todayIso,
            actionType: 'record_payment',
            currency: loan.currency,
            amountValue: loan.outstandingBalance,
            dueDate: maxDueDate,
          });
        }
      }
    }

    // Repayment: promise_broken
    if (
      settings.categories.repayment &&
      loan.promiseToPayDate &&
      diffCalendarDays(todayIso, loan.promiseToPayDate) > 0
    ) {
      const fulfilledByPayment = loanPayments.some(
        (p) => p.paymentDate >= loan.promiseToPayDate!
      );
      if (!fulfilledByPayment) {
        const daysSincePromise = diffCalendarDays(todayIso, loan.promiseToPayDate);
        results.push({
          id: `promise_broken:${loan.id}:${loan.promiseToPayDate}`,
          type: 'promise_broken',
          category: 'repayment',
          priority: 'high',
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          titleKey: 'items.promise_broken.title',
          bodyKey: 'items.promise_broken.body',
          params: {
            borrowerName: loan.borrowerName,
            promiseDate: loan.promiseToPayDate,
            daysLate: daysSincePromise,
            amountFormatted: formatCurrency(
              loan.outstandingBalance,
              loan.currency,
              displayLang,
              useKh
            ),
          },
          eventDate: loan.promiseToPayDate,
          actionType: 'record_payment',
          currency: loan.currency,
          amountValue: loan.outstandingBalance,
          daysLate: daysSincePromise,
          dueDate: loan.promiseToPayDate,
        });
      }
    }

    const graceOffset = Math.max(
      loan.gracePeriodDays ?? 0,
      settings.firstOverdueDayOffset ?? 0
    );
    let unpaidPastDueCount = 0;
    let firstPenaltyInstallment: { id: string; dueDate: string; daysLate: number; totalUnpaid: number } | null = null;

    for (const sch of schList) {
      if (sch.status === 'paid') continue;
      const paidSoFar = roundMoney(sch.principalPaid + sch.interestPaid, loan.currency);
      const unpaidBase = Math.max(0, roundMoney(sch.totalDue - paidSoFar, loan.currency));
      if (unpaidBase <= 0.005) continue;

      const { accruedPenalty } = computeScheduleLateFee(sch, loan, todayIso);
      const unpaidPenalty = Math.max(0, roundMoney(accruedPenalty - sch.penaltyPaid, loan.currency));
      const totalUnpaid = roundMoney(unpaidBase + unpaidPenalty, loan.currency);
      const amountFormatted = formatCurrency(totalUnpaid, loan.currency, displayLang, useKh);

      const daysUntilDue = diffCalendarDays(sch.dueDate, todayIso);
      const daysLate = -daysUntilDue;

      if (sch.dueDate === tomorrowIso) {
        dueTomorrowCount += 1;
      }

      if (daysUntilDue === 0) {
        expectedToday += convertCurrency(totalUnpaid, loan.currency, currency, rate);
        dueTodayCount += 1;
      } else if (daysLate > 0) {
        overdueTotal += convertCurrency(totalUnpaid, loan.currency, currency, rate);
        overdueTotalCount += 1;
      }

      // Repayment: partial_payment
      if (
        settings.categories.repayment &&
        (sch.status === 'partial' || paidSoFar > 0.005)
      ) {
        results.push({
          id: `partial_payment:${loan.id}:${sch.id}`,
          type: 'partial_payment',
          category: 'repayment',
          priority: 'medium',
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          installmentId: sch.id,
          titleKey: 'items.partial_payment.title',
          bodyKey: 'items.partial_payment.body',
          params: {
            borrowerName: loan.borrowerName,
            installmentNumber: sch.installmentNumber,
            paidFormatted: formatCurrency(paidSoFar, loan.currency, displayLang, useKh),
            remainingFormatted: amountFormatted,
            dueDate: sch.dueDate,
          },
          eventDate: sch.dueDate,
          actionType: 'record_payment',
          currency: loan.currency,
          amountValue: totalUnpaid,
          dueDate: sch.dueDate,
        });
      }

      // Repayment: due_soon (today always when repayment enabled; 1, 3, 7 based on leadDays)
      if (
        settings.categories.repayment &&
        (daysUntilDue === 0 || ((daysUntilDue === 1 || daysUntilDue === 3 || daysUntilDue === 7) && leadSet.has(daysUntilDue)))
      ) {
        const bodyKey =
          daysUntilDue === 0
            ? 'items.due_soon.bodyToday'
            : daysUntilDue === 1
            ? 'items.due_soon.bodyTomorrow'
            : 'items.due_soon.bodyInDays';
        results.push({
          id: `due_soon:${loan.id}:${sch.id}:${daysUntilDue}`,
          type: 'due_soon',
          category: 'repayment',
          priority: daysUntilDue <= 1 ? 'medium' : 'low',
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          installmentId: sch.id,
          titleKey:
            daysUntilDue === 0
              ? 'items.due_soon.titleToday'
              : 'items.due_soon.titleUpcoming',
          bodyKey,
          params: {
            borrowerName: loan.borrowerName,
            installmentNumber: sch.installmentNumber,
            daysUntil: daysUntilDue,
            dueDate: sch.dueDate,
            amountFormatted,
          },
          eventDate: sch.dueDate,
          groupKey: `due_soon:${daysUntilDue}`,
          actionType: 'record_payment',
          currency: loan.currency,
          amountValue: totalUnpaid,
          daysLate: -daysUntilDue,
          dueDate: sch.dueDate,
        });
      }

      // Overdue & Missed & Penalty
      if (daysLate > 0) {
        unpaidPastDueCount += 1;

        if (daysLate > graceOffset) {
          if (settings.categories.repayment) {
            const bucket =
              daysLate >= 30 ? '30plus' : daysLate >= 7 ? '7' : daysLate >= 3 ? '3' : '1';
            const priority = bucket === '30plus' || bucket === '7' ? 'high' : 'medium';

            results.push({
              id: `overdue:${loan.id}:${sch.id}:${bucket}`,
              type: 'overdue',
              category: 'repayment',
              priority,
              loanId: loan.id,
              borrowerId: loan.borrowerId,
              installmentId: sch.id,
              titleKey: `items.overdue.title_${bucket}`,
              bodyKey: 'items.overdue.body',
              params: {
                borrowerName: loan.borrowerName,
                installmentNumber: sch.installmentNumber,
                daysLate,
                dueDate: sch.dueDate,
                amountFormatted,
                bucket,
              },
              eventDate: sch.dueDate,
              groupKey: `overdue:${bucket}`,
              actionType: 'record_payment',
              currency: loan.currency,
              amountValue: totalUnpaid,
              daysLate,
              dueDate: sch.dueDate,
            });
          }

          if (
            settings.categories.lifecycle &&
            (loan.lateFeeValue ?? 0) > 0 &&
            !firstPenaltyInstallment
          ) {
            firstPenaltyInstallment = {
              id: sch.id,
              dueDate: sch.dueDate,
              daysLate,
              totalUnpaid,
            };
          }
        }
      }
    }

    // Repayment: missed_installments (2+ unpaid past-due installments)
    if (settings.categories.repayment && unpaidPastDueCount >= 2) {
      results.push({
        id: `missed_installments:${loan.id}`,
        type: 'missed_installments',
        category: 'repayment',
        priority: 'high',
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        titleKey: 'items.missed_installments.title',
        bodyKey: 'items.missed_installments.body',
        params: {
          borrowerName: loan.borrowerName,
          count: unpaidPastDueCount,
          amountFormatted: formatCurrency(
            loan.outstandingBalance,
            loan.currency,
            displayLang,
            useKh
          ),
        },
        eventDate: todayIso,
        actionType: 'record_payment',
        currency: loan.currency,
        amountValue: loan.outstandingBalance,
      });
    }

    // Lifecycle: penalty_started
    if (settings.categories.lifecycle && firstPenaltyInstallment) {
      results.push({
        id: `penalty_started:${loan.id}:${firstPenaltyInstallment.id}`,
        type: 'penalty_started',
        category: 'lifecycle',
        priority: 'medium',
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        installmentId: firstPenaltyInstallment.id,
        titleKey: 'items.penalty_started.title',
        bodyKey: 'items.penalty_started.body',
        params: {
          borrowerName: loan.borrowerName,
          daysLate: firstPenaltyInstallment.daysLate,
          graceDays: graceOffset,
          dueDate: firstPenaltyInstallment.dueDate,
          amountFormatted: formatCurrency(
            firstPenaltyInstallment.totalUnpaid,
            loan.currency,
            displayLang,
            useKh
          ),
        },
        eventDate: todayIso,
        actionType: 'record_payment',
        currency: loan.currency,
        amountValue: firstPenaltyInstallment.totalUnpaid,
        daysLate: firstPenaltyInstallment.daysLate,
        dueDate: firstPenaltyInstallment.dueDate,
      });
    }
  }

  // Money overview: daily_summary & weekly_summary
  if (settings.categories.summary) {
    let collectedToday = 0;
    const weekStartIso = addCalendarDays(todayIso, -6);
    let collectedWeek = 0;
    let interestEarnedWeek = 0;

    for (const p of payments) {
      if (p.paymentDate === todayIso) {
        collectedToday += convertCurrency(p.amount, p.currency, currency, rate);
      }
      if (p.paymentDate >= weekStartIso && p.paymentDate <= todayIso) {
        collectedWeek += convertCurrency(p.amount, p.currency, currency, rate);
        interestEarnedWeek += convertCurrency(p.interestPortion || 0, p.currency, currency, rate);
      }
    }

    if (localHHMM >= (settings.dailySummaryTime || '08:00')) {
      results.push({
        id: `daily_summary:${todayIso}`,
        type: 'daily_summary',
        category: 'summary',
        priority: 'info',
        titleKey: 'items.daily_summary.title',
        bodyKey: 'items.daily_summary.body',
        params: {
          dateIso: todayIso,
          expectedTodayFormatted: formatCurrency(
            roundMoney(expectedToday, currency),
            currency,
            displayLang,
            useKh
          ),
          collectedTodayFormatted: formatCurrency(
            roundMoney(collectedToday, currency),
            currency,
            displayLang,
            useKh
          ),
          overdueTotalFormatted: formatCurrency(
            roundMoney(overdueTotal, currency),
            currency,
            displayLang,
            useKh
          ),
          dueCount: dueTodayCount,
          overdueCount: overdueTotalCount,
        },
        eventDate: todayIso,
        currency,
      });
    }

    let newLoansWeek = 0;
    for (const loan of loans) {
      if (loan.startDate >= weekStartIso && loan.startDate <= todayIso) {
        newLoansWeek += 1;
      }
    }

    if (loans.length > 0 || payments.length > 0) {
      const weekKey = getIsoWeekKey(todayIso);
      results.push({
        id: `weekly_summary:${weekKey}`,
        type: 'weekly_summary',
        category: 'summary',
        priority: 'info',
        titleKey: 'items.weekly_summary.title',
        bodyKey: 'items.weekly_summary.body',
        params: {
          weekKey,
          collectedFormatted: formatCurrency(
            roundMoney(collectedWeek, currency),
            currency,
            displayLang,
            useKh
          ),
          newLoansCount: newLoansWeek,
          interestFormatted: formatCurrency(
            roundMoney(interestEarnedWeek, currency),
            currency,
            displayLang,
            useKh
          ),
          parFormatted: formatCurrency(
            roundMoney(overdueTotal, currency),
            currency,
            displayLang,
            useKh
          ),
        },
        eventDate: todayIso,
        currency,
      });
    }
  }

  // App category: terms_updated & app_update_available
  if (settings.categories.app) {
    if (context.termsVersionChanged) {
      const version = context.currentTermsVersion || 'updated';
      results.push({
        id: `terms_updated:${version}`,
        type: 'terms_updated',
        category: 'app',
        priority: 'info',
        titleKey: 'items.terms_updated.title',
        bodyKey: 'items.terms_updated.body',
        params: { version },
        eventDate: todayIso,
        actionType: 'open_terms',
      });
    }

    if (context.appUpdateAvailable) {
      const swVer = context.appUpdateVersion || 'latest';
      results.push({
        id: `app_update_available:${swVer}`,
        type: 'app_update_available',
        category: 'app',
        priority: 'info',
        titleKey: 'items.app_update_available.title',
        bodyKey: 'items.app_update_available.body',
        params: { version: swVer },
        eventDate: todayIso,
        actionType: 'reload_app',
      });
    }
  }

  // Smart suggestions (low priority)
  if (settings.categories.suggestions) {
    // 1. repeated_late: 3 late installments in a row
    for (const [borrowerId, info] of borrowerTimeline.entries()) {
      if (info.records.length < 3) continue;
      info.records.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const lastThree = info.records.slice(-3);
      if (lastThree.every((r) => r.late)) {
        results.push({
          id: `repeated_late:${borrowerId}`,
          type: 'repeated_late',
          category: 'suggestions',
          priority: 'low',
          borrowerId,
          titleKey: 'items.repeated_late.title',
          bodyKey: 'items.repeated_late.body',
          params: {
            borrowerName: info.borrowerName,
            streak: 3,
          },
          eventDate: todayIso,
        });
      }
    }

    // 2. holiday_tomorrow
    const holidayTomorrow = getKhmerPublicHoliday(tomorrowIso);
    if (holidayTomorrow && dueTomorrowCount > 0) {
      results.push({
        id: `holiday_tomorrow:${tomorrowIso}`,
        type: 'holiday_tomorrow',
        category: 'suggestions',
        priority: 'low',
        titleKey: 'items.holiday_tomorrow.title',
        bodyKey: 'items.holiday_tomorrow.body',
        params: {
          dateIso: tomorrowIso,
          holidayName:
            displayLang === 'km' ? holidayTomorrow.nameKm : holidayTomorrow.nameEn,
          holidayNameEn: holidayTomorrow.nameEn,
          holidayNameKm: holidayTomorrow.nameKm,
          dueCount: dueTomorrowCount,
        },
        eventDate: todayIso,
      });
    }

    // 3. exchange_rate_stale (only if multi-currency is active)
    const isMultiCurrency =
      Boolean(context.multiCurrencyEnabled) ||
      currenciesSeen.size > 1 ||
      (currenciesSeen.size === 1 && !currenciesSeen.has(currency));
    if (isMultiCurrency) {
      const updatedIso = extractIsoDate(context.exchangeRateUpdatedAt);
      const staleDays = updatedIso
        ? diffCalendarDays(todayIso, updatedIso)
        : EXCHANGE_RATE_STALE_DAYS + 1;
      if (staleDays >= EXCHANGE_RATE_STALE_DAYS) {
        results.push({
          id: `exchange_rate_stale:${getIsoWeekKey(todayIso)}`,
          type: 'exchange_rate_stale',
          category: 'suggestions',
          priority: 'low',
          titleKey: 'items.exchange_rate_stale.title',
          bodyKey: 'items.exchange_rate_stale.body',
          params: {
            rate,
            daysSinceUpdate: staleDays,
          },
          eventDate: todayIso,
          actionType: 'open_settings',
        });
      }
    }
  }

  return results;
}

export function createPaymentRecordedNotification(params: {
  payment: Payment;
  now?: Date;
  displayLang?: AppLanguage;
  useKhmerNumerals?: boolean;
  timeZone?: string;
}): NotificationRecord {
  const nowDate = params.now || new Date();
  const timeZone = resolveDeviceTimeZone(params.timeZone || DEFAULT_TIMEZONE);
  const todayIso = getLocalIsoDate(nowDate, timeZone);
  const lang = params.displayLang || 'en';
  const useKh = Boolean(params.useKhmerNumerals);

  return {
    id: `payment_recorded:${params.payment.id}`,
    type: 'payment_recorded',
    category: 'repayment',
    priority: 'low',
    loanId: params.payment.loanId,
    borrowerId: params.payment.borrowerId,
    paymentId: params.payment.id,
    titleKey: 'items.payment_recorded.title',
    bodyKey: 'items.payment_recorded.body',
    params: {
      borrowerName: params.payment.borrowerName,
      amountFormatted: formatCurrency(
        params.payment.amount,
        params.payment.currency,
        lang,
        useKh
      ),
      paymentDate: params.payment.paymentDate,
    },
    createdAt: nowDate.toISOString(),
    eventDate: todayIso,
    actionType: 'undo_payment',
    currency: params.payment.currency,
    amountValue: params.payment.amount,
  };
}

export interface ReconcileOptions {
  now?: Date;
  suppressDueToClockRollback?: boolean;
  timeZone?: string;
}

export interface ReconcileResult {
  notifications: NotificationRecord[];
  addedCount: number;
  removedCount: number;
}

/**
 * Diffs generated rule candidates against stored notifications:
 * - Adds newly detected items with `createdAt = nowIso`
 * - Preserves `readAt`, `snoozedUntil`, `dismissedAt`, `actionTaken`, and `createdAt` for existing items
 * - Automatically removes resolved state-based notifications no longer in `generated`
 * - Retains event-based `payment_recorded` records for 30 days
 */
export function reconcileNotifications(
  generated: NotificationCandidate[],
  existing: NotificationRecord[],
  options: ReconcileOptions = {}
): ReconcileResult {
  const nowDate = options.now || new Date();
  const nowIso = nowDate.toISOString();
  const timeZone = resolveDeviceTimeZone(options.timeZone || DEFAULT_TIMEZONE);
  const todayIso = getLocalIsoDate(nowDate, timeZone);

  if (options.suppressDueToClockRollback) {
    return {
      notifications: existing,
      addedCount: 0,
      removedCount: 0,
    };
  }

  const existingMap = new Map<string, NotificationRecord>();
  for (const item of existing) {
    existingMap.set(item.id, item);
  }

  const nextList: NotificationRecord[] = [];
  const seenIds = new Set<string>();
  let addedCount = 0;

  for (const candidate of generated) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    const prev = existingMap.get(candidate.id);
    if (prev) {
      // If a snooze has expired, keep snoozedUntil cleared cleanly
      const snoozedStillActive =
        prev.snoozedUntil && Date.parse(prev.snoozedUntil) > nowDate.getTime();
      nextList.push({
        ...candidate,
        createdAt: prev.createdAt,
        readAt: prev.readAt,
        snoozedUntil: snoozedStillActive ? prev.snoozedUntil : undefined,
        dismissedAt: prev.dismissedAt,
        actionTaken: prev.actionTaken,
      });
    } else {
      addedCount += 1;
      nextList.push({
        ...candidate,
        createdAt: candidate.createdAt || nowIso,
      });
    }
  }

  // Keep event-based payment_recorded items for retention window
  for (const prev of existing) {
    if (prev.type === 'payment_recorded' && !seenIds.has(prev.id)) {
      const eventIso = prev.eventDate || prev.createdAt.slice(0, 10);
      const age = diffCalendarDays(todayIso, eventIso);
      if (age <= PAYMENT_RECORDED_RETENTION_DAYS) {
        seenIds.add(prev.id);
        nextList.push(prev);
      }
    }
  }

  const removedCount = existing.filter((item) => !seenIds.has(item.id)).length;

  return {
    notifications: nextList,
    addedCount,
    removedCount,
  };
}
