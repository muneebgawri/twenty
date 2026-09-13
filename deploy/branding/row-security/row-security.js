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

// Condition for a row of `tableShape` being readable, addressed through `alias`.
const conditionForShape = ({ tableShape, alias, tableShapeByObjectMetadataId, depth }) => {
  const rule = RULES[tableShape.nameSingular];

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

    const branches = [];

    for (const fieldName of rule.fieldNames) {
      const relation = (tableShape.relationShapeByFieldName || {})[fieldName];
      const joinColumn = relation && relation.joinColumnName;

      if (!joinColumn || !(tableShape.columnNames || []).includes(joinColumn)) {
        continue;
      }

      let parentShape;

      try {
        parentShape = tableShapeByObjectMetadataId(relation.targetObjectMetadataId);
      } catch (error) {
        parentShape = undefined;
      }

      if (!parentShape) {
        continue;
      }

      const parentAlias = `pinion_${tableShape.nameSingular}_${fieldName}`;
      const parentCondition = conditionForShape({
        tableShape: parentShape,
        alias: parentAlias,
        tableShapeByObjectMetadataId,
        depth: depth + 1,
      });

      if (parentCondition === DENY_ALL.sql) {
        continue;
      }

      const where = [
        `${quote(parentAlias)}."id" = ${quote(alias)}.${quote(joinColumn)}`,
        parentCondition,
      ]
        .filter(Boolean)
        .join(' AND ');

      branches.push(
        `EXISTS (SELECT 1 FROM ${quote(parentShape.schemaName)}.${quote(
          parentShape.tableName,
        )} ${quote(parentAlias)} WHERE ${where})`,
      );
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
