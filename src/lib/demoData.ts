import { addDays, format, parseISO, subDays, subMonths } from 'date-fns';
import {
  allocatePaymentAcrossSchedules,
  computeBorrowerRiskScore,
  generateRepaymentSchedule,
  roundMoney,
} from './finance';
import type {
  Borrower,
  CurrencyCode,
  InterestType,
  LateFeeType,
  Loan,
  LoanSchedule,
  Payment,
  PaymentMethod,
  RepaymentFrequency,
  StaffMember,
} from '../types/loan';

export interface DemoWorkspaceBundle {
  borrowers: Borrower[];
  loans: Loan[];
  schedulesByLoan: Record<string, LoanSchedule[]>;
  payments: Payment[];
  staff: StaffMember[];
  suggestedCashUsd: number;
  suggestedCashKhr: number;
}

interface DemoLoanSpec {
  id: string;
  borrowerId: string;
  borrowerName: string;
  currency: CurrencyCode;
  principal: number;
  interestRate: number;
  interestType: InterestType;
  termCount: number;
  frequency: RepaymentFrequency;
  customIntervalDays?: number;
  startDate: string;
  adminFee?: number;
  lateFeeType?: LateFeeType;
  lateFeeValue?: number;
  gracePeriodDays?: number;
  collateralText?: string;
  finalStatusOverride?: Loan['status'];
  simulatedPayments: Array<{
    amount: number | 'next_installment' | 'half_next_installment';
    date: string;
    method: PaymentMethod;
    collectedBy: string;
    notes?: string;
  }>;
}

export function buildDemoWorkspaceBundle(todayIso: string, ownerId: string): DemoWorkspaceBundle {
  const today = parseISO(todayIso);
  const nowIso = new Date().toISOString();

  const staff: StaffMember[] = [
    {
      id: 'demo_stf_1',
      ownerId,
      name: 'Sophal Chea',
      phone: '012 900 101',
      role: 'owner',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'demo_stf_2',
      ownerId,
      name: 'Rithy Nhem',
      phone: '015 900 202',
      role: 'collector',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'demo_stf_3',
      ownerId,
      name: 'Kosal Touch',
      phone: '077 900 303',
      role: 'collector',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const baseBorrowers: Borrower[] = [
    {
      id: 'demo_brw_1',
      ownerId,
      name: 'Sokha Chan (ចាន់ សុខា)',
      phone: '012 458 920',
      address: 'St. 315, Toul Kork, Phnom Penh',
      nationalIdNumber: '010928374',
      guarantorName: 'Maly Chan',
      guarantorPhone: '012 458 921',
      notes: 'Grocery shop owner — always pays via KHQR on time.',
      tags: ['retail', 'trusted'],
      riskScore: 95,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'demo_brw_2',
      ownerId,
      name: 'Dara Pich (ពេជ្រ តារា)',
      phone: '077 834 210',
      address: 'Ta Khmau, Kandal',
      nationalIdNumber: '020481920',
      guarantorName: 'Sovann Pich',
      guarantorPhone: '077 834 215',
      notes: 'Beverage cart vendor near central market.',
      tags: ['food-cart'],
      riskScore: 76,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'demo_brw_3',
      ownerId,
      name: 'Bopha Meas (មាស បុប្ផា)',
      phone: '092 615 304',
      address: 'Svay Dangkum, Siem Reap',
      nationalIdNumber: '030519283',
      guarantorName: 'Ratha Meas',
      guarantorPhone: '092 615 399',
      notes: 'Produces and sells silk scarves in KHR.',
      tags: ['market', 'khr'],
      riskScore: 62,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'demo_brw_4',
      ownerId,
      name: 'Visal Kim (គឹម វិសាល)',
      phone: '015 902 741',
      address: 'Sangkat Ratanak, Battambang',
      nationalIdNumber: '040672819',
      guarantorName: 'Channtha Kim',
      guarantorPhone: '015 902 742',
      notes: 'Seasonal rice trading working capital.',
      tags: ['agri', 'vip'],
      riskScore: 54,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'demo_brw_5',
      ownerId,
      name: 'Sreyneath Keo (កែវ ស្រីនាថ)',
      phone: '089 317 550',
      address: 'Sen Sok, Phnom Penh',
      nationalIdNumber: '050192847',
      guarantorName: 'Narin Keo',
      guarantorPhone: '089 317 551',
      notes: 'Requires collector follow-up visits.',
      tags: ['salon'],
      riskScore: 34,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'demo_brw_6',
      ownerId,
      name: 'Vannak Mao (ម៉ៅ វណ្ណៈ)',
      phone: '010 774 118',
      address: 'Krong Kampong Cham',
      nationalIdNumber: '060384910',
      guarantorName: 'Davy Mao',
      guarantorPhone: '010 774 119',
      notes: 'Hardware & construction supplies.',
      tags: ['wholesale', 'trusted'],
      riskScore: 90,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  const specs: DemoLoanSpec[] = [
    // 1. Settled USD loan across past 4 months (feeds P&L & 6-month Cashflow chart)
    {
      id: 'demo_ln_1',
      borrowerId: 'demo_brw_1',
      borrowerName: 'Sokha Chan (ចាន់ សុខា)',
      currency: 'USD',
      principal: 1200,
      interestRate: 2.5,
      interestType: 'flat',
      termCount: 4,
      frequency: 'monthly',
      startDate: fmt(subMonths(today, 5)),
      adminFee: 15,
      lateFeeType: 'fixed',
      lateFeeValue: 5,
      gracePeriodDays: 2,
      collateralText: 'Store inventory invoice pledge',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(subMonths(today, 4)), method: 'khqr_aba', collectedBy: 'Sophal Chea' },
        { amount: 'next_installment', date: fmt(subMonths(today, 3)), method: 'khqr_aba', collectedBy: 'Sophal Chea' },
        { amount: 'next_installment', date: fmt(subMonths(today, 2)), method: 'bank_transfer', collectedBy: 'Rithy Nhem' },
        { amount: 'next_installment', date: fmt(subMonths(today, 1)), method: 'khqr_aba', collectedBy: 'Sophal Chea' },
      ],
    },
    // 2. Current active USD Reducing Balance loan (next installment due in 5 days -> Current + Due This Week)
    {
      id: 'demo_ln_2',
      borrowerId: 'demo_brw_1',
      borrowerName: 'Sokha Chan (ចាន់ សុខា)',
      currency: 'USD',
      principal: 2500,
      interestRate: 2.0,
      interestType: 'reducing',
      termCount: 6,
      frequency: 'monthly',
      startDate: fmt(addDays(subMonths(today, 2), 5)),
      adminFee: 25,
      lateFeeType: 'percent',
      lateFeeValue: 3,
      gracePeriodDays: 2,
      collateralText: 'Shop Lease Agreement + Guarantor',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(addDays(subMonths(today, 1), 5)), method: 'khqr_aba', collectedBy: 'Sophal Chea', notes: 'Paid via ABA KHQR' },
      ],
    },
    // 3. Active USD loan with installment DUE TODAY (populates Due Today + Calendar today + Reminders)
    {
      id: 'demo_ln_3',
      borrowerId: 'demo_brw_6',
      borrowerName: 'Vannak Mao (ម៉ៅ វណ្ណៈ)',
      currency: 'USD',
      principal: 1500,
      interestRate: 3.0,
      interestType: 'flat',
      termCount: 5,
      frequency: 'monthly',
      startDate: fmt(subMonths(today, 2)),
      adminFee: 20,
      lateFeeType: 'fixed',
      lateFeeValue: 10,
      gracePeriodDays: 1,
      collateralText: 'Gold Necklace 2 Chi + Land Title Copy',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(subMonths(today, 1)), method: 'bank_transfer', collectedBy: 'Rithy Nhem' },
      ],
    },
    // 4. Late USD Weekly loan — 4 days past due (1-7 days aging bucket, Late status, partial payment)
    {
      id: 'demo_ln_4',
      borrowerId: 'demo_brw_2',
      borrowerName: 'Dara Pich (ពេជ្រ តារា)',
      currency: 'USD',
      principal: 600,
      interestRate: 2.0,
      interestType: 'flat',
      termCount: 8,
      frequency: 'weekly',
      startDate: fmt(subDays(today, 25)), // Inst 1 (-18d), Inst 2 (-11d), Inst 3 (-4d)
      adminFee: 5,
      lateFeeType: 'fixed',
      lateFeeValue: 5,
      gracePeriodDays: 1,
      collateralText: 'Cart registration + ID card',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(subDays(today, 18)), method: 'cash', collectedBy: 'Rithy Nhem' },
        { amount: 'next_installment', date: fmt(subDays(today, 11)), method: 'cash', collectedBy: 'Rithy Nhem' },
        { amount: 'half_next_installment', date: fmt(subDays(today, 3)), method: 'cash', collectedBy: 'Rithy Nhem', notes: 'Partial cash collection; balance promised tomorrow' },
      ],
    },
    // 5. In Arrears KHR Weekly loan — 18 days past due (8-30 days aging bucket, multi-currency)
    {
      id: 'demo_ln_5',
      borrowerId: 'demo_brw_3',
      borrowerName: 'Bopha Meas (មាស បុប្ផា)',
      currency: 'KHR',
      principal: 4000000,
      interestRate: 1.5,
      interestType: 'flat',
      termCount: 6,
      frequency: 'weekly',
      startDate: fmt(subDays(today, 39)), // Inst 1 (-32d), Inst 2 (-25d), Inst 3 (-18d), Inst 4 (-11d), Inst 5 (-4d), Inst 6 (+3d)
      adminFee: 40000,
      lateFeeType: 'fixed',
      lateFeeValue: 20000,
      gracePeriodDays: 2,
      collateralText: 'Weaving Loom Equipment',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(subDays(today, 32)), method: 'cash', collectedBy: 'Kosal Touch' },
        { amount: 'next_installment', date: fmt(subDays(today, 25)), method: 'khqr_aba', collectedBy: 'Kosal Touch' },
      ],
    },
    // 6. In Arrears USD Interest-Only (Balloon) loan — 46 days past due (31-90 days aging bucket)
    {
      id: 'demo_ln_6',
      borrowerId: 'demo_brw_4',
      borrowerName: 'Visal Kim (គឹម វិសាល)',
      currency: 'USD',
      principal: 3000,
      interestRate: 3.5,
      interestType: 'interest_only',
      termCount: 4,
      frequency: 'custom',
      customIntervalDays: 23,
      startDate: fmt(subDays(today, 92)), // Inst 1 (-69d), Inst 2 (-46d), Inst 3 (-23d), Inst 4 (today)
      adminFee: 30,
      lateFeeType: 'percent',
      lateFeeValue: 5,
      gracePeriodDays: 3,
      collateralText: 'Honda Dream 125cc Moto Card + Warehouse Stock',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(subDays(today, 68)), method: 'bank_transfer', collectedBy: 'Sophal Chea' },
      ],
    },
    // 7. Defaulted USD loan — 102 days past due (90+ days aging bucket)
    {
      id: 'demo_ln_7',
      borrowerId: 'demo_brw_5',
      borrowerName: 'Sreyneath Keo (កែវ ស្រីនាថ)',
      currency: 'USD',
      principal: 1000,
      interestRate: 4.0,
      interestType: 'flat',
      termCount: 4,
      frequency: 'custom',
      customIntervalDays: 34,
      startDate: fmt(subDays(today, 170)), // Inst 1 (-136d), Inst 2 (-102d), Inst 3 (-68d), Inst 4 (-34d)
      adminFee: 10,
      lateFeeType: 'fixed',
      lateFeeValue: 15,
      gracePeriodDays: 0,
      collateralText: 'Salon equipment invoice',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(subDays(today, 134)), method: 'cash', collectedBy: 'Kosal Touch' },
      ],
    },
    // 8. Written Off historical USD loan (feeds Written Off status & P&L write-off loss)
    {
      id: 'demo_ln_8',
      borrowerId: 'demo_brw_5',
      borrowerName: 'Sreyneath Keo (កែវ ស្រីនាថ)',
      currency: 'USD',
      principal: 800,
      interestRate: 3.0,
      interestType: 'flat',
      termCount: 4,
      frequency: 'monthly',
      startDate: fmt(subMonths(today, 6)),
      adminFee: 0,
      lateFeeType: 'fixed',
      lateFeeValue: 0,
      gracePeriodDays: 0,
      finalStatusOverride: 'written_off',
      simulatedPayments: [
        { amount: 'next_installment', date: fmt(subMonths(today, 5)), method: 'cash', collectedBy: 'Kosal Touch' },
      ],
    },
  ];

  const loans: Loan[] = [];
  const schedulesByLoan: Record<string, LoanSchedule[]> = {};
  const payments: Payment[] = [];
  let payCounter = 1;

  for (const spec of specs) {
    const generated = generateRepaymentSchedule({
      principal: spec.principal,
      interestRate: spec.interestRate,
      interestType: spec.interestType,
      termCount: spec.termCount,
      frequency: spec.frequency,
      customIntervalDays: spec.customIntervalDays,
      startDate: spec.startDate,
      currency: spec.currency,
    });

    let loanObj: Loan = {
      id: spec.id,
      ownerId,
      borrowerId: spec.borrowerId,
      borrowerName: spec.borrowerName,
      currency: spec.currency,
      principal: spec.principal,
      interestRate: spec.interestRate,
      interestType: spec.interestType,
      termCount: spec.termCount,
      frequency: spec.frequency,
      startDate: spec.startDate,
      adminFee: spec.adminFee ?? 0,
      lateFeeType: spec.lateFeeType ?? 'fixed',
      lateFeeValue: spec.lateFeeValue ?? 0,
      gracePeriodDays: spec.gracePeriodDays ?? 0,
      status: 'active',
      totalPayable: generated.totalPayable,
      totalInterest: generated.totalInterest,
      paidPrincipal: 0,
      paidInterest: 0,
      paidPenalty: 0,
      outstandingBalance: generated.totalPayable,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (spec.frequency === 'custom' && spec.customIntervalDays) {
      loanObj.customIntervalDays = spec.customIntervalDays;
    }
    if (spec.collateralText) {
      loanObj.collateralText = spec.collateralText;
    }

    let schList: LoanSchedule[] = generated.schedules.map((sch) => ({
      id: `inst_${sch.installmentNumber}`,
      ownerId,
      loanId: spec.id,
      borrowerId: spec.borrowerId,
      installmentNumber: sch.installmentNumber,
      dueDate: sch.dueDate,
      principalDue: sch.principalDue,
      interestDue: sch.interestDue,
      totalDue: sch.totalDue,
      principalPaid: 0,
      interestPaid: 0,
      penaltyPaid: 0,
      status: sch.dueDate < todayIso ? 'overdue' : 'pending',
      updatedAt: nowIso,
    }));

    for (const simPay of spec.simulatedPayments) {
      const nextUnpaid = schList.find((s) => s.status !== 'paid');
      if (!nextUnpaid) break;

      let payAmount: number;
      if (simPay.amount === 'next_installment') {
        payAmount = roundMoney(
          Math.max(0, nextUnpaid.totalDue - nextUnpaid.principalPaid - nextUnpaid.interestPaid),
          spec.currency
        );
      } else if (simPay.amount === 'half_next_installment') {
        payAmount = roundMoney(
          Math.max(0, (nextUnpaid.totalDue - nextUnpaid.principalPaid - nextUnpaid.interestPaid) * 0.5),
          spec.currency
        );
      } else {
        payAmount = simPay.amount;
      }

      if (payAmount <= 0) continue;

      const alloc = allocatePaymentAcrossSchedules({
        amount: payAmount,
        loan: loanObj,
        schedules: schList,
        todayIso: simPay.date,
      });

      schList = schList.map((s) => {
        const upd = alloc.updatedSchedules.find((u) => u.id === s.id);
        return upd ? { ...s, ...upd } : s;
      });

      loanObj = {
        ...loanObj,
        paidPrincipal: alloc.newPaidPrincipal,
        paidInterest: alloc.newPaidInterest,
        paidPenalty: alloc.newPaidPenalty,
        outstandingBalance: alloc.newOutstandingBalance,
        status: alloc.newStatus,
      };

      const payId = `demo_pay_${payCounter++}`;
      payments.push({
        id: payId,
        ownerId,
        loanId: spec.id,
        borrowerId: spec.borrowerId,
        borrowerName: spec.borrowerName,
        currency: spec.currency,
        amount: payAmount,
        principalPortion: alloc.principalPortion,
        interestPortion: alloc.interestPortion,
        penaltyPortion: alloc.penaltyPortion,
        method: simPay.method,
        paymentDate: simPay.date,
        referenceNo: `RCP-${String(1000 + payCounter)}`,
        notes: simPay.notes,
        collectedBy: simPay.collectedBy,
        createdAt: nowIso,
      });
    }

    // Re-evaluate final overdue statuses relative to todayIso
    schList = schList.map((s) => {
      if (s.status === 'paid') return s;
      const anyPaid = s.principalPaid > 0 || s.interestPaid > 0 || s.penaltyPaid > 0;
      return {
        ...s,
        status: anyPaid ? 'partial' : s.dueDate < todayIso ? 'overdue' : 'pending',
      };
    });

    if (spec.finalStatusOverride) {
      loanObj.status = spec.finalStatusOverride;
    }

    loans.push(loanObj);
    schedulesByLoan[spec.id] = schList;
  }

  // Recompute dynamic risk scores for demo borrowers
  const borrowers = baseBorrowers.map((b) => {
    const bLoans = loans.filter((l) => l.borrowerId === b.id);
    return {
      ...b,
      riskScore: computeBorrowerRiskScore(bLoans, schedulesByLoan, todayIso),
    };
  });

  return {
    borrowers,
    loans,
    schedulesByLoan,
    payments,
    staff,
    suggestedCashUsd: DEMO_CASH_USD,
    suggestedCashKhr: DEMO_CASH_KHR,
  };
}

export const DEMO_CASH_USD = 4500;
export const DEMO_CASH_KHR = 8200000;

