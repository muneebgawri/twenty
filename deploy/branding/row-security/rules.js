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
//   visible          - readable by everyone. Only for objects that carry no
//                      customer data.
//   hidden           - no rows.
//
// Anything absent from this map is HIDDEN. That is deliberate: when an upgrade
// adds an object, a restricted role sees nothing from it (visible, reportable)
// rather than everything (silent leak). classify.test.js fails when the live
// workspace has an object this file does not mention.

const OWN = (fieldName) => ({ mode: 'own', fieldName });
const VIA = (...fieldNames) => ({ mode: 'via', fieldNames });
const CREATOR = { mode: 'creator' };
const VISIBLE = { mode: 'visible' };
const HIDDEN = { mode: 'hidden' };

const RULES = {
  // --- owned records -------------------------------------------------------
  person: OWN('personOwner'),
  company: OWN('accountOwner'),
  opportunity: OWN('owner'),
  task: OWN('assignee'),
  blocklist: OWN('workspaceMember'),
  timelineActivity: OWN('workspaceMember'),
  calendarEventParticipant: OWN('workspaceMember'),
  messageParticipant: OWN('workspaceMember'),

  // --- authored by the member ---------------------------------------------
  note: CREATOR,
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
  noteTarget: VIA('note'),
  taskTarget: VIA('task'),
  messageListMember: VIA('list', 'person'),
  callRecording: VIA('openPhonePerson'),
  workflowVersion: VIA('workflow'),
  workflowRun: VIA('workflowVersion', 'workflow'),
  workflowAutomatedTrigger: VIA('workflow'),

  // Files the member uploaded. Attachments others added to a record the member
  // owns stay hidden; there is no ownership column on the attachment itself.
  attachment: CREATOR,

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

module.exports = { RULES, OWN, VIA, CREATOR, VISIBLE, HIDDEN };
