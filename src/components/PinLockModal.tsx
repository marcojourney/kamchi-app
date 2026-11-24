import React, { useState } from 'react';
import { Delete, Fingerprint, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';

export const PinLockModal: React.FC = () => {
  const { t } = useTranslation();
  const { profile, unlockWithPin, unlockWithBiometric, signOut } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleDigit = async (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      const ok = await unlockWithPin(next);
      if (!ok) {
        setError(true);
        setTimeout(() => setPin(''), 350);
      }
    }
  };

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1));
    setError(false);
  };

  const handleBiometric = async () => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      unlockWithBiometric();
    } else {
      unlockWithBiometric();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('auth.pinLockTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.email}</p>
        </div>

        <div className="flex justify-center gap-3 py-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                pin.length > i
                  ? 'bg-teal-600 border-teal-600'
                  : 'bg-transparent border-slate-300 dark:border-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-center text-red-600 dark:text-red-400 font-medium">
            {t('auth.pinWrong')}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="min-h-[52px] rounded-xl bg-slate-100 dark:bg-slate-800 text-lg font-mono font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97] transition-all"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={profile?.biometricEnabled ? handleBiometric : undefined}
            disabled={!profile?.biometricEnabled}
            className="min-h-[52px] rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-teal-600 disabled:opacity-25 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t('auth.biometricUnlock')}
          >
            <Fingerprint className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="min-h-[52px] rounded-xl bg-slate-100 dark:bg-slate-800 text-lg font-mono font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.97] transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="min-h-[52px] rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Backspace"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="w-full min-h-[40px] text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          {t('auth.useDifferentAccount')}
        </button>
      </div>
    </div>
  );
};
