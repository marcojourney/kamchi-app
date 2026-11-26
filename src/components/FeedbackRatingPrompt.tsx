import React, { useEffect, useState } from 'react';
import { ExternalLink, Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_FORM_URL,
  FEEDBACK_PROMPT_AFTER_DAYS,
} from '../config/analytics';
import { track } from '../lib/analytics';
import {
  loadAnalyticsLocalState,
  updateAnalyticsLocalState,
} from '../lib/analyticsStore';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const FeedbackRatingPrompt: React.FC = () => {
  const { t, i18n } = useTranslation('analytics');
  const [visible, setVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const isKm = i18n.language.startsWith('km');
  const lineClass = isKm ? 'leading-[1.75]' : 'leading-snug';

  useEffect(() => {
    let active = true;
    loadAnalyticsLocalState().then((state) => {
      if (!active) return;
      if (state.feedback.dismissed || state.feedback.rating !== undefined) {
        return;
      }
      const firstMs = Date.parse(state.firstUsedAt);
      if (!Number.isFinite(firstMs)) return;
      const daysUsed = (Date.now() - firstMs) / MS_PER_DAY;
      if (daysUsed >= FEEDBACK_PROMPT_AFTER_DAYS) {
        setVisible(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (!visible) return null;

  const handleRate = async (rating: number) => {
    setSelectedRating(rating);
    // Stored strictly locally in IndexedDB — never sent to GA4
    await updateAnalyticsLocalState((prev) => ({
      ...prev,
      feedback: {
        ...prev.feedback,
        rating,
        ratedAt: new Date().toISOString(),
      },
    }));
  };

  const handleDismiss = async () => {
    setVisible(false);
    await updateAnalyticsLocalState((prev) => ({
      ...prev,
      feedback: {
        ...prev.feedback,
        dismissed: true,
      },
    }));
  };

  return (
    <section
      aria-label={t('feedback.promptTitle')}
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-sm font-semibold text-slate-900 dark:text-slate-100 ${lineClass}`}>
            {selectedRating ? t('feedback.savedThanks') : t('feedback.promptTitle')}
          </h3>
          <button
            type="button"
            onClick={() => void handleDismiss()}
            aria-label={t('feedback.dismiss')}
            className="sm:hidden min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!selectedRating && (
          <p className={`text-xs text-slate-500 dark:text-slate-400 ${lineClass}`}>
            {t('feedback.promptBody')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {selectedRating ? (
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track('feedback_opened', {});
            }}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <span>{t('feedback.tellUsMoreButton')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <div className="flex items-center gap-1" role="group" aria-label={t('feedback.promptTitle')}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => void handleRate(star)}
                aria-label={`${star}/5`}
                className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500 hover:border-amber-400 transition-colors"
              >
                <Star className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleDismiss()}
          className="hidden sm:inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          {t('feedback.dismiss')}
        </button>
      </div>
    </section>
  );
};
