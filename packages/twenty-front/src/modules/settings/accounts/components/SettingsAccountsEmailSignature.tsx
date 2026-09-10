import { styled } from '@linaria/react';
import { useMutation, useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';

import { GET_EMAIL_SIGNATURES } from '@/settings/accounts/graphql/queries/getEmailSignatures';
import { UPDATE_EMAIL_SIGNATURE } from '@/settings/accounts/graphql/mutations/updateEmailSignature';
import { H2Title } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { Card, Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

/** Mirrors EMAIL_SIGNATURE_MAX_LENGTH on the server. */
const MAX_LENGTH = 2000;

const StyledCardContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledTextArea = styled.textarea`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  min-height: 120px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
  width: 100%;
`;

const StyledFooter = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type SettingsAccountsEmailSignatureProps = {
  connectedAccountId: string;
  handle: string;
};

/**
 * Per-account signature editor.
 *
 * Stored server-side against the signed-in user, so it follows them across
 * devices and is available to the server when a scheduled email is dispatched
 * with no browser present. An earlier version kept this in localStorage, which
 * meant the signature silently differed per device and vanished with the cache.
 */
export const SettingsAccountsEmailSignature = ({
  connectedAccountId,
  handle,
}: SettingsAccountsEmailSignatureProps) => {
  const { data, loading } = useQuery<{
    emailSignatures: Record<string, string>;
  }>(GET_EMAIL_SIGNATURES);

  const [updateEmailSignature, { loading: saving }] = useMutation(
    UPDATE_EMAIL_SIGNATURE,
  );

  const savedSignature = data?.emailSignatures?.[connectedAccountId] ?? '';
  const [draft, setDraft] = useState('');

  // Re-seed when the saved value or the selected account changes. Without the
  // account in the deps, switching tabs would keep the previous account's text.
  useEffect(() => {
    setDraft(savedSignature);
  }, [savedSignature, connectedAccountId]);

  const isDirty = draft.trim() !== savedSignature.trim();
  const isTooLong = draft.length > MAX_LENGTH;

  const handleSave = async () => {
    await updateEmailSignature({
      variables: { connectedAccountId, signature: draft },
      refetchQueries: [{ query: GET_EMAIL_SIGNATURES }],
    });
  };

  return (
    <Section>
      <H2Title
        title={t`Email signature`}
        description={t`Appended to messages you send from ${handle}, including scheduled ones.`}
      />
      <Card>
        <StyledCardContent>
          <StyledTextArea
            value={draft}
            disabled={loading}
            placeholder={t`Jane Doe — Account Manager\nPinion Newswire`}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <StyledFooter>
            <StyledHint>
              {isTooLong
                ? t`Too long by ${draft.length - MAX_LENGTH} characters`
                : t`${draft.length} / ${MAX_LENGTH}`}
            </StyledHint>
            <Button
              title={saving ? t`Saving…` : t`Save`}
              variant="primary"
              accent="blue"
              disabled={!isDirty || isTooLong || saving || loading}
              onClick={handleSave}
            />
          </StyledFooter>
        </StyledCardContent>
      </Card>
    </Section>
  );
};
