import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  TERMS_CONTACT,
  TERMS_UPDATE_SUMMARY,
  TERMS_VERSION,
} from '../config/terms';
import type { AppLanguage } from '../types/loan';
import { DeclineDialog } from './DeclineDialog';
import { TermsReader, type LegalDocumentType } from './TermsReader';

interface TermsSection {
  id: string;
  title: string;
  body: string[];
}

interface TermsScreenProps {
  versionChanged: boolean;
  storageUnavailable: boolean;
  accepting: boolean;
  initialAnalyticsConsent?: boolean;
  onAccept: (language: AppLanguage, analyticsConsent: boolean) => Promise<void>;
}

export const TermsScreen: React.FC<TermsScreenProps> = ({
  versionChanged,
  storageUnavailable,
  accepting,
  initialAnalyticsConsent = false,
  onAccept,
}) => {
  const { t, i18n } = useTranslation('terms');
  const language: AppLanguage = i18n.language.startsWith('km') ? 'km' : 'en';
  const isKm = language === 'km';

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(
    Boolean(initialAnalyticsConsent)
  );
  const [readerDoc, setReaderDoc] = useState<LegalDocumentType | null>(null);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [isClosedScreen, setIsClosedScreen] = useState(false);

  const handleLanguageSwitch = (nextLang: AppLanguage) => {
    if (nextLang === language) return;
    i18n.changeLanguage(nextLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLang;
    }
  };

  const evaluateScroll = useCallback(() => {
    const el = scrollBoxRef.current;
    if (!el) return;

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 8) {
      setScrollPercent(100);
      setHasScrolledToBottom(true);
      return;
    }

    const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
    setScrollPercent(Math.round(ratio * 100));

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      setHasScrolledToBottom(true);
    }
  }, []);

  useEffect(() => {
    evaluateScroll();
    const el = scrollBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => evaluateScroll());
    observer.observe(el);
    return () => observer.disconnect();
  }, [evaluateScroll, language]);

  const sectionsRaw = t('termsSections', {
    returnObjects: true,
    lng: language,
    telegram: TERMS_CONTACT.telegramHandle,
    email: TERMS_CONTACT.email,
  });
  const sections: TermsSection[] = Array.isArray(sectionsRaw)
    ? (sectionsRaw as TermsSection[])
    : [];

  const updateSummaryItems =
    TERMS_UPDATE_SUMMARY[TERMS_VERSION]?.[language] ??
    TERMS_UPDATE_SUMMARY[TERMS_VERSION]?.en ??
    [];

  if (isClosedScreen) {
    return (
      <div
        className="min-h-[100dvh] bg-[#F8FAF7] dark:bg-[#0B120F] text-[#1F2937] dark:text-slate-100 flex items-center justify-center p-4 sm:p-6"
        style={{
          fontFamily: isKm
            ? '"Kantumruy Pro", "Inter", sans-serif'
            : '"Inter", "Kantumruy Pro", sans-serif',
        }}
      >
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center space-y-5 shadow-sm">
          <div className="flex justify-center">
            <img
              src="/assets/aistudio/image_01667597.png"
              alt={t('brand.name', { lng: language })}
              className="h-12 w-auto object-contain dark:hidden"
              referrerPolicy="no-referrer"
            />
            <img
              src="/assets/aistudio/image_8f57a101.png"
              alt={t('brand.name', { lng: language })}
              className="hidden dark:block h-12 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="space-y-2">
            <h1
              className={`text-xl font-bold text-[#1F2937] dark:text-slate-100 ${
                isKm ? 'leading-[1.75]' : 'leading-snug'
              }`}
            >
              {t('exitScreen.title', { lng: language })}
            </h1>
            <p
              className={`text-sm text-slate-600 dark:text-slate-300 ${
                isKm ? 'leading-[1.85]' : 'leading-relaxed'
              }`}
            >
              {t('exitScreen.body', { lng: language })}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsClosedScreen(false)}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B544]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('exitScreen.reopenButton', { lng: language })}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAF7] dark:bg-[#0B120F] text-[#1F2937] dark:text-slate-100 flex flex-col"
      style={{
        fontFamily: isKm
          ? '"Kantumruy Pro", "Inter", sans-serif'
          : '"Inter", "Kantumruy Pro", sans-serif',
      }}
    >
      {/* Top Brand + Immediate Language Switch */}
      <header className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="shrink-0">
            <img
              src="/assets/aistudio/image_01667597.png"
              alt={t('brand.name', { lng: language })}
              className="h-11 sm:h-12 w-auto object-contain dark:hidden"
              referrerPolicy="no-referrer"
            />
            <img
              src="/assets/aistudio/image_8f57a101.png"
              alt={t('brand.name', { lng: language })}
              className="hidden dark:block h-11 sm:h-12 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          <div
            role="group"
            aria-label={t('welcome.languageLabel', { lng: language })}
            className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
          >
            <button
              type="button"
              onClick={() => handleLanguageSwitch('en')}
              aria-pressed={language === 'en'}
              className={`min-h-[40px] min-w-[48px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] ${
                language === 'en'
                  ? 'bg-[#0F5132] text-white shadow-xs'
                  : 'text-[#1F2937] dark:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/60'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch('km')}
              aria-pressed={language === 'km'}
              className={`min-h-[40px] min-w-[48px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] ${
                language === 'km'
                  ? 'bg-[#0F5132] text-white shadow-xs'
                  : 'text-[#1F2937] dark:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/60'
              }`}
            >
              ភាសាខ្មែរ
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-3.5">
        <div className="space-y-1.5">
          <h1
            className={`text-xl sm:text-2xl font-bold text-[#0F5132] dark:text-emerald-400 ${
              isKm ? 'leading-[1.7]' : 'leading-tight'
            }`}
          >
            {t('welcome.title', { lng: language })}
          </h1>
          <p
            className={`text-sm text-slate-600 dark:text-slate-300 ${
              isKm ? 'leading-[1.8]' : 'leading-relaxed'
            }`}
          >
            {t('welcome.subtitle', { lng: language })}
          </p>
        </div>

        {/* Terms Updated Notice when TERMS_VERSION changed */}
        {versionChanged && (
          <section
            aria-label={t('welcome.updatedBadge', { lng: language })}
            className="rounded-xl border border-[#F2B544] bg-[#F2B544]/15 dark:bg-[#F2B544]/10 p-3.5 space-y-1.5"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#9A6700] dark:text-[#F2B544] shrink-0" />
              <span className="text-xs font-bold text-[#1F2937] dark:text-[#F2B544]">
                {t('welcome.updatedTitle', { lng: language, version: TERMS_VERSION })}
              </span>
            </div>
            <p className={`text-xs text-[#1F2937] dark:text-slate-200 ${isKm ? 'leading-[1.8]' : ''}`}>
              {t('welcome.updatedDescription', { lng: language })}
            </p>
            {updateSummaryItems.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-xs text-[#1F2937] dark:text-slate-200">
                {updateSummaryItems.map((line, i) => (
                  <li key={i} className={isKm ? 'leading-[1.8]' : ''}>
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Storage Unavailable (Private Mode) Warning */}
        {storageUnavailable && (
          <div
            role="alert"
            className="rounded-xl border border-amber-400/70 bg-amber-50 dark:bg-amber-950/35 px-3.5 py-3 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200"
          >
            <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className={isKm ? 'leading-[1.8]' : 'leading-relaxed'}>
              {t('welcome.storageUnavailableWarning', { lng: language })}
            </p>
          </div>
        )}

        {/* Middle Scrollable Terms Box + Thin Progress Bar + Bottom Scroll Hint */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          {/* Thin Scroll Progress Bar */}
          <div
            role="progressbar"
            aria-label={t('scroll.progressLabel', { lng: language })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={scrollPercent}
            className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 shrink-0"
          >
            <div
              className="h-full bg-gradient-to-r from-[#0F5132] to-[#F2B544] transition-[width] duration-150 motion-reduce:transition-none"
              style={{ width: `${scrollPercent}%` }}
            />
          </div>

          <div
            ref={scrollBoxRef}
            onScroll={evaluateScroll}
            tabIndex={0}
            role="region"
            aria-label={t('reader.termsTitle', { lng: language })}
            className="h-[36dvh] min-h-[210px] max-h-[400px] overflow-y-auto px-4 sm:px-5 py-4 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F5132]"
          >
            {sections.map((section) => (
              <section key={section.id} className="space-y-1.5">
                <h2
                  className={`text-sm font-bold text-[#0F5132] dark:text-emerald-400 ${
                    isKm ? 'leading-[1.8]' : 'leading-snug'
                  }`}
                >
                  {section.title}
                </h2>
                <div className="space-y-1.5 text-sm text-[#1F2937] dark:text-slate-200">
                  {section.body.map((paragraph, pIdx) => (
                    <p
                      key={pIdx}
                      className={isKm ? 'leading-[1.9]' : 'leading-relaxed'}
                    >
                      {paragraph
                        .replace('{{telegram}}', TERMS_CONTACT.telegramHandle)
                        .replace('{{email}}', TERMS_CONTACT.email)}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Scroll Hint Bar (aria-live) */}
          <div
            aria-live="polite"
            className={`px-4 py-2.5 border-t text-xs font-medium flex items-center gap-2 transition-colors ${
              hasScrolledToBottom
                ? 'bg-[#0F5132]/8 dark:bg-emerald-950/40 border-[#0F5132]/20 dark:border-emerald-800/50 text-[#0F5132] dark:text-emerald-300'
                : 'bg-[#F2B544]/15 dark:bg-[#F2B544]/10 border-[#F2B544]/40 text-[#1F2937] dark:text-amber-200'
            }`}
          >
            {hasScrolledToBottom ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ArrowDown className="w-4 h-4 shrink-0" />
            )}
            <span className={isKm ? 'leading-[1.75]' : ''}>
              {hasScrolledToBottom
                ? t('scroll.hintComplete', { lng: language })
                : t('scroll.hintScrollToRead', { lng: language })}
            </span>
          </div>
        </div>

        {/* Consent Checkbox + Document Reader Links */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5">
          <div className="flex items-start gap-3">
            <div className="min-h-[48px] min-w-[48px] -ml-2 -my-1 flex items-center justify-center shrink-0">
              <input
                id="terms-consent-checkbox"
                type="checkbox"
                checked={checked}
                disabled={!hasScrolledToBottom}
                onChange={(e) => setChecked(e.target.checked)}
                aria-labelledby="terms-consent-label"
                className="w-5 h-5 rounded border-2 border-slate-400 dark:border-slate-500 text-[#0F5132] accent-[#0F5132] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132]"
              />
            </div>

            <div
              id="terms-consent-label"
              className={`flex-1 pt-1.5 text-sm text-[#1F2937] dark:text-slate-100 ${
                !hasScrolledToBottom ? 'opacity-65' : ''
              } ${isKm ? 'leading-[1.9]' : 'leading-relaxed'}`}
            >
              <label
                htmlFor="terms-consent-checkbox"
                className={hasScrolledToBottom ? 'cursor-pointer' : 'cursor-not-allowed'}
              >
                {t('consent.checkboxPrefix', { lng: language })}{' '}
              </label>
              <button
                type="button"
                onClick={() => setReaderDoc('terms')}
                className="inline-flex items-center gap-1 font-semibold text-[#0F5132] dark:text-emerald-400 underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] rounded px-0.5 py-1"
              >
                <span>{t('consent.termsLink', { lng: language })}</span>
                <ExternalLink className="w-3.5 h-3.5 inline shrink-0" />
              </button>{' '}
              <span>{t('consent.and', { lng: language })}</span>{' '}
              <button
                type="button"
                onClick={() => setReaderDoc('privacy')}
                className="inline-flex items-center gap-1 font-semibold text-[#0F5132] dark:text-emerald-400 underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] rounded px-0.5 py-1"
              >
                <span>{t('consent.privacyLink', { lng: language })}</span>
                <ExternalLink className="w-3.5 h-3.5 inline shrink-0" />
              </button>
            </div>
          </div>

          {!hasScrolledToBottom && (
            <p className={`text-xs text-slate-600 dark:text-slate-400 pl-9 ${isKm ? 'leading-[1.75]' : ''}`}>
              {t('consent.scrollRequiredNote', { lng: language })}
            </p>
          )}
        </div>

        {/* Separate Optional Anonymous Analytics Toggle (off by default) */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="terms-analytics-toggle"
              className="flex-1 min-w-0 cursor-pointer space-y-0.5"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block">
                {t('consent.analyticsOptionalTag', { lng: language })}
              </span>
              <span
                className={`text-xs sm:text-sm text-[#1F2937] dark:text-slate-200 block ${
                  isKm ? 'leading-[1.8]' : 'leading-snug'
                }`}
              >
                {t('consent.analyticsToggleLabel', { lng: language })}
              </span>
            </label>

            <button
              id="terms-analytics-toggle"
              type="button"
              role="switch"
              aria-checked={analyticsConsent}
              onClick={() => setAnalyticsConsent((prev) => !prev)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132] ${
                analyticsConsent
                  ? 'bg-[#0F5132]'
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
        </div>
      </main>

      {/* Sticky Safe-Area Bottom Action Bar */}
      <footer className="sticky bottom-0 z-20 shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row-reverse items-stretch sm:items-center gap-2.5">
          <button
            type="button"
            disabled={!checked || accepting}
            onClick={() => onAccept(language, analyticsConsent)}
            className="w-full sm:flex-1 min-h-[48px] rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white px-6 py-3 text-sm font-semibold disabled:opacity-45 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B544]"
          >
            {t('consent.acceptButton', { lng: language })}
          </button>

          <button
            type="button"
            disabled={accepting}
            onClick={() => setShowDeclineDialog(true)}
            className="w-full sm:w-auto min-h-[48px] rounded-xl px-5 py-3 text-sm font-semibold text-[#1F2937] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132]"
          >
            {t('consent.declineButton', { lng: language })}
          </button>
        </div>
      </footer>

      {readerDoc && (
        <TermsReader
          documentType={readerDoc}
          language={language}
          onClose={() => setReaderDoc(null)}
        />
      )}

      {showDeclineDialog && (
        <DeclineDialog
          language={language}
          onReviewTerms={() => setShowDeclineDialog(false)}
          onCloseApp={() => {
            setShowDeclineDialog(false);
            setIsClosedScreen(true);
          }}
        />
      )}
    </div>
  );
};
