import type { CurrencyCode } from '../../types/loan';

export type InstallmentPlanStatus = 'active' | 'completed' | 'cancelled';
export type InstallmentScheduleStatus = 'pending' | 'partial' | 'paid' | 'overdue';
export type InstallmentFrequency = 'weekly' | 'monthly';
export type InstallmentPaymentMethod = 'cash' | 'bank_transfer' | 'khqr_aba';

export type AgreementType = 'installment_sale' | 'purchase_financing';

export type OwnershipStatus =
  | 'lender_owned'
  | 'ready_to_transfer'
  | 'transferred'
  | 'collateral_held'
  | 'ready_to_release'
  | 'released'
  | 'repossessed'
  | 'returned'
  | 'written_off'
  | 'cancelled';

export interface OwnershipAuditLog {
  id: string;
  timestamp: string; // ISO
  fromStatus: OwnershipStatus;
  toStatus: OwnershipStatus;
  note?: string;
  confirmedBy?: string;
  signature?: string;
  recoveredAmount?: number;
}

export interface DocumentHeldRecord {
  id: string;
  description: string;
  condition: string;
  dateReceived: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD
  customerSignature?: string;
  lenderSignature?: string;
}

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
  agreementType: AgreementType;
  ownershipStatus: OwnershipStatus;
  ownershipLogs: OwnershipAuditLog[];
  documentsHeld: DocumentHeldRecord[];
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
  agreementType?: AgreementType;
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
  agreementType?: AgreementType;
}
