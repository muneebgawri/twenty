import { CALL_RECORDING_VIEWER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/call-recording-viewer-front-component-universal-identifier';
import {
  CALL_RECORDING_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  OPENPHONE_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  RECORDING_PERSON_WIDGET_UNIVERSAL_IDENTIFIER,
  RECORDING_PLAYER_WIDGET_UNIVERSAL_IDENTIFIER,
  RECORDING_TAB_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import {
  definePageLayoutTab,
  PageLayoutTabLayoutMode,
} from 'twenty-sdk/define';

// Adds a tab to Twenty's standard call-recording record page. The standard page
// has summary and transcript widgets but no media player, and its Fields widget
// hides relations, so the tab carries the player and the linked Person.
// Position 15 puts it before the standard Timeline/Summary/Transcript tabs.
export default definePageLayoutTab({
  universalIdentifier: RECORDING_TAB_UNIVERSAL_IDENTIFIER,
  pageLayoutUniversalIdentifier:
    CALL_RECORDING_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER,
  title: 'Recording',
  position: 15,
  icon: 'IconPlayerPlay',
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier: RECORDING_PLAYER_WIDGET_UNIVERSAL_IDENTIFIER,
      title: 'Recording',
      type: 'FRONT_COMPONENT',
      configuration: {
        configurationType: 'FRONT_COMPONENT',
        frontComponentUniversalIdentifier:
          CALL_RECORDING_VIEWER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
      },
    },
    {
      universalIdentifier: RECORDING_PERSON_WIDGET_UNIVERSAL_IDENTIFIER,
      title: 'Person',
      type: 'FIELD',
      configuration: {
        configurationType: 'FIELD',
        // In a manifest this carries the field's universal identifier; install
        // resolves it to the workspace's field id.
        fieldMetadataId: OPENPHONE_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
        fieldDisplayMode: 'CARD',
      },
    },
  ],
});
