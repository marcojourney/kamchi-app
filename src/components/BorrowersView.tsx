import React, { useMemo, useState } from 'react';
import { Camera, ChevronRight, Plus, Search, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { canCreateBorrower } from '../lib/entitlements';
import { compressImageToDataUrl, formatCurrency, formatDateLocalized } from '../lib/finance';
import type { AppLanguage, Borrower } from '../types/loan';
import { CameraCaptureModal } from './CameraCaptureModal';
import { useLicenseContext } from './LicenseGate';

interface BorrowersViewProps {
  externalOpenAdd?: boolean;
  onCloseExternalAdd?: () => void;
  onNewLoanForBorrower: (borrowerId: string) => void;
  onOpenLoanDetail: (loanId: string) => void;
}

export const BorrowersView: React.FC<BorrowersViewProps> = ({
  externalOpenAdd,
  onCloseExternalAdd,
  onNewLoanForBorrower,
  onOpenLoanDetail,
}) => {
  const { t, i18n } = useTranslation();
  const { t: tNotif } = useTranslation('notifications');
  const {
    borrowers,
    loans,
    payments,
    profile,
    createBorrower,
    updateBorrower,
    deleteBorrower,
  } = useApp();
  const { licenseState, openUpgradePrompt } = useLicenseContext();

  const lang = i18n.language === 'km' ? 'km' : 'en';
  const useKh = Boolean(profile?.useKhmerNumerals);

  const [search, setSearch] = useState('');
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [editingBorrower, setEditingBorrower] = useState<Borrower | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isFormOpen = showForm || Boolean(externalOpenAdd);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [idPhotoDataUrl, setIdPhotoDataUrl] = useState('');
  const [borrowerPhotoDataUrl, setBorrowerPhotoDataUrl] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorPhotoDataUrl, setGuarantorPhotoDataUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredLang, setPreferredLang] = useState<AppLanguage | ''>('');
  const [tagsText, setTagsText] = useState('');
  const [busy, setBusy] = useState(false);

  const [cameraTarget, setCameraTarget] = useState<'id' | 'borrower' | 'guarantor' | null>(null);
  const [zoomPhoto, setZoomPhoto] = useState<{ src: string; label: string } | null>(null);

  const openAdd = () => {
    if (!canCreateBorrower(licenseState)) {
      openUpgradePrompt('read_only');
      return;
    }
    setEditingBorrower(null);
    setName('');
    setPhone('');
    setAddress('');
    setNationalIdNumber('');
    setIdPhotoDataUrl('');
    setBorrowerPhotoDataUrl('');
    setGuarantorName('');
    setGuarantorPhone('');
    setGuarantorPhotoDataUrl('');
    setNotes('');
    setPreferredLang('');
    setTagsText('');
    setShowForm(true);
  };

  const openEdit = (b: Borrower) => {
    setEditingBorrower(b);
    setName(b.name);
    setPhone(b.phone);
    setAddress(b.address || '');
    setNationalIdNumber(b.nationalIdNumber || '');
    setIdPhotoDataUrl(b.idPhotoDataUrl || '');
    setBorrowerPhotoDataUrl(b.borrowerPhotoDataUrl || '');
    setGuarantorName(b.guarantorName || '');
    setGuarantorPhone(b.guarantorPhone || '');
    setGuarantorPhotoDataUrl(b.guarantorPhotoDataUrl || '');
    setNotes(b.notes || '');
    setPreferredLang(b.preferredLang || '');
    setTagsText((b.tags || []).join(', '));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBorrower(null);
    setCameraTarget(null);
    onCloseExternalAdd?.();
  };

  const handlePhotoUpload =
    (target: 'id' | 'borrower' | 'guarantor') => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const maxDim = target === 'id' ? 800 : 640;
      const compressed = await compressImageToDataUrl(file, maxDim, 0.72);
      if (target === 'id') setIdPhotoDataUrl(compressed);
      else if (target === 'borrower') setBorrowerPhotoDataUrl(compressed);
      else setGuarantorPhotoDataUrl(compressed);
      e.target.value = '';
    };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setBusy(true);
    const tags = tagsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      if (editingBorrower) {
        await updateBorrower(editingBorrower.id, {
          name,
          phone,
          address,
          nationalIdNumber,
          idPhotoDataUrl,
          borrowerPhotoDataUrl,
          guarantorName,
          guarantorPhone,
          guarantorPhotoDataUrl,
          notes,
          preferredLang: preferredLang || undefined,
          tags,
        });
      } else {
        await createBorrower({
          name,
          phone,
          address,
          nationalIdNumber,
          idPhotoDataUrl,
          borrowerPhotoDataUrl,
          guarantorName,
          guarantorPhone,
          guarantorPhotoDataUrl,
          notes,
          preferredLang: preferredLang || undefined,
          tags,
        });
      }
      closeForm();
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return borrowers;
    return borrowers.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q) ||
        (b.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  }, [borrowers, search]);

  const borrowerLoans = useMemo(() => {
    if (!selectedBorrower) return [];
    return loans.filter((l) => l.borrowerId === selectedBorrower.id);
  }, [selectedBorrower, loans]);

  const borrowerPayments = useMemo(() => {
    if (!selectedBorrower) return [];
    return payments.filter((p) => p.borrowerId === selectedBorrower.id);
  }, [selectedBorrower, payments]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('borrowers.title')}
        </h1>
        <button
          type="button"
          onClick={openAdd}
          className="min-h-[44px] flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>{t('borrowers.addTitle')}</span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('borrowers.searchPlaceholder')}
          className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('borrowers.emptyTitle')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {t('borrowers.emptyDesc')}
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            <Plus className="w-4 h-4" />
            <span>{t('borrowers.createFirst')}</span>
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {filtered.map((b) => {
            const activeCount = loans.filter((l) => l.borrowerId === b.id && l.status === 'active').length;
            const score = b.riskScore ?? 85;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBorrower(b)}
                className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {b.borrowerPhotoDataUrl || b.idPhotoDataUrl ? (
                    <img
                      src={b.borrowerPhotoDataUrl || b.idPhotoDataUrl}
                      alt={b.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200 shrink-0">
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {b.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      <span className="font-mono">{b.phone}</span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {activeCount} {t('borrowers.activeLoans')}
                      </span>
                      {b.tags && b.tags.length > 0 && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{b.tags.join(', ')}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">{t('borrowers.riskScore')}</span>
                    <span
                      className={`text-xs font-mono font-bold tabular-nums ${
                        score >= 75
                          ? 'text-emerald-600'
                          : score >= 50
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {score}/100
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Borrower Detail Drawer */}
      {selectedBorrower && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {selectedBorrower.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {selectedBorrower.phone}
                  {selectedBorrower.nationalIdNumber ? ` · ID: ${selectedBorrower.nationalIdNumber}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBorrower(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(selectedBorrower.borrowerPhotoDataUrl ||
              selectedBorrower.idPhotoDataUrl ||
              selectedBorrower.guarantorPhotoDataUrl) && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                  {t('borrowers.referencePhotos')}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {selectedBorrower.borrowerPhotoDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setZoomPhoto({
                          src: selectedBorrower.borrowerPhotoDataUrl!,
                          label: t('borrowers.borrowerPhoto'),
                        })
                      }
                      className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 text-left"
                    >
                      <img
                        src={selectedBorrower.borrowerPhotoDataUrl}
                        alt={t('borrowers.borrowerPhoto')}
                        referrerPolicy="no-referrer"
                        className="w-full h-28 object-cover group-hover:scale-[1.03] transition-transform"
                      />
                      <span className="block px-2 py-1 text-[11px] font-medium bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 truncate">
                        {t('borrowers.borrowerPhoto')}
                      </span>
                    </button>
                  )}
                  {selectedBorrower.idPhotoDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setZoomPhoto({
                          src: selectedBorrower.idPhotoDataUrl!,
                          label: t('borrowers.idPhoto'),
                        })
                      }
                      className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 text-left"
                    >
                      <img
                        src={selectedBorrower.idPhotoDataUrl}
                        alt={t('borrowers.idPhoto')}
                        referrerPolicy="no-referrer"
                        className="w-full h-28 object-cover group-hover:scale-[1.03] transition-transform"
                      />
                      <span className="block px-2 py-1 text-[11px] font-medium bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 truncate">
                        {t('borrowers.idPhoto')}
                      </span>
                    </button>
                  )}
                  {selectedBorrower.guarantorPhotoDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setZoomPhoto({
                          src: selectedBorrower.guarantorPhotoDataUrl!,
                          label: t('borrowers.guarantorPhoto'),
                        })
                      }
                      className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 text-left"
                    >
                      <img
                        src={selectedBorrower.guarantorPhotoDataUrl}
                        alt={t('borrowers.guarantorPhoto')}
                        referrerPolicy="no-referrer"
                        className="w-full h-28 object-cover group-hover:scale-[1.03] transition-transform"
                      />
                      <span className="block px-2 py-1 text-[11px] font-medium bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 truncate">
                        {t('borrowers.guarantorPhoto')}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs border-y border-slate-100 dark:border-slate-800 py-3">
              <div>
                <span className="text-slate-400 block">{t('borrowers.address')}</span>
                <span className="text-slate-800 dark:text-slate-200">{selectedBorrower.address || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{t('borrowers.guarantorName')}</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {selectedBorrower.guarantorName
                    ? `${selectedBorrower.guarantorName} (${selectedBorrower.guarantorPhone || ''})`
                    : '—'}
                </span>
              </div>
              {selectedBorrower.notes && (
                <div className="col-span-2">
                  <span className="text-slate-400 block">{t('borrowers.notes')}</span>
                  <span className="text-slate-800 dark:text-slate-200">{selectedBorrower.notes}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const bId = selectedBorrower.id;
                  setSelectedBorrower(null);
                  onNewLoanForBorrower(bId);
                }}
                className="min-h-[40px] rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                {t('borrowers.newLoanForBorrower')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedBorrower;
                  setSelectedBorrower(null);
                  openEdit(target);
                }}
                className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                {t('app.edit')}
              </button>
              {borrowerLoans.length === 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteBorrower(selectedBorrower.id);
                    setSelectedBorrower(null);
                  }}
                  className="min-h-[40px] flex items-center gap-1 rounded-xl border border-red-200 dark:border-red-900/50 px-3.5 py-2 text-xs font-semibold text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('app.delete')}</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('borrowers.loanHistory')} ({borrowerLoans.length})
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {borrowerLoans.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setSelectedBorrower(null);
                      onOpenLoanDetail(l.id);
                    }}
                    className="w-full px-3 py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span className="font-mono">
                      {formatCurrency(l.principal, l.currency, lang, useKh)} · {formatDateLocalized(l.startDate, lang, useKh)}
                    </span>
                    <span className="font-semibold text-teal-600">{l.status}</span>
                  </button>
                ))}
                {borrowerLoans.length === 0 && (
                  <p className="p-3 text-xs text-slate-400">—</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('borrowers.paymentHistory')} ({borrowerPayments.length})
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {borrowerPayments.slice(0, 10).map((p) => (
                  <div key={p.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500">
                      {formatDateLocalized(p.paymentDate, lang, useKh)} · {p.method}
                    </span>
                    <span className="font-mono font-semibold text-emerald-600 tabular-nums">
                      {formatCurrency(p.amount, p.currency, lang, useKh)}
                    </span>
                  </div>
                ))}
                {borrowerPayments.length === 0 && (
                  <p className="p-3 text-xs text-slate-400">—</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Borrower Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingBorrower ? t('borrowers.editTitle') : t('borrowers.addTitle')}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.name')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.phone')}
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="012 345 678"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.address')}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.nationalId')}
                </label>
                <input
                  type="text"
                  value={nationalIdNumber}
                  onChange={(e) => setNationalIdNumber(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Borrower Reference Photo & ID Document Photo */}
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t('borrowers.borrowerPhoto')}
                    </span>
                    {borrowerPhotoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setBorrowerPhotoDataUrl('')}
                        className="text-[11px] font-semibold text-red-600 hover:underline"
                      >
                        {t('borrowers.removePhoto')}
                      </button>
                    )}
                  </div>
                  {borrowerPhotoDataUrl && (
                    <img
                      src={borrowerPhotoDataUrl}
                      alt={t('borrowers.borrowerPhoto')}
                      referrerPolicy="no-referrer"
                      className="w-full h-28 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraTarget('borrower')}
                      className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-2.5 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{t('borrowers.takePhoto')}</span>
                    </button>
                    <label className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t('borrowers.uploadFile')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoUpload('borrower')}
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t('borrowers.idPhoto')}
                    </span>
                    {idPhotoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setIdPhotoDataUrl('')}
                        className="text-[11px] font-semibold text-red-600 hover:underline"
                      >
                        {t('borrowers.removePhoto')}
                      </button>
                    )}
                  </div>
                  {idPhotoDataUrl && (
                    <img
                      src={idPhotoDataUrl}
                      alt={t('borrowers.idPhoto')}
                      referrerPolicy="no-referrer"
                      className="w-full h-28 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraTarget('id')}
                      className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-2.5 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{t('borrowers.takePhoto')}</span>
                    </button>
                    <label className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t('borrowers.uploadFile')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoUpload('id')}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.guarantorName')}
                </label>
                <input
                  type="text"
                  value={guarantorName}
                  onChange={(e) => setGuarantorName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.guarantorPhone')}
                </label>
                <input
                  type="tel"
                  value={guarantorPhone}
                  onChange={(e) => setGuarantorPhone(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Guarantor Reference Photo */}
              <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('borrowers.guarantorPhoto')}
                  </span>
                  {guarantorPhotoDataUrl && (
                    <button
                      type="button"
                      onClick={() => setGuarantorPhotoDataUrl('')}
                      className="text-[11px] font-semibold text-red-600 hover:underline"
                    >
                      {t('borrowers.removePhoto')}
                    </button>
                  )}
                </div>
                {guarantorPhotoDataUrl && (
                  <img
                    src={guarantorPhotoDataUrl}
                    alt={t('borrowers.guarantorPhoto')}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-36 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCameraTarget('guarantor')}
                    className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{t('borrowers.takePhoto')}</span>
                  </button>
                  <label className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t('borrowers.uploadFile')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload('guarantor')}
                    />
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.tags')}
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="VIP, Market Vendor, Weekly"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tNotif('borrowerLang.label')}
                </label>
                <select
                  value={preferredLang}
                  onChange={(e) =>
                    setPreferredLang(e.target.value as AppLanguage | '')
                  }
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="">{tNotif('borrowerLang.useDefault')}</option>
                  <option value="km">{tNotif('borrowerLang.km')}</option>
                  <option value="en">{tNotif('borrowerLang.en')}</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('borrowers.notes')}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                {t('app.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] rounded-xl bg-teal-600 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {t('app.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Camera Capture Modal */}
      {cameraTarget && (
        <CameraCaptureModal
          title={
            cameraTarget === 'borrower'
              ? t('borrowers.borrowerPhoto')
              : cameraTarget === 'guarantor'
              ? t('borrowers.guarantorPhoto')
              : t('borrowers.idPhoto')
          }
          onCapture={(dataUrl) => {
            if (cameraTarget === 'borrower') setBorrowerPhotoDataUrl(dataUrl);
            else if (cameraTarget === 'guarantor') setGuarantorPhotoDataUrl(dataUrl);
            else setIdPhotoDataUrl(dataUrl);
            setCameraTarget(null);
          }}
          onClose={() => setCameraTarget(null)}
        />
      )}

      {/* Fullscreen Photo Preview Modal */}
      {zoomPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setZoomPhoto(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {zoomPhoto.label}
              </h3>
              <button
                type="button"
                onClick={() => setZoomPhoto(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={zoomPhoto.src}
              alt={zoomPhoto.label}
              referrerPolicy="no-referrer"
              className="w-full max-h-[70vh] object-contain rounded-xl bg-slate-950"
            />
          </div>
        </div>
      )}
    </div>
  );
};
