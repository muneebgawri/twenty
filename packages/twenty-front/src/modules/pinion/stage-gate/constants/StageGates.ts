import { type StageGate } from '@/pinion/stage-gate/types/StageGate';

// Pinion's pipeline: a deal cannot be dropped on Closed Lost without saying why. `lostReason` is a SELECT field owned
// by the Pinion Layout app; a workspace without it simply has no gate (see findApplicableStageGate), so this needs no
// feature flag and no server change.
export const STAGE_GATES: readonly StageGate[] = [
  {
    objectNameSingular: 'opportunity',
    stageFieldName: 'stage',
    gatedValue: 'CLOSED_LOST',
    requiredFieldName: 'lostReason',
  },
];
