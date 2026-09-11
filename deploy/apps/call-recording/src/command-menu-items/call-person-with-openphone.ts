import {
  CALL_PERSON_COMMAND_UNIVERSAL_IDENTIFIER,
  PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { CALL_PERSON_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/call-person-with-openphone';
import {
  defineCommandMenuItem,
  numberOfSelectedRecords,
} from 'twenty-sdk/define';

export default defineCommandMenuItem({
  universalIdentifier: CALL_PERSON_COMMAND_UNIVERSAL_IDENTIFIER,
  frontComponentUniversalIdentifier:
    CALL_PERSON_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  label: 'Call with OpenPhone',
  icon: 'IconPhoneCall',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
  // Written as an expression, not a string: the SDK's build step compiles it
  // into the stored availability rule.
  conditionalAvailabilityExpression: numberOfSelectedRecords === 1,
});
