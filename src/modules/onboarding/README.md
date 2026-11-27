# KamChi First-Run Onboarding & Business Mode Module

## Architecture Overview
- **Single source of truth (`src/config/featureAccess.ts`)**: `getEnabledFeatures(businessType, plan)` governs visible navigation, routes, and dashboard quick actions. `FEATURES.installmentLoans` derives from it. Configurable constants: `SUPPORT_BOTH_TYPES` (default `false`) and `FREE_INSTALLMENT_LIMIT` (default `10`).
- **Gate order (`src/App.tsx`)**:
  1. `TermsGate`
  2. `OnboardingGate`
  3. `LicenseGate`
  4. `AppProvider` + `MainShell`
- **Persistence (`src/modules/onboarding/services/onboardingStorage.ts`)**:
  - Dedicated IndexedDB `kamchi_onboarding_db` (`onboarding_state`, `business_profile`, `business_defaults` with `business_` fallback keys).
  - Preloaded in `src/main.tsx` before first render so onboarding/dashboard state renders without flicker.
  - Zero direct reads or writes to `src/lib/localStore.ts` loan or installment stores.
- **Upgrade Path for Existing Installs**:
  - Automatically migrates existing users (`businessType = 'lender'`, `completed = true`, `existingUser = true`) and shows a single dismissible banner (`ExistingUserPromptBanner`) with **Choose now** / **Later**.
- **Settings > Business (`SettingsBusinessSection.tsx`)**:
  - Edits business profile, camera/gallery logo, currency/exchange rate, active business defaults, and safely switches business types behind an EN/KM confirmation modal with record counts and an export shortcut.

## Running Tests

```bash
npm test
npm run lint
npm run build
```
