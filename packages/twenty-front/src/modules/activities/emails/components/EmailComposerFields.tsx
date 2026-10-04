import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';

import { EmailAttachmentsField } from '@/activities/emails/components/EmailAttachmentsField';
import { type EmailComposerState } from '@/activities/emails/types/EmailComposerState';
import { FormAdvancedTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput';
import { FormMultiTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormMultiTextFieldInput';
import { FormTextFieldInput } from '@/object-record/record-field/ui/form-types/components/FormTextFieldInput';
import { GET_MY_CONNECTED_ACCOUNTS } from '@/settings/accounts/graphql/queries/getMyConnectedAccounts';
import { Select } from '@/ui/input/components/Select';
import { t } from '@lingui/core/macro';
import { type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledFieldsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[2]};
`;

const StyledToRow = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
`;

const StyledCcBccToggle = styled.button`
  all: unset;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  position: absolute;
  right: 0;
  top: 0;

  &:hover {
    color: ${themeCssVariables.font.color.secondary};
  }
`;

const StyledOptionsGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
`;

const StyledOption = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 32px;
  padding: 0 ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledCheckbox = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
`;

type EmailComposerFieldsProps = {
  composerState: EmailComposerState;
};

const getMinimumScheduleTime = () => {
  const date = new Date(Date.now() + 60_000);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

export const EmailComposerFields = ({
  composerState,
}: EmailComposerFieldsProps) => {
  const { data: accountsData } = useQuery<{
    myConnectedAccounts: { id: string; handle: string }[];
  }>(GET_MY_CONNECTED_ACCOUNTS);

  const accountOptions: SelectOption<string>[] =
    accountsData?.myConnectedAccounts?.map((account) => ({
      label: account.handle,
      value: account.id,
    })) ?? [];

  const hasMultipleAccounts = accountOptions.length > 1;

  return (
    <StyledFieldsContainer>
      {hasMultipleAccounts && (
        <Select
          dropdownId="email-composer-from-account"
          label={t`From`}
          fullWidth
          value={composerState.connectedAccountId}
          options={accountOptions}
          onChange={(value) => composerState.setConnectedAccountId(value)}
        />
      )}
      <StyledToRow>
        <FormMultiTextFieldInput
          label={t`To`}
          defaultValue={composerState.defaultTo}
          onChange={composerState.setTo}
          placeholder={t`Recipients`}
        />
        {!composerState.showCcBcc && (
          <StyledCcBccToggle onClick={() => composerState.setShowCcBcc(true)}>
            {t`Cc/Bcc`}
          </StyledCcBccToggle>
        )}
      </StyledToRow>
      {composerState.showCcBcc && (
        <>
          <FormMultiTextFieldInput
            label={t`Cc`}
            defaultValue=""
            onChange={composerState.setCc}
            placeholder={t`Cc`}
          />
          <FormMultiTextFieldInput
            label={t`Bcc`}
            defaultValue=""
            onChange={composerState.setBcc}
            placeholder={t`Bcc`}
          />
        </>
      )}
      <FormTextFieldInput
        label={t`Subject`}
        defaultValue={composerState.defaultSubject}
        onChange={composerState.setSubject}
        placeholder={t`Subject`}
      />
      <FormAdvancedTextFieldInput
        defaultValue=""
        onChange={composerState.setBody}
        placeholder={t`Type something or press "/" to see commands`}
        minHeight={120}
        maxWidth={600}
        contentType="json"
      />
      <EmailAttachmentsField
        label={t`Attachments`}
        files={composerState.files}
        onChange={composerState.setFiles}
      />
      <StyledOptionsGrid>
        <StyledOption>
          {t`Send later`}
          <StyledInput
            type="datetime-local"
            value={composerState.scheduledAt}
            min={getMinimumScheduleTime()}
            onChange={(event) =>
              composerState.setScheduledAt(event.currentTarget.value)
            }
          />
        </StyledOption>
      </StyledOptionsGrid>
      <StyledCheckbox>
        <input
          type="checkbox"
          checked={composerState.trackEmail}
          onChange={(event) =>
            composerState.setTrackEmail(event.currentTarget.checked)
          }
        />
        {t`Track delivery, opens and link clicks`}
      </StyledCheckbox>
    </StyledFieldsContainer>
  );
};
