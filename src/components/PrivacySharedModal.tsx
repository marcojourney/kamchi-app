import React, { useEffect, useState } from 'react';
import { Eye, Lock, ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { trackScreenView } from '../lib/analytics';
import { loadAnalyticsLocalState } from '../lib/analyticsStore';
import type { PortfolioSnapshot } from '../lib/portfolioSnapshot';
import { runPortfolioSnapshotOffThread } from '../lib/snapshotRunner';
import { useLicenseContext } from './LicenseGate';
import { useTermsContext } from './TermsGate';

interface PrivacySharedModalProps {
  onClose: () => void;
}

export const PrivacySharedModal: React.FC<PrivacySharedModalProps> = ({
  onClose,
}) => {
  const { t, i18n } = useTranslation('analytics');
  const { loans, borrowers, schedulesByLoan, profile } = useApp();
  const { licenseState } = useLicenseContext();
  const { analyticsConsent, setAnalyticsConsent } = useTermsContext();

  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);

  const isKm = i18n.language.startsWith('km');
  const lineClass = isKm ? 'leading-[1.75]' : 'leading-snug';

  useEffect(() => {
    trackScreenView('privacy_shared');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    Promise.all([
      runPortfolioSnapshotOffThread({
        loans,
        borrowers,
        context: {
          schedulesByLoan,
          exchangeRateKhr: profile?.exchangeRateKhr || 4100,
          planTier: licenseState.plan,
          appLanguage: isKm ? 'km' : 'en',
        },
      }),
      loadAnalyticsLocalState(),
    ]).then(([snap, meta]) => {
      if (!active) return;
      setSnapshot(snap);
      setLastSentAt(meta.lastSnapshotSentAt);
    });
    return () => {
      active = false;
    };
  }, [loans, borrowers, schedulesByLoan, profile?.exchangeRateKhr, licenseState.plan, isKm]);

  const formattedLastSent = lastSentAt
    ? new Intl.DateTimeFormat(isKm ? 'km-KH' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(lastSentAt))
    : t('sharedModal.neverSent');

  const neverSentRaw = t('sharedModal.neverSentItems', { returnObjects: true });
  const neverSentItems = Array.isArray(neverSentRaw)
    ? (neverSentRaw as string[])
    : [];

  const formatAvgSize = (bucket: PortfolioSnapshot['avg_loan_size_bucket']) => {
    if (bucket === '<100') return '<$100';
    if (bucket === '>2000') return '>$2,000';
    if (bucket === '500-2000') return '$500-2,000';
    return `$${bucket}`;
  };

  const rows: Array<{ label: string; value: string }> = snapshot
    ? [
        { label: t('sharedModal.metrics.totalLoans'), value: String(snapshot.total_loans) },
        { label: t('sharedModal.metrics.activeLoans'), value: String(snapshot.active_loans) },
        { label: t('sharedModal.metrics.paidLoans'), value: String(snapshot.paid_loans) },
        { label: t('sharedModal.metrics.overdueLoans'), value: String(snapshot.overdue_loans) },
        { label: t('sharedModal.metrics.borrowerCount'), value: String(snapshot.borrower_count) },
        { label: t('sharedModal.metrics.loansTier'), value: snapshot.loans_tier },
        {
          label: t('sharedModal.metrics.overdueRate'),
          value:
            snapshot.overdue_rate_bucket === '0'
              ? t('sharedModal.values.overdueZero')
              : t('sharedModal.values.overduePct', { bucket: snapshot.overdue_rate_bucket }),
        },
        {
          label: t('sharedModal.metrics.avgLoanSize'),
          value: formatAvgSize(snapshot.avg_loan_size_bucket),
        },
        { label: t('sharedModal.metrics.avgTerm'), value: snapshot.avg_term_bucket },
        {
          label: t('sharedModal.metrics.currencyMix'),
          value: t(`sharedModal.values.${snapshot.currency_mix}`),
        },
        {
          label: t('sharedModal.metrics.interestType'),
          value: t(`sharedModal.values.${snapshot.dominant_interest_type}`),
        },
        {
          label: t('sharedModal.metrics.frequency'),
          value: t(`sharedModal.values.${snapshot.dominant_frequency}`),
        },
        {
          label: t('sharedModal.metrics.planTier'),
          value: t(`sharedModal.values.${snapshot.plan_tier}`),
        },
        {
          label: t('sharedModal.metrics.appLanguage'),
          value: t(`sharedModal.values.${snapshot.app_language}`),
        },
      ]
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-shared-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <header className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="privacy-shared-title"
                className={`text-base font-bold text-slate-900 dark:text-slate-100 ${lineClass}`}
              >
                {t('sharedModal.title')}
              </h2>
              <p className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${lineClass}`}>
                {t('sharedModal.subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('sharedModal.close')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quick Toggle inside Modal */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-semibold text-slate-900 dark:text-slate-100 ${lineClass}`}>
                {t('sharedModal.toggleLabel')}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t('sharedModal.lastSentLabel')}: {formattedLastSent}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={analyticsConsent}
              onClick={() => void setAnalyticsConsent(!analyticsConsent)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                analyticsConsent
                  ? 'bg-teal-600'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                  analyticsConsent ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Exact Snapshot Values */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('sharedModal.snapshotHeading')}
            </h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <span className={`text-slate-600 dark:text-slate-300 ${lineClass}`}>
                    {row.label}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-right">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Never Sent Checklist */}
          <section className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <Lock className="w-4 h-4 shrink-0" />
              <span>{t('sharedModal.neverSentHeading')}</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {neverSentItems.map((item, idx) => (
                <li key={idx} className={lineClass}>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Per-Install Anonymous ID Explanation */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
              <span>{t('sharedModal.perInstallHeading')}</span>
            </div>
            <p className={`text-xs text-slate-600 dark:text-slate-300 ${lineClass}`}>
              {t('sharedModal.perInstallBody')}
            </p>
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            {t('sharedModal.close')}
          </button>
        </footer>
      </div>
    </div>
  );
};
