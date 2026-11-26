/**
 * KamChi Offline License Configuration
 *
 * SECURITY & DEPLOYMENT NOTES:
 * 1. Replace `LICENSE_PUBLIC_KEY_HEX` with your real 32-byte Ed25519 public key (64 hex chars)
 *    generated offline before releasing to production. Keep the corresponding private key
 *    strictly outside the app repository.
 * 2. Replace `SELLER_TELEGRAM_USERNAME` with your real Telegram handle (without '@').
 *
 * IMPORTANT SECURITY HONESTY:
 * Client-side offline licensing is a business deterrent and cannot stop a determined attacker
 * from modifying JavaScript code on their own device. Keep entitlement checks layered cleanly,
 * never log raw keys or device secrets, and never lock or delete user lending data on expiry.
 */

export const LICENSE_PUBLIC_KEY_HEX =
  '2f8e4a1b9c7d6e5f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f';

export const SELLER_TELEGRAM_USERNAME = 'YOUR_USERNAME';

export const LICENSE_KEY_PREFIX = 'KC1';
export const LICENSE_FORMAT_VERSION = 1;

// Reference epoch for compact day numbers in license payloads: 2024-01-01T00:00:00.000Z
export const LICENSE_EPOCH_UTC_MS = Date.UTC(2024, 0, 1);
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Plan limits and lifecycle thresholds
export const MAX_FREE_ACTIVE_LOANS = 10;
export const EXPIRING_SOON_DAYS = 14;
export const GRACE_PERIOD_DAYS = 7;
export const CLOCK_ROLLBACK_TOLERANCE_MS = 24 * 60 * 60 * 1000;
