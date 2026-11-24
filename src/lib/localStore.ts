import type {
  AppLanguage,
  AuditLog,
  Borrower,
  CurrencyCode,
  Loan,
  LoanSchedule,
  Payment,
  StaffMember,
  UserProfile,
} from '../types/loan';

export const LOCAL_UID = 'local-offline';
const DB_NAME = 'kamchi_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const WORKSPACE_KEY = 'default';
const LS_FALLBACK_KEY = 'kamchi_local_workspace_v1';

export interface LocalWorkspaceData {
  profile: UserProfile;
  borrowers: Borrower[];
  loans: Loan[];
  schedulesByLoan: Record<string, LoanSchedule[]>;
  payments: Payment[];
  staff: StaffMember[];
  auditLogs: AuditLog[];
  hasPendingSync: boolean;
}

export function createDefaultLocalProfile(preferredLang?: AppLanguage): UserProfile {
  const detectedLang: AppLanguage =
    preferredLang ||
    (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('km')
      ? 'km'
      : 'en');

  return {
    uid: LOCAL_UID,
    email: '',
    displayName: 'KamChi Lender',
    lenderPhone: '',
    lenderLogoDataUrl: '',
    preferredLang: detectedLang,
    defaultCurrency: 'USD' as CurrencyCode,
    exchangeRateKhr: 4100,
    capitalCashUsd: 0,
    capitalCashKhr: 0,
    useKhmerNumerals: false,
    biometricEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultLocalWorkspace(preferredLang?: AppLanguage): LocalWorkspaceData {
  return {
    profile: createDefaultLocalProfile(preferredLang),
    borrowers: [],
    loans: [],
    schedulesByLoan: {},
    payments: [],
    staff: [],
    auditLogs: [],
    hasPendingSync: false,
  };
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function normalizeWorkspace(
  raw: Partial<LocalWorkspaceData> | null | undefined,
  fallbackLang?: AppLanguage
): LocalWorkspaceData {
  const base = createDefaultLocalWorkspace(fallbackLang);
  if (!raw || typeof raw !== 'object') return base;

  return {
    profile: {
      ...base.profile,
      ...(raw.profile || {}),
      uid: LOCAL_UID,
    },
    borrowers: Array.isArray(raw.borrowers) ? raw.borrowers : [],
    loans: Array.isArray(raw.loans) ? raw.loans : [],
    schedulesByLoan:
      raw.schedulesByLoan && typeof raw.schedulesByLoan === 'object'
        ? raw.schedulesByLoan
        : {},
    payments: Array.isArray(raw.payments) ? raw.payments : [],
    staff: Array.isArray(raw.staff) ? raw.staff : [],
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
    hasPendingSync: Boolean(raw.hasPendingSync),
  };
}

export async function loadLocalWorkspace(fallbackLang?: AppLanguage): Promise<LocalWorkspaceData> {
  const db = await openDb();
  if (db) {
    try {
      const data = await new Promise<LocalWorkspaceData | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(WORKSPACE_KEY);
        req.onsuccess = () => resolve((req.result as LocalWorkspaceData | undefined) ?? null);
        req.onerror = () => resolve(null);
      });
      if (data) {
        return normalizeWorkspace(data, fallbackLang);
      }
    } catch {
      // Fall through to localStorage fallback
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LS_FALLBACK_KEY);
      if (raw) {
        return normalizeWorkspace(JSON.parse(raw) as Partial<LocalWorkspaceData>, fallbackLang);
      }
    } catch {
      // Ignore parse/storage error
    }
  }

  return createDefaultLocalWorkspace(fallbackLang);
}

export async function saveLocalWorkspace(data: LocalWorkspaceData): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(data, WORKSPACE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return;
    } catch {
      // Fall back to localStorage below
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota exceeded in fallback
    }
  }
}

export function encodePortalData(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodePortalData<T = unknown>(encoded: string): T | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

