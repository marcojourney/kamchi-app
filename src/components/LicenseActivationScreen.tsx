import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  FileUp,
  Info,
  KeyRound,
  QrCode,
  Send,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_FREE_ACTIVE_LOANS, SELLER_TELEGRAM_USERNAME } from '../config/license';
import { extractLicenseKeyFromText, type LicensePlanId } from '../lib/licenseKey';
import type { LicenseSnapshot } from '../lib/licenseStorage';
import type { AppLanguage } from '../types/loan';
import { QrScannerModal } from './QrScannerModal';

interface LicenseActivationScreenProps {
  mode: 'onboarding' | 'modal';
  deviceCode: string;
  storageUnavailable?: boolean;
  onActivate: (rawKey: string) => Promise<{
    ok: boolean;
    error?: string;
    snapshot?: LicenseSnapshot;
  }>;
  onContinueFree?: () => Promise<void>;
  onClose?: () => void;
}

export const LicenseActivationScreen: React.FC<LicenseActivationScreenProps> = ({
  mode,
  deviceCode,
  storageUnavailable = false,
  onActivate,
  onContinueFree,
  onClose,
}) => {
  const { t, i18n } = useTranslation('license');
  const language: AppLanguage = i18n.language.startsWith('km') ? 'km' : 'en';
  const isKm = language === 'km';

  const [selectedPlanToBuy, setSelectedPlanToBuy] = useState<LicensePlanId>('pro');
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copiedDeviceCode, setCopiedDeviceCode] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [activatedSnapshot, setActivatedSnapshot] = useState<LicenseSnapshot | null>(null);

  const handleLanguageSwitch = (nextLang: AppLanguage) => {
    if (nextLang === language) return;
    i18n.changeLanguage(nextLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLang;
    }
  };

  const mapErrorToMessage = (code: string): string => {
    switch (code) {
      case 'empty_key':
        return t('errors.emptyKey', { lng: language });
      case 'invalid_format':
        return t('errors.invalidFormat', { lng: language });
      case 'checksum_failed':
        return t('errors.checksumFailed', { lng: language });
      case 'unsupported_version':
        return t('errors.unsupportedVersion', { lng: language });
      case 'invalid_signature':
        return t('errors.invalidSignature', { lng: language });
      case 'wrong_device':
        return t('errors.wrongDevice', { lng: language });
      case 'expired_key':
        return t('errors.expiredKey', { lng: language });
      case 'file_read_failed':
        return t('errors.fileReadFailed', { lng: language });
      default:
        return t('errors.invalidFormat', { lng: language });
    }
  };

  const handleCopyDeviceCode = async () => {
    try {
      await navigator.clipboard?.writeText(deviceCode);
      setCopiedDeviceCode(true);
      setTimeout(() => setCopiedDeviceCode(false), 2000);
    } catch {
      // Ignore clipboard failures on restricted contexts
    }
  };

  const handlePaste = async () => {
    setErrorCode(null);
    try {
      const clip = await navigator.clipboard?.readText();
      if (clip) {
        setKeyInput(extractLicenseKeyFromText(clip));
      }
    } catch {
      // Clipboard read permission denied; user can paste directly into textarea
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorCode(null);
    try {
      const content = await file.text();
      setKeyInput(extractLicenseKeyFromText(content));
    } catch {
      setErrorCode('file_read_failed');
    }
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = extractLicenseKeyFromText(keyInput);
    if (!cleaned.trim()) {
      setErrorCode('empty_key');
      return;
    }
    setBusy(true);
    setErrorCode(null);
    try {
      const res = await onActivate(cleaned);
      if (res.ok && res.snapshot) {
        setActivatedSnapshot(res.snapshot);
      } else {
        setErrorCode(res.error || 'invalid_format');
      }
    } finally {
      setBusy(false);
    }
  };

  const planLabel = t(`plans.${selectedPlanToBuy}`, { lng: language });
  const telegramMessage = t('activation.telegramPrefill', {
    lng: language,
    plan: planLabel,
    deviceCode,
  });
  const telegramUrl = `https://t.me/${encodeURIComponent(SELLER_TELEGRAM_USERNAME)}?text=${encodeURIComponent(
    telegramMessage
  )}`;

  const successBody = activatedSnapshot ? (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-[#0F5132]/30 dark:border-emerald-700/60 p-5 sm:p-6 space-y-5 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-[#0F5132]/10 dark:bg-emerald-950/60 text-[#0F5132] dark:text-emerald-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h2
            className={`text-lg font-bold text-[#0F5132] dark:text-emerald-400 ${
              isKm ? 'leading-[1.65]' : ''
            }`}
          >
            {t('activation.successTitle', { lng: language })}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('brand.name', { lng: language })}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">
            {t('activation.summaryPlan', { lng: language })}
          </dt>
          <dd className="font-bold text-[#1F2937] dark:text-slate-100">
            {t(`plans.${activatedSnapshot.state.licensedPlan || 'pro'}`, { lng: language })}
          </dd>
        </div>

        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">
            {t('activation.summaryBilling', { lng: language })}
          </dt>
          <dd className="font-semibold text-[#1F2937] dark:text-slate-100">
            {activatedSnapshot.state.billing
              ? t(`billing.${activatedSnapshot.state.billing}`, { lng: language })
              : '—'}
          </dd>
        </div>

        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">
            {t('activation.summaryExpiry', { lng: language })}
          </dt>
          <dd className="font-mono font-semibold text-[#1F2937] dark:text-slate-100 tabular-nums">
            {activatedSnapshot.state.expiryDateIso ||
              t('activation.summaryLifetime', { lng: language })}
          </dd>
        </div>

        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">
            {t('activation.summaryBinding', { lng: language })}
          </dt>
          <dd className="font-medium text-[#1F2937] dark:text-slate-100">
            {activatedSnapshot.state.isBoundToDevice
              ? t('activation.bindingDevice', { lng: language })
              : t('activation.bindingUnbound', { lng: language })}
          </dd>
        </div>

        <div className="py-2.5 flex items-center justify-between gap-3">
          <dt className="text-slate-500 dark:text-slate-400">
            {t('activation.summaryKeyId', { lng: language })}
          </dt>
          <dd className="font-mono text-xs text-slate-600 dark:text-slate-300">
            {activatedSnapshot.state.keyIdHex} · {activatedSnapshot.state.maskedKey}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => {
          onClose?.();
        }}
        className="w-full min-h-[48px] rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold transition-colors"
      >
        {t('activation.successContinue', { lng: language })}
      </button>
    </div>
  ) : null;

  const mainContent = (
    <div className="space-y-4">
      {storageUnavailable && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/70 bg-amber-50 dark:bg-amber-950/35 px-3.5 py-3 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200"
        >
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className={isKm ? 'leading-[1.8]' : 'leading-relaxed'}>
            {t('errors.storageUnavailable', { lng: language })}
          </p>
        </div>
      )}

      {activatedSnapshot ? (
        successBody
      ) : (
        <>
          {/* Device Code Card + Telegram Seller Link */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t('activation.deviceCodeLabel', { lng: language })}
                </p>
                <p
                  data-testid="device-code-value"
                  className="text-xl sm:text-2xl font-mono font-bold tracking-wider text-[#0F5132] dark:text-emerald-400 tabular-nums select-all"
                >
                  {deviceCode}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyDeviceCode}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 text-xs font-semibold text-[#1F2937] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {copiedDeviceCode ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-[#0F5132] dark:text-emerald-400" />
                )}
                <span>
                  {copiedDeviceCode
                    ? t('activation.copied', { lng: language })
                    : t('activation.copyCode', { lng: language })}
                </span>
              </button>
            </div>

            <p className={`text-xs text-slate-600 dark:text-slate-300 ${isKm ? 'leading-[1.8]' : 'leading-relaxed'}`}>
              {t('activation.deviceCodeHint', { lng: language })}
            </p>

            <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div
                role="group"
                aria-label={t('activation.planSelectLabel', { lng: language })}
                className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 sm:w-44 shrink-0"
              >
                {(['pro', 'business'] as LicensePlanId[]).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setSelectedPlanToBuy(plan)}
                    className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      selectedPlanToBuy === plan
                        ? 'bg-[#0F5132] text-white shadow-xs'
                        : 'text-[#1F2937] dark:text-slate-200'
                    }`}
                  >
                    {t(`plans.${plan}`, { lng: language })}
                  </button>
                ))}
              </div>

              <a
                href={telegramUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 dark:border-sky-800/70 bg-sky-50 dark:bg-sky-950/30 px-4 py-2 text-xs font-semibold text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-950/50 transition-colors"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>{t('activation.sendTelegram', { lng: language })}</span>
              </a>
            </div>
          </section>

          {/* Key Entry Card: Paste, Scan QR, Import .kamchi-license */}
          <form
            onSubmit={handleActivateSubmit}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#0F5132] dark:text-emerald-400 shrink-0" />
              <label
                htmlFor="kamchi-license-key-input"
                className="text-sm font-bold text-[#1F2937] dark:text-slate-100"
              >
                {t('activation.keyInputLabel', { lng: language })}
              </label>
            </div>

            <textarea
              id="kamchi-license-key-input"
              rows={3}
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                if (errorCode) setErrorCode(null);
              }}
              placeholder={t('activation.keyPlaceholder', { lng: language })}
              spellCheck={false}
              autoCapitalize="characters"
              autoCorrect="off"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs sm:text-sm font-mono text-[#1F2937] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handlePaste}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-semibold text-[#1F2937] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <ClipboardPaste className="w-4 h-4 text-[#0F5132] dark:text-emerald-400 shrink-0" />
                <span>{t('activation.pasteButton', { lng: language })}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorCode(null);
                  setQrOpen(true);
                }}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-semibold text-[#1F2937] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <QrCode className="w-4 h-4 text-[#0F5132] dark:text-emerald-400 shrink-0" />
                <span>{t('activation.scanQrButton', { lng: language })}</span>
              </button>

              <label className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-xs font-semibold text-[#1F2937] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                <FileUp className="w-4 h-4 text-[#0F5132] dark:text-emerald-400 shrink-0" />
                <span>{t('activation.importFileButton', { lng: language })}</span>
                <input
                  type="file"
                  accept=".kamchi-license,.txt,text/plain"
                  className="hidden"
                  onChange={handleFileImport}
                />
              </label>
            </div>

            {errorCode && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/35 px-3.5 py-2.5 flex items-start gap-2 text-xs text-red-700 dark:text-red-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className={isKm ? 'leading-[1.8]' : ''}>{mapErrorToMessage(errorCode)}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[48px] rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B544]"
            >
              {busy
                ? t('activation.activating', { lng: language })
                : t('activation.activateButton', { lng: language })}
            </button>
          </form>

          {/* Moving to a new phone explanation */}
          <section className="rounded-2xl bg-[#F2B544]/12 dark:bg-[#F2B544]/10 border border-[#F2B544]/40 p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-[#9A6700] dark:text-[#F2B544] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className={`text-xs font-bold text-[#1F2937] dark:text-[#F2B544] ${isKm ? 'leading-[1.7]' : ''}`}>
                {t('activation.newPhoneTitle', { lng: language })}
              </h3>
              <p className={`text-xs text-slate-700 dark:text-slate-300 ${isKm ? 'leading-[1.85]' : 'leading-relaxed'}`}>
                {t('activation.newPhoneDesc', { lng: language })}
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );

  if (mode === 'modal') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="license-modal-title"
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        style={{
          fontFamily: isKm
            ? '"Kantumruy Pro", "Inter", sans-serif'
            : '"Inter", "Kantumruy Pro", sans-serif',
        }}
      >
        <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-[#F8FAF7] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 max-h-[92dvh] overflow-y-auto space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#0F5132] dark:text-emerald-400">
                {t('activation.badge', { lng: language })}
              </p>
              <h2
                id="license-modal-title"
                className={`text-lg font-bold text-[#1F2937] dark:text-slate-100 ${
                  isKm ? 'leading-[1.65]' : ''
                }`}
              >
                {t('activation.title', { lng: language })}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('activation.closeModal', { lng: language })}
              className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {mainContent}
        </div>

        {qrOpen && (
          <QrScannerModal
            onDetected={(detectedKey) => {
              setKeyInput(detectedKey);
              setQrOpen(false);
            }}
            onClose={() => setQrOpen(false)}
          />
        )}
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

          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => handleLanguageSwitch('en')}
              aria-pressed={language === 'en'}
              className={`min-h-[40px] min-w-[48px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                language === 'en'
                  ? 'bg-[#0F5132] text-white shadow-xs'
                  : 'text-[#1F2937] dark:text-slate-200'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch('km')}
              aria-pressed={language === 'km'}
              className={`min-h-[40px] min-w-[48px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                language === 'km'
                  ? 'bg-[#0F5132] text-white shadow-xs'
                  : 'text-[#1F2937] dark:text-slate-200'
              }`}
            >
              ភាសាខ្មែរ
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#0F5132] dark:text-emerald-400">
            {t('activation.badge', { lng: language })}
          </p>
          <h1
            className={`text-xl sm:text-2xl font-bold text-[#0F5132] dark:text-emerald-400 ${
              isKm ? 'leading-[1.7]' : 'leading-tight'
            }`}
          >
            {t('activation.title', { lng: language })}
          </h1>
          <p className={`text-sm text-slate-600 dark:text-slate-300 ${isKm ? 'leading-[1.8]' : ''}`}>
            {t('activation.subtitle', { lng: language })}
          </p>
        </div>

        {mainContent}
      </main>

      {!activatedSnapshot && onContinueFree && (
        <footer className="sticky bottom-0 z-20 shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 sm:px-6 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto space-y-2 text-center">
            <button
              type="button"
              onClick={() => onContinueFree()}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-[#1F2937] dark:text-slate-100 transition-colors"
            >
              {t('activation.continueFreeButton', { lng: language })}
            </button>
            <p className={`text-xs text-slate-500 dark:text-slate-400 ${isKm ? 'leading-[1.7]' : ''}`}>
              {t('activation.continueFreeNote', {
                lng: language,
                maxLoans: MAX_FREE_ACTIVE_LOANS,
              })}
            </p>
          </div>
        </footer>
      )}

      {qrOpen && (
        <QrScannerModal
          onDetected={(detectedKey) => {
            setKeyInput(detectedKey);
            setQrOpen(false);
          }}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
};
