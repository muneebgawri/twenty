# Email deliverability gate

Refuses to **store** an address that provably cannot receive mail, on Person, Journalist
and every other object with an `EMAILS` field.

An undeliverable address in the CRM is worse than a blank one. A blank asks to be filled
in; a dead address looks like a way to reach someone, gets exported, gets loaded into a
cold campaign, and announces itself as a bounce against a sending domain the whole company
shares.

## What it checks

| Check | Cost | Where it comes from |
|---|---|---|
| syntax | free | upstream's own zod check, untouched |
| disposable domain | free, static list | copied from Herald's `DISPOSABLE_DOMAINS` |
| no route to any mail server | one cached DNS lookup | `mx.js` |

It does **not** decide whether a *mailbox* exists. That needs an SMTP conversation with the
recipient's server: seconds long, shows our sender address to a third party, and has no
business on a request a human is waiting on. That verdict comes from Herald asynchronously
and is written *to* the record rather than gating it.

### "No route" means no route

RFC 5321 §5.1 treats a domain's A/AAAA record as an implicit mail exchanger when it has no
MX. Real domains rely on that. So an address is refused only when the domain has **no MX,
no A and no AAAA**, with the resolver answering definitively every time.

## It fails open, on purpose

Every unknown allows the write: a DNS timeout, a SERVFAIL, an unrecognised value shape, a
bug in this module. A CRM that cannot store a contact stops people working and they cannot
route around it. A CRM that stored one bad address is the situation we were already in.

`PINION_EMAIL_GATE=off` disables it entirely — a container restart, no rebuild. Set that
first and investigate second if saves start being refused.

`PINION_EMAIL_GATE_DNS_TIMEOUT_MS` (default 2500) caps a single lookup.

## Where it hooks, and what it deliberately misses

`DataArgProcessorService.process()` — the one place every write funnels through: GraphQL and
REST, create and update, one record and many, standard objects and custom ones. One patch
covers Person, Journalist, and any `EMAILS` field added later.

A second patch makes `findDuplicates` opt out. That caller is a **read** — Twenty asks it
while you fill in a record, and the CSV importer dedupes through it. Refusing to *store* an
address and refusing to *look one up* are different things, and one bad row must not take
down an import of thousands. The opt-out is explicit rather than inferred, so a future
upstream caller is gated by default.

**Not covered: contacts auto-created from mailbox sync.** `create-person.service.ts` calls
`personRepository.insert()` directly and never touches the argument processor. That is a
safety property first — a correspondent on a dead domain cannot break a sync batch — and a
gap second: those rows arrive ungated and are left to the asynchronous verdict.

## Maintenance

The patch asserts each of its anchors appears exactly once and fails the image build
otherwise, so a Twenty upgrade cannot quietly ship an image where the gate is absent. Same
contract as `../row-security`, for the same reason. When an upgrade fails here, re-read the
compiled file rather than loosening the assertion — it is doing its job.

Run the tests: `node --test` in this directory. They are weighted towards proving addresses
are **allowed**, because a false positive here stops someone working and a false negative
only leaves us where we started.
