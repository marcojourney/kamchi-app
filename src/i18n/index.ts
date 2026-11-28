import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import km from './km.json';
import termsEn from './terms.en.json';
import termsKm from './terms.km.json';
import licenseEn from './license.en.json';
import licenseKm from './license.km.json';
import notificationsEn from './notifications.en.json';
import notificationsKm from './notifications.km.json';
import analyticsEn from './analytics.en.json';
import analyticsKm from './analytics.km.json';
import onboardingEn from '../modules/onboarding/i18n/onboarding.en.json';
import onboardingKm from '../modules/onboarding/i18n/onboarding.km.json';
import installmentsEn from '../modules/installments/i18n/installments.en.json';
import installmentsKm from '../modules/installments/i18n/installments.km.json';

const browserLang =
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('km') ? 'km' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
      terms: termsEn,
      license: licenseEn,
      notifications: notificationsEn,
      analytics: analyticsEn,
      onboarding: onboardingEn,
      installments: installmentsEn,
    },
    km: {
      translation: km,
      terms: termsKm,
      license: licenseKm,
      notifications: notificationsKm,
      analytics: analyticsKm,
      onboarding: onboardingKm,
      installments: installmentsKm,
    },
  },
  lng: browserLang,
  fallbackLng: 'en',
  ns: ['translation', 'terms', 'license', 'notifications', 'analytics', 'onboarding', 'installments'],
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng;
  });
}

export default i18n;
