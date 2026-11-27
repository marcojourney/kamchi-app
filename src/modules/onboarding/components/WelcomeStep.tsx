import React from 'react';
import { ArrowRight, Globe, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WelcomeStepProps {
  onGetStarted: () => void;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onGetStarted }) => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');

  const switchLanguage = (lang: 'en' | 'km') => {
    void i18n.changeLanguage(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/aistudio/image_01667597.png"
            alt="KamChi"
            className="h-12 w-auto object-contain dark:hidden"
            referrerPolicy="no-referrer"
          />
          <img
            src="/assets/aistudio/image_8f57a101.png"
            alt="KamChi"
            className="hidden dark:block h-12 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        <div
          role="group"
          aria-label={t('welcome.languageLabel')}
          className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-1"
        >
          <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 mx-1.5 shrink-0" />
          <button
            type="button"
            onClick={() => switchLanguage('en')}
            aria-pressed={!isKm}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none ${
              !isKm
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => switchLanguage('km')}
            aria-pressed={isKm}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none ${
              isKm
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            ភាសាខ្មែរ
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
          {t('welcome.offlineHighlight')}
        </p>

        <h1
          className={`text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight ${
            isKm ? 'leading-[1.55]' : 'leading-tight'
          }`}
        >
          {t('welcome.title')}
        </h1>

        <p
          className={`text-sm sm:text-base text-slate-600 dark:text-slate-300 ${
            isKm ? 'leading-[1.8]' : 'leading-relaxed'
          }`}
        >
          {t('welcome.subtitle')}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
        <p
          className={`text-xs text-slate-600 dark:text-slate-300 ${
            isKm ? 'leading-[1.75]' : 'leading-relaxed'
          }`}
        >
          {t('privacyDeviceNote')}
        </p>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={onGetStarted}
          className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-5 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          <span>{t('welcome.getStarted')}</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
};
