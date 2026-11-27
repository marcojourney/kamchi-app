import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  Globe,
  Home,
  Settings,
  Store,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppProvider, useApp } from './context/AppContext';
import { NotificationProvider } from './context/NotificationContext';
import { AppSkeleton } from './components/AppSkeleton';
import { BorrowerPortalView } from './components/BorrowerPortalView';
import { BorrowersView } from './components/BorrowersView';
import { CreateLoanView } from './components/CreateLoanView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LicenseBanner } from './components/LicenseBanner';
import { LicenseGate, useLicenseContext } from './components/LicenseGate';
import { LoansView } from './components/LoansView';
import { NotificationBell } from './components/NotificationBell';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PaymentUndoToast } from './components/PaymentUndoToast';
import { PinLockModal } from './components/PinLockModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReceiptModal } from './components/ReceiptModal';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { RemindersReportsView } from './components/RemindersReportsView';
import type { ReportsSubTab } from './components/RemindersReportsView';
import { SettingsView } from './components/SettingsView';
import { StaffView } from './components/StaffView';
import { TermsGate, useTermsContext } from './components/TermsGate';
import {
  getEnabledFeatures,
  isRouteFeatureEnabled,
  SUPPORT_BOTH_TYPES,
  type AppFeatureTab,
} from './config/featureAccess';
import {
  ExistingUserPromptBanner,
  InstallmentsShellView,
  OnboardingGate,
  useOnboarding,
} from './modules/onboarding';
import {
  maybeSendDailyPortfolioSnapshot,
  track,
  trackFunnelOnce,
  trackScreenView,
} from './lib/analytics';
import {
  canCreateBorrower,
  getCreateLoanBlockReason,
} from './lib/entitlements';
import { APP_VERSION } from './config/app';
import type { AgingBucketKey } from './lib/finance';
import type { Loan, Payment } from './types/loan';

type NavTab = AppFeatureTab;

const VALID_NAV_TABS: ReadonlySet<string> = new Set([
  'dashboard',
  'loans',
  'installments',
  'marketchain_import',
  'borrowers',
  'reports',
  'staff',
  'settings',
]);

function readDeepLinkTabFromLocation(): NavTab | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get('tab');
  if (queryTab && VALID_NAV_TABS.has(queryTab)) {
    return queryTab as NavTab;
  }
  const hashTab = window.location.hash.replace(/^#\/?/, '').trim();
  if (hashTab && VALID_NAV_TABS.has(hashTab)) {
    return hashTab as NavTab;
  }
  return null;
}

const MainShell: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { t: tOnboarding } = useTranslation('onboarding');
  const {
    user,
    authReady,
    isPinLocked,
    profile,
    borrowers,
    loans,
    schedulesByLoan,
    updateSettings,
  } = useApp();
  const { licenseState, openUpgradePrompt } = useLicenseContext();
  const { analyticsConsent } = useTermsContext();
  const { businessType, profile: onboardingProfile, state: onboardingState } = useOnboarding();

  const features = useMemo(
    () =>
      getEnabledFeatures(businessType, licenseState.plan, {
        supportBothTypes: SUPPORT_BOTH_TYPES,
      }),
    [businessType, licenseState.plan]
  );

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [hiddenRouteNotice, setHiddenRouteNotice] = useState<string>('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const syncedOnboardingProfileRef = useRef(false);
  const deepLinkCheckedRef = useRef(false);
  const openedOfflineRef = useRef<boolean>(
    typeof navigator !== 'undefined' && navigator.onLine === false
  );
  const [reportsSubTabRequest, setReportsSubTabRequest] = useState<{
    tab: ReportsSubTab;
    bucket?: AgingBucketKey | null;
    seq: number;
  } | null>(null);
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

  const navigateToTab = (tab: NavTab) => {
    if (!isRouteFeatureEnabled(tab, features)) {
      setShowCreateLoan({ open: false });
      setActiveTab('dashboard');
      setHiddenRouteNotice(tOnboarding('navigation.hiddenRedirectNotice'));
      return;
    }
    setHiddenRouteNotice('');
    setShowCreateLoan({ open: false });
    if (tab === 'reports') setReportsSubTabRequest(null);
    setActiveTab(tab);
  };

  // Enforce deep links & active tab visibility whenever businessType or URL changes
  useEffect(() => {
    if (!deepLinkCheckedRef.current) {
      deepLinkCheckedRef.current = true;
      const requested = readDeepLinkTabFromLocation();
      if (requested) {
        if (isRouteFeatureEnabled(requested, features)) {
          setActiveTab(requested);
        } else {
          setActiveTab('dashboard');
          setHiddenRouteNotice(tOnboarding('navigation.hiddenRedirectNotice'));
        }
        return;
      }
    }

    if (!isRouteFeatureEnabled(activeTab, features)) {
      setShowCreateLoan({ open: false });
      setActiveTab('dashboard');
      setHiddenRouteNotice(tOnboarding('navigation.hiddenRedirectNotice'));
    }
  }, [activeTab, features, tOnboarding]);

  // Sync newly completed onboarding profile fields into existing UserProfile via updateSettings
  useEffect(() => {
    if (!authReady || !profile || syncedOnboardingProfileRef.current) return;
    if (onboardingState.completed && !onboardingState.existingUser && onboardingProfile.name) {
      syncedOnboardingProfileRef.current = true;
      const mappedCurrency = onboardingProfile.defaultCurrency === 'KHR' ? 'KHR' : 'USD';
      if (
        profile.displayName !== onboardingProfile.name ||
        profile.lenderPhone !== onboardingProfile.phone ||
        profile.lenderLogoDataUrl !== onboardingProfile.logo ||
        profile.defaultCurrency !== mappedCurrency ||
        profile.exchangeRateKhr !== onboardingProfile.exchangeRate
      ) {
        void updateSettings({
          displayName: onboardingProfile.name,
          lenderPhone: onboardingProfile.phone,
          lenderLogoDataUrl: onboardingProfile.logo,
          defaultCurrency: mappedCurrency,
          exchangeRateKhr: onboardingProfile.exchangeRate,
        });
      }
    }
  }, [
    authReady,
    profile,
    onboardingState.completed,
    onboardingState.existingUser,
    onboardingProfile,
    updateSettings,
  ]);

  useEffect(() => {
    if (!authReady || !analyticsConsent) return;
    const onlineState = openedOfflineRef.current ? 'offline_then_online' : 'online';
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      void trackFunnelOnce('app_open', { online_state: onlineState });
    }
    const handleOnline = () => {
      void trackFunnelOnce('app_open', {
        online_state: openedOfflineRef.current ? 'offline_then_online' : 'online',
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [authReady, analyticsConsent]);

  useEffect(() => {
    if (!authReady || !analyticsConsent) return;
    const analyticsScreen =
      activeTab === 'staff'
        ? 'settings'
        : activeTab === 'installments' || activeTab === 'marketchain_import'
          ? 'loans'
          : activeTab;
    trackScreenView(analyticsScreen);
  }, [activeTab, authReady, analyticsConsent]);

  useEffect(() => {
    if (!authReady || !analyticsConsent) return;
    void maybeSendDailyPortfolioSnapshot({
      loans,
      borrowers,
      schedulesByLoan,
      exchangeRateKhr: profile?.exchangeRateKhr || 4100,
      planTier: licenseState.plan,
      appLanguage: i18n.language === 'km' ? 'km' : 'en',
      businessType,
    });
  }, [
    authReady,
    analyticsConsent,
    loans,
    borrowers,
    schedulesByLoan,
    profile?.exchangeRateKhr,
    licenseState.plan,
    i18n.language,
    businessType,
  ]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  const activeLoansCount = useMemo(
    () => loans.filter((l) => l.status === 'active').length,
    [loans]
  );

  const requestNewLoan = (borrowerId?: string) => {
    if (!features.loans) {
      setHiddenRouteNotice(tOnboarding('navigation.hiddenRedirectNotice'));
      return;
    }
    const blockReason = getCreateLoanBlockReason(licenseState, activeLoansCount);
    if (blockReason) {
      openUpgradePrompt(blockReason);
      return;
    }
    setShowCreateLoan({ open: true, borrowerId });
  };

  const requestAddBorrower = () => {
    if (!canCreateBorrower(licenseState)) {
      openUpgradePrompt('read_only');
      return;
    }
    navigateToTab('borrowers');
    setOpenAddBorrower(true);
  };

  const toggleQuickLang = async () => {
    const next = i18n.language === 'km' ? 'en' : 'km';
    i18n.changeLanguage(next);
    document.documentElement.lang = next;
    track('feature_used', { feature: 'language_switch' });
    if (profile) {
      await updateSettings({ preferredLang: next });
    }
  };

  if (!authReady) {
    return <AppSkeleton />;
  }

  if (isPinLocked) {
    return <PinLockModal />;
  }

  const borrowersNavLabel =
    features.installments && !features.loans
      ? tOnboarding('navigation.customers')
      : t('nav.borrowers');

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.FC<{ className?: string; strokeWidth?: number }>;
  }> = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: Home },
    ...(features.loans
      ? [{ id: 'loans' as NavTab, label: t('nav.loans'), icon: FileSpreadsheet }]
      : []),
    ...(features.installments
      ? [{ id: 'installments' as NavTab, label: tOnboarding('navigation.installments'), icon: Store }]
      : []),
    { id: 'borrowers', label: borrowersNavLabel, icon: Users },
    { id: 'reports', label: t('nav.reports'), icon: BarChart3 },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  // Keep mobile bottom dock compact (max 5 slots: Dashboard, Primary Workspace, Customers/Borrowers, Reports, Settings)
  const mobileDockItems = navItems.slice(0, 5);

  const navGroups: Array<{
    title: string;
    items: Array<{
      id: NavTab;
      label: string;
      icon: React.FC<{ className?: string; strokeWidth?: number }>;
    }>;
  }> = [
    {
      title: t('nav.groupOperationsCore'),
      items: navItems.filter((item) => item.id !== 'settings'),
    },
    {
      title: t('nav.groupSystemSecurity'),
      items: [
        { id: 'staff', label: t('settings.staffTitle'), icon: UserCog },
        ...navItems.filter((item) => item.id === 'settings'),
      ],
    },
  ];

  const profileDisplayName =
    profile?.displayName || user?.displayName || t('app.name');
  const safeLenderLogo =
    profile?.lenderLogoDataUrl && profile.lenderLogoDataUrl.startsWith('data:image/')
      ? profile.lenderLogoDataUrl
      : '';
  const profileInitial = profileDisplayName.trim().charAt(0).toUpperCase() || 'K';
  const activeNavLabel = showCreateLoan.open
    ? t('loans.createTitle')
    : navGroups.flatMap((g) => g.items).find((n) => n.id === activeTab)?.label || '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 justify-between">
        <div className="space-y-6">
          <div className="px-1 pt-1">
            <img
              src="/assets/aistudio/image_01667597.png"
              alt={t('app.name')}
              className="h-14 w-auto object-contain dark:hidden"
              referrerPolicy="no-referrer"
            />
            <img
              src="/assets/aistudio/image_8f57a101.png"
              alt={t('app.name')}
              className="hidden dark:block h-14 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          <nav aria-label="Sidebar" className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => navigateToTab(item.id)}
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
              </div>
            ))}
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
          <div className="px-3 pt-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
            <span>{t('settings.versionLabel')}</span>
            <span className="font-mono tabular-nums">v{APP_VERSION}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Left Slide-Over Drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-250 motion-reduce:transition-none ${
          mobileDrawerOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileDrawerOpen}
      >
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t('app.name')}
          className={`relative z-10 h-full w-72 max-w-[82vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col justify-between overflow-y-auto shadow-2xl transform transition-transform duration-250 ease-out motion-reduce:transition-none ${
            mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <div>
                <img
                  src="/assets/aistudio/image_01667597.png"
                  alt={t('app.name')}
                  className="h-12 w-auto object-contain dark:hidden"
                  referrerPolicy="no-referrer"
                />
                <img
                  src="/assets/aistudio/image_8f57a101.png"
                  alt={t('app.name')}
                  className="hidden dark:block h-12 w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label={t('app.close')}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav aria-label="Mobile drawer" className="space-y-5">
              {navGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {group.title}
                  </p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          navigateToTab(item.id);
                          setMobileDrawerOpen(false);
                        }}
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
                </div>
              ))}
            </nav>
          </div>

          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 mt-6">
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
            <div className="px-3 pt-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span>{t('settings.versionLabel')}</span>
              <span className="font-mono tabular-nums">v{APP_VERSION}</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        <OfflineIndicator />

        {/* Top Header (Mobile & Desktop) */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label={t('app.name')}
              aria-expanded={mobileDrawerOpen}
              className="lg:hidden shrink-0 min-h-[44px] flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 active:scale-[0.98] transition-transform"
            >
              <img
                src="/assets/aistudio/image_01667597.png"
                alt={t('app.name')}
                className="h-11 sm:h-12 w-auto object-contain dark:hidden"
                referrerPolicy="no-referrer"
              />
              <img
                src="/assets/aistudio/image_8f57a101.png"
                alt={t('app.name')}
                className="hidden dark:block h-11 sm:h-12 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </button>
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

            <NotificationBell />

            <button
              type="button"
              onClick={() => {
                setShowCreateLoan({ open: false });
                setActiveTab('settings');
              }}
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
              ) : user?.photoURL ? (
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

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-28 lg:pb-8">
          <div className="mb-4 -mx-4 sm:-mx-6 lg:-mx-8">
            <LicenseBanner />
          </div>

          <div className="mb-4 space-y-3" aria-live="polite">
            <ExistingUserPromptBanner
              onChooseNow={() => {
                navigateToTab('settings');
                window.setTimeout(() => {
                  document
                    .getElementById('settings-business-section')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }, 80);
              }}
            />

            {hiddenRouteNotice && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/35 px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-medium text-amber-900 dark:text-amber-200">
                <span>{hiddenRouteNotice}</span>
                <button
                  type="button"
                  onClick={() => setHiddenRouteNotice('')}
                  aria-label={t('app.close')}
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {showCreateLoan.open && features.loans ? (
            <CreateLoanView
              key={`create_${showCreateLoan.borrowerId || 'any'}`}
              initialBorrowerId={showCreateLoan.borrowerId}
              onClose={() => setShowCreateLoan({ open: false })}
              onCreated={(loanId) => {
                setShowCreateLoan({ open: false });
                setSelectedLoanId(loanId);
                navigateToTab('loans');
              }}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  features={features}
                  onNewLoan={() => requestNewLoan()}
                  onAddBorrower={requestAddBorrower}
                  onSelectLoanForPayment={(loan) => setPaymentLoan(loan)}
                  onOpenLoanDetail={(loanId) => {
                    if (!features.loans) return;
                    setSelectedLoanId(loanId);
                    navigateToTab('loans');
                  }}
                  onOpenArrears={(bucket = null) => {
                    setReportsSubTabRequest({
                      tab: 'arrears',
                      bucket,
                      seq: Date.now(),
                    });
                    navigateToTab('reports');
                  }}
                  onOpenInstallments={() => navigateToTab('installments')}
                  onOpenMarketChainImport={() => navigateToTab('marketchain_import')}
                />
              )}

              {activeTab === 'loans' && features.loans && (
                <LoansView
                  selectedLoanId={selectedLoanId}
                  onSelectLoanId={setSelectedLoanId}
                  onNewLoan={() => requestNewLoan()}
                  onRecordPayment={(loan) => setPaymentLoan(loan)}
                />
              )}

              {(activeTab === 'installments' || activeTab === 'marketchain_import') &&
                features.installments && (
                  <InstallmentsShellView
                    mode={activeTab}
                    onOpenImportTab={() => navigateToTab('marketchain_import')}
                    onOpenInstallmentsTab={() => navigateToTab('installments')}
                  />
                )}

              {activeTab === 'borrowers' && (
                <BorrowersView
                  externalOpenAdd={openAddBorrower}
                  onCloseExternalAdd={() => setOpenAddBorrower(false)}
                  onNewLoanForBorrower={(borrowerId) => requestNewLoan(borrowerId)}
                  onOpenLoanDetail={(loanId) => {
                    if (!features.loans) return;
                    setSelectedLoanId(loanId);
                    navigateToTab('loans');
                  }}
                />
              )}

              {activeTab === 'reports' && (
                <RemindersReportsView
                  subTabRequest={reportsSubTabRequest}
                  onSelectLoanForPayment={(loan) => setPaymentLoan(loan)}
                  onOpenLoanDetail={(loanId) => {
                    if (!features.loans) return;
                    setSelectedLoanId(loanId);
                    navigateToTab('loans');
                  }}
                />
              )}

              {activeTab === 'staff' && <StaffView />}
              {activeTab === 'settings' && <SettingsView />}
            </>
          )}
        </main>

        {/* Mobile Bottom Tab Bar — Floating Frosted Glass Dock */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <nav
            aria-label="Primary"
            className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/70 shadow-[0_8px_30px_rgba(15,23,42,0.10)] dark:shadow-[0_10px_34px_rgba(0,0,0,0.45)] p-1.5 grid grid-cols-5 gap-1"
          >
            {mobileDockItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigateToTab(item.id)}
                  className={`relative flex flex-col items-center justify-center min-h-[50px] px-1 pt-1 pb-1.5 rounded-xl transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    active
                      ? 'bg-teal-50/90 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 shadow-xs ring-1 ring-teal-500/15 dark:ring-teal-400/20'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-[3px] w-5 rounded-full transition-all duration-200 mb-1 ${
                      active
                        ? 'bg-teal-600 dark:bg-teal-400 opacity-100 scale-x-100'
                        : 'bg-transparent opacity-0 scale-x-50'
                    }`}
                  />
                  <Icon
                    className={`w-[19px] h-[19px] transition-transform duration-200 ${
                      active ? '-translate-y-0.5' : ''
                    }`}
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  <span
                    className={`bottom-nav-label mt-0.5 whitespace-nowrap truncate max-w-full ${
                      active ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Shared Modals */}

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

      <NotificationCenterModal
        onRecordPayment={(loan) => setPaymentLoan(loan)}
        onOpenLoanDetail={(loanId) => {
          setShowCreateLoan({ open: false });
          setSelectedLoanId(loanId);
          setActiveTab('loans');
        }}
        onOpenSettings={() => {
          setShowCreateLoan({ open: false });
          setActiveTab('settings');
          window.setTimeout(() => {
            document
              .getElementById('notifications-settings')
              ?.scrollIntoView({ behavior: 'smooth' });
          }, 80);
        }}
      />

      <PaymentUndoToast />
    </div>
  );
};

const OnboardingGateWithConsent: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { analyticsConsent } = useTermsContext();
  return <OnboardingGate analyticsConsent={analyticsConsent}>{children}</OnboardingGate>;
};

export default function App() {
  const portalParams = useMemo(() => {
    if (typeof window === 'undefined') return { shareId: null, encodedData: null };
    const params = new URLSearchParams(window.location.search);
    return {
      shareId: params.get('portal'),
      encodedData: params.get('portalData'),
    };
  }, []);

  return (
    <ErrorBoundary>
      <TermsGate>
        {portalParams.shareId || portalParams.encodedData ? (
          <BorrowerPortalView
            shareId={portalParams.shareId}
            encodedData={portalParams.encodedData}
          />
        ) : (
          <OnboardingGateWithConsent>
            <LicenseGate>
              <AppProvider>
                <NotificationProvider>
                  <MainShell />
                </NotificationProvider>
              </AppProvider>
            </LicenseGate>
          </OnboardingGateWithConsent>
        )}
      </TermsGate>
    </ErrorBoundary>
  );
}
