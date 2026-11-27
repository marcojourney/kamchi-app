import { DEFAULT_EXCHANGE_RATE_KHR, FIELD_LIMITS } from '../config';
import type { BusinessProfile, ValidationErrors } from '../types';

const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';

export function normalizeDigits(raw: string): string {
  return raw.replace(/[០-៩]/g, (ch) => {
    const idx = KHMER_DIGITS.indexOf(ch);
    return idx >= 0 ? String(idx) : ch;
  });
}

export function trimText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function countChars(raw: string): number {
  return Array.from(raw).length;
}

export function clampText(raw: string, maxChars: number): string {
  const trimmed = trimText(raw);
  const chars = Array.from(trimmed);
  if (chars.length <= maxChars) return trimmed;
  return chars.slice(0, maxChars).join('');
}

/**
 * Loosely validates Cambodian phone numbers:
 * - Domestic: 0xx xxx xxx(x) -> 9 to 10 digits starting with 0 (second digit 1-9)
 * - International: +855 xx xxx xxx(x) or 855 xx xxx xxx(x) (with optional leading 0 after 855)
 * Accepts spaces, hyphens, dots, parentheses, and Khmer numerals.
 */
export function validateCambodianPhone(rawPhone: string): {
  valid: boolean;
  normalized: string;
  reason?: 'required' | 'tooLong' | 'invalidFormat';
} {
  const trimmed = trimText(rawPhone);
  if (!trimmed) {
    return { valid: false, normalized: '', reason: 'required' };
  }
  if (countChars(trimmed) > FIELD_LIMITS.phoneMax) {
    return { valid: false, normalized: trimmed, reason: 'tooLong' };
  }

  const ascii = normalizeDigits(trimmed);
  const stripped = ascii.replace(/[\s\-().]/g, '');

  // Check domestic 0xx format (9-10 digits total, e.g. 012345678 or 0971234567)
  if (/^0[1-9]\d{7,8}$/.test(stripped)) {
    return { valid: true, normalized: trimmed };
  }

  // Check international +855 or 855 format (optional 0 then [1-9] and 7-8 digits)
  if (/^\+?8550?[1-9]\d{7,8}$/.test(stripped)) {
    return { valid: true, normalized: trimmed };
  }

  return { valid: false, normalized: trimmed, reason: 'invalidFormat' };
}

export function normalizeTelegramHandle(raw: string): string {
  const trimmed = clampText(raw, FIELD_LIMITS.telegramMax);
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

export function sanitizeBusinessProfile(profile: BusinessProfile): BusinessProfile {
  const exchangeRate = Number(profile.exchangeRate);
  return {
    name: clampText(profile.name || '', FIELD_LIMITS.businessNameMax),
    ownerName: clampText(profile.ownerName || '', FIELD_LIMITS.ownerNameMax),
    phone: clampText(profile.phone || '', FIELD_LIMITS.phoneMax),
    telegram: normalizeTelegramHandle(profile.telegram || ''),
    address: clampText(profile.address || '', FIELD_LIMITS.addressMax),
    province: clampText(profile.province || '', FIELD_LIMITS.provinceMax),
    logo:
      typeof profile.logo === 'string' && profile.logo.startsWith('data:image/')
        ? profile.logo
        : '',
    defaultCurrency:
      profile.defaultCurrency === 'KHR' || profile.defaultCurrency === 'both'
        ? profile.defaultCurrency
        : 'USD',
    exchangeRate:
      Number.isFinite(exchangeRate) && exchangeRate >= 100 && exchangeRate <= 50000
        ? Math.round(exchangeRate)
        : DEFAULT_EXCHANGE_RATE_KHR,
    updatedAt: profile.updatedAt,
  };
}

/**
 * Validates the onboarding / settings business profile form.
 * Returns translation keys under the 'onboarding' namespace for any invalid fields.
 */
export function validateBasicInfo(profile: BusinessProfile): {
  valid: boolean;
  errors: ValidationErrors;
  sanitized: BusinessProfile;
} {
  const errors: ValidationErrors = {};

  const trimmedName = trimText(profile.name || '');
  if (!trimmedName) {
    errors.name = 'errors.businessNameRequired';
  } else if (countChars(trimmedName) > FIELD_LIMITS.businessNameMax) {
    errors.name = 'errors.businessNameTooLong';
  }

  const trimmedOwner = trimText(profile.ownerName || '');
  if (trimmedOwner && countChars(trimmedOwner) > FIELD_LIMITS.ownerNameMax) {
    errors.ownerName = 'errors.ownerNameTooLong';
  }

  const phoneCheck = validateCambodianPhone(profile.phone || '');
  if (!phoneCheck.valid) {
    if (phoneCheck.reason === 'required') {
      errors.phone = 'errors.phoneRequired';
    } else if (phoneCheck.reason === 'tooLong') {
      errors.phone = 'errors.phoneTooLong';
    } else {
      errors.phone = 'errors.phoneInvalid';
    }
  }

  const trimmedTelegram = trimText(profile.telegram || '');
  if (trimmedTelegram) {
    if (countChars(trimmedTelegram) > FIELD_LIMITS.telegramMax) {
      errors.telegram = 'errors.telegramTooLong';
    } else {
      const handleBody = trimmedTelegram.replace(/^@/, '');
      if (!/^[a-zA-Z0-9_]{3,40}$/.test(handleBody)) {
        errors.telegram = 'errors.telegramInvalid';
      }
    }
  }

  const trimmedAddress = trimText(profile.address || '');
  if (trimmedAddress && countChars(trimmedAddress) > FIELD_LIMITS.addressMax) {
    errors.address = 'errors.addressTooLong';
  }

  if (profile.defaultCurrency === 'both') {
    const rateNum = Number(profile.exchangeRate);
    if (!Number.isFinite(rateNum) || rateNum < 1000 || rateNum > 20000) {
      errors.exchangeRate = 'errors.exchangeRateInvalid';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: sanitizeBusinessProfile(profile),
  };
}

/**
 * Resizes and compresses an uploaded image file to a lightweight square-bounded Data URL.
 */
export function resizeLogoFileToDataUrl(
  file: File,
  maxDimension = 220
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read logo file'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('Empty logo file'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const webp = canvas.toDataURL('image/webp', 0.82);
        if (webp.startsWith('data:image/webp')) {
          resolve(webp);
        } else {
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
