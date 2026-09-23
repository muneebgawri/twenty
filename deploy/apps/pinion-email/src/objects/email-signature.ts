import { defineObject, FieldType } from 'twenty-sdk/define';

export const EMAIL_SIGNATURE_OBJECT_UNIVERSAL_IDENTIFIER =
  '3a9e7c14-6d28-4b05-9f73-2c81e5a6d047';

export const HANDLE_FIELD_UNIVERSAL_IDENTIFIER =
  '4b0f8d25-7e39-4c16-a084-3d92f6b7e158';
export const CONNECTED_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER =
  '5c1a9e36-8f4a-4d27-b195-4ea307c8f269';
export const BODY_FIELD_UNIVERSAL_IDENTIFIER =
  'ab5a6f79-23b7-4fd7-871f-d9b11cc799b4';
export const IS_ENABLED_FIELD_UNIVERSAL_IDENTIFIER =
  'b5d3981e-6172-48fe-a29e-041b20b95ef3';

/**
 * A signature, stored per connected mailbox.
 *
 * App-owned because it has to be. `connectedAccount` is a core TypeORM entity,
 * absent from STANDARD_OBJECTS, so a field cannot be added to it (§3.5) —
 * there is nowhere in Twenty for a signature to live. It is also why this is
 * keyed by a plain TEXT `connectedAccountId` rather than a relation: you
 * cannot declare a relation to something that is not an object.
 *
 * The id comes from `myConnectedAccounts` on the METADATA endpoint, which the
 * settings component can call because its token carries user context. An API
 * key cannot, and neither can cron — which is exactly why §4.1 stores the id
 * on the queue row at compose time instead of resolving it when sending.
 *
 * `handle` is denormalised on purpose. It is the only human-readable thing
 * about a row here, and without it the record page is a list of UUIDs; the
 * mailbox address is also what an AM recognises. It is display only — the
 * connectedAccountId is what identifies the mailbox.
 */
export default defineObject({
  universalIdentifier: EMAIL_SIGNATURE_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'emailSignature',
  namePlural: 'emailSignatures',
  labelSingular: 'Email signature',
  labelPlural: 'Email signatures',
  description: 'A signature appended when sending from a connected mailbox',
  icon: 'IconSignature',
  labelIdentifierFieldMetadataUniversalIdentifier:
    HANDLE_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: HANDLE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'handle',
      label: 'Mailbox',
      description: 'The email address this signature belongs to (display only)',
      icon: 'IconMail',
    },
    {
      universalIdentifier: CONNECTED_ACCOUNT_ID_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'connectedAccountId',
      label: 'Connected account ID',
      description:
        'The mailbox this signature is keyed on. Not a relation: connectedAccount is not an object.',
      icon: 'IconKey',
    },
    {
      universalIdentifier: BODY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'body',
      label: 'Signature',
      description: 'Appended to the message body when sending',
      icon: 'IconWriting',
    },
    {
      universalIdentifier: IS_ENABLED_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.BOOLEAN,
      name: 'isEnabled',
      label: 'Enabled',
      description: 'Whether this signature is appended when sending',
      icon: 'IconToggleLeft',
    },
  ],
});
