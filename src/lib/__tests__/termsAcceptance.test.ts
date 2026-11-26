import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasVersionChanged,
  isAccepted,
  parseStoredTermsRecord,
  type TermsAcceptanceRecord,
} from '../termsAcceptance';

describe('isAccepted & terms record validation', () => {
  it('returns false on first launch when storedRecord is null or undefined', () => {
    assert.equal(isAccepted(null, '1.0'), false);
    assert.equal(isAccepted(undefined, '1.0'), false);
    assert.equal(hasVersionChanged(null, '1.0'), false);
    assert.equal(hasVersionChanged(undefined, '1.0'), false);
  });

  it('returns true when stored record matches current TERMS_VERSION', () => {
    const validRecord: TermsAcceptanceRecord = {
      accepted: true,
      termsVersion: '1.0',
      acceptedAt: '2026-11-24T05:00:00.000Z',
      language: 'km',
      analyticsConsent: false,
    };
    assert.equal(isAccepted(validRecord, '1.0'), true);
    assert.equal(isAccepted(JSON.stringify(validRecord), '1.0'), true);
    assert.equal(hasVersionChanged(validRecord, '1.0'), false);
  });

  it('returns false and flags versionChanged when TERMS_VERSION changed', () => {
    const oldRecord: TermsAcceptanceRecord = {
      accepted: true,
      termsVersion: '1.0',
      acceptedAt: '2026-10-01T10:30:00.000Z',
      language: 'en',
      analyticsConsent: false,
    };
    assert.equal(isAccepted(oldRecord, '1.1'), false);
    assert.equal(hasVersionChanged(oldRecord, '1.1'), true);
  });

  it('treats corrupted or tampered stored data as not accepted', () => {
    const corruptedPayloads: unknown[] = [
      'not-json-at-all',
      '{broken',
      '',
      123,
      [],
      true,
      {},
      { accepted: false, termsVersion: '1.0', acceptedAt: '2026-11-24T05:00:00.000Z', language: 'en' },
      { accepted: 'true', termsVersion: '1.0', acceptedAt: '2026-11-24T05:00:00.000Z', language: 'en' },
      { accepted: true, termsVersion: '', acceptedAt: '2026-11-24T05:00:00.000Z', language: 'en' },
      { accepted: true, termsVersion: 1.0, acceptedAt: '2026-11-24T05:00:00.000Z', language: 'en' },
      { accepted: true, termsVersion: '1.0', acceptedAt: 'not-a-date', language: 'en' },
      { accepted: true, termsVersion: '1.0', acceptedAt: '2026-11-24T05:00:00.000Z', language: 'fr' },
    ];

    for (const payload of corruptedPayloads) {
      assert.equal(parseStoredTermsRecord(payload), null);
      assert.equal(isAccepted(payload, '1.0'), false);
      assert.equal(hasVersionChanged(payload, '1.0'), false);
    }
  });

  it('defaults analyticsConsent to false for legacy records lacking the field', () => {
    const legacy = {
      accepted: true,
      termsVersion: '1.0',
      acceptedAt: '2026-10-01T10:30:00.000Z',
      language: 'en',
    };
    const parsed = parseStoredTermsRecord(legacy);
    assert.ok(parsed);
    assert.equal(parsed.analyticsConsent, false);
  });

  it('preserves analyticsConsent=true when stored explicitly and allows withdrawing without revoking Terms acceptance', async () => {
    const { withUpdatedAnalyticsConsent } = await import('../termsAcceptance');
    const optedIn = parseStoredTermsRecord({
      accepted: true,
      termsVersion: '1.1',
      acceptedAt: '2026-11-26T01:00:00.000Z',
      language: 'km',
      analyticsConsent: true,
    });
    assert.ok(optedIn);
    assert.equal(optedIn.analyticsConsent, true);
    assert.equal(isAccepted(optedIn, '1.1'), true);

    const optedOut = withUpdatedAnalyticsConsent(optedIn, false);
    assert.equal(optedOut.analyticsConsent, false);
    assert.equal(optedOut.accepted, true);
    assert.equal(optedOut.termsVersion, '1.1');
    assert.equal(isAccepted(optedOut, '1.1'), true);
    assert.equal(hasVersionChanged(optedOut, '1.1'), false);
  });

  it('triggers Terms review screen when upgrading from 1.0 to 1.1', () => {
    const prevAccepted = {
      accepted: true,
      termsVersion: '1.0',
      acceptedAt: '2026-11-24T05:00:00.000Z',
      language: 'en',
      analyticsConsent: false,
    };
    assert.equal(isAccepted(prevAccepted, '1.1'), false);
    assert.equal(hasVersionChanged(prevAccepted, '1.1'), true);
  });
});
