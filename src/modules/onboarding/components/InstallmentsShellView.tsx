import React, { useState } from 'react';
import { CheckCircle2, Plus, QrCode, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QrScannerModal } from '../../../components/QrScannerModal';
import { useLicenseContext } from '../../../components/LicenseGate';
import { FREE_INSTALLMENT_LIMIT } from '../../../config/featureAccess';
import { canCreateInstallmentLoan } from '../../../lib/entitlements';
import { useBusinessProfile } from '../hooks/useBusinessProfile';

interface InstallmentsShellViewProps {
  mode: 'installments' | 'marketchain_import';
  activeInstallmentCount?: number;
  onOpenImportTab: () => void;
  onOpenInstallmentsTab: () => void;
}

export const InstallmentsShellView: React.FC<InstallmentsShellViewProps> = ({
  mode,
  activeInstallmentCount = 0,
  onOpenImportTab,
  onOpenInstallmentsTab,
}) => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');
  const { defaults } = useBusinessProfile();
  const { licenseState, openUpgradePrompt } = useLicenseContext();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedPayload, setScannedPayload] = useState<string>('');

  const handleRequestNewInstallment = () => {
    const check = canCreateInstallmentLoan(licenseState, activeInstallmentCount);
    if (!check.allowed && check.blockReason) {
      openUpgradePrompt(check.blockReason);
      return;
    }
    setScannerOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {mode === 'marketchain_import'
              ? t('installmentsShell.importTitle')
              : t('installmentsShell.title')}
          </h1>
          <p
            className={`text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 ${
              isKm ? 'leading-[1.7]' : ''
            }`}
          >
            {mode === 'marketchain_import'
              ? t('installmentsShell.importSubtitle')
              : t('installmentsShell.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode !== 'marketchain_import' ? (
            <>
              <button
                type="button"
                onClick={onOpenImportTab}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <QrCode className="w-4 h-4 text-teal-600" />
                <span>{t('installmentsShell.importQrButton')}</span>
              </button>

              <button
                type="button"
                onClick={handleRequestNewInstallment}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 text-xs font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{t('installmentsShell.newPlan')}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 text-xs font-semibold transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span>{t('installmentsShell.scanQrCta')}</span>
            </button>
          )}
        </div>
      </div>

      {licenseState.plan === 'free' && (
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('installmentsShell.activeUsage', {
            count: activeInstallmentCount,
            max: FREE_INSTALLMENT_LIMIT,
          })}
        </p>
      )}

      {scannedPayload && (
        <div className="rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/35 p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-bold text-teal-900 dark:text-teal-200">
                {t('installmentsShell.qrParsedTitle')}
              </p>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                {scannedPayload}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setScannedPayload('')}
            className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0"
          >
            {t('installmentsShell.clearScan')}
          </button>
        </div>
      )}

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
        <div className="h-11 w-11 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
          {mode === 'marketchain_import' ? (
            <QrCode className="w-5 h-5" />
          ) : (
            <Store className="w-5 h-5" />
          )}
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          {t('installmentsShell.readyTitle')}
        </h2>
        <p
          className={`text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl ${
            isKm ? 'leading-[1.75]' : 'leading-relaxed'
          }`}
        >
          {t('installmentsShell.readyDesc', {
            down: defaults.installment.minDownPaymentPercent,
            count: defaults.installment.defaultInstallments,
            step: defaults.installment.khrRoundingStep.toLocaleString(),
          })}
        </p>

        {mode === 'marketchain_import' && (
          <div className="pt-1">
            <button
              type="button"
              onClick={onOpenInstallmentsTab}
              className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {t('installmentsShell.title')}
            </button>
          </div>
        )}
      </div>

      {scannerOpen && (
        <QrScannerModal
          onDetected={(raw) => {
            setScannedPayload(raw);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
};
