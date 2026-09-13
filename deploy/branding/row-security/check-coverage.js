'use strict';

// Reports objects the rules do not classify. Unclassified objects are denied at
// runtime (fail closed), so this is about noticing that an upgrade or a new
// custom object needs a decision — not about safety.
//
// Usage, from a machine with psql access to the workspace database:
//
//   psql -At -c "select \"nameSingular\" from core.\"objectMetadata\" where \"isActive\"" \
//     | node check-coverage.js
//
// Exits non-zero when something is unclassified.

const { RULES } = require('./rules');

const input = require('node:fs').readFileSync(0, 'utf8');
const live = input
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const unclassified = live.filter((name) => !(name in RULES));
const stale = Object.keys(RULES).filter((name) => !live.includes(name));

for (const name of unclassified) {
  console.log(`UNCLASSIFIED (denied at runtime): ${name}`);
}

for (const name of stale) {
  console.log(`rule with no live object (harmless): ${name}`);
}

console.log(
  `${live.length} live objects, ${Object.keys(RULES).length} rules, ${unclassified.length} unclassified`,
);

process.exit(unclassified.length === 0 ? 0 : 1);
