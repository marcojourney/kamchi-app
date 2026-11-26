import {
  generateNotifications,
  reconcileNotifications,
  type GenerateNotificationsContext,
} from '../lib/notificationRules';
import type { Loan, LoanSchedule, Payment } from '../types/loan';
import type {
  NotificationRecord,
  NotificationSettings,
} from '../types/notifications';

export interface NotificationWorkerRequest {
  requestId: number;
  loans: Loan[];
  schedulesByLoan: Record<string, LoanSchedule[]>;
  payments: Payment[];
  settings: NotificationSettings;
  nowMs: number;
  existing: NotificationRecord[];
  context: GenerateNotificationsContext;
  suppressDueToClockRollback: boolean;
}

export interface NotificationWorkerResponse {
  requestId: number;
  notifications: NotificationRecord[];
  addedCount: number;
  removedCount: number;
}

self.onmessage = (event: MessageEvent<NotificationWorkerRequest>) => {
  const {
    requestId,
    loans,
    schedulesByLoan,
    payments,
    settings,
    nowMs,
    existing,
    context,
    suppressDueToClockRollback,
  } = event.data;

  const now = new Date(nowMs);
  const generated = generateNotifications(
    loans,
    schedulesByLoan,
    payments,
    settings,
    now,
    context
  );
  const reconciled = reconcileNotifications(generated, existing, {
    now,
    suppressDueToClockRollback,
    timeZone: context.timeZone,
  });

  const response: NotificationWorkerResponse = {
    requestId,
    notifications: reconciled.notifications,
    addedCount: reconciled.addedCount,
    removedCount: reconciled.removedCount,
  };
  self.postMessage(response);
};
