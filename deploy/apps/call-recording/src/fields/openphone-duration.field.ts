import {
  CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  OPENPHONE_DURATION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { defineField, FieldType } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: OPENPHONE_DURATION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.NUMBER,
  name: 'openPhoneDurationSeconds',
  label: 'Duration (seconds)',
  description: 'Recording length reported by OpenPhone',
  icon: 'IconClock',
});
