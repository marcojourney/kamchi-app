import { TERMS_VERSION } from '../config/terms';
import type { AppLanguage } from '../types/loan';

export interface TermsAcceptanceRecord {
  accepted: true;
  termsVersion: string;
  acceptedAt: string;
  language: AppLanguage;
}

export interface TermsSnapshot {
  loaded: boolean;
  storedRecord: TermsAcceptanceRecord | null;
  accepted: boolean;
  versionChanged: boolean;
  storageUnavailable: boolean;
}

const LEGAL_DB_NAME = 'kamchi_legal_db';
const LEGAL_DB_VERSION = 1;
const LEGAL_STORE_NAME = 'terms_acceptance';
const LEGAL_RECORD_KEY = 'current';
const LEGAL_LS_FALLBACK_KEY = 'kamchi_terms_acceptance_v1';

let preloadedSnapshot: TermsSnapshot | null = null;

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length < 10) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

/**
 * Validates and normalizes an unknown stored value into a TermsAcceptanceRecord.
 * Returns null for missing, malformed, or corrupted data.
 */
export function parseStoredTermsRecord(raw: unknown): TermsAcceptanceRecord | null {
  let candidate: unknown = raw;

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const obj = candidate as Record<string, unknown>;

  if (obj.accepted !== true) return null;
  if (typeof obj.termsVersion !== 'string' || !obj.termsVersion.trim()) return null;
  if (!isValidIsoTimestamp(obj.acceptedAt)) return null;
  if (obj.language !== 'en' && obj.language !== 'km') return null;

  return {
    accepted: true,
    termsVersion: obj.termsVersion.trim(),
    acceptedAt: obj.acceptedAt,
    language: obj.language,
  };
}

/**
 * Pure, testable check deciding whether the stored acceptance satisfies `currentVersion`.
 * Missing, outdated, or corrupted stored records all return false.
 */
export function isAccepted(storedRecord: unknown, currentVersion: string): boolean {
  if (typeof currentVersion !== 'string' || !currentVersion.trim()) return false;
  const parsed = parseStoredTermsRecord(storedRecord);
  if (!parsed) return false;
  return parsed.termsVersion === currentVersion.trim();
}

/**
 * Returns true when the user previously accepted an earlier valid version of the terms
 * and needs to review what changed for `currentVersion`.
 */
export function hasVersionChanged(storedRecord: unknown, currentVersion: string): boolean {
  if (typeof currentVersion !== 'string' || !currentVersion.trim()) return false;
  const parsed = parseStoredTermsRecord(storedRecord);
  if (!parsed) return false;
  return parsed.termsVersion !== currentVersion.trim();
}

async function openLegalDb(): Promise<{ db: IDBDatabase | null; unavailable: boolean }> {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
    return { db: null, unavailable: true };
  }

  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(LEGAL_DB_NAME, LEGAL_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LEGAL_STORE_NAME)) {
          db.createObjectStore(LEGAL_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve({ db: req.result, unavailable: false });
      req.onerror = () => resolve({ db: null, unavailable: true });
      req.onblocked = () => resolve({ db: null, unavailable: true });
    } catch {
      resolve({ db: null, unavailable: true });
    }
  });
}

async function verifyStorageWritable(db: IDBDatabase | null): Promise<boolean> {
  if (db) {
    try {
      const probeKey = '__storage_probe__';
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(LEGAL_STORE_NAME, 'readwrite');
        const store = tx.objectStore(LEGAL_STORE_NAME);
        store.put({ ok: true }, probeKey);
        store.delete(probeKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IDB transaction error'));
        tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
      });
      return true;
    } catch {
      // Fall through to localStorage check
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const probe = '__kamchi_storage_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function readTermsAcceptance(
  currentVersion: string = TERMS_VERSION
): Promise<TermsSnapshot> {
  let raw: unknown = null;
  const { db, unavailable: idbUnavailable } = await openLegalDb();

  if (db) {
    try {
      raw = await new Promise<unknown>((resolve) => {
        const tx = db.transaction(LEGAL_STORE_NAME, 'readonly');
        const store = tx.objectStore(LEGAL_STORE_NAME);
        const req = store.get(LEGAL_RECORD_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      raw = null;
    }
  }

  if (!raw && typeof window !== 'undefined') {
    try {
      const lsRaw = window.localStorage.getItem(LEGAL_LS_FALLBACK_KEY);
      if (lsRaw) {
        raw = lsRaw;
      }
    } catch {
      // Storage blocked in private browsing
    }
  }

  const parsed = parseStoredTermsRecord(raw);
  const writable = await verifyStorageWritable(db);
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
  }

  // If a legacy localStorage record exists while IndexedDB is available, promote it to IndexedDB
  if (parsed && db && !idbUnavailable) {
    void writeRecordToIdb(parsed);
  }

  return {
    loaded: true,
    storedRecord: parsed,
    accepted: isAccepted(parsed, currentVersion),
    versionChanged: hasVersionChanged(parsed, currentVersion),
    storageUnavailable: !writable,
  };
}

async function writeRecordToIdb(record: TermsAcceptanceRecord): Promise<boolean> {
  const { db } = await openLegalDb();
  if (!db) return false;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LEGAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LEGAL_STORE_NAME);
      store.put(record, LEGAL_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IDB write aborted'));
    });
    return true;
  } catch {
    return false;
  } finally {
    try {
      db.close();
    } catch {
      // Ignore
    }
  }
}

export async function saveTermsAcceptance(
  language: AppLanguage,
  currentVersion: string = TERMS_VERSION
): Promise<{ record: TermsAcceptanceRecord; persisted: boolean }> {
  const record: TermsAcceptanceRecord = {
    accepted: true,
    termsVersion: currentVersion,
    acceptedAt: new Date().toISOString(),
    language,
  };

  const idbSaved = await writeRecordToIdb(record);
  let lsSaved = false;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LEGAL_LS_FALLBACK_KEY, JSON.stringify(record));
      lsSaved = true;
    } catch {
      lsSaved = false;
    }
  }

  const snapshot: TermsSnapshot = {
    loaded: true,
    storedRecord: record,
    accepted: true,
    versionChanged: false,
    storageUnavailable: !idbSaved && !lsSaved,
  };
  preloadedSnapshot = snapshot;

  return {
    record,
    persisted: idbSaved || lsSaved,
  };
}

/**
 * Called before React's first render in src/main.tsx so acceptance status
 * is known synchronously on frame 1 with zero flash of the main app.
 */
export async function preloadTermsAcceptance(
  currentVersion: string = TERMS_VERSION
): Promise<TermsSnapshot> {
  const snapshot = await readTermsAcceptance(currentVersion);
  preloadedSnapshot = snapshot;
  return snapshot;
}

export function getPreloadedTermsSnapshot(): TermsSnapshot | null {
  return preloadedSnapshot;
}
