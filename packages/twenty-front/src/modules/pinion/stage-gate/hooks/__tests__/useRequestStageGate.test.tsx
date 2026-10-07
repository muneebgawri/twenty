import { renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { type ReactNode, act } from 'react';
import { FieldMetadataType } from 'twenty-shared/types';

import { RecordBoardContext } from '@/object-record/record-board/contexts/RecordBoardContext';
import { STAGE_GATE_DIALOG_ID } from '@/pinion/stage-gate/constants/StageGateDialogId';
import { useRequestStageGate } from '@/pinion/stage-gate/hooks/useRequestStageGate';
import { pendingStageGateState } from '@/pinion/stage-gate/states/pendingStageGateState';
import { isDialogOpenedComponentState } from '@/ui/layout/dialog/states/isDialogOpenedComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const option = (value: string, label: string, position: number) => ({
  id: `id-${value}`,
  value,
  label,
  position,
  color: 'gray' as const,
});

const lostReasonField = {
  name: 'lostReason',
  label: 'Lost reason',
  type: FieldMetadataType.SELECT,
  isActive: true,
  options: [option('TIMING', 'Timing', 0), option('OTHER', 'Other', 1)],
};

const stageField = {
  name: 'stage',
  type: FieldMetadataType.SELECT,
  options: [option('CLOSED_LOST', 'Closed Lost', 6), option('NEW', 'New', 0)],
};

const buildWrapper = (fields: unknown[]) => {
  const store = createStore();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <RecordBoardContext.Provider
        value={
          {
            objectMetadataItem: { nameSingular: 'opportunity', fields },
            selectFieldMetadataItem: stageField,
          } as never
        }
      >
        {children}
      </RecordBoardContext.Provider>
    </Provider>
  );

  return Wrapper;
};

const renderGate = (fields: unknown[] = [lostReasonField]) =>
  renderHook(
    () => ({
      gate: useRequestStageGate(),
      pending: useAtomStateValue(pendingStageGateState),
      isDialogOpened: useAtomComponentStateValue(
        isDialogOpenedComponentState,
        STAGE_GATE_DIALOG_ID,
      ),
    }),
    { wrapper: buildWrapper(fields) },
  );

describe('useRequestStageGate', () => {
  it('holds a card that enters Closed Lost and opens the prompt', () => {
    const proceed = jest.fn();
    const { result } = renderGate();

    let held = false;
    act(() => {
      held = result.current.gate.requestStageGate({
        destinationValue: 'CLOSED_LOST',
        isMovingToAnotherGroup: true,
        proceed,
      });
    });

    expect(held).toBe(true);
    expect(result.current.isDialogOpened).toBe(true);
    expect(result.current.pending).not.toBeNull();
    expect(proceed).not.toHaveBeenCalled();
  });

  it('lets the held move run with the chosen reason, under the field name', () => {
    const proceed = jest.fn();
    const { result } = renderGate();

    act(() => {
      result.current.gate.requestStageGate({
        destinationValue: 'CLOSED_LOST',
        isMovingToAnotherGroup: true,
        proceed,
      });
    });
    act(() => {
      result.current.pending?.proceed('TIMING');
    });

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(proceed).toHaveBeenCalledWith({ lostReason: 'TIMING' });
  });

  it('does not ask when a card is only reordered inside its own column', () => {
    const { result } = renderGate();

    let held = true;
    act(() => {
      held = result.current.gate.requestStageGate({
        destinationValue: 'CLOSED_LOST',
        isMovingToAnotherGroup: false,
        proceed: jest.fn(),
      });
    });

    expect(held).toBe(false);
    expect(result.current.isDialogOpened).toBe(false);
  });

  it('does not ask for any other stage', () => {
    const { result } = renderGate();

    let held = true;
    act(() => {
      held = result.current.gate.requestStageGate({
        destinationValue: 'NEW',
        isMovingToAnotherGroup: true,
        proceed: jest.fn(),
      });
    });

    expect(held).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it('does not ask on a workspace that has no Lost reason field', () => {
    const { result } = renderGate([]);

    let held = true;
    act(() => {
      held = result.current.gate.requestStageGate({
        destinationValue: 'CLOSED_LOST',
        isMovingToAnotherGroup: true,
        proceed: jest.fn(),
      });
    });

    expect(held).toBe(false);
    expect(result.current.isDialogOpened).toBe(false);
  });
});
