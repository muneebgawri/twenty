import {
  CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  OPENPHONE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { defineField, FieldType } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: OPENPHONE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.SELECT,
  name: 'openPhoneDirection',
  label: 'Direction',
  description: 'Incoming or outgoing OpenPhone call',
  icon: 'IconArrowsExchange',
  options: [
    {
      id: '3e8b1d7a-5f02-4c96-a4e3-8d2b7f1c6a90',
      value: 'INCOMING',
      label: 'Incoming',
      position: 0,
      color: 'green',
    },
    {
      id: 'c6f0a2e9-1b74-4d38-9f5a-2e7d4b8c1a63',
      value: 'OUTGOING',
      label: 'Outgoing',
      position: 1,
      color: 'blue',
    },
  ],
});
