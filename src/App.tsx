import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  FileSpreadsheet,
  Globe,
  Home,
  Settings,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppProvider, useApp } from './context/AppContext';
import { ArrearsView } from './components/ArrearsView';
import { AuthScreen } from './components/AuthScreen';
import { BorrowerPortalView } from './components/BorrowerPortalView';
import { BorrowersView } from './components/BorrowersView';
import { CreateLoanModal } from './components/CreateLoanModal';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoansView } from './components/LoansView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PinLockModal } from './components/PinLockModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReceiptModal } from './components/ReceiptModal';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { RemindersReportsView } from './components/RemindersReportsView';
import { SettingsView } from './components/SettingsView';
import type { AgingBucketKey } from './lib/finance';
import type { Loan, Payment } from './types/loan';

type NavTab = 'dashboard' | 'loans' | 'arrears' | 'borrowers' | 'reports' | 'settings';

const MainShell: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, authReady, isPinLocked, profile, updateSettings } = useApp();

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [arrearsInitialBucket, setArrearsInitialBucket] = useState<AgingBucketKey | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [showCreateLoan, setShowCreateLoan] = useState<{ open: boolean; borrowerId?: string }>({
    open: false,
  });
  const [openAddBorrower, setOpenAddBorrower] = useState(false);
  const [paymentLoan, setPaymentLoan] = useState<Loan | null>(null);
  const [receiptData, setReceiptData] = useState<{
    payment: Payment;
    remainingAfter: number;
  } | null>(null);

  const toggleQuickLang = async () => {
    const next = i18n.language === 'km' ? 'en' : 'km';
    i18n.changeLanguage(next);
    document.documentElement.lang = next;
    if (profile) {
      await updateSettings({ preferredLang: next });
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        {t('app.loading')}
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (isPinLocked) {
    return <PinLockModal />;
  }

  const navItems: Array<{ id: NavTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: Home },
    { id: 'loans', label: t('nav.loans'), icon: FileSpreadsheet },
    { id: 'arrears', label: t('nav.arrears'), icon: AlertTriangle },
    { id: 'borrowers', label: t('nav.borrowers'), icon: Users },
    { id: 'reports', label: t('nav.reports'), icon: BarChart3 },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  const profileDisplayName =
    profile?.displayName || user.displayName || t('app.name');
  const safeLenderLogo =
    profile?.lenderLogoDataUrl && profile.lenderLogoDataUrl.startsWith('data:image/')
      ? profile.lenderLogoDataUrl
      : '';
  const profileInitial = profileDisplayName.trim().charAt(0).toUpperCase() || 'K';
  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 justify-between">
        <div className="space-y-6">
          <div className="px-1 pt-1">
            <img
              src="/assets/aistudio/image_01667597.png"
              alt={t('app.name')}
              className="h-14 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[44px] flex items-center gap-3 px-3 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <PWAInstallButton variant="full" />
          <button
            type="button"
            onClick={toggleQuickLang}
            className="w-full min-h-[40px] flex items-center justify-between px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-teal-600" />
              <span>{t('settings.language')}</span>
            </span>
            <span>{i18n.language === 'km' ? 'ខ្មែរ' : 'EN'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        <OfflineIndicator />

        {/* Top Header (Mobile & Desktop) */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/assets/aistudio/image_01667597.png"
              alt={t('app.name')}
              className="lg:hidden h-11 sm:h-12 w-auto object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <span className="hidden lg:inline-block text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
              {activeNavLabel}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="lg:hidden flex items-center gap-2">
              <PWAInstallButton variant="compact" />
              <button
                type="button"
                onClick={toggleQuickLang}
                className="min-h-[36px] flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <Globe className="w-3.5 h-3.5 text-teal-600" />
                <span>{i18n.language === 'km' ? 'ខ្មែរ' : 'EN'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              title={profileDisplayName}
              aria-label={profileDisplayName}
              className={`h-10 w-10 rounded-full border overflow-hidden flex items-center justify-center shrink-0 transition-all ${
                activeTab === 'settings'
                  ? 'border-teal-500 ring-2 ring-teal-500/30 bg-teal-50 dark:bg-teal-950/40'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:border-teal-500'
              }`}
            >
              {safeLenderLogo ? (
                <img
                  src={safeLenderLogo}
                  alt={profileDisplayName}
                  className="h-full w-full object-cover"
                />
              ) : user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={profileDisplayName}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-sm font-bold text-teal-700 dark:text-teal-300">
                  {profileInitial}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              onNewLoan={() => setShowCreateLoan({ open: true })}
              onAddBorrower={() => {
                setActiveTab('borrowers');
                setOpenAddBorrower(true);
              }}
              onSelectLoanForPayment={(loan) => setPaymentLoan(loan)}
              onOpenLoanDetail={(loanId) => {
                setSelectedLoanId(loanId);
                setActiveTab('loans');
              }}
              onOpenArrears={(bucket = null) => {
                setArrearsInitialBucket(bucket);
                setActiveTab('arrears');
              }}
            />
          )}

          {activeTab === 'loans' && (
            <LoansView
              selectedLoanId={selectedLoanId}
              onSelectLoanId={setSelectedLoanId}
              onNewLoan={() => setShowCreateLoan({ open: true })}
              onRecordPayment={(loan) => setPaymentLoan(loan)}
            />
          )}

          {activeTab === 'arrears' && (
            <ArrearsView
              initialBucket={arrearsInitialBucket}
              onSelectLoanForPayment={(loan) => setPaymentLoan(loan)}
              onOpenLoanDetail={(loanId) => {
                setSelectedLoanId(loanId);
                setActiveTab('loans');
              }}
            />
          )}

          {activeTab === 'borrowers' && (
            <BorrowersView
              externalOpenAdd={openAddBorrower}
              onCloseExternalAdd={() => setOpenAddBorrower(false)}
              onNewLoanForBorrower={(borrowerId) =>
                setShowCreateLoan({ open: true, borrowerId })
              }
              onOpenLoanDetail={(loanId) => {
                setSelectedLoanId(loanId);
                setActiveTab('loans');
              }}
            />
          )}

          {activeTab === 'reports' && <RemindersReportsView />}

          {activeTab === 'settings' && <SettingsView />}
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-6 h-16 pb-safe">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'arrears') setArrearsInitialBucket(null);
                  setActiveTab(item.id);
                }}
                className={`flex flex-col items-center justify-center min-h-[44px] px-0.5 transition-colors ${
                  active
                    ? 'text-teal-600 dark:text-teal-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-[10px] font-medium mt-0.5 truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Shared Modals */}
      {showCreateLoan.open && (
        <CreateLoanModal
          initialBorrowerId={showCreateLoan.borrowerId}
          onClose={() => setShowCreateLoan({ open: false })}
          onCreated={(loanId) => {
            setSelectedLoanId(loanId);
            setActiveTab('loans');
          }}
        />
      )}

      {paymentLoan && (
        <RecordPaymentModal
          loan={paymentLoan}
          onClose={() => setPaymentLoan(null)}
          onSuccess={(payment, remainingAfter) => {
            setPaymentLoan(null);
            setReceiptData({ payment, remainingAfter });
          }}
        />
      )}

      {receiptData && (
        <ReceiptModal
          payment={receiptData.payment}
          remainingBalance={receiptData.remainingAfter}
          onClose={() => setReceiptData(null)}
        />
      )}
    </div>
  );
};

export default function App() {
  const portalShareId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('portal');
  }, []);

  if (portalShareId) {
    return (
      <ErrorBoundary>
        <BorrowerPortalView shareId={portalShareId} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppProvider>
        <MainShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
