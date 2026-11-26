import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  Eye,
  MessageSquareHeart,
  Shield,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ANALYTICS_BUILD_DISABLED,
  FEEDBACK_FORM_URL,
  GA4_MEASUREMENT_ID,
  isMeasurementIdConfigured,
} from '../config/analytics';
import { track } from '../lib/analytics';
import { loadAnalyticsLocalState } from '../lib/analyticsStore';
import { PrivacySharedModal } from './PrivacySharedModal';
import { useTermsContext } from './TermsGate';

export const SettingsPrivacyCard: React.FC = () => {
  const { t, i18n } = useTranslation('analytics');
  const { analyticsConsent, setAnalyticsConsent } = useTermsContext();
  const [showSharedModal, setShowSharedModal] = useState(false);
  const [localRating, setLocalRating] = useState<number | null>(null);

  const isKm = i18n.language.startsWith('km');
  const lineClass = isKm ? 'leading-[1.75]' : 'leading-snug';
  const showBuildHint =
    ANALYTICS_BUILD_DISABLED || !isMeasurementIdConfigured(GA4_MEASUREMENT_ID);

  useEffect(() => {
    let active = true;
    loadAnalyticsLocalState().then((st) => {
      if (active && typeof st.feedback.rating === 'number') {
        setLocalRating(st.feedback.rating);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      {/* Privacy & Anonymous Usage Analytics */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('privacy.sectionTitle')}
            </h2>
            <p className={`text-xs text-slate-500 dark:text-slate-400 ${lineClass}`}>
              {t('privacy.sectionDesc')}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <label
              htmlFor="settings-analytics-toggle"
              className={`text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 block cursor-pointer ${lineClass}`}
            >
              {t('privacy.toggleLabel')}
            </label>
            <p className={`text-xs text-slate-500 dark:text-slate-400 ${lineClass}`}>
              {t('privacy.toggleSubLabel')}
            </p>
            <p
              className={`text-[11px] font-medium pt-0.5 ${
                analyticsConsent
                  ? 'text-teal-700 dark:text-teal-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {analyticsConsent ? t('privacy.statusOn') : t('privacy.statusOff')}
            </p>
          </div>

          <button
            id="settings-analytics-toggle"
            type="button"
            role="switch"
            aria-checked={analyticsConsent}
            onClick={() => void setAnalyticsConsent(!analyticsConsent)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
              analyticsConsent
                ? 'bg-teal-600'
                : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                analyticsConsent ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {showBuildHint && analyticsConsent && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('privacy.buildDisabledHint')}
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowSharedModal(true)}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Eye className="w-4 h-4 text-teal-600" />
            <span>{t('privacy.viewSharedButton')}</span>
          </button>
        </div>
      </section>

      {/* Give Feedback */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <MessageSquareHeart className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('feedback.cardTitle')}
            </h2>
            <p className={`text-xs text-slate-500 dark:text-slate-400 ${lineClass}`}>
              {t('feedback.cardDesc')}
            </p>
            {localRating !== null && (
              <p className="text-[11px] font-medium text-teal-700 dark:text-teal-300 pt-0.5">
                {t('feedback.localRatingSaved', { rating: localRating })}
              </p>
            )}
          </div>
        </div>

        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            track('feedback_opened', {});
          }}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0 whitespace-nowrap"
        >
          <span>{t('feedback.giveFeedbackButton')}</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </a>
      </section>

      {showSharedModal && (
        <PrivacySharedModal onClose={() => setShowSharedModal(false)} />
      )}
    </>
  );
};
