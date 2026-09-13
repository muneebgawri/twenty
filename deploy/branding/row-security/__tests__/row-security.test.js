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
const MESSAGE = shape({ name: 'message', columns: ['text'] });
const MEMBER_SHAPE = shape({ name: 'workspaceMember', columns: ['name'] });
const UNKNOWN = shape({ name: 'somethingUpstreamAdded', columns: ['secret'] });

const SHAPES = {
  'id-person': PERSON,
  'id-note': NOTE,
  'id-noteTarget': NOTE_TARGET,
  'id-company': COMPANY,
  'id-workspaceMember': MEMBER_SHAPE,
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

  it('hides mailbox objects', () => {
    assert.equal(call(MESSAGE).sql, DENY_ALL.sql);
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
