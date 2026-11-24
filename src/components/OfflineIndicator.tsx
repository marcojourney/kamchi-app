import React from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { isLocalMode } = useApp();
  const { t } = useTranslation();

  if (isOnline) return null;

  return (
    <div className="bg-amber-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>{isLocalMode ? t('app.offlineLocalBanner') : t('app.offlineBanner')}</span>
    </div>
  );
};
