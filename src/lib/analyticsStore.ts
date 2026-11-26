import type { LoansTier } from './portfolioSnapshot';

export type FunnelStepName =
  | 'app_open'
  | 'terms_accepted'
  | 'first_borrower_added'
  | 'first_loan_created'
  | 'first_payment_recorded';

export interface FeedbackPromptState {
  rating?: number; // 1..5, stored locally ONLY (never sent to GA4)
  ratedAt?: string;
  dismissed?: boolean;
}

export interface AnalyticsLocalState {
  id: string;
  firstUsedAt: string;
  lastSnapshotSentAt: string | null;
  lastLenderSizeTier: LoansTier | null;
  funnelSent: Partial<Record<FunnelStepName, boolean>>;
  feedback: FeedbackPromptState;
}

const DB_NAME = 'kamchi_analytics_db';
const DB_VERSION = 1;
const STORE_NAME = 'analytics_meta';
const RECORD_KEY = 'state';
const LS_FALLBACK_KEY = 'kamchi_analytics_meta_v1';

let memoryCache: AnalyticsLocalState | null = null;

function createDefaultState(nowIso: string = new Date().toISOString()): AnalyticsLocalState {
  return {
    id: RECORD_KEY,
    firstUsedAt: nowIso,
    lastSnapshotSentAt: null,
    lastLenderSizeTier: null,
    funnelSent: {},
    feedback: {},
  };
}

function normalizeState(raw: unknown): AnalyticsLocalState {
  const def = createDefaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return def;
  const obj = raw as Record<string, unknown>;

  const firstUsedAt =
    typeof obj.firstUsedAt === 'string' && Number.isFinite(Date.parse(obj.firstUsedAt))
      ? obj.firstUsedAt
      : def.firstUsedAt;

  const lastSnapshotSentAt =
    typeof obj.lastSnapshotSentAt === 'string' &&
    Number.isFinite(Date.parse(obj.lastSnapshotSentAt))
      ? obj.lastSnapshotSentAt
      : null;

  const validTiers = new Set(['0', '1-5', '6-10', '11-25', '26-50', '51-100', '100+']);
  const lastLenderSizeTier =
    typeof obj.lastLenderSizeTier === 'string' && validTiers.has(obj.lastLenderSizeTier)
      ? (obj.lastLenderSizeTier as LoansTier)
      : null;

  const funnelSent: Partial<Record<FunnelStepName, boolean>> = {};
  if (obj.funnelSent && typeof obj.funnelSent === 'object') {
    const fs = obj.funnelSent as Record<string, unknown>;
    const allowedSteps: FunnelStepName[] = [
      'app_open',
      'terms_accepted',
      'first_borrower_added',
      'first_loan_created',
      'first_payment_recorded',
    ];
    for (const step of allowedSteps) {
      if (fs[step] === true) funnelSent[step] = true;
    }
  }

  const feedback: FeedbackPromptState = {};
  if (obj.feedback && typeof obj.feedback === 'object') {
    const fb = obj.feedback as Record<string, unknown>;
    if (typeof fb.rating === 'number' && fb.rating >= 1 && fb.rating <= 5) {
      feedback.rating = Math.round(fb.rating);
    }
    if (typeof fb.ratedAt === 'string' && Number.isFinite(Date.parse(fb.ratedAt))) {
      feedback.ratedAt = fb.ratedAt;
    }
    if (fb.dismissed === true) {
      feedback.dismissed = true;
    }
  }

  return {
    id: RECORD_KEY,
    firstUsedAt,
    lastSnapshotSentAt,
    lastLenderSizeTier,
    funnelSent,
    feedback,
  };
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadAnalyticsLocalState(): Promise<AnalyticsLocalState> {
  if (memoryCache) return memoryCache;

  let raw: unknown = null;
  const db = await openDb();
  if (db) {
    try {
      raw = await new Promise<unknown>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      raw = null;
    } finally {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (!raw && typeof localStorage !== 'undefined') {
    try {
      const ls = localStorage.getItem(LS_FALLBACK_KEY);
      if (ls) raw = JSON.parse(ls) as unknown;
    } catch {
      raw = null;
    }
  }

  const normalized = normalizeState(raw);
  memoryCache = normalized;
  if (!raw) {
    await saveAnalyticsLocalState(normalized);
  }
  return normalized;
}

export async function saveAnalyticsLocalState(
  next: AnalyticsLocalState
): Promise<AnalyticsLocalState> {
  const normalized = normalizeState(next);
  memoryCache = normalized;

  const db = await openDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(normalized);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      // Ignore
    } finally {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore quota errors
    }
  }

  return normalized;
}

export async function updateAnalyticsLocalState(
  updater: (prev: AnalyticsLocalState) => AnalyticsLocalState
): Promise<AnalyticsLocalState> {
  const current = await loadAnalyticsLocalState();
  const next = updater(current);
  return saveAnalyticsLocalState(next);
}

export function resetAnalyticsStoreMemoryForTests(): void {
  memoryCache = null;
}
