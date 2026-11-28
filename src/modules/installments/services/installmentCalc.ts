import { addMonths, addWeeks, format, isValid, parseISO } from 'date-fns';
import { generateSafeId, roundMoney } from '../../../lib/finance';
import type { CurrencyCode } from '../../../types/loan';
import type {
  AgreementType,
  CreateInstallmentPlanInput,
  DocumentHeldRecord,
  InstallmentFrequency,
  InstallmentPaymentMethod,
  InstallmentPaymentRecord,
  InstallmentPlan,
  InstallmentScheduleItem,
  MarketChainParsedOrder,
  OwnershipAuditLog,
  OwnershipStatus,
} from '../types';

export function roundInstallmentAmount(
  amount: number,
  currency: CurrencyCode,
  khrRoundingStep = 500
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === 'KHR') {
    const step = khrRoundingStep > 0 ? khrRoundingStep : 500;
    return Math.round(amount / step) * step;
  }
  return roundMoney(amount, 'USD');
}

export function computeNextDueDate(
  startDateIso: string,
  periodIndex: number,
  frequency: InstallmentFrequency
): string {
  const parsed = parseISO(startDateIso);
  const base = isValid(parsed) ? parsed : new Date();
  const next =
    frequency === 'weekly'
      ? addWeeks(base, periodIndex)
      : addMonths(base, periodIndex);
  return format(next, 'yyyy-MM-dd');
}

export interface GeneratedInstallmentBreakdown {
  financedAmount: number;
  totalInterestMarkup: number;
  totalInstallmentsPayable: number;
  periodicAmount: number;
  schedules: InstallmentScheduleItem[];
}

export function generateInstallmentSchedule(params: {
  totalPrice: number;
  downPayment: number;
  interestRatePercent?: number;
  installmentCount: number;
  frequency: InstallmentFrequency;
  startDate: string;
  currency: CurrencyCode;
  khrRoundingStep?: number;
  todayIso?: string;
}): GeneratedInstallmentBreakdown {
  const count = Math.max(1, Math.min(120, Math.round(params.installmentCount || 1)));
  const totalPrice = Math.max(0, Number(params.totalPrice) || 0);
  const downPayment = Math.max(0, Math.min(totalPrice, Number(params.downPayment) || 0));
  const financedAmount = roundMoney(Math.max(0, totalPrice - downPayment), params.currency);
  const rate = Math.max(0, Number(params.interestRatePercent) || 0);
  const totalInterestMarkup = roundMoney(
    financedAmount * (rate / 100) * count,
    params.currency
  );
  const rawPayable = roundMoney(financedAmount + totalInterestMarkup, params.currency);
  const totalInstallmentsPayable =
    params.currency === 'KHR'
      ? roundInstallmentAmount(rawPayable, 'KHR', params.khrRoundingStep)
      : rawPayable;

  const basePeriodic =
    count > 0
      ? roundInstallmentAmount(
          totalInstallmentsPayable / count,
          params.currency,
          params.khrRoundingStep
        )
      : 0;

  const today = params.todayIso || new Date().toISOString().slice(0, 10);
  const schedules: InstallmentScheduleItem[] = [];
  let runningAllocated = 0;

  for (let i = 1; i <= count; i += 1) {
    const isLast = i === count;
    const rawRowAmount = isLast
      ? Math.max(0, totalInstallmentsPayable - runningAllocated)
      : Math.min(basePeriodic, Math.max(0, totalInstallmentsPayable - runningAllocated));
    const amountDue = roundMoney(rawRowAmount, params.currency);
    runningAllocated = roundMoney(runningAllocated + amountDue, params.currency);

    const dueDate = computeNextDueDate(params.startDate, i, params.frequency);
    const status =
      amountDue <= 0 ? 'paid' : dueDate < today ? 'overdue' : 'pending';

    schedules.push({
      installmentNumber: i,
      dueDate,
      amountDue,
      amountPaid: 0,
      status,
    });
  }

  return {
    financedAmount,
    totalInterestMarkup,
    totalInstallmentsPayable,
    periodicAmount: schedules[0]?.amountDue ?? basePeriodic,
    schedules,
  };
}

export function refreshPlanSchedulesForDate(
  plan: InstallmentPlan,
  todayIso: string
): InstallmentPlan {
  const epsilon = plan.currency === 'KHR' ? 1 : 0.005;
  const schedules = plan.schedules.map((row) => {
    const remaining = Math.max(0, roundMoney(row.amountDue - row.amountPaid, plan.currency));
    if (remaining <= epsilon) {
      return { ...row, status: 'paid' as const };
    }
    if (row.amountPaid > 0) {
      return {
        ...row,
        status: row.dueDate < todayIso ? ('overdue' as const) : ('partial' as const),
      };
    }
    return {
      ...row,
      status: row.dueDate < todayIso ? ('overdue' as const) : ('pending' as const),
    };
  });

  const isFullyPaid = plan.remainingBalance <= epsilon;
  let ownershipStatus = plan.ownershipStatus;

  if (isFullyPaid) {
    if (ownershipStatus === 'lender_owned') {
      ownershipStatus = 'ready_to_transfer';
    } else if (ownershipStatus === 'collateral_held') {
      ownershipStatus = 'ready_to_release';
    }
  } else {
    if (ownershipStatus === 'ready_to_transfer') {
      ownershipStatus = 'lender_owned';
    } else if (ownershipStatus === 'ready_to_release') {
      ownershipStatus = 'collateral_held';
    }
  }

  return {
    ...plan,
    schedules,
    ownershipStatus,
  };
}

export function buildInstallmentPlan(input: CreateInstallmentPlanInput): InstallmentPlan {
  const nowIso = new Date().toISOString();
  const todayIso = input.todayIso || nowIso.slice(0, 10);
  const startDate = (input.startDate || todayIso).slice(0, 10);
  const agreementType: AgreementType = input.agreementType || 'installment_sale';
  const initialOwnership: OwnershipStatus =
    agreementType === 'purchase_financing' ? 'collateral_held' : 'lender_owned';

  const breakdown = generateInstallmentSchedule({
    totalPrice: input.totalPrice,
    downPayment: input.downPayment,
    interestRatePercent: input.interestRatePercent,
    installmentCount: input.installmentCount,
    frequency: input.frequency,
    startDate,
    currency: input.currency,
    khrRoundingStep: input.khrRoundingStep,
    todayIso,
  });

  const isFullyPaid = breakdown.totalInstallmentsPayable <= 0;
  const status = isFullyPaid ? 'completed' : 'active';
  const ownershipStatus = isFullyPaid
    ? agreementType === 'purchase_financing'
      ? 'ready_to_release'
      : 'ready_to_transfer'
    : initialOwnership;

  return {
    id: generateSafeId('inst'),
    source: input.source === 'marketchain' ? 'marketchain' : 'manual',
    invoiceId: input.invoiceId?.trim() ? input.invoiceId.trim().slice(0, 80) : undefined,
    itemName: input.itemName.trim().slice(0, 140),
    customerId: input.customerId?.trim() || undefined,
    customerName: input.customerName.trim().slice(0, 120),
    customerPhone: input.customerPhone?.trim()
      ? input.customerPhone.trim().slice(0, 40)
      : undefined,
    currency: input.currency,
    totalPrice: roundMoney(Math.max(0, input.totalPrice), input.currency),
    downPayment: roundMoney(
      Math.max(0, Math.min(input.totalPrice, input.downPayment)),
      input.currency
    ),
    financedAmount: breakdown.financedAmount,
    interestRatePercent: Math.max(0, Number(input.interestRatePercent) || 0),
    totalInstallmentsPayable: breakdown.totalInstallmentsPayable,
    installmentCount: breakdown.schedules.length,
    frequency: input.frequency,
    startDate,
    paidAmount: 0,
    remainingBalance: breakdown.totalInstallmentsPayable,
    status,
    agreementType,
    ownershipStatus,
    ownershipLogs: [
      {
        id: generateSafeId('owlog'),
        timestamp: nowIso,
        fromStatus: agreementType === 'purchase_financing' ? 'collateral_held' : 'lender_owned',
        toStatus: ownershipStatus,
        note: 'Initial contract creation',
      },
    ],
    documentsHeld: [],
    notes: input.notes?.trim() ? input.notes.trim().slice(0, 500) : undefined,
    schedules: breakdown.schedules,
    payments: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function applyPaymentToInstallmentPlan(
  plan: InstallmentPlan,
  payment: {
    amount: number;
    paymentDate: string;
    method: InstallmentPaymentMethod;
    notes?: string;
    todayIso?: string;
  }
): { updatedPlan: InstallmentPlan; record: InstallmentPaymentRecord } {
  const epsilon = plan.currency === 'KHR' ? 1 : 0.005;
  const paymentAmount = roundMoney(
    Math.min(Math.max(0, payment.amount), Math.max(0, plan.remainingBalance)),
    plan.currency
  );
  const nowIso = new Date().toISOString();
  const todayIso = payment.todayIso || nowIso.slice(0, 10);

  let remainingToAllocate = paymentAmount;
  const updatedSchedules = plan.schedules.map((row) => {
    const rowRemaining = Math.max(0, roundMoney(row.amountDue - row.amountPaid, plan.currency));
    if (rowRemaining <= epsilon || remainingToAllocate <= epsilon) {
      return row;
    }

    const applied = roundMoney(Math.min(rowRemaining, remainingToAllocate), plan.currency);
    remainingToAllocate = roundMoney(Math.max(0, remainingToAllocate - applied), plan.currency);
    const nextPaid = roundMoney(row.amountPaid + applied, plan.currency);
    const left = roundMoney(Math.max(0, row.amountDue - nextPaid), plan.currency);

    return {
      ...row,
      amountPaid: nextPaid,
      status:
        left <= epsilon
          ? ('paid' as const)
          : row.dueDate < todayIso
            ? ('overdue' as const)
            : ('partial' as const),
      paidAt: left <= epsilon ? payment.paymentDate : row.paidAt,
    };
  });

  const nextPaidTotal = roundMoney(
    Math.min(plan.totalInstallmentsPayable, plan.paidAmount + paymentAmount),
    plan.currency
  );
  const nextRemainingBalance = roundMoney(
    Math.max(0, plan.totalInstallmentsPayable - nextPaidTotal),
    plan.currency
  );

  const record: InstallmentPaymentRecord = {
    id: generateSafeId('instpay'),
    planId: plan.id,
    amount: paymentAmount,
    paymentDate: payment.paymentDate,
    method: payment.method,
    notes: payment.notes?.trim() ? payment.notes.trim().slice(0, 300) : undefined,
    createdAt: nowIso,
  };

  const isFullyPaid = nextRemainingBalance <= epsilon;
  let ownershipStatus = plan.ownershipStatus;
  const logs = [...plan.ownershipLogs];

  if (isFullyPaid) {
    if (ownershipStatus === 'lender_owned') {
      ownershipStatus = 'ready_to_transfer';
      logs.unshift({
        id: generateSafeId('owlog'),
        timestamp: nowIso,
        fromStatus: 'lender_owned',
        toStatus: 'ready_to_transfer',
        note: 'Fully paid, ready for ownership transfer',
      });
    } else if (ownershipStatus === 'collateral_held') {
      ownershipStatus = 'ready_to_release';
      logs.unshift({
        id: generateSafeId('owlog'),
        timestamp: nowIso,
        fromStatus: 'collateral_held',
        toStatus: 'ready_to_release',
        note: 'Fully paid, ready for collateral release',
      });
    }
  }

  const updatedPlan: InstallmentPlan = {
    ...plan,
    schedules: updatedSchedules,
    payments: [record, ...plan.payments],
    paidAmount: nextPaidTotal,
    remainingBalance: nextRemainingBalance,
    status: isFullyPaid ? 'completed' : 'active',
    ownershipStatus,
    ownershipLogs: logs,
    updatedAt: nowIso,
  };

  return { updatedPlan, record };
}

export function updatePlanOwnershipStatus(
  plan: InstallmentPlan,
  newStatus: OwnershipStatus,
  note?: string,
  confirmedBy?: string,
  signature?: string,
  recoveredAmount?: number
): InstallmentPlan {
  const nowIso = new Date().toISOString();
  const oldStatus = plan.ownershipStatus;

  const log: OwnershipAuditLog = {
    id: generateSafeId('owlog'),
    timestamp: nowIso,
    fromStatus: oldStatus,
    toStatus: newStatus,
    note: note?.trim() || undefined,
    confirmedBy: confirmedBy?.trim() || undefined,
    signature: signature?.trim() || undefined,
    recoveredAmount: recoveredAmount !== undefined && Number.isFinite(recoveredAmount) ? recoveredAmount : undefined,
  };

  return {
    ...plan,
    ownershipStatus: newStatus,
    ownershipLogs: [log, ...plan.ownershipLogs],
    updatedAt: nowIso,
  };
}

export function addDocumentHeldToPlan(
  plan: InstallmentPlan,
  doc: Omit<DocumentHeldRecord, 'id'>
): InstallmentPlan {
  const nowIso = new Date().toISOString();
  const newDoc: DocumentHeldRecord = {
    id: generateSafeId('doc'),
    description: doc.description.trim(),
    condition: doc.condition.trim(),
    dateReceived: doc.dateReceived,
    returnDate: doc.returnDate,
    customerSignature: doc.customerSignature,
    lenderSignature: doc.lenderSignature,
  };

  return {
    ...plan,
    documentsHeld: [...plan.documentsHeld, newDoc],
    updatedAt: nowIso,
  };
}

export function updateDocumentHeldInPlan(
  plan: InstallmentPlan,
  docId: string,
  updates: Partial<DocumentHeldRecord>
): InstallmentPlan {
  const nowIso = new Date().toISOString();
  const nextDocs = plan.documentsHeld.map((d) => (d.id === docId ? { ...d, ...updates } : d));
  return {
    ...plan,
    documentsHeld: nextDocs,
    updatedAt: nowIso,
  };
}

export function tryParseMarketChainPayload(raw: string): MarketChainParsedOrder | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (
      typeof parsed.item === 'string' ||
      typeof parsed.invoiceId === 'string' ||
      typeof parsed.total === 'number'
    ) {
      const currency: CurrencyCode | undefined =
        parsed.currency === 'KHR' ? 'KHR' : parsed.currency === 'USD' ? 'USD' : undefined;
      const agreementType: AgreementType | undefined =
        parsed.agreementType === 'purchase_financing' ? 'purchase_financing' : parsed.agreementType === 'installment_sale' ? 'installment_sale' : undefined;
      return {
        source: typeof parsed.source === 'string' ? parsed.source : undefined,
        invoiceId: typeof parsed.invoiceId === 'string' ? parsed.invoiceId : undefined,
        item: typeof parsed.item === 'string' ? parsed.item : undefined,
        customerName:
          typeof parsed.customerName === 'string' ? parsed.customerName : undefined,
        phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
        currency,
        total:
          typeof parsed.total === 'number' && Number.isFinite(parsed.total)
            ? parsed.total
            : undefined,
        downPayment:
          typeof parsed.downPayment === 'number' && Number.isFinite(parsed.downPayment)
            ? parsed.downPayment
            : undefined,
        installments:
          typeof parsed.installments === 'number' && Number.isFinite(parsed.installments)
            ? Math.max(1, Math.min(120, Math.round(parsed.installments)))
            : undefined,
        agreementType,
      };
    }
    return null;
  } catch {
    return null;
  }
}
