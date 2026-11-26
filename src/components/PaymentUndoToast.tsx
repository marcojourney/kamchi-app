import React, { useState } from 'react';
import { CheckCircle2, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { useNotifications } from '../context/NotificationContext';
import { formatCurrency } from '../lib/finance';

export const PaymentUndoToast: React.FC = () => {
  const { t, i18n } = useTranslation('notifications');
  const { profile } = useApp();
  const {
    recentPaymentToast,
    undoNoticeVisible,
    settings,
    dismissPaymentToast,
    undoRecentPayment,
  } = useNotifications();
  const [busy, setBusy] = useState(false);

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);

  if (undoNoticeVisible) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-24 lg:bottom-6 right-4 left-4 sm:left-auto sm:w-88 z-50 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 shadow-lg border border-slate-700 flex items-center gap-2.5 transition-opacity duration-200 motion-reduce:transition-none"
      >
        <RotateCcw className="w-4 h-4 text-teal-400 shrink-0" />
        <span className="text-xs font-semibold">{t('undoToast.undone')}</span>
      </div>
    );
  }

  if (!recentPaymentToast) return null;

  const { payment, notificationId } = recentPaymentToast;
  const amountFormatted = formatCurrency(
    payment.amount,
    payment.currency,
    lang,
    useKh
  );

  const handleUndo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await undoRecentPayment(payment.id, notificationId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 lg:bottom-6 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-2xl bg-emerald-950 text-white p-3.5 shadow-xl border border-emerald-700/70 flex items-center justify-between gap-3 transition-transform duration-200 motion-reduce:transition-none"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">{t('undoToast.title')}</p>
          <p className="text-xs text-emerald-100 truncate mt-0.5">
            {settings.privacyHideDetails
              ? t('undoToast.bodyHidden')
              : t('undoToast.body', {
                  borrowerName: payment.borrowerName,
                  amountFormatted,
                })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={handleUndo}
          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-white text-emerald-950 px-3 py-1.5 text-xs font-bold hover:bg-emerald-50 disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t('undoToast.undo')}</span>
        </button>
        <button
          type="button"
          onClick={dismissPaymentToast}
          aria-label={t('center.close')}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-emerald-200 hover:bg-emerald-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
