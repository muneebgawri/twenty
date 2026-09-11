import { describe, expect, it } from 'vitest';

import {
  nationalNumberCandidates,
  phoneMatches,
  toDialableNumber,
} from 'src/utils/phone-match';

describe('nationalNumberCandidates', () => {
  it('includes the national number for a one-digit calling code', () => {
    expect(nationalNumberCandidates('+15551234567')).toContain('5551234567');
  });

  it('includes the national number for two- and three-digit calling codes', () => {
    expect(nationalNumberCandidates('+447911123456')).toContain('7911123456');
    expect(nationalNumberCandidates('+353861234567')).toContain('861234567');
  });

  it('includes the full digits for numbers stored with the code folded in', () => {
    expect(nationalNumberCandidates('+15551234567')).toContain('15551234567');
  });

  it('returns nothing for input too short to be a phone number', () => {
    expect(nationalNumberCandidates('+12')).toEqual([]);
    expect(nationalNumberCandidates('')).toEqual([]);
  });
});

describe('phoneMatches', () => {
  it('matches Twenty’s split calling code + national number', () => {
    expect(
      phoneMatches('+15551234567', {
        primaryPhoneCallingCode: '+1',
        primaryPhoneNumber: '5551234567',
      }),
    ).toBe(true);
  });

  it('ignores formatting in the stored number', () => {
    expect(
      phoneMatches('+15551234567', {
        primaryPhoneCallingCode: '+1',
        primaryPhoneNumber: '(555) 123-4567',
      }),
    ).toBe(true);
  });

  it('does not match the same national number in another country', () => {
    expect(
      phoneMatches('+15551234567', {
        primaryPhoneCallingCode: '+44',
        primaryPhoneNumber: '5551234567',
      }),
    ).toBe(false);
  });

  it('matches a number saved with the country code included', () => {
    expect(
      phoneMatches('+15551234567', {
        primaryPhoneCallingCode: null,
        primaryPhoneNumber: '15551234567',
      }),
    ).toBe(true);
  });

  it('never matches an empty stored number', () => {
    expect(phoneMatches('+15551234567', { primaryPhoneNumber: '' })).toBe(false);
  });
});

describe('toDialableNumber', () => {
  it('prefixes the calling code', () => {
    expect(
      toDialableNumber({
        primaryPhoneCallingCode: '+44',
        primaryPhoneNumber: '7911 123456',
      }),
    ).toBe('+447911123456');
  });

  it('returns the bare number when there is no calling code', () => {
    expect(toDialableNumber({ primaryPhoneNumber: '5551234567' })).toBe(
      '5551234567',
    );
  });

  it('returns null when there is no number', () => {
    expect(toDialableNumber({ primaryPhoneCallingCode: '+1' })).toBeNull();
  });
});
