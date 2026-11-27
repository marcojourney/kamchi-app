import { useEffect, useState } from 'react';
import type { BusinessType } from '../../../config/featureAccess';
import { useOptionalOnboardingContext } from '../context/OnboardingContext';
import {
  createDefaultBusinessQuickDefaults,
  createEmptyBusinessProfile,
  getPreloadedOnboardingSnapshot,
  preloadOnboardingState,
} from '../services/onboardingStorage';
import type { BusinessProfile, BusinessQuickDefaults } from '../types';

export interface ReadOnlyBusinessProfileResult {
  loaded: boolean;
  businessType: BusinessType;
  profile: Readonly<BusinessProfile>;
  defaults: Readonly<BusinessQuickDefaults>;
}

/**
 * Read-only hook for receipts, contracts, and reminder message builders.
 * Works both inside OnboardingGate and in standalone views (falling back to preloaded local store).
 */
export function useBusinessProfile(): ReadOnlyBusinessProfileResult {
  const ctx = useOptionalOnboardingContext();
  const initial = getPreloadedOnboardingSnapshot();
  const [fallbackState, setFallbackState] = useState<{
    loaded: boolean;
    businessType: BusinessType;
    profile: BusinessProfile;
    defaults: BusinessQuickDefaults;
  }>(() => ({
    loaded: Boolean(initial?.initialized),
    businessType: initial?.state.businessType ?? 'lender',
    profile: initial?.profile ?? createEmptyBusinessProfile(),
    defaults: initial?.defaults ?? createDefaultBusinessQuickDefaults(),
  }));

  useEffect(() => {
    if (ctx) return;
    let active = true;
    void preloadOnboardingState().then((snap) => {
      if (!active) return;
      setFallbackState({
        loaded: true,
        businessType: snap.state.businessType ?? 'lender',
        profile: snap.profile,
        defaults: snap.defaults,
      });
    });
    return () => {
      active = false;
    };
  }, [ctx]);

  if (ctx) {
    return {
      loaded: ctx.loaded,
      businessType: ctx.businessType,
      profile: ctx.profile,
      defaults: ctx.defaults,
    };
  }

  return fallbackState;
}
