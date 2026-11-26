import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  Info,
  Shield,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TERMS_CONTACT } from '../config/terms';
import { useTermsContext } from './TermsGate';

interface SettingsTermsPrivacyViewProps {
  onBack: () => void;
}

export const SettingsTermsPrivacyView: React.FC<SettingsTermsPrivacyViewProps> = ({
  onBack,
}) => {
  const { t, i18n } = useTranslation('terms');
  const { storedRecord, termsVersion, storageUnavailable, openLegalDocument } =
    useTermsContext();

  const lang = i18n.language.startsWith('km') ? 'km' : 'en';
  const isKm = lang === 'km';

  const formattedAcceptedDate = storedRecord?.acceptedAt
    ? new Intl.DateTimeFormat(lang === 'km' ? 'km-KH' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(storedRecord.acceptedAt))
    : '—';

  const acceptedLangLabel =
    storedRecord?.language === 'km'
      ? t('settings.languageKm')
      : storedRecord?.language === 'en'
      ? t('settings.languageEn')
      : '—';

  return (
    <div
      className="space-y-5 max-w-3xl"
      style={{
        fontFamily: isKm
          ? '"Kantumruy Pro", "Inter", sans-serif'
          : '"Inter", "Kantumruy Pro", sans-serif',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('settings.backToSettings')}</span>
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
          {t('settings.pageTitle')}
        </h1>
      </div>

      {/* Acceptance Status & Metadata */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F5132]/10 dark:bg-emerald-500/15 text-[#0F5132] dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {storageUnavailable
                ? t('settings.statusNotSaved')
                : t('settings.statusAccepted')}
            </h2>
            <p className={`text-xs text-slate-500 dark:text-slate-400 ${isKm ? 'leading-[1.8]' : ''}`}>
              {t('settings.cardSubtitle')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">
              {t('settings.acceptedVersionLabel')}
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
              v{storedRecord?.termsVersion || termsVersion}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">
              {t('settings.acceptedDateLabel')}
            </span>
            <span className="font-medium text-slate-900 dark:text-slate-100 mt-0.5 block tabular-nums">
              {formattedAcceptedDate}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">
              {t('settings.acceptedLanguageLabel')}
            </span>
            <span className="font-medium text-slate-900 dark:text-slate-100 mt-0.5 block">
              {acceptedLangLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => openLegalDocument('terms')}
            className="min-h-[48px] inline-flex items-center gap-2 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white px-4 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B544]"
          >
            <FileText className="w-4 h-4" />
            <span>{t('settings.readTermsButton')}</span>
          </button>

          <button
            type="button"
            onClick={() => openLegalDocument('privacy')}
            className="min-h-[48px] inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132]"
          >
            <Shield className="w-4 h-4 text-[#0F5132] dark:text-emerald-400" />
            <span>{t('settings.readPrivacyButton')}</span>
          </button>
        </div>
      </div>

      {/* Delete Local Data / Uninstall Guidance (No option to withdraw acceptance in-app) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-start gap-2.5">
          <Trash2 className="w-4 h-4 text-slate-600 dark:text-slate-300 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.withdrawNoticeTitle')}
            </h2>
            <p className={`text-xs text-slate-600 dark:text-slate-300 ${isKm ? 'leading-[1.85]' : 'leading-relaxed'}`}>
              {t('settings.withdrawNoticeBody')}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-[#F8FAF7] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F5132] dark:text-emerald-400">
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>{t('settings.deleteStepsTitle')}</span>
          </div>
          <ol className={`space-y-1.5 text-xs text-[#1F2937] dark:text-slate-300 ${isKm ? 'leading-[1.85]' : 'leading-relaxed'}`}>
            <li>{t('settings.deleteStep1')}</li>
            <li>{t('settings.deleteStep2')}</li>
            <li>{t('settings.deleteStep3')}</li>
          </ol>
        </div>

        <div className="flex items-start gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className={isKm ? 'leading-[1.8]' : 'leading-relaxed'}>
            Telegram: {TERMS_CONTACT.telegramHandle} · Email: {TERMS_CONTACT.email}
          </p>
        </div>
      </div>
    </div>
  );
};
