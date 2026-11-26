import { useCallback, useEffect, useState } from 'react';
import { TERMS_VERSION } from '../config/terms';
import { setAnalyticsConsent as applyRuntimeAnalyticsConsent } from '../lib/analytics';
import {
  getPreloadedTermsSnapshot,
  readTermsAcceptance,
  saveTermsAcceptance,
  updateStoredAnalyticsConsent,
  type TermsSnapshot,
} from '../lib/termsAcceptance';
import type { AppLanguage } from '../types/loan';

const FALLBACK_INITIAL_SNAPSHOT: TermsSnapshot = {
  loaded: false,
  storedRecord: null,
  accepted: false,
  versionChanged: false,
  storageUnavailable: false,
};

export function useTermsAcceptance() {
  const [snapshot, setSnapshot] = useState<TermsSnapshot>(() => {
    const preloaded = getPreloadedTermsSnapshot();
    if (preloaded) {
      applyRuntimeAnalyticsConsent(Boolean(preloaded.storedRecord?.analyticsConsent));
    }
    return preloaded ?? FALLBACK_INITIAL_SNAPSHOT;
  });
  const [accepting, setAccepting] = useState(false);

  const refresh = useCallback(async () => {
    const fresh = await readTermsAcceptance(TERMS_VERSION);
    applyRuntimeAnalyticsConsent(Boolean(fresh.storedRecord?.analyticsConsent));
    setSnapshot(fresh);
  }, []);

  useEffect(() => {
    if (snapshot.loaded) return;
    let active = true;
    readTermsAcceptance(TERMS_VERSION).then((fresh) => {
      if (!active) return;
      applyRuntimeAnalyticsConsent(Boolean(fresh.storedRecord?.analyticsConsent));
      setSnapshot(fresh);
    });
    return () => {
      active = false;
    };
  }, [snapshot.loaded]);

  const acceptTerms = useCallback(
    async (language: AppLanguage, analyticsConsent = false) => {
      setAccepting(true);
      try {
        const { record, persisted } = await saveTermsAcceptance(
          language,
          TERMS_VERSION,
          analyticsConsent
        );
        applyRuntimeAnalyticsConsent(record.analyticsConsent);
        setSnapshot({
          loaded: true,
          storedRecord: record,
          accepted: true,
          versionChanged: false,
          storageUnavailable: !persisted,
        });
      } finally {
        setAccepting(false);
      }
    },
    []
  );

  const setAnalyticsConsent = useCallback(async (enabled: boolean) => {
    applyRuntimeAnalyticsConsent(enabled);
    const next = await updateStoredAnalyticsConsent(enabled, TERMS_VERSION);
    setSnapshot(next);
  }, []);

  return {
    ...snapshot,
    analyticsConsent: Boolean(snapshot.storedRecord?.analyticsConsent),
    termsVersion: TERMS_VERSION,
    accepting,
    acceptTerms,
    setAnalyticsConsent,
    refresh,
  };
}
