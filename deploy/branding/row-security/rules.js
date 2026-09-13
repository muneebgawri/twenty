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
const ANY_OF = (...rules) => ({ mode: 'anyOf', rules });
const CREATOR = { mode: 'creator' };
const VISIBLE = { mode: 'visible' };
const HIDDEN = { mode: 'hidden' };

// The records an AM works from. Everything else is reached through these.
const RECORD_TARGETS = ['targetPerson', 'targetCompany', 'targetOpportunity'];

const RULES = {
  // --- owned records -------------------------------------------------------
  person: OWN('personOwner'),
  // Only 13 of 14k companies and 1.7k of 94k opportunities carry an owner, so
  // ownership alone would leave both lists empty. A company the member has a
  // contact at, and an opportunity whose point of contact is theirs, are part
  // of that member's book of business.
  company: ANY_OF(OWN('accountOwner'), LINKED('people')),
  opportunity: ANY_OF(OWN('owner'), VIA('pointOfContact')),
  task: ANY_OF(OWN('assignee'), LINKED('taskTargets', ...RECORD_TARGETS)),
  blocklist: OWN('workspaceMember'),

  // The activity feed on a record page. Keyed on who performed the action, it
  // showed an Account Manager nothing at all: of 405,581 rows on prod only
  // 4,091 carry a workspace member, because the integrations and the system do
  // almost all of the writing. An activity is about a record, so it is read
  // through the record — the member sees the history of their own contacts,
  // plus anything they did themselves.
  timelineActivity: ANY_OF(OWN('workspaceMember'), VIA(...RECORD_TARGETS)),

  calendarEventParticipant: OWN('workspaceMember'),
  messageParticipant: OWN('workspaceMember'),

  // --- authored by the member, or filed against their records --------------
  note: ANY_OF(CREATOR, LINKED('noteTargets', ...RECORD_TARGETS)),

  // --- authored by the member ---------------------------------------------
  dashboard: CREATOR,
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

  // --- calendar contents ---------------------------------------------------
  // Still hidden: no ownership column, and nothing has asked for it.
  calendarEvent: HIDDEN,
  calendarEventTarget: HIDDEN,
  calendarChannelEventAssociation: HIDDEN,
  messageChannelMessageAssociation: HIDDEN,
  messageChannelMessageAssociationMessageFolder: HIDDEN,
};

module.exports = { RULES, OWN, VIA, LINKED, ANY_OF, CREATOR, VISIBLE, HIDDEN };
