import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import km from './km.json';
import termsEn from './terms.en.json';
import termsKm from './terms.km.json';
import licenseEn from './license.en.json';
import licenseKm from './license.km.json';

const browserLang =
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('km') ? 'km' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en, terms: termsEn, license: licenseEn },
    km: { translation: km, terms: termsKm, license: licenseKm },
  },
  lng: browserLang,
  fallbackLng: 'en',
  ns: ['translation', 'terms', 'license'],
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

