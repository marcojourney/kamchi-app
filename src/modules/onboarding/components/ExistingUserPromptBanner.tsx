import React from 'react';
import { Store, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from '../hooks/useOnboarding';

interface ExistingUserPromptBannerProps {
  onChooseNow: () => void;
}

export const ExistingUserPromptBanner: React.FC<ExistingUserPromptBannerProps> = ({
  onChooseNow,
}) => {
  const { t, i18n } = useTranslation('onboarding');
  const { state, dismissExistingUserPrompt } = useOnboarding();
  const isKm = i18n.language.startsWith('km');

  if (!state.existingUser || state.existingUserPromptDismissed) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label={t('existingUserBanner.message')}
      className="rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/80 dark:bg-teal-950/35 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
          <Store className="w-4 h-4" />
        </div>
        <p
          className={`text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 ${
            isKm ? 'leading-[1.7]' : ''
          }`}
        >
          {t('existingUserBanner.message')}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          type="button"
          onClick={() => {
            void dismissExistingUserPrompt();
            onChooseNow();
          }}
          className="min-h-[40px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-3.5 text-xs font-semibold whitespace-nowrap transition-colors"
        >
          {t('existingUserBanner.chooseNow')}
        </button>

        <button
          type="button"
          onClick={() => void dismissExistingUserPrompt()}
          className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <span>{t('existingUserBanner.later')}</span>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
