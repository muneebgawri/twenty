'use strict';

// Per-record read restriction for designated roles.
//
// Twenty's own row-level permissions are a paid feature under a commercial
// licence, so this is an independent implementation written against the
// open-source query layer. It hooks the same place Twenty applies record
// filters (WorkspaceRepository#applyRowLevelPermissionPredicateForAlias), which
// runs for the queried table and for every joined alias, so nested relations,
// search and aggregates are covered by one gate.
//
// Design rules:
//   - Fail closed. Unknown object, missing column, missing member id => no rows.
//   - Never widen access: it only ever ANDs a condition onto the query.
//   - No I/O. Everything comes from the table shapes already in memory.

const { RULES } = require('./rules');

const MEMBER_PARAM = 'pinionRowSecurityMemberId';
const DENY_ALL = { sql: '1 = 0', parameters: {} };

const quote = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

const restrictedRoleIds = () =>
  new Set(
    String(process.env.PINION_RESTRICTED_ROLE_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );

// Which role is this request acting as? API keys and users resolve differently.
const resolveRoleId = ({ internalContext, authContext }) => {
  const apiKeyId = authContext && authContext.apiKey && authContext.apiKey.id;

  if (apiKeyId) {
    return (internalContext.apiKeyRoleMap || {})[apiKeyId];
  }

  const userWorkspaceId = authContext && authContext.userWorkspaceId;

  if (!userWorkspaceId) {
    return undefined;
  }

  const entry = (internalContext.userWorkspaceRoleMap || {})[userWorkspaceId];

  // The map has held both a bare id and an object across versions.
  return typeof entry === 'string' ? entry : entry && entry.roleId;
};

const isRestricted = (args) => {
  const roleIds = restrictedRoleIds();

  if (roleIds.size === 0) {
    return false;
  }

  return roleIds.has(resolveRoleId(args));
};

const ownerColumn = ({ tableShape, fieldName }) => {
  const relation = (tableShape.relationShapeByFieldName || {})[fieldName];
  const column = relation && relation.joinColumnName;

  if (!column || !(tableShape.columnNames || []).includes(column)) {
    return undefined;
  }

  return column;
};

const creatorColumn = ({ tableShape }) =>
  (tableShape.columnNames || []).includes('createdByWorkspaceMemberId')
    ? 'createdByWorkspaceMemberId'
    : undefined;

const safeLookup = (tableShapeByObjectMetadataId, objectMetadataId) => {
  try {
    return tableShapeByObjectMetadataId(objectMetadataId);
  } catch (error) {
    return undefined;
  }
};

// EXISTS against the parent that `fieldName` points at, e.g. a noteTarget's
// targetPerson. Returns undefined when the parent is unreachable or unreadable.
const parentExists = ({ tableShape, alias, fieldName, tableShapeByObjectMetadataId, depth }) => {
  const relation = (tableShape.relationShapeByFieldName || {})[fieldName];
  const joinColumn = relation && relation.joinColumnName;

  if (!joinColumn || !(tableShape.columnNames || []).includes(joinColumn)) {
    return undefined;
  }

  const parentShape = safeLookup(tableShapeByObjectMetadataId, relation.targetObjectMetadataId);

  if (!parentShape) {
    return undefined;
  }

  const parentAlias = `pinion_${tableShape.nameSingular}_${fieldName}`;
  const parentCondition = conditionForShape({
    tableShape: parentShape,
    alias: parentAlias,
    tableShapeByObjectMetadataId,
    depth: depth + 1,
  });

  if (parentCondition === DENY_ALL.sql) {
    return undefined;
  }

  const where = [
    `${quote(parentAlias)}."id" = ${quote(alias)}.${quote(joinColumn)}`,
    parentCondition,
  ]
    .filter(Boolean)
    .join(' AND ');

  return `EXISTS (SELECT 1 FROM ${quote(parentShape.schemaName)}.${quote(
    parentShape.tableName,
  )} ${quote(parentAlias)} WHERE ${where})`;
};

// The column on `childShape` that points back at `tableShape`.
const backReferenceColumn = ({ tableShape, childShape, relation }) => {
  const childRelations = Object.values(childShape.relationShapeByFieldName || {});
  const byFieldId = childRelations.find(
    (candidate) =>
      relation.targetFieldMetadataId &&
      candidate.fieldMetadataId === relation.targetFieldMetadataId &&
      candidate.joinColumnName,
  );
  const match =
    byFieldId ||
    childRelations.find(
      (candidate) =>
        candidate.targetObjectMetadataId === tableShape.objectMetadataId &&
        candidate.joinColumnName,
    );
  const column = match && match.joinColumnName;

  return column && (childShape.columnNames || []).includes(column) ? column : undefined;
};

// Condition for a row of `tableShape` being readable, addressed through `alias`.
const conditionForShape = ({ tableShape, alias, tableShapeByObjectMetadataId, depth }) =>
  conditionForRule({
    rule: RULES[tableShape.nameSingular],
    tableShape,
    alias,
    tableShapeByObjectMetadataId,
    depth,
  });

const conditionForRule = ({ rule, tableShape, alias, tableShapeByObjectMetadataId, depth }) => {
  if (!rule || rule.mode === 'hidden') {
    return DENY_ALL.sql;
  }

  if (rule.mode === 'visible') {
    return undefined;
  }

  if (rule.mode === 'own') {
    const column = ownerColumn({ tableShape, fieldName: rule.fieldName });

    return column
      ? `${quote(alias)}.${quote(column)} = :${MEMBER_PARAM}`
      : DENY_ALL.sql;
  }

  if (rule.mode === 'creator') {
    const column = creatorColumn({ tableShape });

    return column
      ? `${quote(alias)}.${quote(column)} = :${MEMBER_PARAM}`
      : DENY_ALL.sql;
  }

  if (rule.mode === 'via') {
    // One level only: parents are 'own' or 'creator'. Deeper chains would mean
    // correlated subqueries per join, which is not worth the query cost.
    if (depth > 0) {
      return DENY_ALL.sql;
    }

    const branches = rule.fieldNames
      .map((fieldName) =>
        parentExists({ tableShape, alias, fieldName, tableShapeByObjectMetadataId, depth }),
      )
      .filter(Boolean);

    return branches.length > 0 ? `(${branches.join(' OR ')})` : DENY_ALL.sql;
  }

  // "Attached to something the member may read": walk down to a child
  // collection, then back up to the record it hangs off. This is what keeps a
  // lead note written by an integration visible on the AM's own contact.
  if (rule.mode === 'linked') {
    if (depth > 0) {
      return DENY_ALL.sql;
    }

    const relation = (tableShape.relationShapeByFieldName || {})[rule.collectionFieldName];

    if (!relation) {
      return DENY_ALL.sql;
    }

    const childShape = safeLookup(tableShapeByObjectMetadataId, relation.targetObjectMetadataId);

    if (!childShape) {
      return DENY_ALL.sql;
    }

    const backColumn = backReferenceColumn({ tableShape, childShape, relation });

    if (!backColumn) {
      return DENY_ALL.sql;
    }

    const childAlias = `pinion_${tableShape.nameSingular}_${rule.collectionFieldName}`;
    let inner;

    if (rule.targetFieldNames.length === 0) {
      // The child carries its own ownership (a company's people, say).
      inner = conditionForShape({
        tableShape: childShape,
        alias: childAlias,
        tableShapeByObjectMetadataId,
        depth: depth + 1,
      });

      if (inner === DENY_ALL.sql) {
        return DENY_ALL.sql;
      }
    } else {
      // The child is a join table: follow its target columns to a readable row.
      const branches = rule.targetFieldNames
        .map((fieldName) =>
          parentExists({
            tableShape: childShape,
            alias: childAlias,
            fieldName,
            tableShapeByObjectMetadataId,
            depth,
          }),
        )
        .filter(Boolean);

      if (branches.length === 0) {
        return DENY_ALL.sql;
      }

      inner = `(${branches.join(' OR ')})`;
    }

    const where = [`${quote(childAlias)}.${quote(backColumn)} = ${quote(alias)}."id"`, inner]
      .filter(Boolean)
      .join(' AND ');

    return `EXISTS (SELECT 1 FROM ${quote(childShape.schemaName)}.${quote(
      childShape.tableName,
    )} ${quote(childAlias)} WHERE ${where})`;
  }

  if (rule.mode === 'anyOf') {
    const branches = [];

    for (const branchRule of rule.rules) {
      const branch = conditionForRule({
        rule: branchRule,
        tableShape,
        alias,
        tableShapeByObjectMetadataId,
        depth,
      });

      // One unrestricted branch makes the whole object unrestricted.
      if (branch === undefined) {
        return undefined;
      }

      if (branch !== DENY_ALL.sql) {
        branches.push(branch);
      }
    }

    return branches.length > 0 ? `(${branches.join(' OR ')})` : DENY_ALL.sql;
  }

  return DENY_ALL.sql;
};

// Returns { sql, parameters } to AND onto the query, or undefined for no
// restriction. Any unexpected error denies access rather than passing through.
const buildCondition = ({
  internalContext,
  authContext,
  tableShape,
  alias,
  tableShapeByObjectMetadataId,
}) => {
  try {
    if (!tableShape || !alias) {
      return undefined;
    }

    if (!isRestricted({ internalContext, authContext })) {
      return undefined;
    }

    const memberId = authContext && authContext.workspaceMemberId;

    if (!memberId) {
      return DENY_ALL;
    }

    const sql = conditionForShape({
      tableShape,
      alias,
      tableShapeByObjectMetadataId,
      depth: 0,
    });

    if (!sql) {
      return undefined;
    }

    return { sql, parameters: { [MEMBER_PARAM]: memberId } };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[pinion-row-security] denying access after error:', error);

    return DENY_ALL;
  }
};

module.exports = { buildCondition, resolveRoleId, isRestricted, MEMBER_PARAM, DENY_ALL };
