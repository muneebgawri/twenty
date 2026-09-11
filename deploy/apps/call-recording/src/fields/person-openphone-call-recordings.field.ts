import {
  CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  OPENPHONE_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
  PERSON_OPENPHONE_CALL_RECORDINGS_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

export default defineField({
  universalIdentifier: PERSON_OPENPHONE_CALL_RECORDINGS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'openPhoneCallRecordings',
  label: 'Call recordings',
  icon: 'IconPhoneCall',
  relationTargetObjectMetadataUniversalIdentifier:
    CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    OPENPHONE_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
