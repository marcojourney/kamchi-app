import type { Payment } from '../types/loan';

type PaymentRecordedListener = (payment: Payment) => void;
type PaymentUndoneListener = (paymentId: string) => void;

const recordedListeners = new Set<PaymentRecordedListener>();
const undoneListeners = new Set<PaymentUndoneListener>();

export function emitPaymentRecorded(payment: Payment): void {
  for (const fn of recordedListeners) fn(payment);
}

export function subscribePaymentRecorded(fn: PaymentRecordedListener): () => void {
  recordedListeners.add(fn);
  return () => {
    recordedListeners.delete(fn);
  };
}

export function emitPaymentUndone(paymentId: string): void {
  for (const fn of undoneListeners) fn(paymentId);
}

export function subscribePaymentUndone(fn: PaymentUndoneListener): () => void {
  undoneListeners.add(fn);
  return () => {
    undoneListeners.delete(fn);
  };
}
