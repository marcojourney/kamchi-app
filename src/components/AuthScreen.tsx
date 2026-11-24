import React, { useState } from 'react';
import { Globe, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from './PWAInstallButton';

export const AuthScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { signInWithGoogle } = useApp();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    setBusy(true);
    setErrorMsg('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleLanguage = () => {
    const next = i18n.language === 'km' ? 'en' : 'km';
    i18n.changeLanguage(next);
    document.documentElement.lang = next;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between p-4 sm:p-8">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="shrink-0">
          <img
            src="/assets/aistudio/image_01667597.png"
            alt={t('app.name')}
            className="h-12 sm:h-14 w-auto object-contain dark:hidden"
            referrerPolicy="no-referrer"
          />
          <img
            src="/assets/aistudio/image_8f57a101.png"
            alt={t('app.name')}
            className="hidden dark:block h-12 sm:h-14 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton variant="compact" />
          <button
            type="button"
            onClick={toggleLanguage}
            className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Globe className="w-4 h-4 text-teal-600" />
            <span>{i18n.language === 'km' ? 'English' : 'ភាសាខ្មែរ'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-md w-full mx-auto my-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
        <div className="flex justify-center pt-1">
          <img
            src="/assets/aistudio/image_01667597.png"
            alt="KamChi — Fast. Fair. Clear."
            className="h-20 sm:h-24 w-auto object-contain dark:hidden"
            referrerPolicy="no-referrer"
          />
          <img
            src="/assets/aistudio/image_8f57a101.png"
            alt="KamChi — Fast. Fair. Clear."
            className="hidden dark:block h-20 sm:h-24 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 text-balance">
            {t('auth.welcomeTitle')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('auth.welcomeDesc')}
          </p>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center justify-between">
            <span>{t('loans.currency')}</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">USD $ · KHR ៛</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('settings.language')}</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">English · ភាសាខ្មែរ</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('loans.interestType')}</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">Flat · Reducing · Balloon</span>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleLogin}
            className="w-full min-h-[48px] flex items-center justify-center gap-3 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>{busy ? t('auth.signingIn') : t('auth.signInGoogle')}</span>
          </button>

          <PWAInstallButton variant="full" />
        </div>

        <p className="text-xs text-center text-slate-500 dark:text-slate-400">
          {t('auth.emailNote')}
        </p>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-400">
        {t('app.name')} · {t('app.subtitle')}
      </footer>
    </div>
  );
};
