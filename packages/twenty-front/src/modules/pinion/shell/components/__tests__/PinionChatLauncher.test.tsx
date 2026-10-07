import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { PinionChatLauncher } from '@/pinion/shell/components/PinionChatLauncher';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useOpenAskAiPageInSidePanel } from '@/side-panel/hooks/useOpenAskAiPageInSidePanel';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';

jest.mock('@/settings/roles/hooks/useHasPermissionFlag');
jest.mock('@/side-panel/hooks/useOpenAskAiPageInSidePanel');

let mockIsMobile = false;
jest.mock('twenty-ui/utilities', () => ({
  ...jest.requireActual('twenty-ui/utilities'),
  useIsMobile: () => mockIsMobile,
}));

const mockOpenAskAiPage = jest.fn();

const renderLauncher = ({ isSidePanelOpened = false } = {}) => {
  const store = createStore();
  store.set(isSidePanelOpenedState.atom, isSidePanelOpened);

  render(
    <I18nProvider i18n={i18n}>
      <JotaiProvider store={store}>
        <PinionChatLauncher />
      </JotaiProvider>
    </I18nProvider>,
  );
};

describe('PinionChatLauncher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMobile = false;
    jest.mocked(useHasPermissionFlag).mockReturnValue(true);
    jest
      .mocked(useOpenAskAiPageInSidePanel)
      .mockReturnValue({ openAskAiPage: mockOpenAskAiPage });
  });

  it('opens the AI chat in the side panel when clicked', async () => {
    renderLauncher();

    await userEvent.click(screen.getByRole('button', { name: 'Ask AI' }));

    expect(mockOpenAskAiPage).toHaveBeenCalledTimes(1);
  });

  it('is hidden while the side panel is open, so it never covers it', () => {
    renderLauncher({ isSidePanelOpened: true });

    expect(
      screen.queryByRole('button', { name: 'Ask AI' }),
    ).not.toBeInTheDocument();
  });

  it('is hidden for people without the AI permission', () => {
    jest.mocked(useHasPermissionFlag).mockReturnValue(false);

    renderLauncher();

    expect(
      screen.queryByRole('button', { name: 'Ask AI' }),
    ).not.toBeInTheDocument();
  });

  it('is hidden on mobile, where the navigation bar carries the chat', () => {
    mockIsMobile = true;

    renderLauncher();

    expect(
      screen.queryByRole('button', { name: 'Ask AI' }),
    ).not.toBeInTheDocument();
  });
});
