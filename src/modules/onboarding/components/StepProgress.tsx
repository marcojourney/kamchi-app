import React from 'react';
import { useTranslation } from 'react-i18next';
import type { OnboardingStep } from '../types';

interface StepProgressProps {
  currentStep: OnboardingStep;
  totalSteps?: number;
}

export const StepProgress: React.FC<StepProgressProps> = ({
  currentStep,
  totalSteps = 5,
}) => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');
  const percent = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="space-y-2" aria-label={t('stepProgress', { current: currentStep, total: totalSteps })}>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span className={isKm ? 'leading-[1.65]' : ''}>
          {t('stepProgress', { current: currentStep, total: totalSteps })}
        </span>
        <span className="font-mono tabular-nums text-teal-700 dark:text-teal-400">
          {currentStep}/{totalSteps}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-valuenow={currentStep}
        className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-teal-600 dark:bg-teal-500 transition-all duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
