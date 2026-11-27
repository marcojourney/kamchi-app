import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  FileText,
  Link2,
  List,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  computeLoanArrearsSummary,
  computeScheduleLateFee,
  formatCurrency,
  formatDateLocalized,
} from '../lib/finance';
import type { LoanArrearsSummary } from '../lib/finance';
import {
  canCreateLoan,
  canExport,
  canExportContracts,
  isReadOnly,
} from '../lib/entitlements';
import {
  buildCustomerScheduleInputFromLoan,
  exportLoanContractPdf,
  exportLoanScheduleExcel,
  exportLoanSchedulePdf,
} from '../lib/pdfExport';
import type { Loan } from '../types/loan';
import { CreateLoanView } from './CreateLoanView';
import { DatePicker } from './DatePicker';
import { useLicenseContext } from './LicenseGate';

interface LoansViewProps {
  selectedLoanId: string | null;
  onSelectLoanId: (id: string | null) => void;
  onNewLoan: () => void;
  onRecordPayment: (loan: Loan) => void;
}

export const LoansView: React.FC<LoansViewProps> = ({
  selectedLoanId,
  onSelectLoanId,
  onNewLoan,
  onRecordPayment,
}) => {
  const { t, i18n } = useTranslation();
  const { t: tNotif } = useTranslation('notifications');
  const {
    loans,
    borrowers,
    schedulesByLoan,
    profile,
    todayIso,
    ensureSchedulesLoaded,
    setLoanPromiseToPay,
    writeOffLoan,
    createOrGetPortalShare,
  } = useApp();
  const { licenseState, openUpgradePrompt } = useLicenseContext();

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedCalDate, setSelectedCalDate] = useState(todayIso);
  const [calendarMonth, setCalendarMonth] = useState(() => todayIso.slice(0, 7));
  const [actionModal, setActionModal] = useState<{
    mode: 'renew' | 'topup' | 'restructure';
    loan: Loan;
  } | null>(null);
  const [portalCopied, setPortalCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const activeLoanDetail = useMemo(
    () => loans.find((l) => l.id === selectedLoanId) || null,
    [loans, selectedLoanId]
  );

  useEffect(() => {
    setMenuOpen(false);
    if (selectedLoanId) {
      ensureSchedulesLoaded(selectedLoanId);
    }
  }, [selectedLoanId, ensureSchedulesLoaded]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const arrearsByLoanId = useMemo(() => {
    const map = new Map<string, LoanArrearsSummary>();
    for (const loan of loans) {
      if (loan.status === 'active' || loan.status === 'written_off') {
        map.set(
          loan.id,
          computeLoanArrearsSummary(loan, schedulesByLoan[loan.id] || [], todayIso)
        );
      }
    }
    return map;
  }, [loans, schedulesByLoan, todayIso]);

  const isLoanOverdue = (loan: Loan) => {
    if (loan.status !== 'active') return false;
    return (arrearsByLoanId.get(loan.id)?.daysPastDue || 0) > 0;
  };

  const getFlowStatusDisplay = (loan: Loan): { label: string; colorClass: string; daysPastDue: number } => {
    if (loan.status === 'settled') {
      return {
        label: t('loans.statusSettled'),
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        daysPastDue: 0,
      };
    }
    if (loan.status === 'renewed') {
      return {
        label: t('loans.statusRenewed'),
        colorClass: 'text-teal-600 dark:text-teal-400',
        daysPastDue: 0,
      };
    }
    if (loan.status === 'written_off') {
      return {
        label: t('arrears.statusWrittenOff'),
        colorClass: 'text-slate-500 dark:text-slate-400',
        daysPastDue: arrearsByLoanId.get(loan.id)?.daysPastDue || 0,
      };
    }
    const summary = arrearsByLoanId.get(loan.id);
    const dpd = summary?.daysPastDue || 0;
    if (!summary || summary.status === 'current') {
      return {
        label: t('arrears.statusCurrent'),
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        daysPastDue: 0,
      };
    }
    if (summary.status === 'late') {
      return {
        label: `${t('arrears.statusLate')} (${t('arrears.daysPastDueShort', { count: dpd })})`,
        colorClass: 'text-amber-600 dark:text-amber-400',
        daysPastDue: dpd,
      };
    }
    if (summary.status === 'in_arrears') {
      return {
        label: `${t('arrears.statusInArrears')} (${t('arrears.daysPastDueShort', { count: dpd })})`,
        colorClass: 'text-orange-600 dark:text-orange-400',
        daysPastDue: dpd,
      };
    }
    return {
      label: `${t('arrears.statusDefaulted')} (${t('arrears.daysPastDueShort', { count: dpd })})`,
      colorClass: 'text-red-600 dark:text-red-400',
      daysPastDue: dpd,
    };
  };

  const filteredLoans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter((l) => {
      if (q && !l.borrowerName.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === 'all') return true;
      if (statusFilter === 'overdue') return isLoanOverdue(l);
      return l.status === statusFilter;
    });
  }, [loans, search, statusFilter, arrearsByLoanId]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(parseISO(`${calendarMonth}-01`));
    const end = endOfMonth(start);
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const dueMapByDate = useMemo(() => {
    const map: Record<string, Array<{ loan: Loan; installmentNumber: number; amount: number; status: string }>> = {};
    for (const loan of loans) {
      if (loan.status !== 'active') continue;
      for (const s of schedulesByLoan[loan.id] || []) {
        if (!map[s.dueDate]) map[s.dueDate] = [];
        map[s.dueDate].push({
          loan,
          installmentNumber: s.installmentNumber,
          amount: Math.max(0, s.totalDue - (s.principalPaid + s.interestPaid)),
          status: s.status,
        });
      }
    }
    return map;
  }, [loans, schedulesByLoan]);

  const handleSharePortal = async (loanId: string) => {
    const url = await createOrGetPortalShare(loanId);
    await navigator.clipboard?.writeText(url);
    setPortalCopied(true);
    setTimeout(() => setPortalCopied(false), 2000);
  };

  const handleExportContract = async (loan: Loan) => {
    if (!canExportContracts(licenseState)) {
      openUpgradePrompt(isReadOnly(licenseState) ? 'read_only' : 'business_contracts');
      return;
    }
    const schedules = await ensureSchedulesLoaded(loan.id);
    const borrower = borrowers.find((b) => b.id === loan.borrowerId);
    await exportLoanContractPdf({
      loan,
      borrower,
      schedules,
      lenderName: profile?.displayName || 'KamChi Lender',
      lenderPhone: profile?.lenderPhone,
      lenderLogoDataUrl: profile?.lenderLogoDataUrl,
      lang,
      useKhmerNumerals: useKh,
    });
  };

  const handleExportSchedulePdf = async (loan: Loan) => {
    if (!canExport(licenseState)) {
      openUpgradePrompt('pro_export');
      return;
    }
    const schedules = await ensureSchedulesLoaded(loan.id);
    const borrower = borrowers.find((b) => b.id === loan.borrowerId);
    const input = buildCustomerScheduleInputFromLoan(
      loan,
      schedules,
      profile?.displayName || 'KamChi Lender',
      borrower,
      profile?.lenderPhone,
      profile?.lenderLogoDataUrl
    );
    await exportLoanSchedulePdf(input, lang, useKh);
  };

  const handleExportScheduleExcel = async (loan: Loan) => {
    if (!canExport(licenseState)) {
      openUpgradePrompt('pro_export');
      return;
    }
    const schedules = await ensureSchedulesLoaded(loan.id);
    const borrower = borrowers.find((b) => b.id === loan.borrowerId);
    const input = buildCustomerScheduleInputFromLoan(
      loan,
      schedules,
      profile?.displayName || 'KamChi Lender',
      borrower,
      profile?.lenderPhone,
      profile?.lenderLogoDataUrl
    );
    exportLoanScheduleExcel(input);
  };

  const handleLoanRestructureAction = (
    mode: 'renew' | 'topup' | 'restructure',
    loan: Loan
  ) => {
    const remainingActive = loans.filter((l) => l.status === 'active' && l.id !== loan.id).length;
    if (!canCreateLoan(licenseState, remainingActive)) {
      openUpgradePrompt(isReadOnly(licenseState) ? 'read_only' : 'free_loan_limit');
      return;
    }
    setActionModal({ mode, loan });
  };

  if (actionModal) {
    return (
      <CreateLoanView
        key={`${actionModal.mode}_${actionModal.loan.id}`}
        mode={actionModal.mode}
        sourceLoan={actionModal.loan}
        onClose={() => setActionModal(null)}
        onCreated={(newId) => {
          setActionModal(null);
          onSelectLoanId(newId);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap truncate min-w-0">
          {t('loans.title')}
        </h1>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center p-0.5 sm:p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`min-h-[34px] sm:min-h-[36px] flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              <List className="w-3.5 h-3.5 hidden sm:block shrink-0" />
              <span>{t('loans.viewList')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`min-h-[34px] sm:min-h-[36px] flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 hidden sm:block shrink-0" />
              <span>{t('loans.viewCalendar')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onNewLoan}
            className="min-h-[40px] sm:min-h-[44px] flex items-center gap-1 sm:gap-1.5 rounded-xl bg-teal-600 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{t('dashboard.newLoan')}</span>
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('loans.searchPlaceholder')}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {[
                { key: 'all', label: t('loans.statusAll') },
                { key: 'active', label: t('loans.statusActive') },
                { key: 'overdue', label: t('loans.statusOverdue') },
                { key: 'settled', label: t('loans.statusSettled') },
                { key: 'written_off', label: t('arrears.statusWrittenOff') },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    statusFilter === tab.key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredLoans.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('loans.emptyTitle')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {t('loans.emptyDesc')}
              </p>
              <button
                type="button"
                onClick={onNewLoan}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                <Plus className="w-4 h-4" />
                <span>{t('loans.createFirst')}</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {filteredLoans.map((loan) => {
                const statusInfo = getFlowStatusDisplay(loan);
                return (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => onSelectLoanId(loan.id)}
                    className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {loan.borrowerName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        <span className="font-mono tabular-nums">
                          {formatCurrency(loan.principal, loan.currency, lang, useKh)}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {loan.interestRate}% {loan.frequency}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className={`font-semibold ${statusInfo.colorClass}`}>
                          {statusInfo.label}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 block">
                          {t('loans.outstandingBalance')}
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          {formatCurrency(loan.outstandingBalance, loan.currency, lang, useKh)}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Calendar View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('loans.calendarTitle')}
              </h2>
              <input
                type="month"
                value={calendarMonth}
                onChange={(e) => setCalendarMonth(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-mono"
              />
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((day) => {
                const iso = format(day, 'yyyy-MM-dd');
                const items = dueMapByDate[iso] || [];
                const isSelected = iso === selectedCalDate;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelectedCalDate(iso)}
                    className={`min-h-[52px] rounded-xl border p-1.5 text-left transition-colors ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40'
                        : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 block">
                      {format(day, 'd')}
                    </span>
                    {items.length > 0 && (
                      <span className="text-[10px] font-mono font-semibold text-teal-600 block mt-0.5">
                        {items.length} due
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono">
              {formatDateLocalized(selectedCalDate, lang, useKh)}
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(dueMapByDate[selectedCalDate] || []).map((entry) => (
                <div
                  key={`${entry.loan.id}-${entry.installmentNumber}`}
                  className="py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onSelectLoanId(entry.loan.id)}
                    className="text-left font-medium text-slate-900 dark:text-slate-100 truncate"
                  >
                    {entry.loan.borrowerName} (#{entry.installmentNumber})
                  </button>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatCurrency(entry.amount, entry.loan.currency, lang, useKh)}
                  </span>
                </div>
              ))}
              {(!dueMapByDate[selectedCalDate] || dueMapByDate[selectedCalDate].length === 0) && (
                <p className="text-xs text-slate-400 py-4">{t('loans.noDueOnDate')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loan Detail Modal */}
      {activeLoanDetail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {activeLoanDetail.borrowerName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {activeLoanDetail.id} · {formatDateLocalized(activeLoanDetail.startDate, lang, useKh)} ·{' '}
                  <span className={`font-sans font-semibold ${getFlowStatusDisplay(activeLoanDetail).colorClass}`}>
                    {getFlowStatusDisplay(activeLoanDetail).label}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectLoanId(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5">
              <div>
                <span className="text-[11px] text-slate-500 block">{t('loans.principal')}</span>
                <span className="text-sm font-mono font-bold tabular-nums">
                  {formatCurrency(activeLoanDetail.principal, activeLoanDetail.currency, lang, useKh)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">{t('loans.interestType')}</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                  {activeLoanDetail.interestType === 'reducing'
                    ? t('loans.reducing')
                    : activeLoanDetail.interestType === 'interest_only'
                    ? t('loans.interestOnly')
                    : t('loans.flat')}{' '}
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    ({activeLoanDetail.interestRate}%)
                  </span>
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">{t('loans.totalPayable')}</span>
                <span className="text-sm font-mono font-bold tabular-nums">
                  {formatCurrency(activeLoanDetail.totalPayable, activeLoanDetail.currency, lang, useKh)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">{t('loans.outstandingBalance')}</span>
                <span className="text-sm font-mono font-bold text-teal-600 tabular-nums">
                  {formatCurrency(activeLoanDetail.outstandingBalance, activeLoanDetail.currency, lang, useKh)}
                </span>
              </div>
            </div>

            {(() => {
              const detailArrears = arrearsByLoanId.get(activeLoanDetail.id);
              if (!detailArrears || (detailArrears.daysPastDue === 0 && detailArrears.totalArrears === 0)) {
                return null;
              }
              return (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 rounded-xl bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 p-3 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {t('arrears.dpdCol')}
                    </span>
                    <span className="font-mono font-bold text-red-600 dark:text-red-400 tabular-nums">
                      {t('arrears.daysPastDueShort', { count: detailArrears.daysPastDue })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {t('arrears.missedCol')}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {detailArrears.missedInstallmentsCount} / {detailArrears.unpaidInstallmentsCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {t('arrears.principalCol')}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(detailArrears.arrearsPrincipal, activeLoanDetail.currency, lang, useKh)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {t('arrears.interestCol')}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(detailArrears.arrearsInterest, activeLoanDetail.currency, lang, useKh)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {t('arrears.penaltyCol')}
                    </span>
                    <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatCurrency(detailArrears.arrearsPenalty, activeLoanDetail.currency, lang, useKh)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Loan Actions: Primary Record Payment + Three-Dot Dropdown */}
            <div className="flex items-center gap-2.5">
              {activeLoanDetail.status === 'active' && (
                <button
                  type="button"
                  onClick={() => onRecordPayment(activeLoanDetail)}
                  className="flex-1 min-h-[44px] rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
                >
                  {t('loans.recordPayment')}
                </button>
              )}

              <div ref={menuRef} className={`relative ${activeLoanDetail.status !== 'active' ? 'ml-auto' : ''}`}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="More loan actions"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-20"
                  >
                    {activeLoanDetail.status === 'active' && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            handleLoanRestructureAction('renew', activeLoanDetail);
                          }}
                          className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <RefreshCw className="w-4 h-4 text-slate-500" />
                          <span>{t('loans.renewLoan')}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            handleLoanRestructureAction('topup', activeLoanDetail);
                          }}
                          className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <TrendingUp className="w-4 h-4 text-slate-500" />
                          <span>{t('loans.topUpLoan')}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            handleLoanRestructureAction('restructure', activeLoanDetail);
                          }}
                          className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                          <span>{t('loans.restructureLoan')}</span>
                        </button>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                      </>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        handleExportSchedulePdf(activeLoanDetail);
                      }}
                      className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <FileText className="w-4 h-4 text-teal-600" />
                      <span>{t('loans.exportSchedulePdf')}</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        handleExportScheduleExcel(activeLoanDetail);
                      }}
                      className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>{t('loans.exportScheduleExcel')}</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        handleExportContract(activeLoanDetail);
                      }}
                      className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span>{t('loans.exportContractPdf')}</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        handleSharePortal(activeLoanDetail.id);
                        setTimeout(() => setMenuOpen(false), 600);
                      }}
                      className="w-full min-h-[40px] px-3.5 py-2 flex items-center justify-between gap-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="flex items-center gap-2.5">
                        {portalCopied ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Link2 className="w-4 h-4 text-teal-600" />
                        )}
                        <span>{portalCopied ? t('app.copied') : t('loans.sharePortalLink')}</span>
                      </span>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    {activeLoanDetail.status === 'active' && (
                      <>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            writeOffLoan(activeLoanDetail.id);
                          }}
                          className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>{t('loans.writeOff')}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {activeLoanDetail.collateralText && (
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <strong>{t('loans.collateral')}:</strong> {activeLoanDetail.collateralText}
              </div>
            )}

            {activeLoanDetail.status === 'active' && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <label
                    htmlFor="loan-promise-to-pay"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    {tNotif('promiseToPay.label')}
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {tNotif('promiseToPay.hint')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="min-w-[165px]">
                    <DatePicker
                      id="loan-promise-to-pay"
                      value={activeLoanDetail.promiseToPayDate || ''}
                      onChange={(nextDate) =>
                        void setLoanPromiseToPay(
                          activeLoanDetail.id,
                          nextDate || null
                        )
                      }
                      allowClear
                      useKhmerNumerals={useKh}
                      minHeightClass="min-h-[40px]"
                      ariaLabel={tNotif('promiseToPay.label')}
                    />
                  </div>
                  {activeLoanDetail.promiseToPayDate && (
                    <button
                      type="button"
                      onClick={() =>
                        void setLoanPromiseToPay(activeLoanDetail.id, null)
                      }
                      className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {tNotif('promiseToPay.clear')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Schedule Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left whitespace-nowrap">#</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">{t('loans.dueDate')}</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">{t('loans.principalCol')}</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">{t('loans.interestCol')}</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">{t('loans.totalCol')}</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">{t('loans.paidCol')}</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">{t('loans.statusCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(schedulesByLoan[activeLoanDetail.id] || []).map((s) => {
                      const { daysOverdue, accruedPenalty } = computeScheduleLateFee(
                        s,
                        activeLoanDetail,
                        todayIso
                      );
                      const paidSum = s.principalPaid + s.interestPaid;
                      return (
                        <tr key={s.id}>
                          <td className="px-3 py-2 font-mono">{s.installmentNumber}</td>
                          <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                            {formatDateLocalized(s.dueDate, lang, useKh)}
                            {daysOverdue > 0 && s.status !== 'paid' && (
                              <span className="ml-1.5 text-red-600">
                                ({daysOverdue}d{accruedPenalty > 0 ? ` +${formatCurrency(accruedPenalty, activeLoanDetail.currency, lang, useKh)}` : ''})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                            {formatCurrency(s.principalDue, activeLoanDetail.currency, lang, useKh)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                            {formatCurrency(s.interestDue, activeLoanDetail.currency, lang, useKh)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                            {formatCurrency(s.totalDue, activeLoanDetail.currency, lang, useKh)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatCurrency(paidSum, activeLoanDetail.currency, lang, useKh)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            <span
                              className={
                                s.status === 'paid'
                                  ? 'text-emerald-600'
                                  : daysOverdue > 0
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                              }
                            >
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
