import { createStore, Provider as JotaiProvider } from 'jotai';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconComment, IconHome, IconSettings } from 'twenty-ui/icon';

import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { MainNavigationDrawerModeSwitcher } from '@/navigation/components/MainNavigationDrawerModeSwitcher';
import { useActiveNavigationDrawerMode } from '@/navigation/hooks/useActiveNavigationDrawerMode';
import { useIsNavigationDrawerContentExpanded } from '@/navigation/hooks/useIsNavigationDrawerContentExpanded';
import { useNavigationDrawerModes } from '@/navigation/hooks/useNavigationDrawerModes';
import { useSwitchNavigationDrawerMode } from '@/navigation/hooks/useSwitchNavigationDrawerMode';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';

jest.mock('@/navigation/hooks/useActiveNavigationDrawerMode');
jest.mock('@/navigation/hooks/useIsNavigationDrawerContentExpanded');
jest.mock('@/navigation/hooks/useNavigationDrawerModes');
jest.mock('@/navigation/hooks/useSwitchNavigationDrawerMode');

jest.mock('twenty-ui/utilities', () => ({
  ...jest.requireActual('twenty-ui/utilities'),
  useIsMobile: () => false,
}));

const mockSwitchNavigationDrawerMode = jest.fn();

const renderModeSwitcher = (isLayoutCustomizationModeEnabled = false) => {
  const store = createStore();

  store.set(
    isLayoutCustomizationModeEnabledState.atom,
    isLayoutCustomizationModeEnabled,
  );

  render(
    <I18nProvider i18n={i18n}>
      <JotaiProvider store={store}>
        <MainNavigationDrawerModeSwitcher />
      </JotaiProvider>
    </I18nProvider>,
  );

  return { store };
};

describe('MainNavigationDrawerModeSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.mocked(useNavigationDrawerModes).mockReturnValue([
      {
        Icon: IconHome,
        label: 'Home',
        mode: NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
      },
      {
        Icon: IconComment,
        label: 'AI',
        mode: NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY,
      },
      {
        Icon: IconSettings,
        label: 'Settings',
        mode: NAVIGATION_DRAWER_TABS.SETTINGS,
      },
    ]);
    jest
      .mocked(useActiveNavigationDrawerMode)
      .mockReturnValue(NAVIGATION_DRAWER_TABS.NAVIGATION_MENU);
    jest.mocked(useSwitchNavigationDrawerMode).mockReturnValue({
      switchNavigationDrawerMode: mockSwitchNavigationDrawerMode,
    });
    jest.mocked(useIsNavigationDrawerContentExpanded).mockReturnValue(true);
  });

  // Pinion shows no Home / AI / Settings buttons (Settings lives in the profile menu, and there is no AI provider).
  // The one button kept is the way back to Home from a page that is not Home.
  it('shows no buttons on the home page', () => {
    renderModeSwitcher();

    expect(
      screen.queryByRole('button', { name: 'Home' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'AI' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Settings' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['the collapsed icon rail', false],
    ['the expanded row', true],
  ] as const)(
    'offers only a way back to Home inside Settings, from %s',
    async (_description, isExpanded) => {
      jest
        .mocked(useActiveNavigationDrawerMode)
        .mockReturnValue(NAVIGATION_DRAWER_TABS.SETTINGS);
      jest
        .mocked(useIsNavigationDrawerContentExpanded)
        .mockReturnValue(isExpanded);

      renderModeSwitcher();

      expect(screen.getAllByRole('button')).toHaveLength(1);
      await userEvent.click(screen.getByRole('button', { name: 'Home' }));

      expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledTimes(1);
      expect(mockSwitchNavigationDrawerMode).toHaveBeenCalledWith(
        NAVIGATION_DRAWER_TABS.NAVIGATION_MENU,
      );
    },
  );

  it('offers only a way back to Home on an AI page', () => {
    jest
      .mocked(useActiveNavigationDrawerMode)
      .mockReturnValue(NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY);

    renderModeSwitcher();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Home' })).toBeEnabled();
  });

  it('keeps the way back to Home usable while the layout is being edited', () => {
    jest
      .mocked(useActiveNavigationDrawerMode)
      .mockReturnValue(NAVIGATION_DRAWER_TABS.SETTINGS);

    renderModeSwitcher(true);

    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('renders nothing when no mode is available', () => {
    jest.mocked(useNavigationDrawerModes).mockReturnValue([]);

    renderModeSwitcher();

    expect(
      screen.queryByRole('group', { name: 'Navigation modes' }),
    ).not.toBeInTheDocument();
  });
});
