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
  timelineActivity: OWN('workspaceMember'),
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

  // --- mailbox and calendar contents --------------------------------------
  // Hidden outright: these carry other people's correspondence and have no
  // ownership column of their own. Sync has been off since 2026-09-09 anyway.
  message: HIDDEN,
  messageThread: HIDDEN,
  calendarEvent: HIDDEN,
  calendarEventTarget: HIDDEN,
  messageThreadTarget: HIDDEN,
  calendarChannelEventAssociation: HIDDEN,
  messageChannelMessageAssociation: HIDDEN,
  messageChannelMessageAssociationMessageFolder: HIDDEN,
};

module.exports = { RULES, OWN, VIA, LINKED, ANY_OF, CREATOR, VISIBLE, HIDDEN };
