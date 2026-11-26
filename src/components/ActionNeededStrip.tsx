import React from 'react';
import { AlertCircle, ArrowRight, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../context/NotificationContext';

export const ActionNeededStrip: React.FC = () => {
  const { t, i18n } = useTranslation('notifications');
  const { actionNeeded, settings, openCenter } = useNotifications();

  if (actionNeeded.totalCount === 0) return null;

  const isKm = i18n.language === 'km';
  const hasOverdue = actionNeeded.overdueCount > 0;

  return (
    <section
      aria-label={t('dashboard.actionNeededTitle')}
      className={`rounded-2xl border p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        hasOverdue
          ? 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
          : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
      }`}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            hasOverdue
              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
              : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
          }`}
        >
          {hasOverdue ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <Clock className="w-5 h-5" />
          )}
        </div>
        <div className="min-w-0">
          <h2
            className={`text-sm font-bold text-slate-900 dark:text-slate-100 ${
              isKm ? 'leading-[1.7]' : 'leading-snug'
            }`}
          >
            {t('dashboard.actionNeededTitle')}
          </h2>
          <p
            className={`text-xs font-medium mt-0.5 ${
              hasOverdue
                ? 'text-red-700 dark:text-red-300'
                : 'text-amber-800 dark:text-amber-300'
            } ${isKm ? 'leading-[1.7]' : ''}`}
          >
            {settings.privacyHideDetails
              ? t('dashboard.actionNeededHidden')
              : t('dashboard.actionNeededSummary', {
                  overdueCount: actionNeeded.overdueCount,
                  dueCount: actionNeeded.dueTodayCount,
                })}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => openCenter(hasOverdue ? 'overdue' : 'due_soon')}
        className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shrink-0 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
          hasOverdue
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-amber-600 hover:bg-amber-700'
        }`}
      >
        <span>{t('dashboard.viewAll')}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </section>
  );
};
