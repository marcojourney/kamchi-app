import React, { useMemo, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { allocatePaymentAcrossSchedules, formatCurrency } from '../lib/finance';
import type { Loan, Payment, PaymentMethod } from '../types/loan';
import { DatePicker } from './DatePicker';

interface RecordPaymentModalProps {
  loan: Loan;
  onClose: () => void;
  onSuccess: (payment: Payment, remainingAfter: number) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  loan,
  onClose,
  onSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const { schedulesByLoan, staff, todayIso, profile, recordPayment } = useApp();

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);
  const schedules = schedulesByLoan[loan.id] || [];

  const nextDueInstallment = useMemo(
    () => schedules.find((s) => s.status !== 'paid'),
    [schedules]
  );
  const suggestedAmount = nextDueInstallment
    ? Math.max(
        0,
        Math.round(
          (nextDueInstallment.totalDue -
            (nextDueInstallment.principalPaid + nextDueInstallment.interestPaid)) *
            100
        ) / 100
      )
    : Math.round(loan.outstandingBalance * 100) / 100;

  const [amount, setAmount] = useState<string>(
    String(suggestedAmount || Math.round(loan.outstandingBalance * 100) / 100)
  );
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [referenceNo, setReferenceNo] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const numericAmount = Number(amount) || 0;

  const preview = useMemo(() => {
    if (numericAmount <= 0) return null;
    return allocatePaymentAcrossSchedules({
      amount: numericAmount,
      loan,
      schedules,
      todayIso: paymentDate,
    });
  }, [numericAmount, loan, schedules, paymentDate]);

  const attachGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      () => setErrorMsg('Location permission denied')
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const payment = await recordPayment({
        loanId: loan.id,
        amount: numericAmount,
        method,
        paymentDate,
        referenceNo,
        collectedBy,
        notes,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
      });
      onSuccess(payment, preview?.newOutstandingBalance ?? Math.max(0, loan.outstandingBalance - numericAmount));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save payment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('payment.title')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loan.borrowerName} · {t('loans.outstandingBalance')}:{' '}
              <span className="font-mono font-semibold tabular-nums">
                {formatCurrency(loan.outstandingBalance, loan.currency, lang, useKh)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('payment.amount')} ({loan.currency})
              </label>
              <button
                type="button"
                onClick={() =>
                  setAmount(String(Math.round(loan.outstandingBalance * 100) / 100))
                }
                className="text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                {t('loans.earlySettle')}
              </button>
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-base font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('payment.method')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'khqr_aba', 'bank_transfer'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`min-h-[44px] rounded-xl border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    method === m
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {t(
                    m === 'khqr_aba'
                      ? 'payment.methodKhqr'
                      : m === 'bank_transfer'
                      ? 'payment.methodBank'
                      : 'payment.methodCash'
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payment.date')}
              </label>
              <DatePicker
                value={paymentDate}
                onChange={setPaymentDate}
                useKhmerNumerals={useKh}
                ariaLabel={t('payment.date')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payment.reference')}
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="ABA-..."
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {staff.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payment.collector')}
              </label>
              <select
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">{profile?.displayName || 'Owner'}</option>
                {staff
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.role})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={attachGps}
              className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MapPin className="w-3.5 h-3.5 text-teal-600" />
              <span>{gps ? `${t('payment.gpsAttached')} (${gps.lat}, ${gps.lng})` : t('payment.captureGps')}</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('payment.notes')}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {preview && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 text-xs">
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              {t('payment.splitPreview')}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <span className="text-slate-500 block">{t('payment.penalty')}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(preview.penaltyPortion, loan.currency, lang, useKh)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{t('payment.interest')}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(preview.interestPortion, loan.currency, lang, useKh)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{t('payment.principal')}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrency(preview.principalPortion, loan.currency, lang, useKh)}
                </span>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={busy || numericAmount <= 0}
          className="w-full min-h-[48px] rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {t('payment.submit')}
        </button>
      </form>
    </div>
  );
};
