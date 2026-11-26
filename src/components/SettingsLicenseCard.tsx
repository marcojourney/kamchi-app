import React, { useState } from 'react';
import { Check, Copy, Info, KeyRound, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_FREE_ACTIVE_LOANS, SELLER_TELEGRAM_USERNAME } from '../config/license';
import { useApp } from '../context/AppContext';
import { formatDateLocalized } from '../lib/finance';
import { useLicenseContext } from './LicenseGate';

interface SettingsLicenseCardProps {
  onToast?: (message: string) => void;
}

export const SettingsLicenseCard: React.FC<SettingsLicenseCardProps> = ({ onToast }) => {
  const { t, i18n } = useTranslation('license');
  const { loans, profile } = useApp();
  const { licenseState, deviceCode, openActivationModal, removeLicense } = useLicenseContext();

  const lang = i18n.language.startsWith('km') ? 'km' : 'en';
  const isKm = lang === 'km';
  const useKh = Boolean(profile?.useKhmerNumerals);

  const [copiedCode, setCopiedCode] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const activeLoansCount = loans.filter((l) => l.status === 'active').length;
  const hasLicenseKey = Boolean(licenseState.keyIdHex);

  const getStatusLabel = () => {
    switch (licenseState.status) {
      case 'active':
        return t('settings.statusActive');
      case 'expiring_soon':
        return t('settings.statusExpiringSoon');
      case 'grace':
        return t('settings.statusGrace');
      case 'read_only':
        return t('settings.statusReadOnly');
      case 'free':
        return t('settings.statusFree');
    }
  };

  const getStatusColor = () => {
    switch (licenseState.status) {
      case 'active':
        return 'text-[#0F5132] dark:text-emerald-400';
      case 'expiring_soon':
        return 'text-[#9A6700] dark:text-[#F2B544]';
      case 'grace':
        return 'text-orange-600 dark:text-orange-400';
      case 'read_only':
        return 'text-red-600 dark:text-red-400';
      case 'free':
        return 'text-slate-600 dark:text-slate-300';
    }
  };

  const displayPlanName = licenseState.licensedPlan
    ? t(`plans.${licenseState.licensedPlan}`)
    : t('plans.free');

  const telegramMessage = t('activation.telegramPrefill', {
    plan: t('plans.pro'),
    deviceCode,
  });
  const telegramUrl = `https://t.me/${encodeURIComponent(SELLER_TELEGRAM_USERNAME)}?text=${encodeURIComponent(
    telegramMessage
  )}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(deviceCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <>
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0F5132] dark:text-emerald-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.cardTitle')}
            </h2>
          </div>

          <span className={`text-xs font-semibold ${getStatusColor()}`}>
            {displayPlanName} · {getStatusLabel()}
          </span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-3.5 text-xs">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('settings.expiryDate')}</dt>
            <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {licenseState.expiryDateIso
                ? formatDateLocalized(licenseState.expiryDateIso, lang, useKh)
                : t('settings.noExpiry')}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('settings.daysRemaining')}</dt>
            <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {licenseState.status === 'grace'
                ? `${t('settings.daysValue', { count: licenseState.graceDaysRemaining ?? 0 })} (${t('settings.statusGrace')})`
                : licenseState.daysRemaining !== null
                ? t('settings.daysValue', { count: licenseState.daysRemaining })
                : '—'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('settings.activeLoansUsage')}</dt>
            <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {licenseState.plan === 'free'
                ? t('settings.usageFreeLimit', {
                    count: activeLoansCount,
                    max: MAX_FREE_ACTIVE_LOANS,
                  })
                : t('settings.usageUnlimited', { count: activeLoansCount })}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('settings.deviceCode')}</dt>
            <dd className="flex items-center gap-2 mt-0.5">
              <span className="font-mono font-bold text-[#0F5132] dark:text-emerald-400 select-all">
                {deviceCode}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-[#0F5132] dark:hover:text-emerald-400"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? t('activation.copied') : t('activation.copyCode')}</span>
              </button>
            </dd>
          </div>

          {hasLicenseKey && (
            <div className="sm:col-span-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">{t('settings.maskedKey')}</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300">
                {licenseState.keyIdHex} · {licenseState.maskedKey}
              </dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openActivationModal}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] px-4 py-2 text-xs font-semibold text-white transition-colors"
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>{t('settings.enterNewKey')}</span>
          </button>

          <a
            href={telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Send className="w-3.5 h-3.5 text-sky-600" />
            <span>{t('activation.sendTelegram')}</span>
          </a>

          {hasLicenseKey && (
            <button
              type="button"
              onClick={() => setConfirmRemoveOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/50 px-3.5 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('settings.removeLicense')}</span>
            </button>
          )}
        </div>

        <div className="rounded-xl bg-[#F8FAF7] dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-3 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 text-[#9A6700] dark:text-[#F2B544] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {t('activation.newPhoneTitle')}
            </p>
            <p className={isKm ? 'leading-[1.8]' : 'leading-relaxed'}>
              {t('activation.newPhoneDesc')}
            </p>
          </div>
        </div>
      </section>

      {confirmRemoveOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-license-title"
          className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3
              id="remove-license-title"
              className={`text-base font-bold text-slate-900 dark:text-slate-100 ${
                isKm ? 'leading-[1.65]' : ''
              }`}
            >
              {t('settings.removeConfirmTitle')}
            </h3>
            <p className={`text-xs text-slate-600 dark:text-slate-300 ${isKm ? 'leading-[1.8]' : 'leading-relaxed'}`}>
              {t('settings.removeConfirmDesc', { maxLoans: MAX_FREE_ACTIVE_LOANS })}
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmRemoveOpen(false)}
                className="min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                {t('settings.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await removeLicense();
                  setConfirmRemoveOpen(false);
                  onToast?.(t('settings.removedToast'));
                }}
                className="min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold text-white"
              >
                {t('settings.removeConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
