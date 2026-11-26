export type AppLanguage = 'en' | 'km';
export type CurrencyCode = 'USD' | 'KHR';
export type InterestType = 'flat' | 'reducing' | 'interest_only';
export type RepaymentFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';
export type LateFeeType = 'fixed' | 'percent';
export type LoanStatus = 'active' | 'settled' | 'written_off' | 'renewed';
export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'overdue';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'khqr_aba';
export type StaffRole = 'owner' | 'collector';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  lenderPhone?: string;
  lenderLogoDataUrl?: string;
  preferredLang: AppLanguage;
  defaultCurrency: CurrencyCode;
  exchangeRateKhr: number;
  exchangeRateUpdatedAt?: string;
  capitalCashUsd?: number;
  capitalCashKhr?: number;
  useKhmerNumerals?: boolean;
  pinHash?: string;
  biometricEnabled?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Borrower {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  address?: string;
  nationalIdNumber?: string;
  idPhotoDataUrl?: string;
  borrowerPhotoDataUrl?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorPhotoDataUrl?: string;
  notes?: string;
  preferredLang?: AppLanguage;
  tags?: string[];
  riskScore?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Loan {
  id: string;
  ownerId: string;
  borrowerId: string;
  borrowerName: string;
  currency: CurrencyCode;
  principal: number;
  interestRate: number; // % per period
  interestType: InterestType;
  termCount: number;
  frequency: RepaymentFrequency;
  customIntervalDays?: number;
  startDate: string; // YYYY-MM-DD
  adminFee?: number;
  lateFeeType?: LateFeeType;
  lateFeeValue?: number;
  gracePeriodDays?: number;
  collateralText?: string;
  collateralPhotoUrl?: string;
  signatureDataUrl?: string;
  status: LoanStatus;
  totalPayable: number;
  totalInterest?: number;
  paidPrincipal?: number;
  paidInterest?: number;
  paidPenalty?: number;
  outstandingBalance: number;
  parentLoanId?: string;
  portalShareId?: string;
  promiseToPayDate?: string; // YYYY-MM-DD
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LoanSchedule {
  id: string;
  ownerId: string;
  loanId: string;
  borrowerId: string;
  installmentNumber: number;
  dueDate: string; // YYYY-MM-DD
  principalDue: number;
  interestDue: number;
  totalDue: number;
  principalPaid: number;
  interestPaid: number;
  penaltyPaid: number;
  status: InstallmentStatus;
  paidAt?: string;
  updatedAt?: unknown;
}

export interface Payment {
  id: string;
  ownerId: string;
  loanId: string;
  borrowerId: string;
  borrowerName: string;
  currency: CurrencyCode;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  penaltyPortion: number;
  method: PaymentMethod;
  paymentDate: string; // YYYY-MM-DD
  referenceNo?: string;
  notes?: string;
  collectedBy?: string;
  gpsLat?: number;
  gpsLng?: number;
  createdAt?: unknown;
}

export interface StaffMember {
  id: string;
  ownerId: string;
  name: string;
  phone?: string;
  role: StaffRole;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  ownerId: string;
  actorUid: string;
  actorName: string;
  action: string;
  entityType: 'borrower' | 'loan' | 'payment' | 'staff' | 'settings';
  entityId: string;
  summary: string;
  createdAt?: unknown;
}

export interface PortalShareScheduleItem {
  installmentNumber: number;
  dueDate: string;
  principalDue?: number;
  interestDue?: number;
  totalDue: number;
  paidAmount: number;
  status: InstallmentStatus;
}

export interface PortalShare {
  id: string;
  ownerId: string;
  loanId: string;
  borrowerFirstName: string;
  lenderName: string;
  lenderPhone?: string;
  lenderLogoDataUrl?: string;
  currency: CurrencyCode;
  principal: number;
  interestType?: InterestType;
  interestRate?: number;
  totalPayable: number;
  outstandingBalance: number;
  status: LoanStatus;
  schedules: PortalShareScheduleItem[];
  updatedAt?: unknown;
}
