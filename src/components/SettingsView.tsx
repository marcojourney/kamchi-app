import React, { useEffect, useState } from 'react';
import {
  Building2,
  Camera,
  ChevronRight,
  Cloud,
  Database,
  Download,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Lock,
  LogOut,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  canBackupExport,
  canBackupRestore,
  isReadOnly,
} from '../lib/entitlements';
import { compressLogoToDataUrl } from '../lib/finance';
import type { AppLanguage, CurrencyCode } from '../types/loan';
import { CameraCaptureModal } from './CameraCaptureModal';
import { useLicenseContext } from './LicenseGate';
import { NotificationSettingsSection } from './NotificationSettingsSection';
import { PWAInstallButton } from './PWAInstallButton';
import { SettingsLicenseCard } from './SettingsLicenseCard';
import { SettingsPrivacyCard } from './SettingsPrivacyCard';
import { SettingsTermsPrivacyView } from './SettingsTermsPrivacyView';
import { StaffRosterCard } from './StaffRosterCard';
import { useTermsContext } from './TermsGate';
import { APP_VERSION } from '../config/app';
import { track } from '../lib/analytics';

export const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isOnline = useOnlineStatus();
  const {
    user,
    isLocalMode,
    profile,
    theme,
    toggleTheme,
    borrowers,
    loans,
    payments,
    staff,
    updateSettings,
    setPinCode,
    exportAllDataJson,
    importAllDataJson,
    importDemoData,
    clearDemoData,
    signInWithGoogle,
    signOut,
  } = useApp();
  const { t: tTerms } = useTranslation('terms');
  const { storedRecord, termsVersion } = useTermsContext();
  const { licenseState, openUpgradePrompt } = useLicenseContext();
  const [signingIn, setSigningIn] = useState(false);
  const [importingDemo, setImportingDemo] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showTermsPrivacyPage, setShowTermsPrivacyPage] = useState(false);

  const hasDemoData =
    borrowers.some((b) => b.id.startsWith('demo_brw_')) ||
    loans.some((l) => l.id.startsWith('demo_ln_')) ||
    payments.some((p) => p.id.startsWith('demo_pay_')) ||
    staff.some((m) => m.id.startsWith('demo_stf_'));

  const [lenderName, setLenderName] = useState(profile?.displayName || '');
  const [lenderPhone, setLenderPhone] = useState(profile?.lenderPhone || '');
  const [lenderLogoDataUrl, setLenderLogoDataUrl] = useState(profile?.lenderLogoDataUrl || '');
  const [cameraOpen, setCameraOpen] = useState(false);

  const [lang, setLang] = useState<AppLanguage>(profile?.preferredLang || 'en');
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>(
    profile?.defaultCurrency || 'USD'
  );
  const [exchangeRateKhr, setExchangeRateKhr] = useState(
    String(profile?.exchangeRateKhr ?? 4100)
  );
  const [capitalCashUsd, setCapitalCashUsd] = useState(
    String(profile?.capitalCashUsd ?? 0)
  );
  const [capitalCashKhr, setCapitalCashKhr] = useState(
    String(profile?.capitalCashKhr ?? 0)
  );
  const [useKhmerNumerals, setUseKhmerNumerals] = useState(
    Boolean(profile?.useKhmerNumerals)
  );
  const [biometricEnabled, setBiometricEnabled] = useState(
    Boolean(profile?.biometricEnabled)
  );
  const [pinInput, setPinInput] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!profile) return;
    setLenderName(profile.displayName || '');
    setLenderPhone(profile.lenderPhone || '');
    setLenderLogoDataUrl(profile.lenderLogoDataUrl || '');
    setLang(profile.preferredLang || 'en');
    setDefaultCurrency(profile.defaultCurrency || 'USD');
    setExchangeRateKhr(String(profile.exchangeRateKhr ?? 4100));
    setCapitalCashUsd(String(profile.capitalCashUsd ?? 0));
    setCapitalCashKhr(String(profile.capitalCashKhr ?? 0));
    setUseKhmerNumerals(Boolean(profile.useKhmerNumerals));
    setBiometricEnabled(Boolean(profile.biometricEnabled));
  }, [profile]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleLanguageChange = async (nextLang: AppLanguage) => {
    setLang(nextLang);
    i18n.changeLanguage(nextLang);
    document.documentElement.lang = nextLang;
    track('feature_used', { feature: 'language_switch' });
    await updateSettings({ preferredLang: nextLang });
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressLogoToDataUrl(file);
      setLenderLogoDataUrl(dataUrl);
    } catch (err) {
      console.error('Logo compression failed:', err);
    }
  };

  const handleSaveLenderProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = lenderName.trim() || profile?.displayName || 'KamChi Lender';
    setLenderName(cleanName);
    await updateSettings({
      displayName: cleanName,
      lenderPhone: lenderPhone.trim(),
      lenderLogoDataUrl,
    });
    showToast(t('settings.savedToast'));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = lenderName.trim() || profile?.displayName || 'KamChi Lender';
    await updateSettings({
      displayName: cleanName,
      lenderPhone: lenderPhone.trim(),
      lenderLogoDataUrl,
      preferredLang: lang,
      defaultCurrency,
      exchangeRateKhr: Number(exchangeRateKhr) || 4100,
      capitalCashUsd: Number(capitalCashUsd) || 0,
      capitalCashKhr: Number(capitalCashKhr) || 0,
      useKhmerNumerals,
      biometricEnabled,
    });
    showToast(t('settings.savedToast'));
  };

  const handleSavePin = async () => {
    if (!/^\d{4}$/.test(pinInput)) return;
    await setPinCode(pinInput);
    setPinInput('');
    showToast(t('settings.savedToast'));
  };

  const handleExportBackup = () => {
    if (!canBackupExport(licenseState)) {
      openUpgradePrompt('pro_backup');
      return;
    }
    const json = exportAllDataJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kamchi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!canBackupRestore(licenseState)) {
      openUpgradePrompt(isReadOnly(licenseState) ? 'read_only' : 'pro_backup');
      return;
    }
    const text = await file.text();
    await importAllDataJson(text);
    showToast(t('settings.importSuccess'));
  };

  if (showTermsPrivacyPage) {
    return <SettingsTermsPrivacyView onBack={() => setShowTermsPrivacyPage(false)} />;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('settings.title')}
        </h1>
        <PWAInstallButton variant="compact" />
      </div>

      {toast && (
        <div className="rounded-xl bg-teal-600 text-white px-4 py-2.5 text-xs font-semibold">
          {toast}
        </div>
      )}

      {/* License & Plan */}
      <SettingsLicenseCard onToast={showToast} />

      {/* Lender Profile */}
      <form
        onSubmit={handleSaveLenderProfile}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
      >
        <div className="flex items-start gap-2.5">
          <Building2 className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('settings.lenderProfileTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('settings.lenderProfileDesc')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.lenderName')}
            </label>
            <input
              type="text"
              maxLength={120}
              required
              value={lenderName}
              onChange={(e) => setLenderName(e.target.value)}
              placeholder="KamChi Lender"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.lenderPhone')}
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                maxLength={40}
                value={lenderPhone}
                onChange={(e) => setLenderPhone(e.target.value)}
                placeholder="012 345 678"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 text-sm font-mono"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            {t('settings.lenderLogo')}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-16 min-w-[88px] max-w-[180px] px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
              {lenderLogoDataUrl ? (
                <img
                  src={lenderLogoDataUrl}
                  alt={lenderName || 'Lender Logo'}
                  className="max-h-12 w-auto object-contain"
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-400" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-teal-600" />
                <span>{t('settings.uploadLogo')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFile}
                />
              </label>

              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Camera className="w-3.5 h-3.5 text-teal-600" />
                <span>{t('borrowers.takePhoto')}</span>
              </button>

              {lenderLogoDataUrl && (
                <button
                  type="button"
                  onClick={() => setLenderLogoDataUrl('')}
                  className="min-h-[40px] flex items-center gap-1 rounded-xl border border-red-200 dark:border-red-900/50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t('settings.removeLogo')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="min-h-[44px] rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          {t('settings.saveSettings')}
        </button>
      </form>

      {/* Localization & Currency */}
      <form
        onSubmit={handleSave}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t('settings.language')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['en', 'km'] as AppLanguage[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleLanguageChange(l)}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                    lang === l
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {l === 'en' ? 'English' : 'ភាសាខ្មែរ'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t('settings.defaultCurrency')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['USD', 'KHR'] as CurrencyCode[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDefaultCurrency(c)}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                    defaultCurrency === c
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {c === 'USD' ? 'USD ($)' : 'KHR (៛)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.exchangeRate')}
            </label>
            <input
              type="number"
              min="100"
              value={exchangeRateKhr}
              onChange={(e) => setExchangeRateKhr(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full min-h-[44px] flex items-center justify-between rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <span>{t('settings.darkMode')}</span>
              {theme === 'dark' ? <Moon className="w-4 h-4 text-teal-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.capitalCashUsd')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={capitalCashUsd}
              onChange={(e) => setCapitalCashUsd(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.capitalCashKhr')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={capitalCashKhr}
              onChange={(e) => setCapitalCashKhr(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={useKhmerNumerals}
            onChange={(e) => setUseKhmerNumerals(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-teal-600"
          />
          <span>{t('settings.khmerNumerals')}</span>
        </label>

        <button
          type="submit"
          className="min-h-[44px] rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          {t('settings.saveSettings')}
        </button>
      </form>

      {/* Notifications & Reminders */}
      <NotificationSettingsSection onToast={showToast} />

      {/* PIN Lock */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.securityPin')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            maxLength={4}
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={t('settings.setPinPlaceholder')}
            className="w-36 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tracking-widest"
          />
          <button
            type="button"
            disabled={pinInput.length !== 4}
            onClick={handleSavePin}
            className="min-h-[44px] rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {t('settings.enablePin')}
          </button>
          {profile?.pinHash && (
            <button
              type="button"
              onClick={() => setPinCode(null)}
              className="min-h-[44px] rounded-xl border border-red-200 dark:border-red-900/50 px-4 py-2 text-xs font-semibold text-red-600"
            >
              {t('settings.removePin')}
            </button>
          )}
        </div>

        <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={biometricEnabled}
            onChange={(e) => {
              setBiometricEnabled(e.target.checked);
              updateSettings({ biometricEnabled: e.target.checked });
            }}
            className="w-4 h-4 rounded border-slate-300 text-teal-600"
          />
          <span>{t('settings.biometricLabel')}</span>
        </label>
      </div>

      {/* Staff / Collector Roster (shown in Settings on mobile; moved to desktop sidebar on lg+) */}
      <div className="lg:hidden">
        <StaffRosterCard />
      </div>

      {/* Backup & Restore + Sign Out */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('settings.backupTitle')}
        </h2>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleExportBackup}
            className="min-h-[44px] flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
          >
            <Download className="w-4 h-4 text-teal-600" />
            <span>{t('settings.exportBackup')}</span>
          </button>

          <label
            onClick={(e) => {
              if (!canBackupRestore(licenseState)) {
                e.preventDefault();
                openUpgradePrompt(isReadOnly(licenseState) ? 'read_only' : 'pro_backup');
              }
            }}
            className="min-h-[44px] flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-teal-600" />
            <span>{t('settings.importBackup')}</span>
            <input type="file" accept="application/json" className="hidden" onChange={handleImportBackup} />
          </label>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {isLocalMode || !user ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <HardDrive className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>{t('settings.localModeBadge')}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('settings.localModeDesc')}
                </p>
                {!isOnline && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {t('settings.signInOfflineHint')}
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={signingIn || !isOnline}
                onClick={async () => {
                  setSigningIn(true);
                  setAuthError('');
                  try {
                    await signInWithGoogle();
                  } catch (err) {
                    setAuthError(err instanceof Error ? err.message : 'Sign-in failed');
                  } finally {
                    setSigningIn(false);
                  }
                }}
                className="min-h-[40px] flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shrink-0 whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{signingIn ? t('auth.signingIn') : t('auth.signInGoogle')}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Cloud className="w-4 h-4 shrink-0" />
                  <span>{t('settings.cloudSyncedBadge')}</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">
                  {profile?.email || user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/50 px-3.5 py-2 text-xs font-semibold text-red-600"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('auth.signOut')}</span>
              </button>
            </div>
          )}

          {authError && (
            <p className="text-xs text-red-600 dark:text-red-400">{authError}</p>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Database className="w-4 h-4 text-teal-600 shrink-0" />
              <span>{t('settings.importDemoData')}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('settings.importDemoDesc')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={importingDemo || clearingDemo}
              onClick={async () => {
                setImportingDemo(true);
                setAuthError('');
                try {
                  const added = await importDemoData();
                  showToast(
                    added > 0
                      ? t('settings.importDemoSuccess')
                      : t('settings.importDemoAlreadyLoaded')
                  );
                } catch (err) {
                  setAuthError(err instanceof Error ? err.message : 'Failed to import demo data');
                } finally {
                  setImportingDemo(false);
                }
              }}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 px-4 py-2 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-950/70 disabled:opacity-50 transition-colors shrink-0 whitespace-nowrap"
            >
              <Database className="w-4 h-4 shrink-0" />
              <span>
                {importingDemo ? t('settings.importingDemo') : t('settings.importDemoButton')}
              </span>
            </button>

            <button
              type="button"
              disabled={importingDemo || clearingDemo || !hasDemoData}
              onClick={async () => {
                setClearingDemo(true);
                setAuthError('');
                try {
                  const removed = await clearDemoData();
                  showToast(
                    removed > 0
                      ? t('settings.clearDemoSuccess')
                      : t('settings.clearDemoNothing')
                  );
                } catch (err) {
                  setAuthError(err instanceof Error ? err.message : 'Failed to clean demo data');
                } finally {
                  setClearingDemo(false);
                }
              }}
              className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-45 transition-colors shrink-0 whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>
                {clearingDemo ? t('settings.clearingDemo') : t('settings.clearDemoButton')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Privacy & Feedback */}
      <SettingsPrivacyCard />

      {/* Terms and Privacy */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <FileText className="w-4 h-4 text-[#0F5132] dark:text-emerald-400 mt-0.5 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {tTerms('settings.cardTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tTerms('settings.cardSubtitle')}
            </p>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-300 pt-0.5">
              v{storedRecord?.termsVersion || termsVersion} · {tTerms('settings.statusAccepted')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowTermsPrivacyPage(true)}
          className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0 whitespace-nowrap"
        >
          <span>{tTerms('settings.openPageButton')}</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* App Version */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.versionLabel')}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {t('settings.aboutAppDesc')}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
          v{APP_VERSION}
        </span>
      </div>

      {cameraOpen && (
        <CameraCaptureModal
          title={t('settings.lenderLogo')}
          onCapture={(dataUrl) => {
            setLenderLogoDataUrl(dataUrl);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
};
