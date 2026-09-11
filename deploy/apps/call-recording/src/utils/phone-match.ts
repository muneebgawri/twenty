// Twenty stores a phone as a calling code plus a national number
// (e.g. "+1" and "5551234567"), while OpenPhone sends E.164 ("+15551234567").
// Comparing the two strings directly never matches, so we derive the possible
// national numbers from the E.164 value and confirm each hit by digits.

const digitsOf = (value: string | null | undefined) =>
  (value ?? '').replace(/\D/g, '');

// Calling codes are one to three digits. Each split is a candidate national
// number; the full digit string also covers records saved with the country
// code folded into the number.
export const nationalNumberCandidates = (e164: string): string[] => {
  const digits = digitsOf(e164);

  if (digits.length < 7) {
    return [];
  }

  const candidates = new Set<string>([digits]);

  for (const callingCodeLength of [1, 2, 3]) {
    const national = digits.slice(callingCodeLength);

    if (national.length >= 6) {
      candidates.add(national);
    }
  }

  return [...candidates];
};

export const phoneMatches = (
  e164: string,
  stored: {
    primaryPhoneNumber?: string | null;
    primaryPhoneCallingCode?: string | null;
  },
): boolean => {
  const target = digitsOf(e164);
  const number = digitsOf(stored.primaryPhoneNumber);

  if (!target || !number) {
    return false;
  }

  return (
    `${digitsOf(stored.primaryPhoneCallingCode)}${number}` === target ||
    number === target
  );
};

// For dialing: "+1" + "5551234567" -> "+15551234567". Without the calling
// code the dialer assumes its own country, which is wrong for international
// contacts.
export const toDialableNumber = (stored: {
  primaryPhoneNumber?: string | null;
  primaryPhoneCallingCode?: string | null;
}): string | null => {
  const number = digitsOf(stored.primaryPhoneNumber);

  if (!number) {
    return null;
  }

  const callingCode = digitsOf(stored.primaryPhoneCallingCode);

  return callingCode ? `+${callingCode}${number}` : number;
};
