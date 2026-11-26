import type { AppLanguage } from '../types/loan';

/**
 * ============================================================================
 * TERMS & CONDITIONS CONFIGURATION
 * ============================================================================
 * EDIT HERE: Bump `TERMS_VERSION` (e.g., "1.0" -> "1.1") whenever you materially
 * update the Terms and Conditions or Privacy Policy.
 *
 * Any existing user whose stored `termsVersion` does not match `TERMS_VERSION`
 * will be prompted to review the "Terms updated" summary and re-accept before
 * accessing KamChi again.
 */
export const TERMS_VERSION = '1.0';

/**
 * EDIT HERE: Legal placeholder contact details.
 * Replace these placeholders with your official support channels before launch.
 */
export const TERMS_CONTACT = {
  telegramHandle: '@KamChiSupport',
  telegramUrl: 'https://t.me/KamChiSupport',
  email: 'support@kamchi.app',
  jurisdictionEn: 'Kingdom of Cambodia',
  jurisdictionKm: 'ព្រះរាជាណាចក្រកម្ពុជា',
} as const;

/**
 * EDIT HERE: Short summary displayed when `TERMS_VERSION` increases and an
 * existing user needs to review updated terms. Add an entry keyed by the new
 * version string when bumping `TERMS_VERSION`.
 */
export const TERMS_UPDATE_SUMMARY: Record<
  string,
  Record<AppLanguage, string[]>
> = {
  '1.0': {
    en: [
      'Initial Terms and Conditions and Privacy Policy for KamChi personal lending ledger.',
      'Clarifies offline device-only record storage, borrower data responsibility, and license rules.',
    ],
    km: [
      'លក្ខខណ្ឌប្រើប្រាស់ និងគោលការណ៍ភាពឯកជនដំបូងសម្រាប់កម្មវិធីកត់ត្រាប្រាក់កម្ចី កម្ចី (KamChi)។',
      'បញ្ជាក់អំពីការរក្សាទុកទិន្នន័យលើឧបករណ៍ផ្ទាល់ខ្លួន ទំនួលខុសត្រូវលើទិន្នន័យអ្នកខ្ចី និងលក្ខខណ្ឌអាជ្ញាប័ណ្ណ។',
    ],
  },
};
