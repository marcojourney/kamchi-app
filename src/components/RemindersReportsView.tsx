import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import {
  Bell,
  Copy,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  computeScheduleLateFee,
  convertCurrency,
  formatCurrency,
  formatDateLocalized,
} from '../lib/finance';
import type { AgingBucketKey } from '../lib/finance';
import { exportLoansAndPaymentsToExcel, exportPnlReportPdf } from '../lib/pdfExport';
import type { Loan } from '../types/loan';
import { ArrearsView } from './ArrearsView';

export type ReportsSubTab = 'reminders' | 'reports' | 'arrears' | 'audit';

interface RemindersReportsViewProps {
  subTabRequest?: {
    tab: ReportsSubTab;
    bucket?: AgingBucketKey | null;
    seq: number;
  } | null;
  onSelectLoanForPayment: (loan: Loan) => void;
  onOpenLoanDetail: (loanId: string) => void;
}

export const RemindersReportsView: React.FC<RemindersReportsViewProps> = ({
  subTabRequest = null,
  onSelectLoanForPayment,
  onOpenLoanDetail,
}) => {
  const { t, i18n } = useTranslation();
  const { user, profile, borrowers, loans, schedulesByLoan, payments, auditLogs, todayIso } =
    useApp();

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);
  const displayCurrency = profile?.defaultCurrency || 'USD';
  const rate = profile?.exchangeRateKhr || 4100;

  const [tab, setTab] = useState<ReportsSubTab>(subTabRequest?.tab || 'reminders');
  const [arrearsInitialBucket, setArrearsInitialBucket] = useState<AgingBucketKey | null>(
    subTabRequest?.bucket ?? null
  );

  useEffect(() => {
    if (!subTabRequest) return;
    setTab(subTabRequest.tab);
    setArrearsInitialBucket(subTabRequest.bucket ?? null);
  }, [subTabRequest?.seq]);
  const [pushReady, setPushReady] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [draftMessages, setDraftMessages] = useState<Record<string, string>>({});
  const [telegramChatId, setTelegramChatId] = useState('');
  const [statusNotice, setStatusNotice] = useState('');

  const reminderItems = useMemo(() => {
    const horizon = format(addDays(parseISO(todayIso), 7), 'yyyy-MM-dd');
    const items: Array<{
      key: string;
      loanId: string;
      borrowerName: string;
      phone: string;
      dueDate: string;
      amountFormatted: string;
      daysOverdue: number;
    }> = [];

    for (const loan of loans) {
      if (loan.status !== 'active') continue;
      const borrower = borrowers.find((b) => b.id === loan.borrowerId);
      for (const s of schedulesByLoan[loan.id] || []) {
        if (s.status === 'paid') continue;
        if (s.dueDate > horizon) continue;
        const unpaid = Math.max(0, s.totalDue - (s.principalPaid + s.interestPaid));
        const { daysOverdue, accruedPenalty } = computeScheduleLateFee(s, loan, todayIso);
        const total = unpaid + Math.max(0, accruedPenalty - s.penaltyPaid);
        items.push({
          key: `${loan.id}_${s.installmentNumber}`,
          loanId: loan.id,
          borrowerName: loan.borrowerName,
          phone: borrower?.phone || '',
          dueDate: s.dueDate,
          amountFormatted: formatCurrency(total, loan.currency, lang, useKh),
          daysOverdue,
        });
      }
    }

    items.sort((a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.localeCompare(b.dueDate));
    return items;
  }, [loans, borrowers, schedulesByLoan, todayIso, lang, useKh]);

  const getDefaultTemplate = (item: (typeof reminderItems)[number]) => {
    if (draftMessages[item.key]) return draftMessages[item.key];
    if (lang === 'km') {
      return item.daysOverdue > 0
        ? `សួស្តី ${item.borrowerName} សូមរំលឹកអំពីការបង់ប្រាក់កម្ចីចំនួន ${item.amountFormatted} ដែលដល់កំណត់ថ្ងៃទី ${formatDateLocalized(item.dueDate, 'km', useKh)} (យឺត ${item.daysOverdue} ថ្ងៃ)។ សូមអរគុណ!`
        : `សួស្តី ${item.borrowerName} សូមរំលឹកថាប្រាក់កម្ចីចំនួន ${item.amountFormatted} នឹងដល់ថ្ងៃបង់នៅ ${formatDateLocalized(item.dueDate, 'km', useKh)}។ សូមអរគុណ!`;
    }
    return item.daysOverdue > 0
      ? `Hello ${item.borrowerName}, friendly reminder that your loan installment of ${item.amountFormatted} was due on ${item.dueDate} (${item.daysOverdue} days overdue). Thank you!`
      : `Hello ${item.borrowerName}, reminder that your loan installment of ${item.amountFormatted} is due on ${item.dueDate}. Thank you!`;
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setPushReady(perm === 'granted');
    if (perm === 'granted' && reminderItems.length > 0) {
      new Notification(t('app.name'), {
        body: `${reminderItems.length} overdue or upcoming installments need attention.`,
        icon: '/pwa-192x192.png',
      });
    }
  };

  const handleTelegramBotSend = async (text: string) => {
    if (!user || !telegramChatId.trim()) return;
    setStatusNotice('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatId: telegramChatId.trim(), text }),
      });
      const json = (await res.json()) as { sent?: boolean; reason?: string; error?: string };
      if (json.sent) {
        setStatusNotice('Sent via Telegram Bot.');
      } else if (json.reason === 'TELEGRAM_BOT_TOKEN_NOT_SET') {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`, '_blank');
      } else {
        setStatusNotice(json.error || 'Telegram send failed');
      }
    } catch {
      setStatusNotice('Failed to reach Telegram endpoint');
    }
  };

  // Financial Reports P&L
  const pnl = useMemo(() => {
    const toDisp = (v: number, c: 'USD' | 'KHR') => convertCurrency(v, c, displayCurrency, rate);
    let interestEarned = 0;
    let penaltiesEarned = 0;
    let principalRecovered = 0;
    let writtenOffLoss = 0;
    let capitalLentOut = 0;

    for (const p of payments) {
      interestEarned += toDisp(p.interestPortion, p.currency);
      penaltiesEarned += toDisp(p.penaltyPortion, p.currency);
      principalRecovered += toDisp(p.principalPortion, p.currency);
    }

    for (const l of loans) {
      interestEarned += toDisp(l.adminFee || 0, l.currency);
      if (l.status === 'written_off') {
        writtenOffLoss += toDisp(l.outstandingBalance, l.currency);
      } else if (l.status === 'active') {
        capitalLentOut += toDisp(Math.max(0, l.principal - (l.paidPrincipal ?? 0)), l.currency);
      }
    }

    const netProfit = interestEarned + penaltiesEarned - writtenOffLoss;
    const cashOnHand =
      toDisp(profile?.capitalCashUsd ?? 0, 'USD') + toDisp(profile?.capitalCashKhr ?? 0, 'KHR');

    return {
      interestEarned,
      penaltiesEarned,
      principalRecovered,
      writtenOffLoss,
      netProfit,
      capitalLentOut,
      cashOnHand,
    };
  }, [payments, loans, displayCurrency, rate, profile]);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('reports.title')}
        </h1>

        <div className="w-full grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'reminders', label: t('reports.tabReminders') },
              { id: 'reports', label: t('reports.tabReports') },
              { id: 'arrears', label: t('nav.arrears') },
              { id: 'audit', label: t('reports.tabAudit') },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'arrears') setArrearsInitialBucket(null);
                setTab(item.id);
              }}
              className={`w-full min-h-[40px] px-1.5 sm:px-3 rounded-lg text-xs font-semibold text-center truncate transition-colors ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {statusNotice && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30 px-4 py-2.5 text-xs text-teal-800 dark:text-teal-200">
          {statusNotice}
        </div>
      )}

      {tab === 'reminders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder={t('reports.telegramChatId')}
                className="w-full max-w-xs min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs font-mono"
              />
            </div>

            <button
              type="button"
              onClick={enableNotifications}
              className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Bell className="w-4 h-4 text-teal-600" />
              <span>{pushReady ? t('reports.pushEnabled') : t('reports.sendPush')}</span>
            </button>
          </div>

          {reminderItems.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">
              {t('dashboard.noDueItems')}
            </div>
          ) : (
            <div className="space-y-3">
              {reminderItems.map((item) => {
                const msg = getDefaultTemplate(item);
                const cleanPhone = item.phone.replace(/[^0-9+]/g, '');
                return (
                  <div
                    key={item.key}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.borrowerName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{item.phone}</span>
                          <span aria-hidden="true"> · </span>
                          <span className={item.daysOverdue > 0 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}>
                            {item.daysOverdue > 0
                              ? t('dashboard.daysOverdue', { count: item.daysOverdue })
                              : formatDateLocalized(item.dueDate, lang, useKh)}
                          </span>
                        </p>
                      </div>
                      <span className="text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {item.amountFormatted}
                      </span>
                    </div>

                    <textarea
                      rows={2}
                      value={msg}
                      onChange={(e) =>
                        setDraftMessages((prev) => ({ ...prev, [item.key]: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-xs text-slate-800 dark:text-slate-200"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      {telegramChatId.trim() ? (
                        <button
                          type="button"
                          onClick={() => handleTelegramBotSend(msg)}
                          className="min-h-[36px] flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{t('reports.sendTelegramBot')}</span>
                        </button>
                      ) : (
                        <a
                          href={`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(msg)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[36px] flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                        >
                          <Send className="w-3.5 h-3.5 text-sky-600" />
                          <span>{t('reports.openTelegram')}</span>
                        </a>
                      )}

                      <a
                        href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-[36px] flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{t('reports.openWhatsapp')}</span>
                      </a>

                      <a
                        href={`sms:${cleanPhone}?body=${encodeURIComponent(msg)}`}
                        className="min-h-[36px] flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        <span>{t('reports.openSms')}</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(msg);
                          setStatusNotice(t('app.copied'));
                        }}
                        className="min-h-[36px] flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{t('reports.copyMsg')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                exportPnlReportPdf({
                  lenderName: profile?.displayName || t('app.name'),
                  lenderPhone: profile?.lenderPhone,
                  lenderLogoDataUrl: profile?.lenderLogoDataUrl,
                  reportDate: todayIso,
                  currency: displayCurrency,
                  interestEarned: pnl.interestEarned,
                  penaltiesEarned: pnl.penaltiesEarned,
                  principalRecovered: pnl.principalRecovered,
                  writtenOffLoss: pnl.writtenOffLoss,
                  netProfit: pnl.netProfit,
                  cashOnHand: pnl.cashOnHand,
                  capitalLentOut: pnl.capitalLentOut,
                  loans,
                  lang,
                  useKhmerNumerals: useKh,
                })
              }
              className="min-h-[44px] flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <FileText className="w-4 h-4" />
              <span>{t('reports.exportPdf')}</span>
            </button>
            <button
              type="button"
              onClick={() => exportLoansAndPaymentsToExcel({ loans, payments, borrowers })}
              className="min-h-[44px] flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{t('reports.exportExcel')}</span>
            </button>
          </div>

          <div
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t('reports.pnlTitle')} ({displayCurrency})
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {formatDateLocalized(todayIso, lang, useKh)}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <div className="py-3 flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">{t('reports.interestEarned')}</span>
                <span className="font-mono font-semibold tabular-nums text-emerald-600">
                  {formatCurrency(pnl.interestEarned, displayCurrency, lang, useKh)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">{t('reports.penaltiesEarned')}</span>
                <span className="font-mono font-semibold tabular-nums text-emerald-600">
                  {formatCurrency(pnl.penaltiesEarned, displayCurrency, lang, useKh)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">{t('reports.principalRecovered')}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(pnl.principalRecovered, displayCurrency, lang, useKh)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">{t('reports.writtenOffLoss')}</span>
                <span className="font-mono font-semibold tabular-nums text-red-600">
                  -{formatCurrency(pnl.writtenOffLoss, displayCurrency, lang, useKh)}
                </span>
              </div>
              <div className="py-3 flex justify-between font-bold text-base">
                <span>{t('reports.netProfit')}</span>
                <span className="font-mono tabular-nums text-teal-600">
                  {formatCurrency(pnl.netProfit, displayCurrency, lang, useKh)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3">
                <span className="text-slate-500 block">{t('dashboard.cashOnHand')}</span>
                <span className="text-sm font-mono font-bold tabular-nums">
                  {formatCurrency(pnl.cashOnHand, displayCurrency, lang, useKh)}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3">
                <span className="text-slate-500 block">{t('dashboard.capitalLentOut')}</span>
                <span className="text-sm font-mono font-bold tabular-nums">
                  {formatCurrency(pnl.capitalLentOut, displayCurrency, lang, useKh)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'arrears' && (
        <ArrearsView
          embedded
          initialBucket={arrearsInitialBucket}
          onSelectLoanForPayment={onSelectLoanForPayment}
          onOpenLoanDetail={onOpenLoanDetail}
        />
      )}

      {tab === 'audit' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">{t('reports.auditEmpty')}</div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {log.summary}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    {log.actorName} · {log.action}
                  </p>
                </div>
                <span className="font-mono text-slate-400 shrink-0">{log.entityType}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
