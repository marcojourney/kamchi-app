import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LICENSE_EPOCH_UTC_MS, MS_PER_DAY } from '../../config/license';
import {
  canBackupExport,
  canBackupRestore,
  canCreateBorrower,
  canCreateLoan,
  canExport,
  canExportContracts,
  canRecordPayment,
  canUseStaffAccounts,
  canUseTelegramReminders,
  detectClockRollback,
  getEffectivePlan,
  isReadOnly,
  resolveLicenseState,
} from '../entitlements';
import type { LicensePayload } from '../licenseKey';

function makePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    version: 1,
    plan: 'pro',
    billing: 'yearly',
    issuedAtDay: 100,
    expiresAtDay: 200,
    maxDevices: 1,
    deviceCodeHash: new Uint8Array(8),
    keyId: new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]),
    ...overrides,
  };
}

function dayToMs(day: number): number {
  return LICENSE_EPOCH_UTC_MS + day * MS_PER_DAY + 12 * 60 * 60 * 1000;
}

describe('entitlements & offline expiry/clock-tampering rules', () => {
  it('enforces Free plan limits (max 10 active loans) and allows downgrade with >10 loans read/pay access', () => {
    const freeState = resolveLicenseState({ verifiedLicense: null, nowMs: dayToMs(150) });
    assert.equal(freeState.status, 'free');
    assert.equal(getEffectivePlan(freeState), 'free');
    assert.equal(isReadOnly(freeState), false);

    assert.equal(canCreateLoan(freeState, 0), true);
    assert.equal(canCreateLoan(freeState, 9), true);
    assert.equal(canCreateLoan(freeState, 10), false);
    assert.equal(canCreateLoan(freeState, 18), false); // downgraded user keeps 18 existing loans, blocks new ones

    assert.equal(canCreateBorrower(freeState), true);
    assert.equal(canRecordPayment(freeState), true);
    assert.equal(canExport(freeState), false);
    assert.equal(canBackupRestore(freeState), false);
    assert.equal(canUseTelegramReminders(freeState), false);
    assert.equal(canUseStaffAccounts(freeState), false);
    assert.equal(canExportContracts(freeState), false);
  });

  it('unlocks Pro vs Business entitlements cleanly when active', () => {
    const proState = resolveLicenseState({
      verifiedLicense: {
        payload: makePayload({ plan: 'pro', expiresAtDay: 200 }),
        keyIdHex: 'AABBCCDD',
        maskedKey: 'KC1-•••••-XXXX',
        isBoundToDevice: false,
      },
      nowMs: dayToMs(150),
    });

    assert.equal(proState.status, 'active');
    assert.equal(proState.daysRemaining, 50);
    assert.equal(canCreateLoan(proState, 500), true);
    assert.equal(canExport(proState), true);
    assert.equal(canBackupRestore(proState), true);
    assert.equal(canUseTelegramReminders(proState), true);
    assert.equal(canUseStaffAccounts(proState), false);
    assert.equal(canExportContracts(proState), false);

    const bizState = resolveLicenseState({
      verifiedLicense: {
        payload: makePayload({ plan: 'business', billing: 'lifetime', expiresAtDay: 0 }),
        keyIdHex: 'AABBCCDD',
        maskedKey: 'KC1-•••••-XXXX',
        isBoundToDevice: true,
      },
      nowMs: dayToMs(900),
    });

    assert.equal(bizState.status, 'active');
    assert.equal(bizState.daysRemaining, null);
    assert.equal(canUseStaffAccounts(bizState), true);
    assert.equal(canExportContracts(bizState), true);
  });

  it('transitions smoothly across 14-day expiring_soon, 7-day grace period, and read-only mode', () => {
    const verified = {
      payload: makePayload({ plan: 'pro', expiresAtDay: 200 }),
      keyIdHex: 'AABBCCDD',
      maskedKey: 'KC1-•••••-XXXX',
      isBoundToDevice: false,
    };

    const expiring = resolveLicenseState({ verifiedLicense: verified, nowMs: dayToMs(186) });
    assert.equal(expiring.status, 'expiring_soon');
    assert.equal(expiring.daysRemaining, 14);
    assert.equal(canCreateLoan(expiring, 20), true);

    const graceDay1 = resolveLicenseState({ verifiedLicense: verified, nowMs: dayToMs(201) });
    assert.equal(graceDay1.status, 'grace');
    assert.equal(graceDay1.graceDaysRemaining, 7);
    assert.equal(canCreateLoan(graceDay1, 20), true);

    const graceDay7 = resolveLicenseState({ verifiedLicense: verified, nowMs: dayToMs(207) });
    assert.equal(graceDay7.status, 'grace');
    assert.equal(graceDay7.graceDaysRemaining, 1);
    assert.equal(canCreateLoan(graceDay7, 20), true);

    const readOnly = resolveLicenseState({ verifiedLicense: verified, nowMs: dayToMs(208) });
    assert.equal(readOnly.status, 'read_only');
    assert.equal(isReadOnly(readOnly), true);
    assert.equal(canCreateLoan(readOnly, 0), false);
    assert.equal(canCreateBorrower(readOnly), false);
    assert.equal(canBackupRestore(readOnly), false);
    assert.equal(canUseTelegramReminders(readOnly), false);
    // Data remains accessible, exportable, and payments remain recordable in read-only mode
    assert.equal(canRecordPayment(readOnly), true);
    assert.equal(canExport(readOnly), true);
    assert.equal(canBackupExport(readOnly), true);
  });

  it('detects >24h clock rollback and keeps evaluation anchored to latestSeenTime', () => {
    const latestSeen = dayToMs(210); // Past expiry + grace of expiresAtDay=200
    const rolledBackNow = dayToMs(150); // User rolled clock back 60 days

    assert.equal(detectClockRollback(rolledBackNow, latestSeen), true);
    assert.equal(detectClockRollback(latestSeen - 12 * 60 * 60 * 1000, latestSeen), false);

    const state = resolveLicenseState({
      verifiedLicense: {
        payload: makePayload({ plan: 'pro', expiresAtDay: 200 }),
        keyIdHex: 'AABBCCDD',
        maskedKey: 'KC1-•••••-XXXX',
        isBoundToDevice: false,
      },
      nowMs: rolledBackNow,
      latestSeenTimeMs: latestSeen,
    });

    assert.equal(state.clockTampered, true);
    assert.equal(state.status, 'read_only');
    assert.equal(isReadOnly(state), true);
  });
});
