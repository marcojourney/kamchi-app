import React from 'react';
import { AlertTriangle, Clock, KeyRound, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateLocalized } from '../lib/finance';
import { useLicenseContext } from './LicenseGate';

export const LicenseBanner: React.FC = () => {
  const { t, i18n } = useTranslation('license');
  const { licenseState, openActivationModal, removeLicense } = useLicenseContext();
  const lang = i18n.language.startsWith('km') ? 'km' : 'en';
  const isKm = lang === 'km';

  const hasClockWarning = licenseState.clockTampered;
  const hasLifecycleBanner =
    licenseState.status === 'expiring_soon' ||
    licenseState.status === 'grace' ||
    licenseState.status === 'read_only';

  if (!hasClockWarning && !hasLifecycleBanner) {
    return null;
  }

  const formattedExpiry = licenseState.expiryDateIso
    ? formatDateLocalized(licenseState.expiryDateIso, lang, false)
    : '';

  return (
    <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3 space-y-2">
      {hasClockWarning && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/35 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200"
        >
          <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className={`font-bold ${isKm ? 'leading-[1.65]' : ''}`}>
              {t('banners.clockTamperedTitle')}
            </p>
            <p className={isKm ? 'leading-[1.75]' : 'leading-relaxed'}>
              {t('banners.clockTamperedBody')}
            </p>
          </div>
        </div>
      )}

      {licenseState.status === 'expiring_soon' && (
        <div className="rounded-xl border border-[#F2B544] bg-[#F2B544]/12 dark:bg-[#F2B544]/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-[#1F2937] dark:text-amber-100">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#9A6700] dark:text-[#F2B544] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                {t('banners.expiringSoonTitle', { days: licenseState.daysRemaining ?? 0 })}
              </p>
              <p className={isKm ? 'leading-[1.75]' : ''}>
                {t('banners.expiringSoonBody', { date: formattedExpiry })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openActivationModal}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3E26] text-white px-3.5 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{t('banners.renewAction')}</span>
          </button>
        </div>
      )}

      {licenseState.status === 'grace' && (
        <div className="rounded-xl border border-orange-300 dark:border-orange-800/70 bg-orange-50 dark:bg-orange-950/35 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-orange-950 dark:text-orange-100">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                {t('banners.graceTitle', { days: licenseState.graceDaysRemaining ?? 0 })}
              </p>
              <p className={isKm ? 'leading-[1.75]' : ''}>
                {t('banners.graceBody', { date: formattedExpiry })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openActivationModal}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3E26] text-white px-3.5 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{t('banners.renewAction')}</span>
          </button>
        </div>
      )}

      {licenseState.status === 'read_only' && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/35 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-950 dark:text-red-100"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">{t('banners.readOnlyTitle')}</p>
              <p className={isKm ? 'leading-[1.75]' : 'leading-relaxed'}>
                {t('banners.readOnlyBody')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => removeLicense()}
              className="min-h-[40px] rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap"
            >
              {t('banners.switchToFreeAction')}
            </button>
            <button
              type="button"
              onClick={openActivationModal}
              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3E26] text-white px-3.5 text-xs font-semibold whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{t('banners.renewAction')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
