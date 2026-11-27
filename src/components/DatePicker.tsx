import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateLocalized, toKhmerDigits } from '../lib/finance';
import { DEFAULT_TIMEZONE, getLocalIsoDate } from '../lib/notificationDates';
import type { AppLanguage } from '../types/loan';

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const KM_MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
];

const EN_WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const KM_WEEKDAYS = ['អា', 'ច', 'អ', 'ព', 'ព្រ', 'សុ', 'ស'];

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  useKhmerNumerals?: boolean;
  className?: string;
  minHeightClass?: string;
  ariaLabel?: string;
}

function parseSafeDate(isoDate: string): Date | null {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const parsed = parseISO(isoDate);
  return isValid(parsed) ? parsed : null;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  id,
  value,
  onChange,
  placeholder,
  allowClear = false,
  disabled = false,
  useKhmerNumerals = false,
  className = '',
  minHeightClass = 'min-h-[44px]',
  ariaLabel,
}) => {
  const { t, i18n } = useTranslation();
  const lang: AppLanguage = i18n.language === 'km' ? 'km' : 'en';

  const todayIso = useMemo(() => getLocalIsoDate(new Date(), DEFAULT_TIMEZONE), []);
  const todayDate = useMemo(() => parseSafeDate(todayIso) || new Date(), [todayIso]);
  const selectedDate = useMemo(() => parseSafeDate(value), [value]);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfMonth(selectedDate || todayDate)
  );

  useEffect(() => {
    if (open) {
      setViewMonth(startOfMonth(selectedDate || todayDate));
    }
  }, [open, selectedDate, todayDate]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const monthNames = lang === 'km' ? KM_MONTHS : EN_MONTHS;
  const weekdayNames = lang === 'km' ? KM_WEEKDAYS : EN_WEEKDAYS;

  const formatNum = (num: number | string) => {
    const s = String(num);
    return useKhmerNumerals ? toKhmerDigits(s) : s;
  };

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [viewMonth]);

  const yearOptions = useMemo(() => {
    const currentYear = todayDate.getFullYear();
    const minYear = Math.min(currentYear - 10, viewMonth.getFullYear() - 5);
    const maxYear = Math.max(currentYear + 10, viewMonth.getFullYear() + 5);
    const list: number[] = [];
    for (let y = minYear; y <= maxYear; y += 1) {
      list.push(y);
    }
    return list;
  }, [todayDate, viewMonth]);

  const displayLabel = selectedDate
    ? formatDateLocalized(value, lang, useKhmerNumerals)
    : placeholder || t('datePicker.selectDate');

  const handleSelectDay = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  };

  const handleSelectToday = () => {
    onChange(todayIso);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setOpen(false);
  };

  return (
    <>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(true)}
        className={`w-full ${minHeightClass} flex items-center justify-between gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-left text-xs transition-colors hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed ${
          selectedDate
            ? 'font-mono text-slate-900 dark:text-slate-100'
            : 'text-slate-400 dark:text-slate-500'
        } ${className}`}
      >
        <span className="truncate">{displayLabel}</span>
        <CalendarIcon className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || t('datePicker.selectDate')}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            />

            <div className="relative z-10 w-full sm:max-w-[344px] rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
              {/* Header: Month/Year Controls + Close */}
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => setViewMonth((prev) => subMonths(prev, 1))}
                  aria-label={t('datePicker.prevMonth')}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
                  <select
                    aria-label={t('datePicker.month')}
                    value={viewMonth.getMonth()}
                    onChange={(e) =>
                      setViewMonth((prev) => setMonth(prev, Number(e.target.value)))
                    }
                    className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  >
                    {monthNames.map((label, idx) => (
                      <option key={idx} value={idx}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label={t('datePicker.year')}
                    value={viewMonth.getFullYear()}
                    onChange={(e) =>
                      setViewMonth((prev) => setYear(prev, Number(e.target.value)))
                    }
                    className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {formatNum(y)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
                  aria-label={t('datePicker.nextMonth')}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('app.close')}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {weekdayNames.map((wd) => (
                  <div
                    key={wd}
                    className="py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500"
                  >
                    {wd}
                  </div>
                ))}
              </div>

              {/* Day Grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const inCurrentMonth = isSameMonth(day, viewMonth);
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                  const isToday = isSameDay(day, todayDate);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => handleSelectDay(day)}
                      className={`min-h-[40px] rounded-xl text-xs font-mono tabular-nums flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                        isSelected
                          ? 'bg-teal-600 text-white font-bold shadow-xs'
                          : isToday
                          ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/50 font-semibold hover:bg-teal-100 dark:hover:bg-teal-900/50'
                          : inCurrentMonth
                          ? 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                          : 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {formatNum(day.getDate())}
                    </button>
                  );
                })}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleSelectToday}
                  className="min-h-[38px] px-3 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
                >
                  {t('datePicker.today')}
                </button>

                <div className="flex items-center gap-1.5">
                  {allowClear && value && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {t('datePicker.clear')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t('app.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
