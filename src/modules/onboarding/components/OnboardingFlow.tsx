import React, { useEffect, useState } from 'react';
import type { BusinessType } from '../../../config/featureAccess';
import type {
  BusinessProfile,
  BusinessQuickDefaults,
  OnboardingDraft,
  OnboardingState,
  OnboardingStep,
} from '../types';
import { BasicInfoStep } from './BasicInfoStep';
import { BusinessTypeStep } from './BusinessTypeStep';
import { FinishStep } from './FinishStep';
import { QuickDefaultsStep } from './QuickDefaultsStep';
import { StepProgress } from './StepProgress';
import { WelcomeStep } from './WelcomeStep';

interface OnboardingFlowProps {
  initialState: OnboardingState;
  onSaveDraft: (params: {
    step?: OnboardingStep;
    draft?: Partial<OnboardingDraft>;
    businessType?: BusinessType | null;
  }) => Promise<OnboardingState>;
  onComplete: (params: {
    businessType: BusinessType;
    profile: BusinessProfile;
    defaults: BusinessQuickDefaults;
  }) => Promise<void>;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialState,
  onSaveDraft,
  onComplete,
}) => {
  const [step, setStep] = useState<OnboardingStep>(initialState.step || 1);
  const [businessType, setBusinessType] = useState<BusinessType | null>(
    initialState.draft.businessType ?? initialState.businessType ?? null
  );
  const [profile, setProfile] = useState<BusinessProfile>(initialState.draft.profile);
  const [defaults, setDefaults] = useState<BusinessQuickDefaults>(initialState.draft.defaults);
  const [saving, setSaving] = useState(false);

  // Prevent browser Back button / hash jumps from exiting or bypassing onboarding
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lockedUrl = window.location.pathname + window.location.search;
    try {
      window.history.replaceState({ kamchiOnboardingLock: true }, '', lockedUrl);
      window.history.pushState({ kamchiOnboardingLock: true }, '', lockedUrl);
    } catch {
      // Ignore restricted history APIs
    }

    const blockNav = () => {
      try {
        window.history.pushState({ kamchiOnboardingLock: true }, '', lockedUrl);
      } catch {
        // Ignore
      }
    };

    window.addEventListener('popstate', blockNav);
    window.addEventListener('hashchange', blockNav);
    return () => {
      window.removeEventListener('popstate', blockNav);
      window.removeEventListener('hashchange', blockNav);
    };
  }, []);

  const persistProgress = (
    nextStep: OnboardingStep,
    overrides?: {
      businessType?: BusinessType | null;
      profile?: BusinessProfile;
      defaults?: BusinessQuickDefaults;
    }
  ) => {
    const nextType =
      overrides?.businessType !== undefined ? overrides.businessType : businessType;
    const nextProfile = overrides?.profile ?? profile;
    const nextDefaults = overrides?.defaults ?? defaults;
    setStep(nextStep);
    void onSaveDraft({
      step: nextStep,
      businessType: nextType,
      draft: {
        businessType: nextType,
        profile: nextProfile,
        defaults: nextDefaults,
      },
    });
  };

  const handleFinish = async () => {
    if (!businessType || saving) return;
    setSaving(true);
    try {
      await onComplete({
        businessType,
        profile,
        defaults,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF7] dark:bg-slate-950 flex flex-col justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-6">
        <StepProgress currentStep={step} totalSteps={5} />

        {step === 1 && (
          <WelcomeStep onGetStarted={() => persistProgress(2)} />
        )}

        {step === 2 && (
          <BusinessTypeStep
            selectedType={businessType}
            onSelect={(nextType) => {
              setBusinessType(nextType);
              void onSaveDraft({
                step: 2,
                businessType: nextType,
                draft: { businessType: nextType, profile, defaults },
              });
            }}
            onBack={() => persistProgress(1)}
            onContinue={() => {
              if (!businessType) return;
              persistProgress(3, { businessType });
            }}
          />
        )}

        {step === 3 && (
          <BasicInfoStep
            profile={profile}
            onChange={(nextProfile) => {
              setProfile(nextProfile);
              void onSaveDraft({
                step: 3,
                draft: { profile: nextProfile },
              });
            }}
            onBack={() => persistProgress(2)}
            onContinue={(sanitizedProfile) => {
              setProfile(sanitizedProfile);
              persistProgress(4, { profile: sanitizedProfile });
            }}
          />
        )}

        {step === 4 && (
          <QuickDefaultsStep
            businessType={businessType ?? 'lender'}
            defaults={defaults}
            onChange={(nextDefaults) => {
              setDefaults(nextDefaults);
              void onSaveDraft({
                step: 4,
                draft: { defaults: nextDefaults },
              });
            }}
            onBack={() => persistProgress(3)}
            onSkip={() => persistProgress(5)}
            onContinue={() => persistProgress(5)}
          />
        )}

        {step === 5 && (
          <FinishStep
            businessType={businessType ?? 'lender'}
            profile={profile}
            saving={saving}
            onBack={() => persistProgress(4)}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  );
};
