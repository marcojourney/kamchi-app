import React from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../context/NotificationContext';

export const NotificationBell: React.FC = () => {
  const { t } = useTranslation('notifications');
  const { unreadCount, openCenter, visibleNotifications } = useNotifications();

  const hasUrgentUnread = visibleNotifications.some(
    (n) => !n.readAt && n.priority === 'high'
  );

  return (
    <button
      type="button"
      onClick={() => openCenter()}
      aria-label={
        unreadCount > 0
          ? `${t('bell.openCenter')} — ${t('bell.unreadCount', { count: unreadCount })}`
          : t('bell.openCenter')
      }
      className="relative h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-mono font-bold tabular-nums text-white flex items-center justify-center shadow-xs ${
            hasUrgentUnread
              ? 'bg-red-600'
              : 'bg-teal-600'
          }`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
