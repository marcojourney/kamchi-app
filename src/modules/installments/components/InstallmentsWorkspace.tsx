import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Printer,
  QrCode,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Trash2,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '../../../components/DatePicker';
import { useLicenseContext } from '../../../components/LicenseGate';
import { QrScannerModal } from '../../../components/QrScannerModal';
import { FREE_INSTALLMENT_LIMIT } from '../../../config/featureAccess';
import { useApp } from '../../../context/AppContext';
import { canCreateBorrower, canCreateInstallmentLoan } from '../../../lib/entitlements';
import { formatCurrency, formatDateLocalized } from '../../../lib/finance';
import type { CurrencyCode } from '../../../types/loan';
import { useBusinessProfile } from '../../onboarding/hooks/useBusinessProfile';
import {
  addDocumentHeldToPlan,
  generateInstallmentSchedule,
  refreshPlanSchedulesForDate,
  tryParseMarketChainPayload,
  updateDocumentHeldInPlan,
  updatePlanOwnershipStatus,
} from '../services/installmentCalc';
import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  listInstallmentPlans,
  recordInstallmentPlanPayment,
  updateInstallmentPlan,
} from '../services/installmentStorage';
import {
  exportDocumentReceiptPdf,
  exportInstallmentClearancePdf,
  exportInstallmentPlanPdf,
  exportInstallmentReceiptPdf,
} from '../services/installmentExport';
import type {
  AgreementType,
  DocumentHeldRecord,
  InstallmentFrequency,
  InstallmentPaymentMethod,
  InstallmentPaymentRecord,
  InstallmentPlan,
  OwnershipStatus,
} from '../types';

export const SAMPLE_MARKETCHAIN_QR_ORDER = {
  source: 'marketchain',
  invoiceId: 'MC-2026-0842',
  item: 'Samsung Galaxy A55 5G',
  customerName: 'Lukas Meyer',
  phone: '012 345 678',
  currency: 'USD',
  total: 480,
  downPayment: 100,
  installments: 6,
  agreementType: 'installment_sale',
} as const;

export const SAMPLE_MARKETCHAIN_QR_PAYLOAD = JSON.stringify(SAMPLE_MARKETCHAIN_QR_ORDER);

interface InstallmentsWorkspaceProps {
  mode: 'installments' | 'marketchain_import';
  openCreateSeq?: number;
  onOpenImportTab: () => void;
  onOpenInstallmentsTab: () => void;
  onActiveCountChange?: (activeCount: number) => void;
}

export const InstallmentsWorkspace: React.FC<InstallmentsWorkspaceProps> = ({
  mode,
  openCreateSeq = 0,
  onOpenImportTab,
  onOpenInstallmentsTab,
  onActiveCountChange,
}) => {
  const { t, i18n } = useTranslation('installments');
  const { t: tOnboarding } = useTranslation('onboarding');
  const lang = i18n.language.startsWith('km') ? 'km' : 'en';
  const isKm = lang === 'km';

  const { profile: userProfile, borrowers, createBorrower, todayIso } = useApp();
  const useKh = Boolean(userProfile?.useKhmerNumerals);
  const { profile: businessProfile, defaults } = useBusinessProfile();
  const { licenseState, openUpgradePrompt } = useLicenseContext();

  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'overdue' | 'completed'>('all');
  const [toastMessage, setToastMessage] = useState('');

  // QR Scanner & Sample QR Modal
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [sampleQrDataUrl, setSampleQrDataUrl] = useState('');
  const [scannedRawBanner, setScannedRawBanner] = useState('');

  // Create form state
  const [formSource, setFormSource] = useState<'manual' | 'marketchain'>('manual');
  const [agreementType, setAgreementType] = useState<AgreementType>('installment_sale');
  const [invoiceId, setInvoiceId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const customerDropdownRef = useRef<HTMLDivElement | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [itemName, setItemName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(() =>
    businessProfile.defaultCurrency === 'KHR' ? 'KHR' : 'USD'
  );
  const [totalPrice, setTotalPrice] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [installmentCount, setInstallmentCount] = useState(() =>
    String(defaults.installment.defaultInstallments || 6)
  );
  const [frequency, setFrequency] = useState<InstallmentFrequency>('monthly');
  const [interestRatePercent, setInterestRatePercent] = useState('0');
  const [startDate, setStartDate] = useState(todayIso);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Payment modal & receipt modal & delete confirmation state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIso);
  const [payMethod, setPayMethod] = useState<InstallmentPaymentMethod>('cash');
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState('');
  const [receiptRecord, setReceiptRecord] = useState<InstallmentPaymentRecord | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Document Held & Ownership Action modals
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docDesc, setDocDesc] = useState('');
  const [docCondition, setDocCondition] = useState('');
  const [docReceivedDate, setDocReceivedDate] = useState(todayIso);
  const [ownershipModalOpen, setOwnershipModalOpen] = useState(false);
  const [targetOwnershipStatus, setTargetOwnershipStatus] = useState<OwnershipStatus | null>(null);
  const [ownershipNote, setOwnershipNote] = useState('');

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await listInstallmentPlans();
      const refreshed = loaded.map((p) => refreshPlanSchedulesForDate(p, todayIso));
      setPlans(refreshed);
      const activeCount = refreshed.filter((p) => p.status === 'active').length;
      onActiveCountChange?.(activeCount);
    } finally {
      setLoading(false);
    }
  }, [todayIso, onActiveCountChange]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  // Auto-open scanner when navigated directly to marketchain_import mode
  const lastModeRef = useRef(mode);
  useEffect(() => {
    if (mode === 'marketchain_import' && lastModeRef.current !== 'marketchain_import') {
      setScannerOpen(true);
    }
    lastModeRef.current = mode;
  }, [mode]);

  // Close customer dropdown on outside click
  useEffect(() => {
    if (!customerDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [customerDropdownOpen]);

  // Generate sample QR PNG when Sample modal opens
  useEffect(() => {
    if (!sampleModalOpen || sampleQrDataUrl) return;
    let active = true;
    void QRCode.toDataURL(SAMPLE_MARKETCHAIN_QR_PAYLOAD, {
      width: 280,
      margin: 3,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    }).then((url) => {
      if (active) setSampleQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [sampleModalOpen, sampleQrDataUrl]);

  const activeCount = useMemo(
    () => plans.filter((p) => p.status === 'active').length,
    [plans]
  );

  const resetCreateForm = useCallback(
    (preserveDefaults = true) => {
      setFormSource('manual');
      setAgreementType('installment_sale');
      setInvoiceId('');
      setCustomerId('');
      setCustomerSearch('');
      setCustomerDropdownOpen(false);
      setCustomerName('');
      setCustomerPhone('');
      setItemName('');
      if (preserveDefaults) {
        setCurrency(businessProfile.defaultCurrency === 'KHR' ? 'KHR' : 'USD');
        setInstallmentCount(String(defaults.installment.defaultInstallments || 6));
      }
      setTotalPrice('');
      setDownPayment('');
      setFrequency('monthly');
      setInterestRatePercent('0');
      setStartDate(todayIso);
      setNotes('');
      setFormError('');
      setScannedRawBanner('');
    },
    [businessProfile.defaultCurrency, defaults.installment.defaultInstallments, todayIso]
  );

  const openCreateForm = useCallback(() => {
    const check = canCreateInstallmentLoan(licenseState, activeCount);
    if (!check.allowed && check.blockReason) {
      openUpgradePrompt(check.blockReason);
      return;
    }
    resetCreateForm();
    setSelectedPlanId(null);
    setViewMode('create');
  }, [activeCount, licenseState, openUpgradePrompt, resetCreateForm]);

  const lastOpenCreateSeqRef = useRef(openCreateSeq);
  useEffect(() => {
    if (openCreateSeq > 0 && openCreateSeq !== lastOpenCreateSeqRef.current) {
      lastOpenCreateSeqRef.current = openCreateSeq;
      openCreateForm();
    }
  }, [openCreateSeq, openCreateForm]);

  const applyScannedOrder = useCallback(
    (raw: string) => {
      const check = canCreateInstallmentLoan(licenseState, activeCount);
      if (!check.allowed && check.blockReason) {
        openUpgradePrompt(check.blockReason);
        return;
      }
      const parsed = tryParseMarketChainPayload(raw);
      setScannedRawBanner(raw);
      setViewMode('create');
      setSelectedPlanId(null);
      setFormError('');

      if (parsed) {
        setFormSource('marketchain');
        if (parsed.agreementType) setAgreementType(parsed.agreementType);
        if (parsed.invoiceId) setInvoiceId(parsed.invoiceId);
        if (parsed.item) setItemName(parsed.item);
        if (parsed.customerName) {
          setCustomerName(parsed.customerName);
          const matchedCustomer = borrowers.find(
            (b) =>
              b.name.trim().toLowerCase() === parsed.customerName!.trim().toLowerCase() ||
              (parsed.phone &&
                b.phone.replace(/\s+/g, '') === parsed.phone.replace(/\s+/g, ''))
          );
          if (matchedCustomer) {
            setCustomerId(matchedCustomer.id);
          } else {
            setCustomerId('');
          }
        }
        if (parsed.phone) setCustomerPhone(parsed.phone);
        if (parsed.currency) setCurrency(parsed.currency);
        if (parsed.total !== undefined) setTotalPrice(String(parsed.total));
        if (parsed.downPayment !== undefined) setDownPayment(String(parsed.downPayment));
        if (parsed.installments !== undefined) {
          setInstallmentCount(String(parsed.installments));
        }
      }
    },
    [activeCount, borrowers, licenseState, openUpgradePrompt]
  );

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  const isPlanOverdue = useCallback(
    (plan: InstallmentPlan) =>
      plan.status === 'active' &&
      plan.schedules.some((s) => s.status === 'overdue' || (s.status !== 'paid' && s.dueDate < todayIso)),
    [todayIso]
  );

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((plan) => {
      if (statusFilter === 'active' && plan.status !== 'active') return false;
      if (statusFilter === 'completed' && plan.status !== 'completed') return false;
      if (statusFilter === 'overdue' && !isPlanOverdue(plan)) return false;

      if (q) {
        const hay = `${plan.itemName} ${plan.customerName} ${plan.customerPhone || ''} ${
          plan.invoiceId || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [plans, searchQuery, statusFilter, isPlanOverdue]);

  const kpiSummary = useMemo(() => {
    const displayCurrency: CurrencyCode =
      businessProfile.defaultCurrency === 'KHR' ? 'KHR' : 'USD';
    const rate = businessProfile.exchangeRate || userProfile?.exchangeRateKhr || 4100;

    const convert = (amount: number, from: CurrencyCode) => {
      if (from === displayCurrency) return amount;
      return from === 'USD' ? amount * rate : amount / rate;
    };

    let outstanding = 0;
    let collected = 0;
    let overdue = 0;

    for (const p of plans) {
      if (p.status === 'active') {
        outstanding += convert(p.remainingBalance, p.currency);
        for (const s of p.schedules) {
          if (s.status !== 'paid' && s.dueDate < todayIso) {
            overdue += convert(Math.max(0, s.amountDue - s.amountPaid), p.currency);
          }
        }
      }
      collected += convert(p.paidAmount + p.downPayment, p.currency);
    }

    return { displayCurrency, outstanding, collected, overdue };
  }, [plans, businessProfile.defaultCurrency, businessProfile.exchangeRate, userProfile?.exchangeRateKhr, todayIso]);

  const liveBreakdown = useMemo(() => {
    const totalNum = Number(totalPrice);
    const downNum = Number(downPayment || 0);
    const countNum = Number(installmentCount || defaults.installment.defaultInstallments || 6);
    const rateNum = Number(interestRatePercent || 0);
    if (!Number.isFinite(totalNum) || totalNum <= 0) return null;
    if (!Number.isFinite(downNum) || downNum < 0 || downNum >= totalNum) return null;
    if (!Number.isFinite(countNum) || countNum < 1 || countNum > 120) return null;

    return generateInstallmentSchedule({
      totalPrice: totalNum,
      downPayment: downNum,
      interestRatePercent: Number.isFinite(rateNum) && rateNum >= 0 ? rateNum : 0,
      installmentCount: countNum,
      frequency,
      startDate,
      currency,
      khrRoundingStep: defaults.installment.khrRoundingStep,
      todayIso,
    });
  }, [
    totalPrice,
    downPayment,
    installmentCount,
    interestRatePercent,
    frequency,
    startDate,
    currency,
    defaults.installment.defaultInstallments,
    defaults.installment.khrRoundingStep,
    todayIso,
  ]);

  const downPaymentPercent = useMemo(() => {
    const totalNum = Number(totalPrice);
    const downNum = Number(downPayment || 0);
    if (!Number.isFinite(totalNum) || totalNum <= 0 || !Number.isFinite(downNum) || downNum <= 0) {
      return 0;
    }
    return Math.round((downNum / totalNum) * 100);
  }, [totalPrice, downPayment]);

  const filteredBorrowers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return borrowers;
    return borrowers.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        (b.nationalIdNumber || '').toLowerCase().includes(q)
    );
  }, [borrowers, customerSearch]);

  const handleSelectExistingCustomer = (borrowerId: string) => {
    const found = borrowers.find((b) => b.id === borrowerId);
    if (!found) return;
    setCustomerId(found.id);
    setCustomerName(found.name);
    setCustomerPhone(found.phone);
    setCustomerDropdownOpen(false);
    setCustomerSearch('');
  };

  const handleClearSelectedCustomer = () => {
    setCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerSearch('');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const check = canCreateInstallmentLoan(licenseState, activeCount);
    if (!check.allowed && check.blockReason) {
      openUpgradePrompt(check.blockReason);
      return;
    }

    const trimmedItem = itemName.trim();
    const trimmedCustomer = customerName.trim();
    const totalNum = Number(totalPrice);
    const downNum = downPayment.trim() === '' ? 0 : Number(downPayment);
    const countNum = Math.round(Number(installmentCount));
    const rateNum = interestRatePercent.trim() === '' ? 0 : Number(interestRatePercent);

    if (!trimmedItem) {
      setFormError(t('errors.itemRequired'));
      return;
    }
    if (!trimmedCustomer) {
      setFormError(t('errors.customerRequired'));
      return;
    }
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      setFormError(t('errors.totalInvalid'));
      return;
    }
    if (!Number.isFinite(downNum) || downNum < 0 || downNum >= totalNum) {
      setFormError(t('errors.downPaymentInvalid'));
      return;
    }
    if (!Number.isFinite(countNum) || countNum < 1 || countNum > 120) {
      setFormError(t('errors.installmentsInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId && canCreateBorrower(licenseState)) {
        const existingMatch = borrowers.find(
          (b) =>
            b.name.trim().toLowerCase() === trimmedCustomer.toLowerCase() ||
            (customerPhone.trim() &&
              b.phone.replace(/\s+/g, '') === customerPhone.trim().replace(/\s+/g, ''))
        );
        if (existingMatch) {
          resolvedCustomerId = existingMatch.id;
        } else {
          try {
            resolvedCustomerId = await createBorrower({
              name: trimmedCustomer,
              phone: customerPhone.trim() || '-',
            });
          } catch {
            // Non-blocking
          }
        }
      }

      const created = await createInstallmentPlan({
        source: formSource,
        invoiceId: invoiceId.trim() || undefined,
        itemName: trimmedItem,
        customerId: resolvedCustomerId || undefined,
        customerName: trimmedCustomer,
        customerPhone: customerPhone.trim() || undefined,
        currency,
        totalPrice: totalNum,
        downPayment: downNum,
        interestRatePercent: Number.isFinite(rateNum) && rateNum >= 0 ? rateNum : 0,
        installmentCount: countNum,
        frequency,
        startDate: startDate || todayIso,
        agreementType,
        khrRoundingStep: defaults.installment.khrRoundingStep,
        notes: notes.trim() || undefined,
        todayIso,
      });

      const refreshed = refreshPlanSchedulesForDate(created, todayIso);
      const nextList = [refreshed, ...plans];
      setPlans(nextList);
      onActiveCountChange?.(nextList.filter((p) => p.status === 'active').length);
      setSelectedPlanId(refreshed.id);
      setViewMode('detail');
      setToastMessage(t('form.createdToast'));
      window.setTimeout(() => setToastMessage(''), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const openPaymentDialog = (plan: InstallmentPlan) => {
    const nextUnpaid = plan.schedules.find((s) => s.status !== 'paid');
    const suggested = nextUnpaid
      ? Math.max(0, nextUnpaid.amountDue - nextUnpaid.amountPaid)
      : plan.remainingBalance;
    setPayAmount(suggested > 0 ? String(suggested) : String(plan.remainingBalance));
    setPayDate(todayIso);
    setPayMethod('cash');
    setPayNotes('');
    setPayError('');
    setPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayError(t('paymentModal.paymentInvalid'));
      return;
    }

    const { plan: updatedPlan, record } = await recordInstallmentPlanPayment(selectedPlan.id, {
      amount: amt,
      paymentDate: payDate || todayIso,
      method: payMethod,
      notes: payNotes.trim() || undefined,
      todayIso,
    });

    const refreshed = refreshPlanSchedulesForDate(updatedPlan, todayIso);
    const nextList = plans.map((p) => (p.id === refreshed.id ? refreshed : p));
    setPlans(nextList);
    onActiveCountChange?.(nextList.filter((p) => p.status === 'active').length);
    setPaymentModalOpen(false);
    setReceiptRecord(record);
    setToastMessage(t('paymentModal.recordedToast'));
    window.setTimeout(() => setToastMessage(''), 4000);
  };

  const handleDeleteSelectedPlan = async () => {
    if (!selectedPlan) return;
    await deleteInstallmentPlan(selectedPlan.id);
    const nextList = plans.filter((p) => p.id !== selectedPlan.id);
    setPlans(nextList);
    onActiveCountChange?.(nextList.filter((p) => p.status === 'active').length);
    setDeleteConfirmOpen(false);
    setSelectedPlanId(null);
    setViewMode('list');
  };

  const handleUpdateOwnership = async (newStatus: OwnershipStatus, note?: string) => {
    if (!selectedPlan) return;
    const updated = updatePlanOwnershipStatus(
      selectedPlan,
      newStatus,
      note || ownershipNote,
      businessProfile.name || 'Lender'
    );
    const saved = await updateInstallmentPlan(updated);
    const nextList = plans.map((p) => (p.id === saved.id ? saved : p));
    setPlans(nextList);
    setOwnershipModalOpen(false);
    setOwnershipNote('');
    setTargetOwnershipStatus(null);
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !docDesc.trim()) return;
    const updated = addDocumentHeldToPlan(selectedPlan, {
      description: docDesc.trim(),
      condition: docCondition.trim() || 'Good',
      dateReceived: docReceivedDate || todayIso,
    });
    const saved = await updateInstallmentPlan(updated);
    const nextList = plans.map((p) => (p.id === saved.id ? saved : p));
    setPlans(nextList);
    setDocModalOpen(false);
    setDocDesc('');
    setDocCondition('');
  };

  const handleReturnDocument = async (docId: string) => {
    if (!selectedPlan) return;
    const updated = updateDocumentHeldInPlan(selectedPlan, docId, { returnDate: todayIso });
    const saved = await updateInstallmentPlan(updated);
    const nextList = plans.map((p) => (p.id === saved.id ? saved : p));
    setPlans(nextList);
  };

  const handleExportDetailPdf = async () => {
    if (!selectedPlan || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportInstallmentPlanPdf({
        plan: selectedPlan,
        businessProfile,
        lang,
        useKhmerNumerals: useKh,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportClearance = async () => {
    if (!selectedPlan || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportInstallmentClearancePdf({
        plan: selectedPlan,
        businessProfile,
        lang,
        useKhmerNumerals: useKh,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportReceiptPdf = async () => {
    if (!selectedPlan || !receiptRecord || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportInstallmentReceiptPdf({
        plan: selectedPlan,
        payment: receiptRecord,
        businessProfile,
        lang,
        useKhmerNumerals: useKh,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportDocReceipt = async (doc: DocumentHeldRecord) => {
    if (!selectedPlan || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportDocumentReceiptPdf({
        plan: selectedPlan,
        document: doc,
        businessProfile,
        lang,
        useKhmerNumerals: useKh,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  const fmt = (amount: number, cur: CurrencyCode) =>
    formatCurrency(amount, cur, lang, useKh);

  const methodLabel = (method: InstallmentPaymentMethod) => {
    if (method === 'khqr_aba') return t('paymentModal.methodKhqr');
    if (method === 'bank_transfer') return t('paymentModal.methodBank');
    return t('paymentModal.methodCash');
  };

  const agreementWording = (plan: InstallmentPlan) => {
    const isInstallmentSale = plan.agreementType !== 'purchase_financing';
    return isInstallmentSale ? t('ownership.soldWording') : t('ownership.collateralWording');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-950/40 px-4 py-3 text-xs font-semibold text-teal-800 dark:text-teal-200 shadow-sm print:hidden"
        >
          {toastMessage}
        </div>
      )}

      {viewMode === 'create' ? (
        <div className="space-y-5 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                {t('form.createTitle')}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {t('form.createSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('form.backToList')}</span>
            </button>
          </div>

          {scannedRawBanner && (
            <div className="rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/35 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-teal-900 dark:text-teal-200">
                    {tOnboarding('installmentsShell.qrParsedTitle')}
                  </p>
                  {formSource === 'manual' && (
                    <p className="text-slate-600 dark:text-slate-300 truncate font-mono">
                      {scannedRawBanner}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScannedRawBanner('')}
                className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline shrink-0"
              >
                {tOnboarding('installmentsShell.clearScan')}
              </button>
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-7 space-y-5">
              {/* Agreement Type */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('form.agreementTypeLabel')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAgreementType('installment_sale')}
                    className={`min-h-[50px] p-3 rounded-xl border text-left text-xs font-medium transition-colors ${
                      agreementType === 'installment_sale'
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <p className="font-bold">{t('form.installmentSaleOpt')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgreementType('purchase_financing')}
                    className={`min-h-[50px] p-3 rounded-xl border text-left text-xs font-medium transition-colors ${
                      agreementType === 'purchase_financing'
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <p className="font-bold">{t('form.purchaseFinancingOpt')}</p>
                  </button>
                </div>
              </div>

              {/* Customer Section */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('form.customerSection')}
                </h2>

                <div ref={customerDropdownRef} className="relative">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    {t('form.pickExistingCustomer')}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomerDropdownOpen((o) => !o)}
                      className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 text-sm text-left text-slate-800 dark:text-slate-100 hover:border-teal-500 transition-colors"
                    >
                      <span className="truncate">
                        {customerId
                          ? borrowers.find((b) => b.id === customerId)?.name || customerName
                          : t('form.searchCustomerPlaceholder')}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                    {customerId && (
                      <button
                        type="button"
                        onClick={handleClearSelectedCustomer}
                        aria-label={t('form.clearCustomer')}
                        className="min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {customerDropdownOpen && (
                    <div className="absolute z-30 mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            autoFocus
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder={t('form.searchCustomerPlaceholder')}
                            className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-teal-500"
                          />
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredBorrowers.length === 0 ? (
                          <p className="p-3 text-xs text-slate-500 text-center">
                            {t('form.noMatchingCustomers')}
                          </p>
                        ) : (
                          filteredBorrowers.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => handleSelectExistingCustomer(b.id)}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-teal-50/70 dark:hover:bg-teal-950/40 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {b.name}
                                </p>
                                <p className="text-[11px] font-mono text-slate-500 truncate">
                                  {b.phone} {b.nationalIdNumber ? `· ${b.nationalIdNumber}` : ''}
                                </p>
                              </div>
                              {customerId === b.id && (
                                <UserCheck className="w-4 h-4 text-teal-600 shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.customerNameLabel')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (customerId) setCustomerId('');
                      }}
                      placeholder={t('form.customerNamePlaceholder')}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.phoneLabel')}
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder={t('form.phonePlaceholder')}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Item & Payment Terms */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('form.itemSection')}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.itemNameLabel')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder={t('form.itemNamePlaceholder')}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.invoiceIdLabel')}
                    </label>
                    <input
                      type="text"
                      value={invoiceId}
                      onChange={(e) => setInvoiceId(e.target.value)}
                      placeholder={t('form.invoiceIdPlaceholder')}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.currencyLabel')}
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      {(['USD', 'KHR'] as CurrencyCode[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
                            currency === c
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          {c === 'USD' ? 'USD ($)' : 'KHR (៛)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.totalPriceLabel')} ({currency}) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={totalPrice}
                      onChange={(e) => setTotalPrice(e.target.value)}
                      placeholder={t('form.totalPricePlaceholder')}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t('form.downPaymentLabel')} ({currency})
                      </label>
                      {Number(totalPrice) > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const suggested =
                              (Number(totalPrice) * defaults.installment.minDownPaymentPercent) /
                              100;
                            setDownPayment(
                              currency === 'KHR'
                                ? String(Math.round(suggested / 100) * 100)
                                : String(Math.round(suggested * 100) / 100)
                            );
                          }}
                          className="text-[11px] font-semibold text-teal-600 hover:underline"
                        >
                          {defaults.installment.minDownPaymentPercent}%
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={downPayment}
                      onChange={(e) => setDownPayment(e.target.value)}
                      placeholder="0"
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                    />
                    {Number(totalPrice) > 0 &&
                      downPaymentPercent < defaults.installment.minDownPaymentPercent && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                          {t('form.downPaymentBelowMin', {
                            min: defaults.installment.minDownPaymentPercent,
                          })}
                        </p>
                      )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.installmentsLabel')} *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      required
                      value={installmentCount}
                      onChange={(e) => setInstallmentCount(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.frequencyLabel')}
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      {(['monthly', 'weekly'] as InstallmentFrequency[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
                            frequency === f
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          {f === 'monthly' ? t('form.freqMonthly') : t('form.freqWeekly')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.markupLabel')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={interestRatePercent}
                      onChange={(e) => setInterestRatePercent(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.startDateLabel')}
                    </label>
                    <DatePicker
                      value={startDate}
                      onChange={setStartDate}
                      useKhmerNumerals={useKh}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('form.notesLabel')}
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('form.notesPlaceholder')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {formError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-300"
                >
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 px-5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('form.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[48px] inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-6 text-sm font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? t('form.savingPlan') : t('form.savePlan')}</span>
                </button>
              </div>
            </div>

            {/* Live Schedule Preview */}
            <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 lg:sticky lg:top-20">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t('form.previewTitle')}
              </h2>

              {liveBreakdown ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500">{t('form.financedAmount')}</p>
                      <p className="text-base font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                        {fmt(liveBreakdown.financedAmount, currency)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-teal-50/70 dark:bg-teal-950/35 p-3 border border-teal-100 dark:border-teal-900/50">
                      <p className="text-[11px] text-teal-700 dark:text-teal-300">
                        {t('form.periodicPayment', {
                          period:
                            frequency === 'monthly'
                              ? t('form.freqMonthly')
                              : t('form.freqWeekly'),
                        })}
                      </p>
                      <p className="text-base font-mono font-bold text-teal-700 dark:text-teal-300 tabular-nums mt-0.5">
                        {fmt(liveBreakdown.periodicAmount, currency)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500">{t('form.downPaymentPaid')}</p>
                      <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums mt-0.5">
                        {fmt(Number(downPayment || 0), currency)} ({downPaymentPercent}%)
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] text-slate-500">{t('form.totalPayable')}</p>
                      <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums mt-0.5">
                        {fmt(
                          liveBreakdown.totalInstallmentsPayable + Number(downPayment || 0),
                          currency
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="grid grid-cols-12 px-3 py-2 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-500">
                      <span className="col-span-2">#</span>
                      <span className="col-span-5">{t('form.dueDateCol')}</span>
                      <span className="col-span-5 text-right">{t('form.amountCol')}</span>
                    </div>
                    {liveBreakdown.schedules.map((row) => (
                      <div
                        key={row.installmentNumber}
                        className="grid grid-cols-12 px-3 py-2 text-xs items-center"
                      >
                        <span className="col-span-2 font-mono text-slate-500">
                          {row.installmentNumber}
                        </span>
                        <span className="col-span-5 font-mono text-slate-700 dark:text-slate-300">
                          {formatDateLocalized(row.dueDate, lang, useKh)}
                        </span>
                        <span className="col-span-5 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {fmt(row.amountDue, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('empty.shopDefaults', {
                    down: defaults.installment.minDownPaymentPercent,
                    count: defaults.installment.defaultInstallments,
                    step: defaults.installment.khrRoundingStep.toLocaleString(),
                  })}
                </div>
              )}
            </div>
          </form>
        </div>
      ) : viewMode === 'detail' && selectedPlan ? (
        <>
          <div className="space-y-5 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlanId(null);
                    setViewMode('list');
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
                      {selectedPlan.itemName}
                    </h1>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                        selectedPlan.status === 'completed'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                          : isPlanOverdue(selectedPlan)
                            ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                            : 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                      }`}
                    >
                      {selectedPlan.status === 'completed'
                        ? t('status.completed')
                        : isPlanOverdue(selectedPlan)
                          ? t('status.overdue')
                          : t('status.active')}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedPlan.customerName}
                    {selectedPlan.customerPhone ? ` · ${selectedPlan.customerPhone}` : ''}
                    {selectedPlan.invoiceId
                      ? ` · ${t('detail.invoice', { id: selectedPlan.invoiceId })}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleExportDetailPdf()}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  <FileText className="w-4 h-4 text-teal-600" />
                  <span>{exportingPdf ? t('exportingPdf') : t('detail.exportPdf')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Printer className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  <span>{t('detail.print')}</span>
                </button>

                {selectedPlan.payments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReceiptRecord(selectedPlan.payments[0])}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Receipt className="w-4 h-4 text-teal-600" />
                    <span>{t('detail.viewReceipt')}</span>
                  </button>
                )}

                {selectedPlan.status === 'active' && selectedPlan.remainingBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => openPaymentDialog(selectedPlan)}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 text-xs font-semibold"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>{t('detail.recordPayment')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  aria-label={t('detail.deletePlan')}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

          {/* Detail Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">{t('detail.totalPrice')}</p>
              <p className="text-base font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                {fmt(selectedPlan.totalPrice, selectedPlan.currency)}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">{t('detail.downPayment')}</p>
              <p className="text-base font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                {fmt(selectedPlan.downPayment, selectedPlan.currency)}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">{t('detail.financed')}</p>
              <p className="text-base font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                {fmt(selectedPlan.totalInstallmentsPayable, selectedPlan.currency)}
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">{t('detail.paidInstallments')}</p>
              <p className="text-base font-mono font-bold text-emerald-600 tabular-nums mt-1">
                {fmt(selectedPlan.paidAmount, selectedPlan.currency)}
              </p>
            </div>
            <div className="col-span-2 lg:col-span-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-xs text-slate-500">{t('detail.remainingBalance')}</p>
              <p className="text-base font-mono font-bold text-teal-600 tabular-nums mt-1">
                {fmt(selectedPlan.remainingBalance, selectedPlan.currency)}
              </p>
            </div>
          </div>

          {/* Ownership & Collateral Card */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {t('ownership.title')}
                  </h2>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300">
                    {t(`ownership.${selectedPlan.ownershipStatus}` as any) || selectedPlan.ownershipStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  {agreementWording(selectedPlan)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(selectedPlan.ownershipStatus === 'ready_to_transfer' ||
                  selectedPlan.ownershipStatus === 'ready_to_release') && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateOwnership(
                          selectedPlan.agreementType === 'purchase_financing' ? 'released' : 'transferred',
                          'Confirmed by lender upon full payment'
                        )
                      }
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-3.5 text-xs font-semibold"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {selectedPlan.agreementType === 'purchase_financing'
                          ? t('ownership.confirmReleaseBtn')
                          : t('ownership.confirmTransferBtn')}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingPdf}
                      onClick={() => void handleExportClearance()}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <FileText className="w-4 h-4 text-teal-600" />
                      <span>{t('ownership.clearanceLetterBtn')}</span>
                    </button>
                  </>
                )}

                {selectedPlan.ownershipStatus === 'transferred' ||
                selectedPlan.ownershipStatus === 'released' ? (
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={() => void handleExportClearance()}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <FileText className="w-4 h-4 text-teal-600" />
                    <span>{t('ownership.clearanceLetterBtn')}</span>
                  </button>
                ) : null}

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateOwnership('repossessed', 'Item repossessed')}
                    className="min-h-[36px] px-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  >
                    {t('ownership.repossessBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateOwnership('returned', 'Item returned')}
                    className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {t('ownership.returnBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateOwnership('written_off', 'Written off')}
                    className="min-h-[36px] px-2.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {t('ownership.writeOffBtn')}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
              {t('ownership.note')}
            </p>
          </div>

          {/* Documents Held Section */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('documents.title')}
                </h2>
                {selectedPlan.remainingBalance <= (selectedPlan.currency === 'KHR' ? 1 : 0.005) &&
                  selectedPlan.documentsHeld.some((d) => !d.returnDate) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">
                      {t('documents.reminder')}
                    </p>
                  )}
              </div>
              <button
                type="button"
                onClick={() => setDocModalOpen(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <Plus className="w-4 h-4 text-teal-600" />
                <span>{t('documents.addBtn')}</span>
              </button>
            </div>

            {selectedPlan.documentsHeld.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                No held documents recorded for this agreement.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedPlan.documentsHeld.map((doc) => (
                  <div key={doc.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{doc.description}</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        {t('documents.conditionLabel')}: {doc.condition} · {t('documents.receivedDate')}: {formatDateLocalized(doc.dateReceived, lang, useKh)}
                        {doc.returnDate ? ` · Returned: ${formatDateLocalized(doc.returnDate, lang, useKh)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={exportingPdf}
                        onClick={() => void handleExportDocReceipt(doc)}
                        className="min-h-[36px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        {t('documents.receiptBtn')}
                      </button>
                      {!doc.returnDate && (
                        <button
                          type="button"
                          onClick={() => void handleReturnDocument(doc.id)}
                          className="min-h-[36px] px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
                        >
                          {t('documents.returnAction')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Schedule Table */}
            <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('detail.scheduleTitle')}
                </h2>
                <span className="text-xs font-mono text-slate-500">
                  {selectedPlan.schedules.filter((s) => s.status === 'paid').length} /{' '}
                  {selectedPlan.installmentCount}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedPlan.schedules.map((row) => (
                  <div
                    key={row.installmentNumber}
                    className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                        {row.installmentNumber}
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {formatDateLocalized(row.dueDate, lang, useKh)}
                        </p>
                        {row.amountPaid > 0 && row.status !== 'paid' && (
                          <p className="text-[11px] text-slate-500 font-mono">
                            {t('detail.paidAmountLabel')}:{' '}
                            {fmt(row.amountPaid, selectedPlan.currency)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {fmt(row.amountDue, selectedPlan.currency)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          row.status === 'paid'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : row.status === 'overdue'
                              ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                              : row.status === 'partial'
                                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {t(`status.${row.status}`)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment History */}
            <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('detail.paymentHistoryTitle')}
                </h2>
              </div>
              {selectedPlan.payments.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">
                  {t('detail.noPaymentsYet')}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedPlan.payments.map((pay) => (
                    <div
                      key={pay.id}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {formatDateLocalized(pay.paymentDate, lang, useKh)} ·{' '}
                          {methodLabel(pay.method)}
                        </p>
                        {pay.notes && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{pay.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-emerald-600 tabular-nums">
                          {fmt(pay.amount, selectedPlan.currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setReceiptRecord(pay)}
                          aria-label={t('detail.viewReceipt')}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Dedicated Printable A4 Installment Plan & Agreement Sheet */}
          {!receiptRecord && (
            <div className="hidden print:block bg-white text-slate-900 p-6 space-y-5">
              <div className="flex items-end justify-between border-b-2 border-teal-600 pb-4">
                <div>
                  <img
                    src={
                      businessProfile.logo && businessProfile.logo.startsWith('data:image/')
                        ? businessProfile.logo
                        : '/assets/aistudio/image_01667597.png'
                    }
                    alt={businessProfile.name || 'KamChi'}
                    className="h-12 w-auto object-contain mb-2"
                  />
                  <h1 className="text-xl font-bold text-slate-900">
                    {t('detail.documentTitle')}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedPlan.invoiceId
                      ? `${t('detail.invoice', { id: selectedPlan.invoiceId })} · `
                      : ''}
                    {selectedPlan.id}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-600 space-y-0.5">
                  <p className="font-bold text-sm text-slate-900">
                    {businessProfile.name || t('receipt.shopFallback')}
                  </p>
                  {(businessProfile.phone || businessProfile.address || businessProfile.province) && (
                    <p>
                      {[businessProfile.phone, businessProfile.address, businessProfile.province]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  <p>
                    {t('form.startDateLabel')}: {formatDateLocalized(selectedPlan.startDate, lang, useKh)}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <strong>{t('ownership.title')}:</strong> {agreementWording(selectedPlan)}
                <div className="text-[10.5px] text-slate-500 mt-1 italic">{t('ownership.note')}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="border border-slate-200 rounded-lg p-3">
                  <p className="font-bold text-slate-900 mb-1">{t('form.customerSection')}</p>
                  <p className="font-semibold">{selectedPlan.customerName}</p>
                  {selectedPlan.customerPhone && (
                    <p className="font-mono text-slate-600">{selectedPlan.customerPhone}</p>
                  )}
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <p className="font-bold text-slate-900 mb-1">{t('form.itemSection')}</p>
                  <p className="font-semibold">{selectedPlan.itemName}</p>
                  <p className="text-slate-600">
                    {selectedPlan.installmentCount} ·{' '}
                    {selectedPlan.frequency === 'weekly'
                      ? t('form.freqWeekly')
                      : t('form.freqMonthly')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                  <p className="text-slate-500">{t('detail.totalPrice')}</p>
                  <p className="font-mono font-bold mt-0.5">
                    {fmt(selectedPlan.totalPrice, selectedPlan.currency)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                  <p className="text-slate-500">{t('detail.downPayment')}</p>
                  <p className="font-mono font-bold mt-0.5">
                    {fmt(selectedPlan.downPayment, selectedPlan.currency)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                  <p className="text-slate-500">{t('detail.financed')}</p>
                  <p className="font-mono font-bold mt-0.5">
                    {fmt(selectedPlan.totalInstallmentsPayable, selectedPlan.currency)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5 bg-emerald-50">
                  <p className="text-emerald-700">{t('detail.paidInstallments')}</p>
                  <p className="font-mono font-bold text-emerald-700 mt-0.5">
                    {fmt(selectedPlan.paidAmount, selectedPlan.currency)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5 bg-teal-50">
                  <p className="text-teal-700">{t('detail.remainingBalance')}</p>
                  <p className="font-mono font-bold text-teal-700 mt-0.5">
                    {fmt(selectedPlan.remainingBalance, selectedPlan.currency)}
                  </p>
                </div>
              </div>

              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">{t('form.dueDateCol')}</th>
                    <th className="p-2 text-right">{t('form.amountCol')}</th>
                    <th className="p-2 text-right">{t('detail.paidAmountLabel')}</th>
                    <th className="p-2 text-right">{t('detail.scheduleTitle')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPlan.schedules.map((row) => (
                    <tr key={row.installmentNumber} className="border-b border-slate-200">
                      <td className="p-2 font-mono">#{row.installmentNumber}</td>
                      <td className="p-2 font-mono">
                        {formatDateLocalized(row.dueDate, lang, useKh)}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold">
                        {fmt(row.amountDue, selectedPlan.currency)}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {fmt(row.amountPaid, selectedPlan.currency)}
                      </td>
                      <td className="p-2 text-right">{t(`status.${row.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-10 pt-8 text-xs">
                <div>
                  <div className="h-12 border-b border-slate-400 mb-1.5" />
                  <p className="font-semibold">{t('detail.sellerSignature')}</p>
                  <p className="text-slate-500">
                    {businessProfile.name || t('receipt.shopFallback')}
                  </p>
                </div>
                <div>
                  <div className="h-12 border-b border-slate-400 mb-1.5" />
                  <p className="font-semibold">{t('detail.customerSignature')}</p>
                  <p className="text-slate-500">{selectedPlan.customerName}</p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* List Workspace View */
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                {mode === 'marketchain_import'
                  ? tOnboarding('installmentsShell.importTitle')
                  : t('title')}
              </h1>
              <p
                className={`text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 ${
                  isKm ? 'leading-[1.7]' : ''
                }`}
              >
                {mode === 'marketchain_import'
                  ? tOnboarding('installmentsShell.importSubtitle')
                  : t('subtitle')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSampleModalOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <QrCode className="w-4 h-4 text-teal-600" />
                <span>{t('testQrButton')}</span>
              </button>

              {mode !== 'marketchain_import' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenImportTab();
                      setScannerOpen(true);
                    }}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <QrCode className="w-4 h-4 text-teal-600" />
                    <span>{t('importQrButton')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('newPlan')}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 text-xs font-semibold transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{t('form.scanQrBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('newPlan')}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-5 print:hidden">
            {licenseState.plan === 'free' && (
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('activeUsage', {
                  count: activeCount,
                  max: FREE_INSTALLMENT_LIMIT,
                })}
              </p>
            )}

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs text-slate-500">{t('kpi.activePlans')}</p>
                <p className="text-lg sm:text-xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                  {activeCount}
                </p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs text-slate-500">{t('kpi.outstanding')}</p>
                <p className="text-lg sm:text-xl font-mono font-bold text-teal-600 tabular-nums mt-1 truncate">
                  {fmt(kpiSummary.outstanding, kpiSummary.displayCurrency)}
                </p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs text-slate-500">{t('kpi.collected')}</p>
                <p className="text-lg sm:text-xl font-mono font-bold text-emerald-600 tabular-nums mt-1 truncate">
                  {fmt(kpiSummary.collected, kpiSummary.displayCurrency)}
                </p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <p className="text-xs text-slate-500">{t('kpi.overdue')}</p>
                <p className="text-lg sm:text-xl font-mono font-bold text-red-600 tabular-nums mt-1 truncate">
                  {fmt(kpiSummary.overdue, kpiSummary.displayCurrency)}
                </p>
              </div>
            </div>

            {/* Search & Status Tabs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('filters.searchPlaceholder')}
                  className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
                {(['all', 'active', 'overdue', 'completed'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      statusFilter === tab
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {t(`filters.${tab}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Plans List or Empty State */}
            {loading ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">
                ...
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-3">
                <div className="h-11 w-11 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {t('empty.title')}
                </h2>
                <p
                  className={`text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl ${
                    isKm ? 'leading-[1.75]' : 'leading-relaxed'
                  }`}
                >
                  {t('empty.desc')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('empty.shopDefaults', {
                    down: defaults.installment.minDownPaymentPercent,
                    count: defaults.installment.defaultInstallments,
                    step: defaults.installment.khrRoundingStep.toLocaleString(),
                  })}
                </p>
                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('newPlan')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {filteredPlans.map((plan) => {
                  const paidCount = plan.schedules.filter((s) => s.status === 'paid').length;
                  const overdue = isPlanOverdue(plan);
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                        setViewMode('detail');
                      }}
                      className="w-full px-4 sm:px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {plan.itemName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              plan.status === 'completed'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : overdue
                                  ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                                  : 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                            }`}
                          >
                            {plan.status === 'completed'
                              ? t('status.completed')
                              : overdue
                                ? t('status.overdue')
                                : t('status.active')}
                          </span>
                          {plan.invoiceId && (
                            <span className="text-[11px] font-mono text-slate-500">
                              #{plan.invoiceId}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {plan.customerName}
                          {plan.customerPhone ? ` · ${plan.customerPhone}` : ''} · {paidCount}/
                          {plan.installmentCount}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                            {fmt(plan.remainingBalance, plan.currency)}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                            / {fmt(plan.totalPrice, plan.currency)}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* QR Scanner Modal */}
      {scannerOpen && (
        <QrScannerModal
          mode="any"
          title={tOnboarding('installmentsShell.importTitle')}
          subtitle={tOnboarding('installmentsShell.importSubtitle')}
          onDetected={(raw) => {
            applyScannedOrder(raw);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {/* Sample Test QR Modal */}
      {sampleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sample-qr-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        >
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="sample-qr-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {tOnboarding('installmentsShell.sampleQrTitle')}
                </h2>
                <p
                  className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${
                    isKm ? 'leading-[1.7]' : ''
                  }`}
                >
                  {tOnboarding('installmentsShell.sampleQrDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSampleModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 border border-slate-200">
              {sampleQrDataUrl ? (
                <img
                  src={sampleQrDataUrl}
                  alt={tOnboarding('installmentsShell.sampleQrTitle')}
                  className="w-56 h-56 object-contain"
                />
              ) : (
                <div className="w-56 h-56 animate-pulse rounded-xl bg-slate-100" />
              )}
              <p className="text-[11px] font-mono text-slate-600 mt-2 text-center">
                {SAMPLE_MARKETCHAIN_QR_ORDER.invoiceId} · {SAMPLE_MARKETCHAIN_QR_ORDER.item} · $
                {SAMPLE_MARKETCHAIN_QR_ORDER.total}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {sampleQrDataUrl && (
                <a
                  href={sampleQrDataUrl}
                  download="marketchain-test-qr.png"
                  className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-4 h-4 text-teal-600" />
                  <span>{tOnboarding('installmentsShell.downloadTestQr')}</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  applyScannedOrder(SAMPLE_MARKETCHAIN_QR_PAYLOAD);
                  setSampleModalOpen(false);
                }}
                className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{tOnboarding('installmentsShell.useSampleNow')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {docModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        >
          <form
            onSubmit={handleAddDocument}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t('documents.addBtn')}
              </h2>
              <button
                type="button"
                onClick={() => setDocModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('documents.descLabel')} *
                </label>
                <input
                  type="text"
                  required
                  value={docDesc}
                  onChange={(e) => setDocDesc(e.target.value)}
                  placeholder="e.g. Original ID card copy"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('documents.conditionLabel')}
                </label>
                <input
                  type="text"
                  value={docCondition}
                  onChange={(e) => setDocCondition(e.target.value)}
                  placeholder="e.g. Good condition"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('documents.receivedDate')}
                </label>
                <DatePicker value={docReceivedDate} onChange={setDocReceivedDate} useKhmerNumerals={useKh} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDocModalOpen(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 text-xs font-semibold"
              >
                {t('form.cancel')}
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-5 text-xs font-semibold"
              >
                {t('form.savePlan')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentModalOpen && selectedPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="installment-pay-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        >
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="installment-pay-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {t('paymentModal.title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('paymentModal.remainingHint', {
                    amount: fmt(selectedPlan.remainingBalance, selectedPlan.currency),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('paymentModal.amountLabel')} ({selectedPlan.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('paymentModal.dateLabel')}
                </label>
                <DatePicker value={payDate} onChange={setPayDate} useKhmerNumerals={useKh} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('paymentModal.methodLabel')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'khqr_aba', 'bank_transfer'] as InstallmentPaymentMethod[]).map(
                    (m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMethod(m)}
                        className={`min-h-[40px] rounded-xl border text-xs font-semibold px-2 ${
                          payMethod === m
                            ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                            : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {methodLabel(m)}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('paymentModal.notesLabel')}
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </div>
            </div>

            {payError && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">{payError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 text-xs font-semibold"
              >
                {t('form.cancel')}
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-5 text-xs font-semibold"
              >
                {t('paymentModal.submit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {receiptRecord && selectedPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="installment-receipt-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4 print:static print:bg-white print:backdrop-blur-none print:p-0 print:items-start print:justify-center"
        >
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 print:border-slate-300 print:rounded-none print:bg-white print:text-slate-900">
            <div className="text-center border-b border-dashed border-slate-200 dark:border-slate-700 pb-4 space-y-1">
              {businessProfile.logo && businessProfile.logo.startsWith('data:image/') && (
                <img
                  src={businessProfile.logo}
                  alt={businessProfile.name}
                  className="h-12 w-12 rounded-xl object-cover mx-auto mb-2"
                />
              )}
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {businessProfile.name || t('receipt.shopFallback')}
              </p>
              {(businessProfile.phone || businessProfile.address || businessProfile.province) && (
                <p className="text-[11px] text-slate-500">
                  {[businessProfile.phone, businessProfile.address, businessProfile.province]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <h2
                id="installment-receipt-title"
                className="text-xs font-semibold uppercase tracking-wider text-teal-600 pt-1"
              >
                {t('receipt.title')}
              </h2>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t('receipt.customer')}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {selectedPlan.customerName}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t('receipt.item')}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-right">
                  {selectedPlan.itemName}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t('receipt.paymentDate')}</span>
                <span className="font-mono">
                  {formatDateLocalized(receiptRecord.paymentDate, lang, useKh)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t('receipt.method')}</span>
                <span>{methodLabel(receiptRecord.method)}</span>
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {t('receipt.amountPaid')}
                </span>
                <span className="text-base font-mono font-bold text-emerald-600 tabular-nums">
                  {fmt(receiptRecord.amount, selectedPlan.currency)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t('receipt.remaining')}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {fmt(selectedPlan.remainingBalance, selectedPlan.currency)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 print:hidden">
              <button
                type="button"
                onClick={() => setReceiptRecord(null)}
                className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                {t('receipt.close')}
              </button>
              <button
                type="button"
                disabled={exportingPdf}
                onClick={() => void handleExportReceiptPdf()}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60"
              >
                <FileText className="w-4 h-4 text-teal-600" />
                <span>{t('receipt.exportPdf')}</span>
              </button>
              <button
                type="button"
                onClick={handleTriggerPrint}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                <Printer className="w-4 h-4" />
                <span>{t('receipt.print')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && selectedPlan && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm sm:p-4"
        >
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('detail.confirmDeleteTitle')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('detail.confirmDeleteBody')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 text-xs font-semibold"
              >
                {t('form.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteSelectedPlan}
                className="min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 text-xs font-semibold"
              >
                {t('detail.confirmDeleteAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
