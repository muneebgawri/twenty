'use strict';

// Refuse to store an address that cannot receive mail.
//
// WHY THIS EXISTS AT ALL. An undeliverable address in the CRM is not a blank — it is worse
// than a blank. It looks like a way to reach someone, it gets exported, it gets loaded into
// a cold campaign, and the first anyone hears of it is a bounce against a sending domain
// that the whole company shares. A blank field asks to be filled in. A dead address asks to
// be used.
//
// WHAT IT WILL AND WILL NOT CLAIM. This runs inside a save, so the only checks allowed are
// the ones that are cheap, local, and PROVE something:
//
//   syntax      upstream already does it (zod), and still does — not duplicated here
//   disposable  a throwaway-inbox domain, from a static list. No I/O.
//   no route    the domain has no MX and no A/AAAA record, so no mail server exists to
//               deliver to by any route RFC 5321 allows.
//
// It does NOT decide whether a MAILBOX exists. That needs an SMTP conversation with the
// recipient's server, which takes seconds, shows our sender address to a third party, and
// has no business on a request that a human is waiting on. That verdict arrives separately
// and asynchronously, and is written to the record rather than gating it.
//
// FAILING OPEN IS THE DESIGN, NOT A COMPROMISE. Every unknown — a DNS timeout, a resolver
// outage, an unexpected value shape, a bug in this file — lets the save through. A CRM that
// cannot store a contact is broken in a way that stops work; a CRM that stored one bad
// address is the situation we were already in. The blast radius of this gate is capped at
// "no worse than before it existed", deliberately.

const mx = require('./mx');

/** Passing `undefined` through would defeat cannotReceiveMail's own default, so the
 *  argument is only forwarded when a caller actually supplied one. */
const cannotReceiveMail = (domain, resolver) =>
  resolver ? mx.cannotReceiveMail(domain, resolver) : mx.cannotReceiveMail(domain);
const { isDisposable } = require('./disposable');

/** Off switch that needs no rebuild.
 *
 *  This gate can refuse writes, and an overlay change here has cost an outage before. An
 *  operator seeing saves rejected must be able to stop it in the time it takes to restart a
 *  container, without waiting on a docker build and a registry push. */
const ENABLED = (process.env.PINION_EMAIL_GATE || 'on').toLowerCase() !== 'off';

/** Twenty's EMAILS composite, after transformEmailsValue has run: primary is a lowercased
 *  string, additional is a JSON-encoded array. Both are stored, so both are checked. */
function addressesIn(value) {
  if (!value || typeof value !== 'object') return [];

  const found = [];
  if (typeof value.primaryEmail === 'string' && value.primaryEmail.trim()) {
    found.push(value.primaryEmail.trim());
  }

  const additional = value.additionalEmails;
  try {
    const parsed = typeof additional === 'string' ? JSON.parse(additional) : additional;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry === 'string' && entry.trim()) found.push(entry.trim());
      }
    }
  } catch {
    // Not our field to police. Upstream owns the shape; a value we cannot read is a value
    // we have no opinion about.
  }

  return found;
}

function domainOf(address) {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1).toLowerCase();
}

/**
 * Why this write should be refused, or null to allow it.
 *
 * Returns a reason rather than throwing, so the injected call site builds the exception
 * with the class already in its own scope. Same split as row-security: this module decides,
 * the injection applies.
 *
 * Never throws. A bug in here must not become a failed save.
 */
async function reject(fieldMetadata, value, resolver) {
  try {
    if (!ENABLED) return null;
    if (!fieldMetadata || fieldMetadata.type !== 'EMAILS') return null;

    for (const address of addressesIn(value)) {
      const domain = domainOf(address);
      if (!domain) continue; // syntax is upstream's job, and it already ran

      if (isDisposable(domain)) {
        return `${address} is a disposable address. Mail sent there is discarded, and the inbox is gone within the hour.`;
      }

      if (await cannotReceiveMail(domain, resolver)) {
        return `${address} cannot receive mail: ${domain} has no mail server. Check the spelling of the domain.`;
      }
    }

    return null;
  } catch {
    return null; // fail open, always
  }
}

module.exports = { reject, _addressesIn: addressesIn, _domainOf: domainOf };
