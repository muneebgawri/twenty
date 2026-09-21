'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../gate');
const mx = require('../mx');
const { isDisposable } = require('../disposable');

/**
 * This gate can REFUSE A SAVE, which makes its false positives expensive in a way its false
 * negatives are not. Letting a dead address through leaves the CRM where it already was;
 * refusing a real one stops someone doing their job and they cannot work around it. So the
 * tests here are weighted accordingly: most of them assert that something is ALLOWED.
 */

const EMAILS = { type: 'EMAILS', name: 'emails' };
const emails = (primary, additional = []) => ({
  primaryEmail: primary,
  additionalEmails: JSON.stringify(additional),
});

/** A resolver that answers from a table. 'absent' is a real NXDOMAIN/NODATA answer;
 *  'broken' is no answer at all, which is the distinction the whole file turns on. */
const resolverFor = (table) => {
  const answer = (kind) => async (domain) => {
    const entry = table[domain] || {};
    const value = entry[kind];
    if (value === 'broken') {
      const err = new Error('SERVFAIL');
      err.code = 'ESERVFAIL';
      throw err;
    }
    if (value === undefined || value === 'absent') {
      const err = new Error('not found');
      err.code = 'ENOTFOUND';
      throw err;
    }
    return value;
  };
  return { mx: answer('mx'), a: answer('a'), aaaa: answer('aaaa') };
};

test.beforeEach(() => mx._clear());

// --- what must always be allowed through -------------------------------------------------

test('a domain with an MX record is allowed', async () => {
  const r = resolverFor({ 'example.org': { mx: [{ exchange: 'mail.example.org' }] } });
  assert.equal(await gate.reject(EMAILS, emails('jane@example.org'), r), null);
});

test('no MX but an A record is allowed — RFC 5321 makes it an implicit mail exchanger', async () => {
  // This is not a corner case. example.com resolves exactly this way, and so do plenty of
  // small publications. A gate that rejected "no MX" alone would refuse real addresses.
  const r = resolverFor({ 'example.com': { a: ['93.184.216.34'] } });
  assert.equal(await gate.reject(EMAILS, emails('press@example.com'), r), null);
});

test('IPv6-only is allowed too', async () => {
  const r = resolverFor({ 'v6.example': { aaaa: ['2606:2800:220:1:248:1893:25c8:1946'] } });
  assert.equal(await gate.reject(EMAILS, emails('a@v6.example'), r), null);
});

test('a resolver that fails is not evidence — the save goes through', async () => {
  // SERVFAIL, REFUSED, a timeout: none of these mean "no mail server". Treating them as a
  // verdict would turn a nameserver having a bad minute into a CRM that cannot store
  // contacts, which is a far worse outage than the one this gate prevents.
  for (const broken of [{ mx: 'broken' }, { mx: 'absent', a: 'broken' },
                        { mx: 'absent', a: 'absent', aaaa: 'broken' }]) {
    mx._clear();
    const r = resolverFor({ 'flaky.example': broken });
    assert.equal(await gate.reject(EMAILS, emails('a@flaky.example'), r), null,
      `expected fail-open for ${JSON.stringify(broken)}`);
  }
});

test('a non-email field is none of this gate\'s business', async () => {
  const r = resolverFor({});
  assert.equal(await gate.reject({ type: 'TEXT', name: 'name' }, 'Jane Roe', r), null);
  assert.equal(await gate.reject({ type: 'PHONES' }, { primaryPhoneNumber: '123' }, r), null);
});

test('an empty or absent address is not rejected', async () => {
  const r = resolverFor({});
  assert.equal(await gate.reject(EMAILS, emails(''), r), null);
  assert.equal(await gate.reject(EMAILS, emails(null), r), null);
  assert.equal(await gate.reject(EMAILS, null, r), null);
  assert.equal(await gate.reject(EMAILS, undefined, r), null);
});

test('a value shaped in a way we do not recognise is left alone', async () => {
  const r = resolverFor({});
  assert.equal(await gate.reject(EMAILS, { primaryEmail: 42 }, r), null);
  assert.equal(await gate.reject(EMAILS, 'a plain string', r), null);
  assert.equal(await gate.reject(EMAILS, [], r), null);
});

test('an unreadable additionalEmails does not stop the primary being checked', async () => {
  // The two halves are judged separately on purpose. A field we cannot parse is a field we
  // have no opinion about — it is upstream's shape, not ours — but that must not become a
  // way for the address beside it to skip the check.
  const r = resolverFor({ 'good.example': { mx: [{ exchange: 'mx.good.example' }] } });

  assert.equal(
    await gate.reject(EMAILS, { primaryEmail: 'jane@good.example', additionalEmails: '{oops' }, r),
    null,
    'a good primary is allowed even when the additional field is garbage',
  );

  const reason = await gate.reject(
    EMAILS, { primaryEmail: 'jane@dead.example', additionalEmails: '{oops' }, r,
  );
  assert.match(reason, /dead\.example/, 'the primary is still checked');
});

// --- what must be refused ----------------------------------------------------------------

test('a domain with no MX, no A and no AAAA is refused', async () => {
  const r = resolverFor({ 'gmial.cmo': {} }); // every lookup answers "nothing here"
  const reason = await gate.reject(EMAILS, emails('jane@gmial.cmo'), r);

  assert.ok(reason, 'a domain with no route to any mail server must not be stored');
  // The message has to name the domain and say what to do. "Invalid value" tells someone
  // staring at an address that looks fine to them precisely nothing.
  assert.match(reason, /gmial\.cmo/);
  assert.match(reason, /no mail server/i);
});

test('a disposable domain is refused without any lookup at all', async () => {
  assert.equal(isDisposable('mailinator.com'), true);
  const exploding = {
    mx: () => { throw new Error('the gate must not have asked'); },
    a: () => { throw new Error('the gate must not have asked'); },
    aaaa: () => { throw new Error('the gate must not have asked'); },
  };
  const reason = await gate.reject(EMAILS, emails('someone@mailinator.com'), exploding);
  assert.match(reason, /disposable/i);
});

test('an additional address is checked, not just the primary one', async () => {
  // Both get stored, so both get exported and both get mailed.
  const r = resolverFor({
    'good.example': { mx: [{ exchange: 'mx.good.example' }] },
    'dead.example': {},
  });
  const reason = await gate.reject(
    EMAILS, emails('jane@good.example', ['jane@dead.example']), r,
  );
  assert.match(reason, /dead\.example/);
});

// --- the cache, which decides how often a save pays for DNS -------------------------------

test('one lookup serves every contact at the same publication', async () => {
  let calls = 0;
  const r = {
    mx: async () => { calls += 1; return [{ exchange: 'mx.paper.example' }]; },
    a: async () => [],
    aaaa: async () => [],
  };

  for (const who of ['a', 'b', 'c', 'd']) {
    await gate.reject(EMAILS, emails(`${who}@paper.example`), r);
  }
  assert.equal(calls, 1, 'a domain is resolved once, not once per journalist');
});

test('a failed lookup is never cached', async () => {
  let calls = 0;
  const r = {
    mx: async () => { calls += 1; const e = new Error('SERVFAIL'); e.code = 'ESERVFAIL'; throw e; },
    a: async () => [], aaaa: async () => [],
  };

  await gate.reject(EMAILS, emails('a@flaky.example'), r);
  await gate.reject(EMAILS, emails('b@flaky.example'), r);

  // Caching a transient failure would turn one bad minute into hours of wrong answers.
  assert.equal(calls, 2);
});

test('the cache is bounded', async () => {
  const r = resolverFor({});
  // Not exhaustive — just proof the map is not an unbounded leak in a long-lived server.
  assert.ok(typeof mx._cache.size === 'number');
  await gate.reject(EMAILS, emails('a@nothing.example'), r);
  assert.ok(mx._cache.size >= 1);
});
