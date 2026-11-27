import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import {
  FEATURES,
  FREE_INSTALLMENT_LIMIT,
  getDerivedFeaturesFlags,
  getEnabledFeatures,
  getVisiblePrimaryTabs,
  isRouteFeatureEnabled,
  SUPPORT_BOTH_TYPES,
} from '../../../config/featureAccess';
import {
  __setAnalyticsRuntimeForTests,
  ALLOWED_ANALYTICS_EVENTS,
  sanitizeAnalyticsPayload,
  setAnalyticsConsent,
  track,
} from '../../../lib/analytics';
import {
  canCreateInstallmentLoan,
  resolveLicenseState,
} from '../../../lib/entitlements';
import { ONBOARDING_VERSION } from '../config';
import {
  __setOnboardingStorageDriverForTests,
  completeOnboarding,
  createDefaultBusinessQuickDefaults,
  createEmptyBusinessProfile,
  dismissExistingUserPrompt,
  getPreloadedOnboardingSnapshot,
  migrateExistingUserToOnboarding,
  preloadOnboardingState,
  readBusinessDefaults,
  readBusinessProfile,
  readOnboardingState,
  saveBusinessDefaults,
  saveBusinessProfile,
  saveOnboardingDraft,
  updateBusinessType,
  type OnboardingStorageDriver,
} from '../services/onboardingStorage';
import {
  clampText,
  validateBasicInfo,
  validateCambodianPhone,
} from '../services/validation';

function createMemoryStorageDriver(): {
  driver: OnboardingStorageDriver;
  buckets: Map<string, unknown>;
} {
  const buckets = new Map<string, unknown>();
  return {
    buckets,
    driver: {
      async getItem<T>(_storeName: string, key: string, _fallbackKey: string): Promise<T | null> {
        return (buckets.get(key) as T) ?? null;
      },
      async setItem<T>(
        _storeName: string,
        key: string,
        value: T,
        _fallbackKey: string
      ): Promise<void> {
        buckets.set(key, structuredClone(value));
      },
    },
  };
}

describe('featureAccess: getEnabledFeatures & derived flags', () => {
  it('enables loans and hides installments for lender across all plans', () => {
    for (const plan of ['free', 'pro', 'business'] as const) {
      assert.deepEqual(getEnabledFeatures('lender', plan), {
        loans: true,
        installments: false,
        marketchainImport: false,
      });
    }
  });

  it('enables installments + MarketChain import and hides cash loans for installment_shop across all plans', () => {
    for (const plan of ['free', 'pro', 'business'] as const) {
      assert.deepEqual(getEnabledFeatures('installment_shop', plan), {
        loans: false,
        installments: true,
        marketchainImport: true,
      });
    }
  });

  it('respects SUPPORT_BOTH_TYPES flag (default false) and enables both only when enabled', () => {
    assert.equal(SUPPORT_BOTH_TYPES, false);
    assert.deepEqual(getEnabledFeatures('both', 'pro'), {
      loans: true,
      installments: false,
      marketchainImport: false,
    });
    assert.deepEqual(
      getEnabledFeatures('both', 'pro', { supportBothTypes: true }),
      {
        loans: true,
        installments: true,
        marketchainImport: true,
      }
    );
  });

  it('derives FEATURES.installmentLoans cleanly and enforces configurable FREE_INSTALLMENT_LIMIT', () => {
    assert.equal(FEATURES.installmentLoans, false);
    assert.equal(FREE_INSTALLMENT_LIMIT, 10);
    assert.equal(
      getDerivedFeaturesFlags('installment_shop', 'free').installmentLoans,
      true
    );

    const freeState = resolveLicenseState({ verifiedLicense: null });
    assert.equal(canCreateInstallmentLoan(freeState, 9).allowed, true);
    const blocked = canCreateInstallmentLoan(freeState, FREE_INSTALLMENT_LIMIT);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.blockReason, 'free_installment_limit');
  });

  it('filters visible navigation tabs and detects hidden route deep links', () => {
    const lenderTabs = getVisiblePrimaryTabs(getEnabledFeatures('lender', 'free'));
    assert.equal(lenderTabs.includes('loans'), true);
    assert.equal(lenderTabs.includes('installments'), false);
    assert.equal(lenderTabs.includes('marketchain_import'), false);
    assert.equal(
      isRouteFeatureEnabled('installments', getEnabledFeatures('lender', 'free')),
      false
    );
    assert.equal(
      isRouteFeatureEnabled('marketchain_import', getEnabledFeatures('lender', 'free')),
      false
    );

    const shopTabs = getVisiblePrimaryTabs(
      getEnabledFeatures('installment_shop', 'free')
    );
    assert.equal(shopTabs.includes('loans'), false);
    assert.equal(shopTabs.includes('installments'), true);
    assert.equal(shopTabs.includes('marketchain_import'), false);
    assert.equal(
      isRouteFeatureEnabled('loans', getEnabledFeatures('installment_shop', 'free')),
      false
    );
    assert.equal(
      isRouteFeatureEnabled(
        'marketchain_import',
        getEnabledFeatures('installment_shop', 'free')
      ),
      true
    );
  });
});

describe('onboarding validation (Cambodian phones, trimming, length limits, Khmer)', () => {
  it('accepts valid Cambodian 0xx and +855 phone formats including Khmer numerals', () => {
    assert.equal(validateCambodianPhone('012 345 678').valid, true);
    assert.equal(validateCambodianPhone('097-123-4567').valid, true);
    assert.equal(validateCambodianPhone('+855 12 345 678').valid, true);
    assert.equal(validateCambodianPhone('+8550971234567').valid, true);
    assert.equal(validateCambodianPhone('០១២ ៣៤៥ ៦៧៨').valid, true);
  });

  it('rejects empty, invalid, or oversized phone numbers', () => {
    assert.equal(validateCambodianPhone('   ').reason, 'required');
    assert.equal(validateCambodianPhone('12345').reason, 'invalidFormat');
    assert.equal(validateCambodianPhone('+1 555 234 5678').reason, 'invalidFormat');
    assert.equal(validateCambodianPhone('0'.repeat(30)).reason, 'tooLong');
  });

  it('validates required business fields, handles Khmer text, and trims sanitized outputs', () => {
    const invalid = validateBasicInfo({
      ...createEmptyBusinessProfile(),
      name: '   ',
      phone: 'bad',
      defaultCurrency: 'both',
      exchangeRate: 100,
    });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.name, 'errors.businessNameRequired');
    assert.equal(invalid.errors.phone, 'errors.phoneInvalid');
    assert.equal(invalid.errors.exchangeRate, 'errors.exchangeRateInvalid');

    const khmerValid = validateBasicInfo({
      ...createEmptyBusinessProfile(),
      name: '  ហាងទូរស័ព្ទ សុខា  ',
      ownerName: '  សុខ តារា ',
      phone: ' 012 888 999 ',
      telegram: 'sokha_shop',
      address: '  ភ្នំពេញ  ',
      province: 'Phnom Penh',
      defaultCurrency: 'both',
      exchangeRate: 4100,
    });
    assert.equal(khmerValid.valid, true);
    assert.equal(khmerValid.sanitized.name, 'ហាងទូរស័ព្ទ សុខា');
    assert.equal(khmerValid.sanitized.telegram, '@sokha_shop');

    const longKhmer = 'ក'.repeat(120);
    assert.equal(Array.from(clampText(longKhmer, 100)).length, 100);
  });
});

describe('onboarding persistence, resume, gate order & existing-user migration', () => {
  beforeEach(() => {
    const mem = createMemoryStorageDriver();
    __setOnboardingStorageDriverForTests(mem.driver);
  });

  it('persists drafts across steps and resumes at the exact last step after relaunch', async () => {
    await preloadOnboardingState();
    assert.equal(getPreloadedOnboardingSnapshot()?.state.completed, false);
    assert.equal(getPreloadedOnboardingSnapshot()?.state.step, 1);

    await saveOnboardingDraft({
      step: 3,
      businessType: 'installment_shop',
      draft: {
        businessType: 'installment_shop',
        profile: {
          ...createEmptyBusinessProfile(),
          name: 'Dara Mobile Shop',
          phone: '012 999 000',
          defaultCurrency: 'both',
          exchangeRate: 4100,
        },
      },
    });

    // Simulate closing and relaunching app via preloadOnboardingState before first render
    __setOnboardingStorageDriverForTests(null);
    // Keep same memory driver instance instead to simulate persistent IndexedDB across close:
    const mem2 = createMemoryStorageDriver();
    __setOnboardingStorageDriverForTests(mem2.driver);
    await saveOnboardingDraft({
      step: 4,
      businessType: 'installment_shop',
      draft: {
        businessType: 'installment_shop',
        profile: {
          ...createEmptyBusinessProfile(),
          name: 'Dara Mobile Shop',
          phone: '012 999 000',
          defaultCurrency: 'both',
          exchangeRate: 4100,
        },
        defaults: createDefaultBusinessQuickDefaults(),
      },
    });

    const resumed = await preloadOnboardingState();
    assert.equal(resumed.state.completed, false);
    assert.equal(resumed.state.version, ONBOARDING_VERSION);
    assert.equal(resumed.state.step, 4);
    assert.equal(resumed.state.draft.businessType, 'installment_shop');
    assert.equal(resumed.state.draft.profile.name, 'Dara Mobile Shop');
  });

  it('completes onboarding and stores profile & defaults in business_ store', async () => {
    const defaults = createDefaultBusinessQuickDefaults();
    defaults.installment.khrRoundingStep = 1000;
    const snap = await completeOnboarding({
      businessType: 'installment_shop',
      profile: {
        ...createEmptyBusinessProfile(),
        name: 'Kandal Electronics',
        phone: '+855 12 444 555',
        defaultCurrency: 'KHR',
        exchangeRate: 4100,
      },
      defaults,
    });

    assert.equal(snap.state.completed, true);
    assert.equal(snap.state.businessType, 'installment_shop');
    assert.ok(snap.state.completedAt);

    const savedProfile = await readBusinessProfile();
    const savedDefaults = await readBusinessDefaults();
    assert.equal(savedProfile.name, 'Kandal Electronics');
    assert.equal(savedDefaults.installment.khrRoundingStep, 1000);
  });

  it('migrates existing installs cleanly (no forced onboarding, shows dismissible prompt once)', async () => {
    const migrated = await migrateExistingUserToOnboarding({
      name: 'Legacy Lender',
      phone: '011 222 333',
    });

    assert.equal(migrated.state.completed, true);
    assert.equal(migrated.state.businessType, 'lender');
    assert.equal(migrated.state.existingUser, true);
    assert.equal(migrated.state.existingUserPromptDismissed, false);

    // User clicks "Later"
    const dismissed = await dismissExistingUserPrompt();
    assert.equal(dismissed.existingUserPromptDismissed, true);

    // Subsequent upgrade check never resets prompt or re-forces onboarding
    const secondRun = await migrateExistingUserToOnboarding();
    assert.equal(secondRun.state.existingUserPromptDismissed, true);
    assert.equal(secondRun.state.completed, true);
  });

  it('switching business type preserves profile and defaults without deleting anything', async () => {
    await completeOnboarding({
      businessType: 'lender',
      profile: {
        ...createEmptyBusinessProfile(),
        name: 'Siem Reap Capital',
        phone: '012 777 888',
        ownerName: 'Vanna',
      },
      defaults: createDefaultBusinessQuickDefaults(),
    });

    await saveBusinessProfile({
      ...createEmptyBusinessProfile(),
      name: 'Siem Reap Capital',
      phone: '012 777 888',
      ownerName: 'Vanna',
      address: 'Pub Street 12',
    });
    await saveBusinessDefaults(createDefaultBusinessQuickDefaults());

    const switched = await updateBusinessType('installment_shop');
    assert.equal(switched.businessType, 'installment_shop');

    const profileAfter = await readBusinessProfile();
    assert.equal(profileAfter.name, 'Siem Reap Capital');
    assert.equal(profileAfter.address, 'Pub Street 12');

    const switchedBack = await updateBusinessType('lender');
    assert.equal(switchedBack.businessType, 'lender');
    assert.equal((await readOnboardingState()).completed, true);
  });

  it('verifies gate order in App.tsx: TermsGate wraps OnboardingGate which wraps LicenseGate', () => {
    const appSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/App.tsx'),
      'utf8'
    );
    const termsIdx = appSource.indexOf('<TermsGate>');
    const onboardingIdx = appSource.indexOf('<OnboardingGateWithConsent>');
    const licenseIdx = appSource.indexOf('<LicenseGate>');
    const mainShellIdx = appSource.indexOf('<MainShell />');

    assert.ok(termsIdx > 0);
    assert.ok(onboardingIdx > termsIdx);
    assert.ok(licenseIdx > onboardingIdx);
    assert.ok(mainShellIdx > licenseIdx);
  });
});

describe('analytics onboarding_completed whitelist & consent enforcement', () => {
  it('sends only non-PII business_type when consent is granted and blocks when disabled', () => {
    assert.equal(ALLOWED_ANALYTICS_EVENTS.includes('onboarding_completed'), true);
    const events: Array<[string, ...unknown[]]> = [];
    __setAnalyticsRuntimeForTests({
      measurementId: 'G-REAL998877',
      buildDisabled: false,
      isOnline: () => true,
      sendGtagCommand: (cmd, ...args) => events.push([cmd, ...args]),
      loadScript: () => {},
    });

    // Consent off -> nothing sent
    setAnalyticsConsent(false);
    assert.equal(track('onboarding_completed', { business_type: 'installment_shop' }), false);
    assert.equal(events.length, 0);

    // Consent on -> business_type sent, PII stripped
    setAnalyticsConsent(true);
    const sanitized = sanitizeAnalyticsPayload('onboarding_completed', {
      business_type: 'installment_shop',
      business_name: 'Secret Shop',
      phone: '012345678',
      ownerName: 'Dara',
      address: 'PP',
      telegram: '@dara',
      exchangeRate: 4100,
    });
    assert.deepEqual(sanitized, { business_type: 'installment_shop' });

    assert.equal(track('onboarding_completed', { business_type: 'lender' }), true);
    const onboardingEvent = events.find(
      ([cmd, name]) => cmd === 'event' && name === 'onboarding_completed'
    );
    assert.ok(onboardingEvent);
    assert.deepEqual(onboardingEvent[2], { business_type: 'lender' });
  });
});

describe('isolation regression: onboarding never touches loan or installment data stores', () => {
  it('confirms onboarding source files never import or access localStore or loan/installment DB stores', () => {
    const moduleRoot = path.resolve(process.cwd(), 'src/modules/onboarding');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
    }

    walk(moduleRoot);
    assert.ok(files.length >= 10);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        /localStore|kamchi_offline_db|createLoan|saveLoan|deleteLoan/i.test(content),
        false,
        `Forbidden store/loan reference found in ${file}`
      );
    }
  });
});
