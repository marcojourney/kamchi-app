import React, { useEffect, useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TERMS_CONTACT, TERMS_VERSION } from '../config/terms';
import type { AppLanguage } from '../types/loan';

export type LegalDocumentType = 'terms' | 'privacy';

interface LegalSection {
  id: string;
  title: string;
  body: string[];
}

interface TermsReaderProps {
  documentType: LegalDocumentType;
  language: AppLanguage;
  onClose: () => void;
}

export const TermsReader: React.FC<TermsReaderProps> = ({
  documentType,
  language,
  onClose,
}) => {
  const { t } = useTranslation('terms');
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isKm = language === 'km';
  const sectionsRaw = t(
    documentType === 'terms' ? 'termsSections' : 'privacySections',
    {
      returnObjects: true,
      lng: language,
      telegram: TERMS_CONTACT.telegramHandle,
      email: TERMS_CONTACT.email,
    }
  );
  const sections: LegalSection[] = Array.isArray(sectionsRaw)
    ? (sectionsRaw as LegalSection[])
    : [];

  const title =
    documentType === 'terms'
      ? t('reader.termsTitle', { lng: language })
      : t('reader.privacyTitle', { lng: language });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-reader-title"
      className="fixed inset-0 z-[70] flex flex-col bg-[#F8FAF7] text-[#1F2937] dark:bg-[#0B120F] dark:text-slate-100"
      style={{
        fontFamily: isKm
          ? '"Kantumruy Pro", "Inter", sans-serif'
          : '"Inter", "Kantumruy Pro", sans-serif',
      }}
    >
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0F5132]/10 dark:bg-emerald-500/15 text-[#0F5132] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="terms-reader-title"
                className={`text-base sm:text-lg font-bold text-[#1F2937] dark:text-slate-100 truncate ${
                  isKm ? 'leading-[1.7]' : ''
                }`}
              >
                {title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t('reader.versionLabel', { lng: language, version: TERMS_VERSION })}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('reader.close', { lng: language })}
            className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-[#1F2937] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F5132]"
          >
            <X className="w-4 h-4" />
            <span>{t('reader.close', { lng: language })}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Placeholder legal warning banner — remove once reviewed by a Cambodian lawyer */}
          <div className="rounded-xl border border-[#F2B544]/60 bg-[#F2B544]/15 dark:bg-[#F2B544]/10 px-4 py-3 text-xs font-medium text-[#1F2937] dark:text-amber-100">
            <p className={isKm ? 'leading-[1.85]' : 'leading-relaxed'}>
              {t('reader.placeholderNotice', { lng: language })}
            </p>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {sections.map((section) => (
              <section key={section.id} className="p-4 sm:p-5 space-y-2">
                <h3
                  className={`text-sm sm:text-base font-bold text-[#0F5132] dark:text-emerald-400 ${
                    isKm ? 'leading-[1.8]' : 'leading-snug'
                  }`}
                >
                  {section.title}
                </h3>
                <div className="space-y-2 text-sm text-[#1F2937] dark:text-slate-200">
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
        </div>
      </div>
    </div>
  );
};
