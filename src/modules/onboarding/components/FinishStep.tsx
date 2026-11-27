import React from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BusinessType } from '../../../config/featureAccess';
import type { BusinessProfile } from '../types';

interface FinishStepProps {
  businessType: BusinessType;
  profile: BusinessProfile;
  saving: boolean;
  onBack: () => void;
  onFinish: () => void;
}

export const FinishStep: React.FC<FinishStepProps> = ({
  businessType,
  profile,
  saving,
  onBack,
  onFinish,
}) => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');

  const typeLabel =
    businessType === 'installment_shop'
      ? t('businessType.installmentShop.title')
      : businessType === 'both'
        ? t('businessType.both.title')
        : t('businessType.lender.title');

  const enabledList = t(
    businessType === 'installment_shop'
      ? 'businessType.installmentShop.enabledList'
      : businessType === 'both'
        ? 'businessType.both.enabledList'
        : 'businessType.lender.enabledList',
    { returnObjects: true }
  ) as string[];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h1
            className={`text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 ${
              isKm ? 'leading-[1.6]' : ''
            }`}
          >
            {t('finish.title')}
          </h1>
          <p
            className={`text-sm text-slate-600 dark:text-slate-300 ${
              isKm ? 'leading-[1.75]' : 'leading-relaxed'
            }`}
          >
            {t('finish.subtitle')}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('finish.summaryTypeLabel')}
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {typeLabel}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('finish.summaryNameLabel')}
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              {profile.name}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {t('finish.summaryEnabledLabel')}
          </p>
          <ul className="space-y-1.5">
            {Array.isArray(enabledList) &&
              enabledList.map((item, idx) => (
                <li
                  key={idx}
                  className={`flex items-start gap-2 text-xs sm:text-sm text-slate-800 dark:text-slate-200 ${
                    isKm ? 'leading-[1.7]' : ''
                  }`}
                >
                  <Check className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>

      {(businessType === 'installment_shop' || businessType === 'both') && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/30 p-4 flex items-start gap-3">
          <QrCode className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-teal-900 dark:text-teal-200">
              {t('finish.marketchainTipTitle')}
            </p>
            <p
              className={`text-xs text-teal-800 dark:text-teal-300 ${
                isKm ? 'leading-[1.75]' : 'leading-relaxed'
              }`}
            >
              {t('finish.marketchainTipBody')}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={onBack}
          className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>{t('back')}</span>
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={onFinish}
          className="sm:flex-1 min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-5 transition-colors motion-reduce:transition-none disabled:opacity-60"
        >
          <span>{saving ? t('finish.saving') : t('finish.goToDashboard')}</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
};
