import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Plus, QrCode, Store, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { QrScannerModal } from '../../../components/QrScannerModal';
import { useLicenseContext } from '../../../components/LicenseGate';
import { FREE_INSTALLMENT_LIMIT } from '../../../config/featureAccess';
import { canCreateInstallmentLoan } from '../../../lib/entitlements';
import { useBusinessProfile } from '../hooks/useBusinessProfile';

export const SAMPLE_MARKETCHAIN_QR_ORDER = {
  source: 'marketchain',
  invoiceId: 'MC-2026-0842',
  item: 'Samsung Galaxy A55 5G',
  customerName: 'Lukas Meyer',
  phone: '012 345 678',
  currency: 'USD',
  total: 480,
  downPayment: 100,
  installments: 6,
} as const;

export const SAMPLE_MARKETCHAIN_QR_PAYLOAD = JSON.stringify(SAMPLE_MARKETCHAIN_QR_ORDER);

interface ParsedMarketChainPayload {
  invoiceId?: string;
  item?: string;
  customerName?: string;
  phone?: string;
  currency?: string;
  total?: number;
  downPayment?: number;
  installments?: number;
}

function tryParseMarketChainPayload(raw: string): ParsedMarketChainPayload | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      typeof parsed.item === 'string' ||
      typeof parsed.invoiceId === 'string' ||
      typeof parsed.total === 'number'
    ) {
      return {
        invoiceId: typeof parsed.invoiceId === 'string' ? parsed.invoiceId : undefined,
        item: typeof parsed.item === 'string' ? parsed.item : undefined,
        customerName:
          typeof parsed.customerName === 'string' ? parsed.customerName : undefined,
        phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
        currency: typeof parsed.currency === 'string' ? parsed.currency : undefined,
        total: typeof parsed.total === 'number' ? parsed.total : undefined,
        downPayment:
          typeof parsed.downPayment === 'number' ? parsed.downPayment : undefined,
        installments:
          typeof parsed.installments === 'number' ? parsed.installments : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

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
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [sampleQrDataUrl, setSampleQrDataUrl] = useState<string>('');
  const [scannedPayload, setScannedPayload] = useState<string>('');

  const [formOpen, setFormOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [installmentCount, setInstallmentCount] = useState(
    String(defaults.installment.defaultInstallments)
  );
  const [previewBanner, setPreviewBanner] = useState('');

  useEffect(() => {
    if (!sampleModalOpen || sampleQrDataUrl) return;
    let active = true;
    void QRCode.toDataURL(SAMPLE_MARKETCHAIN_QR_PAYLOAD, {
      width: 280,
      margin: 3,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    }).then((url) => {
      if (active) setSampleQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [sampleModalOpen, sampleQrDataUrl]);

  const parsedOrder = useMemo(
    () => (scannedPayload ? tryParseMarketChainPayload(scannedPayload) : null),
    [scannedPayload]
  );

  const applyScannedOrder = (raw: string) => {
    setScannedPayload(raw);
    const parsed = tryParseMarketChainPayload(raw);
    if (parsed) {
      if (parsed.item) setItemName(parsed.item);
      if (parsed.customerName) setCustomerName(parsed.customerName);
      if (parsed.phone) setCustomerPhone(parsed.phone);
      if (parsed.total !== undefined) setTotalPrice(String(parsed.total));
      if (parsed.downPayment !== undefined) setDownPayment(String(parsed.downPayment));
      if (parsed.installments !== undefined) {
        setInstallmentCount(String(parsed.installments));
      }
      setFormOpen(true);
    }
  };

  const handleRequestNewInstallment = () => {
    const check = canCreateInstallmentLoan(licenseState, activeInstallmentCount);
    if (!check.allowed && check.blockReason) {
      openUpgradePrompt(check.blockReason);
      return;
    }
    setFormOpen(true);
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
          <button
            type="button"
            onClick={() => setSampleModalOpen(true)}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <QrCode className="w-4 h-4 text-teal-600" />
            <span>{t('installmentsShell.sampleQrButton')}</span>
          </button>

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
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-bold text-teal-900 dark:text-teal-200">
                {t('installmentsShell.qrParsedTitle')}
              </p>
              {parsedOrder ? (
                <div className="text-xs text-slate-800 dark:text-slate-200 space-y-0.5">
                  <p className="font-semibold">
                    {parsedOrder.item}
                    {parsedOrder.invoiceId ? ` · #${parsedOrder.invoiceId}` : ''}
                  </p>
                  <p>
                    {[parsedOrder.customerName, parsedOrder.phone].filter(Boolean).join(' · ')}
                  </p>
                  <p className="font-mono tabular-nums">
                    {parsedOrder.total} {parsedOrder.currency || 'USD'} · Down:{' '}
                    {parsedOrder.downPayment ?? 0} · {parsedOrder.installments ?? 6}x
                  </p>
                </div>
              ) : (
                <p className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                  {scannedPayload}
                </p>
              )}
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

      {formOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPreviewBanner(t('installmentsShell.previewReady'));
          }}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t('installmentsShell.formTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('installmentsShell.formSubtitle')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 px-3 text-xs font-semibold text-teal-700 dark:text-teal-300"
              >
                <QrCode className="w-4 h-4" />
                <span>{t('installmentsShell.scanQrCta')}</span>
              </button>

              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {previewBanner && (
            <p className="rounded-xl bg-teal-600 text-white px-3.5 py-2 text-xs font-semibold">
              {previewBanner} · {itemName || 'Item'} ({installmentCount}x)
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('installmentsShell.itemLabel')}
              </label>
              <input
                type="text"
                required
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Samsung Galaxy A55 5G"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('installmentsShell.customerLabel')}
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Lukas Meyer"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('installmentsShell.phoneLabel')}
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="012 345 678"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('installmentsShell.totalLabel')}
              </label>
              <input
                type="number"
                min={0}
                step="any"
                required
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
                placeholder="480"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('installmentsShell.downPaymentLabel')}
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                placeholder="100"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('installmentsShell.installmentsLabel')}
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={installmentCount}
                onChange={(e) => setInstallmentCount(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {t('settingsBusiness.switchDialog.cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-5 text-xs font-semibold"
            >
              {t('installmentsShell.newPlan')}
            </button>
          </div>
        </form>
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
          mode="any"
          title={t('installmentsShell.importTitle')}
          subtitle={t('installmentsShell.importSubtitle')}
          onDetected={(raw) => {
            applyScannedOrder(raw);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {sampleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sample-qr-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        >
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="sample-qr-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {t('installmentsShell.sampleQrTitle')}
                </h2>
                <p
                  className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${
                    isKm ? 'leading-[1.7]' : ''
                  }`}
                >
                  {t('installmentsShell.sampleQrDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSampleModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 border border-slate-200">
              {sampleQrDataUrl ? (
                <img
                  src={sampleQrDataUrl}
                  alt={t('installmentsShell.sampleQrTitle')}
                  className="w-56 h-56 object-contain"
                />
              ) : (
                <div className="w-56 h-56 animate-pulse rounded-xl bg-slate-100" />
              )}
              <p className="text-[11px] font-mono text-slate-600 mt-2 text-center">
                {SAMPLE_MARKETCHAIN_QR_ORDER.invoiceId} · {SAMPLE_MARKETCHAIN_QR_ORDER.item} · $
                {SAMPLE_MARKETCHAIN_QR_ORDER.total}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {sampleQrDataUrl && (
                <a
                  href={sampleQrDataUrl}
                  download="marketchain-test-qr.png"
                  className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-4 h-4 text-teal-600" />
                  <span>{t('installmentsShell.downloadTestQr')}</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  applyScannedOrder(SAMPLE_MARKETCHAIN_QR_PAYLOAD);
                  setSampleModalOpen(false);
                }}
                className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('installmentsShell.useSampleNow')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
