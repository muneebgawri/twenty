import { defineObject, FieldType } from 'twenty-sdk/define';

export const EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER =
  '7b3c9e41-2d65-4a08-9f7b-c4e01a5d8236';

export const KIND_FIELD_UNIVERSAL_IDENTIFIER =
  '8c4d0f52-3e76-4b19-a08c-d5f12b6e9347';
export const RECIPIENT_FIELD_UNIVERSAL_IDENTIFIER =
  '9d5e1a63-4f87-4c2a-b19d-e6023c7f0458';
export const MESSAGE_REF_FIELD_UNIVERSAL_IDENTIFIER =
  '16f084b3-50d5-445d-bd0c-cc317c1262d1';
export const OCCURRED_AT_FIELD_UNIVERSAL_IDENTIFIER =
  '30bb5a89-466a-4a4f-b494-8e4ad1941fc8';
export const URL_FIELD_UNIVERSAL_IDENTIFIER =
  'fa5671c3-3770-41d1-8d4e-577d4632b47e';

/**
 * One row per open or click, written by Herald's webhook.
 *
 * Rows, not counters. PR #1 incremented a count in place and had a
 * read-modify-write race that downgraded CLICKED back to OPENED; a row per
 * event cannot race with itself, and any count anyone wants is a query.
 *
 * `recipient` is the join back to a person, as a plain TEXT address rather
 * than a relation. The webhook knows who was written to, not which Twenty
 * record they are, and resolving that at write time would make a public
 * endpoint do a lookup it can be made to repeat.
 */
export default defineObject({
  universalIdentifier: EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'emailTrackingEvent',
  namePlural: 'emailTrackingEvents',
  labelSingular: 'Email tracking event',
  labelPlural: 'Email tracking events',
  description: 'An open or click on a message sent from Twenty',
  icon: 'IconEye',
  labelIdentifierFieldMetadataUniversalIdentifier:
    RECIPIENT_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: RECIPIENT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'recipient',
      label: 'Recipient',
      description: 'The address the message went to',
      icon: 'IconMail',
    },
    {
      universalIdentifier: KIND_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'kind',
      label: 'Kind',
      description: 'OPENED or CLICKED',
      icon: 'IconEye',
    },
    {
      universalIdentifier: MESSAGE_REF_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'messageRef',
      label: 'Message',
      description: 'Groups every event for one sent message',
      icon: 'IconHash',
    },
    {
      universalIdentifier: OCCURRED_AT_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.DATE_TIME,
      name: 'occurredAt',
      label: 'Occurred at',
      description: 'When Herald recorded it',
      icon: 'IconClock',
    },
    {
      universalIdentifier: URL_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'url',
      label: 'URL',
      description: 'Clicks only: the destination',
      icon: 'IconLink',
    },
  ],
});
