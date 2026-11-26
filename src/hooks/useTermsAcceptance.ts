import { useCallback, useEffect, useState } from 'react';
import { TERMS_VERSION } from '../config/terms';
import {
  getPreloadedTermsSnapshot,
  readTermsAcceptance,
  saveTermsAcceptance,
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
    return getPreloadedTermsSnapshot() ?? FALLBACK_INITIAL_SNAPSHOT;
  });
  const [accepting, setAccepting] = useState(false);

  const refresh = useCallback(async () => {
    const fresh = await readTermsAcceptance(TERMS_VERSION);
    setSnapshot(fresh);
  }, []);

  useEffect(() => {
    if (snapshot.loaded) return;
    let active = true;
    readTermsAcceptance(TERMS_VERSION).then((fresh) => {
      if (active) setSnapshot(fresh);
    });
    return () => {
      active = false;
    };
  }, [snapshot.loaded]);

  const acceptTerms = useCallback(async (language: AppLanguage) => {
    setAccepting(true);
    try {
      const { record, persisted } = await saveTermsAcceptance(language, TERMS_VERSION);
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
  }, []);

  return {
    ...snapshot,
    termsVersion: TERMS_VERSION,
    accepting,
    acceptTerms,
    refresh,
  };
}
