import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { FileSpreadsheet, FileText, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebase';
import { formatCurrency, formatDateLocalized } from '../lib/finance';
import {
  buildCustomerScheduleInputFromPortal,
  exportLoanScheduleExcel,
  exportLoanSchedulePdf,
} from '../lib/pdfExport';
import type { PortalShare } from '../types/loan';

export const BorrowerPortalView: React.FC<{ shareId: string }> = ({ shareId }) => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<PortalShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const lang = i18n.language === 'km' ? 'km' : 'en';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'portalShares', shareId));
        if (!active) return;
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          setData({ ...(snap.data() as Omit<PortalShare, 'id'>), id: snap.id });
        }
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [shareId]);

  const toggleLanguage = () => {
    const next = lang === 'km' ? 'en' : 'km';
    i18n.changeLanguage(next);
    document.documentElement.lang = next;
  };

  const handleDownloadPdf = async () => {
    if (!data) return;
    await exportLoanSchedulePdf(buildCustomerScheduleInputFromPortal(data), lang);
  };

  const handleDownloadExcel = () => {
    if (!data) return;
    exportLoanScheduleExcel(buildCustomerScheduleInputFromPortal(data));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <header className="flex items-center justify-between">
          <img
            src="/assets/aistudio/image_01667597.png"
            alt={t('app.name')}
            className="h-12 sm:h-14 w-auto object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <button
            type="button"
            onClick={toggleLanguage}
            className="min-h-[40px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <Globe className="w-4 h-4 text-teal-600" />
            <span>{lang === 'km' ? 'English' : 'ភាសាខ្មែរ'}</span>
          </button>
        </header>

        {loading && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
            {t('app.loading')}
          </div>
        )}

        {!loading && (notFound || !data) && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-600 dark:text-slate-400">
            {t('portal.notFound')}
          </div>
        )}

        {!loading && data && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  {data.lenderLogoDataUrl &&
                    data.lenderLogoDataUrl.startsWith('data:image/') && (
                      <img
                        src={data.lenderLogoDataUrl}
                        alt={data.lenderName}
                        className="h-12 w-auto max-w-[100px] object-contain shrink-0 rounded-lg border border-slate-100 dark:border-slate-800 p-1 bg-white"
                      />
                    )}
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.title')}</p>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                      {data.borrowerFirstName}
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('portal.lender')}: <span className="font-semibold text-slate-700 dark:text-slate-200">{data.lenderName}</span>
                      {data.lenderPhone && (
                        <span className="font-mono ml-1.5 text-slate-600 dark:text-slate-300">
                          · {data.lenderPhone}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                  {t(`loans.status${data.status.charAt(0).toUpperCase() + data.status.slice(1)}`)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.principal')}</p>
                  <p className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                    {formatCurrency(data.principal, data.currency, lang)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.totalPayable')}</p>
                  <p className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                    {formatCurrency(data.totalPayable, data.currency, lang)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.remaining')}</p>
                  <p className="text-sm font-mono font-bold text-teal-600 tabular-nums mt-0.5">
                    {formatCurrency(data.outstandingBalance, data.currency, lang)}
                  </p>
                </div>
              </div>

              {data.interestType && (
                <div className="flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('loans.interestType')}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {data.interestType === 'reducing'
                      ? t('loans.reducing')
                      : data.interestType === 'interest_only'
                      ? t('loans.interestOnly')
                      : t('loans.flat')}
                    {typeof data.interestRate === 'number' && (
                      <span className="font-mono text-slate-500 dark:text-slate-400 ml-1">
                        ({data.interestRate}%)
                      </span>
                    )}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="min-h-[42px] flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>{t('portal.downloadPdf')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="min-h-[42px] flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>{t('portal.downloadExcel')}</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('portal.schedule')}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left whitespace-nowrap">#</th>
                      <th className="px-4 py-2.5 text-left whitespace-nowrap">{t('loans.dueDate')}</th>
                      {data.schedules.some(
                        (s) => typeof s.principalDue === 'number' && typeof s.interestDue === 'number'
                      ) && (
                        <>
                          <th className="px-4 py-2.5 text-right whitespace-nowrap">
                            {t('loans.principalCol')}
                          </th>
                          <th className="px-4 py-2.5 text-right whitespace-nowrap">
                            {t('loans.interestCol')}
                          </th>
                        </>
                      )}
                      <th className="px-4 py-2.5 text-right whitespace-nowrap">{t('loans.totalCol')}</th>
                      <th className="px-4 py-2.5 text-right whitespace-nowrap">{t('loans.statusCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.schedules.map((sch) => {
                      const hasSplit = data.schedules.some(
                        (s) => typeof s.principalDue === 'number' && typeof s.interestDue === 'number'
                      );
                      return (
                        <tr key={sch.installmentNumber}>
                          <td className="px-4 py-2.5 font-mono font-semibold text-slate-500">
                            #{sch.installmentNumber}
                          </td>
                          <td className="px-4 py-2.5 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {formatDateLocalized(sch.dueDate, lang)}
                          </td>
                          {hasSplit && (
                            <>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                {formatCurrency(sch.principalDue ?? 0, data.currency, lang)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                {formatCurrency(sch.interestDue ?? 0, data.currency, lang)}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {formatCurrency(sch.totalDue, data.currency, lang)}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <span
                              className={
                                sch.status === 'paid'
                                  ? 'font-semibold text-emerald-600'
                                  : sch.status === 'overdue'
                                  ? 'font-semibold text-red-600'
                                  : 'font-medium text-amber-600'
                              }
                            >
                              {sch.status === 'paid' ? t('portal.paid') : t('portal.unpaid')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
