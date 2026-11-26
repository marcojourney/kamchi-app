import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPublicKeyAsync, signAsync } from '@noble/ed25519';
import {
  bytesToHex,
  decodeLicenseKeyEnvelope,
  deriveDeviceCodeFromSecret,
  encodeLicensePayload,
  encodeSignedLicenseKey,
  extractLicenseKeyFromText,
  hashDeviceCode,
  maskLicenseKey,
  parseLicensePayload,
  verifyLicenseKey,
  type LicensePayload,
} from '../licenseKey';

// TEST-ONLY throwaway private seed (32 bytes). Never used in production.
const TEST_PRIVATE_SEED = new Uint8Array(32).fill(7);
const OTHER_PRIVATE_SEED = new Uint8Array(32).fill(9);

async function makeSignedKey(
  overrides: Partial<LicensePayload> = {},
  privateSeed: Uint8Array = TEST_PRIVATE_SEED
): Promise<{ key: string; publicKeyHex: string }> {
  const publicKeyBytes = await getPublicKeyAsync(privateSeed);
  const payload: LicensePayload = {
    version: 1,
    plan: 'pro',
    billing: 'yearly',
    issuedAtDay: 300,
    expiresAtDay: 665,
    maxDevices: 1,
    deviceCodeHash: new Uint8Array(8),
    keyId: new Uint8Array([0x12, 0x34, 0xab, 0xcd]),
    ...overrides,
  };
  const payloadBytes = encodeLicensePayload(payload);
  const sig = await signAsync(payloadBytes, privateSeed);
  const key = await encodeSignedLicenseKey(payloadBytes, sig);
  return { key, publicKeyHex: bytesToHex(publicKeyBytes) };
}

describe('licenseKey module (encoding, verification & device binding)', () => {
  it('encodes, parses, masks, and verifies a valid unbound Pro yearly key', async () => {
    const { key, publicKeyHex } = await makeSignedKey({
      plan: 'pro',
      billing: 'yearly',
      expiresAtDay: 900,
    });

    assert.equal(key.startsWith('KC1-'), true);
    const masked = maskLicenseKey(key);
    assert.equal(masked.includes('•••••'), true);
    assert.notEqual(masked, key);

    const res = await verifyLicenseKey(key, {
      deviceCode: 'ABCDE-FGHIJ',
      publicKeyHex,
    });
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.payload.plan, 'pro');
      assert.equal(res.payload.billing, 'yearly');
      assert.equal(res.payload.expiresAtDay, 900);
      assert.equal(res.keyIdHex, '1234ABCD');
      assert.equal(res.isBoundToDevice, false);
    }
  });

  it('derives deterministic device code from secret and verifies device-bound keys', async () => {
    const secretA = new Uint8Array(32).fill(1);
    const secretB = new Uint8Array(32).fill(2);
    const codeA = await deriveDeviceCodeFromSecret(secretA);
    const codeB = await deriveDeviceCodeFromSecret(secretB);

    assert.match(codeA, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    assert.notEqual(codeA, codeB);

    const hashA = await hashDeviceCode(codeA);
    const { key, publicKeyHex } = await makeSignedKey({
      plan: 'business',
      billing: 'lifetime',
      expiresAtDay: 0,
      maxDevices: 3,
      deviceCodeHash: hashA,
    });

    const okOnA = await verifyLicenseKey(key, { deviceCode: codeA, publicKeyHex });
    assert.equal(okOnA.valid, true);
    if (okOnA.valid) {
      assert.equal(okOnA.payload.plan, 'business');
      assert.equal(okOnA.payload.billing, 'lifetime');
      assert.equal(okOnA.isBoundToDevice, true);
    }

    const rejectedOnB = await verifyLicenseKey(key, { deviceCode: codeB, publicKeyHex });
    assert.equal(rejectedOnB.valid, false);
    if (!rejectedOnB.valid) {
      assert.equal(rejectedOnB.error, 'wrong_device');
    }
  });

  it('detects typos via checksum before signature verification', async () => {
    const { key, publicKeyHex } = await makeSignedKey();
    const lastChar = key[key.length - 1];
    const alteredLastChar = lastChar === 'A' ? 'B' : 'A';
    const typoKey = key.slice(0, -1) + alteredLastChar;

    const res = await verifyLicenseKey(typoKey, {
      deviceCode: 'ABCDE-FGHIJ',
      publicKeyHex,
    });
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.equal(res.error, 'checksum_failed');
    }
  });

  it('rejects keys signed with a different private key', async () => {
    const { key } = await makeSignedKey({}, OTHER_PRIVATE_SEED);
    const expectedPubHex = bytesToHex(await getPublicKeyAsync(TEST_PRIVATE_SEED));

    const res = await verifyLicenseKey(key, {
      deviceCode: 'ABCDE-FGHIJ',
      publicKeyHex: expectedPubHex,
    });
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.equal(res.error, 'invalid_signature');
    }
  });

  it('rejects malformed, empty, and unsupported version keys safely', async () => {
    const expectedPubHex = bytesToHex(await getPublicKeyAsync(TEST_PRIVATE_SEED));

    const emptyRes = await verifyLicenseKey('   ', {
      deviceCode: 'ABCDE-FGHIJ',
      publicKeyHex: expectedPubHex,
    });
    assert.equal(emptyRes.valid, false);
    if (!emptyRes.valid) assert.equal(emptyRes.error, 'empty_key');

    const badPrefix = await verifyLicenseKey('BAD-AAAAA-BBBBB', {
      deviceCode: 'ABCDE-FGHIJ',
      publicKeyHex: expectedPubHex,
    });
    assert.equal(badPrefix.valid, false);
    if (!badPrefix.valid) assert.equal(badPrefix.error, 'invalid_format');

    // Unsupported version payload with valid checksum and signature
    const badVersionPayload = encodeLicensePayload({
      version: 9,
      plan: 'pro',
      billing: 'monthly',
      issuedAtDay: 100,
      expiresAtDay: 130,
      maxDevices: 1,
      deviceCodeHash: new Uint8Array(8),
      keyId: new Uint8Array([1, 2, 3, 4]),
    });
    const sig = await signAsync(badVersionPayload, TEST_PRIVATE_SEED);
    const futureKey = await encodeSignedLicenseKey(badVersionPayload, sig);
    const futureRes = await verifyLicenseKey(futureKey, {
      deviceCode: 'ABCDE-FGHIJ',
      publicKeyHex: expectedPubHex,
    });
    assert.equal(futureRes.valid, false);
    if (!futureRes.valid) assert.equal(futureRes.error, 'unsupported_version');
  });

  it('extracts a KC1 key cleanly from a .kamchi-license text file with comments', async () => {
    const { key, publicKeyHex } = await makeSignedKey();
    const fileContent = [
      '# KamChi Offline License File',
      '# Keep this file in a safe place',
      '',
      key,
      '',
    ].join('\n');

    const extracted = extractLicenseKeyFromText(fileContent);
    const env = decodeLicenseKeyEnvelope(extracted);
    assert.equal(env.ok, true);

    const parsed = env.ok ? parseLicensePayload(env.payloadBytes) : null;
    assert.equal(parsed?.ok, true);

    const verified = await verifyLicenseKey(extracted, {
      deviceCode: 'ABCDE-FGHIJ',
      publicKeyHex,
    });
    assert.equal(verified.valid, true);
  });
});
