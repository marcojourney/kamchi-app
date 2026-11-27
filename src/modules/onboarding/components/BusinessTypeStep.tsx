import React from 'react';
import { ArrowLeft, ArrowRight, Check, HandCoins, Layers, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORT_BOTH_TYPES, type BusinessType } from '../../../config/featureAccess';

interface BusinessTypeStepProps {
  selectedType: BusinessType | null;
  onSelect: (type: BusinessType) => void;
  onBack: () => void;
  onContinue: () => void;
}

export const BusinessTypeStep: React.FC<BusinessTypeStepProps> = ({
  selectedType,
  onSelect,
  onBack,
  onContinue,
}) => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');

  const options: Array<{
    type: BusinessType;
    icon: React.FC<{ className?: string }>;
    title: string;
    description: string;
    enabledList: string[];
  }> = [
    {
      type: 'lender',
      icon: HandCoins,
      title: t('businessType.lender.title'),
      description: t('businessType.lender.description'),
      enabledList: t('businessType.lender.enabledList', { returnObjects: true }) as string[],
    },
    {
      type: 'installment_shop',
      icon: Store,
      title: t('businessType.installmentShop.title'),
      description: t('businessType.installmentShop.description'),
      enabledList: t('businessType.installmentShop.enabledList', {
        returnObjects: true,
      }) as string[],
    },
  ];

  if (SUPPORT_BOTH_TYPES) {
    options.push({
      type: 'both',
      icon: Layers,
      title: t('businessType.both.title'),
      description: t('businessType.both.description'),
      enabledList: t('businessType.both.enabledList', { returnObjects: true }) as string[],
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1
          className={`text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 ${
            isKm ? 'leading-[1.6]' : ''
          }`}
        >
          {t('businessType.title')}
        </h1>
        <p
          className={`text-sm text-slate-600 dark:text-slate-300 ${
            isKm ? 'leading-[1.75]' : 'leading-relaxed'
          }`}
        >
          {t('businessType.subtitle')}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t('businessType.title')}
        className="grid grid-cols-1 gap-3.5"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selectedType === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(opt.type)}
              className={`w-full text-left rounded-2xl border p-4 sm:p-5 transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                isSelected
                  ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/35 ring-2 ring-teal-500/25'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h2
                      className={`text-base font-bold text-slate-900 dark:text-slate-100 ${
                        isKm ? 'leading-[1.6]' : ''
                      }`}
                    >
                      {opt.title}
                    </h2>
                    <p
                      className={`text-xs sm:text-sm text-slate-600 dark:text-slate-300 ${
                        isKm ? 'leading-[1.7]' : ''
                      }`}
                    >
                      {opt.description}
                    </p>
                  </div>
                </div>

                <span
                  aria-hidden="true"
                  className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {t(
                    opt.type === 'lender'
                      ? 'businessType.lender.enabledTitle'
                      : opt.type === 'installment_shop'
                        ? 'businessType.installmentShop.enabledTitle'
                        : 'businessType.both.enabledTitle'
                  )}
                </p>
                <ul className="space-y-1">
                  {Array.isArray(opt.enabledList) &&
                    opt.enabledList.map((line, idx) => (
                      <li
                        key={idx}
                        className={`flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200 ${
                          isKm ? 'leading-[1.7]' : ''
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        <span>{line}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </button>
          );
        })}
      </div>

      <p
        className={`text-xs text-slate-500 dark:text-slate-400 text-center ${
          isKm ? 'leading-[1.7]' : ''
        }`}
      >
        {t('businessType.changeLaterNote')}
        {!selectedType ? ` · ${t('businessType.selectHint')}` : ''}
      </p>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>{t('back')}</span>
        </button>

        <button
          type="button"
          disabled={!selectedType}
          onClick={onContinue}
          className="sm:flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 transition-colors motion-reduce:transition-none"
        >
          <span>{t('continue')}</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
};
