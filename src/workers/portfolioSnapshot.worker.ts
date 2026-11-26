import {
  buildPortfolioSnapshot,
  type PortfolioSnapshot,
  type PortfolioSnapshotContext,
} from '../lib/portfolioSnapshot';
import type { Borrower, Loan } from '../types/loan';

export interface PortfolioSnapshotWorkerRequest {
  requestId: number;
  loans: Loan[];
  borrowers: Borrower[];
  nowMs: number;
  context?: PortfolioSnapshotContext;
}

export interface PortfolioSnapshotWorkerResponse {
  requestId: number;
  snapshot: PortfolioSnapshot;
}

self.onmessage = (event: MessageEvent<PortfolioSnapshotWorkerRequest>) => {
  const { requestId, loans, borrowers, nowMs, context } = event.data;
  const snapshot = buildPortfolioSnapshot(loans, borrowers, new Date(nowMs), context);
  const response: PortfolioSnapshotWorkerResponse = { requestId, snapshot };
  self.postMessage(response);
};
