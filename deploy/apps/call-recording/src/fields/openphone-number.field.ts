import {
  CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  OPENPHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { defineField, FieldType } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: OPENPHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.TEXT,
  name: 'openPhoneNumber',
  label: 'Contact phone',
  description: 'External caller or recipient, as sent by OpenPhone (E.164)',
  icon: 'IconPhone',
});
