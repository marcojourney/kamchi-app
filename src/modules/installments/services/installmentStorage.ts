import type {
  CreateInstallmentPlanInput,
  InstallmentPaymentMethod,
  InstallmentPaymentRecord,
  InstallmentPlan,
} from '../types';
import {
  applyPaymentToInstallmentPlan,
  buildInstallmentPlan,
} from './installmentCalc';

const DB_NAME = 'kamchi_installments_db';
const DB_VERSION = 1;
const STORE_NAME = 'installments';
const PLANS_KEY = 'plans_v1';
const LS_FALLBACK_KEY = 'kamchi_installments_plans_v1';

export interface InstallmentStorageDriver {
  readPlans: () => Promise<InstallmentPlan[]>;
  writePlans: (plans: InstallmentPlan[]) => Promise<void>;
}

let customDriver: InstallmentStorageDriver | null = null;

export function __setInstallmentStorageDriverForTests(
  driver: InstallmentStorageDriver | null
): void {
  customDriver = driver;
}

function openInstallmentDb(): Promise<IDBDatabase | null> {
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

async function readAllPlans(): Promise<InstallmentPlan[]> {
  if (customDriver) {
    return customDriver.readPlans();
  }

  const db = await openInstallmentDb();
  if (db) {
    try {
      const result = await new Promise<InstallmentPlan[] | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(PLANS_KEY);
        req.onsuccess = () => {
          resolve(Array.isArray(req.result) ? (req.result as InstallmentPlan[]) : null);
        };
        req.onerror = () => resolve(null);
      });
      if (result) return result;
    } catch {
      // Fall back to localStorage below
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LS_FALLBACK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as InstallmentPlan[];
      }
    } catch {
      // Ignore invalid fallback JSON
    }
  }

  return [];
}

async function writeAllPlans(plans: InstallmentPlan[]): Promise<void> {
  if (customDriver) {
    await customDriver.writePlans(plans);
    return;
  }

  const db = await openInstallmentDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(plans, PLANS_KEY);
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
      window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(plans));
    } catch {
      // Ignore quota exceeded
    }
  }
}

export async function listInstallmentPlans(): Promise<InstallmentPlan[]> {
  const plans = await readAllPlans();
  return [...plans].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function createInstallmentPlan(
  input: CreateInstallmentPlanInput
): Promise<InstallmentPlan> {
  const plan = buildInstallmentPlan(input);
  const existing = await readAllPlans();
  const next = [plan, ...existing];
  await writeAllPlans(next);
  return plan;
}

export async function recordInstallmentPlanPayment(
  planId: string,
  payment: {
    amount: number;
    paymentDate: string;
    method: InstallmentPaymentMethod;
    notes?: string;
    todayIso?: string;
  }
): Promise<{ plan: InstallmentPlan; record: InstallmentPaymentRecord }> {
  const existing = await readAllPlans();
  const idx = existing.findIndex((p) => p.id === planId);
  if (idx === -1) {
    throw new Error('Installment plan not found');
  }
  const { updatedPlan, record } = applyPaymentToInstallmentPlan(existing[idx], payment);
  const next = [...existing];
  next[idx] = updatedPlan;
  await writeAllPlans(next);
  return { plan: updatedPlan, record };
}

export async function deleteInstallmentPlan(planId: string): Promise<void> {
  const existing = await readAllPlans();
  const next = existing.filter((p) => p.id !== planId);
  await writeAllPlans(next);
}
