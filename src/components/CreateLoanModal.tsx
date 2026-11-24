import React, { useMemo, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  compressImageToDataUrl,
  formatCurrency,
  formatDateLocalized,
  generateRepaymentSchedule,
} from '../lib/finance';
import type { CurrencyCode, InterestType, LateFeeType, Loan, RepaymentFrequency } from '../types/loan';
import { SignaturePad } from './SignaturePad';

interface CreateLoanModalProps {
  initialBorrowerId?: string;
  mode?: 'create' | 'renew' | 'topup' | 'restructure';
  sourceLoan?: Loan;
  onClose: () => void;
  onCreated?: (loanId: string) => void;
}

export const CreateLoanModal: React.FC<CreateLoanModalProps> = ({
  initialBorrowerId,
  mode = 'create',
  sourceLoan,
  onClose,
  onCreated,
}) => {
  const { t, i18n } = useTranslation();
  const { borrowers, profile, todayIso, createLoan, renewOrRestructureLoan } = useApp();
  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);

  const defaultCurrency: CurrencyCode =
    sourceLoan?.currency || profile?.defaultCurrency || 'USD';
  const defaultPrincipal =
    mode === 'topup' && sourceLoan
      ? sourceLoan.outstandingBalance + (defaultCurrency === 'KHR' ? 1000000 : 200)
      : mode === 'restructure' && sourceLoan
      ? sourceLoan.outstandingBalance
      : sourceLoan
      ? sourceLoan.principal
      : defaultCurrency === 'KHR'
      ? 2000000
      : 500;

  const [borrowerId, setBorrowerId] = useState(
    sourceLoan?.borrowerId || initialBorrowerId || borrowers[0]?.id || ''
  );
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [principal, setPrincipal] = useState<string>(String(defaultPrincipal));
  const [interestRate, setInterestRate] = useState<string>(
    String(sourceLoan?.interestRate ?? 3)
  );
  const [interestType, setInterestType] = useState<InterestType>(
    sourceLoan?.interestType || 'flat'
  );
  const [termCount, setTermCount] = useState<string>(String(sourceLoan?.termCount ?? 6));
  const [frequency, setFrequency] = useState<RepaymentFrequency>(
    sourceLoan?.frequency || 'monthly'
  );
  const [customIntervalDays, setCustomIntervalDays] = useState<string>(
    String(sourceLoan?.customIntervalDays ?? 10)
  );
  const [startDate, setStartDate] = useState(todayIso);
  const [adminFee, setAdminFee] = useState<string>('0');
  const [lateFeeType, setLateFeeType] = useState<LateFeeType>('fixed');
  const [lateFeeValue, setLateFeeValue] = useState<string>('0');
  const [gracePeriodDays, setGracePeriodDays] = useState<string>('2');
  const [collateralText, setCollateralText] = useState(sourceLoan?.collateralText || '');
  const [collateralPhotoUrl, setCollateralPhotoUrl] = useState(sourceLoan?.collateralPhotoUrl || '');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const preview = useMemo(() => {
    const p = Number(principal) || 0;
    const r = Number(interestRate) || 0;
    const n = Math.max(1, Math.min(360, Number(termCount) || 1));
    if (p <= 0) return null;
    return generateRepaymentSchedule({
      principal: p,
      interestRate: r,
      interestType,
      termCount: n,
      frequency,
      customIntervalDays: Number(customIntervalDays) || 10,
      startDate,
      currency,
    });
  }, [principal, interestRate, interestType, termCount, frequency, customIntervalDays, startDate, currency]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 800, 0.7);
      setCollateralPhotoUrl(compressed);
    } catch {
      setErrorMsg('Could not process image');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerId || (Number(principal) || 0) <= 0) return;
    setBusy(true);
    setErrorMsg('');
    const payload = {
      borrowerId,
      currency,
      principal: Number(principal),
      interestRate: Number(interestRate) || 0,
      interestType,
      termCount: Math.max(1, Math.min(360, Math.round(Number(termCount) || 1))),
      frequency,
      customIntervalDays: frequency === 'custom' ? Math.max(1, Number(customIntervalDays) || 10) : undefined,
      startDate,
      adminFee: Number(adminFee) || 0,
      lateFeeType,
      lateFeeValue: Number(lateFeeValue) || 0,
      gracePeriodDays: Math.max(0, Math.round(Number(gracePeriodDays) || 0)),
      collateralText,
      collateralPhotoUrl,
      signatureDataUrl,
    };

    try {
      let id: string;
      if (mode !== 'create' && sourceLoan) {
        id = await renewOrRestructureLoan(sourceLoan.id, mode, payload);
      } else {
        id = await createLoan(payload);
      }
      onCreated?.(id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create loan');
    } finally {
      setBusy(false);
    }
  };

  const modalTitle =
    mode === 'renew'
      ? t('loans.renewLoan')
      : mode === 'topup'
      ? t('loans.topUpLoan')
      : mode === 'restructure'
      ? t('loans.restructureLoan')
      : t('loans.createTitle');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {modalTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.selectBorrower')}
            </label>
            <select
              required
              disabled={mode !== 'create'}
              value={borrowerId}
              onChange={(e) => setBorrowerId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
            >
              {borrowers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.currency')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['USD', 'KHR'] as CurrencyCode[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                    currency === c
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {c === 'USD' ? 'USD ($)' : 'KHR (៛)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.principal')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="1"
              required
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.interestRate')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.interestType')}
            </label>
            <select
              value={interestType}
              onChange={(e) => setInterestType(e.target.value as InterestType)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="flat">{t('loans.flat')}</option>
              <option value="reducing">{t('loans.reducing')}</option>
              <option value="interest_only">{t('loans.interestOnly')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.termCount')}
            </label>
            <input
              type="number"
              min="1"
              max="360"
              required
              value={termCount}
              onChange={(e) => setTermCount(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.frequency')}
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RepaymentFrequency)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="daily">{t('loans.daily')}</option>
              <option value="weekly">{t('loans.weekly')}</option>
              <option value="monthly">{t('loans.monthly')}</option>
              <option value="custom">{t('loans.custom')}</option>
            </select>
          </div>

          {frequency === 'custom' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('loans.customDays')}
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={customIntervalDays}
                onChange={(e) => setCustomIntervalDays(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.startDate')}
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.adminFee')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={adminFee}
              onChange={(e) => setAdminFee(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.lateFeeType')}
            </label>
            <select
              value={lateFeeType}
              onChange={(e) => setLateFeeType(e.target.value as LateFeeType)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="fixed">{t('loans.lateFeeFixed')}</option>
              <option value="percent">{t('loans.lateFeePercent')}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('loans.lateFeeValue')}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={lateFeeValue}
                onChange={(e) => setLateFeeValue(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('loans.graceDays')}
              </label>
              <input
                type="number"
                min="0"
                max="90"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('loans.collateral')}
              </label>
              <input
                type="text"
                value={collateralText}
                onChange={(e) => setCollateralText(e.target.value)}
                placeholder="Moto plate, Land title..."
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('loans.collateralPhoto')}
              </label>
              <label className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Camera className="w-4 h-4 text-teal-600" />
                <span>{collateralPhotoUrl ? 'Photo ready' : t('borrowers.uploadPhoto')}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          </div>
        </div>

        <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />

        {preview && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {t('loans.schedulePreview')}
                </span>
                <span className="ml-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  ({t('loans.interestType')}:{' '}
                  {interestType === 'reducing'
                    ? t('loans.reducing')
                    : interestType === 'interest_only'
                    ? t('loans.interestOnly')
                    : t('loans.flat')}
                  )
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span>
                  {t('loans.totalInterest')}:{' '}
                  <strong>{formatCurrency(preview.totalInterest, currency, lang, useKh)}</strong>
                </span>
                <span>
                  {t('loans.totalPayable')}:{' '}
                  <strong className="text-teal-600">
                    {formatCurrency(preview.totalPayable, currency, lang, useKh)}
                  </strong>
                </span>
              </div>
            </div>
            <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left whitespace-nowrap">#</th>
                    <th className="px-2.5 py-1.5 text-left whitespace-nowrap">{t('loans.dueDate')}</th>
                    <th className="px-2.5 py-1.5 text-right whitespace-nowrap">{t('loans.principalCol')}</th>
                    <th className="px-2.5 py-1.5 text-right whitespace-nowrap">{t('loans.interestCol')}</th>
                    <th className="px-2.5 py-1.5 text-right whitespace-nowrap">{t('loans.totalCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.schedules.slice(0, 12).map((s) => (
                    <tr key={s.installmentNumber}>
                      <td className="px-2.5 py-1.5 font-mono text-slate-500">
                        #{s.installmentNumber}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDateLocalized(s.dueDate, lang, useKh)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatCurrency(s.principalDue, currency, lang, useKh)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatCurrency(s.interestDue, currency, lang, useKh)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap text-slate-900 dark:text-slate-100">
                        {formatCurrency(s.totalDue, currency, lang, useKh)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            {t('app.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy || !borrowerId}
            className="min-h-[44px] rounded-xl bg-teal-600 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {t('app.save')}
          </button>
        </div>
      </form>
    </div>
  );
};
