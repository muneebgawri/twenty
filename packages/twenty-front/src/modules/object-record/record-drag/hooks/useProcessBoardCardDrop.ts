import { useStore } from 'jotai';
import { useCallback, useContext } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { processGroupDrop } from '@/object-record/record-drag/utils/processGroupDrop';

import { useRequestStageGate } from '@/pinion/stage-gate/hooks/useRequestStageGate';

import { RecordBoardContext } from '@/object-record/record-board/contexts/RecordBoardContext';
import { isRecordBoardDropProcessingComponentState } from '@/object-record/record-board/states/isRecordBoardDropProcessingComponentState';
import { useUpdateDroppedRecordOnBoard } from '@/object-record/record-drag/hooks/useUpdateDroppedRecordOnBoard';
import { recordIndexRecordIdsByGroupComponentFamilyState } from '@/object-record/record-index/states/recordIndexRecordIdsByGroupComponentFamilyState';
import { useAtomComponentFamilyStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateCallbackState';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';
import { useDebouncedCallback } from 'use-debounce';

export const useProcessBoardCardDrop = () => {
  const store = useStore();
  const { selectFieldMetadataItem } = useContext(RecordBoardContext);
  const { requestStageGate } = useRequestStageGate();

  const recordIndexRecordIdsByGroupCallbackFamilyState =
    useAtomComponentFamilyStateCallbackState(
      recordIndexRecordIdsByGroupComponentFamilyState,
    );

  const { updateDroppedRecordOnBoard } = useUpdateDroppedRecordOnBoard();

  const isRecordBoardDropProcessingCallbackState =
    useAtomComponentStateCallbackState(
      isRecordBoardDropProcessingComponentState,
    );

  // TODO: this is necessary to avoid race conditions when dragging right after a previous drag (~200ms to 500ms)
  // A way to fix this would be to have a proper optimistic logic on drop that doesn't just resets the whole board with trigger initial query but updates everything without waiting for the request return
  // Which is the problem here because it kind of destroys the existing columns that have more records than page size, and dnd library has issues computing drag when the underlying data change.
  const debouncedUpdateDropProcessing = useDebouncedCallback(
    (isPending: boolean) => {
      store.set(isRecordBoardDropProcessingCallbackState, isPending);
    },
    500,
  );

  const processBoardCardDrop = useCallback(
    (
      droppableId: string,
      draggableId: string,
      targetIndex: number,
      selectedRecordIds: string[],
      options?: { shouldUpdatePosition?: boolean },
    ) => {
      if (!isDefined(selectFieldMetadataItem)) return;

      const shouldUpdatePosition = options?.shouldUpdatePosition ?? true;

      // Collected first, then applied: a drop held back for an answer (see useRequestStageGate) runs later, after the
      // drag state is gone.
      const updates: {
        recordId: string;
        position?: number;
        targetRecordGroupValue: string | null;
      }[] = [];

      processGroupDrop({
        droppableId,
        draggableId,
        targetIndex,
        store,
        selectedRecordIds,
        recordIdsByGroupFamilyState:
          recordIndexRecordIdsByGroupCallbackFamilyState,
        onUpdateRecord: ({ recordId, position }, targetRecordGroupValue) => {
          updates.push({ recordId, position, targetRecordGroupValue });
        },
      });

      const applyDrop = (extraInput?: Record<string, unknown>) => {
        for (const { recordId, position, targetRecordGroupValue } of updates) {
          updateDroppedRecordOnBoard(
            {
              recordId,
              position: shouldUpdatePosition ? position : undefined,
              extraInput,
            },
            targetRecordGroupValue,
          );
        }

        debouncedUpdateDropProcessing(false);
      };

      // Reordering inside the column a card is already in is not entering the stage, so it is never asked.
      const destinationRecordIds = store.get(
        recordIndexRecordIdsByGroupCallbackFamilyState(droppableId),
      ) as string[];
      const isMovingToAnotherGroup = [draggableId, ...selectedRecordIds].some(
        (recordId) => !destinationRecordIds.includes(recordId),
      );

      const isHeldForAnswer =
        updates.length > 0 &&
        requestStageGate({
          destinationValue: updates[0].targetRecordGroupValue,
          isMovingToAnotherGroup,
          proceed: applyDrop,
        });

      if (!isHeldForAnswer) {
        applyDrop();
      }
    },
    [
      store,
      selectFieldMetadataItem,
      recordIndexRecordIdsByGroupCallbackFamilyState,
      updateDroppedRecordOnBoard,
      requestStageGate,
      debouncedUpdateDropProcessing,
    ],
  );

  return {
    processBoardCardDrop,
  };
};
