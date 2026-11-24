import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type {
  AppLanguage,
  CurrencyCode,
  InterestType,
  LateFeeType,
  Loan,
  LoanSchedule,
  PaymentMethod,
  RepaymentFrequency,
} from '../types/loan';

const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];

export function toKhmerDigits(input: string): string {
  return input.replace(/\d/g, (d) => KHMER_DIGITS[Number(d)] ?? d);
}

export function roundMoney(amount: number, currency: CurrencyCode): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === 'KHR') {
    return Math.round(amount / 100) * 100;
  }
  return Math.round(amount * 100) / 100;
}

export function formatCurrency(
  amount: number,
  currency: CurrencyCode,
  lang: AppLanguage = 'en',
  useKhmerNumerals = false
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const locale = lang === 'km' ? 'km-KH' : 'en-US';
  let formatted: string;
  if (currency === 'KHR') {
    const num = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(Math.round(safeAmount));
    formatted = `${num}\u00A0៛`;
  } else {
    formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  }
  return useKhmerNumerals ? toKhmerDigits(formatted) : formatted;
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  exchangeRateKhr: number
): number {
  if (from === to) return amount;
  const rate = exchangeRateKhr > 0 ? exchangeRateKhr : 4100;
  if (from === 'USD' && to === 'KHR') return roundMoney(amount * rate, 'KHR');
  return roundMoney(amount / rate, 'USD');
}

export function formatDateLocalized(
  isoDate: string,
  lang: AppLanguage = 'en',
  useKhmerNumerals = false
): string {
  try {
    const d = parseISO(isoDate);
    const out = format(d, lang === 'km' ? 'dd/MM/yyyy' : 'MMM dd, yyyy');
    return useKhmerNumerals ? toKhmerDigits(out) : out;
  } catch {
    return isoDate;
  }
}

export function getNextDueDate(
  startDate: string,
  periodIndex: number,
  frequency: RepaymentFrequency,
  customIntervalDays = 10
): string {
  const base = parseISO(startDate);
  let target: Date;
  if (frequency === 'daily') {
    target = addDays(base, periodIndex);
  } else if (frequency === 'weekly') {
    target = addWeeks(base, periodIndex);
  } else if (frequency === 'monthly') {
    target = addMonths(base, periodIndex);
  } else {
    target = addDays(base, periodIndex * Math.max(1, customIntervalDays));
  }
  return format(target, 'yyyy-MM-dd');
}

export interface GeneratedScheduleDraft {
  installmentNumber: number;
  dueDate: string;
  principalDue: number;
  interestDue: number;
  totalDue: number;
}

export function generateRepaymentSchedule(params: {
  principal: number;
  interestRate: number; // % per period
  interestType: InterestType;
  termCount: number;
  frequency: RepaymentFrequency;
  customIntervalDays?: number;
  startDate: string;
  currency: CurrencyCode;
}): {
  schedules: GeneratedScheduleDraft[];
  totalInterest: number;
  totalPayable: number;
} {
  const {
    principal,
    interestRate,
    interestType,
    termCount,
    frequency,
    customIntervalDays = 10,
    startDate,
    currency,
  } = params;

  const n = Math.max(1, Math.min(360, Math.round(termCount)));
  const r = Math.max(0, interestRate) / 100;
  const schedules: GeneratedScheduleDraft[] = [];

  if (interestType === 'flat') {
    const basePrincipal = roundMoney(principal / n, currency);
    const periodInterest = roundMoney(principal * r, currency);
    let remainingPrincipal = principal;

    for (let i = 1; i <= n; i++) {
      const pDue = i === n ? roundMoney(remainingPrincipal, currency) : basePrincipal;
      remainingPrincipal = Math.max(0, remainingPrincipal - pDue);
      const iDue = periodInterest;
      schedules.push({
        installmentNumber: i,
        dueDate: getNextDueDate(startDate, i, frequency, customIntervalDays),
        principalDue: pDue,
        interestDue: iDue,
        totalDue: roundMoney(pDue + iDue, currency),
      });
    }
  } else if (interestType === 'reducing') {
    let remaining = principal;
    if (r === 0) {
      const baseP = roundMoney(principal / n, currency);
      for (let i = 1; i <= n; i++) {
        const pDue = i === n ? roundMoney(remaining, currency) : baseP;
        remaining = Math.max(0, remaining - pDue);
        schedules.push({
          installmentNumber: i,
          dueDate: getNextDueDate(startDate, i, frequency, customIntervalDays),
          principalDue: pDue,
          interestDue: 0,
          totalDue: pDue,
        });
      }
    } else {
      const pmtRaw = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      const pmt = roundMoney(pmtRaw, currency);
      for (let i = 1; i <= n; i++) {
        const iDue = roundMoney(remaining * r, currency);
        const pDue = i === n ? roundMoney(remaining, currency) : roundMoney(Math.max(0, pmt - iDue), currency);
        remaining = Math.max(0, remaining - pDue);
        schedules.push({
          installmentNumber: i,
          dueDate: getNextDueDate(startDate, i, frequency, customIntervalDays),
          principalDue: pDue,
          interestDue: iDue,
          totalDue: roundMoney(pDue + iDue, currency),
        });
      }
    }
  } else {
    // interest_only: interest each period, full principal on last installment
    const periodInterest = roundMoney(principal * r, currency);
    for (let i = 1; i <= n; i++) {
      const pDue = i === n ? roundMoney(principal, currency) : 0;
      schedules.push({
        installmentNumber: i,
        dueDate: getNextDueDate(startDate, i, frequency, customIntervalDays),
        principalDue: pDue,
        interestDue: periodInterest,
        totalDue: roundMoney(pDue + periodInterest, currency),
      });
    }
  }

  const totalInterest = roundMoney(
    schedules.reduce((sum, s) => sum + s.interestDue, 0),
    currency
  );
  const totalPayable = roundMoney(
    schedules.reduce((sum, s) => sum + s.totalDue, 0),
    currency
  );

  return { schedules, totalInterest, totalPayable };
}

export function computeScheduleLateFee(
  schedule: LoanSchedule,
  loan: Pick<Loan, 'lateFeeType' | 'lateFeeValue' | 'gracePeriodDays' | 'currency'>,
  todayIso: string
): { daysOverdue: number; accruedPenalty: number } {
  if (schedule.status === 'paid') {
    return { daysOverdue: 0, accruedPenalty: 0 };
  }
  const diff = differenceInCalendarDays(parseISO(todayIso), parseISO(schedule.dueDate));
  const grace = loan.gracePeriodDays ?? 0;
  if (diff <= grace) {
    return { daysOverdue: Math.max(0, diff), accruedPenalty: 0 };
  }
  const feeVal = loan.lateFeeValue ?? 0;
  if (feeVal <= 0) {
    return { daysOverdue: diff, accruedPenalty: 0 };
  }
  const unpaidInstallment = Math.max(
    0,
    schedule.totalDue - (schedule.principalPaid + schedule.interestPaid)
  );
  if (loan.lateFeeType === 'percent') {
    const raw = unpaidInstallment * (feeVal / 100);
    return { daysOverdue: diff, accruedPenalty: roundMoney(raw, loan.currency) };
  }
  return { daysOverdue: diff, accruedPenalty: roundMoney(feeVal, loan.currency) };
}

export type AgingBucketKey = '1_7' | '8_30' | '31_90' | '90_plus';
export type LoanArrearsStatus =
  | 'current'
  | 'late'
  | 'in_arrears'
  | 'defaulted'
  | 'written_off';

export interface LoanArrearsSummary {
  loan: Loan;
  status: LoanArrearsStatus;
  daysPastDue: number;
  agingBucket: AgingBucketKey | null;
  unpaidInstallmentsCount: number;
  missedInstallmentsCount: number;
  arrearsPrincipal: number;
  arrearsInterest: number;
  arrearsPenalty: number;
  totalArrears: number;
  nextDueDate?: string;
  oldestMissedDueDate?: string;
}

export function getAgingBucketForDays(daysPastDue: number): AgingBucketKey | null {
  if (daysPastDue <= 0) return null;
  if (daysPastDue <= 7) return '1_7';
  if (daysPastDue <= 30) return '8_30';
  if (daysPastDue <= 90) return '31_90';
  return '90_plus';
}

export function computeLoanArrearsSummary(
  loan: Loan,
  schedules: LoanSchedule[],
  todayIso: string
): LoanArrearsSummary {
  const unpaidSchedules = schedules
    .filter((s) => s.status !== 'paid')
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  const missedSchedules = unpaidSchedules.filter((s) => s.dueDate < todayIso);

  let daysPastDue = 0;
  let oldestMissedDueDate: string | undefined;
  let arrearsPrincipal = 0;
  let arrearsInterest = 0;
  let arrearsPenalty = 0;

  for (const s of missedSchedules) {
    const diff = Math.max(0, differenceInCalendarDays(parseISO(todayIso), parseISO(s.dueDate)));
    if (diff > daysPastDue) {
      daysPastDue = diff;
      oldestMissedDueDate = s.dueDate;
    }

    const unpaidP = Math.max(0, roundMoney(s.principalDue - s.principalPaid, loan.currency));
    const unpaidI = Math.max(0, roundMoney(s.interestDue - s.interestPaid, loan.currency));
    const { accruedPenalty } = computeScheduleLateFee(s, loan, todayIso);
    const unpaidPen = Math.max(0, roundMoney(accruedPenalty - s.penaltyPaid, loan.currency));

    arrearsPrincipal = roundMoney(arrearsPrincipal + unpaidP, loan.currency);
    arrearsInterest = roundMoney(arrearsInterest + unpaidI, loan.currency);
    arrearsPenalty = roundMoney(arrearsPenalty + unpaidPen, loan.currency);
  }

  const totalArrears = roundMoney(
    arrearsPrincipal + arrearsInterest + arrearsPenalty,
    loan.currency
  );

  let status: LoanArrearsStatus;
  if (loan.status === 'written_off') {
    status = 'written_off';
  } else if (daysPastDue === 0) {
    status = 'current';
  } else if (daysPastDue <= 7) {
    status = 'late';
  } else if (daysPastDue <= 90) {
    status = 'in_arrears';
  } else {
    status = 'defaulted';
  }

  return {
    loan,
    status,
    daysPastDue,
    agingBucket: getAgingBucketForDays(daysPastDue),
    unpaidInstallmentsCount: unpaidSchedules.length,
    missedInstallmentsCount: missedSchedules.length,
    arrearsPrincipal,
    arrearsInterest,
    arrearsPenalty,
    totalArrears,
    nextDueDate: unpaidSchedules[0]?.dueDate,
    oldestMissedDueDate,
  };
}

export function allocatePaymentAcrossSchedules(params: {
  amount: number;
  loan: Loan;
  schedules: LoanSchedule[];
  todayIso: string;
}): {
  penaltyPortion: number;
  interestPortion: number;
  principalPortion: number;
  updatedSchedules: Array<{
    id: string;
    principalPaid: number;
    interestPaid: number;
    penaltyPaid: number;
    status: LoanSchedule['status'];
    paidAt?: string;
  }>;
  newPaidPrincipal: number;
  newPaidInterest: number;
  newPaidPenalty: number;
  newOutstandingBalance: number;
  newStatus: Loan['status'];
} {
  const { amount, loan, schedules, todayIso } = params;
  const ordered = [...schedules].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const cleanDec = (val: number) => (Number.isFinite(val) ? Math.round(val * 100) / 100 : 0);

  let remaining = cleanDec(amount);
  let penaltyPortion = 0;
  let interestPortion = 0;
  let principalPortion = 0;

  const updatedSchedules: Array<{
    id: string;
    principalPaid: number;
    interestPaid: number;
    penaltyPaid: number;
    status: LoanSchedule['status'];
    paidAt?: string;
  }> = [];

  for (const sch of ordered) {
    if (remaining <= 0.0001) break;
    if (sch.status === 'paid') continue;

    let pPaid = sch.principalPaid;
    let iPaid = sch.interestPaid;
    let penPaid = sch.penaltyPaid;

    // 1. Penalty first
    const { accruedPenalty } = computeScheduleLateFee(sch, loan, todayIso);
    const unpaidPenalty = cleanDec(Math.max(0, accruedPenalty - penPaid));
    if (unpaidPenalty > 0 && remaining > 0) {
      const payPen = cleanDec(Math.min(remaining, unpaidPenalty));
      penPaid = cleanDec(penPaid + payPen);
      penaltyPortion = cleanDec(penaltyPortion + payPen);
      remaining = cleanDec(remaining - payPen);
    }

    // 2. Interest second
    const unpaidInterest = cleanDec(Math.max(0, sch.interestDue - iPaid));
    if (unpaidInterest > 0 && remaining > 0) {
      const payInt = cleanDec(Math.min(remaining, unpaidInterest));
      iPaid = cleanDec(iPaid + payInt);
      interestPortion = cleanDec(interestPortion + payInt);
      remaining = cleanDec(remaining - payInt);
    }

    // 3. Principal third
    const unpaidPrincipal = cleanDec(Math.max(0, sch.principalDue - pPaid));
    if (unpaidPrincipal > 0 && remaining > 0) {
      const payPrin = cleanDec(Math.min(remaining, unpaidPrincipal));
      pPaid = cleanDec(pPaid + payPrin);
      principalPortion = cleanDec(principalPortion + payPrin);
      remaining = cleanDec(remaining - payPrin);
    }

    const donePrincipal = pPaid >= sch.principalDue - 0.01;
    const doneInterest = iPaid >= sch.interestDue - 0.01;
    const isPaid = donePrincipal && doneInterest;
    const anyPaid = pPaid > 0 || iPaid > 0 || penPaid > 0;
    const isPastDue = sch.dueDate < todayIso;

    updatedSchedules.push({
      id: sch.id,
      principalPaid: pPaid,
      interestPaid: iPaid,
      penaltyPaid: penPaid,
      status: isPaid ? 'paid' : anyPaid ? 'partial' : isPastDue ? 'overdue' : 'pending',
      paidAt: isPaid ? todayIso : sch.paidAt,
    });
  }

  // If extra overpayment beyond scheduled amounts remains, credit toward principal
  if (remaining > 0.0001) {
    principalPortion = cleanDec(principalPortion + remaining);
  }

  const newPaidPrincipal = cleanDec((loan.paidPrincipal ?? 0) + principalPortion);
  const newPaidInterest = cleanDec((loan.paidInterest ?? 0) + interestPortion);
  const newPaidPenalty = cleanDec((loan.paidPenalty ?? 0) + penaltyPortion);

  const totalScheduledRemaining = ordered.reduce((acc, s) => {
    const upd = updatedSchedules.find((u) => u.id === s.id);
    const pP = upd ? upd.principalPaid : s.principalPaid;
    const iP = upd ? upd.interestPaid : s.interestPaid;
    return acc + Math.max(0, s.principalDue - pP) + Math.max(0, s.interestDue - iP);
  }, 0);

  const newOutstandingBalance = cleanDec(Math.max(0, totalScheduledRemaining));
  const newStatus: Loan['status'] = newOutstandingBalance <= 0.01 ? 'settled' : 'active';

  return {
    penaltyPortion,
    interestPortion,
    principalPortion,
    updatedSchedules,
    newPaidPrincipal,
    newPaidInterest,
    newPaidPenalty,
    newOutstandingBalance,
    newStatus,
  };
}

export function computeBorrowerRiskScore(
  loans: Loan[],
  schedulesByLoan: Record<string, LoanSchedule[]>,
  todayIso: string
): number {
  if (loans.length === 0) return 85;
  let score = 80;
  let totalInstallments = 0;
  let onTimeOrPaid = 0;
  let overdueCount = 0;
  let maxDaysLate = 0;

  for (const loan of loans) {
    if (loan.status === 'settled') score += 5;
    if (loan.status === 'written_off') score -= 35;

    const schList = schedulesByLoan[loan.id] || [];
    for (const s of schList) {
      totalInstallments += 1;
      if (s.status === 'paid') {
        if (!s.paidAt || s.paidAt <= s.dueDate) {
          onTimeOrPaid += 1;
        }
      } else if (s.dueDate < todayIso) {
        overdueCount += 1;
        const lateDays = differenceInCalendarDays(parseISO(todayIso), parseISO(s.dueDate));
        if (lateDays > maxDaysLate) maxDaysLate = lateDays;
      }
    }
  }

  if (totalInstallments > 0) {
    const ratio = onTimeOrPaid / totalInstallments;
    score += Math.round(ratio * 15);
  }

  score -= overdueCount * 6;
  if (maxDaysLate > 30) score -= 20;
  else if (maxDaysLate > 7) score -= 10;

  return Math.max(10, Math.min(100, Math.round(score)));
}

export async function compressImageToDataUrl(file: File, maxDim = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function compressLogoToDataUrl(file: File, maxDim = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const pngUrl = canvas.toDataURL('image/png');
        if (pngUrl.length <= 180000) {
          resolve(pngUrl);
          return;
        }
        const jpgCanvas = document.createElement('canvas');
        jpgCanvas.width = width;
        jpgCanvas.height = height;
        const jctx = jpgCanvas.getContext('2d');
        if (jctx) {
          jctx.fillStyle = '#FFFFFF';
          jctx.fillRect(0, 0, width, height);
          jctx.drawImage(img, 0, 0, width, height);
          resolve(jpgCanvas.toDataURL('image/jpeg', 0.78));
        } else {
          resolve(pngUrl.slice(0, 180000));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function hashPinSha256(pin: string, uid: string): Promise<string> {
  const data = new TextEncoder().encode(`${uid}:RielLedger:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSafeId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const hex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

export function getPaymentMethodLabelKey(method: PaymentMethod): string {
  if (method === 'khqr_aba') return 'payment.methodKhqr';
  if (method === 'bank_transfer') return 'payment.methodBank';
  return 'payment.methodCash';
}
