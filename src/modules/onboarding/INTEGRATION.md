# Onboarding & Business Profile Integration Guide

This document lists every existing receipt, contract, reminder template, and future installment view that can consume the active business profile via the read-only hook `useBusinessProfile()` without duplicating storage or altering legacy loan logic.

## 1. Read-Only Hook

```ts
import { useBusinessProfile } from '../modules/onboarding';

const { businessType, profile, defaults, loaded } = useBusinessProfile();
```

`profile` fields:
- `name`: Business or Lender display name
- `ownerName`: Owner full name (optional)
- `phone`: Contact phone number
- `telegram`: Telegram username (`@handle`)
- `address`: Street / physical address
- `province`: Province / City (Cambodia)
- `logo`: Resized image Data URL (`data:image/...`)
- `defaultCurrency`: `'USD' | 'KHR' | 'both'`
- `exchangeRate`: Numeric KHR per USD rate (default `4100`)

Note: Core fields (`name`, `phone`, `logo`, `defaultCurrency`, `exchangeRate`) are also synced automatically to the existing `UserProfile` store via `updateSettings(...)`.

---

## 2. Where Existing Templates & Exports Should Read Business Profile Later

| Feature / File | Current Source | Recommended Read via `useBusinessProfile()` (or `readBusinessProfile()`) |
| --- | --- | --- |
| **Payment Receipt** (`src/components/ReceiptModal.tsx`, lines 77–95) | `profile?.displayName`, `profile?.lenderPhone`, `profile?.lenderLogoDataUrl` | Use `businessProfile.name`, `businessProfile.phone`, `businessProfile.logo`, plus append optional `businessProfile.address`, `businessProfile.province`, and `businessProfile.telegram` below header. |
| **Repayment Schedule & P&L PDF Headers** (`src/lib/pdfExport.ts`, lines 280–355, 520–568, 619–695) | `input.lenderName`, `input.lenderPhone`, `input.lenderLogoDataUrl` | Pass `ownerName`, `address`, `province`, and `telegram` alongside `name`/`phone`/`logo` from `businessProfile` in the caller (`LoansView.tsx` / `RemindersReportsView.tsx`). |
| **Loan Agreement Contracts PDF** (`src/lib/pdfExport.ts` / `LoanContractModal`) | `profile.displayName`, `profile.lenderPhone` | Pre-fill Lender Party block with `businessProfile.name`, `businessProfile.ownerName`, `businessProfile.phone`, `businessProfile.address`, and `businessProfile.province`. |
| **Reminder Templates (`{lenderName}` variable)** (`src/lib/notificationTemplates.ts`, lines 9–30 & 77–95) | Passed `{lenderName}` string from caller | Resolve sender label from `businessProfile.name || profile.displayName`, and optionally include `businessProfile.phone` or `businessProfile.telegram` in shop/lender signature lines. |
| **Future Installments Module Contracts** (`src/modules/installments/`) | Not yet created | Read `businessProfile` via `useBusinessProfile()` for Seller header (`name`, `ownerName`, `phone`, `address`, `province`, `logo`) and default terms via `defaults.installment` (`minDownPaymentPercent`, `defaultInstallments`, `khrRoundingStep`, `graceDays`, `lateFeeType`, `lateFeeValue`). |
