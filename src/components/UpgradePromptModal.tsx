import React from 'react';
import { Check, KeyRound, Lock, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_FREE_ACTIVE_LOANS } from '../config/license';
import type { BlockedActionReason } from '../lib/entitlements';

interface UpgradePromptModalProps {
  reason: BlockedActionReason;
  onEnterKey: () => void;
  onSwitchToFree?: () => void;
  onClose: () => void;
}

export const UpgradePromptModal: React.FC<UpgradePromptModalProps> = ({
  reason,
  onEnterKey,
  onSwitchToFree,
  onClose,
}) => {
  const { t, i18n } = useTranslation('license');
  const isKm = i18n.language.startsWith('km');

  const getCopy = () => {
    switch (reason) {
      case 'read_only':
        return {
          title: t('upgradePrompt.titleReadOnly'),
          desc: t('upgradePrompt.descReadOnly'),
        };
      case 'free_loan_limit':
        return {
          title: t('upgradePrompt.titleFreeLimit'),
          desc: t('upgradePrompt.descFreeLimit', { maxLoans: MAX_FREE_ACTIVE_LOANS }),
        };
      case 'pro_export':
        return {
          title: t('upgradePrompt.titleExport'),
          desc: t('upgradePrompt.descExport'),
        };
      case 'pro_backup':
        return {
          title: t('upgradePrompt.titleBackup'),
          desc: t('upgradePrompt.descBackup'),
        };
      case 'pro_telegram':
        return {
          title: t('upgradePrompt.titleTelegram'),
          desc: t('upgradePrompt.descTelegram'),
        };
      case 'business_staff':
        return {
          title: t('upgradePrompt.titleStaff'),
          desc: t('upgradePrompt.descStaff'),
        };
      case 'business_contracts':
        return {
          title: t('upgradePrompt.titleContracts'),
          desc: t('upgradePrompt.descContracts'),
        };
    }
  };

  const copy = getCopy();
  const proBullets = t('upgradePrompt.proBullets', { returnObjects: true }) as string[];
  const bizBullets = t('upgradePrompt.businessBullets', { returnObjects: true }) as string[];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-prompt-title"
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
    >
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#F2B544]/20 text-[#9A6700] dark:text-[#F2B544] flex items-center justify-center shrink-0">
              {reason === 'read_only' ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2
                id="upgrade-prompt-title"
                className={`text-base font-bold text-[#1F2937] dark:text-slate-100 ${
                  isKm ? 'leading-[1.65]' : ''
                }`}
              >
                {copy.title}
              </h2>
              <p
                className={`text-xs text-slate-600 dark:text-slate-300 mt-1 ${
                  isKm ? 'leading-[1.8]' : 'leading-relaxed'
                }`}
              >
                {copy.desc}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('upgradePrompt.laterButton')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean Plan Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="rounded-xl border border-[#0F5132]/30 dark:border-emerald-800/60 bg-[#F8FAF7] dark:bg-slate-950 p-3.5 space-y-2">
            <p className="text-xs font-bold text-[#0F5132] dark:text-emerald-400">
              {t('plans.pro')}
            </p>
            <ul className="space-y-1.5 text-xs text-[#1F2937] dark:text-slate-200">
              {Array.isArray(proBullets) &&
                proBullets.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#0F5132] dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span className={isKm ? 'leading-[1.7]' : ''}>{item}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2">
            <p className="text-xs font-bold text-[#1F2937] dark:text-slate-100">
              {t('plans.business')}
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              {Array.isArray(bizBullets) &&
                bizBullets.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                    <span className={isKm ? 'leading-[1.7]' : ''}>{item}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row-reverse gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEnterKey();
            }}
            className="w-full sm:flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold px-4 transition-colors"
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>{t('upgradePrompt.enterKeyButton')}</span>
          </button>

          {reason === 'read_only' && onSwitchToFree && (
            <button
              type="button"
              onClick={() => {
                onSwitchToFree();
                onClose();
              }}
              className="w-full sm:w-auto min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#1F2937] dark:text-slate-200 px-4 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {t('upgradePrompt.switchFreeButton')}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[48px] rounded-xl px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('upgradePrompt.laterButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
