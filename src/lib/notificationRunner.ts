import {
  generateNotifications,
  isClockRolledBack,
  reconcileNotifications,
  type GenerateNotificationsContext,
  type ReconcileResult,
} from './notificationRules';
import type { Loan, LoanSchedule, Payment } from '../types/loan';
import type {
  NotificationRecord,
  NotificationSettings,
} from '../types/notifications';
import type {
  NotificationWorkerRequest,
  NotificationWorkerResponse,
} from '../workers/notificationRules.worker';

let sharedWorker: Worker | null = null;
let workerFailed = false;
let seq = 0;

function getWorker(): Worker | null {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!sharedWorker) {
    try {
      sharedWorker = new Worker(
        new URL('../workers/notificationRules.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch {
      workerFailed = true;
      sharedWorker = null;
    }
  }
  return sharedWorker;
}

/**
 * Computes and reconciles notifications inside a Web Worker when available
 * (keeping 1,000+ loan portfolios off the UI thread), falling back to an async tick.
 */
export async function runNotificationReconcileOffThread(params: {
  loans: Loan[];
  schedulesByLoan: Record<string, LoanSchedule[]>;
  payments: Payment[];
  settings: NotificationSettings;
  now?: Date;
  existing: NotificationRecord[];
  context: GenerateNotificationsContext;
}): Promise<ReconcileResult> {
  const now = params.now || new Date();
  const nowMs = now.getTime();
  const suppressDueToClockRollback = isClockRolledBack(
    nowMs,
    params.context.latestSeenTimeMs
  );

  const worker = getWorker();
  if (worker) {
    const requestId = ++seq;
    try {
      return await new Promise<ReconcileResult>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          reject(new Error('Notification worker timeout'));
        }, 5000);

        const handleMessage = (ev: MessageEvent<NotificationWorkerResponse>) => {
          if (ev.data?.requestId !== requestId) return;
          window.clearTimeout(timeoutId);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          resolve({
            notifications: ev.data.notifications,
            addedCount: ev.data.addedCount,
            removedCount: ev.data.removedCount,
          });
        };

        const handleError = () => {
          window.clearTimeout(timeoutId);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          workerFailed = true;
          reject(new Error('Notification worker error'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        const payload: NotificationWorkerRequest = {
          requestId,
          loans: params.loans,
          schedulesByLoan: params.schedulesByLoan,
          payments: params.payments,
          settings: params.settings,
          nowMs,
          existing: params.existing,
          context: params.context,
          suppressDueToClockRollback,
        };
        worker.postMessage(payload);
      });
    } catch {
      // Fall through to async main-thread execution below
    }
  }

  await new Promise<void>((r) => setTimeout(r, 0));
  const generated = generateNotifications(
    params.loans,
    params.schedulesByLoan,
    params.payments,
    params.settings,
    now,
    params.context
  );
  return reconcileNotifications(generated, params.existing, {
    now,
    suppressDueToClockRollback,
    timeZone: params.context.timeZone,
  });
}
