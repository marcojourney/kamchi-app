import {
  CLOCK_ROLLBACK_TOLERANCE_MS,
  EXPIRING_SOON_DAYS,
  GRACE_PERIOD_DAYS,
  MAX_FREE_ACTIVE_LOANS,
} from '../config/license';
import { FREE_INSTALLMENT_LIMIT } from '../config/featureAccess';
import {
  dayNumberFromMs,
  dayNumberToDateIso,
  type LicenseBillingCycle,
  type LicensePayload,
  type LicensePlanId,
} from './licenseKey';

export type EffectivePlan = 'free' | LicensePlanId;

export type LicenseLifecycleStatus =
  | 'free'
  | 'active'
  | 'expiring_soon'
  | 'grace'
  | 'read_only';

export interface DerivedLicenseState {
  status: LicenseLifecycleStatus;
  plan: EffectivePlan; // Active entitled plan ('free' when unactivated or read_only)
  licensedPlan: LicensePlanId | null; // Underlying key plan even when in read_only
  billing: LicenseBillingCycle | null;
  expiresAtDay: number | null; // 0 = lifetime
  expiryDateIso: string | null;
  daysRemaining: number | null; // null for free or lifetime
  graceDaysRemaining: number | null;
  keyIdHex: string | null;
  maskedKey: string | null;
  isBoundToDevice: boolean;
  clockTampered: boolean;
  effectiveTimestampMs: number;
}

export type BlockedActionReason =
  | 'read_only'
  | 'free_loan_limit'
  | 'free_installment_limit'
  | 'pro_export'
  | 'pro_backup'
  | 'pro_telegram'
  | 'business_staff'
  | 'business_contracts';

export function detectClockRollback(nowMs: number, latestSeenTimeMs: number): boolean {
  if (!Number.isFinite(latestSeenTimeMs) || latestSeenTimeMs <= 0) {
    return false;
  }
  return nowMs < latestSeenTimeMs - CLOCK_ROLLBACK_TOLERANCE_MS;
}

export function resolveLicenseState(input: {
  verifiedLicense: {
    payload: LicensePayload;
    keyIdHex: string;
    maskedKey: string;
    isBoundToDevice: boolean;
  } | null;
  nowMs?: number;
  latestSeenTimeMs?: number;
}): DerivedLicenseState {
  const nowMs = input.nowMs ?? Date.now();
  const latestSeen = input.latestSeenTimeMs ?? 0;
  const clockTampered = detectClockRollback(nowMs, latestSeen);
  const effectiveTimestampMs = clockTampered ? latestSeen : nowMs;

  if (!input.verifiedLicense) {
    return {
      status: 'free',
      plan: 'free',
      licensedPlan: null,
      billing: null,
      expiresAtDay: null,
      expiryDateIso: null,
      daysRemaining: null,
      graceDaysRemaining: null,
      keyIdHex: null,
      maskedKey: null,
      isBoundToDevice: false,
      clockTampered,
      effectiveTimestampMs,
    };
  }

  const { payload, keyIdHex, maskedKey, isBoundToDevice } = input.verifiedLicense;
  const effectiveDay = dayNumberFromMs(effectiveTimestampMs);

  // Lifetime key (expiresAtDay === 0)
  if (payload.expiresAtDay === 0 || payload.billing === 'lifetime') {
    return {
      status: 'active',
      plan: payload.plan,
      licensedPlan: payload.plan,
      billing: payload.billing,
      expiresAtDay: 0,
      expiryDateIso: null,
      daysRemaining: null,
      graceDaysRemaining: null,
      keyIdHex,
      maskedKey,
      isBoundToDevice,
      clockTampered,
      effectiveTimestampMs,
    };
  }

  const expiryDateIso = dayNumberToDateIso(payload.expiresAtDay);
  const daysRemaining = payload.expiresAtDay - effectiveDay;

  if (daysRemaining > EXPIRING_SOON_DAYS) {
    return {
      status: 'active',
      plan: payload.plan,
      licensedPlan: payload.plan,
      billing: payload.billing,
      expiresAtDay: payload.expiresAtDay,
      expiryDateIso,
      daysRemaining,
      graceDaysRemaining: null,
      keyIdHex,
      maskedKey,
      isBoundToDevice,
      clockTampered,
      effectiveTimestampMs,
    };
  }

  if (daysRemaining >= 0) {
    return {
      status: 'expiring_soon',
      plan: payload.plan,
      licensedPlan: payload.plan,
      billing: payload.billing,
      expiresAtDay: payload.expiresAtDay,
      expiryDateIso,
      daysRemaining,
      graceDaysRemaining: null,
      keyIdHex,
      maskedKey,
      isBoundToDevice,
      clockTampered,
      effectiveTimestampMs,
    };
  }

  const daysPastExpiry = -daysRemaining;
  if (daysPastExpiry <= GRACE_PERIOD_DAYS) {
    return {
      status: 'grace',
      plan: payload.plan,
      licensedPlan: payload.plan,
      billing: payload.billing,
      expiresAtDay: payload.expiresAtDay,
      expiryDateIso,
      daysRemaining: 0,
      graceDaysRemaining: GRACE_PERIOD_DAYS - daysPastExpiry + 1,
      keyIdHex,
      maskedKey,
      isBoundToDevice,
      clockTampered,
      effectiveTimestampMs,
    };
  }

  // Expired past 7-day grace period -> READ-ONLY mode
  return {
    status: 'read_only',
    plan: 'free',
    licensedPlan: payload.plan,
    billing: payload.billing,
    expiresAtDay: payload.expiresAtDay,
    expiryDateIso,
    daysRemaining: 0,
    graceDaysRemaining: 0,
    keyIdHex,
    maskedKey,
    isBoundToDevice,
    clockTampered,
    effectiveTimestampMs,
  };
}

export function isLicensedKeyPastGrace(
  payload: LicensePayload,
  nowMs: number,
  latestSeenTimeMs = 0
): boolean {
  if (payload.expiresAtDay === 0 || payload.billing === 'lifetime') {
    return false;
  }
  const clockTampered = detectClockRollback(nowMs, latestSeenTimeMs);
  const effectiveMs = clockTampered ? latestSeenTimeMs : nowMs;
  const effectiveDay = dayNumberFromMs(effectiveMs);
  return effectiveDay > payload.expiresAtDay + GRACE_PERIOD_DAYS;
}

/**
 * Central entitlement checks used across UI, data mutations, and export helpers.
 */

export function isReadOnly(state: DerivedLicenseState): boolean {
  return state.status === 'read_only';
}

export function getEffectivePlan(state: DerivedLicenseState): EffectivePlan {
  return state.plan;
}

export function canCreateLoan(
  state: DerivedLicenseState,
  activeLoanCount: number
): boolean {
  if (isReadOnly(state)) {
    return false;
  }
  if (state.plan === 'pro' || state.plan === 'business') {
    return true;
  }
  // Free plan (including downgraded Pro users) supports up to MAX_FREE_ACTIVE_LOANS.
  // Existing loans (>10) remain accessible; only creating NEW loans is blocked.
  return activeLoanCount < MAX_FREE_ACTIVE_LOANS;
}

export function canCreateBorrower(state: DerivedLicenseState): boolean {
  return !isReadOnly(state);
}

export function canRecordPayment(_state: DerivedLicenseState): boolean {
  // Recording payments on existing loans is ALWAYS allowed, even in read-only or downgraded mode.
  return true;
}

export function canExport(state: DerivedLicenseState): boolean {
  // In read-only mode, user data remains accessible AND exportable.
  if (isReadOnly(state)) {
    return true;
  }
  return state.plan === 'pro' || state.plan === 'business';
}

export function canBackupExport(state: DerivedLicenseState): boolean {
  // Users can always export their JSON data during Pro/Business or Read-Only mode.
  return canExport(state);
}

export function canBackupRestore(state: DerivedLicenseState): boolean {
  if (isReadOnly(state)) {
    return false;
  }
  return state.plan === 'pro' || state.plan === 'business';
}

export function canUseTelegramReminders(state: DerivedLicenseState): boolean {
  if (isReadOnly(state)) {
    return false;
  }
  return state.plan === 'pro' || state.plan === 'business';
}

export function canUseStaffAccounts(state: DerivedLicenseState): boolean {
  if (isReadOnly(state)) {
    return false;
  }
  return state.plan === 'business';
}

export function canExportContracts(state: DerivedLicenseState): boolean {
  if (isReadOnly(state)) {
    return false;
  }
  return state.plan === 'business';
}

export function getCreateLoanBlockReason(
  state: DerivedLicenseState,
  activeLoanCount: number
): BlockedActionReason | null {
  if (canCreateLoan(state, activeLoanCount)) return null;
  return isReadOnly(state) ? 'read_only' : 'free_loan_limit';
}

export function canCreateInstallmentLoan(
  state: DerivedLicenseState,
  activeInstallmentCount: number,
  freeLimit: number = FREE_INSTALLMENT_LIMIT
): { allowed: boolean; blockReason: BlockedActionReason | null } {
  if (isReadOnly(state)) {
    return { allowed: false, blockReason: 'read_only' };
  }
  if (state.plan === 'pro' || state.plan === 'business') {
    return { allowed: true, blockReason: null };
  }
  if (activeInstallmentCount < freeLimit) {
    return { allowed: true, blockReason: null };
  }
  return { allowed: false, blockReason: 'free_installment_limit' };
}
