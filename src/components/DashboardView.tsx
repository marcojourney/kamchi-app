import React, { useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Plus, QrCode, Store, ArrowUpRight, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getEnabledFeatures,
  type EnabledFeatures,
} from '../config/featureAccess';
import { useApp } from '../context/AppContext';
import {
  computeScheduleLateFee,
  convertCurrency,
  formatCurrency,
  formatDateLocalized,
} from '../lib/finance';
import type { AgingBucketKey } from '../lib/finance';
import type { CurrencyCode, Loan } from '../types/loan';
import { ActionNeededStrip } from './ActionNeededStrip';
import { DailySummaryBanner } from './DailySummaryBanner';
import { FeedbackRatingPrompt } from './FeedbackRatingPrompt';

interface DashboardViewProps {
  features?: EnabledFeatures;
  onNewLoan: () => void;
  onAddBorrower: () => void;
  onSelectLoanForPayment: (loan: Loan) => void;
  onOpenLoanDetail: (loanId: string) => void;
  onOpenArrears: (bucket?: AgingBucketKey | null) => void;
  onOpenInstallments?: () => void;
  onOpenMarketChainImport?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  features = getEnabledFeatures('lender', 'free'),
  onNewLoan,
  onAddBorrower,
  onSelectLoanForPayment,
  onOpenLoanDetail,
  onOpenArrears,
  onOpenInstallments,
  onOpenMarketChainImport,
}) => {
  const { t, i18n } = useTranslation();
  const { t: tOnboarding } = useTranslation('onboarding');
  const { profile, loans, schedulesByLoan, payments, todayIso } = useApp();

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);
  const rate = profile?.exchangeRateKhr || 4100;
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(
    profile?.defaultCurrency || 'USD'
  );

  const toDisp = (amt: number, from: CurrencyCode) =>
    convertCurrency(amt, from, displayCurrency, rate);

  const metrics = useMemo(() => {
    let totalLent = 0;
    let totalCollected = 0;
    let outstanding = 0;
    let overdueAmount = 0;
    let dueToday = 0;
    let dueThisWeek = 0;
    let expectedInterest = 0;
    let bucket1_7 = 0;
    let bucket8_30 = 0;
    let bucket31_90 = 0;
    let bucket90Plus = 0;

    const weekEndIso = format(addDays(parseISO(todayIso), 7), 'yyyy-MM-dd');
    const dueQueue: Array<{
      loan: Loan;
      installmentNumber: number;
      dueDate: string;
      remainingDue: number;
      daysOverdue: number;
    }> = [];

    for (const loan of loans) {
      if (loan.status !== 'renewed') {
        totalLent += toDisp(loan.principal, loan.currency);
      }
      if (loan.status === 'active') {
        outstanding += toDisp(loan.outstandingBalance, loan.currency);
        const remainingInterest = Math.max(
          0,
          (loan.totalInterest ?? 0) - (loan.paidInterest ?? 0)
        );
        expectedInterest += toDisp(remainingInterest, loan.currency);
      }

      const schList = schedulesByLoan[loan.id] || [];
      if (loan.status === 'active') {
        for (const s of schList) {
          if (s.status === 'paid') continue;
          const unpaid = Math.max(0, s.totalDue - (s.principalPaid + s.interestPaid));
          const { accruedPenalty } = computeScheduleLateFee(s, loan, todayIso);
          const totalUnpaid = unpaid + Math.max(0, accruedPenalty - s.penaltyPaid);
          const dispUnpaid = toDisp(totalUnpaid, loan.currency);

          if (s.dueDate < todayIso) {
            const lateDays = differenceInCalendarDays(parseISO(todayIso), parseISO(s.dueDate));
            overdueAmount += dispUnpaid;
            if (lateDays <= 7) bucket1_7 += dispUnpaid;
            else if (lateDays <= 30) bucket8_30 += dispUnpaid;
            else if (lateDays <= 90) bucket31_90 += dispUnpaid;
            else bucket90Plus += dispUnpaid;

            dueQueue.push({
              loan,
              installmentNumber: s.installmentNumber,
              dueDate: s.dueDate,
              remainingDue: totalUnpaid,
              daysOverdue: lateDays,
            });
          } else if (s.dueDate === todayIso) {
            dueToday += dispUnpaid;
            dueQueue.push({
              loan,
              installmentNumber: s.installmentNumber,
              dueDate: s.dueDate,
              remainingDue: totalUnpaid,
              daysOverdue: 0,
            });
          } else if (s.dueDate <= weekEndIso) {
            dueThisWeek += dispUnpaid;
          }
        }
      }
    }

    for (const p of payments) {
      totalCollected += toDisp(p.amount, p.currency);
    }

    const cashOnHand =
      toDisp(profile?.capitalCashUsd ?? 0, 'USD') +
      toDisp(profile?.capitalCashKhr ?? 0, 'KHR');

    dueQueue.sort((a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.localeCompare(b.dueDate));

    return {
      totalLent,
      totalCollected,
      outstanding,
      overdueAmount,
      dueToday,
      dueThisWeek,
      expectedInterest,
      cashOnHand,
      bucket1_7,
      bucket8_30,
      bucket31_90,
      bucket90Plus,
      dueQueue,
    };
  }, [loans, schedulesByLoan, payments, todayIso, displayCurrency, rate, profile]);

  const monthlyChartData = useMemo(() => {
    const map: Record<string, { month: string; collected: number; due: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, 'yyyy-MM');
      map[key] = { month: format(d, 'MMM'), collected: 0, due: 0 };
    }

    for (const p of payments) {
      const key = (p.paymentDate || '').slice(0, 7);
      if (map[key]) {
        map[key].collected += toDisp(p.amount, p.currency);
      }
    }

    for (const loan of loans) {
      for (const s of schedulesByLoan[loan.id] || []) {
        const key = (s.dueDate || '').slice(0, 7);
        if (map[key]) {
          map[key].due += toDisp(s.totalDue, loan.currency);
        }
      }
    }

    return Object.values(map);
  }, [payments, loans, schedulesByLoan, displayCurrency, rate]);

  const fmt = (val: number) => formatCurrency(val, displayCurrency, lang, useKh);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t('dashboard.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {formatDateLocalized(todayIso, lang, useKh)} · 1 USD = {rate.toLocaleString()} ៛
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(['USD', 'KHR'] as CurrencyCode[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDisplayCurrency(c)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  displayCurrency === c
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onAddBorrower}
            className="hidden sm:flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>
              {features.installments && !features.loans
                ? tOnboarding('navigation.customers')
                : t('dashboard.addBorrower')}
            </span>
          </button>

          {features.loans && (
            <button
              type="button"
              onClick={onNewLoan}
              className="min-h-[44px] flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t('dashboard.newLoan')}</span>
            </button>
          )}

          {features.marketchainImport && onOpenMarketChainImport && (
            <button
              type="button"
              onClick={onOpenMarketChainImport}
              className="hidden sm:flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4 text-teal-600" />
              <span>{tOnboarding('navigation.marketchainImport')}</span>
            </button>
          )}

          {features.installments && onOpenInstallments && (
            <button
              type="button"
              onClick={onOpenInstallments}
              className="min-h-[44px] flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Store className="w-4 h-4" />
              <span>{tOnboarding('installmentsShell.newPlan')}</span>
            </button>
          )}
        </div>
      </div>

      <DailySummaryBanner />
      <ActionNeededStrip />
      <FeedbackRatingPrompt />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.outstanding')}</p>
          <p className="text-base sm:text-xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap truncate">
            {fmt(metrics.outstanding)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex flex-wrap items-baseline gap-x-1">
            <span>{t('dashboard.expectedInterest')}:</span>
            <span className="font-mono whitespace-nowrap">{fmt(metrics.expectedInterest)}</span>
          </p>
        </div>

        <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.totalCollected')}</p>
          <p className="text-base sm:text-xl font-mono font-bold text-emerald-600 tabular-nums whitespace-nowrap truncate">
            {fmt(metrics.totalCollected)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex flex-wrap items-baseline gap-x-1">
            <span>{t('dashboard.totalLent')}:</span>
            <span className="font-mono whitespace-nowrap">{fmt(metrics.totalLent)}</span>
          </p>
        </div>

        <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.overdueAmount')}</p>
          <p className="text-base sm:text-xl font-mono font-bold text-red-600 tabular-nums whitespace-nowrap truncate">
            {fmt(metrics.overdueAmount)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex flex-wrap items-baseline gap-x-1">
            <span>{t('dashboard.dueToday')}:</span>
            <span className="font-mono whitespace-nowrap">{fmt(metrics.dueToday)}</span>
          </p>
        </div>

        <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.dueThisWeek')}</p>
          <p className="text-base sm:text-xl font-mono font-bold text-amber-600 tabular-nums whitespace-nowrap truncate">
            {fmt(metrics.dueThisWeek)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums flex flex-wrap items-baseline gap-x-1">
            <span>{t('dashboard.cashOnHand')}:</span>
            <span className="font-mono whitespace-nowrap">{fmt(metrics.cashOnHand)}</span>
          </p>
        </div>
      </div>

      {/* Charts & Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('dashboard.collectionChart')}
          </h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(value: unknown) => fmt(Number(value) || 0)}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="due" name={t('portal.unpaid')} fill="#CBD5E1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="collected" name={t('dashboard.totalCollected')} fill="#0D9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('dashboard.agingBuckets')}
            </h2>
            <button
              type="button"
              onClick={() => onOpenArrears(null)}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700 whitespace-nowrap"
            >
              {t('dashboard.viewArrears')}
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[
              { key: '1_7' as AgingBucketKey, label: t('dashboard.bucket1_7'), val: metrics.bucket1_7, color: 'text-amber-600' },
              { key: '8_30' as AgingBucketKey, label: t('dashboard.bucket8_30'), val: metrics.bucket8_30, color: 'text-orange-600' },
              { key: '31_90' as AgingBucketKey, label: t('dashboard.bucket31_90'), val: metrics.bucket31_90, color: 'text-red-600' },
              { key: '90_plus' as AgingBucketKey, label: t('dashboard.bucket90Plus'), val: metrics.bucket90Plus, color: 'text-rose-700 dark:text-rose-400' },
            ].map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => onOpenArrears(b.key)}
                className="w-full flex items-center justify-between gap-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-1.5 -mx-1.5 transition-colors"
              >
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {b.label}
                </span>
                <span className={`text-sm font-mono font-bold tabular-nums whitespace-nowrap shrink-0 ${b.color}`}>
                  {fmt(b.val)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Due Today & Overdue Action List */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('dashboard.upcomingAndOverdue')}
          </h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {metrics.dueQueue.length}
          </span>
        </div>

        {metrics.dueQueue.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {t('dashboard.noDueItems')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {metrics.dueQueue.slice(0, 10).map((item) => (
              <div
                key={`${item.loan.id}-${item.installmentNumber}`}
                className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onOpenLoanDetail(item.loan.id)}
                  className="text-left min-w-0 flex-1"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {item.loan.borrowerName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                    <span className="whitespace-nowrap">#{item.installmentNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`whitespace-nowrap ${
                        item.daysOverdue > 0
                          ? 'text-red-600 font-semibold'
                          : 'text-amber-600 font-semibold'
                      }`}
                    >
                      {item.daysOverdue > 0
                        ? t('dashboard.daysOverdue', { count: item.daysOverdue })
                        : t('dashboard.dueTodayTag')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      {formatDateLocalized(item.dueDate, lang, useKh)}
                    </span>
                  </p>
                </button>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    {formatCurrency(item.remainingDue, item.loan.currency, lang, useKh)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectLoanForPayment(item.loan)}
                    className="min-h-[40px] flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap shrink-0"
                  >
                    <span>{t('dashboard.collectNow')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
