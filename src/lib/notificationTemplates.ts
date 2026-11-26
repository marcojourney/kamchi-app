import { formatCurrency, formatDateLocalized } from './finance';
import type { AppLanguage, CurrencyCode } from '../types/loan';
import type {
  NotificationChannel,
  NotificationSettings,
  NotificationTemplateKey,
} from '../types/notifications';

export const DEFAULT_REMINDER_TEMPLATES: NotificationSettings['templates'] = {
  en: {
    upcoming:
      'Hello {borrowerName}, this is a polite reminder from {lenderName} that your payment of {amount} {currency} is coming up on {dueDate}. Thank you.',
    due_today:
      'Hello {borrowerName}, a gentle reminder from {lenderName} that your payment of {amount} {currency} is due today ({dueDate}). Please let us know once paid.',
    overdue:
      'Hello {borrowerName}, your payment of {amount} {currency} due on {dueDate} is now {daysLate} day(s) past due. Please reach out to {lenderName} to arrange payment. Thank you.',
    final_notice:
      'Hello {borrowerName}, your payment of {amount} {currency} (due {dueDate}) is {daysLate} days overdue. Please contact {lenderName} today so we can settle or restructure this politely.',
  },
  km: {
    upcoming:
      'សួស្តី {borrowerName} នេះជាការរំលឹកដោយគួរសមពី {lenderName} ថា ការបង់ប្រាក់ចំនួន {amount} {currency} នឹងដល់កំណត់នៅថ្ងៃទី {dueDate}។ សូមអរគុណ!',
    due_today:
      'សួស្តី {borrowerName} សូមរំលឹកពី {lenderName} ថា ការបង់ប្រាក់ចំនួន {amount} {currency} ដល់កំណត់ថ្ងៃនេះ ({dueDate})។ សូមជូនដំណឹងពេលបង់រួច។ សូមអរគុណ!',
    overdue:
      'សួស្តី {borrowerName} ការបង់ប្រាក់ចំនួន {amount} {currency} កាលពីថ្ងៃទី {dueDate} បានយឺត {daysLate} ថ្ងៃហើយ។ សូមទាក់ទងមក {lenderName} ដើម្បីរៀបចំការបង់ប្រាក់។ សូមអរគុណ!',
    final_notice:
      'សួស្តី {borrowerName} ការបង់ប្រាក់ចំនួន {amount} {currency} (កាលបរិច្ឆេទ {dueDate}) បានយឺត {daysLate} ថ្ងៃហើយ។ សូមទាក់ទង {lenderName} ថ្ងៃនេះដើម្បីដោះស្រាយដោយសន្តិវិធី។',
  },
};

export function createDefaultNotificationSettings(
  preferredLang: AppLanguage = 'en'
): NotificationSettings {
  return {
    categories: {
      repayment: true,
      lifecycle: true,
      summary: true,
      app: true,
      suggestions: true,
    },
    leadDays: [1, 3, 7],
    quietHours: {
      enabled: false,
      start: '21:00',
      end: '07:00',
    },
    dailySummaryTime: '08:00',
    firstOverdueDayOffset: 0,
    defaultReminderLanguage: preferredLang,
    defaultChannel: 'telegram',
    privacyHideDetails: false,
    templates: {
      en: { ...DEFAULT_REMINDER_TEMPLATES.en },
      km: { ...DEFAULT_REMINDER_TEMPLATES.km },
    },
  };
}

export function selectTemplateKeyForItem(daysLate?: number): NotificationTemplateKey {
  if (daysLate === undefined || daysLate < 0) return 'upcoming';
  if (daysLate === 0) return 'due_today';
  if (daysLate >= 30) return 'final_notice';
  return 'overdue';
}

export function formatNotificationMoney(
  amount: number,
  currency: CurrencyCode,
  lang: AppLanguage,
  useKhmerNumerals = false
): string {
  return formatCurrency(amount, currency, lang, useKhmerNumerals);
}

export function renderReminderTemplate(
  template: string,
  variables: {
    borrowerName: string;
    amount: string;
    currency: CurrencyCode;
    dueDate: string;
    daysLate: number;
    lenderName: string;
  }
): string {
  return template
    .replace(/\{borrowerName\}/g, variables.borrowerName)
    .replace(/\{amount\}/g, variables.amount)
    .replace(/\{currency\}/g, variables.currency)
    .replace(/\{dueDate\}/g, variables.dueDate)
    .replace(/\{daysLate\}/g, String(Math.max(0, variables.daysLate)))
    .replace(/\{lenderName\}/g, variables.lenderName);
}

export function buildPrefilledReminderMessage(params: {
  settings: NotificationSettings;
  lang: AppLanguage;
  borrowerName: string;
  amountValue: number;
  currency: CurrencyCode;
  dueDateIso: string;
  daysLate: number;
  lenderName: string;
  useKhmerNumerals?: boolean;
}): string {
  const {
    settings,
    lang,
    borrowerName,
    amountValue,
    currency,
    dueDateIso,
    daysLate,
    lenderName,
    useKhmerNumerals = false,
  } = params;

  const key = selectTemplateKeyForItem(daysLate);
  const template =
    settings.templates[lang]?.[key] || DEFAULT_REMINDER_TEMPLATES[lang][key];

  const formattedAmount = formatNotificationMoney(
    amountValue,
    currency,
    lang,
    useKhmerNumerals
  );
  const formattedDate = formatDateLocalized(dueDateIso, lang, useKhmerNumerals);

  return renderReminderTemplate(template, {
    borrowerName,
    amount: formattedAmount,
    currency,
    dueDate: formattedDate,
    daysLate: Math.max(0, daysLate),
    lenderName,
  });
}

export function normalizeCambodiaPhoneForDial(rawPhone: string): string {
  const trimmed = (rawPhone || '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('855')) return `+${digits}`;
  if (digits.startsWith('0')) return `+855${digits.slice(1)}`;
  return digits;
}

export function buildChannelLaunchUrl(
  channel: NotificationChannel,
  phone: string,
  message: string
): string {
  const cleanDigits = normalizeCambodiaPhoneForDial(phone).replace(/^\+/, '');
  const encodedMsg = encodeURIComponent(message);

  if (channel === 'whatsapp') {
    return cleanDigits
      ? `https://wa.me/${cleanDigits}?text=${encodedMsg}`
      : `https://wa.me/?text=${encodedMsg}`;
  }
  if (channel === 'sms') {
    const dial = normalizeCambodiaPhoneForDial(phone);
    return dial ? `sms:${dial}?body=${encodedMsg}` : `sms:?body=${encodedMsg}`;
  }
  // Telegram share / direct chat URL
  return `https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodedMsg}`;
}
