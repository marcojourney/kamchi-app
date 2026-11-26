import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { TERMS_VERSION } from '../config/terms';
import { useApp } from './AppContext';
import { useTermsContext } from '../components/TermsGate';
import { getPreloadedLicenseSnapshot } from '../lib/licenseStorage';
import {
  addCalendarDays,
  DEFAULT_TIMEZONE,
  diffCalendarDays,
  getLocalHHMM,
  getLocalIsoDate,
  isTimeInQuietHours,
  resolveDeviceTimeZone,
} from '../lib/notificationDates';
import {
  subscribePaymentRecorded,
  subscribePaymentUndone,
} from '../lib/notificationEvents';
import {
  computeDailySummaryMetrics,
  createPaymentRecordedNotification,
  type DailySummaryMetrics,
} from '../lib/notificationRules';
import { runNotificationReconcileOffThread } from '../lib/notificationRunner';
import {
  loadDailySummaryDismissedDate,
  loadNotificationSettings,
  loadStoredNotifications,
  saveDailySummaryDismissedDate,
  saveNotificationSettings,
  saveStoredNotifications,
} from '../lib/notificationStore';
import { createDefaultNotificationSettings } from '../lib/notificationTemplates';
import { subscribeSwUpdate } from '../lib/swUpdateBridge';
import { track } from '../lib/analytics';
import type { Payment } from '../types/loan';
import type {
  NotificationFilter,
  NotificationRecord,
  NotificationSettings,
} from '../types/notifications';

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const PAYMENT_UNDO_TOAST_MS = 10_000;

export type SnoozeOption = '1d' | '3d' | 'until_due';
export type NotificationTimeBucket = 'today' | 'this_week' | 'earlier';

export interface NotificationRenderEntry {
  kind: 'single' | 'cluster';
  key: string;
  items: NotificationRecord[];
  primary: NotificationRecord;
}

export interface NotificationSectionGroup {
  bucket: NotificationTimeBucket;
  entries: NotificationRenderEntry[];
}

export interface RecentPaymentToastState {
  payment: Payment;
  notificationId: string;
  expiresAtMs: number;
}

interface NotificationContextValue {
  ready: boolean;
  notifications: NotificationRecord[];
  visibleNotifications: NotificationRecord[];
  unreadCount: number;
  settings: NotificationSettings;
  dailySummaryMetrics: DailySummaryMetrics;
  showDailySummaryBanner: boolean;
  actionNeeded: {
    overdueCount: number;
    dueTodayCount: number;
    totalCount: number;
  };
  quietHoursActive: boolean;
  swUpdateAvailable: boolean;
  recentPaymentToast: RecentPaymentToastState | null;
  undoNoticeVisible: boolean;
  liveAnnouncement: string;
  isCenterOpen: boolean;
  activeFilter: NotificationFilter;
  setActiveFilter: (filter: NotificationFilter) => void;
  openCenter: (initialFilter?: NotificationFilter) => void;
  closeCenter: () => void;
  getSectionsForFilter: (filter: NotificationFilter) => NotificationSectionGroup[];
  markRead: (id: string) => void;
  markManyRead: (ids: string[]) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  dismissMany: (ids: string[]) => void;
  snooze: (id: string, option: SnoozeOption) => void;
  snoozeMany: (ids: string[], option: SnoozeOption) => void;
  updateNotificationSettings: (
    updater:
      | Partial<NotificationSettings>
      | ((prev: NotificationSettings) => NotificationSettings)
  ) => Promise<void>;
  resetTemplates: () => Promise<void>;
  dismissDailySummary: () => Promise<void>;
  dismissPaymentToast: () => void;
  undoRecentPayment: (paymentId: string, notificationId?: string) => Promise<boolean>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const PRIORITY_RANK: Record<NotificationRecord['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

function sortNotifications(items: NotificationRecord[]): NotificationRecord[] {
  return [...items].sort((a, b) => {
    const aUnread = a.readAt ? 1 : 0;
    const bUnread = b.readAt ? 1 : 0;
    if (aUnread !== bUnread) return aUnread - bUnread;
    const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function matchesFilter(
  item: NotificationRecord,
  filter: NotificationFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return !item.readAt;
  if (filter === 'overdue') {
    return (
      item.type === 'overdue' ||
      item.type === 'missed_installments' ||
      item.type === 'promise_broken' ||
      item.type === 'penalty_started'
    );
  }
  if (filter === 'due_soon') {
    return (
      item.type === 'due_soon' ||
      item.type === 'loan_maturing' ||
      item.type === 'interest_only_ending' ||
      item.type === 'partial_payment'
    );
  }
  return true;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { t, i18n } = useTranslation('notifications');
  const {
    authReady,
    loans,
    schedulesByLoan,
    payments,
    profile,
    todayIso,
    undoPayment,
  } = useApp();
  const { storedRecord, termsVersion } = useTermsContext();

  const [ready, setReady] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(() =>
    createDefaultNotificationSettings(i18n.language === 'km' ? 'km' : 'en')
  );
  const [dailySummaryDismissedDate, setDailySummaryDismissedDate] = useState<
    string | null
  >(null);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [isCenterOpen, setIsCenterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [recentPaymentToast, setRecentPaymentToast] =
    useState<RecentPaymentToastState | null>(null);
  const [undoNoticeVisible, setUndoNoticeVisible] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [clockTick, setClockTick] = useState(() => Date.now());

  const notificationsRef = useRef<NotificationRecord[]>([]);
  const settingsRef = useRef<NotificationSettings>(settings);
  const reconcileLockRef = useRef<Promise<void> | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const undoNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Initial load from IndexedDB
  useEffect(() => {
    let active = true;
    const fallbackLang =
      profile?.preferredLang || (i18n.language === 'km' ? 'km' : 'en');
    Promise.all([
      loadStoredNotifications(),
      loadNotificationSettings(fallbackLang),
      loadDailySummaryDismissedDate(),
    ]).then(([storedItems, storedSettings, dismissedDate]) => {
      if (!active) return;
      notificationsRef.current = storedItems;
      settingsRef.current = storedSettings;
      setNotifications(storedItems);
      setSettings(storedSettings);
      setDailySummaryDismissedDate(dismissedDate);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Subscribe to service worker update signal
  useEffect(() => {
    return subscribeSwUpdate((available) => {
      setSwUpdateAvailable(available);
    });
  }, []);

  const persistNotifications = useCallback((next: NotificationRecord[]) => {
    notificationsRef.current = next;
    setNotifications(next);
    void saveStoredNotifications(next);
  }, []);

  const runReconcile = useCallback(async () => {
    if (!ready || !authReady) return;

    const execute = async () => {
      const now = new Date();
      setClockTick(now.getTime());
      const timeZone = resolveDeviceTimeZone(DEFAULT_TIMEZONE);
      const latestSeenTimeMs =
        getPreloadedLicenseSnapshot()?.latestSeenTime ?? null;
      const defaultCurrency = profile?.defaultCurrency || 'USD';
      const currencies = new Set(loans.map((l) => l.currency));
      const multiCurrencyEnabled =
        currencies.size > 1 ||
        (currencies.size === 1 && !currencies.has(defaultCurrency));
      const termsVersionChanged = Boolean(
        storedRecord && storedRecord.termsVersion !== (termsVersion || TERMS_VERSION)
      );

      const res = await runNotificationReconcileOffThread({
        loans,
        schedulesByLoan,
        payments,
        settings: settingsRef.current,
        now,
        existing: notificationsRef.current,
        context: {
          timeZone,
          latestSeenTimeMs,
          defaultCurrency,
          exchangeRateKhr: profile?.exchangeRateKhr || 4100,
          exchangeRateUpdatedAt: profile?.exchangeRateUpdatedAt,
          multiCurrencyEnabled,
          displayLang: i18n.language === 'km' ? 'km' : 'en',
          useKhmerNumerals: Boolean(profile?.useKhmerNumerals),
          termsVersionChanged,
          currentTermsVersion: termsVersion || TERMS_VERSION,
          appUpdateAvailable: swUpdateAvailable,
          appUpdateVersion: 'sw-ready',
        },
      });

      notificationsRef.current = res.notifications;
      setNotifications(res.notifications);
      await saveStoredNotifications(res.notifications);

      if (res.addedCount > 0) {
        setLiveAnnouncement(t('bell.newAlertsAnnounce', { count: res.addedCount }));
      }
    };

    const prev = reconcileLockRef.current ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(execute);
    reconcileLockRef.current = next;
    await next;
  }, [
    ready,
    authReady,
    loans,
    schedulesByLoan,
    payments,
    profile,
    storedRecord,
    termsVersion,
    swUpdateAvailable,
    i18n.language,
    t,
  ]);

  // Run reconcile when data/settings/sw status change
  useEffect(() => {
    if (!ready || !authReady) return;
    void runReconcile();
  }, [ready, authReady, settings, runReconcile]);

  // Reconcile when app returns to foreground or on 15-minute timer
  useEffect(() => {
    if (!ready || !authReady) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void runReconcile();
      }
    };
    const handleFocus = () => {
      void runReconcile();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    const intervalId = window.setInterval(() => {
      void runReconcile();
    }, REFRESH_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
    };
  }, [ready, authReady, runReconcile]);

  // Subscribe to payment recorded / undone events for instant 10-sec Undo toast
  useEffect(() => {
    const unsubRecorded = subscribePaymentRecorded((payment) => {
      const now = new Date();
      const record = createPaymentRecordedNotification({
        payment,
        now,
        displayLang: i18n.language === 'km' ? 'km' : 'en',
        useKhmerNumerals: Boolean(profile?.useKhmerNumerals),
      });

      const current = notificationsRef.current.filter((n) => n.id !== record.id);
      const next = [record, ...current];
      persistNotifications(next);

      const inQuiet = isTimeInQuietHours(
        getLocalHHMM(now, DEFAULT_TIMEZONE),
        settingsRef.current.quietHours
      );

      if (!inQuiet) {
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        setRecentPaymentToast({
          payment,
          notificationId: record.id,
          expiresAtMs: now.getTime() + PAYMENT_UNDO_TOAST_MS,
        });
        toastTimerRef.current = window.setTimeout(() => {
          setRecentPaymentToast(null);
        }, PAYMENT_UNDO_TOAST_MS);
      }
    });

    const unsubUndone = subscribePaymentUndone((paymentId) => {
      const targetNotifId = `payment_recorded:${paymentId}`;
      const next = notificationsRef.current.filter((n) => n.id !== targetNotifId);
      persistNotifications(next);
      setRecentPaymentToast((prev) =>
        prev?.payment.id === paymentId ? null : prev
      );
    });

    return () => {
      unsubRecorded();
      unsubUndone();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (undoNoticeTimerRef.current) window.clearTimeout(undoNoticeTimerRef.current);
    };
  }, [i18n.language, profile?.useKhmerNumerals, persistNotifications]);

  const quietHoursActive = useMemo(() => {
    const hhmm = getLocalHHMM(new Date(clockTick), DEFAULT_TIMEZONE);
    return isTimeInQuietHours(hhmm, settings.quietHours);
  }, [clockTick, settings.quietHours]);

  const visibleNotifications = useMemo(() => {
    const nowMs = Date.now();
    return sortNotifications(
      notifications.filter((n) => {
        if (n.dismissedAt) return false;
        if (n.snoozedUntil && Date.parse(n.snoozedUntil) > nowMs) return false;
        return true;
      })
    );
  }, [notifications, clockTick]);

  const unreadCount = useMemo(
    () => visibleNotifications.filter((n) => !n.readAt).length,
    [visibleNotifications]
  );

  const actionNeeded = useMemo(() => {
    let overdueCount = 0;
    let dueTodayCount = 0;
    for (const item of visibleNotifications) {
      if (
        item.type === 'overdue' ||
        item.type === 'missed_installments' ||
        item.type === 'promise_broken'
      ) {
        overdueCount += 1;
      } else if (
        item.type === 'due_soon' &&
        (item.dueDate === todayIso || item.params.daysUntil === 0)
      ) {
        dueTodayCount += 1;
      }
    }
    return {
      overdueCount,
      dueTodayCount,
      totalCount: overdueCount + dueTodayCount,
    };
  }, [visibleNotifications, todayIso]);

  const dailySummaryMetrics = useMemo(() => {
    return computeDailySummaryMetrics(loans, schedulesByLoan, payments, new Date(), {
      timeZone: DEFAULT_TIMEZONE,
      defaultCurrency: profile?.defaultCurrency || 'USD',
      exchangeRateKhr: profile?.exchangeRateKhr || 4100,
      displayLang: i18n.language === 'km' ? 'km' : 'en',
      useKhmerNumerals: Boolean(profile?.useKhmerNumerals),
    });
  }, [loans, schedulesByLoan, payments, profile, i18n.language]);

  const showDailySummaryBanner = useMemo(() => {
    if (!ready || !settings.categories.summary) return false;
    if (dailySummaryDismissedDate === todayIso) return false;
    return loans.length > 0 || payments.length > 0;
  }, [
    ready,
    settings.categories.summary,
    dailySummaryDismissedDate,
    todayIso,
    loans.length,
    payments.length,
  ]);

  const getSectionsForFilter = useCallback(
    (filter: NotificationFilter): NotificationSectionGroup[] => {
      const localToday = getLocalIsoDate(new Date(), DEFAULT_TIMEZONE);
      const filtered = visibleNotifications.filter((item) =>
        matchesFilter(item, filter)
      );

      const bucketMap: Record<NotificationTimeBucket, NotificationRecord[]> = {
        today: [],
        this_week: [],
        earlier: [],
      };

      for (const item of filtered) {
        const refDate = item.createdAt.slice(0, 10);
        const ageDays = diffCalendarDays(localToday, refDate);
        if (ageDays <= 0) {
          bucketMap.today.push(item);
        } else if (ageDays <= 6) {
          bucketMap.this_week.push(item);
        } else {
          bucketMap.earlier.push(item);
        }
      }

      const buildEntries = (
        list: NotificationRecord[]
      ): NotificationRenderEntry[] => {
        const clusters = new Map<string, NotificationRecord[]>();
        const orderedKeys: Array<{ type: 'single' | 'cluster'; key: string; item?: NotificationRecord }> = [];

        for (const item of list) {
          if (item.groupKey) {
            let group = clusters.get(item.groupKey);
            if (!group) {
              group = [];
              clusters.set(item.groupKey, group);
              orderedKeys.push({ type: 'cluster', key: item.groupKey });
            }
            group.push(item);
          } else {
            orderedKeys.push({ type: 'single', key: item.id, item });
          }
        }

        const entries: NotificationRenderEntry[] = [];
        for (const entry of orderedKeys) {
          if (entry.type === 'single' && entry.item) {
            entries.push({
              kind: 'single',
              key: entry.item.id,
              items: [entry.item],
              primary: entry.item,
            });
          } else {
            const group = clusters.get(entry.key) || [];
            if (group.length === 1) {
              entries.push({
                kind: 'single',
                key: group[0].id,
                items: [group[0]],
                primary: group[0],
              });
            } else if (group.length > 1) {
              entries.push({
                kind: 'cluster',
                key: `cluster:${entry.key}`,
                items: group,
                primary: group[0],
              });
            }
          }
        }
        return entries;
      };

      const buckets: NotificationTimeBucket[] = ['today', 'this_week', 'earlier'];
      return buckets
        .map((bucket) => ({
          bucket,
          entries: buildEntries(bucketMap[bucket]),
        }))
        .filter((s) => s.entries.length > 0);
    },
    [visibleNotifications]
  );

  const markRead = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      const next = notificationsRef.current.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: nowIso } : n
      );
      persistNotifications(next);
    },
    [persistNotifications]
  );

  const markManyRead = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const nowIso = new Date().toISOString();
      const next = notificationsRef.current.map((n) =>
        idSet.has(n.id) && !n.readAt ? { ...n, readAt: nowIso } : n
      );
      persistNotifications(next);
    },
    [persistNotifications]
  );

  const markAllRead = useCallback(() => {
    const nowIso = new Date().toISOString();
    const next = notificationsRef.current.map((n) =>
      !n.readAt ? { ...n, readAt: nowIso } : n
    );
    persistNotifications(next);
  }, [persistNotifications]);

  const dismiss = useCallback(
    (id: string) => {
      const nowIso = new Date().toISOString();
      const next = notificationsRef.current.map((n) =>
        n.id === id ? { ...n, dismissedAt: nowIso, readAt: n.readAt || nowIso } : n
      );
      persistNotifications(next);
    },
    [persistNotifications]
  );

  const dismissMany = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const nowIso = new Date().toISOString();
      const next = notificationsRef.current.map((n) =>
        idSet.has(n.id)
          ? { ...n, dismissedAt: nowIso, readAt: n.readAt || nowIso }
          : n
      );
      persistNotifications(next);
    },
    [persistNotifications]
  );

  const computeSnoozeUntilIso = (
    item: NotificationRecord,
    option: SnoozeOption
  ): string => {
    const now = new Date();
    if (option === '1d') {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    if (option === '3d') {
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (item.dueDate) {
      const todayLocal = getLocalIsoDate(now, DEFAULT_TIMEZONE);
      if (item.dueDate > todayLocal) {
        return new Date(`${item.dueDate}T08:00:00`).toISOString();
      }
      const tomorrowIso = addCalendarDays(todayLocal, 1);
      return new Date(`${tomorrowIso}T08:00:00`).toISOString();
    }
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  };

  const snooze = useCallback(
    (id: string, option: SnoozeOption) => {
      const nowIso = new Date().toISOString();
      const next = notificationsRef.current.map((n) =>
        n.id === id
          ? {
              ...n,
              snoozedUntil: computeSnoozeUntilIso(n, option),
              readAt: n.readAt || nowIso,
            }
          : n
      );
      persistNotifications(next);
    },
    [persistNotifications]
  );

  const snoozeMany = useCallback(
    (ids: string[], option: SnoozeOption) => {
      const idSet = new Set(ids);
      const nowIso = new Date().toISOString();
      const next = notificationsRef.current.map((n) =>
        idSet.has(n.id)
          ? {
              ...n,
              snoozedUntil: computeSnoozeUntilIso(n, option),
              readAt: n.readAt || nowIso,
            }
          : n
      );
      persistNotifications(next);
    },
    [persistNotifications]
  );

  const updateNotificationSettings = useCallback(
    async (
      updater:
        | Partial<NotificationSettings>
        | ((prev: NotificationSettings) => NotificationSettings)
    ) => {
      const prev = settingsRef.current;
      const next: NotificationSettings =
        typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      settingsRef.current = next;
      setSettings(next);
      await saveNotificationSettings(next);
    },
    []
  );

  const resetTemplates = useCallback(async () => {
    const defaults = createDefaultNotificationSettings(
      settingsRef.current.defaultReminderLanguage
    );
    await updateNotificationSettings((prev) => ({
      ...prev,
      templates: defaults.templates,
    }));
  }, [updateNotificationSettings]);

  const dismissDailySummary = useCallback(async () => {
    setDailySummaryDismissedDate(todayIso);
    await saveDailySummaryDismissedDate(todayIso);
  }, [todayIso]);

  const dismissPaymentToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setRecentPaymentToast(null);
  }, []);

  const undoRecentPayment = useCallback(
    async (paymentId: string, notificationId?: string): Promise<boolean> => {
      const ok = await undoPayment(paymentId);
      if (ok) {
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        setRecentPaymentToast(null);
        if (notificationId) {
          const next = notificationsRef.current.filter((n) => n.id !== notificationId);
          persistNotifications(next);
        }
        setUndoNoticeVisible(true);
        if (undoNoticeTimerRef.current) window.clearTimeout(undoNoticeTimerRef.current);
        undoNoticeTimerRef.current = window.setTimeout(() => {
          setUndoNoticeVisible(false);
        }, 3000);
      }
      return ok;
    },
    [undoPayment, persistNotifications]
  );

  const openCenter = useCallback((initialFilter?: NotificationFilter) => {
    if (initialFilter) setActiveFilter(initialFilter);
    setIsCenterOpen(true);
    track('feature_used', { feature: 'notification_center' });
  }, []);

  const closeCenter = useCallback(() => {
    setIsCenterOpen(false);
  }, []);

  const value: NotificationContextValue = {
    ready,
    notifications,
    visibleNotifications,
    unreadCount,
    settings,
    dailySummaryMetrics,
    showDailySummaryBanner,
    actionNeeded,
    quietHoursActive,
    swUpdateAvailable,
    recentPaymentToast,
    undoNoticeVisible,
    liveAnnouncement,
    isCenterOpen,
    activeFilter,
    setActiveFilter,
    openCenter,
    closeCenter,
    getSectionsForFilter,
    markRead,
    markManyRead,
    markAllRead,
    dismiss,
    dismissMany,
    snooze,
    snoozeMany,
    updateNotificationSettings,
    resetTemplates,
    dismissDailySummary,
    dismissPaymentToast,
    undoRecentPayment,
    refreshNotifications: runReconcile,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
    </NotificationContext.Provider>
  );
};

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }
  return ctx;
}
