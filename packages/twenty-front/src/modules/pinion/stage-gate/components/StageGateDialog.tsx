import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { ListItem } from 'twenty-ui/primitives/navigation';
import { Dialog } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

import { STAGE_GATE_DIALOG_ID } from '@/pinion/stage-gate/constants/StageGateDialogId';
import { pendingStageGateState } from '@/pinion/stage-gate/states/pendingStageGateState';
import { DialogInstance } from '@/ui/layout/dialog/components/DialogInstance';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

const StyledFieldLabel = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin-bottom: ${themeCssVariables.spacing[2]};
`;

const StyledOptions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  margin-bottom: ${themeCssVariables.spacing[4]};
`;

const StyledButton = styled(Button)`
  box-sizing: border-box;
  margin-top: ${themeCssVariables.spacing[2]};
`;

// The prompt that holds a card on the board until it has a value for a required field — today, a Lost reason before
// a deal can enter Closed Lost. It renders nothing until a drop asks for it (see useRequestStageGate).
export const StageGateDialog = () => {
  const { t } = useLingui();
  const pendingStageGate = useAtomStateValue(pendingStageGateState);
  const setPendingStageGate = useSetAtomState(pendingStageGateState);
  const { closeDialog } = useDialog();
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  const close = () => {
    setSelectedValue(null);
    setPendingStageGate(null);
    closeDialog(STAGE_GATE_DIALOG_ID);
  };

  const handleConfirm = () => {
    if (!isDefined(pendingStageGate) || !isDefined(selectedValue)) {
      return;
    }

    // Close first so the board is interactive again, then let the held-back move run.
    const { proceed } = pendingStageGate;
    close();
    proceed(selectedValue);
  };

  const applicable = pendingStageGate?.applicableStageGate;

  return (
    <DialogInstance
      dialogId={STAGE_GATE_DIALOG_ID}
      dismissible={true}
      onClose={() => {
        setSelectedValue(null);
        setPendingStageGate(null);
      }}
      onEnter={handleConfirm}
      renderInDocumentBody
    >
      {({ container, backdrop, viewportProps, onKeyDown }) => (
        <Dialog.Popup
          {...{ container, backdrop, viewportProps, onKeyDown }}
          data-globally-prevent-click-outside
          style={{
            padding: 'var(--t-spacing-6)',
            borderRadius: 'var(--t-spacing-1)',
            width: 'calc(400px - var(--t-spacing-32))',
          }}
        >
          <Dialog.Title>
            {isDefined(applicable)
              ? t`Move to ${applicable.gatedValueLabel}`
              : ''}
          </Dialog.Title>
          {isDefined(applicable) && (
            <>
              <StyledFieldLabel>
                {applicable.requiredFieldMetadataItem.label}
              </StyledFieldLabel>
              <StyledOptions
                role="listbox"
                aria-label={applicable.requiredFieldMetadataItem.label}
              >
                {applicable.requiredFieldOptions.map((option) => {
                  const isSelected = option.value === selectedValue;

                  return (
                    <ListItem
                      key={option.id}
                      role="option"
                      aria-selected={isSelected}
                      selected={isSelected}
                      indicator="check"
                      onClick={() => setSelectedValue(option.value)}
                    >
                      <Tag color={option.color}>{option.label}</Tag>
                    </ListItem>
                  );
                })}
              </StyledOptions>
            </>
          )}
          <StyledButton
            onClick={close}
            fullWidth
            data-testid="stage-gate-cancel-button"
            variant="outline"
          >{t`Cancel`}</StyledButton>
          <StyledButton
            onClick={handleConfirm}
            disabled={!isDefined(selectedValue)}
            fullWidth
            data-testid="stage-gate-confirm-button"
            variant="solid"
            color="accent"
          >
            {isDefined(applicable)
              ? t`Move to ${applicable.gatedValueLabel}`
              : ''}
          </StyledButton>
        </Dialog.Popup>
      )}
    </DialogInstance>
  );
};
