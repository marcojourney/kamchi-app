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
      className="relative h-11 w-11 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <Bell className="w-6 h-6" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className={`absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-bold tabular-nums text-white flex items-center justify-center shadow-xs ${
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
