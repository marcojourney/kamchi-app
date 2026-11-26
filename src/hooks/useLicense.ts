import { useCallback, useEffect, useState } from 'react';
import {
  activateLicenseKey,
  getPreloadedLicenseSnapshot,
  markContinueWithFree,
  preloadLicenseState,
  removeStoredLicense,
  reverifyStoredLicense,
  touchLatestSeenTime,
  type LicenseSnapshot,
} from '../lib/licenseStorage';

export function useLicense() {
  const [snapshot, setSnapshot] = useState<LicenseSnapshot | null>(() =>
    getPreloadedLicenseSnapshot()
  );
  const [loading, setLoading] = useState<boolean>(() => !getPreloadedLicenseSnapshot());

  const refreshLicense = useCallback(async () => {
    const next = await reverifyStoredLicense();
    setSnapshot(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const next = getPreloadedLicenseSnapshot()
        ? await reverifyStoredLicense()
        : await preloadLicenseState();
      if (!active) return;
      setSnapshot(next);
      setLoading(false);
    };
    init();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reverifyStoredLicense().then((next) => {
          if (active) setSnapshot(next);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const activateKey = useCallback(async (rawKey: string) => {
    const res = await activateLicenseKey(rawKey);
    if (res.ok) {
      setSnapshot(res.snapshot);
    }
    return res;
  }, []);

  const continueWithFree = useCallback(async () => {
    const next = await markContinueWithFree();
    setSnapshot(next);
    return next;
  }, []);

  const removeLicense = useCallback(async () => {
    const next = await removeStoredLicense();
    setSnapshot(next);
    return next;
  }, []);

  const recordClockActivity = useCallback(async () => {
    const next = await touchLatestSeenTime();
    if (next) {
      setSnapshot(next);
    }
    return next;
  }, []);

  return {
    snapshot,
    loading,
    activateKey,
    continueWithFree,
    removeLicense,
    refreshLicense,
    recordClockActivity,
  };
}
