import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Banknote,
  BellOff,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Info,
  MessageSquare,
  Phone,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  useNotifications,
  type NotificationRenderEntry,
  type SnoozeOption,
} from '../context/NotificationContext';
import { useTermsContext } from './TermsGate';
import {
  buildChannelLaunchUrl,
  buildPrefilledReminderMessage,
  normalizeCambodiaPhoneForDial,
} from '../lib/notificationTemplates';
import { applySwUpdateAndReload } from '../lib/swUpdateBridge';
import type { Loan } from '../types/loan';
import type {
  NotificationFilter,
  NotificationRecord,
} from '../types/notifications';

interface NotificationCenterModalProps {
  onRecordPayment: (loan: Loan) => void;
  onOpenLoanDetail: (loanId: string) => void;
  onOpenSettings: () => void;
}

type VisualTone = 'red' | 'amber' | 'green' | 'grey';

function getVisualTone(item: NotificationRecord): VisualTone {
  if (
    item.type === 'overdue' ||
    item.type === 'missed_installments' ||
    item.type === 'promise_broken' ||
    item.priority === 'high'
  ) {
    return 'red';
  }
  if (
    item.type === 'due_soon' ||
    item.type === 'partial_payment' ||
    item.type === 'penalty_started' ||
    item.type === 'interest_only_ending' ||
    item.priority === 'medium'
  ) {
    return 'amber';
  }
  if (item.type === 'payment_recorded' || item.type === 'loan_fully_paid') {
    return 'green';
  }
  return 'grey';
}

function getToneStyles(tone: VisualTone) {
  switch (tone) {
    case 'red':
      return {
        card: 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/60',
        iconBox: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
        labelText: 'text-red-700 dark:text-red-300',
        Icon: AlertOctagon,
        priorityLabelKey: 'center.priorityLabels.high',
      };
    case 'amber':
      return {
        card: 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60',
        iconBox: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
        labelText: 'text-amber-700 dark:text-amber-300',
        Icon: Clock,
        priorityLabelKey: 'center.priorityLabels.medium',
      };
    case 'green':
      return {
        card: 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60',
        iconBox: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
        labelText: 'text-emerald-700 dark:text-emerald-300',
        Icon: CheckCircle2,
        priorityLabelKey: 'center.priorityLabels.low',
      };
    default:
      return {
        card: 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800',
        iconBox: 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        labelText: 'text-slate-600 dark:text-slate-400',
        Icon: Info,
        priorityLabelKey: 'center.priorityLabels.info',
      };
  }
}

function getClusterTitleKey(groupKey: string): string {
  if (groupKey === 'due_soon:0') return 'center.cluster.dueToday';
  if (groupKey === 'due_soon:1') return 'center.cluster.dueTomorrow';
  if (groupKey.startsWith('due_soon:')) return 'center.cluster.dueInDays';
  if (groupKey === 'overdue:1') return 'center.cluster.overdue_1';
  if (groupKey === 'overdue:3') return 'center.cluster.overdue_3';
  if (groupKey === 'overdue:7') return 'center.cluster.overdue_7';
  if (groupKey === 'overdue:30plus') return 'center.cluster.overdue_30plus';
  return 'center.cluster.dueInDays';
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  onRecordPayment,
  onOpenLoanDetail,
  onOpenSettings,
}) => {
  const { t, i18n } = useTranslation('notifications');
  const { loans, borrowers, profile, todayIso } = useApp();
  const { openLegalDocument } = useTermsContext();
  const {
    isCenterOpen,
    closeCenter,
    activeFilter,
    setActiveFilter,
    getSectionsForFilter,
    unreadCount,
    settings,
    updateNotificationSettings,
    markRead,
    markManyRead,
    markAllRead,
    dismiss,
    dismissMany,
    snooze,
    undoRecentPayment,
  } = useNotifications();

  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const [openSnoozeId, setOpenSnoozeId] = useState<string | null>(null);

  const isKm = i18n.language === 'km';
  const lineClass = isKm ? 'leading-[1.7]' : 'leading-snug';

  useEffect(() => {
    if (!isCenterOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCenter();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCenterOpen, closeCenter]);

  const loanMap = useMemo(() => {
    const map = new Map<string, Loan>();
    for (const l of loans) map.set(l.id, l);
    return map;
  }, [loans]);

  const borrowerMap = useMemo(() => {
    const map = new Map<string, (typeof borrowers)[number]>();
    for (const b of borrowers) map.set(b.id, b);
    return map;
  }, [borrowers]);

  const sections = useMemo(
    () => (isCenterOpen ? getSectionsForFilter(activeFilter) : []),
    [isCenterOpen, getSectionsForFilter, activeFilter]
  );

  if (!isCenterOpen) return null;

  const filters: Array<{ id: NotificationFilter; label: string }> = [
    { id: 'all', label: t('center.filters.all') },
    { id: 'unread', label: t('center.filters.unread') },
    { id: 'overdue', label: t('center.filters.overdue') },
    { id: 'due_soon', label: t('center.filters.due_soon') },
  ];

  const getMaskedParams = (item: NotificationRecord) => {
    if (!settings.privacyHideDetails) return item.params;
    return {
      ...item.params,
      borrowerName: t('privacy.hiddenBorrower'),
      amountFormatted: t('privacy.hiddenAmount'),
      paidFormatted: t('privacy.hiddenAmount'),
      remainingFormatted: t('privacy.hiddenAmount'),
      expectedTodayFormatted: t('privacy.hiddenAmount'),
      collectedTodayFormatted: t('privacy.hiddenAmount'),
      overdueTotalFormatted: t('privacy.hiddenAmount'),
      collectedFormatted: t('privacy.hiddenAmount'),
      interestFormatted: t('privacy.hiddenAmount'),
      parFormatted: t('privacy.hiddenAmount'),
      collateralText: t('dashboard.hiddenValue'),
    };
  };

  const renderSingleItem = (item: NotificationRecord, nested = false) => {
    const tone = getVisualTone(item);
    const toneStyle = getToneStyles(tone);
    const ToneIcon =
      item.type === 'repeated_late' ||
      item.type === 'holiday_tomorrow' ||
      item.type === 'exchange_rate_stale'
        ? Sparkles
        : toneStyle.Icon;

    const loan = item.loanId ? loanMap.get(item.loanId) : undefined;
    const borrower = item.borrowerId
      ? borrowerMap.get(item.borrowerId)
      : loan
      ? borrowerMap.get(loan.borrowerId)
      : undefined;

    const params = getMaskedParams(item);
    const titleText = t(item.titleKey, params);
    const bodyText = t(item.bodyKey, params);

    const canSendReminder =
      Boolean(loan || borrower) &&
      (item.type === 'due_soon' ||
        item.type === 'overdue' ||
        item.type === 'missed_installments' ||
        item.type === 'promise_broken' ||
        item.type === 'partial_payment' ||
        item.type === 'penalty_started' ||
        item.type === 'interest_only_ending' ||
        item.type === 'loan_maturing');

    const reminderLang =
      borrower?.preferredLang || settings.defaultReminderLanguage || 'en';
    const reminderChannel = settings.defaultChannel || 'telegram';
    const reminderMessage = canSendReminder
      ? buildPrefilledReminderMessage({
          settings,
          lang: reminderLang,
          borrowerName:
            borrower?.name ||
            loan?.borrowerName ||
            String(item.params.borrowerName || ''),
          amountValue: item.amountValue ?? loan?.outstandingBalance ?? 0,
          currency: item.currency || loan?.currency || 'USD',
          dueDateIso: item.dueDate || todayIso,
          daysLate: item.daysLate ?? (item.type === 'due_soon' ? -1 : 1),
          lenderName: profile?.displayName || 'KamChi',
          useKhmerNumerals: Boolean(profile?.useKhmerNumerals),
        })
      : '';
    const reminderUrl = canSendReminder
      ? buildChannelLaunchUrl(
          reminderChannel,
          borrower?.phone || '',
          reminderMessage
        )
      : '';
    const callDial = borrower?.phone
      ? normalizeCambodiaPhoneForDial(borrower.phone)
      : '';

    const snoozeMenuOpen = openSnoozeId === item.id;

    return (
      <article
        key={item.id}
        className={`rounded-2xl border p-3.5 transition-colors motion-reduce:transition-none ${
          toneStyle.card
        } ${nested ? 'ml-2 sm:ml-4' : ''} ${!item.readAt ? 'ring-1 ring-inset ring-slate-900/10 dark:ring-white/10' : 'opacity-90'}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${toneStyle.iconBox}`}
            aria-hidden="true"
          >
            <ToneIcon className="w-4 h-4" />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`text-[11px] font-bold tracking-tight ${toneStyle.labelText}`}
              >
                {t(toneStyle.priorityLabelKey)}
                {!item.readAt ? ' · ●' : ''}
              </span>
              {item.dueDate && (
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {item.dueDate}
                </span>
              )}
            </div>

            {loan ? (
              <button
                type="button"
                onClick={() => {
                  markRead(item.id);
                  closeCenter();
                  onOpenLoanDetail(loan.id);
                }}
                className={`text-left text-sm font-bold text-slate-900 dark:text-slate-100 hover:underline ${lineClass}`}
              >
                {titleText}
              </button>
            ) : (
              <h3
                className={`text-sm font-bold text-slate-900 dark:text-slate-100 ${lineClass}`}
              >
                {titleText}
              </h3>
            )}

            <p
              className={`text-xs text-slate-700 dark:text-slate-300 ${lineClass}`}
            >
              {bodyText}
            </p>

            {/* One-tap action bar */}
            <div className="pt-2 flex flex-wrap items-center gap-1.5">
              {item.actionType === 'record_payment' && loan && loan.status === 'active' && (
                <button
                  type="button"
                  onClick={() => {
                    markRead(item.id);
                    closeCenter();
                    onRecordPayment(loan);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  <Banknote className="w-3.5 h-3.5" />
                  <span>{t('actions.recordPayment')}</span>
                </button>
              )}

              {canSendReminder && reminderUrl && (
                <a
                  href={reminderUrl}
                  target={reminderChannel === 'sms' ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  onClick={() => markRead(item.id)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
                  <span>{t('actions.sendReminder')}</span>
                </a>
              )}

              {callDial && (
                <a
                  href={`tel:${callDial}`}
                  onClick={() => markRead(item.id)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('actions.callBorrower')}</span>
                </a>
              )}

              {item.type === 'payment_recorded' && item.paymentId && (
                <button
                  type="button"
                  onClick={() => {
                    void undoRecentPayment(item.paymentId!, item.id);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>{t('actions.undo')}</span>
                </button>
              )}

              {item.actionType === 'open_terms' && (
                <button
                  type="button"
                  onClick={() => {
                    markRead(item.id);
                    closeCenter();
                    openLegalDocument('terms');
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('actions.openTerms')}</span>
                </button>
              )}

              {item.actionType === 'reload_app' && (
                <button
                  type="button"
                  onClick={() => {
                    void applySwUpdateAndReload();
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('actions.reloadApp')}</span>
                </button>
              )}

              {item.actionType === 'open_settings' && (
                <button
                  type="button"
                  onClick={() => {
                    markRead(item.id);
                    closeCenter();
                    onOpenSettings();
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{t('actions.openSettings')}</span>
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  aria-expanded={snoozeMenuOpen}
                  onClick={() =>
                    setOpenSnoozeId((prev) => (prev === item.id ? null : item.id))
                  }
                  className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t('actions.snooze')}</span>
                </button>

                {snoozeMenuOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-1 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg py-1 z-20"
                  >
                    {(
                      [
                        { opt: '1d' as SnoozeOption, label: t('actions.snooze1d') },
                        { opt: '3d' as SnoozeOption, label: t('actions.snooze3d') },
                        {
                          opt: 'until_due' as SnoozeOption,
                          label: t('actions.snoozeUntilDue'),
                        },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.opt}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          snooze(item.id, s.opt);
                          setOpenSnoozeId(null);
                        }}
                        className="w-full min-h-[40px] px-3 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!item.readAt && (
                <button
                  type="button"
                  onClick={() => markRead(item.id)}
                  className="min-h-[40px] inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('actions.markRead')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="min-h-[40px] inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50/70 dark:hover:bg-red-950/30"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t('actions.dismiss')}</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderEntry = (entry: NotificationRenderEntry) => {
    if (entry.kind === 'single') {
      return renderSingleItem(entry.primary);
    }

    const isExpanded = Boolean(expandedClusters[entry.key]);
    const toneStyle = getToneStyles(getVisualTone(entry.primary));
    const ToneIcon = toneStyle.Icon;
    const clusterTitleKey = getClusterTitleKey(entry.primary.groupKey || '');
    const ids = entry.items.map((i) => i.id);
    const hasUnread = entry.items.some((i) => !i.readAt);

    return (
      <div key={entry.key} className="space-y-2">
        <div className={`rounded-2xl border p-3.5 ${toneStyle.card}`}>
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${toneStyle.iconBox}`}
              aria-hidden="true"
            >
              <ToneIcon className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`text-[11px] font-bold block ${toneStyle.labelText}`}
                  >
                    {t(toneStyle.priorityLabelKey)}
                    {hasUnread ? ' · ●' : ''}
                  </span>
                  <h3
                    className={`text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 ${lineClass}`}
                  >
                    {t(clusterTitleKey, { count: entry.items.length })}
                  </h3>
                </div>

                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedClusters((prev) => ({
                      ...prev,
                      [entry.key]: !prev[entry.key],
                    }))
                  }
                  className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 shrink-0"
                >
                  <span>
                    {isExpanded
                      ? t('center.cluster.collapse')
                      : t('center.cluster.expand')}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {hasUnread && (
                  <button
                    type="button"
                    onClick={() => markManyRead(ids)}
                    className="min-h-[38px] inline-flex items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('actions.markRead')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissMany(ids)}
                  className="min-h-[38px] inline-flex items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-slate-500 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t('actions.dismiss')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-2">
            {entry.items.map((child) => renderSingleItem(child, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-center-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeCenter();
      }}
    >
      <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2
                id="notification-center-title"
                className={`text-lg font-bold text-slate-900 dark:text-slate-100 ${lineClass}`}
              >
                {t('center.title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('center.subtitle')}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                aria-pressed={settings.privacyHideDetails}
                onClick={() =>
                  void updateNotificationSettings((prev) => ({
                    ...prev,
                    privacyHideDetails: !prev.privacyHideDetails,
                  }))
                }
                title={t('center.privacyToggle')}
                className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                  settings.privacyHideDetails
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {settings.privacyHideDetails ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{t('center.privacyToggle')}</span>
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('center.markAllRead')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={closeCenter}
                aria-label={t('center.close')}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {filters.map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id)}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="sm:hidden min-h-[38px] px-3 rounded-xl text-xs font-semibold text-teal-700 dark:text-teal-300 whitespace-nowrap shrink-0 ml-auto"
              >
                {t('center.markAllRead')}
              </button>
            )}
          </div>

          {settings.privacyHideDetails && (
            <p className="text-[11px] font-medium text-teal-700 dark:text-teal-300">
              {t('center.privacyActiveHint')}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {sections.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <BellOff className="w-6 h-6" />
              </div>
              <p
                className={`text-base font-bold text-slate-900 dark:text-slate-100 ${lineClass}`}
              >
                {t('center.emptyTitle')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                {t('center.emptyBody')}
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.bucket} className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                  {t(`center.groups.${section.bucket}`)}
                </h3>
                <div className="space-y-2.5">
                  {section.entries.map((entry) => renderEntry(entry))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
