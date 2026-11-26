# KamChi (កម្ចី) — Anonymous Opt-In GA4 Analytics Setup Guide

KamChi collects **zero borrower PII, zero loan records, and zero tracking data by default**. Google Analytics 4 (`gtag.js`) loads **only** after the lender explicitly opts in on the Terms screen or inside **Settings → Privacy**, when the device is online, and when a real Measurement ID is configured.

---

## 1. Environment & Placeholder Configuration

Fill in these two values before deploying to production:

| Purpose | Environment Variable | Fallback Constant File |
|---|---|---|
| GA4 Measurement ID | `VITE_GA4_MEASUREMENT_ID` | `DEFAULT_GA4_MEASUREMENT_ID` in `src/config/analytics.ts` |
| Enable Analytics in Production Build | `VITE_ANALYTICS_ENABLED=true` | `src/config/analytics.ts` |
| Lender Feedback Google Form URL | *(code constant only)* | `FEEDBACK_FORM_URL` in `src/config/analytics.ts` |

Create a `.env.local` (or set build environment secrets in CI/hosting):

```env
VITE_GA4_MEASUREMENT_ID="G-YOURREALID1"
VITE_ANALYTICS_ENABLED="true"
```

> **Note:** Development (`npm run dev`) and test runs keep analytics disabled automatically unless `VITE_ANALYTICS_ENABLED="true"` is explicitly set alongside a non-placeholder `G-...` ID. Leaving `G-XXXXXXXXXX` keeps analytics completely inactive.

---

## 2. Creating the GA4 Property & Web Data Stream

1. Go to [analytics.google.com](https://analytics.google.com/) → **Admin** → **Create Property** (e.g., `KamChi PWA`, reporting timezone `Asia/Phnom_Penh`, currency `USD`).
2. Under **Data Streams**, choose **Web** and enter your PWA production origin.
3. Disable **Enhanced Measurement** page views / form / scroll noise if desired (the app passes `send_page_view: false` and sends manual `screen_view` events).
4. Copy the `G-XXXXXXXXXX` **Measurement ID** into `VITE_GA4_MEASUREMENT_ID`.

---

## 3. Privacy & Consent Configuration in GA4 Admin

In addition to code-level Consent Mode v2 (`ad_storage`, `ad_user_data`, and `ad_personalization` permanently `'denied'`, `allow_google_signals: false`, `allow_ad_personalization_signals: false`, no `user_id`), configure GA4 Admin to match:

1. **Admin → Data Collection and Modification → Data Collection**:
   - Ensure **Google signals data collection** is **OFF**.
   - Ensure **Ads Personalization** is **OFF** for all regions.
2. **Admin → Data Retention**:
   - Set **Event data retention** to **2 months** (shortest option) and **Reset user data on new activity** as appropriate.
3. **IP Anonymization**: GA4 enforces IP masking automatically and does not log/store full IP addresses.

---

## 4. Register Custom Metrics, Dimensions & User Property BEFORE Launch

> **CRITICAL:** GA4 custom metrics and dimensions are **not retroactive**. Register every parameter below in **GA4 Admin → Data Display → Custom Definitions** before enabling analytics in production.

### A. User-Scoped Custom Dimension (User Property)

| Display Name | Scope | User Property Name | Allowed Values |
|---|---|---|---|
| `Lender Size Tier` | **User** | `lender_size_tier` | `0`, `1-5`, `6-10`, `11-25`, `26-50`, `51-100`, `100+` |

### B. Event-Scoped Custom Metrics (`portfolio_snapshot`)

| Display Name | Scope | Event Parameter | Unit of Measurement |
|---|---|---|---|
| `Total Loans` | **Event** | `total_loans` | Standard |
| `Active Loans` | **Event** | `active_loans` | Standard |
| `Paid Loans` | **Event** | `paid_loans` | Standard |
| `Overdue Loans` | **Event** | `overdue_loans` | Standard |
| `Borrower Count` | **Event** | `borrower_count` | Standard |

### C. Event-Scoped Custom Dimensions

| Display Name | Scope | Event Parameter | Allowed / Expected Values |
|---|---|---|---|
| `Loans Tier` | **Event** | `loans_tier` | `0`, `1-5`, `6-10`, `11-25`, `26-50`, `51-100`, `100+` |
| `Overdue Rate Bucket` | **Event** | `overdue_rate_bucket` | `0`, `1-10`, `11-25`, `26+` |
| `Avg Loan Size Bucket` | **Event** | `avg_loan_size_bucket` | `<100`, `100-500`, `500-2000`, `>2000` |
| `Avg Term Bucket` | **Event** | `avg_term_bucket` | `<1m`, `1-3m`, `3-6m`, `>6m` |
| `Currency Mix` | **Event** | `currency_mix` | `usd`, `khr`, `both` |
| `Dominant Interest Type` | **Event** | `dominant_interest_type` | `flat`, `reducing`, `interest_only`, `mixed` |
| `Dominant Frequency` | **Event** | `dominant_frequency` | `daily`, `weekly`, `monthly`, `mixed` |
| `Plan Tier` | **Event** | `plan_tier` | `free`, `pro`, `business` |
| `App Language` | **Event** | `app_language` | `en`, `km` |
| `Feature Name` | **Event** | `feature` | `reminder`, `report_export`, `notification_center`, `language_switch`, `theme_switch` |
| `Reminder Channel` | **Event** | `channel` | `telegram`, `sms`, `whatsapp` |
| `Error Category` | **Event** | `error_type` | `render_crash`, `storage_error`, `worker_error`, `network_error`, `qr_scan_error` |
| `Online State` | **Event** | `online_state` | `online`, `offline_then_online` |

---

## 5. Testing with GA4 DebugView

1. Temporarily build with `VITE_ANALYTICS_ENABLED="true"` and your test/prod `VITE_GA4_MEASUREMENT_ID`.
2. Verify **before** toggling consent on that DevTools → **Network** shows **zero** requests to `googletagmanager.com` or `google-analytics.com` and `document.cookie` has no `_ga*` cookies.
3. Accept Terms with the optional analytics toggle **enabled** (or turn it on in **Settings → Privacy**).
4. Install the **Google Analytics Debugger** browser extension, reload, and open **GA4 → Admin → Data Display → DebugView**.
5. Confirm:
   - `app_open`, `terms_accepted`, `screen_view`, and `portfolio_snapshot` arrive cleanly with only counts/buckets.
   - Toggling analytics **OFF** in **Settings → Privacy** clears `_ga*` cookies immediately and stops further network hits.
   - Toggling DevTools Network to **Offline** drops events cleanly with zero console errors or queued replays upon reconnect.

---

## 6. Suggested GA4 Explorations

1. **Activation Funnel (Funnel Exploration)**:
   - Steps: `app_open` → `terms_accepted` → `first_borrower_added` → `first_loan_created` → `first_payment_recorded`.
   - Breakdown by `app_language` (`en` vs `km`).
2. **Loans per Lender Install (Free Form Exploration)**:
   - Rows: `Loans Tier` (`loans_tier`) or user property `Lender Size Tier` (`lender_size_tier`).
   - Values: `Active users` (anonymous installs).
3. **Portfolio Health by Lender Size (Free Form Exploration)**:
   - Filter: `Event name` = `portfolio_snapshot`.
   - Rows: `Loans Tier`, Columns: `Overdue Rate Bucket`, Values: `Event count` + `Total Loans` average.
4. **Feature & Channel Adoption (Free Form Exploration)**:
   - Filter `feature_used` by `Feature Name` (`feature`), and filter `reminder_sent` by `Reminder Channel` (`telegram` vs `sms` vs `whatsapp`).
