import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { FieldMetadataType } from 'twenty-shared/types';

import { RecordBoardContext } from '@/object-record/record-board/contexts/RecordBoardContext';
import { StageGateDialog } from '@/pinion/stage-gate/components/StageGateDialog';
import { useRequestStageGate } from '@/pinion/stage-gate/hooks/useRequestStageGate';

const option = (value: string, label: string, position: number) => ({
  id: `id-${value}`,
  value,
  label,
  position,
  color: 'gray' as const,
});

const objectMetadataItem = {
  nameSingular: 'opportunity',
  fields: [
    {
      name: 'lostReason',
      label: 'Lost reason',
      type: FieldMetadataType.SELECT,
      isActive: true,
      options: [
        option('PRICE_BUDGET', 'Price / Budget', 0),
        option('NO_RESPONSE', 'No Response', 1),
      ],
    },
  ],
};

const stageField = {
  name: 'stage',
  type: FieldMetadataType.SELECT,
  options: [option('CLOSED_LOST', 'Closed Lost', 6)],
};

// A stand-in for the board: one button that "drops" a card on Closed Lost, through the real hook.
const Harness = ({
  proceed,
}: {
  proceed: (input: Record<string, unknown>) => void;
}) => {
  const { requestStageGate } = useRequestStageGate();

  return (
    <>
      <button
        onClick={() =>
          requestStageGate({
            destinationValue: 'CLOSED_LOST',
            isMovingToAnotherGroup: true,
            proceed,
          })
        }
      >
        drop card
      </button>
      <StageGateDialog />
    </>
  );
};

const renderBoard = (proceed = jest.fn()) => {
  render(
    <Provider store={createStore()}>
      <I18nProvider i18n={i18n}>
        <RecordBoardContext.Provider
          value={
            {
              objectMetadataItem,
              selectFieldMetadataItem: stageField,
            } as never
          }
        >
          <Harness proceed={proceed} />
        </RecordBoardContext.Provider>
      </I18nProvider>
    </Provider>,
  );

  return { proceed, user: userEvent.setup() };
};

describe('StageGateDialog', () => {
  it('asks for a reason when a card is dropped on Closed Lost, and will not confirm without one', async () => {
    const { user } = renderBoard();

    await user.click(screen.getByText('drop card'));

    expect(await screen.findByText('Price / Budget')).toBeInTheDocument();
    expect(screen.getByText('No Response')).toBeInTheDocument();
    expect(screen.getByText('Lost reason')).toBeInTheDocument();
    expect(screen.getByTestId('stage-gate-confirm-button')).toBeDisabled();
  });

  it('moves the card with the chosen reason once the user confirms', async () => {
    const { proceed, user } = renderBoard();

    await user.click(screen.getByText('drop card'));
    await user.click(await screen.findByText('No Response'));

    const confirm = screen.getByTestId('stage-gate-confirm-button');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(proceed).toHaveBeenCalledWith({ lostReason: 'NO_RESPONSE' });
    await waitFor(() =>
      expect(
        screen.queryByTestId('stage-gate-confirm-button'),
      ).not.toBeInTheDocument(),
    );
  });

  it('leaves the card where it was when the user cancels', async () => {
    const { proceed, user } = renderBoard();

    await user.click(screen.getByText('drop card'));
    await user.click(await screen.findByText('Price / Budget'));
    await user.click(screen.getByTestId('stage-gate-cancel-button'));

    expect(proceed).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByTestId('stage-gate-cancel-button'),
      ).not.toBeInTheDocument(),
    );
  });

  it('forgets an earlier choice when the prompt is opened again', async () => {
    const { user } = renderBoard();

    await user.click(screen.getByText('drop card'));
    await user.click(await screen.findByText('Price / Budget'));
    await user.click(screen.getByTestId('stage-gate-cancel-button'));
    await waitFor(() =>
      expect(
        screen.queryByTestId('stage-gate-cancel-button'),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByText('drop card'));

    expect(
      await screen.findByTestId('stage-gate-confirm-button'),
    ).toBeDisabled();
  });
});
