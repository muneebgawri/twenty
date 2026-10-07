import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconSparkles } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';
import { useIsMobile } from 'twenty-ui/utilities';

import { PINION_CHAT_LAUNCHER_SIZE } from '@/pinion/shell/constants/PinionChatLauncherSize';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useOpenAskAiPageInSidePanel } from '@/side-panel/hooks/useOpenAskAiPageInSidePanel';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const StyledLauncher = styled.button`
  align-items: center;
  background: ${themeCssVariables.color.blue};
  border: none;
  border-radius: 50%;
  bottom: ${themeCssVariables.spacing[5]};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  color: white;
  cursor: pointer;
  display: flex;
  height: ${PINION_CHAT_LAUNCHER_SIZE}px;
  justify-content: center;
  position: fixed;
  right: ${themeCssVariables.spacing[5]};
  width: ${PINION_CHAT_LAUNCHER_SIZE}px;
  z-index: 10;

  &:hover {
    filter: brightness(1.1);
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue9};
    outline-offset: 2px;
  }

  @media print {
    display: none;
  }
`;

// The chat that used to be a button in the drawer's top row. Floating at the bottom right, it opens the AI chat in the
// side panel. Hidden while the side panel is open (it would sit on top of it), on mobile (the navigation bar has the
// chat), and for people without the AI permission.
export const PinionChatLauncher = () => {
  const isMobile = useIsMobile();
  const hasAiPermission = useHasPermissionFlag(PermissionFlagType.AI);
  const isSidePanelOpened = useAtomStateValue(isSidePanelOpenedState);
  const { openAskAiPage } = useOpenAskAiPageInSidePanel();

  if (isMobile || !hasAiPermission || isSidePanelOpened) {
    return null;
  }

  return (
    <StyledLauncher
      type="button"
      aria-label={t`Ask AI`}
      onClick={() => openAskAiPage()}
    >
      <IconSparkles size={22} />
    </StyledLauncher>
  );
};
