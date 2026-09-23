import {
  MEMBER_TRACKING_EVENTS_FIELD_UNIVERSAL_IDENTIFIER,
  SENT_BY_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/fields/sent-by.field';
import { EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/email-tracking-event';
import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

/**
 * The other half of emailTrackingEvent.sentBy.
 *
 * Both sides have to be declared. Declaring only the MANY_TO_ONE leaves the
 * relation dangling and the install fails with INVALID_VIEW_DATA naming a
 * field metadata id that does not exist -- an error that points at the
 * generated view rather than at the missing half, which is what it actually
 * is.
 */
export default defineField({
  universalIdentifier: MEMBER_TRACKING_EVENTS_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  type: FieldType.RELATION,
  name: 'emailTrackingEvents',
  label: 'Email tracking events',
  icon: 'IconEye',
  relationTargetObjectMetadataUniversalIdentifier:
    EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    SENT_BY_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
