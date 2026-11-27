import {
  getAnalyticsConfig,
  isMeasurementIdConfigured,
} from '../config/analytics';
import type { BusinessType } from '../config/featureAccess';
import type { Borrower, Loan, LoanSchedule } from '../types/loan';
import type { EffectivePlan } from './entitlements';
import {
  loadAnalyticsLocalState,
  updateAnalyticsLocalState,
  type FunnelStepName,
} from './analyticsStore';
import { DEFAULT_TIMEZONE, getLocalIsoDate } from './notificationDates';
import {
  buildPortfolioSnapshot,
  PORTFOLIO_SNAPSHOT_KEYS,
  type LoansTier,
  type PortfolioSnapshot,
} from './portfolioSnapshot';
import { runPortfolioSnapshotOffThread } from './snapshotRunner';

export type AnalyticsFeatureName =
  | 'reminder'
  | 'report_export'
  | 'notification_center'
  | 'language_switch'
  | 'theme_switch';

export type AnalyticsChannelName = 'telegram' | 'sms' | 'whatsapp';

export type AnalyticsScreenName =
  | 'dashboard'
  | 'loans'
  | 'borrowers'
  | 'reports'
  | 'settings'
  | 'terms'
  | 'privacy_shared';

export type AnalyticsErrorType =
  | 'render_crash'
  | 'storage_error'
  | 'worker_error'
  | 'network_error'
  | 'qr_scan_error';

export type AnalyticsOnlineState = 'online' | 'offline_then_online';

export interface AnalyticsEventParamMap {
  app_open: { online_state?: AnalyticsOnlineState };
  terms_accepted: Record<string, never>;
  onboarding_completed: { business_type: BusinessType };
  first_borrower_added: Record<string, never>;
  first_loan_created: Record<string, never>;
  first_payment_recorded: Record<string, never>;
  feature_used: { feature: AnalyticsFeatureName };
  reminder_sent: { channel: AnalyticsChannelName };
  pwa_installed: Record<string, never>;
  screen_view: { screen_name: AnalyticsScreenName };
  app_error: { error_type: AnalyticsErrorType };
  portfolio_snapshot: PortfolioSnapshot & { business_type?: BusinessType };
  feedback_opened: Record<string, never>;
}

export type AnalyticsEventName = keyof AnalyticsEventParamMap;

export const ALLOWED_ANALYTICS_EVENTS: ReadonlyArray<AnalyticsEventName> = [
  'app_open',
  'terms_accepted',
  'onboarding_completed',
  'first_borrower_added',
  'first_loan_created',
  'first_payment_recorded',
  'feature_used',
  'reminder_sent',
  'pwa_installed',
  'screen_view',
  'app_error',
  'portfolio_snapshot',
  'feedback_opened',
] as const;

export const ALLOWED_PARAMS_BY_EVENT: Record<
  AnalyticsEventName,
  ReadonlyArray<string>
> = {
  app_open: ['online_state'],
  terms_accepted: [],
  onboarding_completed: ['business_type'],
  first_borrower_added: [],
  first_loan_created: [],
  first_payment_recorded: [],
  feature_used: ['feature'],
  reminder_sent: ['channel'],
  pwa_installed: [],
  screen_view: ['screen_name'],
  app_error: ['error_type'],
  portfolio_snapshot: [...PORTFOLIO_SNAPSHOT_KEYS, 'business_type'],
  feedback_opened: [],
};

/**
 * Guardrail regex rejecting any parameter name that looks like PII, device identity,
 * free text, exact dates, or exact financial values.
 */
export const FORBIDDEN_PARAM_PATTERN =
  /(name|phone|tel|address|national_id|id_number|note|free_text|license|device_code|user_id|email|amount|balance|principal|interest_amount|penalty|payment_date|due_date|borrower_id|loan_id|borrower_name)/i;

const FEATURE_VALUES = new Set<AnalyticsFeatureName>([
  'reminder',
  'report_export',
  'notification_center',
  'language_switch',
  'theme_switch',
]);
const CHANNEL_VALUES = new Set<AnalyticsChannelName>(['telegram', 'sms', 'whatsapp']);
const SCREEN_VALUES = new Set<AnalyticsScreenName>([
  'dashboard',
  'loans',
  'borrowers',
  'reports',
  'settings',
  'terms',
  'privacy_shared',
]);
const ERROR_TYPE_VALUES = new Set<AnalyticsErrorType>([
  'render_crash',
  'storage_error',
  'worker_error',
  'network_error',
  'qr_scan_error',
]);
const ONLINE_STATE_VALUES = new Set<AnalyticsOnlineState>([
  'online',
  'offline_then_online',
]);

const SNAPSHOT_INTEGER_FIELDS = new Set<string>([
  'total_loans',
  'active_loans',
  'paid_loans',
  'overdue_loans',
  'borrower_count',
]);

const BUSINESS_TYPE_VALUES = new Set<BusinessType>([
  'lender',
  'installment_shop',
  'both',
]);

const SNAPSHOT_ENUM_MAP: Record<string, ReadonlySet<string>> = {
  loans_tier: new Set(['0', '1-5', '6-10', '11-25', '26-50', '51-100', '100+']),
  overdue_rate_bucket: new Set(['0', '1-10', '11-25', '26+']),
  avg_loan_size_bucket: new Set(['<100', '100-500', '500-2000', '>2000']),
  avg_term_bucket: new Set(['<1m', '1-3m', '3-6m', '>6m']),
  currency_mix: new Set(['usd', 'khr', 'both']),
  dominant_interest_type: new Set(['flat', 'reducing', 'interest_only', 'mixed']),
  dominant_frequency: new Set(['daily', 'weekly', 'monthly', 'mixed']),
  plan_tier: new Set(['free', 'pro', 'business']),
  app_language: new Set(['en', 'km']),
  business_type: BUSINESS_TYPE_VALUES,
};

export interface AnalyticsRuntimeAdapter {
  measurementId?: string;
  buildDisabled?: boolean;
  isOnline?: () => boolean;
  sendGtagCommand?: (command: string, ...args: unknown[]) => void;
  loadScript?: (measurementId: string) => void;
  clearCookies?: () => void;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let currentConsent = false;
let gtagInitialized = false;
let scriptInjected = false;
let scriptLoadFailed = false;
let testAdapter: AnalyticsRuntimeAdapter | null = null;

function isAllowedEventName(name: string): name is AnalyticsEventName {
  return (ALLOWED_ANALYTICS_EVENTS as ReadonlyArray<string>).includes(name);
}

/**
 * Sanitizes event parameters against the strict whitelist.
 * Returns null if the event itself is not whitelisted.
 */
export function sanitizeAnalyticsPayload(
  eventName: string,
  rawParams?: Record<string, unknown>
): Record<string, string | number> | null {
  if (!isAllowedEventName(eventName)) {
    return null;
  }

  const allowedKeys = new Set(ALLOWED_PARAMS_BY_EVENT[eventName]);
  const clean: Record<string, string | number> = {};
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    return clean;
  }

  for (const [key, value] of Object.entries(rawParams)) {
    if (key === 'screen_name' && eventName === 'screen_view') {
      if (typeof value === 'string' && SCREEN_VALUES.has(value as AnalyticsScreenName)) {
        clean.screen_name = value;
      }
      continue;
    }

    if (FORBIDDEN_PARAM_PATTERN.test(key)) {
      continue;
    }
    if (!allowedKeys.has(key)) {
      continue;
    }

    if (eventName === 'app_open' && key === 'online_state') {
      if (typeof value === 'string' && ONLINE_STATE_VALUES.has(value as AnalyticsOnlineState)) {
        clean.online_state = value;
      }
    } else if (eventName === 'feature_used' && key === 'feature') {
      if (typeof value === 'string' && FEATURE_VALUES.has(value as AnalyticsFeatureName)) {
        clean.feature = value;
      }
    } else if (eventName === 'reminder_sent' && key === 'channel') {
      if (typeof value === 'string' && CHANNEL_VALUES.has(value as AnalyticsChannelName)) {
        clean.channel = value;
      }
    } else if (eventName === 'onboarding_completed' && key === 'business_type') {
      if (typeof value === 'string' && BUSINESS_TYPE_VALUES.has(value as BusinessType)) {
        clean.business_type = value;
      }
    } else if (eventName === 'app_error' && key === 'error_type') {
      if (typeof value === 'string' && ERROR_TYPE_VALUES.has(value as AnalyticsErrorType)) {
        clean.error_type = value;
      }
    } else if (eventName === 'portfolio_snapshot') {
      if (SNAPSHOT_INTEGER_FIELDS.has(key)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          clean[key] = Math.max(0, Math.round(value));
        }
      } else {
        const enumSet = SNAPSHOT_ENUM_MAP[key];
        if (enumSet && typeof value === 'string' && enumSet.has(value)) {
          clean[key] = value;
        }
      }
    }
  }

  return clean;
}

function getEffectiveEnv(): {
  measurementId: string;
  buildDisabled: boolean;
} {
  const cfg = getAnalyticsConfig();
  return {
    measurementId: testAdapter?.measurementId ?? cfg.measurementId,
    buildDisabled: testAdapter?.buildDisabled ?? cfg.buildDisabled,
  };
}

function isDeviceOnline(): boolean {
  try {
    if (testAdapter?.isOnline) return testAdapter.isOnline();
    if (typeof navigator === 'undefined') return false;
    return navigator.onLine !== false;
  } catch {
    return false;
  }
}

function callGtag(command: string, ...args: unknown[]): void {
  try {
    if (testAdapter?.sendGtagCommand) {
      testAdapter.sendGtagCommand(command, ...args);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag(command, ...args);
    }
  } catch {
    // Never surface analytics errors
  }
}

function defaultLoadGtagScript(measurementId: string): void {
  if (typeof document === 'undefined' || scriptInjected || scriptLoadFailed) return;
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src*="googletagmanager.com/gtag/js"]`
  );
  if (existing) {
    scriptInjected = true;
    return;
  }

  scriptInjected = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.onerror = () => {
    scriptLoadFailed = true;
  };
  (document.head || document.documentElement).appendChild(script);
}

function clearGaCookiesDefault(): void {
  if (typeof document === 'undefined') return;
  try {
    const rawCookies = document.cookie ? document.cookie.split(';') : [];
    const cookieNames = new Set<string>(['_ga', '_gid', '_gat']);
    for (const pair of rawCookies) {
      const eqIdx = pair.indexOf('=');
      const name = (eqIdx >= 0 ? pair.slice(0, eqIdx) : pair).trim();
      if (/^(_ga|_gid|_gat|_gcl)/i.test(name)) {
        cookieNames.add(name);
      }
    }

    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const domainCandidates: Array<string | null> = [null];
    if (hostname && hostname.includes('.')) {
      const parts = hostname.split('.');
      domainCandidates.push(hostname, `.${hostname}`);
      if (parts.length >= 2) {
        const apex = parts.slice(-2).join('.');
        domainCandidates.push(apex, `.${apex}`);
      }
    } else if (hostname) {
      domainCandidates.push(hostname);
    }

    for (const name of cookieNames) {
      for (const domain of domainCandidates) {
        const domainAttr = domain ? `; domain=${domain}` : '';
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainAttr}; SameSite=Lax`;
      }
    }
  } catch {
    // Ignore cookie errors
  }
}

function ensureGtagReady(): boolean {
  try {
    if (!currentConsent) return false;
    const { measurementId, buildDisabled } = getEffectiveEnv();
    if (buildDisabled || !isMeasurementIdConfigured(measurementId)) {
      return false;
    }
    if (!isDeviceOnline()) {
      return false;
    }

    if (typeof window !== 'undefined' && !testAdapter?.sendGtagCommand) {
      window.dataLayer = window.dataLayer || [];
      if (typeof window.gtag !== 'function') {
        window.gtag = function gtagProxy() {
          // gtag.js requires the native Arguments object in dataLayer; plain Arrays are ignored.
          // eslint-disable-next-line prefer-rest-params
          window.dataLayer?.push(arguments);
        };
      }
    }

    if (!gtagInitialized) {
      gtagInitialized = true;
      callGtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      });
      callGtag('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted',
      });
      callGtag('js', new Date());
      callGtag('set', {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      callGtag('config', measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
    } else {
      callGtag('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted',
      });
    }

    if (testAdapter?.loadScript) {
      if (!scriptInjected && !scriptLoadFailed) {
        scriptInjected = true;
        try {
          testAdapter.loadScript(measurementId);
        } catch {
          scriptLoadFailed = true;
        }
      }
    } else {
      defaultLoadGtagScript(measurementId);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Updates user analytics consent.
 * - `true`: grants `analytics_storage` (keeping all ad signals permanently denied) and lazily loads gtag.js if online.
 * - `false`: stops sending immediately, denies Consent Mode v2 storage, and clears GA cookies.
 */
export function setAnalyticsConsent(enabled: boolean): void {
  try {
    const next = Boolean(enabled);
    currentConsent = next;

    if (!next) {
      if (gtagInitialized) {
        callGtag('consent', 'update', {
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
          analytics_storage: 'denied',
        });
      }
      if (testAdapter?.clearCookies) {
        testAdapter.clearCookies();
      } else {
        clearGaCookiesDefault();
      }
      return;
    }

    ensureGtagReady();
  } catch {
    // Ignore
  }
}

export function getAnalyticsConsent(): boolean {
  return currentConsent;
}

/**
 * Sends a single whitelisted analytics event to GA4 if consent is granted,
 * build/measurement checks pass, and the device is online.
 * Drops events silently when offline or unconsented (never queues or replays).
 */
export function track<E extends AnalyticsEventName>(
  eventName: E,
  params?: AnalyticsEventParamMap[E]
): boolean {
  try {
    if (!currentConsent) return false;
    if (!isDeviceOnline()) return false;
    if (!ensureGtagReady()) return false;

    const sanitized = sanitizeAnalyticsPayload(
      eventName,
      params as Record<string, unknown> | undefined
    );
    if (!sanitized) return false;

    // Require required payload keys on typed events that expect an enum parameter
    if (eventName === 'onboarding_completed' && !sanitized.business_type) return false;
    if (eventName === 'feature_used' && !sanitized.feature) return false;
    if (eventName === 'reminder_sent' && !sanitized.channel) return false;
    if (eventName === 'screen_view' && !sanitized.screen_name) return false;
    if (eventName === 'app_error' && !sanitized.error_type) return false;

    callGtag('event', eventName, sanitized);
    return true;
  } catch {
    return false;
  }
}

export function trackScreenView(screenName: AnalyticsScreenName): boolean {
  return track('screen_view', { screen_name: screenName });
}

export async function trackFunnelOnce(
  step: FunnelStepName,
  params?: AnalyticsEventParamMap[typeof step]
): Promise<boolean> {
  try {
    const state = await loadAnalyticsLocalState();
    if (state.funnelSent[step]) return false;
    const sent = track(step, params as never);
    if (!sent) return false;

    await updateAnalyticsLocalState((prev) => ({
      ...prev,
      funnelSent: { ...prev.funnelSent, [step]: true },
    }));
    return true;
  } catch {
    return false;
  }
}

export async function setLenderSizeTierProperty(tier: LoansTier): Promise<void> {
  try {
    if (!currentConsent || !isDeviceOnline()) return;
    const state = await loadAnalyticsLocalState();
    if (state.lastLenderSizeTier === tier) return;
    if (!ensureGtagReady()) return;

    callGtag('set', 'user_properties', {
      lender_size_tier: tier,
    });

    await updateAnalyticsLocalState((prev) => ({
      ...prev,
      lastLenderSizeTier: tier,
    }));
  } catch {
    // Ignore
  }
}

export function hasSentSnapshotToday(
  lastSnapshotSentAt: string | null,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): boolean {
  if (!lastSnapshotSentAt) return false;
  const lastMs = Date.parse(lastSnapshotSentAt);
  if (!Number.isFinite(lastMs)) return false;

  const todayIso = getLocalIsoDate(now, timeZone);
  const lastIso = getLocalIsoDate(new Date(lastMs), timeZone);
  if (lastIso === todayIso) return true;

  // Also guard if clock moved backwards slightly within 24h window
  const diffMs = now.getTime() - lastMs;
  if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000 && lastIso >= todayIso) {
    return true;
  }
  return false;
}

export async function maybeSendDailyPortfolioSnapshot(params: {
  loans: Loan[];
  borrowers: Borrower[];
  schedulesByLoan?: Record<string, LoanSchedule[]>;
  exchangeRateKhr?: number;
  planTier?: EffectivePlan;
  appLanguage?: 'en' | 'km';
  businessType?: BusinessType;
  now?: Date;
  useWorker?: boolean;
}): Promise<boolean> {
  try {
    if (!currentConsent || !isDeviceOnline()) return false;
    const { measurementId, buildDisabled } = getEffectiveEnv();
    if (buildDisabled || !isMeasurementIdConfigured(measurementId)) {
      return false;
    }

    const now = params.now || new Date();
    const state = await loadAnalyticsLocalState();
    if (hasSentSnapshotToday(state.lastSnapshotSentAt, now, DEFAULT_TIMEZONE)) {
      return false;
    }

    const context = {
      schedulesByLoan: params.schedulesByLoan,
      exchangeRateKhr: params.exchangeRateKhr,
      planTier: params.planTier,
      appLanguage: params.appLanguage,
      timeZone: DEFAULT_TIMEZONE,
    };

    const snapshot =
      params.useWorker === false
        ? buildPortfolioSnapshot(params.loans, params.borrowers, now, context)
        : await runPortfolioSnapshotOffThread({
            loans: params.loans,
            borrowers: params.borrowers,
            now,
            context,
          });

    // Re-check consent & online after async worker tick
    if (!currentConsent || !isDeviceOnline()) return false;

    await setLenderSizeTierProperty(snapshot.loans_tier);
    const snapshotWithType = params.businessType
      ? { ...snapshot, business_type: params.businessType }
      : snapshot;
    const sent = track('portfolio_snapshot', snapshotWithType);
    if (!sent) return false;

    await updateAnalyticsLocalState((prev) => ({
      ...prev,
      lastSnapshotSentAt: now.toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function __setAnalyticsRuntimeForTests(
  adapter: AnalyticsRuntimeAdapter | null
): void {
  testAdapter = adapter;
  currentConsent = false;
  gtagInitialized = false;
  scriptInjected = false;
  scriptLoadFailed = false;
}
