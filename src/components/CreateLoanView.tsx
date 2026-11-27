import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import {
  compressImageToDataUrl,
  formatCurrency,
  formatDateLocalized,
  generateRepaymentSchedule,
} from '../lib/finance';
import type {
  CurrencyCode,
  InterestType,
  LateFeeType,
  Loan,
  RepaymentFrequency,
} from '../types/loan';
import { BorrowerSelectDrawer } from './BorrowerSelectDrawer';
import { DatePicker } from './DatePicker';
import { SignaturePad } from './SignaturePad';

interface CreateLoanViewProps {
  initialBorrowerId?: string;
  mode?: 'create' | 'renew' | 'topup' | 'restructure';
  sourceLoan?: Loan;
  onClose: () => void;
  onCreated?: (loanId: string) => void;
}

export const CreateLoanView: React.FC<CreateLoanViewProps> = ({
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
      ? String(sourceLoan.outstandingBalance + (defaultCurrency === 'KHR' ? 1000000 : 200))
      : mode === 'restructure' && sourceLoan
      ? String(sourceLoan.outstandingBalance)
      : sourceLoan
      ? String(sourceLoan.principal)
      : '';

  const [borrowerId, setBorrowerId] = useState(
    sourceLoan?.borrowerId || initialBorrowerId || ''
  );
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [principal, setPrincipal] = useState<string>(defaultPrincipal);
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
  const [collateralPhotoUrl, setCollateralPhotoUrl] = useState(
    sourceLoan?.collateralPhotoUrl || ''
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

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
  }, [
    principal,
    interestRate,
    interestType,
    termCount,
    frequency,
    customIntervalDays,
    startDate,
    currency,
  ]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 800, 0.7);
      setCollateralPhotoUrl(compressed);
      setErrorMsg('');
    } catch {
      setErrorMsg(t('loans.imageProcessError'));
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
      customIntervalDays:
        frequency === 'custom' ? Math.max(1, Number(customIntervalDays) || 10) : undefined,
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
      setErrorMsg(err instanceof Error ? err.message : t('loans.createError'));
    } finally {
      setBusy(false);
    }
  };

  const pageTitle =
    mode === 'renew'
      ? t('loans.renewLoan')
      : mode === 'topup'
      ? t('loans.topUpLoan')
      : mode === 'restructure'
      ? t('loans.restructureLoan')
      : t('loans.createTitle');

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('app.back')}</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {pageTitle}
            </h1>
            {sourceLoan && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {sourceLoan.borrowerName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Section 1: Borrower & Loan Terms */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          {t('loans.sectionBorrowerTerms')}
        </h2>

        {borrowers.length === 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            {t('loans.noBorrowersHint')}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="create-loan-borrower-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t('loans.selectBorrower')}
            </label>
            <BorrowerSelectDrawer
              id="create-loan-borrower-select"
              borrowers={borrowers}
              value={borrowerId}
              onChange={setBorrowerId}
              disabled={mode !== 'create' || borrowers.length === 0}
              ariaLabel={t('loans.selectBorrower')}
            />
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
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
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
              placeholder="0"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
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
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
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
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
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
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              useKhmerNumerals={useKh}
              ariaLabel={t('loans.startDate')}
            />
          </div>
        </div>
      </section>

      {/* Section 2: Fees & Late Penalties */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          {t('loans.sectionFeesPenalties')}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="fixed">{t('loans.lateFeeFixed')}</option>
              <option value="percent">{t('loans.lateFeePercent')}</option>
            </select>
          </div>

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
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
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
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Section 3: Collateral & Borrower Signature */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          {t('loans.sectionCollateralSignature')}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.collateral')}
            </label>
            <input
              type="text"
              value={collateralText}
              onChange={(e) => setCollateralText(e.target.value)}
              placeholder={t('loans.collateralPlaceholder')}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('loans.collateralPhoto')}
            </label>
            <div className="flex items-center gap-2">
              <label className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <Camera className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="truncate">
                  {collateralPhotoUrl ? t('loans.photoReady') : t('borrowers.uploadPhoto')}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </label>
              {collateralPhotoUrl && (
                <button
                  type="button"
                  onClick={() => setCollateralPhotoUrl('')}
                  aria-label={t('borrowers.removePhoto')}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {collateralPhotoUrl && (
              <div className="mt-2">
                <img
                  src={collateralPhotoUrl}
                  alt={t('loans.collateralPhoto')}
                  className="h-24 w-auto rounded-xl border border-slate-200 dark:border-slate-700 object-cover"
                />
              </div>
            )}
          </div>
        </div>

        <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
      </section>

      {/* Section 4: Schedule Preview */}
      {preview && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {t('loans.schedulePreview')}
              </span>
              <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                ({t('loans.interestType')}:{' '}
                {interestType === 'reducing'
                  ? t('loans.reducing')
                  : interestType === 'interest_only'
                  ? t('loans.interestOnly')
                  : t('loans.flat')}
                )
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-xs sm:text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                {t('loans.totalInterest')}:{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  {formatCurrency(preview.totalInterest, currency, lang, useKh)}
                </strong>
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                {t('loans.totalPayable')}:{' '}
                <strong className="text-teal-600">
                  {formatCurrency(preview.totalPayable, currency, lang, useKh)}
                </strong>
              </span>
            </div>
          </div>

          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left whitespace-nowrap">#</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">
                    {t('loans.dueDate')}
                  </th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">
                    {t('loans.principalCol')}
                  </th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">
                    {t('loans.interestCol')}
                  </th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">
                    {t('loans.totalCol')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.schedules.map((s) => (
                  <tr key={s.installmentNumber}>
                    <td className="px-3 py-2 font-mono text-slate-500">
                      #{s.installmentNumber}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDateLocalized(s.dueDate, lang, useKh)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatCurrency(s.principalDue, currency, lang, useKh)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatCurrency(s.interestDue, currency, lang, useKh)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap text-slate-900 dark:text-slate-100">
                      {formatCurrency(s.totalDue, currency, lang, useKh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-xs font-medium text-red-600 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Action Bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] sm:min-w-[140px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {t('app.cancel')}
        </button>
        <button
          type="submit"
          disabled={busy || !borrowerId}
          className="min-h-[48px] sm:min-w-[180px] px-6 rounded-xl bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {t('app.save')}
        </button>
      </div>
    </form>
  );
};
