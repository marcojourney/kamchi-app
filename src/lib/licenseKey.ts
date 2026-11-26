import { verifyAsync as edVerifyAsync } from '@noble/ed25519';
import {
  LICENSE_EPOCH_UTC_MS,
  LICENSE_FORMAT_VERSION,
  LICENSE_KEY_PREFIX,
  LICENSE_PUBLIC_KEY_HEX,
  MS_PER_DAY,
} from '../config/license';

/**
 * Pure offline license key encoding, parsing, device-code hashing, and Ed25519 verification.
 *
 * SECURITY HONESTY NOTE:
 * Client-side signature verification stops accidental key sharing, tampering, and casual piracy,
 * but cannot stop a determined user from patching bundled JavaScript in their own browser.
 * Never log raw license keys or device secrets to console or telemetry.
 */

export type LicensePlanId = 'pro' | 'business';
export type LicenseBillingCycle = 'monthly' | 'yearly' | 'lifetime';

export interface LicensePayload {
  version: number;
  plan: LicensePlanId;
  billing: LicenseBillingCycle;
  issuedAtDay: number;
  expiresAtDay: number; // 0 means lifetime (no expiry)
  maxDevices: number;
  deviceCodeHash: Uint8Array; // 8 bytes; all 0x00 means unbound key
  keyId: Uint8Array; // 4 bytes
}

export type LicenseVerificationErrorCode =
  | 'empty_key'
  | 'invalid_format'
  | 'checksum_failed'
  | 'unsupported_version'
  | 'invalid_signature'
  | 'wrong_device';

export type LicenseVerificationResult =
  | {
      valid: true;
      payload: LicensePayload;
      keyIdHex: string;
      maskedKey: string;
      isBoundToDevice: boolean;
      canonicalKey: string;
    }
  | {
      valid: false;
      error: LicenseVerificationErrorCode;
    };

export const PAYLOAD_BYTE_LENGTH = 24;
export const SIGNATURE_BYTE_LENGTH = 64;
export const CHECKSUM_BYTE_LENGTH = 2;
export const TOTAL_LICENSE_BYTE_LENGTH =
  PAYLOAD_BYTE_LENGTH + SIGNATURE_BYTE_LENGTH + CHECKSUM_BYTE_LENGTH; // 90 bytes -> 144 base32 chars
export const DEVICE_CODE_HASH_LENGTH = 8;
export const KEY_ID_LENGTH = 4;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP: Record<string, number> = Object.fromEntries(
  Array.from(BASE32_ALPHABET).map((ch, idx) => [ch, idx])
);

function toTightArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) {
    return null;
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function encodeBase32(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input: string): Uint8Array | null {
  const clean = input.replace(/[\s-]+/g, '').toUpperCase();
  if (!clean) return null;

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const code = BASE32_LOOKUP[clean[i]];
    if (code === undefined) {
      return null;
    }
    value = (value << 5) | code;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    throw new Error('WebCrypto subtle.digest is required for SHA-256');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', toTightArrayBuffer(bytes));
  return new Uint8Array(digest);
}

export function encodePlanByte(plan: LicensePlanId): number {
  return plan === 'business' ? 2 : 1;
}

export function decodePlanByte(byteVal: number): LicensePlanId | null {
  if (byteVal === 1) return 'pro';
  if (byteVal === 2) return 'business';
  return null;
}

export function encodeBillingByte(billing: LicenseBillingCycle): number {
  if (billing === 'monthly') return 1;
  if (billing === 'yearly') return 2;
  return 3;
}

export function decodeBillingByte(byteVal: number): LicenseBillingCycle | null {
  if (byteVal === 1) return 'monthly';
  if (byteVal === 2) return 'yearly';
  if (byteVal === 3) return 'lifetime';
  return null;
}

export function encodeLicensePayload(payload: LicensePayload): Uint8Array {
  if (payload.deviceCodeHash.length !== DEVICE_CODE_HASH_LENGTH) {
    throw new Error(`deviceCodeHash must be ${DEVICE_CODE_HASH_LENGTH} bytes`);
  }
  if (payload.keyId.length !== KEY_ID_LENGTH) {
    throw new Error(`keyId must be ${KEY_ID_LENGTH} bytes`);
  }

  const buf = new Uint8Array(PAYLOAD_BYTE_LENGTH);
  const view = new DataView(buf.buffer);
  buf[0] = payload.version & 0xff;
  buf[1] = encodePlanByte(payload.plan);
  buf[2] = encodeBillingByte(payload.billing);
  view.setUint32(3, payload.issuedAtDay >>> 0, false);
  view.setUint32(7, payload.expiresAtDay >>> 0, false);
  buf[11] = Math.max(1, Math.min(255, Math.round(payload.maxDevices)));
  buf.set(payload.deviceCodeHash, 12);
  buf.set(payload.keyId, 20);
  return buf;
}

export function parseLicensePayload(
  bytes: Uint8Array
): { ok: true; payload: LicensePayload } | { ok: false; error: 'invalid_format' | 'unsupported_version' } {
  if (bytes.length !== PAYLOAD_BYTE_LENGTH) {
    return { ok: false, error: 'invalid_format' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[0];
  if (version !== LICENSE_FORMAT_VERSION) {
    return { ok: false, error: 'unsupported_version' };
  }

  const plan = decodePlanByte(bytes[1]);
  const billing = decodeBillingByte(bytes[2]);
  const maxDevices = bytes[11];

  if (!plan || !billing || maxDevices === 0) {
    return { ok: false, error: 'unsupported_version' };
  }

  const issuedAtDay = view.getUint32(3, false);
  const expiresAtDay = view.getUint32(7, false);
  const deviceCodeHash = bytes.slice(12, 20);
  const keyId = bytes.slice(20, 24);

  return {
    ok: true,
    payload: {
      version,
      plan,
      billing,
      issuedAtDay,
      expiresAtDay,
      maxDevices,
      deviceCodeHash,
      keyId,
    },
  };
}

export async function computeLicenseChecksum(payloadAndSignature: Uint8Array): Promise<Uint8Array> {
  const digest = await sha256(payloadAndSignature);
  return digest.slice(0, CHECKSUM_BYTE_LENGTH);
}

export function formatLicenseKeyGroups(base32Body: string): string {
  const clean = base32Body.replace(/[\s-]+/g, '').toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += 5) {
    groups.push(clean.slice(i, i + 5));
  }
  return `${LICENSE_KEY_PREFIX}-${groups.join('-')}`;
}

export async function encodeSignedLicenseKey(
  payloadBytes: Uint8Array,
  signatureBytes: Uint8Array
): Promise<string> {
  if (payloadBytes.length !== PAYLOAD_BYTE_LENGTH) {
    throw new Error('Invalid payload length');
  }
  if (signatureBytes.length !== SIGNATURE_BYTE_LENGTH) {
    throw new Error('Invalid signature length');
  }
  const combined = new Uint8Array(PAYLOAD_BYTE_LENGTH + SIGNATURE_BYTE_LENGTH);
  combined.set(payloadBytes, 0);
  combined.set(signatureBytes, PAYLOAD_BYTE_LENGTH);
  const checksum = await computeLicenseChecksum(combined);

  const full = new Uint8Array(TOTAL_LICENSE_BYTE_LENGTH);
  full.set(combined, 0);
  full.set(checksum, PAYLOAD_BYTE_LENGTH + SIGNATURE_BYTE_LENGTH);

  return formatLicenseKeyGroups(encodeBase32(full));
}

export function extractLicenseKeyFromText(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  // Match KC1-... token anywhere in pasted text or a .kamchi-license file
  const match = trimmed.match(/KC1-[A-Z2-7\-\s]+/i);
  if (match) {
    const cleanedBody = match[0].slice(4).replace(/[^A-Za-z2-7]/g, '').toUpperCase();
    if (cleanedBody.length > 0) {
      return formatLicenseKeyGroups(cleanedBody);
    }
  }
  return trimmed;
}

export function decodeLicenseKeyEnvelope(rawInput: string):
  | {
      ok: true;
      payloadBytes: Uint8Array;
      signatureBytes: Uint8Array;
      checksumBytes: Uint8Array;
      payloadAndSignature: Uint8Array;
      canonicalKey: string;
    }
  | {
      ok: false;
      error: 'empty_key' | 'invalid_format';
    } {
  const normalized = rawInput.trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized) {
    return { ok: false, error: 'empty_key' };
  }

  const prefixWithDash = `${LICENSE_KEY_PREFIX}-`;
  let body = normalized;
  if (body.startsWith(prefixWithDash)) {
    body = body.slice(prefixWithDash.length);
  } else if (body.startsWith(LICENSE_KEY_PREFIX)) {
    body = body.slice(LICENSE_KEY_PREFIX.length);
  } else {
    return { ok: false, error: 'invalid_format' };
  }

  const cleanBody = body.replace(/-/g, '');
  if (cleanBody.length !== 144) {
    return { ok: false, error: 'invalid_format' };
  }

  const decoded = decodeBase32(cleanBody);
  if (!decoded || decoded.length !== TOTAL_LICENSE_BYTE_LENGTH) {
    return { ok: false, error: 'invalid_format' };
  }

  const payloadAndSignature = decoded.slice(0, PAYLOAD_BYTE_LENGTH + SIGNATURE_BYTE_LENGTH);
  const payloadBytes = decoded.slice(0, PAYLOAD_BYTE_LENGTH);
  const signatureBytes = decoded.slice(
    PAYLOAD_BYTE_LENGTH,
    PAYLOAD_BYTE_LENGTH + SIGNATURE_BYTE_LENGTH
  );
  const checksumBytes = decoded.slice(PAYLOAD_BYTE_LENGTH + SIGNATURE_BYTE_LENGTH);

  return {
    ok: true,
    payloadBytes,
    signatureBytes,
    checksumBytes,
    payloadAndSignature,
    canonicalKey: formatLicenseKeyGroups(cleanBody),
  };
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function isZeroBytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

/**
 * Derives the short 10-char display device code ("ABCDE-FGHIJ") from the 32-byte device secret.
 */
export async function deriveDeviceCodeFromSecret(deviceSecret: Uint8Array): Promise<string> {
  const digest = await sha256(deviceSecret);
  const code10 = encodeBase32(digest).slice(0, 10);
  return `${code10.slice(0, 5)}-${code10.slice(5, 10)}`;
}

/**
 * Computes the 8-byte deviceCodeHash stored inside bound license keys.
 * Because this hashes the displayed Device Code (without dashes), the user can safely send
 * only their Device Code ("ABCDE-FGHIJ") to the seller on Telegram without ever exposing deviceSecret.
 */
export async function hashDeviceCode(deviceCode: string): Promise<Uint8Array> {
  const canonical = deviceCode.replace(/[\s-]+/g, '').toUpperCase();
  const encoded = new TextEncoder().encode(canonical);
  const digest = await sha256(encoded);
  return digest.slice(0, DEVICE_CODE_HASH_LENGTH);
}

/**
 * Verifies an Ed25519 signature using native WebCrypto where available,
 * falling back cleanly to @noble/ed25519.
 */
export async function verifyEd25519Signature(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) {
    return false;
  }

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    try {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        toTightArrayBuffer(publicKey),
        'Ed25519',
        false,
        ['verify']
      );
      const valid = await globalThis.crypto.subtle.verify(
        'Ed25519',
        cryptoKey,
        toTightArrayBuffer(signature),
        toTightArrayBuffer(message)
      );
      return Boolean(valid);
    } catch {
      // Runtime lacks native WebCrypto Ed25519; fall back to @noble/ed25519
    }
  }

  try {
    return await edVerifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function maskLicenseKey(rawKey: string): string {
  const canonical = extractLicenseKeyFromText(rawKey);
  const parts = canonical.split('-').filter(Boolean);
  if (parts.length < 3) {
    return `${LICENSE_KEY_PREFIX}-•••••`;
  }
  const tail = parts[parts.length - 1];
  return `${parts[0]}-•••••-•••••-•••••-${tail}`;
}

export async function verifyLicenseKey(
  rawInput: string,
  options: {
    deviceCode: string;
    publicKeyHex?: string;
  }
): Promise<LicenseVerificationResult> {
  const envelope = decodeLicenseKeyEnvelope(rawInput);
  if (!envelope.ok) {
    return { valid: false, error: envelope.error };
  }

  // 1. Typo/corruption detection BEFORE cryptographic signature check
  const expectedChecksum = await computeLicenseChecksum(envelope.payloadAndSignature);
  if (!constantTimeEqual(envelope.checksumBytes, expectedChecksum)) {
    return { valid: false, error: 'checksum_failed' };
  }

  // 2. Parse and validate versioned binary payload
  const parsed = parseLicensePayload(envelope.payloadBytes);
  if (!parsed.ok) {
    return { valid: false, error: parsed.error };
  }

  // 3. Verify Ed25519 signature over raw payload bytes
  const pubKeyBytes = hexToBytes(options.publicKeyHex || LICENSE_PUBLIC_KEY_HEX);
  if (!pubKeyBytes || pubKeyBytes.length !== 32) {
    return { valid: false, error: 'invalid_signature' };
  }

  const signatureOk = await verifyEd25519Signature(
    envelope.signatureBytes,
    envelope.payloadBytes,
    pubKeyBytes
  );
  if (!signatureOk) {
    return { valid: false, error: 'invalid_signature' };
  }

  // 4. Verify device binding (all-zero hash = unbound key valid on any device)
  const isUnbound = isZeroBytes(parsed.payload.deviceCodeHash);
  if (!isUnbound) {
    const localHash = await hashDeviceCode(options.deviceCode);
    if (!constantTimeEqual(parsed.payload.deviceCodeHash, localHash)) {
      return { valid: false, error: 'wrong_device' };
    }
  }

  return {
    valid: true,
    payload: parsed.payload,
    keyIdHex: bytesToHex(parsed.payload.keyId).toUpperCase(),
    maskedKey: maskLicenseKey(envelope.canonicalKey),
    isBoundToDevice: !isUnbound,
    canonicalKey: envelope.canonicalKey,
  };
}

export function dayNumberFromMs(epochMs: number): number {
  return Math.floor((epochMs - LICENSE_EPOCH_UTC_MS) / MS_PER_DAY);
}

export function dayNumberToDateIso(dayNumber: number): string {
  const ms = LICENSE_EPOCH_UTC_MS + dayNumber * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}
