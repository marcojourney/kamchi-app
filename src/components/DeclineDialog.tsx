import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../types/loan';

interface DeclineDialogProps {
  language: AppLanguage;
  onReviewTerms: () => void;
  onCloseApp: () => void;
}

export const DeclineDialog: React.FC<DeclineDialogProps> = ({
  language,
  onReviewTerms,
  onCloseApp,
}) => {
  const { t } = useTranslation('terms');
  const reviewBtnRef = useRef<HTMLButtonElement | null>(null);
  const isKm = language === 'km';

  useEffect(() => {
    reviewBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onReviewTerms();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onReviewTerms]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-dialog-title"
      aria-describedby="decline-dialog-body"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
      style={{
        fontFamily: isKm
          ? '"Kantumruy Pro", "Inter", sans-serif'
          : '"Inter", "Kantumruy Pro", sans-serif',
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#F8FAF7] dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F2B544]/20 text-[#9A6700] dark:text-[#F2B544] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <h2
            id="decline-dialog-title"
            className={`text-base sm:text-lg font-bold text-[#1F2937] dark:text-slate-100 ${
              isKm ? 'leading-[1.75]' : 'leading-snug'
            }`}
          >
            {t('declineDialog.title', { lng: language })}
          </h2>

          <p
            id="decline-dialog-body"
            className={`text-sm text-slate-600 dark:text-slate-300 ${
              isKm ? 'leading-[1.85]' : 'leading-relaxed'
            }`}
          >
            {t('declineDialog.body', { lng: language })}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            ref={reviewBtnRef}
            type="button"
            onClick={onReviewTerms}
            className="w-full min-h-[48px] rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B544]"
          >
            {t('declineDialog.reviewButton', { lng: language })}
          </button>

          <button
            type="button"
            onClick={onCloseApp}
            className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#1F2937] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132]"
          >
            {t('declineDialog.closeAppButton', { lng: language })}
          </button>
        </div>
      </div>
    </div>
  );
};
