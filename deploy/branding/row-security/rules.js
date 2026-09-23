'use strict';

// Which records a restricted role may read, per object.
//
// Modes:
//   own(fieldName)   - the object has a MANY_TO_ONE relation to workspaceMember;
//                      only rows whose join column equals the current member.
//   creator          - only rows whose createdBy actor is the current member.
//   via(fieldNames)  - join/child tables with no owner of their own: visible when
//                      ANY listed parent relation points at a row the member may
//                      read. Keeps an AM's own notes and tasks attached to their
//                      people instead of vanishing.
//   linked(collection, targets)
//                    - the mirror of via(): visible when a CHILD row hangs off a
//                      record the member may read. `targets` names the child's
//                      relations to follow (a join table such as noteTarget);
//                      an empty list means the child carries its own rule.
//   anyOf(rules)     - readable when any listed rule allows it.
//   visible          - readable by everyone. Only for objects that carry no
//                      customer data.
//   hidden           - no rows.
//
// Why `linked` exists: prod's notes are all written by the inbound-leads
// integration, so `creator` alone hid every lead note from the Account Manager
// whose contact it was filed against. Ownership lives on `person`; everything
// else has to be reached through it.
//
// Anything absent from this map is HIDDEN. That is deliberate: when an upgrade
// adds an object, a restricted role sees nothing from it (visible, reportable)
// rather than everything (silent leak). classify.test.js fails when the live
// workspace has an object this file does not mention.

const OWN = (fieldName) => ({ mode: 'own', fieldName });
const VIA = (...fieldNames) => ({ mode: 'via', fieldNames });
const LINKED = (collectionFieldName, ...targetFieldNames) => ({
  mode: 'linked',
  collectionFieldName,
  targetFieldNames,
});
// "readable because the record it hangs off is readable". Unlike via(), which
// requires the parent to be own/creator, parent() evaluates the parent's own
// rule in full — so it can reach a parent that is itself reached through a
// child collection. It may only appear at the top level; nested inside another
// rule it denies, which bounds the recursion at two EXISTS.
const PARENT = (fieldName) => ({ mode: 'parent', fieldName });
const ANY_OF = (...rules) => ({ mode: 'anyOf', rules });
const CREATOR = { mode: 'creator' };
const VISIBLE = { mode: 'visible' };
const HIDDEN = { mode: 'hidden' };

// The records an AM works from. Everything else is reached through these.
const RECORD_TARGETS = ['targetPerson', 'targetCompany', 'targetOpportunity'];

const RULES = {
  // --- owned records -------------------------------------------------------
  // CREATOR is load-bearing, not a nicety. Twenty's "New Person" button INSERTS
  // an empty record first and then opens it, and that record has no owner yet.
  // Without a creator branch the member cannot read the row they just created:
  // the form fails to load, an error toast appears, and an empty shell is left
  // behind. 2026-09-16..18 that happened to at least 12 people — Kate 9 times,
  // Jonah 8, Max 4 — and every one of them simply could not add a contact.
  //
  // The same applies to every object with a "New" button, so company,
  // opportunity and task carry it too. A record you created is yours to see.
  person: ANY_OF(OWN('personOwner'), CREATOR),
  // Only 13 of 14k companies and 1.7k of 94k opportunities carry an owner, so
  // ownership alone would leave both lists empty. A company the member has a
  // contact at, and an opportunity whose point of contact is theirs, are part
  // of that member's book of business.
  company: ANY_OF(OWN('accountOwner'), LINKED('people'), CREATOR),
  opportunity: ANY_OF(OWN('owner'), VIA('pointOfContact'), CREATOR),
  task: ANY_OF(OWN('assignee'), LINKED('taskTargets', ...RECORD_TARGETS), CREATOR),
  blocklist: OWN('workspaceMember'),

  // The activity feed on a record page. Keyed on who performed the action, it
  // showed an Account Manager nothing at all: of 405,581 rows on prod only
  // 4,091 carry a workspace member, because the integrations and the system do
  // almost all of the writing. An activity is about a record, so it is read
  // through the record — the member sees the history of their own contacts,
  // plus anything they did themselves.
  timelineActivity: ANY_OF(OWN('workspaceMember'), VIA(...RECORD_TARGETS)),

  calendarEventParticipant: OWN('workspaceMember'),

  // A participant on a message the member may read — which, per the `message`
  // rule below, means a message they took part in. Their own correspondence,
  // and both ends of it.
  //
  // 2026-09-15: this was OWN('workspaceMember') alone. External participants
  // carry a handle and no workspace member, so the counterparty on the
  // member's own email was invisible. The frontend computes
  // `receivers = participants.filter(role !== 'FROM')` and renders NOTHING for
  // a message with no receivers (EmailThreadMessage.tsx:62), so an Account
  // Manager opening their own thread got a blank panel: no error, no loader,
  // no clue. The bodies were arriving in the response the whole time.
  //
  // OWN stays as the first branch so a participant row pointing at the member
  // is readable even on a message the message-rule would not admit.
  messageParticipant: ANY_OF(OWN('workspaceMember'), PARENT('message')),

  // --- authored by the member, or filed against their records --------------
  note: ANY_OF(CREATOR, LINKED('noteTargets', ...RECORD_TARGETS)),

  // A dashboard is a definition, not data: its widgets query records through
  // this same filter, so two people opening one see their own numbers. Keyed on
  // the creator it was simply empty for everyone else — 0 of the dashboards on
  // prod carry one.
  dashboard: VISIBLE,

  // --- authored by the member ---------------------------------------------
  workflow: CREATOR,
  leadView: CREATOR,
  inboundFailedLead: CREATOR,
  inboundTestLead: CREATOR,
  messageCampaign: CREATOR,
  messageList: CREATOR,

  // --- reachable through a parent -----------------------------------------
  // These tables link records through MORPH relations (one field, several
  // target*Id columns), which carry no single MANY_TO_ONE relation we can
  // follow. So they are reached through the concrete parent they do have
  // (note, task, workflow), or fall back to the creator.
  // A link row is visible when it points at a record the member may read. It
  // must NOT be reached through its note/task, which are themselves reached
  // through these rows — that would be circular.
  noteTarget: VIA(...RECORD_TARGETS),
  taskTarget: VIA(...RECORD_TARGETS),
  messageListMember: VIA('list', 'person'),
  callRecording: VIA('openPhonePerson'),
  workflowVersion: VIA('workflow'),
  workflowRun: VIA('workflowVersion', 'workflow'),
  workflowAutomatedTrigger: VIA('workflow'),

  // Files the member uploaded, plus files on a record they may read.
  attachment: ANY_OF(CREATOR, VIA(...RECORD_TARGETS)),

  // --- no customer data ----------------------------------------------------
  // Needed to render owner/assignee names and pickers.
  workspaceMember: VISIBLE,

  // "Is this email already assigned, and to whom?" Row-security limits an AM to
  // the contacts they own, so searching for a colleague's contact returns
  // nothing — indistinguishable from "nobody has this one", which is the
  // opposite conclusion and sends two AMs after the same client.
  //
  // The first answer to that was to make the whole directory VISIBLE, on the
  // reasoning that it is minimum information by construction — an email, an
  // owner, a timestamp, nothing to leak. That reasoning was about the wrong
  // unit. Each ROW is harmless; the TABLE is not. 147,683 rows carrying owner
  // addresses, sortable by owner, is a complete map of every colleague's book —
  // the shopping list for exactly the behaviour this was meant to discourage.
  // A browsable index is strictly more power than the question requires.
  //
  // So the directory is no longer the interface. It stays as the backing table
  // for the lookup below and is HIDDEN from restricted roles. Explicit rather
  // than omitted: an absent key already means hidden, but a reader who finds no
  // entry cannot tell a deliberate decision from an oversight.
  leadLookup: HIDDEN,

  // The interface. An AM enters one email, a trigger fills in the answer, and
  // CREATOR scopes the object to its author so each AM sees only their own
  // lookups. Same answer as the directory gave, with no index behind it — and
  // because each lookup is now a record, "who has been checking whose book"
  // becomes a query rather than a blind spot.
  //
  // The key is the object's API name, so renaming the object in the UI renames
  // this key too. Get it wrong and the object is simply absent from this map,
  // which means HIDDEN — the lookup goes blank for every AM with no error to
  // explain why.
  leadLookupRequest: CREATOR,

  // A signature belongs to the mailbox its author connected, so CREATOR is the
  // exact rule rather than an approximation: the AM who writes one is the only
  // person it applies to. There is no owner column to use instead --
  // connectedAccount is not an object, so the row keys a plain TEXT
  // connectedAccountId and has no relation to follow.
  //
  // A signature is not sensitive the way a contact is, but it is personal and
  // there is no reason for AMs to read each other's. The app's own logic
  // functions read it under the app role, which this map does not constrain,
  // so scoping it here costs the send path nothing.
  emailSignature: CREATOR,

  // The shared logo, one row for the whole workspace. VISIBLE because every
  // Account Manager's signature renders it -- CREATOR would hide the admin's
  // row from everyone else and each signature would silently lose its logo,
  // which is exactly the uniformity this object exists to guarantee.
  //
  // It carries no customer data: a logo URL, a link, a width, and a footer
  // line that goes out on every outbound message anyway. Read is what is
  // granted here; who may EDIT it is a role question, not a row one.
  emailSignatureSetting: VISIBLE,

  // Journalists scraped by Crawlix. A shared research pool, not a book of
  // business: nobody owns a journalist, and two AMs pitching the same reporter
  // different clients is normal press relations rather than poaching. So
  // VISIBLE, unlike person.
  //
  // Nothing here is private in the way a contact is — it is a byline, a beat
  // and a publicly listed work address, which is what the outlet publishes on
  // purpose. Every row is scraped from a public page.
  journalist: VISIBLE,

  // --- mailbox contents ----------------------------------------------------
  // A message is readable only when the member is a participant on it — their
  // own correspondence, which they can already read in their mailbox. This is
  // also what makes the open and click counts on a sent message visible to the
  // person who sent it. Participants are matched to a workspace member by
  // handle, so a message nobody here took part in stays hidden.
  message: LINKED('messageParticipants'),

  // A thread is readable when it is filed against a record the member owns —
  // the email history on their own contact. Reaching it through its messages
  // instead would be circular, since a message is reached through its
  // participants.
  messageThread: LINKED('messageThreadTargets', ...RECORD_TARGETS),
  messageThreadTarget: VIA(...RECORD_TARGETS),

  // The link between a message and the mailbox it arrived in. It was filed
  // under "calendar contents" and hidden, which made every restricted role's
  // mailbox look empty: Twenty resolves a message's channel through this table
  // to decide whether the body may be shown, and when that lookup returns no
  // rows it DROPS the message from the response entirely
  // (ApplyMessagesVisibilityRestrictionsService). An Account Manager could
  // therefore read `message` — the rule above admits their own correspondence
  // — and still see a blank thread, because the row that proves which mailbox
  // it came from was invisible. Hiding it protected nothing and broke reading.
  //
  // VISIBLE rather than VIA('message'): `via` denies at depth > 0, and
  // `message` is itself a `linked` rule, so routing this through its message
  // hits that guard and denies. The row carries no customer data — ids, a
  // direction, and the provider's external message id. Reading a message still
  // requires passing the `message` rule above.
  messageChannelMessageAssociation: VISIBLE,

  // --- calendar contents ---------------------------------------------------
  // Still hidden: no ownership column, and nothing has asked for it.
  calendarEvent: HIDDEN,
  calendarEventTarget: HIDDEN,
  calendarChannelEventAssociation: HIDDEN,
  messageChannelMessageAssociationMessageFolder: HIDDEN,
};

module.exports = { RULES, OWN, VIA, LINKED, PARENT, ANY_OF, CREATOR, VISIBLE, HIDDEN };
