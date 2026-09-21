'use strict';

// Injects the email deliverability gate into Twenty's compiled argument processor.
// Run at image build time. Fails the build if the upstream code moved, so an upgrade
// cannot quietly ship an image where the gate is absent — same contract as
// row-security/apply-patch.js, for the same reason.
//
// TWO PATCHES, AND WHY THE SECOND ONE IS NOT OPTIONAL.
//
// Patch 1 puts the check in DataArgProcessorService.process(), in the per-field loop. That
// is the one place every write funnels through: GraphQL and REST, create and update, one
// record and many, standard objects and custom ones. Person and Journalist are covered by
// the same line, and so is any EMAILS field added later, without another patch.
//
// But process() has five callers and one of them, findDuplicates, is a READ. Twenty calls
// it while you are filling in a new record, and Twenty's CSV importer calls it to dedupe a
// batch. If the gate threw there, asking "does this person already exist" would fail
// instead of answering, and one bad row would take down an import of thousands. Refusing to
// STORE an address and refusing to LOOK one UP are different things.
//
// There is no flag on the call that distinguishes them — create-one, update-one,
// update-many and find-duplicates are indistinguishable at that boundary (update and
// find-duplicates even pass the same shouldBackfillPositionIfUndefined: false). So patch 2
// makes findDuplicates opt out explicitly, and patch 1 honours the opt-out. Being explicit
// also means a future upstream caller is gated by default, which is the safe direction: a
// new write path is covered without anyone remembering to add it.

const fs = require('node:fs');

const PROCESSOR =
  process.argv[2] ||
  '/app/packages/twenty-server/dist/engine/api/common/common-args-processors/data-arg-processor/data-arg-processor.service.js';

const FIND_DUPLICATES =
  process.argv[3] ||
  '/app/packages/twenty-server/dist/engine/api/common/common-query-runners/common-find-duplicates-query-runner.service.js';

const MARKER = 'pinion-email-gate';

// --- patch 1: the write path ------------------------------------------------------------

const PROCESS_ANCHOR =
  'processedRecord[key] = await this.processField(fieldMetadata, key, value, flatFieldMetadataMaps, flatObjectMetadataMaps);';

const PROCESS_INJECTION = `
                if (!skipPinionEmailGate) {
                    const pinionReason = await require('/app/pinion-email-gate/gate').reject(fieldMetadata, processedRecord[key]);
                    if (pinionReason) {
                        throw new _commonqueryrunnerexception.CommonQueryRunnerException(pinionReason, _commonqueryrunnerexception.CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA, {
                            userFriendlyMessage: {
                                id: "pinion.email.undeliverable",
                                message: "{pinionReason}",
                                values: {
                                    pinionReason: pinionReason
                                }
                            }
                        });
                    }
                }`;

// The destructured signature, so the opt-out has a name to arrive under. Defaulting it to
// false is what makes a caller that says nothing a gated caller.
const SIGNATURE_ANCHOR =
  'async process({ partialRecordInputs, authContext, flatObjectMetadata, flatFieldMetadataMaps, flatObjectMetadataMaps, shouldBackfillPositionIfUndefined = true }) {';
const SIGNATURE_PATCHED =
  'async process({ partialRecordInputs, authContext, flatObjectMetadata, flatFieldMetadataMaps, flatObjectMetadataMaps, shouldBackfillPositionIfUndefined = true, skipPinionEmailGate = false }) {';

// --- patch 2: the read path opts out -----------------------------------------------------

const DUPLICATES_ANCHOR = 'shouldBackfillPositionIfUndefined: false';
const DUPLICATES_PATCHED =
  'shouldBackfillPositionIfUndefined: false,\n                skipPinionEmailGate: true';

const fail = (message) => {
  console.error(`email-gate patch: ${message}`);
  process.exit(1);
};

const once = (source, needle, what, file) => {
  const count = source.split(needle).length - 1;
  if (count !== 1) {
    fail(`expected exactly 1 ${what} in ${file}, found ${count}. Re-check upstream.`);
  }
};

// --- apply -------------------------------------------------------------------------------

let processor = fs.readFileSync(PROCESSOR, 'utf8');

if (processor.includes(MARKER)) {
  fail('already patched; the build should start from a clean upstream image');
}

once(processor, PROCESS_ANCHOR, 'processField call site', 'data-arg-processor.service.js');
once(processor, SIGNATURE_ANCHOR, 'process() signature', 'data-arg-processor.service.js');

// The injected code throws with the exception class the file already imports under this
// name. If the bundler ever renames it, the patch must fail rather than emit a ReferenceError
// that only fires on the first bad address someone happens to type. Presence, not
// uniqueness: the file throws this exception in eight places, and that is not a defect.
if (!processor.includes('_commonqueryrunnerexception.CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA')) {
  fail('the CommonQueryRunnerException import moved or was renamed. Re-check upstream.');
}

processor = processor.replace(SIGNATURE_ANCHOR, SIGNATURE_PATCHED);
processor = processor.replace(PROCESS_ANCHOR, PROCESS_ANCHOR + PROCESS_INJECTION);
fs.writeFileSync(PROCESSOR, processor);

let duplicates = fs.readFileSync(FIND_DUPLICATES, 'utf8');

once(
  duplicates,
  DUPLICATES_ANCHOR,
  'process() options block',
  'common-find-duplicates-query-runner.service.js',
);

duplicates = duplicates.replace(DUPLICATES_ANCHOR, DUPLICATES_PATCHED);
fs.writeFileSync(FIND_DUPLICATES, duplicates);

console.log(`email-gate patch applied to ${PROCESSOR}`);
console.log(`email-gate opt-out applied to ${FIND_DUPLICATES}`);
