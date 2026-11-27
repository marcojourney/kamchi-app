import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, IdCard, Phone, Search, User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Borrower } from '../types/loan';

interface BorrowerSelectDrawerProps {
  id?: string;
  borrowers: Borrower[];
  value: string;
  onChange: (borrowerId: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

function getSafePhotoUrl(url?: string): string {
  return url && url.startsWith('data:image/') ? url : '';
}

function normalizePhone(value: string): string {
  return value.replace(/[\s\-().+]/g, '').toLowerCase();
}

export const BorrowerSelectDrawer: React.FC<BorrowerSelectDrawerProps> = ({
  id,
  borrowers,
  value,
  onChange,
  disabled = false,
  ariaLabel,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedBorrower = useMemo(
    () => borrowers.find((b) => b.id === value) || null,
    [borrowers, value]
  );

  const filteredBorrowers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return borrowers;
    const qPhone = normalizePhone(q);

    return borrowers.filter((b) => {
      const nameMatch = b.name.toLowerCase().includes(q);
      const idMatch =
        b.id.toLowerCase().includes(q) ||
        (b.nationalIdNumber ? b.nationalIdNumber.toLowerCase().includes(q) : false);
      const phoneRawMatch = b.phone.toLowerCase().includes(q);
      const phoneNormalizedMatch =
        qPhone.length > 0 && normalizePhone(b.phone).includes(qPhone);
      return nameMatch || idMatch || phoneRawMatch || phoneNormalizedMatch;
    });
  }, [borrowers, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (borrowerId: string) => {
    onChange(borrowerId);
    setOpen(false);
  };

  const selectedPhoto = getSafePhotoUrl(selectedBorrower?.borrowerPhotoDataUrl);
  const selectedInitial =
    selectedBorrower?.name.trim().charAt(0).toUpperCase() || '';

  return (
    <>
      {/* Tailwind Select Dropdown Trigger */}
      <div
        className={`w-full min-h-[44px] rounded-xl border bg-white dark:bg-slate-950 flex items-center transition-colors ${
          disabled
            ? 'border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
            : open
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
        }`}
      >
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel || t('loans.selectBorrower')}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
          className="flex-1 min-w-0 min-h-[42px] px-3 py-1.5 flex items-center justify-between gap-2 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {selectedBorrower ? (
              <>
                <span className="h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700 bg-teal-50 dark:bg-teal-950/50 overflow-hidden flex items-center justify-center shrink-0">
                  {selectedPhoto ? (
                    <img
                      src={selectedPhoto}
                      alt={selectedBorrower.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                      {selectedInitial}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {selectedBorrower.name}
                  <span className="text-slate-400 dark:text-slate-500 font-normal">
                    {' · '}
                    {selectedBorrower.phone}
                  </span>
                </span>
              </>
            ) : (
              <span className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 truncate">
                <User className="w-4 h-4 shrink-0" />
                <span className="truncate">{t('loans.selectBorrowerPlaceholder')}</span>
              </span>
            )}
          </div>
          {!selectedBorrower || disabled ? (
            <ChevronDown
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                open ? 'rotate-180 text-teal-600' : ''
              }`}
            />
          ) : null}
        </button>

        {selectedBorrower && !disabled && (
          <div className="flex items-center pr-1.5 gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label={t('loans.clearBorrower')}
              title={t('loans.clearBorrower')}
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t('loans.drawerSelectBorrowerTitle')}
              className="min-h-[34px] min-w-[28px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                  open ? 'rotate-180 text-teal-600' : ''
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Right Slide-Over Search & Borrower Selection Drawer */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed inset-0 z-[70] transition-opacity duration-250 motion-reduce:transition-none ${
              open
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={!open}
          >
            <div
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            />

            <aside
              role="dialog"
              aria-modal="true"
              aria-label={t('loans.drawerSelectBorrowerTitle')}
              className={`fixed right-0 inset-y-0 z-10 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-250 ease-out motion-reduce:transition-none ${
                open ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              {/* Drawer Header */}
              <div className="px-4 sm:px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {t('loans.drawerSelectBorrowerTitle')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('loans.borrowerCount', { count: filteredBorrowers.length })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('app.close')}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Above Borrower List */}
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('loans.searchBorrowerPlaceholder')}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        searchInputRef.current?.focus();
                      }}
                      aria-label={t('loans.clearSearch')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Borrower Results List */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
                {filteredBorrowers.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-6 text-center space-y-3 mt-4">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {t('loans.noMatchingBorrowers')}
                    </p>
                    {query && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery('');
                          searchInputRef.current?.focus();
                        }}
                        className="min-h-[38px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {t('loans.clearSearch')}
                      </button>
                    )}
                  </div>
                ) : (
                  filteredBorrowers.map((b) => {
                    const isSelected = b.id === value;
                    const photo = getSafePhotoUrl(b.borrowerPhotoDataUrl);
                    const initial = b.name.trim().charAt(0).toUpperCase() || '?';

                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => handleSelect(b.id)}
                        className={`w-full min-h-[60px] rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-all ${
                          isSelected
                            ? 'border-teal-500 bg-teal-50/70 dark:bg-teal-950/40 ring-1 ring-teal-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 hover:border-teal-300 dark:hover:border-teal-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="h-10 w-10 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                            {photo ? (
                              <img
                                src={photo}
                                alt={b.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-sm font-bold text-teal-700 dark:text-teal-300">
                                {initial}
                              </span>
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {b.name}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span>{b.phone}</span>
                              </span>
                              {b.nationalIdNumber && (
                                <span className="inline-flex items-center gap-1 font-mono tabular-nums truncate">
                                  <IdCard className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{b.nationalIdNumber}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="h-6 w-6 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {selectedBorrower && !disabled && (
                <div className="px-4 sm:px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => handleSelect('')}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t('loans.clearBorrower')}
                  </button>
                </div>
              )}
            </aside>
          </div>,
          document.body
        )}
    </>
  );
};
