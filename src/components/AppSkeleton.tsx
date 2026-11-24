import React from 'react';
import { useTranslation } from 'react-i18next';

const CHART_BAR_PAIRS = [
  { due: '42%', collected: '36%' },
  { due: '58%', collected: '52%' },
  { due: '66%', collected: '60%' },
  { due: '74%', collected: '68%' },
  { due: '84%', collected: '78%' },
  { due: '90%', collected: '72%' },
];

export const AppSkeleton: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('app.loading')}
      className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row"
    >
      {/* Desktop Sidebar Skeleton */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 justify-between">
        <div className="space-y-6">
          <div className="px-1 pt-1">
            <img
              src="/assets/aistudio/image_01667597.png"
              alt={t('app.name')}
              className="h-14 w-auto object-contain dark:hidden"
              referrerPolicy="no-referrer"
            />
            <img
              src="/assets/aistudio/image_8f57a101.png"
              alt={t('app.name')}
              className="hidden dark:block h-14 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="space-y-1.5">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className={`min-h-[44px] flex items-center gap-3 px-3 rounded-xl ${
                  idx === 0 ? 'bg-teal-50/70 dark:bg-teal-950/40' : ''
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-md shrink-0 ${
                    idx === 0 ? 'skeleton-shimmer-teal' : 'skeleton-shimmer'
                  }`}
                />
                <div
                  className={`h-3.5 rounded-md ${
                    idx === 0 ? 'w-24 skeleton-shimmer-teal' : 'w-20 skeleton-shimmer'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="h-10 w-full rounded-xl skeleton-shimmer" />
          <div className="h-9 w-full rounded-xl skeleton-shimmer opacity-70" />
        </div>
      </aside>

      {/* Main Content Area Skeleton */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Sticky Top Header Skeleton */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="lg:hidden shrink-0">
              <img
                src="/assets/aistudio/image_01667597.png"
                alt={t('app.name')}
                className="h-11 sm:h-12 w-auto object-contain dark:hidden"
                referrerPolicy="no-referrer"
              />
              <img
                src="/assets/aistudio/image_8f57a101.png"
                alt={t('app.name')}
                className="hidden dark:block h-11 sm:h-12 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="hidden lg:block h-4 w-28 rounded-md skeleton-shimmer" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="lg:hidden h-9 w-16 rounded-lg skeleton-shimmer" />
            <div className="h-10 w-10 rounded-full skeleton-shimmer" />
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-28 lg:pb-8 space-y-6">
          {/* Page Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="h-6 sm:h-7 w-44 rounded-lg skeleton-shimmer" />
              <div className="h-3.5 w-52 rounded-md skeleton-shimmer opacity-80" />
            </div>

            <div className="flex items-center gap-2">
              <div className="h-10 w-24 rounded-xl skeleton-shimmer" />
              <div className="hidden sm:block h-11 w-32 rounded-xl skeleton-shimmer" />
              <div className="h-11 w-28 rounded-xl skeleton-shimmer-teal" />
            </div>
          </div>

          {/* 4-Card Primary KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((cardIdx) => (
              <div
                key={cardIdx}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5"
              >
                <div className="h-3 w-24 rounded-md skeleton-shimmer" />
                <div
                  className={`h-6 w-32 max-w-full rounded-lg ${
                    cardIdx === 1 ? 'skeleton-shimmer-teal' : 'skeleton-shimmer'
                  }`}
                />
                <div className="h-3 w-28 max-w-full rounded-md skeleton-shimmer opacity-75" />
              </div>
            ))}
          </div>

          {/* Charts & Aging Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-4 w-44 rounded-md skeleton-shimmer" />
                <div className="flex items-center gap-3">
                  <div className="h-3 w-12 rounded-md skeleton-shimmer" />
                  <div className="h-3 w-14 rounded-md skeleton-shimmer-teal" />
                </div>
              </div>
              <div className="h-56 w-full flex items-end justify-between gap-2 sm:gap-4 pt-4 px-2 border-b border-slate-100 dark:border-slate-800">
                {CHART_BAR_PAIRS.map((pair, idx) => (
                  <div key={idx} className="flex-1 h-full flex flex-col justify-end items-center gap-2">
                    <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 flex-1">
                      <div
                        style={{ height: pair.due }}
                        className="w-3 sm:w-5 rounded-t-md skeleton-shimmer"
                      />
                      <div
                        style={{ height: pair.collected }}
                        className="w-3 sm:w-5 rounded-t-md skeleton-shimmer-teal"
                      />
                    </div>
                    <div className="h-2.5 w-7 rounded-sm skeleton-shimmer mb-2" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 rounded-md skeleton-shimmer" />
                <div className="h-3.5 w-20 rounded-md skeleton-shimmer-teal" />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="py-3 flex items-center justify-between gap-2">
                    <div className="h-3.5 w-20 rounded-md skeleton-shimmer" />
                    <div className="h-4 w-24 rounded-md skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Due Today & Overdue List Skeleton */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="h-4 w-44 rounded-md skeleton-shimmer" />
              <div className="h-3.5 w-6 rounded-md skeleton-shimmer" />
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-36 rounded-md skeleton-shimmer" />
                    <div className="h-3 w-48 max-w-full rounded-md skeleton-shimmer opacity-80" />
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="h-4 w-20 rounded-md skeleton-shimmer" />
                    <div className="h-10 w-24 rounded-xl skeleton-shimmer-teal" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Mobile Floating Bottom Tab Bar Skeleton */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-md rounded-2xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/70 shadow-[0_8px_30px_rgba(15,23,42,0.10)] dark:shadow-[0_10px_34px_rgba(0,0,0,0.45)] p-1.5 grid grid-cols-5 gap-1">
            {[0, 1, 2, 3, 4].map((tabIdx) => (
              <div
                key={tabIdx}
                className={`flex flex-col items-center justify-center min-h-[50px] px-1 py-1.5 rounded-xl ${
                  tabIdx === 0 ? 'bg-teal-50/70 dark:bg-teal-950/40' : ''
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md ${
                    tabIdx === 0 ? 'skeleton-shimmer-teal' : 'skeleton-shimmer'
                  }`}
                />
                <div
                  className={`mt-1.5 h-2.5 w-10 rounded-sm ${
                    tabIdx === 0 ? 'skeleton-shimmer-teal' : 'skeleton-shimmer'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
