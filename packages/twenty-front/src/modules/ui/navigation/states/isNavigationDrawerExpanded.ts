import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Pinion starts every browser on the module rail (the collapsed drawer). Someone who expands it keeps their choice:
// it is remembered per browser.
export const isNavigationDrawerExpandedState = createAtomState<boolean>({
  key: 'isNavigationDrawerExpanded',
  defaultValue: false,
  useLocalStorage: true,
});
