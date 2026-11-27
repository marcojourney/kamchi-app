import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { BusinessType } from '../../../config/featureAccess';
import { getPreloadedLicenseSnapshot } from '../../../lib/licenseStorage';
import { track } from '../../../lib/analytics';
import {
  completeOnboarding as persistCompleteOnboarding,
  dismissExistingUserPrompt as persistDismissPrompt,
  getPreloadedOnboardingSnapshot,
  migrateExistingUserToOnboarding,
  preloadOnboardingState,
  saveBusinessDefaults as persistSaveDefaults,
  saveBusinessProfile as persistSaveProfile,
  saveOnboardingDraft as persistSaveDraft,
  updateBusinessType as persistUpdateBusinessType,
  type PreloadedOnboardingSnapshot,
} from '../services/onboardingStorage';
import type {
  BusinessProfile,
  BusinessQuickDefaults,
  OnboardingDraft,
  OnboardingState,
  OnboardingStep,
} from '../types';

export interface OnboardingContextValue {
  loaded: boolean;
  state: OnboardingState;
  profile: BusinessProfile;
  defaults: BusinessQuickDefaults;
  businessType: BusinessType;
  saveDraft: (params: {
    step?: OnboardingStep;
    draft?: Partial<OnboardingDraft>;
    businessType?: BusinessType | null;
  }) => Promise<OnboardingState>;
  completeOnboarding: (params: {
    businessType: BusinessType;
    profile: BusinessProfile;
    defaults: BusinessQuickDefaults;
  }) => Promise<void>;
  updateBusinessType: (nextType: BusinessType) => Promise<void>;
  updateBusinessProfile: (nextProfile: BusinessProfile) => Promise<BusinessProfile>;
  updateBusinessDefaults: (nextDefaults: BusinessQuickDefaults) => Promise<BusinessQuickDefaults>;
  dismissExistingUserPrompt: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Checks non-loan/non-installment signals to determine whether this device already
 * ran KamChi before the Onboarding update shipped (e.g. existing license choice or license key).
 */
export function detectExistingInstallWithoutTouchingLoans(): boolean {
  const preloadedLicense = getPreloadedLicenseSnapshot();
  if (
    preloadedLicense &&
    (preloadedLicense.onboardingChoice !== null || preloadedLicense.verifiedLicense !== null)
  ) {
    return true;
  }
  return false;
}

export const OnboardingStateProvider: React.FC<{
  children: React.ReactNode;
  analyticsConsent?: boolean;
}> = ({ children, analyticsConsent = false }) => {
  const initialSnapshot = getPreloadedOnboardingSnapshot();
  const [snapshot, setSnapshot] = useState<PreloadedOnboardingSnapshot | null>(initialSnapshot);
  const [loaded, setLoaded] = useState<boolean>(Boolean(initialSnapshot?.initialized));

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const pre = initialSnapshot ?? (await preloadOnboardingState());
      if (!mounted) return;

      if (!pre.state.completed && detectExistingInstallWithoutTouchingLoans()) {
        const migrated = await migrateExistingUserToOnboarding();
        if (!mounted) return;
        setSnapshot(migrated);
      } else {
        setSnapshot(pre);
      }
      setLoaded(true);
    };

    void init();
    return () => {
      mounted = false;
    };
  }, []);

  const saveDraft = useCallback(
    async (params: {
      step?: OnboardingStep;
      draft?: Partial<OnboardingDraft>;
      businessType?: BusinessType | null;
    }) => {
      const nextState = await persistSaveDraft(params);
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              state: nextState,
              profile: nextState.draft.profile,
              defaults: nextState.draft.defaults,
            }
          : prev
      );
      return nextState;
    },
    []
  );

  const completeOnboarding = useCallback(
    async (params: {
      businessType: BusinessType;
      profile: BusinessProfile;
      defaults: BusinessQuickDefaults;
    }) => {
      const next = await persistCompleteOnboarding(params);
      setSnapshot(next);
      if (analyticsConsent) {
        track('onboarding_completed', { business_type: params.businessType });
      }
    },
    [analyticsConsent]
  );

  const updateBusinessType = useCallback(async (nextType: BusinessType) => {
    const nextState = await persistUpdateBusinessType(nextType);
    setSnapshot((prev) => (prev ? { ...prev, state: nextState } : prev));
  }, []);

  const updateBusinessProfile = useCallback(async (nextProfile: BusinessProfile) => {
    const saved = await persistSaveProfile(nextProfile);
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            profile: saved,
            state: {
              ...prev.state,
              draft: { ...prev.state.draft, profile: saved },
            },
          }
        : prev
    );
    return saved;
  }, []);

  const updateBusinessDefaults = useCallback(async (nextDefaults: BusinessQuickDefaults) => {
    const saved = await persistSaveDefaults(nextDefaults);
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            defaults: saved,
            state: {
              ...prev.state,
              draft: { ...prev.state.draft, defaults: saved },
            },
          }
        : prev
    );
    return saved;
  }, []);

  const dismissExistingUserPrompt = useCallback(async () => {
    const nextState = await persistDismissPrompt();
    setSnapshot((prev) => (prev ? { ...prev, state: nextState } : prev));
  }, []);

  if (!snapshot) {
    return null;
  }

  const resolvedBusinessType: BusinessType =
    snapshot.state.businessType ?? snapshot.state.draft.businessType ?? 'lender';

  return (
    <OnboardingContext.Provider
      value={{
        loaded,
        state: snapshot.state,
        profile: snapshot.profile,
        defaults: snapshot.defaults,
        businessType: resolvedBusinessType,
        saveDraft,
        completeOnboarding,
        updateBusinessType,
        updateBusinessProfile,
        updateBusinessDefaults,
        dismissExistingUserPrompt,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export function useOnboardingContext(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboardingContext must be used inside OnboardingStateProvider');
  }
  return ctx;
}

export function useOptionalOnboardingContext(): OnboardingContextValue | null {
  return useContext(OnboardingContext);
}
