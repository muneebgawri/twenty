# Row security (our own, not Twenty's paid feature)

Restricts designated roles to the records they own. Account Managers see their
own people, companies, opportunities and tasks, the notes they wrote, and
nothing else.

Twenty ships row-level permissions on the Organization plan ($19/user/month,
self-hosted included). The code implementing it is marked `@license Enterprise`
and is not covered by the AGPL. This is an independent implementation written
against the open-source query layer; it does not enable, call or copy that code.

## How it works

`WorkspaceRepository#applyRowLevelPermissionPredicateForAlias` runs for the
queried table and for every joined alias. Patching that one method covers
GraphQL, REST, search, aggregates, exports and nested relations, because they
all reach the database through it.

For each alias the module decides, from `rules.js`:

| Mode | Condition |
|---|---|
| `own(field)` | the record's owner join column equals the current workspace member |
| `creator` | `createdByWorkspaceMemberId` equals the current member |
| `via(fields)` | EXISTS against a readable parent record (note, task, workflow…) |
| `visible` | no condition |
| `hidden` | `1 = 0` |

**It fails closed.** An object with no rule, a missing owner column, a principal
with no workspace member, or any thrown error all yield "no rows". A new object
added by an upgrade is invisible to restricted roles until someone classifies
it — noticeable, rather than a silent leak.

**It only ever narrows.** The module returns a condition that is ANDed onto the
query; it can never widen what a role may read.

## Configuration

`PINION_RESTRICTED_ROLE_IDS` — comma-separated role ids, passed to server and
worker. Unset means the patch does nothing, which is also the state of any
environment that has not opted in. Role ids differ per workspace:

```sql
select id, label from core.role where label = 'Account Manager';
```

Note that **API keys carrying a restricted role see nothing at all**, because an
API key has no workspace member to compare against. Integrations that need data
must use a role that is not restricted (Herald's key uses Admin).

## Verifying

`verify.sh <host> <admin-token> <restricted-token>` compares what an admin key
and a restricted key can read. Run it after every deploy and upgrade.

That proves the filter engages. It cannot prove the ownership path, because API
keys always hit the fail-closed branch — for that, sign in as an admin, use
Settings → Admin Panel to impersonate an Account Manager, and confirm:

- People shows only their own records, and the count matches
  `select count(*) from person where "personOwnerId" = '<member id>'`
- Search finds none of another AM's contacts
- Their own notes and tasks still appear on their records
- An admin still sees everything

## On upgrade

1. The image build fails if the hook moved. Do not work around it: re-read
   `applyRowLevelPermissionPredicateForAlias` upstream and re-fit the patch.
2. Run `check-coverage.js` against the live object list and classify anything
   new.
3. Run `verify.sh`, then repeat the impersonation check.

Upstream refactors this area (they own the paid equivalent), so treat every
upgrade as requiring a fresh check rather than an assumption.
