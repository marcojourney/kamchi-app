import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  computeLoanArrearsSummary,
  convertCurrency,
  formatCurrency,
  formatDateLocalized,
} from '../lib/finance';
import type { AgingBucketKey, LoanArrearsStatus } from '../lib/finance';
import type { CurrencyCode, Loan } from '../types/loan';

interface ArrearsViewProps {
  initialBucket?: AgingBucketKey | null;
  onSelectLoanForPayment: (loan: Loan) => void;
  onOpenLoanDetail: (loanId: string) => void;
}

const STATUS_ORDER: Array<'all' | LoanArrearsStatus> = [
  'all',
  'current',
  'late',
  'in_arrears',
  'defaulted',
  'written_off',
];

const BUCKET_ORDER: AgingBucketKey[] = ['1_7', '8_30', '31_90', '90_plus'];

export const ArrearsView: React.FC<ArrearsViewProps> = ({
  initialBucket = null,
  onSelectLoanForPayment,
  onOpenLoanDetail,
}) => {
  const { t, i18n } = useTranslation();
  const { loans, borrowers, schedulesByLoan, profile, todayIso } = useApp();

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);
  const rate = profile?.exchangeRateKhr || 4100;

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(
    profile?.defaultCurrency || 'USD'
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LoanArrearsStatus>('all');
  const [bucketFilter, setBucketFilter] = useState<AgingBucketKey | null>(initialBucket);

  useEffect(() => {
    setBucketFilter(initialBucket ?? null);
    if (initialBucket) {
      setStatusFilter('all');
    }
  }, [initialBucket]);

  const toDisp = (amt: number, from: CurrencyCode) =>
    convertCurrency(amt, from, displayCurrency, rate);

  const fmtDisp = (val: number) => formatCurrency(val, displayCurrency, lang, useKh);

  const borrowerById = useMemo(() => {
    const map = new Map<string, (typeof borrowers)[number]>();
    for (const b of borrowers) {
      map.set(b.id, b);
    }
    return map;
  }, [borrowers]);

  // Every borrower/loan with unpaid installments (active or written-off with unpaid schedule rows)
  const unpaidLoanEntries = useMemo(() => {
    const entries = loans
      .filter((l) => l.status === 'active' || l.status === 'written_off')
      .map((loan) => {
        const schedules = schedulesByLoan[loan.id] || [];
        const summary = computeLoanArrearsSummary(loan, schedules, todayIso);
        const borrower = borrowerById.get(loan.borrowerId);
        return { ...summary, borrower };
      })
      .filter(
        (item) =>
          item.unpaidInstallmentsCount > 0 ||
          item.loan.outstandingBalance > 0 ||
          item.loan.status === 'written_off'
      );

    entries.sort(
      (a, b) =>
        b.daysPastDue - a.daysPastDue ||
        toDisp(b.totalArrears, b.loan.currency) - toDisp(a.totalArrears, a.loan.currency) ||
        a.loan.borrowerName.localeCompare(b.loan.borrowerName)
    );
    return entries;
  }, [loans, schedulesByLoan, todayIso, borrowerById, displayCurrency, rate]);

  const statusCounts = useMemo(() => {
    const counts: Record<'all' | LoanArrearsStatus, number> = {
      all: unpaidLoanEntries.length,
      current: 0,
      late: 0,
      in_arrears: 0,
      defaulted: 0,
      written_off: 0,
    };
    for (const item of unpaidLoanEntries) {
      counts[item.status] += 1;
    }
    return counts;
  }, [unpaidLoanEntries]);

  // Aging buckets across active/non-written-off delinquent loans (and written-off if overdue)
  const bucketStats = useMemo(() => {
    const stats: Record<
      AgingBucketKey,
      { amount: number; loanCount: number; missedCount: number }
    > = {
      '1_7': { amount: 0, loanCount: 0, missedCount: 0 },
      '8_30': { amount: 0, loanCount: 0, missedCount: 0 },
      '31_90': { amount: 0, loanCount: 0, missedCount: 0 },
      '90_plus': { amount: 0, loanCount: 0, missedCount: 0 },
    };

    for (const item of unpaidLoanEntries) {
      if (!item.agingBucket) continue;
      if (item.loan.status === 'written_off') continue;
      const b = stats[item.agingBucket];
      b.amount += toDisp(item.totalArrears, item.loan.currency);
      b.loanCount += 1;
      b.missedCount += item.missedInstallmentsCount;
    }

    return stats;
  }, [unpaidLoanEntries, displayCurrency, rate]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unpaidLoanEntries.filter((item) => {
      if (q) {
        const phone = item.borrower?.phone?.toLowerCase() || '';
        const match =
          item.loan.borrowerName.toLowerCase().includes(q) ||
          item.loan.id.toLowerCase().includes(q) ||
          phone.includes(q);
        if (!match) return false;
      }
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (bucketFilter) {
        if (item.loan.status === 'written_off') return false;
        if (item.agingBucket !== bucketFilter) return false;
      }
      return true;
    });
  }, [unpaidLoanEntries, search, statusFilter, bucketFilter]);

  const totals = useMemo(() => {
    let principal = 0;
    let interest = 0;
    let penalty = 0;
    let total = 0;
    for (const item of filteredEntries) {
      principal += toDisp(item.arrearsPrincipal, item.loan.currency);
      interest += toDisp(item.arrearsInterest, item.loan.currency);
      penalty += toDisp(item.arrearsPenalty, item.loan.currency);
      total += toDisp(item.totalArrears, item.loan.currency);
    }
    return { principal, interest, penalty, total };
  }, [filteredEntries, displayCurrency, rate]);

  const getStatusLabel = (status: LoanArrearsStatus) => {
    if (status === 'current') return t('arrears.statusCurrent');
    if (status === 'late') return t('arrears.statusLate');
    if (status === 'in_arrears') return t('arrears.statusInArrears');
    if (status === 'defaulted') return t('arrears.statusDefaulted');
    return t('arrears.statusWrittenOff');
  };

  const getStatusColorClass = (status: LoanArrearsStatus) => {
    if (status === 'current') return 'text-emerald-600 dark:text-emerald-400';
    if (status === 'late') return 'text-amber-600 dark:text-amber-400';
    if (status === 'in_arrears') return 'text-orange-600 dark:text-orange-400';
    if (status === 'defaulted') return 'text-red-600 dark:text-red-400';
    return 'text-slate-500 dark:text-slate-400';
  };

  const getBucketLabel = (bucket: AgingBucketKey) => {
    if (bucket === '1_7') return t('arrears.bucket1_7');
    if (bucket === '8_30') return t('arrears.bucket8_30');
    if (bucket === '31_90') return t('arrears.bucket31_90');
    return t('arrears.bucket90Plus');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t('arrears.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('arrears.subtitle')}
          </p>
        </div>

        <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0">
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
      </div>

      {/* Aging Buckets Filter Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BUCKET_ORDER.map((bucketKey) => {
          const stat = bucketStats[bucketKey];
          const active = bucketFilter === bucketKey;
          const accentText =
            bucketKey === '1_7'
              ? 'text-amber-600 dark:text-amber-400'
              : bucketKey === '8_30'
              ? 'text-orange-600 dark:text-orange-400'
              : bucketKey === '31_90'
              ? 'text-red-600 dark:text-red-400'
              : 'text-rose-700 dark:text-rose-400';

          return (
            <button
              key={bucketKey}
              type="button"
              onClick={() =>
                setBucketFilter((prev) => (prev === bucketKey ? null : bucketKey))
              }
              className={`text-left rounded-2xl border p-4 transition-colors ${
                active
                  ? 'border-teal-600 bg-teal-50/60 dark:bg-teal-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {getBucketLabel(bucketKey)}
                </span>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
                  {t('arrears.loansCount', { count: stat.loanCount })}
                </span>
              </div>
              <p
                className={`text-lg sm:text-xl font-mono font-bold tabular-nums mt-1 ${accentText}`}
              >
                {fmtDisp(stat.amount)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Total Arrears Split Summary + Search + Status Flow */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              {t('arrears.totalArrears')}
            </span>
            <span className="text-base sm:text-lg font-mono font-bold text-red-600 dark:text-red-400 tabular-nums">
              {fmtDisp(totals.total)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              {t('arrears.principalArrears')}
            </span>
            <span className="text-sm sm:text-base font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {fmtDisp(totals.principal)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              {t('arrears.interestArrears')}
            </span>
            <span className="text-sm sm:text-base font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {fmtDisp(totals.interest)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              {t('arrears.penaltyArrears')}
            </span>
            <span className="text-sm sm:text-base font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
              {fmtDisp(totals.penalty)}
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('arrears.searchPlaceholder')}
              className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            {STATUS_ORDER.map((st) => {
              const label =
                st === 'all' ? t('arrears.allStatuses') : getStatusLabel(st);
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {label} ({statusCounts[st]})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Borrower & Loan Arrears Table / List */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('arrears.emptyTitle')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t('arrears.emptyDesc')}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left whitespace-nowrap">
                    {t('arrears.borrowerLoanCol')}
                  </th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    {t('arrears.statusCol')}
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    {t('arrears.dpdCol')}
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    {t('arrears.missedCol')}
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    {t('arrears.principalCol')}
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    {t('arrears.interestCol')}
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    {t('arrears.penaltyCol')}
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    {t('arrears.totalArrearsCol')}
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">
                    {t('arrears.actionsCol')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEntries.map((item) => {
                  const cur = item.loan.currency;
                  return (
                    <tr
                      key={item.loan.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenLoanDetail(item.loan.id)}
                          className="text-left min-w-0 group"
                        >
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-teal-600 truncate">
                            {item.loan.borrowerName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            {item.borrower?.phone ? `${item.borrower.phone} · ` : ''}
                            {item.loan.id}
                            {item.nextDueDate
                              ? ` · ${formatDateLocalized(item.nextDueDate, lang, useKh)}`
                              : ''}
                          </p>
                        </button>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-semibold ${getStatusColorClass(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={
                            item.daysPastDue > 0
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                          }
                        >
                          {t('arrears.daysPastDueShort', { count: item.daysPastDue })}
                        </span>
                        {item.agingBucket && (
                          <span className="block text-[10px] text-slate-400">
                            {getBucketLabel(item.agingBucket)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {item.missedInstallmentsCount} / {item.unpaidInstallmentsCount}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {formatCurrency(item.arrearsPrincipal, cur, lang, useKh)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {formatCurrency(item.arrearsInterest, cur, lang, useKh)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400">
                        {formatCurrency(item.arrearsPenalty, cur, lang, useKh)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold tabular-nums whitespace-nowrap text-slate-900 dark:text-slate-100">
                        <span className={item.totalArrears > 0 ? 'text-red-600 dark:text-red-400' : ''}>
                          {formatCurrency(item.totalArrears, cur, lang, useKh)}
                        </span>
                        {item.loan.outstandingBalance > 0 && (
                          <span className="block text-[10px] font-normal text-slate-400">
                            {t('loans.outstandingBalance')}:{' '}
                            {formatCurrency(item.loan.outstandingBalance, cur, lang, useKh)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.loan.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => onSelectLoanForPayment(item.loan)}
                            className="min-h-[36px] inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                          >
                            <span>{t('dashboard.collectNow')}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenLoanDetail(item.loan.id)}
                            className="min-h-[36px] inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            {t('loans.viewList')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile List */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredEntries.map((item) => {
              const cur = item.loan.currency;
              return (
                <div key={item.loan.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenLoanDetail(item.loan.id)}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.loan.borrowerName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className={`font-semibold ${getStatusColorClass(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono tabular-nums">
                          {t('arrears.dpdCol')}: {t('arrears.daysPastDueShort', { count: item.daysPastDue })}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono tabular-nums">
                          {t('arrears.missedLabel', {
                            missed: item.missedInstallmentsCount,
                            unpaid: item.unpaidInstallmentsCount,
                          })}
                        </span>
                      </p>
                    </button>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-slate-400 block">
                        {t('arrears.totalArrearsCol')}
                      </span>
                      <span
                        className={`text-sm font-mono font-bold tabular-nums ${
                          item.totalArrears > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatCurrency(item.totalArrears, cur, lang, useKh)}
                      </span>
                      {item.loan.outstandingBalance > 0 && (
                        <span className="block text-[10px] font-mono text-slate-400 tabular-nums">
                          {t('loans.outstandingBalance')}:{' '}
                          {formatCurrency(item.loan.outstandingBalance, cur, lang, useKh)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      <span>
                        {t('arrears.principalCol')}:{' '}
                        <strong>{formatCurrency(item.arrearsPrincipal, cur, lang, useKh)}</strong>
                      </span>
                      <span>
                        {t('arrears.interestCol')}:{' '}
                        <strong>{formatCurrency(item.arrearsInterest, cur, lang, useKh)}</strong>
                      </span>
                      <span>
                        {t('arrears.penaltyCol')}:{' '}
                        <strong className="text-amber-600 dark:text-amber-400">
                          {formatCurrency(item.arrearsPenalty, cur, lang, useKh)}
                        </strong>
                      </span>
                    </div>

                    {item.loan.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => onSelectLoanForPayment(item.loan)}
                        className="min-h-[38px] flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shrink-0"
                      >
                        <span>{t('dashboard.collectNow')}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
