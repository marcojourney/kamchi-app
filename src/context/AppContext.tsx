import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  allocatePaymentAcrossSchedules,
  computeBorrowerRiskScore,
  generateRepaymentSchedule,
  generateSafeId,
  hashPinSha256,
  roundMoney,
} from '../lib/finance';
import {
  createDefaultLocalWorkspace,
  encodePortalData,
  loadLocalWorkspace,
  LOCAL_UID,
  saveLocalWorkspace,
  type LocalWorkspaceData,
} from '../lib/localStore';
import type {
  AppLanguage,
  AuditLog,
  Borrower,
  CurrencyCode,
  InterestType,
  LateFeeType,
  Loan,
  LoanSchedule,
  Payment,
  PaymentMethod,
  RepaymentFrequency,
  StaffMember,
  UserProfile,
} from '../types/loan';

export interface CreateBorrowerInput {
  name: string;
  phone: string;
  address?: string;
  nationalIdNumber?: string;
  idPhotoDataUrl?: string;
  borrowerPhotoDataUrl?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorPhotoDataUrl?: string;
  notes?: string;
  tags?: string[];
}

export interface CreateLoanInput {
  borrowerId: string;
  currency: CurrencyCode;
  principal: number;
  interestRate: number;
  interestType: InterestType;
  termCount: number;
  frequency: RepaymentFrequency;
  customIntervalDays?: number;
  startDate: string;
  adminFee?: number;
  lateFeeType?: LateFeeType;
  lateFeeValue?: number;
  gracePeriodDays?: number;
  collateralText?: string;
  collateralPhotoUrl?: string;
  signatureDataUrl?: string;
  parentLoanId?: string;
}

export interface RecordPaymentInput {
  loanId: string;
  amount: number;
  method: PaymentMethod;
  paymentDate: string;
  referenceNo?: string;
  notes?: string;
  collectedBy?: string;
  gpsLat?: number;
  gpsLng?: number;
}

interface AppContextValue {
  user: User | null;
  isLocalMode: boolean;
  authReady: boolean;
  profile: UserProfile | null;
  isPinLocked: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometric: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  borrowers: Borrower[];
  loans: Loan[];
  schedulesByLoan: Record<string, LoanSchedule[]>;
  payments: Payment[];
  staff: StaffMember[];
  auditLogs: AuditLog[];
  todayIso: string;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateSettings: (updates: Partial<UserProfile>) => Promise<void>;
  setPinCode: (pin: string | null) => Promise<void>;
  createBorrower: (input: CreateBorrowerInput) => Promise<string>;
  updateBorrower: (id: string, input: Partial<CreateBorrowerInput>) => Promise<void>;
  deleteBorrower: (id: string) => Promise<void>;
  createLoan: (input: CreateLoanInput) => Promise<string>;
  recordPayment: (input: RecordPaymentInput) => Promise<Payment>;
  earlySettleLoan: (loanId: string, method: PaymentMethod, paymentDate: string) => Promise<Payment>;
  writeOffLoan: (loanId: string) => Promise<void>;
  renewOrRestructureLoan: (
    oldLoanId: string,
    mode: 'renew' | 'topup' | 'restructure',
    newLoanInput: CreateLoanInput
  ) => Promise<string>;
  createOrGetPortalShare: (loanId: string) => Promise<string>;
  addStaffMember: (name: string, phone: string, role: 'owner' | 'collector') => Promise<void>;
  toggleStaffActive: (staffId: string, active: boolean) => Promise<void>;
  deleteStaffMember: (staffId: string) => Promise<void>;
  ensureSchedulesLoaded: (loanId: string) => Promise<void>;
  exportAllDataJson: () => string;
  importAllDataJson: (jsonText: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function cleanTags(tags?: string[]): string[] {
  if (!tags) return [];
  return tags
    .map((t) => t.trim().slice(0, 32))
    .filter(Boolean)
    .slice(0, 10);
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinVerifiedSession, setPinVerifiedSession] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rielledger_theme') === 'dark' ? 'dark' : 'light';
    }
    return 'light';
  });

  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [schedulesByLoan, setSchedulesByLoan] = useState<Record<string, LoanSchedule[]>>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const localWorkspaceRef = React.useRef<LocalWorkspaceData>(createDefaultLocalWorkspace());
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('rielledger_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    const lang: AppLanguage = profile?.preferredLang || (i18n.language.startsWith('km') ? 'km' : 'en');
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
    document.documentElement.lang = lang;
  }, [profile?.preferredLang, i18n]);

  const applyLocalWorkspaceState = useCallback(
    (ws: LocalWorkspaceData, verifiedPin: boolean) => {
      localWorkspaceRef.current = ws;
      setProfile(ws.profile);
      setBorrowers([...ws.borrowers].sort((a, b) => a.name.localeCompare(b.name)));
      setLoans([...ws.loans].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')));
      setSchedulesByLoan(ws.schedulesByLoan);
      setPayments([...ws.payments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));
      setStaff([...ws.staff].sort((a, b) => a.name.localeCompare(b.name)));
      setAuditLogs(ws.auditLogs.slice(0, 100));
      setIsPinLocked(Boolean(ws.profile.pinHash && !verifiedPin));
    },
    []
  );

  const commitLocal = useCallback(
    async (updater: (prev: LocalWorkspaceData) => LocalWorkspaceData, markPendingSync = true) => {
      const updated = updater(localWorkspaceRef.current);
      const next: LocalWorkspaceData = {
        ...updated,
        hasPendingSync: markPendingSync ? true : updated.hasPendingSync,
      };
      localWorkspaceRef.current = next;
      setProfile(next.profile);
      setBorrowers([...next.borrowers].sort((a, b) => a.name.localeCompare(b.name)));
      setLoans([...next.loans].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')));
      setSchedulesByLoan(next.schedulesByLoan);
      setPayments([...next.payments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')));
      setStaff([...next.staff].sort((a, b) => a.name.localeCompare(b.name)));
      setAuditLogs(next.auditLogs.slice(0, 100));
      await saveLocalWorkspace(next);
    },
    []
  );

  // Auth listener (supports unauthenticated Local/Offline Mode seamlessly)
  useEffect(() => {
    let resolved = false;
    const offlineFallbackTimer = window.setTimeout(() => {
      if (!resolved && typeof navigator !== 'undefined' && !navigator.onLine) {
        setAuthReady(true);
      }
    }, 1500);

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      resolved = true;
      window.clearTimeout(offlineFallbackTimer);
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setPinVerifiedSession(false);
        setLocalLoaded(false);
      }
    });
    return () => {
      window.clearTimeout(offlineFallbackTimer);
      unsub();
    };
  }, []);

  // Load Local/Offline workspace whenever user is not signed in with Google
  useEffect(() => {
    if (!authReady || user) return;
    let active = true;
    const fallbackLang: AppLanguage = i18n.language.startsWith('km') ? 'km' : 'en';
    loadLocalWorkspace(fallbackLang).then((ws) => {
      if (!active) return;
      applyLocalWorkspaceState(ws, pinVerifiedSession);
      setLocalLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [authReady, user, applyLocalWorkspaceState, pinVerifiedSession, i18n.language]);

  // Migrate pending local offline records to Firestore when user signs in with Google
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const localWs = await loadLocalWorkspace();
        if (cancelled) return;
        const hasData =
          localWs.hasPendingSync &&
          (localWs.borrowers.length > 0 ||
            localWs.loans.length > 0 ||
            localWs.payments.length > 0 ||
            localWs.staff.length > 0);
        if (!hasData) return;

        const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
        for (const b of localWs.borrowers) {
          ops.push((batch) =>
            batch.set(
              doc(db, 'borrowers', b.id),
              {
                ...b,
                ownerId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            )
          );
        }
        for (const l of localWs.loans) {
          ops.push((batch) =>
            batch.set(
              doc(db, 'loans', l.id),
              {
                ...l,
                ownerId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            )
          );
          for (const s of localWs.schedulesByLoan[l.id] || []) {
            ops.push((batch) =>
              batch.set(
                doc(db, 'loans', l.id, 'schedules', s.id),
                {
                  ...s,
                  ownerId: user.uid,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              )
            );
          }
        }
        for (const p of localWs.payments) {
          ops.push((batch) =>
            batch.set(
              doc(db, 'payments', p.id),
              {
                ...p,
                ownerId: user.uid,
                createdAt: serverTimestamp(),
              },
              { merge: true }
            )
          );
        }
        for (const st of localWs.staff) {
          ops.push((batch) =>
            batch.set(
              doc(db, 'staff', st.id),
              {
                ...st,
                ownerId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            )
          );
        }

        for (let i = 0; i < ops.length; i += 400) {
          const batch = writeBatch(db);
          for (const fn of ops.slice(i, i + 400)) {
            fn(batch);
          }
          await batch.commit();
        }

        await saveLocalWorkspace({ ...localWs, hasPendingSync: false });
      } catch (err) {
        console.warn('Local-to-cloud sync skipped:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  // Ensure user profile exists & listen to user profile when signed in with Google
  useEffect(() => {
    if (!authReady || !user) return;
    const userRef = doc(db, 'users', user.uid);
    const detectedLang: AppLanguage = navigator.language.toLowerCase().startsWith('km') ? 'km' : 'en';

    const unsub = onSnapshot(
      userRef,
      async (snap) => {
        if (!snap.exists()) {
          const localProfile = localWorkspaceRef.current.profile;
          const newProfile: Record<string, unknown> = {
            uid: user.uid,
            email: (user.email || 'owner@example.com').slice(0, 200),
            displayName: (
              (localProfile.displayName && localProfile.displayName !== 'KamChi Lender'
                ? localProfile.displayName
                : user.displayName) ||
              user.email?.split('@')[0] ||
              'Lender'
            ).slice(0, 120),
            preferredLang: localProfile.preferredLang || detectedLang,
            defaultCurrency: localProfile.defaultCurrency || ('USD' as CurrencyCode),
            exchangeRateKhr: localProfile.exchangeRateKhr || 4100,
            capitalCashUsd: localProfile.capitalCashUsd || 0,
            capitalCashKhr: localProfile.capitalCashKhr || 0,
            useKhmerNumerals: Boolean(localProfile.useKhmerNumerals),
            biometricEnabled: Boolean(localProfile.biometricEnabled),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (localProfile.lenderPhone) {
            newProfile.lenderPhone = localProfile.lenderPhone.slice(0, 40);
          }
          if (localProfile.lenderLogoDataUrl) {
            newProfile.lenderLogoDataUrl = localProfile.lenderLogoDataUrl.slice(0, 200000);
          }
          try {
            await setDoc(userRef, newProfile);
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
          }
          return;
        }
        const data = snap.data() as UserProfile;
        setProfile(data);
        if (data.pinHash && !pinVerifiedSession) {
          setIsPinLocked(true);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`)
    );

    return unsub;
  }, [authReady, user, pinVerifiedSession]);

  // Attach collection listeners
  useEffect(() => {
    if (!authReady || !user) return;

    const qBorrowers = query(collection(db, 'borrowers'), where('ownerId', '==', user.uid));
    const unsubBorrowers = onSnapshot(
      qBorrowers,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Borrower, 'id'>), id: d.id }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setBorrowers(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'borrowers')
    );

    const qLoans = query(collection(db, 'loans'), where('ownerId', '==', user.uid));
    const unsubLoans = onSnapshot(
      qLoans,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Loan, 'id'>), id: d.id }));
        list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
        setLoans(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'loans')
    );

    const qPayments = query(collection(db, 'payments'), where('ownerId', '==', user.uid));
    const unsubPayments = onSnapshot(
      qPayments,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Payment, 'id'>), id: d.id }));
        list.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
        setPayments(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'payments')
    );

    const qStaff = query(collection(db, 'staff'), where('ownerId', '==', user.uid));
    const unsubStaff = onSnapshot(
      qStaff,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<StaffMember, 'id'>), id: d.id }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setStaff(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'staff')
    );

    const qLogs = query(collection(db, 'auditLogs'), where('ownerId', '==', user.uid));
    const unsubLogs = onSnapshot(
      qLogs,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<AuditLog, 'id'>), id: d.id }));
        list.sort((a, b) => {
          const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setAuditLogs(list.slice(0, 100));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs')
    );

    return () => {
      unsubBorrowers();
      unsubLoans();
      unsubPayments();
      unsubStaff();
      unsubLogs();
    };
  }, [authReady, user]);

  // Listen to schedules for all active and written-off loans
  const activeLoanIdsKey = useMemo(
    () =>
      loans
        .filter((l) => l.status === 'active' || l.status === 'written_off')
        .map((l) => l.id)
        .sort()
        .join(','),
    [loans]
  );

  useEffect(() => {
    if (!authReady || !user || !activeLoanIdsKey) return;
    const ids = activeLoanIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((loanId) => {
      const qSch = query(
        collection(db, 'loans', loanId, 'schedules'),
        where('ownerId', '==', user.uid)
      );
      return onSnapshot(
        qSch,
        (snap) => {
          const list = snap.docs.map((d) => ({ ...(d.data() as Omit<LoanSchedule, 'id'>), id: d.id }));
          list.sort((a, b) => a.installmentNumber - b.installmentNumber);
          setSchedulesByLoan((prev) => ({ ...prev, [loanId]: list }));
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `loans/${loanId}/schedules`)
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [authReady, user, activeLoanIdsKey]);

  const ensureSchedulesLoaded = useCallback(
    async (loanId: string) => {
      if (schedulesByLoan[loanId]) return;
      if (!user) return;
      const path = `loans/${loanId}/schedules`;
      try {
        const snap = await getDocs(
          query(collection(db, 'loans', loanId, 'schedules'), where('ownerId', '==', user.uid))
        );
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<LoanSchedule, 'id'>), id: d.id }));
        list.sort((a, b) => a.installmentNumber - b.installmentNumber);
        setSchedulesByLoan((prev) => ({ ...prev, [loanId]: list }));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    },
    [user, schedulesByLoan]
  );

  const writeAuditLog = useCallback(
    async (
      action: string,
      entityType: AuditLog['entityType'],
      entityId: string,
      summary: string
    ) => {
      const logId = generateSafeId('log');
      const actorName = (
        profile?.displayName ||
        user?.displayName ||
        user?.email ||
        'Lender'
      ).slice(0, 120);

      if (!user) {
        const entry: AuditLog = {
          id: logId,
          ownerId: LOCAL_UID,
          actorUid: LOCAL_UID,
          actorName,
          action: action.slice(0, 60),
          entityType,
          entityId: entityId.slice(0, 128),
          summary: summary.slice(0, 300),
          createdAt: new Date().toISOString(),
        };
        await commitLocal((prev) => ({
          ...prev,
          auditLogs: [entry, ...prev.auditLogs].slice(0, 100),
        }));
        return;
      }

      const path = `auditLogs/${logId}`;
      try {
        await setDoc(doc(db, 'auditLogs', logId), {
          ownerId: user.uid,
          actorUid: user.uid,
          actorName,
          action: action.slice(0, 60),
          entityType,
          entityId: entityId.slice(0, 128),
          summary: summary.slice(0, 300),
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [user, profile?.displayName, commitLocal]
  );

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    if (!user) return;
    await firebaseSignOut(auth);
  }, [user]);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      if (!profile?.pinHash) return false;
      const ownerId = user?.uid || LOCAL_UID;
      const h = await hashPinSha256(pin, ownerId);
      if (h === profile.pinHash) {
        setPinVerifiedSession(true);
        setIsPinLocked(false);
        return true;
      }
      return false;
    },
    [user, profile?.pinHash]
  );

  const unlockWithBiometric = useCallback(() => {
    setPinVerifiedSession(true);
    setIsPinLocked(false);
  }, []);

  const updateSettings = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!profile) return;
      const nextDisplayName = (updates.displayName ?? profile.displayName ?? '')
        .trim()
        .slice(0, 120);

      if (!user) {
        await commitLocal((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            displayName: nextDisplayName || prev.profile.displayName || 'KamChi Lender',
            preferredLang: updates.preferredLang ?? prev.profile.preferredLang,
            defaultCurrency: updates.defaultCurrency ?? prev.profile.defaultCurrency,
            exchangeRateKhr: Number(updates.exchangeRateKhr ?? prev.profile.exchangeRateKhr) || 4100,
            capitalCashUsd: Number(updates.capitalCashUsd ?? prev.profile.capitalCashUsd ?? 0),
            capitalCashKhr: Number(updates.capitalCashKhr ?? prev.profile.capitalCashKhr ?? 0),
            useKhmerNumerals: Boolean(updates.useKhmerNumerals ?? prev.profile.useKhmerNumerals ?? false),
            biometricEnabled: Boolean(updates.biometricEnabled ?? prev.profile.biometricEnabled ?? false),
            lenderPhone:
              updates.lenderPhone !== undefined
                ? updates.lenderPhone.trim().slice(0, 40)
                : prev.profile.lenderPhone,
            lenderLogoDataUrl:
              updates.lenderLogoDataUrl !== undefined
                ? updates.lenderLogoDataUrl.slice(0, 200000)
                : prev.profile.lenderLogoDataUrl,
            pinHash: updates.pinHash !== undefined ? updates.pinHash : prev.profile.pinHash,
            updatedAt: new Date().toISOString(),
          },
        }));
        await writeAuditLog('update_settings', 'settings', LOCAL_UID, 'Updated workspace settings');
        return;
      }

      const path = `users/${user.uid}`;
      const payload: Record<string, unknown> = {
        displayName: nextDisplayName || profile.displayName || 'KamChi Lender',
        preferredLang: updates.preferredLang ?? profile.preferredLang,
        defaultCurrency: updates.defaultCurrency ?? profile.defaultCurrency,
        exchangeRateKhr: Number(updates.exchangeRateKhr ?? profile.exchangeRateKhr) || 4100,
        capitalCashUsd: Number(updates.capitalCashUsd ?? profile.capitalCashUsd ?? 0),
        capitalCashKhr: Number(updates.capitalCashKhr ?? profile.capitalCashKhr ?? 0),
        useKhmerNumerals: Boolean(updates.useKhmerNumerals ?? profile.useKhmerNumerals ?? false),
        biometricEnabled: Boolean(updates.biometricEnabled ?? profile.biometricEnabled ?? false),
        updatedAt: serverTimestamp(),
      };
      if (updates.lenderPhone !== undefined) {
        payload.lenderPhone = updates.lenderPhone.trim().slice(0, 40);
      } else if (profile.lenderPhone !== undefined) {
        payload.lenderPhone = profile.lenderPhone;
      }
      if (updates.lenderLogoDataUrl !== undefined) {
        payload.lenderLogoDataUrl = updates.lenderLogoDataUrl.slice(0, 200000);
      } else if (profile.lenderLogoDataUrl !== undefined) {
        payload.lenderLogoDataUrl = profile.lenderLogoDataUrl;
      }
      if (updates.pinHash !== undefined) {
        payload.pinHash = updates.pinHash;
      }
      try {
        await updateDoc(doc(db, 'users', user.uid), payload);
        await writeAuditLog('update_settings', 'settings', user.uid, 'Updated workspace settings');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user, profile, writeAuditLog, commitLocal]
  );

  const setPinCode = useCallback(
    async (pin: string | null) => {
      if (!user) {
        const hash = pin ? await hashPinSha256(pin, LOCAL_UID) : '';
        await commitLocal((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            pinHash: hash,
            updatedAt: new Date().toISOString(),
          },
        }));
        if (pin) setPinVerifiedSession(true);
        return;
      }

      const path = `users/${user.uid}`;
      try {
        if (!pin) {
          await updateDoc(doc(db, 'users', user.uid), {
            pinHash: '',
            updatedAt: serverTimestamp(),
          });
        } else {
          const hash = await hashPinSha256(pin, user.uid);
          await updateDoc(doc(db, 'users', user.uid), {
            pinHash: hash,
            updatedAt: serverTimestamp(),
          });
          setPinVerifiedSession(true);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user, commitLocal]
  );

  const createBorrower = useCallback(
    async (input: CreateBorrowerInput) => {
      const id = generateSafeId('brw');
      const nowIso = new Date().toISOString();

      if (!user) {
        const newBorrower: Borrower = {
          id,
          ownerId: LOCAL_UID,
          name: input.name.trim().slice(0, 120),
          phone: input.phone.trim().slice(0, 40),
          tags: cleanTags(input.tags),
          riskScore: 85,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        if (input.address?.trim()) newBorrower.address = input.address.trim().slice(0, 300);
        if (input.nationalIdNumber?.trim()) {
          newBorrower.nationalIdNumber = input.nationalIdNumber.trim().slice(0, 60);
        }
        if (input.idPhotoDataUrl) newBorrower.idPhotoDataUrl = input.idPhotoDataUrl.slice(0, 250000);
        if (input.borrowerPhotoDataUrl) {
          newBorrower.borrowerPhotoDataUrl = input.borrowerPhotoDataUrl.slice(0, 200000);
        }
        if (input.guarantorName?.trim()) {
          newBorrower.guarantorName = input.guarantorName.trim().slice(0, 120);
        }
        if (input.guarantorPhone?.trim()) {
          newBorrower.guarantorPhone = input.guarantorPhone.trim().slice(0, 40);
        }
        if (input.guarantorPhotoDataUrl) {
          newBorrower.guarantorPhotoDataUrl = input.guarantorPhotoDataUrl.slice(0, 200000);
        }
        if (input.notes?.trim()) newBorrower.notes = input.notes.trim().slice(0, 1000);

        await commitLocal((prev) => ({
          ...prev,
          borrowers: [...prev.borrowers, newBorrower],
        }));
        await writeAuditLog('create_borrower', 'borrower', id, `Added borrower ${newBorrower.name}`);
        return id;
      }

      const path = `borrowers/${id}`;
      const payload: Record<string, unknown> = {
        ownerId: user.uid,
        name: input.name.trim().slice(0, 120),
        phone: input.phone.trim().slice(0, 40),
        tags: cleanTags(input.tags),
        riskScore: 85,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (input.address?.trim()) payload.address = input.address.trim().slice(0, 300);
      if (input.nationalIdNumber?.trim()) payload.nationalIdNumber = input.nationalIdNumber.trim().slice(0, 60);
      if (input.idPhotoDataUrl) payload.idPhotoDataUrl = input.idPhotoDataUrl.slice(0, 250000);
      if (input.borrowerPhotoDataUrl) payload.borrowerPhotoDataUrl = input.borrowerPhotoDataUrl.slice(0, 200000);
      if (input.guarantorName?.trim()) payload.guarantorName = input.guarantorName.trim().slice(0, 120);
      if (input.guarantorPhone?.trim()) payload.guarantorPhone = input.guarantorPhone.trim().slice(0, 40);
      if (input.guarantorPhotoDataUrl) payload.guarantorPhotoDataUrl = input.guarantorPhotoDataUrl.slice(0, 200000);
      if (input.notes?.trim()) payload.notes = input.notes.trim().slice(0, 1000);

      try {
        await setDoc(doc(db, 'borrowers', id), payload);
        await writeAuditLog('create_borrower', 'borrower', id, `Added borrower ${input.name.trim()}`);
        return id;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [user, writeAuditLog, commitLocal]
  );

  const updateBorrower = useCallback(
    async (id: string, input: Partial<CreateBorrowerInput>) => {
      const existing = borrowers.find((b) => b.id === id);
      if (!existing) return;

      if (!user) {
        const updatedBorrower: Borrower = {
          ...existing,
          name: (input.name ?? existing.name).trim().slice(0, 120),
          phone: (input.phone ?? existing.phone).trim().slice(0, 40),
          tags: cleanTags(input.tags ?? existing.tags),
          address: (input.address !== undefined ? input.address : existing.address)?.trim().slice(0, 300) || undefined,
          nationalIdNumber:
            (input.nationalIdNumber !== undefined
              ? input.nationalIdNumber
              : existing.nationalIdNumber
            )?.trim().slice(0, 60) || undefined,
          idPhotoDataUrl:
            input.idPhotoDataUrl !== undefined
              ? input.idPhotoDataUrl.slice(0, 250000)
              : existing.idPhotoDataUrl,
          borrowerPhotoDataUrl:
            input.borrowerPhotoDataUrl !== undefined
              ? input.borrowerPhotoDataUrl.slice(0, 200000)
              : existing.borrowerPhotoDataUrl,
          guarantorName:
            (input.guarantorName !== undefined
              ? input.guarantorName
              : existing.guarantorName
            )?.trim().slice(0, 120) || undefined,
          guarantorPhone:
            (input.guarantorPhone !== undefined
              ? input.guarantorPhone
              : existing.guarantorPhone
            )?.trim().slice(0, 40) || undefined,
          guarantorPhotoDataUrl:
            input.guarantorPhotoDataUrl !== undefined
              ? input.guarantorPhotoDataUrl.slice(0, 200000)
              : existing.guarantorPhotoDataUrl,
          notes: (input.notes !== undefined ? input.notes : existing.notes)?.trim().slice(0, 1000) || undefined,
          updatedAt: new Date().toISOString(),
        };
        await commitLocal((prev) => ({
          ...prev,
          borrowers: prev.borrowers.map((b) => (b.id === id ? updatedBorrower : b)),
        }));
        await writeAuditLog('update_borrower', 'borrower', id, `Updated borrower ${updatedBorrower.name}`);
        return;
      }

      const path = `borrowers/${id}`;
      const payload: Record<string, unknown> = {
        name: (input.name ?? existing.name).trim().slice(0, 120),
        phone: (input.phone ?? existing.phone).trim().slice(0, 40),
        tags: cleanTags(input.tags ?? existing.tags),
        updatedAt: serverTimestamp(),
      };
      const addr = input.address !== undefined ? input.address : existing.address;
      if (addr?.trim()) payload.address = addr.trim().slice(0, 300);
      const nid = input.nationalIdNumber !== undefined ? input.nationalIdNumber : existing.nationalIdNumber;
      if (nid?.trim()) payload.nationalIdNumber = nid.trim().slice(0, 60);
      const photo = input.idPhotoDataUrl !== undefined ? input.idPhotoDataUrl : existing.idPhotoDataUrl;
      if (photo !== undefined) payload.idPhotoDataUrl = photo.slice(0, 250000);
      const bPhoto =
        input.borrowerPhotoDataUrl !== undefined
          ? input.borrowerPhotoDataUrl
          : existing.borrowerPhotoDataUrl;
      if (bPhoto !== undefined) payload.borrowerPhotoDataUrl = bPhoto.slice(0, 200000);
      const gName = input.guarantorName !== undefined ? input.guarantorName : existing.guarantorName;
      if (gName?.trim()) payload.guarantorName = gName.trim().slice(0, 120);
      const gPhone = input.guarantorPhone !== undefined ? input.guarantorPhone : existing.guarantorPhone;
      if (gPhone?.trim()) payload.guarantorPhone = gPhone.trim().slice(0, 40);
      const gPhoto =
        input.guarantorPhotoDataUrl !== undefined
          ? input.guarantorPhotoDataUrl
          : existing.guarantorPhotoDataUrl;
      if (gPhoto !== undefined) payload.guarantorPhotoDataUrl = gPhoto.slice(0, 200000);
      const notes = input.notes !== undefined ? input.notes : existing.notes;
      if (notes?.trim()) payload.notes = notes.trim().slice(0, 1000);

      try {
        await updateDoc(doc(db, 'borrowers', id), payload);
        await writeAuditLog('update_borrower', 'borrower', id, `Updated borrower ${payload.name}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user, borrowers, writeAuditLog, commitLocal]
  );

  const deleteBorrower = useCallback(
    async (id: string) => {
      if (!user) {
        await commitLocal((prev) => ({
          ...prev,
          borrowers: prev.borrowers.filter((b) => b.id !== id),
        }));
        await writeAuditLog('delete_borrower', 'borrower', id, `Deleted borrower ${id}`);
        return;
      }

      const path = `borrowers/${id}`;
      try {
        await deleteDoc(doc(db, 'borrowers', id));
        await writeAuditLog('delete_borrower', 'borrower', id, `Deleted borrower ${id}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user, writeAuditLog, commitLocal]
  );

  const createLoan = useCallback(
    async (input: CreateLoanInput) => {
      const borrower = borrowers.find((b) => b.id === input.borrowerId);
      if (!borrower) throw new Error('Borrower not found');

      const loanId = generateSafeId('ln');
      const { schedules, totalInterest, totalPayable } = generateRepaymentSchedule({
        principal: input.principal,
        interestRate: input.interestRate,
        interestType: input.interestType,
        termCount: input.termCount,
        frequency: input.frequency,
        customIntervalDays: input.customIntervalDays,
        startDate: input.startDate,
        currency: input.currency,
      });

      if (!user) {
        const nowIso = new Date().toISOString();
        const newLoan: Loan = {
          id: loanId,
          ownerId: LOCAL_UID,
          borrowerId: borrower.id,
          borrowerName: borrower.name.slice(0, 120),
          currency: input.currency,
          principal: input.principal,
          interestRate: input.interestRate,
          interestType: input.interestType,
          termCount: Math.round(input.termCount),
          frequency: input.frequency,
          startDate: input.startDate.slice(0, 30),
          adminFee: Number(input.adminFee || 0),
          lateFeeType: input.lateFeeType || 'fixed',
          lateFeeValue: Number(input.lateFeeValue || 0),
          gracePeriodDays: Math.round(Number(input.gracePeriodDays || 0)),
          status: 'active',
          totalPayable,
          totalInterest,
          paidPrincipal: 0,
          paidInterest: 0,
          paidPenalty: 0,
          outstandingBalance: totalPayable,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        if (input.frequency === 'custom') {
          newLoan.customIntervalDays = Math.max(1, Math.round(input.customIntervalDays || 10));
        }
        if (input.collateralText?.trim()) {
          newLoan.collateralText = input.collateralText.trim().slice(0, 500);
        }
        if (input.collateralPhotoUrl) {
          newLoan.collateralPhotoUrl = input.collateralPhotoUrl.slice(0, 250000);
        }
        if (input.signatureDataUrl) {
          newLoan.signatureDataUrl = input.signatureDataUrl.slice(0, 120000);
        }
        if (input.parentLoanId) {
          newLoan.parentLoanId = input.parentLoanId.slice(0, 128);
        }

        const localSchedules: LoanSchedule[] = schedules.map((sch) => ({
          id: `inst_${sch.installmentNumber}`,
          ownerId: LOCAL_UID,
          loanId,
          borrowerId: borrower.id,
          installmentNumber: sch.installmentNumber,
          dueDate: sch.dueDate,
          principalDue: sch.principalDue,
          interestDue: sch.interestDue,
          totalDue: sch.totalDue,
          principalPaid: 0,
          interestPaid: 0,
          penaltyPaid: 0,
          status: sch.dueDate < todayIso ? 'overdue' : 'pending',
          updatedAt: nowIso,
        }));

        await commitLocal((prev) => ({
          ...prev,
          loans: [newLoan, ...prev.loans],
          schedulesByLoan: {
            ...prev.schedulesByLoan,
            [loanId]: localSchedules,
          },
        }));
        await writeAuditLog(
          'create_loan',
          'loan',
          loanId,
          `Issued ${input.currency} ${input.principal} loan to ${borrower.name}`
        );
        return loanId;
      }

      const batch = writeBatch(db);
      const loanPayload: Record<string, unknown> = {
        ownerId: user.uid,
        borrowerId: borrower.id,
        borrowerName: borrower.name.slice(0, 120),
        currency: input.currency,
        principal: input.principal,
        interestRate: input.interestRate,
        interestType: input.interestType,
        termCount: Math.round(input.termCount),
        frequency: input.frequency,
        startDate: input.startDate.slice(0, 30),
        adminFee: Number(input.adminFee || 0),
        lateFeeType: input.lateFeeType || 'fixed',
        lateFeeValue: Number(input.lateFeeValue || 0),
        gracePeriodDays: Math.round(Number(input.gracePeriodDays || 0)),
        status: 'active',
        totalPayable,
        totalInterest,
        paidPrincipal: 0,
        paidInterest: 0,
        paidPenalty: 0,
        outstandingBalance: totalPayable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (input.frequency === 'custom') {
        loanPayload.customIntervalDays = Math.max(1, Math.round(input.customIntervalDays || 10));
      }
      if (input.collateralText?.trim()) {
        loanPayload.collateralText = input.collateralText.trim().slice(0, 500);
      }
      if (input.collateralPhotoUrl) {
        loanPayload.collateralPhotoUrl = input.collateralPhotoUrl.slice(0, 250000);
      }
      if (input.signatureDataUrl) {
        loanPayload.signatureDataUrl = input.signatureDataUrl.slice(0, 120000);
      }
      if (input.parentLoanId) {
        loanPayload.parentLoanId = input.parentLoanId.slice(0, 128);
      }

      batch.set(doc(db, 'loans', loanId), loanPayload);

      for (const sch of schedules) {
        const schId = `inst_${sch.installmentNumber}`;
        batch.set(doc(db, 'loans', loanId, 'schedules', schId), {
          ownerId: user.uid,
          loanId,
          borrowerId: borrower.id,
          installmentNumber: sch.installmentNumber,
          dueDate: sch.dueDate,
          principalDue: sch.principalDue,
          interestDue: sch.interestDue,
          totalDue: sch.totalDue,
          principalPaid: 0,
          interestPaid: 0,
          penaltyPaid: 0,
          status: sch.dueDate < todayIso ? 'overdue' : 'pending',
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await batch.commit();
        await writeAuditLog(
          'create_loan',
          'loan',
          loanId,
          `Issued ${input.currency} ${input.principal} loan to ${borrower.name}`
        );
        return loanId;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `loans/${loanId}`);
      }
    },
    [user, borrowers, todayIso, writeAuditLog, commitLocal]
  );

  const syncPortalIfShared = useCallback(
    async (loan: Loan, updatedOutstanding: number, updatedStatus: Loan['status'], updatedSchedulesList: LoanSchedule[]) => {
      if (!user || !loan.portalShareId) return;
      const shareRef = doc(db, 'portalShares', loan.portalShareId);
      try {
        const snap = await getDoc(shareRef);
        if (!snap.exists()) return;
        await updateDoc(shareRef, {
          borrowerFirstName: loan.borrowerName.split(' ')[0].slice(0, 80) || 'Borrower',
          lenderName: (profile?.displayName || 'Lender').slice(0, 120),
          lenderPhone: (profile?.lenderPhone || '').slice(0, 40),
          lenderLogoDataUrl: (profile?.lenderLogoDataUrl || '').slice(0, 200000),
          interestType: loan.interestType,
          interestRate: loan.interestRate,
          outstandingBalance: updatedOutstanding,
          status: updatedStatus,
          schedules: updatedSchedulesList.slice(0, 120).map((s) => ({
            installmentNumber: s.installmentNumber,
            dueDate: s.dueDate,
            principalDue: s.principalDue,
            interestDue: s.interestDue,
            totalDue: s.totalDue,
            paidAmount: roundMoney(s.principalPaid + s.interestPaid, loan.currency),
            status: s.status,
          })),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Portal sync skipped:', error);
      }
    },
    [user, profile?.displayName, profile?.lenderPhone, profile?.lenderLogoDataUrl]
  );

  const recordPayment = useCallback(
    async (input: RecordPaymentInput): Promise<Payment> => {
      const loan = loans.find((l) => l.id === input.loanId);
      if (!loan) throw new Error('Loan not found');

      let schedules = schedulesByLoan[loan.id];
      if (!schedules) {
        if (!user) {
          schedules = [];
        } else {
          const snap = await getDocs(
            query(collection(db, 'loans', loan.id, 'schedules'), where('ownerId', '==', user.uid))
          );
          schedules = snap.docs
            .map((d) => ({ ...(d.data() as Omit<LoanSchedule, 'id'>), id: d.id }))
            .sort((a, b) => a.installmentNumber - b.installmentNumber);
        }
      }

      const allocation = allocatePaymentAcrossSchedules({
        amount: input.amount,
        loan,
        schedules,
        todayIso: input.paymentDate || todayIso,
      });

      const paymentId = generateSafeId('pay');
      const nowIso = new Date().toISOString();
      const mergedSchedules = schedules.map((s) => {
        const u = allocation.updatedSchedules.find((item) => item.id === s.id);
        return u ? { ...s, ...u } : s;
      });

      const borrowerLoans = loans
        .filter((l) => l.borrowerId === loan.borrowerId)
        .map((l) => (l.id === loan.id ? { ...l, status: allocation.newStatus } : l));
      const newScore = computeBorrowerRiskScore(
        borrowerLoans,
        { ...schedulesByLoan, [loan.id]: mergedSchedules },
        todayIso
      );

      if (!user) {
        const localPayment: Payment = {
          id: paymentId,
          ownerId: LOCAL_UID,
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          borrowerName: loan.borrowerName,
          currency: loan.currency,
          amount: input.amount,
          principalPortion: allocation.principalPortion,
          interestPortion: allocation.interestPortion,
          penaltyPortion: allocation.penaltyPortion,
          method: input.method,
          paymentDate: input.paymentDate.slice(0, 30),
          referenceNo: input.referenceNo?.trim().slice(0, 80) || undefined,
          notes: input.notes?.trim().slice(0, 400) || undefined,
          collectedBy: input.collectedBy?.trim().slice(0, 120) || undefined,
          gpsLat: typeof input.gpsLat === 'number' ? input.gpsLat : undefined,
          gpsLng: typeof input.gpsLng === 'number' ? input.gpsLng : undefined,
          createdAt: nowIso,
        };

        await commitLocal((prev) => ({
          ...prev,
          payments: [localPayment, ...prev.payments],
          loans: prev.loans.map((l) =>
            l.id === loan.id
              ? {
                  ...l,
                  paidPrincipal: allocation.newPaidPrincipal,
                  paidInterest: allocation.newPaidInterest,
                  paidPenalty: allocation.newPaidPenalty,
                  outstandingBalance: allocation.newOutstandingBalance,
                  status: allocation.newStatus,
                  updatedAt: nowIso,
                }
              : l
          ),
          schedulesByLoan: {
            ...prev.schedulesByLoan,
            [loan.id]: mergedSchedules,
          },
          borrowers: prev.borrowers.map((b) =>
            b.id === loan.borrowerId ? { ...b, riskScore: newScore, updatedAt: nowIso } : b
          ),
        }));
        await writeAuditLog(
          'record_payment',
          'payment',
          paymentId,
          `Recorded ${loan.currency} ${input.amount} payment from ${loan.borrowerName}`
        );
        return localPayment;
      }

      const paymentPayload: Record<string, unknown> = {
        ownerId: user.uid,
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        borrowerName: loan.borrowerName,
        currency: loan.currency,
        amount: input.amount,
        principalPortion: allocation.principalPortion,
        interestPortion: allocation.interestPortion,
        penaltyPortion: allocation.penaltyPortion,
        method: input.method,
        paymentDate: input.paymentDate.slice(0, 30),
        createdAt: serverTimestamp(),
      };
      if (input.referenceNo?.trim()) paymentPayload.referenceNo = input.referenceNo.trim().slice(0, 80);
      if (input.notes?.trim()) paymentPayload.notes = input.notes.trim().slice(0, 400);
      if (input.collectedBy?.trim()) paymentPayload.collectedBy = input.collectedBy.trim().slice(0, 120);
      if (typeof input.gpsLat === 'number') paymentPayload.gpsLat = input.gpsLat;
      if (typeof input.gpsLng === 'number') paymentPayload.gpsLng = input.gpsLng;

      const batch = writeBatch(db);
      batch.set(doc(db, 'payments', paymentId), paymentPayload);

      batch.update(doc(db, 'loans', loan.id), {
        paidPrincipal: allocation.newPaidPrincipal,
        paidInterest: allocation.newPaidInterest,
        paidPenalty: allocation.newPaidPenalty,
        outstandingBalance: allocation.newOutstandingBalance,
        status: allocation.newStatus,
        updatedAt: serverTimestamp(),
      });

      for (const upd of allocation.updatedSchedules) {
        const schUpdate: Record<string, unknown> = {
          principalPaid: upd.principalPaid,
          interestPaid: upd.interestPaid,
          penaltyPaid: upd.penaltyPaid,
          status: upd.status,
          updatedAt: serverTimestamp(),
        };
        if (upd.paidAt) schUpdate.paidAt = upd.paidAt;
        batch.update(doc(db, 'loans', loan.id, 'schedules', upd.id), schUpdate);
      }

      try {
        await batch.commit();
        await writeAuditLog(
          'record_payment',
          'payment',
          paymentId,
          `Recorded ${loan.currency} ${input.amount} payment from ${loan.borrowerName}`
        );

        await syncPortalIfShared(loan, allocation.newOutstandingBalance, allocation.newStatus, mergedSchedules);

        await updateDoc(doc(db, 'borrowers', loan.borrowerId), {
          riskScore: newScore,
          updatedAt: serverTimestamp(),
        });

        return {
          id: paymentId,
          ownerId: user.uid,
          loanId: loan.id,
          borrowerId: loan.borrowerId,
          borrowerName: loan.borrowerName,
          currency: loan.currency,
          amount: input.amount,
          principalPortion: allocation.principalPortion,
          interestPortion: allocation.interestPortion,
          penaltyPortion: allocation.penaltyPortion,
          method: input.method,
          paymentDate: input.paymentDate,
          referenceNo: input.referenceNo,
          notes: input.notes,
          collectedBy: input.collectedBy,
          gpsLat: input.gpsLat,
          gpsLng: input.gpsLng,
        };
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `payments/${paymentId}`);
      }
    },
    [user, loans, schedulesByLoan, todayIso, writeAuditLog, syncPortalIfShared, commitLocal]
  );

  const earlySettleLoan = useCallback(
    async (loanId: string, method: PaymentMethod, paymentDate: string) => {
      const loan = loans.find((l) => l.id === loanId);
      if (!loan) throw new Error('Loan not found');
      return recordPayment({
        loanId,
        amount: loan.outstandingBalance,
        method,
        paymentDate,
        notes: 'Early settlement',
      });
    },
    [loans, recordPayment]
  );

  const writeOffLoan = useCallback(
    async (loanId: string) => {
      const loan = loans.find((l) => l.id === loanId);
      if (!loan) return;

      if (!user) {
        await commitLocal((prev) => ({
          ...prev,
          loans: prev.loans.map((l) =>
            l.id === loanId ? { ...l, status: 'written_off', updatedAt: new Date().toISOString() } : l
          ),
        }));
        await writeAuditLog('write_off_loan', 'loan', loanId, `Written off loan for ${loan.borrowerName}`);
        return;
      }

      const path = `loans/${loanId}`;
      try {
        await updateDoc(doc(db, 'loans', loanId), {
          status: 'written_off',
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('write_off_loan', 'loan', loanId, `Written off loan for ${loan.borrowerName}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user, loans, writeAuditLog, commitLocal]
  );

  const renewOrRestructureLoan = useCallback(
    async (oldLoanId: string, mode: 'renew' | 'topup' | 'restructure', newLoanInput: CreateLoanInput) => {
      const oldLoan = loans.find((l) => l.id === oldLoanId);
      if (!oldLoan) throw new Error('Loan not found');

      if (!user) {
        await commitLocal((prev) => ({
          ...prev,
          loans: prev.loans.map((l) =>
            l.id === oldLoanId ? { ...l, status: 'renewed', updatedAt: new Date().toISOString() } : l
          ),
        }));
        const newId = await createLoan({ ...newLoanInput, parentLoanId: oldLoanId });
        await writeAuditLog(
          `loan_${mode}`,
          'loan',
          newId,
          `${mode.toUpperCase()} loan ${oldLoanId} -> ${newId} for ${oldLoan.borrowerName}`
        );
        return newId;
      }

      try {
        await updateDoc(doc(db, 'loans', oldLoanId), {
          status: 'renewed',
          updatedAt: serverTimestamp(),
        });
        const newId = await createLoan({ ...newLoanInput, parentLoanId: oldLoanId });
        await writeAuditLog(
          `loan_${mode}`,
          'loan',
          newId,
          `${mode.toUpperCase()} loan ${oldLoanId} -> ${newId} for ${oldLoan.borrowerName}`
        );
        return newId;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `loans/${oldLoanId}`);
      }
    },
    [user, loans, createLoan, writeAuditLog, commitLocal]
  );

  const createOrGetPortalShare = useCallback(
    async (loanId: string) => {
      const loan = loans.find((l) => l.id === loanId);
      if (!loan) throw new Error('Loan not found');

      let schedules = schedulesByLoan[loanId];
      if (!schedules) {
        if (!user) {
          schedules = [];
        } else {
          const snap = await getDocs(
            query(collection(db, 'loans', loanId, 'schedules'), where('ownerId', '==', user.uid))
          );
          schedules = snap.docs
            .map((d) => ({ ...(d.data() as Omit<LoanSchedule, 'id'>), id: d.id }))
            .sort((a, b) => a.installmentNumber - b.installmentNumber);
        }
      }

      const shareId = loan.portalShareId || generateSafeId('ps');
      const compactSchedules = schedules.slice(0, 120).map((s) => ({
        installmentNumber: s.installmentNumber,
        dueDate: s.dueDate,
        principalDue: s.principalDue,
        interestDue: s.interestDue,
        totalDue: s.totalDue,
        paidAmount: roundMoney(s.principalPaid + s.interestPaid, loan.currency),
        status: s.status,
      }));

      // Offline or unauthenticated local workspace uses self-contained portable link
      if (!user || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        const inlineShare = {
          id: shareId,
          ownerId: user?.uid || LOCAL_UID,
          loanId: loan.id,
          borrowerFirstName: loan.borrowerName.split(' ')[0].slice(0, 80) || 'Borrower',
          lenderName: (profile?.displayName || 'Lender').slice(0, 120),
          lenderPhone: (profile?.lenderPhone || '').slice(0, 40),
          currency: loan.currency,
          principal: loan.principal,
          interestType: loan.interestType,
          interestRate: loan.interestRate,
          totalPayable: loan.totalPayable,
          outstandingBalance: loan.outstandingBalance,
          status: loan.status,
          schedules: compactSchedules,
        };
        const encoded = encodePortalData(inlineShare);
        return `${window.location.origin}/?portalData=${encodeURIComponent(encoded)}`;
      }

      const shareData = {
        ownerId: user.uid,
        loanId: loan.id,
        borrowerFirstName: loan.borrowerName.split(' ')[0].slice(0, 80) || 'Borrower',
        lenderName: (profile?.displayName || 'Lender').slice(0, 120),
        lenderPhone: (profile?.lenderPhone || '').slice(0, 40),
        lenderLogoDataUrl: (profile?.lenderLogoDataUrl || '').slice(0, 200000),
        currency: loan.currency,
        principal: loan.principal,
        interestType: loan.interestType,
        interestRate: loan.interestRate,
        totalPayable: loan.totalPayable,
        outstandingBalance: loan.outstandingBalance,
        status: loan.status,
        schedules: compactSchedules,
        updatedAt: serverTimestamp(),
      };

      try {
        await setDoc(doc(db, 'portalShares', shareId), shareData);
        if (!loan.portalShareId) {
          await updateDoc(doc(db, 'loans', loan.id), {
            portalShareId: shareId,
            updatedAt: serverTimestamp(),
          });
        }
        return `${window.location.origin}/?portal=${encodeURIComponent(shareId)}`;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `portalShares/${shareId}`);
      }
    },
    [user, loans, schedulesByLoan, profile?.displayName, profile?.lenderPhone, profile?.lenderLogoDataUrl]
  );

  const addStaffMember = useCallback(
    async (name: string, phone: string, role: 'owner' | 'collector') => {
      const id = generateSafeId('stf');
      if (!user) {
        const nowIso = new Date().toISOString();
        const newStaff: StaffMember = {
          id,
          ownerId: LOCAL_UID,
          name: name.trim().slice(0, 120),
          phone: phone.trim().slice(0, 40),
          role,
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await commitLocal((prev) => ({
          ...prev,
          staff: [...prev.staff, newStaff],
        }));
        await writeAuditLog('add_staff', 'staff', id, `Added ${role} ${name.trim()}`);
        return;
      }

      try {
        await setDoc(doc(db, 'staff', id), {
          ownerId: user.uid,
          name: name.trim().slice(0, 120),
          phone: phone.trim().slice(0, 40),
          role,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('add_staff', 'staff', id, `Added ${role} ${name.trim()}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `staff/${id}`);
      }
    },
    [user, writeAuditLog, commitLocal]
  );

  const toggleStaffActive = useCallback(
    async (staffId: string, active: boolean) => {
      if (!user) {
        await commitLocal((prev) => ({
          ...prev,
          staff: prev.staff.map((m) =>
            m.id === staffId ? { ...m, active, updatedAt: new Date().toISOString() } : m
          ),
        }));
        return;
      }

      try {
        await updateDoc(doc(db, 'staff', staffId), {
          active,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `staff/${staffId}`);
      }
    },
    [user, commitLocal]
  );

  const deleteStaffMember = useCallback(
    async (staffId: string) => {
      if (!user) {
        await commitLocal((prev) => ({
          ...prev,
          staff: prev.staff.filter((m) => m.id !== staffId),
        }));
        return;
      }

      try {
        await deleteDoc(doc(db, 'staff', staffId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `staff/${staffId}`);
      }
    },
    [user, commitLocal]
  );

  const exportAllDataJson = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'KamChi',
      profile,
      borrowers,
      loans,
      schedulesByLoan,
      payments,
      staff,
    };
    return JSON.stringify(payload, null, 2);
  }, [profile, borrowers, loans, schedulesByLoan, payments, staff]);

  const importAllDataJson = useCallback(
    async (jsonText: string) => {
      const parsed = JSON.parse(jsonText) as {
        profile?: Partial<UserProfile>;
        borrowers?: Borrower[];
        loans?: Loan[];
        schedulesByLoan?: Record<string, LoanSchedule[]>;
        payments?: Payment[];
        staff?: StaffMember[];
      };

      if (!user) {
        await commitLocal((prev) => {
          const borrowerMap = new Map(prev.borrowers.map((b) => [b.id, b]));
          for (const b of parsed.borrowers || []) {
            const bId = b.id || generateSafeId('brw');
            borrowerMap.set(bId, {
              ...b,
              id: bId,
              ownerId: LOCAL_UID,
              name: (b.name || 'Borrower').slice(0, 120),
              phone: (b.phone || '000').slice(0, 40),
              tags: cleanTags(b.tags),
              riskScore: b.riskScore ?? 85,
            });
          }

          const loanMap = new Map(prev.loans.map((l) => [l.id, l]));
          for (const l of parsed.loans || []) {
            if (!l.id) continue;
            loanMap.set(l.id, { ...l, ownerId: LOCAL_UID });
          }

          const nextSchedules = { ...prev.schedulesByLoan };
          if (parsed.schedulesByLoan && typeof parsed.schedulesByLoan === 'object') {
            for (const [lId, list] of Object.entries(parsed.schedulesByLoan)) {
              if (Array.isArray(list)) {
                nextSchedules[lId] = list.map((s) => ({ ...s, ownerId: LOCAL_UID }));
              }
            }
          }

          const payMap = new Map(prev.payments.map((p) => [p.id, p]));
          for (const p of parsed.payments || []) {
            if (!p.id) continue;
            payMap.set(p.id, { ...p, ownerId: LOCAL_UID });
          }

          const staffMap = new Map(prev.staff.map((m) => [m.id, m]));
          for (const m of parsed.staff || []) {
            if (!m.id) continue;
            staffMap.set(m.id, { ...m, ownerId: LOCAL_UID });
          }

          return {
            ...prev,
            profile: parsed.profile
              ? {
                  ...prev.profile,
                  ...parsed.profile,
                  uid: LOCAL_UID,
                  updatedAt: new Date().toISOString(),
                }
              : prev.profile,
            borrowers: Array.from(borrowerMap.values()),
            loans: Array.from(loanMap.values()),
            schedulesByLoan: nextSchedules,
            payments: Array.from(payMap.values()),
            staff: Array.from(staffMap.values()),
          };
        });
        await writeAuditLog('import_backup', 'settings', LOCAL_UID, 'Imported backup data');
        return;
      }

      const batch = writeBatch(db);
      for (const b of parsed.borrowers || []) {
        const bId = b.id || generateSafeId('brw');
        batch.set(doc(db, 'borrowers', bId), {
          ownerId: user.uid,
          name: (b.name || 'Borrower').slice(0, 120),
          phone: (b.phone || '000').slice(0, 40),
          tags: cleanTags(b.tags),
          riskScore: b.riskScore ?? 85,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await writeAuditLog('import_backup', 'settings', user.uid, 'Imported borrower backup data');
    },
    [user, writeAuditLog, commitLocal]
  );

  const isWorkspaceReady = authReady && (Boolean(user) || localLoaded);

  const value: AppContextValue = {
    user,
    isLocalMode: !user,
    authReady: isWorkspaceReady,
    profile,
    isPinLocked,
    unlockWithPin,
    unlockWithBiometric,
    theme,
    toggleTheme,
    borrowers,
    loans,
    schedulesByLoan,
    payments,
    staff,
    auditLogs,
    todayIso,
    signInWithGoogle,
    signOut,
    updateSettings,
    setPinCode,
    createBorrower,
    updateBorrower,
    deleteBorrower,
    createLoan,
    recordPayment,
    earlySettleLoan,
    writeOffLoan,
    renewOrRestructureLoan,
    createOrGetPortalShare,
    addStaffMember,
    toggleStaffActive,
    deleteStaffMember,
    ensureSchedulesLoaded,
    exportAllDataJson,
    importAllDataJson,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
