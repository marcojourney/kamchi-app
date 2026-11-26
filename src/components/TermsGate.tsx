import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTermsAcceptance } from '../hooks/useTermsAcceptance';
import { trackFunnelOnce, trackScreenView } from '../lib/analytics';
import type { TermsAcceptanceRecord } from '../lib/termsAcceptance';
import type { AppLanguage } from '../types/loan';
import { TermsReader, type LegalDocumentType } from './TermsReader';
import { TermsScreen } from './TermsScreen';

interface TermsContextValue {
  accepted: boolean;
  analyticsConsent: boolean;
  storedRecord: TermsAcceptanceRecord | null;
  termsVersion: string;
  storageUnavailable: boolean;
  setAnalyticsConsent: (enabled: boolean) => Promise<void>;
  openLegalDocument: (docType: LegalDocumentType) => void;
}

const TermsContext = createContext<TermsContextValue | null>(null);

export const TermsGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const {
    loaded,
    accepted,
    analyticsConsent,
    versionChanged,
    storageUnavailable,
    storedRecord,
    termsVersion,
    accepting,
    acceptTerms,
    setAnalyticsConsent,
  } = useTermsAcceptance();

  const [readerDoc, setReaderDoc] = useState<LegalDocumentType | null>(null);
  const [enteredApp, setEnteredApp] = useState(accepted);

  useEffect(() => {
    if (loaded && !accepted) {
      // Only fires if user already consented previously (e.g., version update screen)
      trackScreenView('terms');
    }
  }, [loaded, accepted]);

  // Smooth transition once terms are accepted, respecting prefers-reduced-motion
  useEffect(() => {
    if (!accepted) {
      setEnteredApp(false);
      return;
    }
    const raf = window.requestAnimationFrame(() => setEnteredApp(true));
    return () => window.cancelAnimationFrame(raf);
  }, [accepted]);

  // Block browser back button, hash changes, and deep-link path changes while terms are unaccepted
  useEffect(() => {
    if (!loaded || accepted || typeof window === 'undefined') return;

    const lockUrl = window.location.href;
    try {
      window.history.replaceState({ kamchiTermsLocked: true }, '', lockUrl);
      window.history.pushState({ kamchiTermsLocked: true }, '', lockUrl);
    } catch {
      // Ignore restricted history APIs
    }

    const handlePopState = () => {
      try {
        window.history.pushState({ kamchiTermsLocked: true }, '', lockUrl);
      } catch {
        // Ignore
      }
    };

    const handleHashChange = () => {
      if (window.location.href !== lockUrl) {
        try {
          window.history.replaceState({ kamchiTermsLocked: true }, '', lockUrl);
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [loaded, accepted]);

  if (!loaded) {
    return null;
  }

  const currentLang: AppLanguage = i18n.language.startsWith('km') ? 'km' : 'en';

  const handleAcceptTerms = async (
    language: AppLanguage,
    optInAnalytics: boolean
  ) => {
    await acceptTerms(language, optInAnalytics);
    if (optInAnalytics) {
      void trackFunnelOnce('terms_accepted');
    }
  };

  if (!accepted) {
    return (
      <TermsScreen
        versionChanged={versionChanged}
        storageUnavailable={storageUnavailable}
        accepting={accepting}
        initialAnalyticsConsent={analyticsConsent}
        onAccept={handleAcceptTerms}
      />
    );
  }

  return (
    <TermsContext.Provider
      value={{
        accepted,
        analyticsConsent,
        storedRecord,
        termsVersion,
        storageUnavailable,
        setAnalyticsConsent,
        openLegalDocument: setReaderDoc,
      }}
    >
      <div
        className={`transition-opacity duration-200 motion-reduce:transition-none ${
          enteredApp ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {children}
      </div>

      {readerDoc && (
        <TermsReader
          documentType={readerDoc}
          language={currentLang}
          onClose={() => setReaderDoc(null)}
        />
      )}
    </TermsContext.Provider>
  );
};

export function useTermsContext(): TermsContextValue {
  const ctx = useContext(TermsContext);
  if (!ctx) {
    throw new Error('useTermsContext must be used within TermsGate');
  }
  return ctx;
}
