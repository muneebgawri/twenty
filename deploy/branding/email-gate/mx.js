'use strict';

// Can this domain receive mail at all?
//
// This is the only question asked over the network, and it runs on the synchronous write
// path of every record that carries an email address. Three properties follow from that,
// and each one is load-bearing:
//
//   1. It answers "definitely not" or "don't know". Never "definitely yes" — proving a
//      MAILBOX exists needs an SMTP probe, which belongs nowhere near a save.
//   2. It fails OPEN. A DNS timeout, a SERVFAIL, a resolver outage: all of those mean the
//      save goes through. The alternative is a CRM that refuses to store contacts because
//      a nameserver is having a bad minute, which is a far worse failure than letting a
//      dead address through to be caught later.
//   3. It caches, because people share domains. A hundred journalists at one publication
//      is one lookup.
//
// WHY THE A-RECORD FALLBACK MATTERS. RFC 5321 §5.1 says that when a domain has no MX
// record, its A/AAAA record is treated as an implicit mail exchanger. Plenty of real
// domains rely on that — example.com among them. A gate that rejected "no MX" alone would
// refuse addresses that genuinely receive mail, and it would do it at the moment someone
// is trying to save a contact. So a domain is only ever called undeliverable when it has
// neither an MX record nor an address record: nothing to deliver to, by any route.

const dns = require('node:dns').promises;

/** Definitive answers only. A transient failure must never be remembered. */
const cache = new Map();
const MAX_ENTRIES = 20000;

/** A domain that accepts mail rarely stops. A domain that does not may be one DNS change
 *  away from accepting it, and we are blocking saves on the answer, so it is re-checked
 *  far more often. */
const TTL_DELIVERABLE_MS = 6 * 60 * 60 * 1000;
const TTL_UNDELIVERABLE_MS = 30 * 60 * 1000;

const LOOKUP_TIMEOUT_MS = Number(process.env.PINION_EMAIL_GATE_DNS_TIMEOUT_MS || 2500);

function remember(domain, deliverable) {
  if (cache.size >= MAX_ENTRIES) {
    // Oldest insertion first. An exact LRU is not worth the bookkeeping here.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(domain, {
    deliverable,
    expires: Date.now() + (deliverable ? TTL_DELIVERABLE_MS : TTL_UNDELIVERABLE_MS),
  });
}

function cached(domain) {
  const hit = cache.get(domain);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(domain);
    return undefined;
  }
  return hit.deliverable;
}

/** Reject the whole lookup rather than let one slow resolver hold a save open. */
function withTimeout(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('dns timeout')), LOOKUP_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** DNS errors split three ways, and only one of them is evidence.
 *  NOTFOUND/NODATA mean the resolver answered and there is nothing there. Everything else
 *  — SERVFAIL, REFUSED, EAI_AGAIN, a timeout — means we did not get an answer. */
function isAbsence(err) {
  return err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA');
}

/**
 * RFC 7505: a single MX record of preference 0 pointing at "." is a domain explicitly
 * declaring that it accepts no mail. It is the clearest possible statement of the thing
 * this module is trying to establish, and reading it as "has an MX, therefore fine" gets
 * the answer exactly backwards.
 *
 * example.com is published this way, which is how this was caught — the unit tests used a
 * fake resolver and agreed with the bug.
 */
function isNullMx(records) {
  if (!Array.isArray(records) || records.length !== 1) return false;
  const exchange = String(records[0] && records[0].exchange || '').trim();
  return exchange === '' || exchange === '.';
}

async function hasRecords(lookup, domain) {
  try {
    const records = await withTimeout(lookup(domain));
    return Array.isArray(records) && records.length > 0 ? 'yes' : 'no';
  } catch (err) {
    return isAbsence(err) ? 'no' : 'unknown';
  }
}

/** The real resolver. Injectable so the three-way answer logic — present, absent, no
 *  answer at all — can be tested without a network, which is the part that decides whether
 *  a save is refused. */
const systemResolver = {
  mx: (d) => dns.resolveMx(d),
  a: (d) => dns.resolve4(d),
  aaaa: (d) => dns.resolve6(d),
};

/**
 * True only when the domain provably cannot receive mail.
 *
 * Anything short of proof — including every kind of resolver trouble — returns false, and
 * the address is allowed through.
 */
async function cannotReceiveMail(domain, resolver = systemResolver) {
  if (!domain) return false;

  const known = cached(domain);
  if (known !== undefined) return !known;

  // Fetched rather than reduced to yes/no, because a null MX is a "yes, there are records"
  // that means the opposite of what every other MX answer means.
  let mxRecords = null;
  try {
    mxRecords = await withTimeout(resolver.mx(domain));
  } catch (err) {
    if (!isAbsence(err)) return false; // no answer is not an answer
  }

  if (isNullMx(mxRecords)) {
    remember(domain, false); // the domain says so itself
    return true;
  }

  if (Array.isArray(mxRecords) && mxRecords.length > 0) {
    remember(domain, true);
    return false;
  }

  // No MX. RFC 5321 §5.1: an address record is an implicit mail exchanger, so this is not
  // yet a verdict.
  const a = await hasRecords(resolver.a, domain);
  if (a === 'yes') {
    remember(domain, true);
    return false;
  }
  if (a === 'unknown') return false;

  const aaaa = await hasRecords(resolver.aaaa, domain);
  if (aaaa === 'yes') {
    remember(domain, true);
    return false;
  }
  if (aaaa === 'unknown') return false;

  // No MX, no A, no AAAA, and the resolver answered every time. Nothing to deliver to.
  remember(domain, false);
  return true;
}

module.exports = {
  cannotReceiveMail,
  // Exported for the tests, and for an operator who wants to clear a verdict after fixing
  // a domain's DNS rather than waiting out the TTL.
  _cache: cache,
  _clear: () => cache.clear(),
};
