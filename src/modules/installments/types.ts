import type { CurrencyCode } from '../../types/loan';

export type InstallmentPlanStatus = 'active' | 'completed' | 'cancelled';
export type InstallmentScheduleStatus = 'pending' | 'partial' | 'paid' | 'overdue';
export type InstallmentFrequency = 'weekly' | 'monthly';
export type InstallmentPaymentMethod = 'cash' | 'bank_transfer' | 'khqr_aba';

export interface InstallmentScheduleItem {
  installmentNumber: number;
  dueDate: string; // YYYY-MM-DD
  amountDue: number;
  amountPaid: number;
  status: InstallmentScheduleStatus;
  paidAt?: string;
}

export interface InstallmentPaymentRecord {
  id: string;
  planId: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  method: InstallmentPaymentMethod;
  notes?: string;
  createdAt: string;
}

export interface InstallmentPlan {
  id: string;
  source: 'manual' | 'marketchain';
  invoiceId?: string;
  itemName: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  currency: CurrencyCode;
  totalPrice: number;
  downPayment: number;
  financedAmount: number;
  interestRatePercent: number;
  totalInstallmentsPayable: number;
  installmentCount: number;
  frequency: InstallmentFrequency;
  startDate: string; // YYYY-MM-DD
  paidAmount: number;
  remainingBalance: number;
  status: InstallmentPlanStatus;
  notes?: string;
  schedules: InstallmentScheduleItem[];
  payments: InstallmentPaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstallmentPlanInput {
  source?: 'manual' | 'marketchain';
  invoiceId?: string;
  itemName: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  currency: CurrencyCode;
  totalPrice: number;
  downPayment: number;
  interestRatePercent?: number;
  installmentCount: number;
  frequency: InstallmentFrequency;
  startDate: string;
  khrRoundingStep?: number;
  notes?: string;
  todayIso?: string;
}

export interface MarketChainParsedOrder {
  source?: string;
  invoiceId?: string;
  item?: string;
  customerName?: string;
  phone?: string;
  currency?: CurrencyCode;
  total?: number;
  downPayment?: number;
  installments?: number;
}
