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
});
