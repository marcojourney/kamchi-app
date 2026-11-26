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
export const TERMS_VERSION = '1.1';

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
  '1.1': {
    en: [
      'Added an optional, off-by-default Anonymous usage statistics section (counts and bucketed ranges per install via GA4 random ID).',
      'Confirmed names, phone numbers, IDs, notes, license keys, device codes, exact money amounts, and individual loan dates are never sent.',
      'Clarified offline license verification tied to your device code and what details you share if contacting support.',
    ],
    km: [
      'បានបន្ថែមផ្នែកស្ថិតិប្រើប្រាស់អនាមិកជាជម្រើស (បិទជាលំនាំដើម) ដែលវាស់វែងតែចំនួនសរុប និងកម្រិតជាជួរតាមការដំឡើង។',
      'បញ្ជាក់ថា ឈ្មោះ លេខទូរស័ព្ទ អត្តសញ្ញាណប័ណ្ណ កំណត់សម្គាល់ លេខកូដអាជ្ញាប័ណ្ណ លេខកូដឧបករណ៍ ចំនួនប្រាក់ពិតប្រាកដ និងកាលបរិច្ឆេទកម្ចីនីមួយៗ មិនត្រូវបានផ្ញើឡើយ។',
      'បញ្ជាក់បន្ថែមអំពីការផ្ទៀងផ្ទាត់អាជ្ញាប័ណ្ណដោយគ្មានអ៊ីនធឺណិតតាមលេខកូដឧបករណ៍ និងព័ត៌មានដែលអ្នកផ្ញើពេលទាក់ទងជំនួយ។',
    ],
  },
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
