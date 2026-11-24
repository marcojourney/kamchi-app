import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import km from './km.json';

const browserLang =
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('km') ? 'km' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    km: { translation: km },
  },
  lng: browserLang,
  fallbackLng: 'en',
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
