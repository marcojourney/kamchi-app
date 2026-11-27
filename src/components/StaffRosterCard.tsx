import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { canUseStaffAccounts, isReadOnly } from '../lib/entitlements';
import { useLicenseContext } from './LicenseGate';

export const StaffRosterCard: React.FC = () => {
  const { t } = useTranslation();
  const { staff, addStaffMember, toggleStaffActive, deleteStaffMember } = useApp();
  const { licenseState, openUpgradePrompt } = useLicenseContext();

  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState<'owner' | 'collector'>('collector');

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseStaffAccounts(licenseState)) {
      openUpgradePrompt(isReadOnly(licenseState) ? 'read_only' : 'business_staff');
      return;
    }
    if (!staffName.trim()) return;
    await addStaffMember(staffName, staffPhone, staffRole);
    setStaffName('');
    setStaffPhone('');
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {t('settings.staffTitle')}
      </h2>
      <form onSubmit={handleAddStaff} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          type="text"
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          placeholder={t('settings.staffName')}
          className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
        />
        <input
          type="tel"
          value={staffPhone}
          onChange={(e) => setStaffPhone(e.target.value)}
          placeholder={t('settings.staffPhone')}
          className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs font-mono"
        />
        <select
          value={staffRole}
          onChange={(e) => setStaffRole(e.target.value as 'owner' | 'collector')}
          className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs"
        >
          <option value="collector">{t('settings.roleCollector')}</option>
          <option value="owner">{t('settings.roleOwner')}</option>
        </select>
        <button
          type="submit"
          className="min-h-[44px] flex items-center justify-center gap-1 rounded-xl bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{t('settings.addStaff')}</span>
        </button>
      </form>

      {staff.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
          {staff.map((m) => (
            <div key={m.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{m.name}</span>
                <span className="text-slate-500 ml-2">
                  {m.role} {m.phone ? `· ${m.phone}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleStaffActive(m.id, !m.active)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                    m.active
                      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'text-slate-400 bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  {m.active ? 'Active' : 'Paused'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteStaffMember(m.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
