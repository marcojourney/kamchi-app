import { LICENSE_PUBLIC_KEY_HEX } from '../config/license';
import {
  isLicensedKeyPastGrace,
  resolveLicenseState,
  type DerivedLicenseState,
} from './entitlements';
import {
  bytesToHex,
  deriveDeviceCodeFromSecret,
  hexToBytes,
  verifyLicenseKey,
  type LicensePayload,
  type LicenseVerificationErrorCode,
} from './licenseKey';

/**
 * Offline IndexedDB storage for device identity, verified license key, and anti-rollback clock anchor.
 *
 * SECURITY DESIGN:
 * - Never stores a boolean like `isPro = true`. Stores ONLY the signed raw key string,
 *   random 32-byte `deviceSecret` (hex), `onboardingChoice`, and `latestSeenTime`.
 * - On every app launch and re-evaluation, the signature, device binding, expiry,
 *   and clock rollback are re-verified cleanly into memory.
 * - Never logs the raw license key or `deviceSecret`.
 */

const DB_NAME = 'kamchi_license_db';
const DB_VERSION = 1;
const STORE_NAME = 'license_state';
const RECORD_KEY = 'device';
const FALLBACK_STORAGE_KEY = 'kamchi_license_state_v1';

export type LicenseOnboardingChoice = 'free' | 'licensed' | null;

export interface StoredLicenseRecord {
  id: string;
  deviceSecretHex: string;
  licenseKey: string | null;
  onboardingChoice: LicenseOnboardingChoice;
  latestSeenTime: number;
}

export interface VerifiedLicenseCache {
  payload: LicensePayload;
  keyIdHex: string;
  maskedKey: string;
  isBoundToDevice: boolean;
}

export interface LicenseSnapshot {
  initialized: boolean;
  storageUnavailable: boolean;
  deviceCode: string;
  onboardingChoice: LicenseOnboardingChoice;
  latestSeenTime: number;
  verifiedLicense: VerifiedLicenseCache | null;
  state: DerivedLicenseState;
}

let inMemorySnapshot: LicenseSnapshot | null = null;
let memoryFallbackRecord: StoredLicenseRecord | null = null;

function generateRandomDeviceSecretHex(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    throw new Error('Secure random generator unavailable');
  }
  return bytesToHex(bytes);
}

function parseStoredRecord(raw: unknown): StoredLicenseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.deviceSecretHex !== 'string') return null;
  const secretBytes = hexToBytes(obj.deviceSecretHex);
  if (!secretBytes || secretBytes.length !== 32) return null;

  const licenseKey =
    typeof obj.licenseKey === 'string' && obj.licenseKey.trim()
      ? obj.licenseKey.trim()
      : null;
  const onboardingChoice: LicenseOnboardingChoice =
    obj.onboardingChoice === 'free' || obj.onboardingChoice === 'licensed'
      ? obj.onboardingChoice
      : null;
  const latestSeenTime =
    typeof obj.latestSeenTime === 'number' && Number.isFinite(obj.latestSeenTime) && obj.latestSeenTime > 0
      ? obj.latestSeenTime
      : Date.now();

  return {
    id: RECORD_KEY,
    deviceSecretHex: obj.deviceSecretHex,
    licenseKey,
    onboardingChoice,
    latestSeenTime,
  };
}

function openLicenseDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open license DB'));
  });
}

async function readRecordFromIdb(): Promise<StoredLicenseRecord | null> {
  const db = await openLicenseDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => resolve(parseStoredRecord(req.result));
    req.onerror = () => reject(req.error ?? new Error('Failed to read license DB'));
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
  });
}

async function writeRecordToIdb(record: StoredLicenseRecord): Promise<void> {
  const db = await openLicenseDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to write license DB'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Aborted license DB write'));
    };
  });
}

async function loadOrInitializeRecord(): Promise<{
  record: StoredLicenseRecord;
  storageUnavailable: boolean;
}> {
  let storageUnavailable = false;
  let existing: StoredLicenseRecord | null = null;

  try {
    existing = await readRecordFromIdb();
  } catch {
    storageUnavailable = true;
  }

  if (!existing && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
      if (raw) {
        existing = parseStoredRecord(JSON.parse(raw));
      }
    } catch {
      // Ignore malformed fallback JSON
    }
  }

  if (!existing && memoryFallbackRecord) {
    existing = memoryFallbackRecord;
  }

  const now = Date.now();
  if (existing) {
    // Advance latestSeenTime monotonically when the device clock moves forward
    const nextLatestSeen = now > existing.latestSeenTime ? now : existing.latestSeenTime;
    const updated: StoredLicenseRecord =
      nextLatestSeen !== existing.latestSeenTime
        ? { ...existing, latestSeenTime: nextLatestSeen }
        : existing;

    if (nextLatestSeen !== existing.latestSeenTime) {
      await persistRecord(updated);
    }
    return { record: updated, storageUnavailable };
  }

  const fresh: StoredLicenseRecord = {
    id: RECORD_KEY,
    deviceSecretHex: generateRandomDeviceSecretHex(),
    licenseKey: null,
    onboardingChoice: null,
    latestSeenTime: now,
  };

  const persisted = await persistRecord(fresh);
  return {
    record: fresh,
    storageUnavailable: storageUnavailable || !persisted,
  };
}

async function persistRecord(record: StoredLicenseRecord): Promise<boolean> {
  memoryFallbackRecord = record;
  let idbOk = false;

  try {
    await writeRecordToIdb(record);
    idbOk = true;
  } catch {
    idbOk = false;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Ignore storage quota errors
    }
  }

  return idbOk;
}

async function evaluateSnapshotFromRecord(
  record: StoredLicenseRecord,
  storageUnavailable: boolean
): Promise<LicenseSnapshot> {
  const secretBytes = hexToBytes(record.deviceSecretHex) ?? new Uint8Array(32);
  const deviceCode = await deriveDeviceCodeFromSecret(secretBytes);

  let verifiedLicense: VerifiedLicenseCache | null = null;
  if (record.licenseKey) {
    const verification = await verifyLicenseKey(record.licenseKey, {
      deviceCode,
      publicKeyHex: LICENSE_PUBLIC_KEY_HEX,
    });
    if (verification.valid) {
      verifiedLicense = {
        payload: verification.payload,
        keyIdHex: verification.keyIdHex,
        maskedKey: verification.maskedKey,
        isBoundToDevice: verification.isBoundToDevice,
      };
    }
  }

  const nowMs = Date.now();
  const state = resolveLicenseState({
    verifiedLicense,
    nowMs,
    latestSeenTimeMs: record.latestSeenTime,
  });

  const snapshot: LicenseSnapshot = {
    initialized: true,
    storageUnavailable,
    deviceCode,
    onboardingChoice: record.onboardingChoice,
    latestSeenTime: record.latestSeenTime,
    verifiedLicense,
    state,
  };
  inMemorySnapshot = snapshot;
  return snapshot;
}

export async function preloadLicenseState(): Promise<LicenseSnapshot> {
  const { record, storageUnavailable } = await loadOrInitializeRecord();
  return evaluateSnapshotFromRecord(record, storageUnavailable);
}

export function getPreloadedLicenseSnapshot(): LicenseSnapshot | null {
  return inMemorySnapshot;
}

export function getCurrentDerivedLicenseState(): DerivedLicenseState {
  if (inMemorySnapshot) {
    return inMemorySnapshot.state;
  }
  return resolveLicenseState({ verifiedLicense: null });
}

export async function reverifyStoredLicense(): Promise<LicenseSnapshot> {
  const { record, storageUnavailable } = await loadOrInitializeRecord();
  return evaluateSnapshotFromRecord(record, storageUnavailable);
}

export async function touchLatestSeenTime(): Promise<LicenseSnapshot | null> {
  try {
    const { record, storageUnavailable } = await loadOrInitializeRecord();
    const now = Date.now();
    if (now > record.latestSeenTime) {
      const next = { ...record, latestSeenTime: now };
      await persistRecord(next);
      return evaluateSnapshotFromRecord(next, storageUnavailable);
    }
    return inMemorySnapshot ?? (await evaluateSnapshotFromRecord(record, storageUnavailable));
  } catch {
    return inMemorySnapshot;
  }
}

export async function activateLicenseKey(rawKeyInput: string): Promise<
  | { ok: true; snapshot: LicenseSnapshot }
  | { ok: false; error: LicenseVerificationErrorCode | 'expired_key' }
> {
  const { record, storageUnavailable } = await loadOrInitializeRecord();
  const secretBytes = hexToBytes(record.deviceSecretHex) ?? new Uint8Array(32);
  const deviceCode = await deriveDeviceCodeFromSecret(secretBytes);

  const verification = await verifyLicenseKey(rawKeyInput, {
    deviceCode,
    publicKeyHex: LICENSE_PUBLIC_KEY_HEX,
  });
  if (!verification.valid) {
    return { ok: false, error: verification.error };
  }

  const nowMs = Date.now();
  const pastGrace = isLicensedKeyPastGrace(
    verification.payload,
    nowMs,
    record.latestSeenTime
  );
  if (pastGrace) {
    return { ok: false, error: 'expired_key' };
  }

  const nextRecord: StoredLicenseRecord = {
    ...record,
    licenseKey: verification.canonicalKey,
    onboardingChoice: 'licensed',
    latestSeenTime: nowMs > record.latestSeenTime ? nowMs : record.latestSeenTime,
  };
  await persistRecord(nextRecord);
  const snapshot = await evaluateSnapshotFromRecord(nextRecord, storageUnavailable);
  return { ok: true, snapshot };
}

export async function markContinueWithFree(): Promise<LicenseSnapshot> {
  const { record, storageUnavailable } = await loadOrInitializeRecord();
  const nextRecord: StoredLicenseRecord = {
    ...record,
    onboardingChoice: record.licenseKey ? record.onboardingChoice : 'free',
  };
  await persistRecord(nextRecord);
  return evaluateSnapshotFromRecord(nextRecord, storageUnavailable);
}

export async function removeStoredLicense(): Promise<LicenseSnapshot> {
  const { record, storageUnavailable } = await loadOrInitializeRecord();
  const nextRecord: StoredLicenseRecord = {
    ...record,
    licenseKey: null,
    onboardingChoice: 'free',
  };
  await persistRecord(nextRecord);
  return evaluateSnapshotFromRecord(nextRecord, storageUnavailable);
}
