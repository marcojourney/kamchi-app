import {
  buildPortfolioSnapshot,
  type PortfolioSnapshot,
  type PortfolioSnapshotContext,
} from './portfolioSnapshot';
import type { Borrower, Loan } from '../types/loan';
import type {
  PortfolioSnapshotWorkerRequest,
  PortfolioSnapshotWorkerResponse,
} from '../workers/portfolioSnapshot.worker';

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
        new URL('../workers/portfolioSnapshot.worker.ts', import.meta.url),
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
 * Computes PortfolioSnapshot in a Web Worker when available so large portfolios
 * never freeze the UI thread, falling back cleanly to an async main-thread tick.
 */
export async function runPortfolioSnapshotOffThread(params: {
  loans: Loan[];
  borrowers: Borrower[];
  now?: Date;
  context?: PortfolioSnapshotContext;
}): Promise<PortfolioSnapshot> {
  const now = params.now || new Date();
  const nowMs = now.getTime();
  const worker = getWorker();

  if (worker) {
    const requestId = ++seq;
    try {
      return await new Promise<PortfolioSnapshot>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          reject(new Error('Portfolio snapshot worker timeout'));
        }, 4000);

        const handleMessage = (ev: MessageEvent<PortfolioSnapshotWorkerResponse>) => {
          if (ev.data?.requestId !== requestId) return;
          window.clearTimeout(timeoutId);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          resolve(ev.data.snapshot);
        };

        const handleError = () => {
          window.clearTimeout(timeoutId);
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          workerFailed = true;
          reject(new Error('Portfolio snapshot worker error'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        const payload: PortfolioSnapshotWorkerRequest = {
          requestId,
          loans: params.loans,
          borrowers: params.borrowers,
          nowMs,
          context: params.context,
        };
        worker.postMessage(payload);
      });
    } catch {
      // Fall through to async fallback
    }
  }

  await new Promise<void>((r) => setTimeout(r, 0));
  return buildPortfolioSnapshot(params.loans, params.borrowers, now, params.context);
}
