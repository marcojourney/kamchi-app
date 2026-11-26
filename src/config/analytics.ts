/**
 * KamChi Opt-In Anonymous Analytics Configuration
 *
 * FILL IN MEASUREMENT ID:
 *   Uses `VITE_GA4_MEASUREMENT_ID` from your build environment when set,
 *   defaulting to `G-6HVXECW1B4`.
 *
 * FILL IN GOOGLE FORM URL:
 *   Replace `FEEDBACK_FORM_URL` below with your Google Form URL.
 */

const DEFAULT_GA4_MEASUREMENT_ID = 'G-6HVXECW1B4';
export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/REPLACE_WITH_YOUR_FORM_ID/viewform';

interface ViteMetaEnvLike {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
  VITE_GA4_MEASUREMENT_ID?: string;
  VITE_ANALYTICS_ENABLED?: string;
}

function readMetaEnv(): ViteMetaEnvLike {
  try {
    return {
      DEV: import.meta.env.DEV,
      PROD: import.meta.env.PROD,
      MODE: import.meta.env.MODE,
      VITE_GA4_MEASUREMENT_ID: import.meta.env.VITE_GA4_MEASUREMENT_ID,
      VITE_ANALYTICS_ENABLED: import.meta.env.VITE_ANALYTICS_ENABLED,
    };
  } catch {
    return {};
  }
}

export function getAnalyticsConfig(override?: Partial<ViteMetaEnvLike>): {
  measurementId: string;
  buildDisabled: boolean;
} {
  const env = { ...readMetaEnv(), ...override };
  const measurementId =
    typeof env.VITE_GA4_MEASUREMENT_ID === 'string' && env.VITE_GA4_MEASUREMENT_ID.trim()
      ? env.VITE_GA4_MEASUREMENT_ID.trim()
      : DEFAULT_GA4_MEASUREMENT_ID;

  const isNodeDevOrTest =
    env.PROD !== true &&
    typeof process !== 'undefined' &&
    (process.env?.NODE_ENV === 'test' || process.env?.NODE_ENV === 'development');

  const isDevOrTest =
    Boolean(env.DEV) ||
    env.MODE === 'development' ||
    env.MODE === 'test' ||
    isNodeDevOrTest;

  const explicitlyDisabled = env.VITE_ANALYTICS_ENABLED === 'false';
  const explicitlyEnabled = env.VITE_ANALYTICS_ENABLED === 'true';

  // Disabled in development & test builds by default, or whenever VITE_ANALYTICS_ENABLED === 'false'.
  // In production builds, requires VITE_ANALYTICS_ENABLED !== 'false' (or explicit 'true').
  const buildDisabled =
    explicitlyDisabled || (isDevOrTest && !explicitlyEnabled) || env.PROD === false;

  return {
    measurementId,
    buildDisabled,
  };
}

export function isMeasurementIdConfigured(id: string | undefined | null): boolean {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!/^G-[A-Z0-9]{4,24}$/i.test(trimmed)) return false;
  if (/^G-(X+|0+|TEST.*|PLACEHOLDER.*)$/i.test(trimmed)) return false;
  return true;
}

const initialConfig = getAnalyticsConfig();

export const GA4_MEASUREMENT_ID = initialConfig.measurementId;
export const ANALYTICS_BUILD_DISABLED = initialConfig.buildDisabled;
export const FEEDBACK_PROMPT_AFTER_DAYS = 7;
