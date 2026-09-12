import {
  CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  OPENPHONE_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
  PERSON_OPENPHONE_CALL_RECORDINGS_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

// The person on the other end of the call, matched by phone number.
export default defineField({
  universalIdentifier: OPENPHONE_PERSON_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'openPhonePerson',
  label: 'Person',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    PERSON_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PERSON_OPENPHONE_CALL_RECORDINGS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'openPhonePersonId',
  },
});
