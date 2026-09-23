import { TRACKING_PANEL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/tracking-panel';
import {
  definePageLayoutTab,
  PageLayoutTabLayoutMode,
  STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

/**
 * An "Email tracking" tab on the Person record page.
 *
 * The Timeline already carries each event as it happens, which is where
 * somebody looks to answer "what has happened with this person". This tab
 * answers a different question -- "has this contact ever engaged, and how much
 * of that was a machine" -- which the Timeline cannot, because it interleaves
 * everything and shows no totals.
 *
 * Positioned after the standard tabs rather than before them. Twenty's own
 * Timeline and Emails tabs are what an AM opens a contact for; this is
 * supporting detail and should not displace them.
 */
export default definePageLayoutTab({
  universalIdentifier: '00da1e7a-14cd-4832-99f7-8d41e8c3ea22',
  pageLayoutUniversalIdentifier:
    STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.personRecordPage
      .universalIdentifier,
  title: 'Email tracking',
  position: 90,
  icon: 'IconEye',
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier: '8239f924-fc04-4c03-99e2-15a239adc088',
      title: 'Opens and clicks',
      type: 'FRONT_COMPONENT',
      configuration: {
        configurationType: 'FRONT_COMPONENT',
        frontComponentUniversalIdentifier:
          TRACKING_PANEL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
      },
    },
  ],
});
