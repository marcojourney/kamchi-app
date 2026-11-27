import type { BusinessType } from '../../config/featureAccess';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export type CurrencyPreference = 'USD' | 'KHR' | 'both';

export interface BusinessProfile {
  name: string;
  ownerName: string;
  phone: string;
  telegram: string;
  address: string;
  province: string;
  logo: string;
  defaultCurrency: CurrencyPreference;
  exchangeRate: number;
  updatedAt?: string;
}

export interface LenderQuickDefaults {
  interestRate: number;
  interestType: 'flat' | 'reducing' | 'interest_only';
  graceDays: number;
  lateFeeType: 'fixed' | 'percent';
  lateFeeValue: number;
  paymentFrequency: 'daily' | 'weekly' | 'monthly';
}

export interface InstallmentQuickDefaults {
  minDownPaymentPercent: number;
  defaultInstallments: number;
  graceDays: number;
  lateFeeType: 'fixed' | 'percent';
  lateFeeValue: number;
  khrRoundingStep: 100 | 500 | 1000;
}

export interface BusinessQuickDefaults {
  lender: LenderQuickDefaults;
  installment: InstallmentQuickDefaults;
}

export interface OnboardingDraft {
  businessType: BusinessType | null;
  profile: BusinessProfile;
  defaults: BusinessQuickDefaults;
}

export interface OnboardingState {
  completed: boolean;
  version: number;
  completedAt: string | null;
  businessType: BusinessType | null;
  step: OnboardingStep;
  draft: OnboardingDraft;
  existingUser?: boolean;
  existingUserPromptDismissed?: boolean;
}

export interface ValidationErrors {
  name?: string;
  ownerName?: string;
  phone?: string;
  telegram?: string;
  address?: string;
  exchangeRate?: string;
}
