import React from 'react';
import { CalendarCheck2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../context/NotificationContext';

export const DailySummaryBanner: React.FC = () => {
  const { t, i18n } = useTranslation('notifications');
  const {
    showDailySummaryBanner,
    dailySummaryMetrics,
    settings,
    dismissDailySummary,
  } = useNotifications();

  if (!showDailySummaryBanner) return null;

  const isKm = i18n.language === 'km';
  const hide = settings.privacyHideDetails;

  return (
    <section
      aria-label={t('dashboard.dailySummaryTitle')}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
            <CalendarCheck2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2
              className={`text-sm font-bold text-slate-900 dark:text-slate-100 ${
                isKm ? 'leading-[1.7]' : ''
              }`}
            >
              {t('dashboard.dailySummaryTitle')}
            </h2>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {dailySummaryMetrics.dateIso}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dismissDailySummary()}
          aria-label={t('dashboard.dismissSummary')}
          className="min-h-[44px] min-w-[44px] -mt-1 -mr-1 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 pt-1">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-2.5 min-w-0">
          <span
            className={`text-[11px] text-slate-500 dark:text-slate-400 block ${
              isKm ? 'leading-[1.6]' : ''
            }`}
          >
            {t('dashboard.expectedToday')}
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums truncate block mt-0.5">
            {hide ? t('dashboard.hiddenValue') : dailySummaryMetrics.expectedTodayFormatted}
          </span>
        </div>

        <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50 p-2.5 min-w-0">
          <span
            className={`text-[11px] text-emerald-700 dark:text-emerald-300 block ${
              isKm ? 'leading-[1.6]' : ''
            }`}
          >
            {t('dashboard.collectedToday')}
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 tabular-nums truncate block mt-0.5">
            {hide ? t('dashboard.hiddenValue') : dailySummaryMetrics.collectedTodayFormatted}
          </span>
        </div>

        <div className="rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/50 p-2.5 min-w-0">
          <span
            className={`text-[11px] text-red-700 dark:text-red-300 block ${
              isKm ? 'leading-[1.6]' : ''
            }`}
          >
            {t('dashboard.overdueTotal')}
          </span>
          <span className="text-xs sm:text-sm font-mono font-bold text-red-700 dark:text-red-300 tabular-nums truncate block mt-0.5">
            {hide ? t('dashboard.hiddenValue') : dailySummaryMetrics.overdueTotalFormatted}
          </span>
        </div>
      </div>
    </section>
  );
};
