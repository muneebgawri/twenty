import { type ApplicableStageGate } from '@/pinion/stage-gate/utils/findApplicableStageGate';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type PendingStageGate = {
  applicableStageGate: ApplicableStageGate;
  // Runs the move that was held back, given the value the user chose.
  proceed: (answer: string) => void;
};

// The drop that is waiting for an answer. Null when no prompt is open. Cancelling simply clears it: nothing has been
// moved or persisted at that point, so there is nothing to undo.
export const pendingStageGateState = createAtomState<PendingStageGate | null>({
  key: 'pinion/pendingStageGateState',
  defaultValue: null,
});
