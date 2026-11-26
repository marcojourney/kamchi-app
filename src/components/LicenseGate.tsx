import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLicense } from '../hooks/useLicense';
import { resolveLicenseState, type BlockedActionReason, type DerivedLicenseState } from '../lib/entitlements';
import type { LicenseSnapshot } from '../lib/licenseStorage';
import { AppSkeleton } from './AppSkeleton';
import { LicenseActivationScreen } from './LicenseActivationScreen';
import { UpgradePromptModal } from './UpgradePromptModal';

interface LicenseContextValue {
  licenseState: DerivedLicenseState;
  deviceCode: string;
  storageUnavailable: boolean;
  activateKey: (rawKey: string) => Promise<{
    ok: boolean;
    error?: string;
    snapshot?: LicenseSnapshot;
  }>;
  continueWithFree: () => Promise<LicenseSnapshot>;
  removeLicense: () => Promise<LicenseSnapshot>;
  refreshLicense: () => Promise<LicenseSnapshot>;
  recordClockActivity: () => Promise<LicenseSnapshot | null>;
  openActivationModal: () => void;
  openUpgradePrompt: (reason: BlockedActionReason) => void;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export const LicenseGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    snapshot,
    loading,
    activateKey,
    continueWithFree,
    removeLicense,
    refreshLicense,
    recordClockActivity,
  } = useLicense();

  const [activationModalOpen, setActivationModalOpen] = useState(false);
  const [upgradePromptReason, setUpgradePromptReason] = useState<BlockedActionReason | null>(null);

  const needsOnboarding = Boolean(
    snapshot && snapshot.onboardingChoice === null && !snapshot.verifiedLicense
  );

  // Prevent browser back button / deep-link hash jumps from bypassing first-launch onboarding
  useEffect(() => {
    if (!needsOnboarding) return;
    const lockedUrl = window.location.pathname + window.location.search;
    try {
      window.history.replaceState({ kamchiLicenseGate: true }, '', lockedUrl);
      window.history.pushState({ kamchiLicenseGate: true }, '', lockedUrl);
    } catch {
      // Ignore history API errors
    }

    const blockNav = () => {
      try {
        window.history.pushState({ kamchiLicenseGate: true }, '', lockedUrl);
      } catch {
        // Ignore
      }
    };

    window.addEventListener('popstate', blockNav);
    window.addEventListener('hashchange', blockNav);
    return () => {
      window.removeEventListener('popstate', blockNav);
      window.removeEventListener('hashchange', blockNav);
    };
  }, [needsOnboarding]);

  const openActivationModal = useCallback(() => {
    setActivationModalOpen(true);
  }, []);

  const openUpgradePrompt = useCallback((reason: BlockedActionReason) => {
    setUpgradePromptReason(reason);
  }, []);

  if (loading || !snapshot) {
    return <AppSkeleton />;
  }

  const contextValue: LicenseContextValue = {
    licenseState: snapshot.state ?? resolveLicenseState({ verifiedLicense: null }),
    deviceCode: snapshot.deviceCode,
    storageUnavailable: snapshot.storageUnavailable,
    activateKey,
    continueWithFree,
    removeLicense,
    refreshLicense,
    recordClockActivity,
    openActivationModal,
    openUpgradePrompt,
  };

  if (needsOnboarding) {
    return (
      <LicenseContext.Provider value={contextValue}>
        <LicenseActivationScreen
          mode="onboarding"
          deviceCode={snapshot.deviceCode}
          storageUnavailable={snapshot.storageUnavailable}
          onActivate={activateKey}
          onContinueFree={async () => {
            await continueWithFree();
          }}
        />
      </LicenseContext.Provider>
    );
  }

  return (
    <LicenseContext.Provider value={contextValue}>
      {children}

      {activationModalOpen && (
        <LicenseActivationScreen
          mode="modal"
          deviceCode={snapshot.deviceCode}
          storageUnavailable={snapshot.storageUnavailable}
          onActivate={activateKey}
          onClose={() => setActivationModalOpen(false)}
        />
      )}

      {upgradePromptReason && (
        <UpgradePromptModal
          reason={upgradePromptReason}
          onEnterKey={() => setActivationModalOpen(true)}
          onSwitchToFree={
            upgradePromptReason === 'read_only'
              ? () => {
                  removeLicense();
                }
              : undefined
          }
          onClose={() => setUpgradePromptReason(null)}
        />
      )}
    </LicenseContext.Provider>
  );
};

export function useLicenseContext(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) {
    throw new Error('useLicenseContext must be used inside LicenseGate');
  }
  return ctx;
}
