import type { EffectivePlan } from '../lib/entitlements';

/**
 * Single configurable flag allowing users to enable both Lender and Installment Shop modes.
 * Keep false by default; flip to true to expose the "Use both" option in onboarding & Settings.
 */
export const SUPPORT_BOTH_TYPES = false;

/**
 * Maximum number of active installment loans permitted on the Free plan.
 */
export const FREE_INSTALLMENT_LIMIT = 10;

export type BusinessType = 'lender' | 'installment_shop' | 'both';

export interface EnabledFeatures {
  loans: boolean;
  installments: boolean;
  marketchainImport: boolean;
}

export type AppFeatureTab =
  | 'dashboard'
  | 'loans'
  | 'installments'
  | 'marketchain_import'
  | 'borrowers'
  | 'reports'
  | 'staff'
  | 'settings';

export interface GetEnabledFeaturesOptions {
  supportBothTypes?: boolean;
}

/**
 * Single source of truth for feature visibility across navigation, routes, and quick actions.
 * Plan limits stay in src/lib/entitlements.ts; this determines module availability by business type.
 */
export function getEnabledFeatures(
  businessType: BusinessType | null | undefined,
  _plan: EffectivePlan = 'free',
  options?: GetEnabledFeaturesOptions
): EnabledFeatures {
  const allowBoth = options?.supportBothTypes ?? SUPPORT_BOTH_TYPES;

  if (businessType === 'both' && allowBoth) {
    return {
      loans: true,
      installments: true,
      marketchainImport: true,
    };
  }

  if (businessType === 'installment_shop') {
    return {
      loans: false,
      installments: true,
      marketchainImport: true,
    };
  }

  // Default & existing-user upgrade path: 'lender'
  return {
    loans: true,
    installments: false,
    marketchainImport: false,
  };
}

export function getDerivedFeaturesFlags(
  businessType: BusinessType | null | undefined,
  plan: EffectivePlan = 'free',
  options?: GetEnabledFeaturesOptions
): {
  loans: boolean;
  installmentLoans: boolean;
  marketchainImport: boolean;
} {
  const enabled = getEnabledFeatures(businessType, plan, options);
  return {
    loans: enabled.loans,
    installmentLoans: enabled.installments,
    marketchainImport: enabled.marketchainImport,
  };
}

/**
 * Derived default FEATURES object; consumers with dynamic business type should call getEnabledFeatures().
 */
export const FEATURES = getDerivedFeaturesFlags('lender', 'free');

export function isRouteFeatureEnabled(
  tab: AppFeatureTab,
  features: EnabledFeatures
): boolean {
  switch (tab) {
    case 'loans':
      return features.loans;
    case 'installments':
      return features.installments;
    case 'marketchain_import':
      return features.marketchainImport;
    case 'dashboard':
    case 'borrowers':
    case 'reports':
    case 'staff':
    case 'settings':
      return true;
  }
}

export function getVisiblePrimaryTabs(features: EnabledFeatures): AppFeatureTab[] {
  const tabs: AppFeatureTab[] = ['dashboard'];
  if (features.loans) {
    tabs.push('loans');
  }
  if (features.installments) {
    tabs.push('installments');
  }
  tabs.push('borrowers', 'reports', 'settings');
  return tabs;
}
