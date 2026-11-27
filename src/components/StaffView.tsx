import React from 'react';
import { useTranslation } from 'react-i18next';
import { StaffRosterCard } from './StaffRosterCard';

export const StaffView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
        {t('settings.staffTitle')}
      </h1>
      <StaffRosterCard />
    </div>
  );
};
