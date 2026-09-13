'use strict';

// Injects the row-security hook into Twenty's compiled WorkspaceRepository.
// Run at image build time. Fails the build if the upstream code moved, so an
// upgrade cannot quietly ship an image where the restriction is absent.

const fs = require('node:fs');

const TARGET =
  process.argv[2] ||
  '/app/packages/twenty-server/dist/engine/twenty-orm/repository/workspace-repository.js';

const ANCHOR =
  'applyRowLevelPermissionPredicateForAlias({ queryBuilder, alias, flatObjectMetadata }) {';
const GUARD = 'if (!queryBuilder.markRowLevelPermissionApplied(alias)) {';
const MARKER = 'pinion-row-security';

const INJECTION = `
        {
            const pinionJoined = alias === queryBuilder.alias ? undefined : queryBuilder.getJoinedTableShape(alias);
            const pinionShape = alias === queryBuilder.alias
                ? this.options.tableShape
                : (pinionJoined ? this.options.tableShapeByObjectMetadataId(pinionJoined.objectMetadataId) : undefined);
            const pinionCondition = require('/app/pinion-row-security/row-security').buildCondition({
                internalContext: this.options.internalContext,
                authContext: this.options.authContext,
                tableShape: pinionShape,
                alias: alias,
                tableShapeByObjectMetadataId: this.options.tableShapeByObjectMetadataId
            });
            if (pinionCondition) {
                if (alias === queryBuilder.alias) {
                    queryBuilder.andWhere(pinionCondition.sql, pinionCondition.parameters);
                } else {
                    queryBuilder.addJoinCondition(alias, pinionCondition.sql);
                    queryBuilder.setParameters(pinionCondition.parameters);
                }
            }
        }`;

const fail = (message) => {
  console.error(`row-security patch: ${message}`);
  process.exit(1);
};

const source = fs.readFileSync(TARGET, 'utf8');

if (source.includes(MARKER)) {
  fail('already patched; the build should start from a clean upstream image');
}

const anchorCount = source.split(ANCHOR).length - 1;

if (anchorCount !== 1) {
  fail(`expected exactly 1 hook site, found ${anchorCount}. Re-check upstream.`);
}

if (source.split(GUARD).length - 1 !== 1) {
  fail('the markRowLevelPermissionApplied guard moved. Re-check upstream.');
}

fs.writeFileSync(TARGET, source.replace(ANCHOR, ANCHOR + INJECTION));

console.log(`row-security patch applied to ${TARGET}`);
