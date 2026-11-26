import type { AppLanguage, CurrencyCode } from './loan';

export type NotificationPriority = 'high' | 'medium' | 'low' | 'info';

export type NotificationCategory =
  | 'repayment'
  | 'lifecycle'
  | 'summary'
  | 'app'
  | 'suggestions';

export type NotificationType =
  | 'due_soon'
  | 'overdue'
  | 'missed_installments'
  | 'promise_broken'
  | 'partial_payment'
  | 'payment_recorded'
  | 'loan_fully_paid'
  | 'loan_maturing'
  | 'interest_only_ending'
  | 'penalty_started'
  | 'daily_summary'
  | 'weekly_summary'
  | 'terms_updated'
  | 'app_update_available'
  | 'repeated_late'
  | 'holiday_tomorrow'
  | 'exchange_rate_stale';

export type NotificationChannel = 'telegram' | 'sms' | 'whatsapp';

export type NotificationTemplateKey =
  | 'upcoming'
  | 'due_today'
  | 'overdue'
  | 'final_notice';

export type NotificationFilter = 'all' | 'unread' | 'overdue' | 'due_soon';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  loanId?: string;
  borrowerId?: string;
  installmentId?: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number | boolean>;
  createdAt: string; // ISO timestamp
  eventDate?: string; // YYYY-MM-DD in local timezone for Today / This week / Earlier grouping
  groupKey?: string; // Enables grouping similar rows e.g. "due_soon:0"
  actionType?: 'record_payment' | 'release_collateral' | 'open_terms' | 'reload_app' | 'open_settings' | 'undo_payment';
  currency?: CurrencyCode;
  amountValue?: number;
  daysLate?: number;
  dueDate?: string;
  paymentId?: string;
  readAt?: string;
  snoozedUntil?: string; // ISO timestamp
  dismissedAt?: string;
  actionTaken?: string;
}

export type NotificationCandidate = Omit<
  NotificationRecord,
  'createdAt' | 'readAt' | 'snoozedUntil' | 'dismissedAt' | 'actionTaken'
> & {
  createdAt?: string;
};

export interface NotificationSettings {
  categories: Record<NotificationCategory, boolean>;
  leadDays: number[]; // e.g. [1, 3, 7]
  quietHours: {
    enabled: boolean;
    start: string; // "HH:mm"
    end: string; // "HH:mm"
  };
  dailySummaryTime: string; // "HH:mm"
  firstOverdueDayOffset: number; // >= 0, combined with loan.gracePeriodDays
  defaultReminderLanguage: AppLanguage;
  defaultChannel: NotificationChannel;
  privacyHideDetails: boolean;
  templates: {
    en: Record<NotificationTemplateKey, string>;
    km: Record<NotificationTemplateKey, string>;
  };
}
