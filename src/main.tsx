import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n';
import './index.css';
import App from './App.tsx';
import { TERMS_VERSION } from './config/terms';
import { preloadLicenseState } from './lib/licenseStorage';
import { reportSwUpdateAvailable } from './lib/swUpdateBridge';
import { preloadTermsAcceptance } from './lib/termsAcceptance';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    reportSwUpdateAvailable(updateSW);
  },
});

Promise.all([preloadTermsAcceptance(TERMS_VERSION), preloadLicenseState()]).finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
