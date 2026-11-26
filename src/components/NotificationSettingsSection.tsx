import React, { useRef, useState } from 'react';
import { Bell, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../context/NotificationContext';
import type { AppLanguage } from '../types/loan';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationTemplateKey,
} from '../types/notifications';

interface NotificationSettingsSectionProps {
  onToast: (msg: string) => void;
}

const TEMPLATE_VARIABLES = [
  '{borrowerName}',
  '{amount}',
  '{currency}',
  '{dueDate}',
  '{daysLate}',
  '{lenderName}',
];

export const NotificationSettingsSection: React.FC<
  NotificationSettingsSectionProps
> = ({ onToast }) => {
  const { t, i18n } = useTranslation('notifications');
  const { settings, updateNotificationSettings, resetTemplates } =
    useNotifications();
  const [templateLangTab, setTemplateLangTab] = useState<AppLanguage>(
    settings.defaultReminderLanguage || (i18n.language === 'km' ? 'km' : 'en')
  );
  const [focusedTemplateKey, setFocusedTemplateKey] =
    useState<NotificationTemplateKey>('upcoming');
  const textareaRefs = useRef<
    Partial<Record<NotificationTemplateKey, HTMLTextAreaElement | null>>
  >({});

  const isKm = i18n.language === 'km';
  const lineClass = isKm ? 'leading-[1.7]' : '';

  const categories: NotificationCategory[] = [
    'repayment',
    'lifecycle',
    'summary',
    'app',
    'suggestions',
  ];
  const leadDayOptions = [1, 3, 7];
  const channels: NotificationChannel[] = ['telegram', 'sms', 'whatsapp'];
  const templateKeys: NotificationTemplateKey[] = [
    'upcoming',
    'due_today',
    'overdue',
    'final_notice',
  ];

  const notifySaved = () => onToast(t('settings.savedToast'));

  const toggleCategory = async (cat: NotificationCategory) => {
    await updateNotificationSettings((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [cat]: !prev.categories[cat],
      },
    }));
    notifySaved();
  };

  const toggleLeadDay = async (day: number) => {
    await updateNotificationSettings((prev) => {
      const has = prev.leadDays.includes(day);
      const nextDays = has
        ? prev.leadDays.filter((d) => d !== day)
        : [...prev.leadDays, day].sort((a, b) => a - b);
      return { ...prev, leadDays: nextDays };
    });
    notifySaved();
  };

  const insertVariable = async (variable: string) => {
    const key = focusedTemplateKey;
    const el = textareaRefs.current[key];
    const current = settings.templates[templateLangTab][key] || '';
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const updated =
        current.slice(0, start) + variable + current.slice(end);
      await updateNotificationSettings((prev) => ({
        ...prev,
        templates: {
          ...prev.templates,
          [templateLangTab]: {
            ...prev.templates[templateLangTab],
            [key]: updated,
          },
        },
      }));
    } else {
      await updateNotificationSettings((prev) => ({
        ...prev,
        templates: {
          ...prev.templates,
          [templateLangTab]: {
            ...prev.templates[templateLangTab],
            [key]: `${current}${current ? ' ' : ''}${variable}`,
          },
        },
      }));
    }
  };

  return (
    <section
      id="notifications-settings"
      aria-labelledby="notif-settings-heading"
      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5"
    >
      <div className="flex items-start gap-2.5">
        <Bell className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
        <div>
          <h2
            id="notif-settings-heading"
            className={`text-sm font-semibold text-slate-900 dark:text-slate-100 ${lineClass}`}
          >
            {t('settings.sectionTitle')}
          </h2>
          <p
            className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${lineClass}`}
          >
            {t('settings.sectionDesc')}
          </p>
        </div>
      </div>

      {/* Category Toggles */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {t('settings.categoriesLabel')}
        </p>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5">
          {categories.map((cat) => (
            <label
              key={cat}
              className="min-h-[44px] py-2 flex items-center justify-between gap-3 cursor-pointer"
            >
              <span
                className={`text-xs font-medium text-slate-700 dark:text-slate-200 ${lineClass}`}
              >
                {t(`settings.categories.${cat}`)}
              </span>
              <input
                type="checkbox"
                checked={settings.categories[cat]}
                onChange={() => void toggleCategory(cat)}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 shrink-0"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Lead Times */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {t('settings.leadDaysLabel')}
        </p>
        <div className="flex flex-wrap gap-2">
          {leadDayOptions.map((day) => {
            const active = settings.leadDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() => void toggleLeadDay(day)}
                className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {t('settings.leadDaysOption', { days: day })}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timing & Grace Offset */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t('settings.dailySummaryTime')}
          </label>
          <input
            type="time"
            value={settings.dailySummaryTime}
            onChange={(e) => {
              const val = e.target.value || '08:00';
              void updateNotificationSettings({ dailySummaryTime: val });
            }}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            {t('settings.firstOverdueOffset')}
          </label>
          <input
            type="number"
            min={0}
            max={60}
            value={settings.firstOverdueDayOffset}
            onChange={(e) => {
              const n = Math.max(0, Math.min(60, Number(e.target.value) || 0));
              void updateNotificationSettings({ firstOverdueDayOffset: n });
            }}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
          />
          <p className={`text-[11px] text-slate-500 dark:text-slate-400 mt-1 ${lineClass}`}>
            {t('settings.firstOverdueOffsetHint')}
          </p>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
        <label className="flex items-start justify-between gap-3 cursor-pointer">
          <div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block">
              {t('settings.quietHoursLabel')}
            </span>
            <span className={`text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 ${lineClass}`}>
              {t('settings.quietHoursDesc')}
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.quietHours.enabled}
            onChange={(e) =>
              void updateNotificationSettings((prev) => ({
                ...prev,
                quietHours: { ...prev.quietHours, enabled: e.target.checked },
              }))
            }
            className="w-4 h-4 mt-0.5 rounded border-slate-300 text-teal-600 shrink-0"
          />
        </label>

        {settings.quietHours.enabled && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t('settings.quietStart')}
              </label>
              <input
                type="time"
                value={settings.quietHours.start}
                onChange={(e) =>
                  void updateNotificationSettings((prev) => ({
                    ...prev,
                    quietHours: {
                      ...prev.quietHours,
                      start: e.target.value || '21:00',
                    },
                  }))
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t('settings.quietEnd')}
              </label>
              <input
                type="time"
                value={settings.quietHours.end}
                onChange={(e) =>
                  void updateNotificationSettings((prev) => ({
                    ...prev,
                    quietHours: {
                      ...prev.quietHours,
                      end: e.target.value || '07:00',
                    },
                  }))
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
              />
            </div>
          </div>
        )}
      </div>

      {/* Default Reminder Language & Channel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            {t('settings.defaultReminderLang')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['en', 'km'] as AppLanguage[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  void updateNotificationSettings({
                    defaultReminderLanguage: l,
                  });
                  notifySaved();
                }}
                className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                  settings.defaultReminderLanguage === l
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {l === 'en' ? 'English' : 'ភាសាខ្មែរ'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            {t('settings.defaultChannel')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {channels.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => {
                  void updateNotificationSettings({ defaultChannel: ch });
                  notifySaved();
                }}
                className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                  settings.defaultChannel === ch
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {t(`settings.channels.${ch}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Privacy Mode */}
      <label className="min-h-[44px] flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2 cursor-pointer">
        <span
          className={`text-xs font-medium text-slate-700 dark:text-slate-200 ${lineClass}`}
        >
          {t('settings.privacyHideDetails')}
        </span>
        <input
          type="checkbox"
          checked={settings.privacyHideDetails}
          onChange={(e) => {
            void updateNotificationSettings({
              privacyHideDetails: e.target.checked,
            });
            notifySaved();
          }}
          className="w-4 h-4 rounded border-slate-300 text-teal-600 shrink-0"
        />
      </label>

      {/* Reminder Message Templates */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
            {t('settings.templatesTitle')}
          </h3>

          <button
            type="button"
            onClick={() => {
              void resetTemplates().then(notifySaved);
            }}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('settings.resetTemplates')}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['en', 'km'] as AppLanguage[]).map((langKey) => (
            <button
              key={langKey}
              type="button"
              onClick={() => setTemplateLangTab(langKey)}
              className={`min-h-[42px] rounded-xl border text-xs font-semibold transition-colors ${
                templateLangTab === langKey
                  ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {langKey === 'en'
                ? t('settings.templatesLangEn')
                : t('settings.templatesLangKm')}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            {t('settings.templateVariablesHint')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => void insertVariable(v)}
                className="min-h-[34px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50"
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {templateKeys.map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t(`settings.templateTypes.${key}`)}
              </label>
              <textarea
                ref={(el) => {
                  textareaRefs.current[key] = el;
                }}
                rows={3}
                value={settings.templates[templateLangTab][key]}
                onFocus={() => setFocusedTemplateKey(key)}
                onChange={(e) => {
                  const val = e.target.value;
                  void updateNotificationSettings((prev) => ({
                    ...prev,
                    templates: {
                      ...prev.templates,
                      [templateLangTab]: {
                        ...prev.templates[templateLangTab],
                        [key]: val,
                      },
                    },
                  }));
                }}
                className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-slate-100 ${
                  templateLangTab === 'km' ? 'leading-[1.7]' : 'leading-relaxed'
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
