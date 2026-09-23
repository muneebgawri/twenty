import { EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/email-tracking-event';
import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

export const SENT_BY_FIELD_UNIVERSAL_IDENTIFIER =
  'ad75d751-2af8-4179-a797-7d3e7ba68cc8';
export const MEMBER_TRACKING_EVENTS_FIELD_UNIVERSAL_IDENTIFIER =
  '3a55e1af-1f34-45ee-a54b-b1888182d134';

/**
 * The Account Manager whose message this event is about.
 *
 * A RELATION, not a text column, and that is forced rather than chosen: the
 * row-security overlay resolves own() through relationShapeByFieldName and
 * needs a real joinColumnName, so a plain workspaceMemberId string would be
 * invisible to it and the rule would silently fall through to hidden.
 *
 * It exists so tracking can be scoped at all. The rows are written by a public
 * webhook running as the application, so createdBy is the app and CREATOR
 * would hide every event from the one person entitled to see it. The sender is
 * carried in the signed token and echoed back by Herald, so this is recorded
 * from the message itself rather than inferred at read time.
 */
export default defineField({
  universalIdentifier: SENT_BY_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'sentBy',
  label: 'Sent by',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    MEMBER_TRACKING_EVENTS_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    joinColumnName: 'sentById',
  },
});
