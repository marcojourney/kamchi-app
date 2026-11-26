# KamChi Offline License Key System

KamChi uses a 100% offline Ed25519 signed token model. There is **no license server**, no Firebase/Cloud Function call, and no network dependency for verification.

## 1. Before Releasing to Production

Update these two constants in `src/config/license.ts`:

1. `LICENSE_PUBLIC_KEY_HEX` — replace the placeholder 64-character hex string with your real 32-byte Ed25519 public key. Keep the matching private seed strictly outside this repository.
2. `SELLER_TELEGRAM_USERNAME` — replace `'YOUR_USERNAME'` with your Telegram username (without `@`) so the *"Send to seller on Telegram"* button opens your chat with a prefilled plan & device code message.

## 2. Binary Key Format (`KC1-...`)

- **Payload (24 bytes, big-endian)**:
  - `version` (1 byte): `1`
  - `plan` (1 byte): `1 = pro`, `2 = business`
  - `billing` (1 byte): `1 = monthly`, `2 = yearly`, `3 = lifetime`
  - `issuedAtDay` (uint32, 4 bytes): whole UTC days since `2024-01-01`
  - `expiresAtDay` (uint32, 4 bytes): whole UTC days since `2024-01-01` (`0` = lifetime)
  - `maxDevices` (1 byte): `1..255`
  - `deviceCodeHash` (8 bytes): all `0x00` for an unbound key, or `SHA-256(UTF8(canonicalDeviceCodeWithoutDashes)).slice(0, 8)` for a device-bound key
  - `keyId` (4 bytes): random identifier for seller records
- **Signature**: 64-byte Ed25519 signature over the 24-byte payload.
- **Checksum**: First 2 bytes of `SHA-256(payload || signature)` for instant typo detection before running signature checks.
- **Encoding**: Base32 (`A-Z`, `2-7`, no padding) over the 90 total bytes (`144` characters), formatted as `KC1-XXXXX-XXXXX-...`.

## 3. Device Binding & New-Phone Transfers

- On first launch, KamChi generates a random 32-byte `deviceSecret` stored locally in IndexedDB (`kamchi_license_db`). It never leaves the device.
- The displayed **Device Code** (`ABCDE-FGHIJ`) is the first 10 Base32 characters of `SHA-256(deviceSecret)`.
- Users can copy or send their Device Code to you on Telegram. When issuing a device-bound key, compute `SHA-256("ABCDEFGHIJ").slice(0, 8)` (uppercase, no dash) as `deviceCodeHash`.
- Setting `deviceCodeHash` to 8 zero bytes creates an **unbound** key valid on any device.

## 4. Lifecycle & Clock Tampering

- **Free**: up to 10 active loans; no key required.
- **Expiring Soon**: non-blocking banner starting 14 days before expiry.
- **Grace Period**: 7-day grace window after expiry with a renewal banner; features remain active.
- **Read-Only Mode**: after the 7-day grace period, existing loans, borrowers, schedules, and payments remain visible, searchable, and exportable, and recording payments on existing loans remains allowed; creating new loans/borrowers and paid features are blocked.
- **Downgrade Rule**: if a Pro/Business user switches or falls back to Free with >10 active loans, all existing loans stay accessible and payable; only creating new loans is blocked.
- **Clock Rollback Protection**: `latestSeenTime` is persisted in IndexedDB and updated on launch and record saves. If the device clock is rolled back by more than 24 hours, KamChi displays a warning and evaluates expiry against `latestSeenTime`.
