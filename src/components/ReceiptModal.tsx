import React, { useRef, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDateLocalized, getPaymentMethodLabelKey } from '../lib/finance';
import { renderElementToPng } from '../lib/pdfExport';
import type { Payment } from '../types/loan';

interface ReceiptModalProps {
  payment: Payment;
  remainingBalance: number;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  payment,
  remainingBalance,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const { profile } = useApp();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);

  const exportPng = async (share: boolean) => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await renderElementToPng(cardRef.current);
      if (share && navigator.share) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `receipt-${payment.id}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: t('payment.receiptTitle'),
            files: [file],
          });
          setBusy(false);
          return;
        }
      }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `receipt-${payment.id}.png`;
      a.click();
    } catch (err) {
      console.error('Receipt export error:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('payment.receiptTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          ref={cardRef}
          className="rounded-xl border border-slate-200 bg-white text-slate-900 p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              {profile?.lenderLogoDataUrl &&
                profile.lenderLogoDataUrl.startsWith('data:image/') && (
                  <img
                    src={profile.lenderLogoDataUrl}
                    alt={profile.displayName || t('app.name')}
                    className="h-11 w-auto max-w-[96px] object-contain shrink-0"
                  />
                )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {profile?.displayName || t('app.name')}
                </p>
                {profile?.lenderPhone && (
                  <p className="text-xs font-mono text-slate-600">{profile.lenderPhone}</p>
                )}
                <p className="text-[11px] text-slate-500">{t('payment.receiptTitle')}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-slate-500">{t('payment.receiptNo')}</p>
              <p className="text-xs font-mono font-semibold text-slate-800">
                {payment.id.slice(0, 12).toUpperCase()}
              </p>
            </div>
          </div>

          <div className="text-center py-2">
            <p className="text-xs text-slate-500">{t('payment.amount')}</p>
            <p className="text-2xl font-mono font-bold text-teal-700 tabular-nums mt-0.5">
              {formatCurrency(payment.amount, payment.currency, lang, useKh)}
            </p>
          </div>

          <div className="space-y-2 text-xs border-t border-b border-slate-100 py-3">
            <div className="flex justify-between">
              <span className="text-slate-500">{t('loans.selectBorrower')}</span>
              <span className="font-semibold text-slate-900">{payment.borrowerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t('payment.date')}</span>
              <span className="font-mono tabular-nums">
                {formatDateLocalized(payment.paymentDate, lang, useKh)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t('payment.method')}</span>
              <span className="font-medium">{t(getPaymentMethodLabelKey(payment.method))}</span>
            </div>
            {payment.referenceNo && (
              <div className="flex justify-between">
                <span className="text-slate-500">{t('payment.reference')}</span>
                <span className="font-mono">{payment.referenceNo}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-100">
              <span className="text-slate-500">{t('payment.principal')}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(payment.principalPortion, payment.currency, lang, useKh)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t('payment.interest')}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(payment.interestPortion, payment.currency, lang, useKh)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t('payment.penalty')}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(payment.penaltyPortion, payment.currency, lang, useKh)}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="font-medium text-slate-600">{t('payment.remainingAfter')}</span>
            <span className="text-sm font-mono font-bold text-slate-900 tabular-nums">
              {formatCurrency(remainingBalance, payment.currency, lang, useKh)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => exportPng(false)}
            className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{t('payment.downloadImage')}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => exportPng(true)}
            className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>{t('payment.shareReceipt')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
