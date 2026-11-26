# KamChi Offline Notification System

## Overview
KamChi uses a 100% offline, local-first notification engine built on top of loan, schedule, and payment records stored in IndexedDB. No backend, push server, or Firebase call is used.

## Refresh Lifecycle
- Runs automatically on app launch, whenever the app returns to the foreground (`visibilitychange` and `window.focus`), whenever loan/payment/settings data changes, and on a 15-minute background timer while the app is open.
- Works identically in every license state, including `read_only` mode.
- Does not generate backup or license notifications.

## Architecture & Modules
- `src/types/notifications.ts`: Notification records, categories (`repayment`, `lifecycle`, `summary`, `app`, `suggestions`), priorities (`high`, `medium`, `low`, `info`), and user settings types.
- `src/lib/notificationDates.ts`: DST-free calendar-day math (`Asia/Phnom_Penh` default timezone), quiet-hours evaluation, and Cambodian fixed + lunar holiday lookup.
- `src/lib/notificationRules.ts`: Pure deterministic `generateNotifications(...)` and `reconcileNotifications(...)` engine, `latestSeenTime` >24h clock-rollback protection, and `computeDailySummaryMetrics(...)`.
- `src/workers/notificationRules.worker.ts` & `src/lib/notificationRunner.ts`: Offloads rule evaluation and diffing onto a Web Worker so portfolios with 1,000+ loans never block UI rendering.
- `src/lib/notificationStore.ts`: IndexedDB persistence (`kamchi_notifications_db`) storing `notifications`, `notificationSettings`, and daily summary dismissal date (with `localStorage` fallback).
- `src/lib/notificationTemplates.ts`: Editable English and Khmer templates (`upcoming`, `due_today`, `overdue`, `final_notice`) with variables `{borrowerName}`, `{amount}`, `{currency}`, `{dueDate}`, `{daysLate}`, and `{lenderName}`, plus Telegram, SMS, and WhatsApp URL builders.
- `src/context/NotificationContext.tsx`: React state container handling reconciliation, clustering, snoozing, 10-second `payment_recorded` Undo toasts, and ARIA live announcements.
