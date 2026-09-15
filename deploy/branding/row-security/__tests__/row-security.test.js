'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');

const { buildCondition, DENY_ALL } = require('../row-security');

const ROLE_AM = '11111111-1111-4111-8111-111111111111';
const ROLE_ADMIN = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';

const shape = ({ name, columns = [], relations = {}, table = name }) => ({
  objectMetadataId: `id-${name}`,
  nameSingular: name,
  schemaName: 'workspace_test',
  tableName: table,
  columnNames: ['id', ...columns],
  relationShapeByFieldName: relations,
  columnShapeByColumnName: {},
  hasDeletedAtColumn: true,
});

const PERSON = shape({
  name: 'person',
  columns: ['personOwnerId', 'companyId', 'createdByWorkspaceMemberId'],
  relations: {
    personOwner: { joinColumnName: 'personOwnerId', targetObjectMetadataId: 'id-workspaceMember' },
    company: {
      fieldMetadataId: 'field-person-company',
      joinColumnName: 'companyId',
      targetObjectMetadataId: 'id-company',
    },
  },
});
const NOTE = shape({
  name: 'note',
  columns: ['createdByWorkspaceMemberId'],
  relations: {
    noteTargets: {
      targetObjectMetadataId: 'id-noteTarget',
      targetFieldMetadataId: 'field-noteTarget-note',
    },
  },
});
const NOTE_TARGET = shape({
  name: 'noteTarget',
  columns: ['noteId', 'targetPersonId'],
  relations: {
    note: {
      fieldMetadataId: 'field-noteTarget-note',
      joinColumnName: 'noteId',
      targetObjectMetadataId: 'id-note',
    },
    targetPerson: { joinColumnName: 'targetPersonId', targetObjectMetadataId: 'id-person' },
  },
});
const COMPANY = shape({
  name: 'company',
  columns: ['accountOwnerId'],
  relations: {
    accountOwner: { joinColumnName: 'accountOwnerId', targetObjectMetadataId: 'id-workspaceMember' },
    people: {
      targetObjectMetadataId: 'id-person',
      targetFieldMetadataId: 'field-person-company',
    },
  },
});
const MESSAGE_LIST = shape({ name: 'messageList', columns: ['createdByWorkspaceMemberId'] });
const LIST_MEMBER = shape({
  name: 'messageListMember',
  columns: ['listId', 'personId'],
  relations: {
    list: { joinColumnName: 'listId', targetObjectMetadataId: 'id-messageList' },
    person: { joinColumnName: 'personId', targetObjectMetadataId: 'id-person' },
  },
});
const TIMELINE_ACTIVITY = shape({
  name: 'timelineActivity',
  columns: ['workspaceMemberId', 'targetPersonId'],
  relations: {
    workspaceMember: { joinColumnName: 'workspaceMemberId', targetObjectMetadataId: 'id-workspaceMember' },
    targetPerson: { joinColumnName: 'targetPersonId', targetObjectMetadataId: 'id-person' },
  },
});
const MESSAGE = shape({
  name: 'message',
  columns: ['messageThreadId'],
  relations: {
    messageParticipants: {
      targetObjectMetadataId: 'id-messageParticipant',
      targetFieldMetadataId: 'field-messageParticipant-message',
    },
  },
});
const MESSAGE_PARTICIPANT = shape({
  name: 'messageParticipant',
  columns: ['messageId', 'workspaceMemberId'],
  relations: {
    message: {
      fieldMetadataId: 'field-messageParticipant-message',
      joinColumnName: 'messageId',
      targetObjectMetadataId: 'id-message',
    },
    workspaceMember: {
      joinColumnName: 'workspaceMemberId',
      targetObjectMetadataId: 'id-workspaceMember',
    },
  },
});
const MESSAGE_CHANNEL_ASSOCIATION = shape({
  name: 'messageChannelMessageAssociation',
  columns: ['messageId', 'messageChannelId'],
  relations: {
    message: { joinColumnName: 'messageId', targetObjectMetadataId: 'id-message' },
  },
});
const MESSAGE_THREAD = shape({
  name: 'messageThread',
  relations: {
    messageThreadTargets: {
      targetObjectMetadataId: 'id-messageThreadTarget',
      targetFieldMetadataId: 'field-messageThreadTarget-thread',
    },
  },
});
const MESSAGE_THREAD_TARGET = shape({
  name: 'messageThreadTarget',
  columns: ['messageThreadId', 'targetPersonId'],
  relations: {
    messageThread: {
      fieldMetadataId: 'field-messageThreadTarget-thread',
      joinColumnName: 'messageThreadId',
      targetObjectMetadataId: 'id-messageThread',
    },
    targetPerson: { joinColumnName: 'targetPersonId', targetObjectMetadataId: 'id-person' },
  },
});
const MEMBER_SHAPE = shape({ name: 'workspaceMember', columns: ['name'] });
const UNKNOWN = shape({ name: 'somethingUpstreamAdded', columns: ['secret'] });

const SHAPES = {
  'id-person': PERSON,
  'id-note': NOTE,
  'id-noteTarget': NOTE_TARGET,
  'id-company': COMPANY,
  'id-workspaceMember': MEMBER_SHAPE,
  'id-message': MESSAGE,
  'id-messageParticipant': MESSAGE_PARTICIPANT,
  'id-messageThreadTarget': MESSAGE_THREAD_TARGET,
  'id-messageList': MESSAGE_LIST,
};
const lookup = (id) => SHAPES[id];

const call = (tableShape, { roleId = ROLE_AM, memberId = MEMBER, alias = 'p' } = {}) =>
  buildCondition({
    internalContext: { userWorkspaceRoleMap: { uw1: roleId }, apiKeyRoleMap: { key1: roleId } },
    authContext: { userWorkspaceId: 'uw1', workspaceMemberId: memberId },
    tableShape,
    alias,
    tableShapeByObjectMetadataId: lookup,
  });

describe('row security', () => {
  beforeEach(() => {
    process.env.PINION_RESTRICTED_ROLE_IDS = ROLE_AM;
  });

  it('restricts owned objects to the current member', () => {
    const result = call(PERSON);

    assert.match(result.sql, /"p"\."personOwnerId" = :pinionRowSecurityMemberId/);
    assert.equal(result.parameters.pinionRowSecurityMemberId, MEMBER);
  });

  it('restricts authored objects by createdBy', () => {
    assert.match(call(MESSAGE_LIST).sql, /"createdByWorkspaceMemberId" = :/);
  });

  it('shows a note the member wrote OR one filed against their record', () => {
    const { sql } = call(NOTE, { alias: 'n' });

    // Every prod note is written by an integration, so the creator branch alone
    // would hide the lead note sitting on the member's own contact.
    assert.match(sql, /"n"\."createdByWorkspaceMemberId" = :/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."noteTarget"/);
    assert.match(sql, /"personOwnerId" = :pinionRowSecurityMemberId/);
    assert.match(sql, / OR /);
  });

  it('reaches a link row through the record it points at, not its note', () => {
    const { sql } = call(NOTE_TARGET);

    // Reaching it through the note would be circular: the note is itself
    // reached through this row.
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."person"/);
    assert.doesNotMatch(sql, /FROM "workspace_test"\."note"/);
  });

  it('shows a company the member has a contact at', () => {
    const { sql } = call(COMPANY, { alias: 'c' });

    assert.match(sql, /"c"\."accountOwnerId" = :/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."person"/);
    assert.match(sql, /"companyId" = "c"\."id"/);
  });

  it('denies a linked rule whose collection relation is gone', () => {
    const renamed = shape({ name: 'note', columns: ['createdByWorkspaceMemberId'] });

    // No noteTargets relation, so only the creator branch survives.
    const { sql } = call(renamed, { alias: 'n' });

    assert.match(sql, /"n"\."createdByWorkspaceMemberId" = :/);
    assert.doesNotMatch(sql, /EXISTS/);
  });

  it('denies a linked rule whose child lost its back-reference', () => {
    const detached = shape({
      name: 'note',
      relations: { noteTargets: { targetObjectMetadataId: 'id-messageList' } },
    });

    // Neither branch resolves: no createdBy column, and the child cannot point
    // back at us. Fail closed rather than emit a cross join.
    assert.equal(call(detached).sql, DENY_ALL.sql);
  });

  it('ORs every readable parent for multi-parent joins', () => {
    const { sql } = call(LIST_MEMBER);

    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."messageList"/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."person"/);
    assert.match(sql, / OR /);
  });

  it('shows a message the member took part in', () => {
    const { sql } = call(MESSAGE, { alias: 'm' });

    // Their own correspondence, which is also what makes the open and click
    // counts on a message they sent visible to them.
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."messageParticipant"/);
    assert.match(sql, /"workspaceMemberId" = :pinionRowSecurityMemberId/);
    assert.match(sql, /"messageId" = "m"\."id"/);
  });

  it('shows both ends of a message the member took part in', () => {
    // Regression, 2026-09-15. OWN('workspaceMember') alone hid every external
    // participant, because they carry a handle and no workspace member. The
    // frontend renders nothing for a message whose receivers list is empty
    // (EmailThreadMessage.tsx:62), so an Account Manager opening their own
    // thread saw a blank panel while the bodies sat in the response.
    const { sql } = call(MESSAGE_PARTICIPANT, { alias: 'mp' });

    // Own row still readable...
    assert.match(sql, /"mp"\."workspaceMemberId" = :pinionRowSecurityMemberId/);
    // ...or reachable through the message, which must itself be one the member
    // took part in — that inner check is what keeps this from being "all
    // participants everywhere".
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."message"/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."messageParticipant"/);
  });

  it('bounds parent() recursion at two levels', () => {
    // participant -> message -> participant. The innermost participant is
    // evaluated below the top level, where parent() denies and only the OWN
    // branch survives; without that guard this recurses forever.
    const { sql } = call(MESSAGE_PARTICIPANT, { alias: 'mp' });
    const nested = (sql.match(/EXISTS \(/g) || []).length;

    assert.ok(nested <= 2, `expected at most 2 nested EXISTS, got ${nested}`);
  });

  it('lets a member reach the channel association of a message they may read', () => {
    // Regression, 2026-09-15. This was HIDDEN, filed under "calendar contents".
    // Twenty resolves a message's channel through this table to decide whether
    // the body may be shown, and when the lookup comes back empty it drops the
    // message from the response entirely. The effect was that an Account
    // Manager passed the `message` rule, opened their own thread, and saw a
    // blank panel — while an admin saw the mail. Hiding the row protected
    // nothing: it carries ids and a direction, no customer content.
    const result = call(MESSAGE_CHANNEL_ASSOCIATION, { alias: 'a' });

    assert.equal(result, undefined, 'the association must not be restricted');
  });

  it('still requires the message rule to read the message itself', () => {
    // The association being readable must not widen access to content.
    const { sql } = call(MESSAGE, { alias: 'm' });

    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."messageParticipant"/);
    assert.match(sql, /"workspaceMemberId" = :pinionRowSecurityMemberId/);
  });

  it('shows a thread filed against a record the member owns', () => {
    const { sql } = call(MESSAGE_THREAD, { alias: 't' });

    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."messageThreadTarget"/);
    assert.match(sql, /"personOwnerId" = :pinionRowSecurityMemberId/);
  });

  it('reaches a thread target through its record, not its thread', () => {
    const { sql } = call(MESSAGE_THREAD_TARGET);

    // Reaching it through the thread would be circular: the thread is reached
    // through these rows.
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."person"/);
    assert.doesNotMatch(sql, /FROM "workspace_test"\."messageThread"/);
  });

  it('shows activity the member performed OR activity about their records', () => {
    const { sql } = call(TIMELINE_ACTIVITY, { alias: 'ta' });

    // Keyed only on who acted, an AM saw nothing: on prod just 4,091 of
    // 405,581 rows carry a workspace member.
    assert.match(sql, /"ta"\."workspaceMemberId" = :pinionRowSecurityMemberId/);
    assert.match(sql, /EXISTS \(SELECT 1 FROM "workspace_test"\."person"/);
    assert.match(sql, /"personOwnerId" = :pinionRowSecurityMemberId/);
    assert.match(sql, / OR /);
  });

  it('leaves dashboards readable, since their widgets are filtered per viewer', () => {
    const dashboard = shape({ name: 'dashboard', columns: ['title', 'createdByWorkspaceMemberId'] });

    // A dashboard is a definition, not data. Keyed on its creator it was empty
    // for everyone: no dashboard on prod carries one.
    assert.equal(call(dashboard), undefined);
  });

  it('still hides calendar contents', () => {
    assert.equal(call(shape({ name: 'calendarEvent', columns: ['title'] })).sql, DENY_ALL.sql);
  });

  it('leaves workspace members visible', () => {
    assert.equal(call(MEMBER_SHAPE), undefined);
  });

  it('denies an object no rule mentions', () => {
    assert.equal(call(UNKNOWN).sql, DENY_ALL.sql);
  });

  it('does not restrict other roles', () => {
    assert.equal(call(PERSON, { roleId: ROLE_ADMIN }), undefined);
  });

  it('does nothing when no roles are configured', () => {
    process.env.PINION_RESTRICTED_ROLE_IDS = '';
    assert.equal(call(PERSON), undefined);
  });

  it('denies when the member id is missing', () => {
    // A restricted principal with no workspace member (e.g. an API key not tied
    // to a member) must see nothing rather than everything.
    const result = buildCondition({
      internalContext: { userWorkspaceRoleMap: { uw1: ROLE_AM } },
      authContext: { userWorkspaceId: 'uw1' },
      tableShape: PERSON,
      alias: 'p',
      tableShapeByObjectMetadataId: lookup,
    });

    assert.equal(result.sql, DENY_ALL.sql);
  });

  it('denies when the owner column is absent', () => {
    const renamed = shape({ name: 'person', columns: ['ownerRenamedId'] });

    assert.equal(call(renamed).sql, DENY_ALL.sql);
  });

  it('denies rather than throwing when shape lookup fails', () => {
    const result = buildCondition({
      internalContext: { userWorkspaceRoleMap: { uw1: ROLE_AM } },
      authContext: { userWorkspaceId: 'uw1', workspaceMemberId: MEMBER },
      tableShape: NOTE_TARGET,
      alias: 'nt',
      tableShapeByObjectMetadataId: () => {
        throw new Error('boom');
      },
    });

    assert.equal(result.sql, DENY_ALL.sql);
  });

  it('applies to API key principals too', () => {
    const result = buildCondition({
      internalContext: { apiKeyRoleMap: { key1: ROLE_AM } },
      authContext: { apiKey: { id: 'key1' }, workspaceMemberId: MEMBER },
      tableShape: PERSON,
      alias: 'p',
      tableShapeByObjectMetadataId: lookup,
    });

    assert.match(result.sql, /"personOwnerId" = :/);
  });

  it('quotes identifiers', () => {
    assert.match(call(PERSON, { alias: 'weird"alias' }).sql, /"weird""alias"/);
  });
});
