import {
  createDefaultNotificationSettings,
  DEFAULT_REMINDER_TEMPLATES,
} from './notificationTemplates';
import type { AppLanguage } from '../types/loan';
import type {
  NotificationRecord,
  NotificationSettings,
} from '../types/notifications';

const NOTIF_DB_NAME = 'kamchi_notifications_db';
const NOTIF_DB_VERSION = 1;
const STORE_NOTIFICATIONS = 'notifications';
const STORE_SETTINGS = 'notificationSettings';
const SETTINGS_KEY = 'current';
const META_DISMISSED_SUMMARY_KEY = 'daily_summary_dismissed_date';
const LS_NOTIFICATIONS_KEY = 'kamchi_notifications_v1';
const LS_SETTINGS_KEY = 'kamchi_notification_settings_v1';
const LS_SUMMARY_DISMISSED_KEY = 'kamchi_daily_summary_dismissed_v1';

function openNotifDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(NOTIF_DB_NAME, NOTIF_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NOTIFICATIONS)) {
          db.createObjectStore(STORE_NOTIFICATIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
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

export function normalizeNotificationSettings(
  raw: Partial<NotificationSettings> | null | undefined,
  fallbackLang: AppLanguage = 'en'
): NotificationSettings {
  const base = createDefaultNotificationSettings(fallbackLang);
  if (!raw || typeof raw !== 'object') return base;

  return {
    categories: {
      ...base.categories,
      ...(raw.categories || {}),
    },
    leadDays: Array.isArray(raw.leadDays)
      ? raw.leadDays.filter((n) => n === 1 || n === 3 || n === 7)
      : base.leadDays,
    quietHours: {
      ...base.quietHours,
      ...(raw.quietHours || {}),
    },
    dailySummaryTime:
      typeof raw.dailySummaryTime === 'string' && /^\d{2}:\d{2}$/.test(raw.dailySummaryTime)
        ? raw.dailySummaryTime
        : base.dailySummaryTime,
    firstOverdueDayOffset:
      typeof raw.firstOverdueDayOffset === 'number' && Number.isFinite(raw.firstOverdueDayOffset)
        ? Math.max(0, Math.min(90, Math.round(raw.firstOverdueDayOffset)))
        : base.firstOverdueDayOffset,
    defaultReminderLanguage:
      raw.defaultReminderLanguage === 'km' || raw.defaultReminderLanguage === 'en'
        ? raw.defaultReminderLanguage
        : base.defaultReminderLanguage,
    defaultChannel:
      raw.defaultChannel === 'telegram' ||
      raw.defaultChannel === 'sms' ||
      raw.defaultChannel === 'whatsapp'
        ? raw.defaultChannel
        : base.defaultChannel,
    privacyHideDetails: Boolean(raw.privacyHideDetails),
    templates: {
      en: {
        ...DEFAULT_REMINDER_TEMPLATES.en,
        ...(raw.templates?.en || {}),
      },
      km: {
        ...DEFAULT_REMINDER_TEMPLATES.km,
        ...(raw.templates?.km || {}),
      },
    },
  };
}

export async function loadStoredNotifications(): Promise<NotificationRecord[]> {
  const db = await openNotifDb();
  if (db) {
    try {
      const items = await new Promise<NotificationRecord[]>((resolve) => {
        const tx = db.transaction(STORE_NOTIFICATIONS, 'readonly');
        const store = tx.objectStore(STORE_NOTIFICATIONS);
        const req = store.getAll();
        req.onsuccess = () =>
          resolve(Array.isArray(req.result) ? (req.result as NotificationRecord[]) : []);
        req.onerror = () => resolve([]);
      });
      try {
        db.close();
      } catch {
        // Ignore
      }
      if (items.length > 0) return items;
    } catch {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LS_NOTIFICATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) return parsed as NotificationRecord[];
      }
    } catch {
      // Ignore storage error
    }
  }
  return [];
}

export async function saveStoredNotifications(
  items: NotificationRecord[]
): Promise<void> {
  const db = await openNotifDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NOTIFICATIONS, 'readwrite');
        const store = tx.objectStore(STORE_NOTIFICATIONS);
        store.clear();
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save notifications'));
        tx.onabort = () => reject(tx.error ?? new Error('Aborted saving notifications'));
      });
      try {
        db.close();
      } catch {
        // Ignore
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LS_NOTIFICATIONS_KEY, JSON.stringify(items));
        } catch {
          // Ignore quota error
        }
      }
      return;
    } catch {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_NOTIFICATIONS_KEY, JSON.stringify(items));
    } catch {
      // Ignore quota error
    }
  }
}

export async function loadNotificationSettings(
  fallbackLang: AppLanguage = 'en'
): Promise<NotificationSettings> {
  const db = await openNotifDb();
  if (db) {
    try {
      const raw = await new Promise<Partial<NotificationSettings> | null>((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get(SETTINGS_KEY);
        req.onsuccess = () =>
          resolve((req.result as Partial<NotificationSettings> | undefined) ?? null);
        req.onerror = () => resolve(null);
      });
      try {
        db.close();
      } catch {
        // Ignore
      }
      if (raw) return normalizeNotificationSettings(raw, fallbackLang);
    } catch {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(LS_SETTINGS_KEY);
      if (raw) {
        return normalizeNotificationSettings(
          JSON.parse(raw) as Partial<NotificationSettings>,
          fallbackLang
        );
      }
    } catch {
      // Ignore
    }
  }

  return createDefaultNotificationSettings(fallbackLang);
}

export async function saveNotificationSettings(
  settings: NotificationSettings
): Promise<void> {
  const db = await openNotifDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        store.put(settings, SETTINGS_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save settings'));
      });
      try {
        db.close();
      } catch {
        // Ignore
      }
    } catch {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }
}

export async function loadDailySummaryDismissedDate(): Promise<string | null> {
  const db = await openNotifDb();
  if (db) {
    try {
      const val = await new Promise<string | null>((resolve) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get(META_DISMISSED_SUMMARY_KEY);
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => resolve(null);
      });
      try {
        db.close();
      } catch {
        // Ignore
      }
      if (val) return val;
    } catch {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem(LS_SUMMARY_DISMISSED_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export async function saveDailySummaryDismissedDate(isoDate: string): Promise<void> {
  const db = await openNotifDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        store.put(isoDate, META_DISMISSED_SUMMARY_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save dismissed date'));
      });
      try {
        db.close();
      } catch {
        // Ignore
      }
    } catch {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_SUMMARY_DISMISSED_KEY, isoDate);
    } catch {
      // Ignore
    }
  }
}
