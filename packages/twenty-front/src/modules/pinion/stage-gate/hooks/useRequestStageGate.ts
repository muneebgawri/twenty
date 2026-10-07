import { useCallback, useContext } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { getFieldMetadataItemGqlFieldName } from '@/object-metadata/utils/getFieldMetadataItemGqlFieldName';
import { RecordBoardContext } from '@/object-record/record-board/contexts/RecordBoardContext';
import { STAGE_GATES } from '@/pinion/stage-gate/constants/StageGates';
import { STAGE_GATE_DIALOG_ID } from '@/pinion/stage-gate/constants/StageGateDialogId';
import { pendingStageGateState } from '@/pinion/stage-gate/states/pendingStageGateState';
import { findApplicableStageGate } from '@/pinion/stage-gate/utils/findApplicableStageGate';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

type RequestStageGateArgs = {
  destinationValue: string | null;
  // A card reordered inside its own column is not entering the stage, so it is never asked.
  isMovingToAnotherGroup: boolean;
  // Called with the required field's answer once the user gives it.
  proceed: (extraInput: Record<string, unknown>) => void;
};

// Asks the board whether a drop has to be held back for an answer. Returns true when it has: a prompt is open and
// `proceed` will run on confirmation. Returns false when the drop can go ahead as it is.
export const useRequestStageGate = () => {
  const { objectMetadataItem, selectFieldMetadataItem } =
    useContext(RecordBoardContext);
  const setPendingStageGate = useSetAtomState(pendingStageGateState);
  const { openDialog } = useDialog();

  const requestStageGate = useCallback(
    ({
      destinationValue,
      isMovingToAnotherGroup,
      proceed,
    }: RequestStageGateArgs): boolean => {
      if (!isMovingToAnotherGroup || !isDefined(selectFieldMetadataItem)) {
        return false;
      }

      const applicableStageGate = findApplicableStageGate({
        gates: STAGE_GATES,
        objectMetadataItem,
        stageFieldMetadataItem: selectFieldMetadataItem,
        destinationValue,
      });

      if (!isDefined(applicableStageGate)) {
        return false;
      }

      setPendingStageGate({
        applicableStageGate,
        proceed: (answer) =>
          proceed({
            [getFieldMetadataItemGqlFieldName(
              applicableStageGate.requiredFieldMetadataItem,
            )]: answer,
          }),
      });
      openDialog(STAGE_GATE_DIALOG_ID);

      return true;
    },
    [
      objectMetadataItem,
      selectFieldMetadataItem,
      setPendingStageGate,
      openDialog,
    ],
  );

  return { requestStageGate };
};
