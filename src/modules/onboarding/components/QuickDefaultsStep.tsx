import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getEnabledFeatures, type BusinessType } from '../../../config/featureAccess';
import { KHR_ROUNDING_STEPS } from '../config';
import type { BusinessQuickDefaults } from '../types';

interface QuickDefaultsStepProps {
  businessType: BusinessType;
  defaults: BusinessQuickDefaults;
  onChange: (next: BusinessQuickDefaults) => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}

export const QuickDefaultsStep: React.FC<QuickDefaultsStepProps> = ({
  businessType,
  defaults,
  onChange,
  onBack,
  onSkip,
  onContinue,
}) => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');
  const features = getEnabledFeatures(businessType, 'free', {
    supportBothTypes: businessType === 'both',
  });

  const updateLender = <K extends keyof BusinessQuickDefaults['lender']>(
    key: K,
    val: BusinessQuickDefaults['lender'][K]
  ) => {
    onChange({
      ...defaults,
      lender: { ...defaults.lender, [key]: val },
    });
  };

  const updateInstallment = <K extends keyof BusinessQuickDefaults['installment']>(
    key: K,
    val: BusinessQuickDefaults['installment'][K]
  ) => {
    onChange({
      ...defaults,
      installment: { ...defaults.installment, [key]: val },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h1
            className={`text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 ${
              isKm ? 'leading-[1.6]' : ''
            }`}
          >
            {t('quickDefaults.title')}
          </h1>
          <p
            className={`text-sm text-slate-600 dark:text-slate-300 ${
              isKm ? 'leading-[1.75]' : 'leading-relaxed'
            }`}
          >
            {features.installments && !features.loans
              ? t('quickDefaults.subtitleInstallment')
              : t('quickDefaults.subtitleLender')}
          </p>
        </div>

        <span className="text-[11px] font-medium text-slate-400 shrink-0 pt-1">
          {t('optionalBadge')}
        </span>
      </div>

      {features.loans && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="onb-lender-rate"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.interestRateLabel')}
              </label>
              <input
                id="onb-lender-rate"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                max={100}
                value={defaults.lender.interestRate}
                onChange={(e) =>
                  updateLender('interestRate', Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="onb-lender-type"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.interestTypeLabel')}
              </label>
              <select
                id="onb-lender-type"
                value={defaults.lender.interestType}
                onChange={(e) =>
                  updateLender(
                    'interestType',
                    e.target.value as BusinessQuickDefaults['lender']['interestType']
                  )
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="flat">{t('quickDefaults.interestFlat')}</option>
                <option value="reducing">{t('quickDefaults.interestReducing')}</option>
                <option value="interest_only">{t('quickDefaults.interestOnly')}</option>
              </select>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t('quickDefaults.frequencyLabel')}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'daily', label: t('quickDefaults.freqDaily') },
                  { value: 'weekly', label: t('quickDefaults.freqWeekly') },
                  { value: 'monthly', label: t('quickDefaults.freqMonthly') },
                ] as const
              ).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={defaults.lender.paymentFrequency === item.value}
                  onClick={() => updateLender('paymentFrequency', item.value)}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors motion-reduce:transition-none ${
                    defaults.lender.paymentFrequency === item.value
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="onb-lender-grace"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.graceDaysLabel')}
              </label>
              <input
                id="onb-lender-grace"
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                value={defaults.lender.graceDays}
                onChange={(e) =>
                  updateLender('graceDays', Math.max(0, Math.round(Number(e.target.value) || 0)))
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="onb-lender-feetype"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.lateFeeTypeLabel')}
              </label>
              <select
                id="onb-lender-feetype"
                value={defaults.lender.lateFeeType}
                onChange={(e) =>
                  updateLender('lateFeeType', e.target.value as 'fixed' | 'percent')
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="fixed">{t('quickDefaults.lateFeeFixed')}</option>
                <option value="percent">{t('quickDefaults.lateFeePercent')}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="onb-lender-feeval"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.lateFeeValueLabel')}
              </label>
              <input
                id="onb-lender-feeval"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={defaults.lender.lateFeeValue}
                onChange={(e) =>
                  updateLender('lateFeeValue', Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
      )}

      {features.installments && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="onb-inst-down"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.minDownPaymentLabel')}
              </label>
              <input
                id="onb-inst-down"
                type="number"
                inputMode="decimal"
                min={0}
                max={95}
                value={defaults.installment.minDownPaymentPercent}
                onChange={(e) =>
                  updateInstallment(
                    'minDownPaymentPercent',
                    Math.min(95, Math.max(0, Number(e.target.value) || 0))
                  )
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="onb-inst-count"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.defaultInstallmentsLabel')}
              </label>
              <input
                id="onb-inst-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                value={defaults.installment.defaultInstallments}
                onChange={(e) =>
                  updateInstallment(
                    'defaultInstallments',
                    Math.min(120, Math.max(1, Math.round(Number(e.target.value) || 1)))
                  )
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="onb-inst-grace"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.graceDaysLabel')}
              </label>
              <input
                id="onb-inst-grace"
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                value={defaults.installment.graceDays}
                onChange={(e) =>
                  updateInstallment(
                    'graceDays',
                    Math.max(0, Math.round(Number(e.target.value) || 0))
                  )
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="onb-inst-feetype"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.lateFeeTypeLabel')}
              </label>
              <select
                id="onb-inst-feetype"
                value={defaults.installment.lateFeeType}
                onChange={(e) =>
                  updateInstallment('lateFeeType', e.target.value as 'fixed' | 'percent')
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="fixed">{t('quickDefaults.lateFeeFixed')}</option>
                <option value="percent">{t('quickDefaults.lateFeePercent')}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="onb-inst-feeval"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('quickDefaults.lateFeeValueLabel')}
              </label>
              <input
                id="onb-inst-feeval"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={defaults.installment.lateFeeValue}
                onChange={(e) =>
                  updateInstallment('lateFeeValue', Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t('quickDefaults.khrRoundingLabel')}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {KHR_ROUNDING_STEPS.map((step) => (
                <button
                  key={step}
                  type="button"
                  aria-pressed={defaults.installment.khrRoundingStep === step}
                  onClick={() => updateInstallment('khrRoundingStep', step)}
                  className={`min-h-[44px] rounded-xl border text-xs font-mono font-semibold transition-colors motion-reduce:transition-none ${
                    defaults.installment.khrRoundingStep === step
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {step.toLocaleString()} ៛
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>{t('back')}</span>
        </button>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:flex-1 sm:justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[48px] rounded-xl px-4 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('skipForNow')}
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="min-h-[48px] sm:min-w-[160px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-5 transition-colors motion-reduce:transition-none"
          >
            <span>{t('continue')}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
