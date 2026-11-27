import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Camera,
  Download,
  HandCoins,
  Image as ImageIcon,
  Layers,
  Phone,
  Store,
  Upload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CameraCaptureModal } from '../../../components/CameraCaptureModal';
import { useLicenseContext } from '../../../components/LicenseGate';
import {
  getEnabledFeatures,
  SUPPORT_BOTH_TYPES,
  type BusinessType,
} from '../../../config/featureAccess';
import { useApp } from '../../../context/AppContext';
import { canBackupExport } from '../../../lib/entitlements';
import { CAMBODIAN_PROVINCES, FIELD_LIMITS, KHR_ROUNDING_STEPS } from '../config';
import { useOnboarding } from '../hooks/useOnboarding';
import { resizeLogoFileToDataUrl, validateBasicInfo } from '../services/validation';
import type {
  BusinessProfile,
  BusinessQuickDefaults,
  CurrencyPreference,
  ValidationErrors,
} from '../types';

export const SettingsBusinessSection: React.FC = () => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');
  const { loans, profile: appProfile, updateSettings, exportAllDataJson } = useApp();
  const { licenseState, openUpgradePrompt } = useLicenseContext();
  const {
    profile,
    defaults,
    businessType,
    updateBusinessProfile,
    updateBusinessDefaults,
    updateBusinessType,
  } = useOnboarding();

  const [formProfile, setFormProfile] = useState<BusinessProfile>(profile);
  const [formDefaults, setFormDefaults] = useState<BusinessQuickDefaults>(defaults);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [savedNotice, setSavedNotice] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingTargetType, setPendingTargetType] = useState<BusinessType | null>(null);

  useEffect(() => {
    setFormProfile({
      ...profile,
      name: profile.name || appProfile?.displayName || '',
      phone: profile.phone || appProfile?.lenderPhone || '',
      logo: profile.logo || appProfile?.lenderLogoDataUrl || '',
    });
  }, [profile, appProfile?.displayName, appProfile?.lenderPhone, appProfile?.lenderLogoDataUrl]);

  useEffect(() => {
    setFormDefaults(defaults);
  }, [defaults]);

  const showNotice = (msg: string) => {
    setSavedNotice(msg);
    window.setTimeout(() => setSavedNotice(''), 2800);
  };

  const getTypeLabel = (type: BusinessType) => {
    if (type === 'installment_shop') return t('businessType.installmentShop.title');
    if (type === 'both') return t('businessType.both.title');
    return t('businessType.lender.title');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeLogoFileToDataUrl(file, 220);
      setFormProfile((prev) => ({ ...prev, logo: dataUrl }));
    } catch (err) {
      console.error('Logo upload failed:', err);
    }
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateBasicInfo(formProfile);
    setErrors(check.errors);
    if (!check.valid) return;

    const saved = await updateBusinessProfile(check.sanitized);
    await updateBusinessDefaults(formDefaults);

    // Sync mapped fields into the existing UserProfile via updateSettings
    await updateSettings({
      displayName: saved.name || appProfile?.displayName || 'KamChi Lender',
      lenderPhone: saved.phone,
      lenderLogoDataUrl: saved.logo,
      defaultCurrency: saved.defaultCurrency === 'KHR' ? 'KHR' : 'USD',
      exchangeRateKhr: saved.exchangeRate,
    });

    showNotice(t('settingsBusiness.savedToast'));
  };

  const getSwitchSummary = (currentType: BusinessType, nextType: BusinessType) => {
    const currentFeatures = getEnabledFeatures(currentType, licenseState.plan, {
      supportBothTypes: SUPPORT_BOTH_TYPES,
    });
    const nextFeatures = getEnabledFeatures(nextType, licenseState.plan, {
      supportBothTypes: SUPPORT_BOTH_TYPES,
    });

    const willShow: string[] = [];
    const willHide: string[] = [];

    if (!currentFeatures.loans && nextFeatures.loans) {
      willShow.push(t('businessType.lender.enabledList.0'));
    }
    if (!currentFeatures.installments && nextFeatures.installments) {
      willShow.push(t('businessType.installmentShop.enabledList.0'));
      willShow.push(t('businessType.installmentShop.enabledList.1'));
    }

    if (currentFeatures.loans && !nextFeatures.loans) {
      willHide.push(t('businessType.lender.enabledList.0'));
    }
    if (currentFeatures.installments && !nextFeatures.installments) {
      willHide.push(t('businessType.installmentShop.enabledList.0'));
      willHide.push(t('businessType.installmentShop.enabledList.1'));
    }

    const hiddenRecordCount =
      currentFeatures.loans && !nextFeatures.loans ? loans.length : 0;

    return { willShow, willHide, hiddenRecordCount };
  };

  const handleExportBeforeSwitch = () => {
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

  const handleConfirmSwitch = async () => {
    if (!pendingTargetType) return;
    const target = pendingTargetType;
    await updateBusinessType(target);
    setPendingTargetType(null);
    showNotice(
      t('settingsBusiness.switchDialog.switchedToast', {
        target: getTypeLabel(target),
      })
    );
  };

  const availableTypes: Array<{
    type: BusinessType;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { type: 'lender', label: t('businessType.lender.title'), icon: HandCoins },
    { type: 'installment_shop', label: t('businessType.installmentShop.title'), icon: Store },
  ];
  if (SUPPORT_BOTH_TYPES) {
    availableTypes.push({
      type: 'both',
      label: t('businessType.both.title'),
      icon: Layers,
    });
  }

  const activeFeatures = getEnabledFeatures(businessType, licenseState.plan, {
    supportBothTypes: SUPPORT_BOTH_TYPES,
  });

  const switchSummary = pendingTargetType
    ? getSwitchSummary(businessType, pendingTargetType)
    : null;

  return (
    <section
      id="settings-business-section"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5"
    >
      <div className="flex items-start gap-2.5">
        <Building2 className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('settingsBusiness.cardTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('settingsBusiness.cardSubtitle')}
          </p>
        </div>
      </div>

      {savedNotice && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl bg-teal-600 text-white px-4 py-2.5 text-xs font-semibold"
        >
          {savedNotice}
        </div>
      )}

      {/* Business Type Switcher */}
      <div className="space-y-2.5 pb-4 border-b border-slate-100 dark:border-slate-800">
        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
          {t('settingsBusiness.activeTypeLabel')}
        </label>
        <div
          className={`grid gap-2 ${
            availableTypes.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {availableTypes.map((opt) => {
            const Icon = opt.icon;
            const active = businessType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (opt.type !== businessType) {
                    setPendingTargetType(opt.type);
                  }
                }}
                className={`min-h-[48px] flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-colors ${
                  active
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Business Profile & Defaults Form */}
      <form onSubmit={handleSaveBusiness} noValidate className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t('settingsBusiness.profileSubheading')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="sb-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t('basicInfo.businessNameLabel')} *
            </label>
            <input
              id="sb-name"
              type="text"
              maxLength={FIELD_LIMITS.businessNameMax}
              value={formProfile.name}
              onChange={(e) => setFormProfile((p) => ({ ...p, name: e.target.value }))}
              className={`w-full min-h-[44px] rounded-xl border bg-white dark:bg-slate-950 px-3 text-sm ${
                errors.name ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
            {errors.name && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t(errors.name)}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="sb-phone"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t('basicInfo.phoneLabel')} *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="sb-phone"
                type="tel"
                maxLength={FIELD_LIMITS.phoneMax}
                value={formProfile.phone}
                onChange={(e) => setFormProfile((p) => ({ ...p, phone: e.target.value }))}
                className={`w-full min-h-[44px] rounded-xl border bg-white dark:bg-slate-950 pl-9 pr-3 text-sm font-mono ${
                  errors.phone ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            {errors.phone && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{t(errors.phone)}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="sb-owner"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t('basicInfo.ownerNameLabel')}
            </label>
            <input
              id="sb-owner"
              type="text"
              maxLength={FIELD_LIMITS.ownerNameMax}
              value={formProfile.ownerName}
              onChange={(e) => setFormProfile((p) => ({ ...p, ownerName: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="sb-telegram"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t('basicInfo.telegramLabel')}
            </label>
            <input
              id="sb-telegram"
              type="text"
              maxLength={FIELD_LIMITS.telegramMax}
              value={formProfile.telegram}
              onChange={(e) => setFormProfile((p) => ({ ...p, telegram: e.target.value }))}
              className={`w-full min-h-[44px] rounded-xl border bg-white dark:bg-slate-950 px-3 text-sm font-mono ${
                errors.telegram ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
            {errors.telegram && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {t(errors.telegram)}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="sb-province"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t('basicInfo.provinceLabel')}
            </label>
            <select
              id="sb-province"
              value={formProfile.province}
              onChange={(e) => setFormProfile((p) => ({ ...p, province: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            >
              <option value="">{t('basicInfo.provincePlaceholder')}</option>
              {CAMBODIAN_PROVINCES.map((prov) => (
                <option key={prov.code} value={prov.en}>
                  {isKm ? `${prov.km} (${prov.en})` : prov.en}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="sb-address"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t('basicInfo.addressLabel')}
            </label>
            <input
              id="sb-address"
              type="text"
              maxLength={FIELD_LIMITS.addressMax}
              value={formProfile.address}
              onChange={(e) => setFormProfile((p) => ({ ...p, address: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            />
          </div>
        </div>

        {/* Currency & Exchange Rate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t('basicInfo.currencyLabel')}
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(['USD', 'KHR', 'both'] as CurrencyPreference[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFormProfile((p) => ({ ...p, defaultCurrency: c }))}
                  className={`min-h-[42px] rounded-xl border text-xs font-semibold ${
                    formProfile.defaultCurrency === c
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {c === 'both' ? t('basicInfo.currencyBoth') : c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="sb-rate"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t('basicInfo.exchangeRateLabel')}
            </label>
            <input
              id="sb-rate"
              type="number"
              inputMode="numeric"
              min={1000}
              max={20000}
              value={formProfile.exchangeRate || ''}
              onChange={(e) =>
                setFormProfile((p) => ({
                  ...p,
                  exchangeRate: Number(e.target.value) || 0,
                }))
              }
              className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
            />
            {errors.exchangeRate && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {t(errors.exchangeRate)}
              </p>
            )}
          </div>
        </div>

        {/* Logo picker */}
        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            {t('basicInfo.logoLabel')}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-14 min-w-[76px] max-w-[160px] px-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
              {formProfile.logo ? (
                <img
                  src={formProfile.logo}
                  alt={formProfile.name || 'Business Logo'}
                  className="max-h-11 w-auto object-contain"
                />
              ) : (
                <ImageIcon className="w-5 h-5 text-slate-400" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-teal-600" />
                <span>{t('basicInfo.uploadLogo')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </label>

              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Camera className="w-3.5 h-3.5 text-teal-600" />
                <span>{t('basicInfo.takeLogoPhoto')}</span>
              </button>

              {formProfile.logo && (
                <button
                  type="button"
                  onClick={() => setFormProfile((p) => ({ ...p, logo: '' }))}
                  className="min-h-[40px] flex items-center gap-1 rounded-xl border border-red-200 dark:border-red-900/50 px-3 text-xs font-semibold text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t('basicInfo.removeLogo')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active Business Defaults */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('settingsBusiness.defaultsSubheading')}
          </h3>

          {activeFeatures.loans && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('quickDefaults.interestRateLabel')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={formDefaults.lender.interestRate}
                  onChange={(e) =>
                    setFormDefaults((d) => ({
                      ...d,
                      lender: { ...d.lender, interestRate: Math.max(0, Number(e.target.value) || 0) },
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('quickDefaults.interestTypeLabel')}
                </label>
                <select
                  value={formDefaults.lender.interestType}
                  onChange={(e) =>
                    setFormDefaults((d) => ({
                      ...d,
                      lender: {
                        ...d.lender,
                        interestType: e.target.value as BusinessQuickDefaults['lender']['interestType'],
                      },
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                >
                  <option value="flat">{t('quickDefaults.interestFlat')}</option>
                  <option value="reducing">{t('quickDefaults.interestReducing')}</option>
                  <option value="interest_only">{t('quickDefaults.interestOnly')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('quickDefaults.graceDaysLabel')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={formDefaults.lender.graceDays}
                  onChange={(e) =>
                    setFormDefaults((d) => ({
                      ...d,
                      lender: { ...d.lender, graceDays: Math.max(0, Math.round(Number(e.target.value) || 0)) },
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
                />
              </div>
            </div>
          )}

          {activeFeatures.installments && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('quickDefaults.minDownPaymentLabel')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={95}
                  value={formDefaults.installment.minDownPaymentPercent}
                  onChange={(e) =>
                    setFormDefaults((d) => ({
                      ...d,
                      installment: {
                        ...d.installment,
                        minDownPaymentPercent: Math.min(95, Math.max(0, Number(e.target.value) || 0)),
                      },
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('quickDefaults.defaultInstallmentsLabel')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={formDefaults.installment.defaultInstallments}
                  onChange={(e) =>
                    setFormDefaults((d) => ({
                      ...d,
                      installment: {
                        ...d.installment,
                        defaultInstallments: Math.max(1, Math.round(Number(e.target.value) || 1)),
                      },
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('quickDefaults.khrRoundingLabel')}
                </label>
                <select
                  value={formDefaults.installment.khrRoundingStep}
                  onChange={(e) =>
                    setFormDefaults((d) => ({
                      ...d,
                      installment: {
                        ...d.installment,
                        khrRoundingStep: Number(e.target.value) as 100 | 500 | 1000,
                      },
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono"
                >
                  {KHR_ROUNDING_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step.toLocaleString()} ៛
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="min-h-[44px] rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          {t('settingsBusiness.saveButton')}
        </button>
      </form>

      {/* Switch Business Type Confirmation Dialog */}
      {pendingTargetType && switchSummary && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="switch-type-dialog-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3
                  id="switch-type-dialog-title"
                  className={`text-base font-bold text-slate-900 dark:text-slate-100 ${
                    isKm ? 'leading-[1.6]' : ''
                  }`}
                >
                  {t('settingsBusiness.switchDialog.title')}
                </h3>
                <p
                  className={`text-xs text-slate-600 dark:text-slate-300 ${
                    isKm ? 'leading-[1.75]' : 'leading-relaxed'
                  }`}
                >
                  {t('settingsBusiness.switchDialog.body', {
                    target: getTypeLabel(pendingTargetType),
                  })}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 text-xs">
              {switchSummary.willShow.length > 0 && (
                <div>
                  <p className="font-semibold text-teal-700 dark:text-teal-400">
                    {t('settingsBusiness.switchDialog.willShow')}
                  </p>
                  <p className="text-slate-700 dark:text-slate-200 mt-0.5">
                    {switchSummary.willShow.join(' · ')}
                  </p>
                </div>
              )}
              {switchSummary.willHide.length > 0 && (
                <div>
                  <p className="font-semibold text-slate-600 dark:text-slate-400">
                    {t('settingsBusiness.switchDialog.willHide')}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                    {switchSummary.willHide.join(' · ')}
                  </p>
                </div>
              )}
            </div>

            <p
              className={`text-xs font-medium text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/50 rounded-xl p-3 ${
                isKm ? 'leading-[1.75]' : 'leading-relaxed'
              }`}
            >
              {t('settingsBusiness.switchDialog.noDataDeleted')}
            </p>

            {switchSummary.hiddenRecordCount > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  {t('settingsBusiness.switchDialog.existingRecordsWarning', {
                    count: switchSummary.hiddenRecordCount,
                  })}
                </p>
                <button
                  type="button"
                  onClick={handleExportBeforeSwitch}
                  className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-amber-900 dark:text-amber-200 shrink-0 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('settingsBusiness.switchDialog.exportFirst')}</span>
                </button>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingTargetType(null)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('settingsBusiness.switchDialog.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSwitch()}
                className="min-h-[44px] flex-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4"
              >
                {t('settingsBusiness.switchDialog.confirmSwitch', {
                  target: getTypeLabel(pendingTargetType),
                })}
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <CameraCaptureModal
          title={t('basicInfo.logoLabel')}
          onCapture={(dataUrl) => {
            setFormProfile((p) => ({ ...p, logo: dataUrl }));
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </section>
  );
};
