import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Image as ImageIcon,
  Phone,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CameraCaptureModal } from '../../../components/CameraCaptureModal';
import { CAMBODIAN_PROVINCES, FIELD_LIMITS } from '../config';
import { resizeLogoFileToDataUrl, validateBasicInfo } from '../services/validation';
import type { BusinessProfile, CurrencyPreference, ValidationErrors } from '../types';

interface BasicInfoStepProps {
  profile: BusinessProfile;
  onChange: (next: BusinessProfile) => void;
  onBack: () => void;
  onContinue: (sanitizedProfile: BusinessProfile) => void;
}

export const BasicInfoStep: React.FC<BasicInfoStepProps> = ({
  profile,
  onChange,
  onBack,
  onContinue,
}) => {
  const { t, i18n } = useTranslation('onboarding');
  const isKm = i18n.language.startsWith('km');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const updateField = <K extends keyof BusinessProfile>(
    key: K,
    value: BusinessProfile[K]
  ) => {
    const next = { ...profile, [key]: value };
    onChange(next);
    if (submittedOnce) {
      const check = validateBasicInfo(next);
      setErrors(check.errors);
    }
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeLogoFileToDataUrl(file, 220);
      updateField('logo', dataUrl);
    } catch (err) {
      console.error('Logo resize failed:', err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedOnce(true);
    const check = validateBasicInfo(profile);
    setErrors(check.errors);
    if (!check.valid) return;
    onContinue(check.sanitized);
  };

  const errorList = Object.entries(errors).filter(
    (entry): entry is [keyof ValidationErrors, string] => Boolean(entry[1])
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-1.5">
        <h1
          className={`text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 ${
            isKm ? 'leading-[1.6]' : ''
          }`}
        >
          {t('basicInfo.title')}
        </h1>
        <p
          className={`text-sm text-slate-600 dark:text-slate-300 ${
            isKm ? 'leading-[1.75]' : 'leading-relaxed'
          }`}
        >
          {t('basicInfo.subtitle')}
        </p>
      </div>

      {/* Live region for accessibility error announcements */}
      <div aria-live="polite" className="space-y-1">
        {errorList.length > 0 && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs text-red-700 dark:text-red-300">
            <p className="font-semibold mb-1">{t('errors.validationHeading')}</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {errorList.map(([field, key]) => (
                <li key={field}>{t(key)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Required Fields */}
        <div>
          <label
            htmlFor="onb-business-name"
            className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
          >
            <span>{t('basicInfo.businessNameLabel')} *</span>
            <span className="text-[11px] font-medium text-teal-700 dark:text-teal-400">
              {t('requiredBadge')}
            </span>
          </label>
          <input
            id="onb-business-name"
            type="text"
            required
            maxLength={FIELD_LIMITS.businessNameMax}
            value={profile.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder={t('basicInfo.businessNamePlaceholder')}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'onb-business-name-err' : 'onb-why-we-ask'}
            className={`w-full min-h-[48px] rounded-xl border bg-white dark:bg-slate-950 px-3.5 text-sm text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
              errors.name
                ? 'border-red-500 dark:border-red-500'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          />
          {errors.name && (
            <p id="onb-business-name-err" className="text-xs text-red-600 dark:text-red-400 mt-1">
              {t(errors.name)}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="onb-phone"
            className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
          >
            <span>{t('basicInfo.phoneLabel')} *</span>
            <span className="text-[11px] font-medium text-teal-700 dark:text-teal-400">
              {t('requiredBadge')}
            </span>
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="onb-phone"
              type="tel"
              required
              inputMode="tel"
              maxLength={FIELD_LIMITS.phoneMax}
              value={profile.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder={t('basicInfo.phonePlaceholder')}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'onb-phone-err' : 'onb-phone-hint'}
              className={`w-full min-h-[48px] rounded-xl border bg-white dark:bg-slate-950 pl-10 pr-3.5 text-sm font-mono text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                errors.phone
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            />
          </div>
          <p id="onb-phone-hint" className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {t('basicInfo.phoneHint')}
          </p>
          {errors.phone && (
            <p id="onb-phone-err" className="text-xs text-red-600 dark:text-red-400 mt-1">
              {t(errors.phone)}
            </p>
          )}
        </div>

        {/* Currency Choice */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
            {t('basicInfo.currencyLabel')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'USD', label: t('basicInfo.currencyUsd') },
                { value: 'KHR', label: t('basicInfo.currencyKhr') },
                { value: 'both', label: t('basicInfo.currencyBoth') },
              ] as Array<{ value: CurrencyPreference; label: string }>
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={profile.defaultCurrency === item.value}
                onClick={() => updateField('defaultCurrency', item.value)}
                className={`min-h-[44px] rounded-xl border px-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                  profile.defaultCurrency === item.value
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {profile.defaultCurrency === 'both' && (
            <div className="pt-1">
              <label
                htmlFor="onb-exchange-rate"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('basicInfo.exchangeRateLabel')}
              </label>
              <input
                id="onb-exchange-rate"
                type="number"
                inputMode="numeric"
                min={1000}
                max={20000}
                value={profile.exchangeRate || ''}
                onChange={(e) => updateField('exchangeRate', Number(e.target.value) || 0)}
                className={`w-full min-h-[44px] rounded-xl border bg-white dark:bg-slate-950 px-3.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 ${
                  errors.exchangeRate
                    ? 'border-red-500'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {t('basicInfo.exchangeRateHint')}
              </p>
              {errors.exchangeRate && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {t(errors.exchangeRate)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Optional Fields */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="onb-owner-name"
                className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                <span>{t('basicInfo.ownerNameLabel')}</span>
                <span className="text-[11px] text-slate-400">{t('optionalBadge')}</span>
              </label>
              <input
                id="onb-owner-name"
                type="text"
                maxLength={FIELD_LIMITS.ownerNameMax}
                value={profile.ownerName}
                onChange={(e) => updateField('ownerName', e.target.value)}
                placeholder={t('basicInfo.ownerNamePlaceholder')}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="onb-telegram"
                className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                <span>{t('basicInfo.telegramLabel')}</span>
                <span className="text-[11px] text-slate-400">{t('optionalBadge')}</span>
              </label>
              <input
                id="onb-telegram"
                type="text"
                maxLength={FIELD_LIMITS.telegramMax}
                value={profile.telegram}
                onChange={(e) => updateField('telegram', e.target.value)}
                placeholder={t('basicInfo.telegramPlaceholder')}
                className={`w-full min-h-[44px] rounded-xl border bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100 ${
                  errors.telegram ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              {errors.telegram && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {t(errors.telegram)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="onb-province"
                className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                <span>{t('basicInfo.provinceLabel')}</span>
                <span className="text-[11px] text-slate-400">{t('optionalBadge')}</span>
              </label>
              <select
                id="onb-province"
                value={profile.province}
                onChange={(e) => updateField('province', e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
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
                htmlFor="onb-address"
                className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                <span>{t('basicInfo.addressLabel')}</span>
                <span className="text-[11px] text-slate-400">{t('optionalBadge')}</span>
              </label>
              <input
                id="onb-address"
                type="text"
                maxLength={FIELD_LIMITS.addressMax}
                value={profile.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder={t('basicInfo.addressPlaceholder')}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Optional Business Logo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('basicInfo.logoLabel')}
              </span>
              <span className="text-[11px] text-slate-400">{t('optionalBadge')}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="h-14 min-w-[76px] max-w-[160px] px-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                {profile.logo ? (
                  <img
                    src={profile.logo}
                    alt={profile.name || 'Logo'}
                    className="max-h-11 w-auto object-contain"
                  />
                ) : (
                  <ImageIcon className="w-5 h-5 text-slate-400" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="min-h-[44px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-teal-600" />
                  <span>{t('basicInfo.uploadLogo')}</span>
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
                  className="min-h-[44px] flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Camera className="w-3.5 h-3.5 text-teal-600" />
                  <span>{t('basicInfo.takeLogoPhoto')}</span>
                </button>

                {profile.logo && (
                  <button
                    type="button"
                    onClick={() => updateField('logo', '')}
                    className="min-h-[44px] flex items-center gap-1 rounded-xl border border-red-200 dark:border-red-900/50 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t('basicInfo.removeLogo')}</span>
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('basicInfo.logoPrivacy')}
            </p>
          </div>
        </div>
      </div>

      <div
        id="onb-why-we-ask"
        className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300"
      >
        <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
        <span className={isKm ? 'leading-[1.7]' : ''}>{t('whyWeAsk')}</span>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>{t('back')}</span>
        </button>

        <button
          type="submit"
          className="sm:flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-5 transition-colors motion-reduce:transition-none"
        >
          <span>{t('continue')}</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      </div>

      {cameraOpen && (
        <CameraCaptureModal
          title={t('basicInfo.logoLabel')}
          onCapture={(dataUrl) => {
            updateField('logo', dataUrl);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </form>
  );
};
