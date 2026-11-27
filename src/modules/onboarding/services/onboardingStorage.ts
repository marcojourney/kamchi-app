import type { BusinessType } from '../../../config/featureAccess';
import {
  DEFAULT_EXCHANGE_RATE_KHR,
  ONBOARDING_DB_NAME,
  ONBOARDING_DB_VERSION,
  ONBOARDING_LOCAL_KEYS,
  ONBOARDING_VERSION,
} from '../config';
import type {
  BusinessProfile,
  BusinessQuickDefaults,
  OnboardingDraft,
  OnboardingState,
  OnboardingStep,
} from '../types';
import { sanitizeBusinessProfile } from './validation';

const STORE_STATE = 'onboarding_state';
const STORE_PROFILE = 'business_profile';
const STORE_DEFAULTS = 'business_defaults';

const KEY_STATE = 'business_onboarding_state';
const KEY_PROFILE = 'business_profile_record';
const KEY_DEFAULTS = 'business_defaults_record';

export function createEmptyBusinessProfile(): BusinessProfile {
  return {
    name: '',
    ownerName: '',
    phone: '',
    telegram: '',
    address: '',
    province: '',
    logo: '',
    defaultCurrency: 'USD',
    exchangeRate: DEFAULT_EXCHANGE_RATE_KHR,
  };
}

export function createDefaultBusinessQuickDefaults(): BusinessQuickDefaults {
  return {
    lender: {
      interestRate: 3,
      interestType: 'flat',
      graceDays: 3,
      lateFeeType: 'fixed',
      lateFeeValue: 5,
      paymentFrequency: 'monthly',
    },
    installment: {
      minDownPaymentPercent: 20,
      defaultInstallments: 6,
      graceDays: 3,
      lateFeeType: 'fixed',
      lateFeeValue: 5,
      khrRoundingStep: 500,
    },
  };
}

export function createEmptyDraft(): OnboardingDraft {
  return {
    businessType: null,
    profile: createEmptyBusinessProfile(),
    defaults: createDefaultBusinessQuickDefaults(),
  };
}

export function createInitialOnboardingState(): OnboardingState {
  return {
    completed: false,
    version: ONBOARDING_VERSION,
    completedAt: null,
    businessType: null,
    step: 1,
    draft: createEmptyDraft(),
    existingUser: false,
    existingUserPromptDismissed: false,
  };
}

export interface OnboardingStorageDriver {
  getItem: <T>(storeName: string, key: string, fallbackKey: string) => Promise<T | null>;
  setItem: <T>(storeName: string, key: string, value: T, fallbackKey: string) => Promise<void>;
}

const memoryFallbackMap = new Map<string, string>();

function readFallback<T>(fallbackKey: string): T | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(fallbackKey);
      return raw ? (JSON.parse(raw) as T) : null;
    }
  } catch {
    // Ignore restricted storage
  }
  const mem = memoryFallbackMap.get(fallbackKey);
  return mem ? (JSON.parse(mem) as T) : null;
}

function writeFallback<T>(fallbackKey: string, value: T): void {
  const serialized = JSON.stringify(value);
  memoryFallbackMap.set(fallbackKey, serialized);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(fallbackKey, serialized);
    }
  } catch {
    // Ignore restricted storage
  }
}

function openOnboardingDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(ONBOARDING_DB_NAME, ONBOARDING_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_STATE)) {
          db.createObjectStore(STORE_STATE);
        }
        if (!db.objectStoreNames.contains(STORE_PROFILE)) {
          db.createObjectStore(STORE_PROFILE);
        }
        if (!db.objectStoreNames.contains(STORE_DEFAULTS)) {
          db.createObjectStore(STORE_DEFAULTS);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const indexedDbDriver: OnboardingStorageDriver = {
  async getItem<T>(storeName: string, key: string, fallbackKey: string): Promise<T | null> {
    const db = await openOnboardingDb();
    if (!db) {
      return readFallback<T>(fallbackKey);
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => {
          db.close();
          if (req.result !== undefined && req.result !== null) {
            resolve(req.result as T);
          } else {
            resolve(readFallback<T>(fallbackKey));
          }
        };
        req.onerror = () => {
          db.close();
          resolve(readFallback<T>(fallbackKey));
        };
      } catch {
        db.close();
        resolve(readFallback<T>(fallbackKey));
      }
    });
  },
  async setItem<T>(
    storeName: string,
    key: string,
    value: T,
    fallbackKey: string
  ): Promise<void> {
    writeFallback(fallbackKey, value);
    const db = await openOnboardingDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  },
};

let activeDriver: OnboardingStorageDriver = indexedDbDriver;

export interface PreloadedOnboardingSnapshot {
  initialized: boolean;
  state: OnboardingState;
  profile: BusinessProfile;
  defaults: BusinessQuickDefaults;
}

let preloadedSnapshot: PreloadedOnboardingSnapshot | null = null;

function mergeStateWithDefaults(raw: Partial<OnboardingState> | null): OnboardingState {
  const base = createInitialOnboardingState();
  if (!raw) return base;
  const draftProfile = sanitizeBusinessProfile({
    ...base.draft.profile,
    ...(raw.draft?.profile || {}),
  });
  const defaults: BusinessQuickDefaults = {
    lender: {
      ...base.draft.defaults.lender,
      ...(raw.draft?.defaults?.lender || {}),
    },
    installment: {
      ...base.draft.defaults.installment,
      ...(raw.draft?.defaults?.installment || {}),
    },
  };
  const stepNum = Number(raw.step);
  const clampedStep: OnboardingStep =
    stepNum >= 1 && stepNum <= 5 ? (stepNum as OnboardingStep) : 1;

  return {
    completed: Boolean(raw.completed),
    version: typeof raw.version === 'number' ? raw.version : ONBOARDING_VERSION,
    completedAt: raw.completedAt ?? null,
    businessType: raw.businessType ?? raw.draft?.businessType ?? null,
    step: clampedStep,
    draft: {
      businessType: raw.draft?.businessType ?? raw.businessType ?? null,
      profile: draftProfile,
      defaults,
    },
    existingUser: Boolean(raw.existingUser),
    existingUserPromptDismissed: Boolean(raw.existingUserPromptDismissed),
  };
}

export async function readOnboardingState(): Promise<OnboardingState> {
  const stored = await activeDriver.getItem<OnboardingState>(
    STORE_STATE,
    KEY_STATE,
    ONBOARDING_LOCAL_KEYS.state
  );
  return mergeStateWithDefaults(stored);
}

export async function writeOnboardingState(next: OnboardingState): Promise<OnboardingState> {
  const normalized = mergeStateWithDefaults(next);
  await activeDriver.setItem(STORE_STATE, KEY_STATE, normalized, ONBOARDING_LOCAL_KEYS.state);
  if (preloadedSnapshot) {
    preloadedSnapshot = { ...preloadedSnapshot, state: normalized };
  }
  return normalized;
}

export async function readBusinessProfile(): Promise<BusinessProfile> {
  const stored = await activeDriver.getItem<BusinessProfile>(
    STORE_PROFILE,
    KEY_PROFILE,
    ONBOARDING_LOCAL_KEYS.profile
  );
  if (!stored) {
    return createEmptyBusinessProfile();
  }
  return sanitizeBusinessProfile({
    ...createEmptyBusinessProfile(),
    ...stored,
  });
}

export async function saveBusinessProfile(
  profile: BusinessProfile
): Promise<BusinessProfile> {
  const sanitized = sanitizeBusinessProfile({
    ...profile,
    updatedAt: new Date().toISOString(),
  });
  await activeDriver.setItem(
    STORE_PROFILE,
    KEY_PROFILE,
    sanitized,
    ONBOARDING_LOCAL_KEYS.profile
  );
  if (preloadedSnapshot) {
    preloadedSnapshot = { ...preloadedSnapshot, profile: sanitized };
  }
  return sanitized;
}

export async function readBusinessDefaults(): Promise<BusinessQuickDefaults> {
  const stored = await activeDriver.getItem<BusinessQuickDefaults>(
    STORE_DEFAULTS,
    KEY_DEFAULTS,
    ONBOARDING_LOCAL_KEYS.defaults
  );
  const base = createDefaultBusinessQuickDefaults();
  if (!stored) return base;
  return {
    lender: { ...base.lender, ...(stored.lender || {}) },
    installment: { ...base.installment, ...(stored.installment || {}) },
  };
}

export async function saveBusinessDefaults(
  defaults: BusinessQuickDefaults
): Promise<BusinessQuickDefaults> {
  const base = createDefaultBusinessQuickDefaults();
  const normalized: BusinessQuickDefaults = {
    lender: { ...base.lender, ...(defaults.lender || {}) },
    installment: { ...base.installment, ...(defaults.installment || {}) },
  };
  await activeDriver.setItem(
    STORE_DEFAULTS,
    KEY_DEFAULTS,
    normalized,
    ONBOARDING_LOCAL_KEYS.defaults
  );
  if (preloadedSnapshot) {
    preloadedSnapshot = { ...preloadedSnapshot, defaults: normalized };
  }
  return normalized;
}

export async function saveOnboardingDraft(params: {
  step?: OnboardingStep;
  draft?: Partial<OnboardingDraft>;
  businessType?: BusinessType | null;
}): Promise<OnboardingState> {
  const current = await readOnboardingState();
  const nextDraft: OnboardingDraft = {
    businessType:
      params.businessType !== undefined
        ? params.businessType
        : params.draft?.businessType !== undefined
          ? params.draft.businessType
          : current.draft.businessType,
    profile: params.draft?.profile
      ? sanitizeBusinessProfile({ ...current.draft.profile, ...params.draft.profile })
      : current.draft.profile,
    defaults: params.draft?.defaults
      ? {
          lender: { ...current.draft.defaults.lender, ...(params.draft.defaults.lender || {}) },
          installment: {
            ...current.draft.defaults.installment,
            ...(params.draft.defaults.installment || {}),
          },
        }
      : current.draft.defaults,
  };

  return writeOnboardingState({
    ...current,
    step: params.step ?? current.step,
    businessType: nextDraft.businessType ?? current.businessType,
    draft: nextDraft,
  });
}

export async function completeOnboarding(params: {
  businessType: BusinessType;
  profile: BusinessProfile;
  defaults: BusinessQuickDefaults;
}): Promise<PreloadedOnboardingSnapshot> {
  const savedProfile = await saveBusinessProfile(params.profile);
  const savedDefaults = await saveBusinessDefaults(params.defaults);
  const current = await readOnboardingState();
  const completedState = await writeOnboardingState({
    ...current,
    completed: true,
    version: ONBOARDING_VERSION,
    completedAt: new Date().toISOString(),
    businessType: params.businessType,
    step: 5,
    draft: {
      businessType: params.businessType,
      profile: savedProfile,
      defaults: savedDefaults,
    },
    existingUser: false,
  });

  preloadedSnapshot = {
    initialized: true,
    state: completedState,
    profile: savedProfile,
    defaults: savedDefaults,
  };
  return preloadedSnapshot;
}

/**
 * Upgrades an existing install seamlessly without forcing first-run onboarding.
 * Sets businessType = 'lender', completed = true, existingUser = true.
 */
export async function migrateExistingUserToOnboarding(
  existingProfile?: Partial<BusinessProfile>
): Promise<PreloadedOnboardingSnapshot> {
  const current = await readOnboardingState();
  if (current.completed) {
    const profile = await readBusinessProfile();
    const defaults = await readBusinessDefaults();
    return { initialized: true, state: current, profile, defaults };
  }

  const currentProfile = await readBusinessProfile();
  const mergedProfile = sanitizeBusinessProfile({
    ...currentProfile,
    ...(existingProfile || {}),
  });
  const savedProfile = await saveBusinessProfile(mergedProfile);
  const defaults = await readBusinessDefaults();

  const migratedState = await writeOnboardingState({
    ...current,
    completed: true,
    version: ONBOARDING_VERSION,
    completedAt: new Date().toISOString(),
    businessType: 'lender',
    step: 5,
    draft: {
      businessType: 'lender',
      profile: savedProfile,
      defaults,
    },
    existingUser: true,
    existingUserPromptDismissed: false,
  });

  preloadedSnapshot = {
    initialized: true,
    state: migratedState,
    profile: savedProfile,
    defaults,
  };
  return preloadedSnapshot;
}

export async function dismissExistingUserPrompt(): Promise<OnboardingState> {
  const current = await readOnboardingState();
  return writeOnboardingState({
    ...current,
    existingUserPromptDismissed: true,
  });
}

export async function updateBusinessType(
  nextType: BusinessType
): Promise<OnboardingState> {
  const current = await readOnboardingState();
  return writeOnboardingState({
    ...current,
    businessType: nextType,
    existingUser: current.existingUser,
    existingUserPromptDismissed: true,
    draft: {
      ...current.draft,
      businessType: nextType,
    },
  });
}

/**
 * Reads persisted onboarding state before first render so main app never flashes.
 */
export async function preloadOnboardingState(): Promise<PreloadedOnboardingSnapshot> {
  const [state, profile, defaults] = await Promise.all([
    readOnboardingState(),
    readBusinessProfile(),
    readBusinessDefaults(),
  ]);
  preloadedSnapshot = {
    initialized: true,
    state,
    profile,
    defaults,
  };
  return preloadedSnapshot;
}

export function getPreloadedOnboardingSnapshot(): PreloadedOnboardingSnapshot | null {
  return preloadedSnapshot;
}

/**
 * Test-only hook to swap storage driver cleanly without touching browser globals or real data stores.
 */
export function __setOnboardingStorageDriverForTests(
  driver: OnboardingStorageDriver | null
): void {
  preloadedSnapshot = null;
  memoryFallbackMap.clear();
  activeDriver = driver ?? indexedDbDriver;
}
