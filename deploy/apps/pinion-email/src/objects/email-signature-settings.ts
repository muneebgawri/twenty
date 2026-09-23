import { defineObject, FieldType } from 'twenty-sdk/define';

export const EMAIL_SIGNATURE_SETTINGS_OBJECT_UNIVERSAL_IDENTIFIER =
  'c8f1a45e-0d73-4b29-9e86-7a21f5c0d3b4';

export const LOGO_URL_FIELD_UNIVERSAL_IDENTIFIER =
  'd9a2b56f-1e84-4c3a-8f97-6b32a6d1e4c5';
export const LOGO_LINK_FIELD_UNIVERSAL_IDENTIFIER =
  'ea3b6470-2f95-4d4b-90a8-7c43b7e2f5d6';
export const LOGO_WIDTH_FIELD_UNIVERSAL_IDENTIFIER =
  'fb4c7581-3a06-4e5c-a1b9-8d54c8f306e7';
export const FOOTER_FIELD_UNIVERSAL_IDENTIFIER =
  '0c5d8692-4b17-4f6d-b2ca-9e65d90417f8';
export const UNSUBSCRIBE_FIELD_UNIVERSAL_IDENTIFIER =
  '1d6e9713-5c28-4a7e-83db-af76ea152809';

/**
 * The branding every signature shares. ONE row, workspace-wide.
 *
 * Deliberately not part of emailSignature. The logo is set once by an admin
 * and every mailbox renders the same one, so that signatures stay uniform
 * across accounts — putting it on the per-mailbox record would let them drift
 * the moment two people pasted slightly different URLs, which is the problem
 * this exists to prevent.
 *
 * `logoUrl` is a URL rather than an upload because a mail client fetches it
 * unauthenticated, from outside our network, months after the message was
 * sent. It has to be a public address that stays put; an uploaded file behind
 * Twenty's auth would render as a broken image in every recipient's inbox.
 */
export default defineObject({
  universalIdentifier: EMAIL_SIGNATURE_SETTINGS_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'emailSignatureSetting',
  namePlural: 'emailSignatureSettings',
  labelSingular: 'Email signature branding',
  labelPlural: 'Email signature branding',
  description:
    'Workspace-wide branding shared by every email signature. One row.',
  icon: 'IconPhoto',
  labelIdentifierFieldMetadataUniversalIdentifier:
    LOGO_URL_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: LOGO_URL_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'logoUrl',
      label: 'Logo URL',
      description:
        'Publicly reachable image. Mail clients fetch this unauthenticated.',
      icon: 'IconPhoto',
    },
    {
      universalIdentifier: LOGO_LINK_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'logoLinkUrl',
      label: 'Logo links to',
      description: 'Optional. Wraps the logo in a link, usually the website.',
      icon: 'IconLink',
    },
    {
      universalIdentifier: LOGO_WIDTH_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.NUMBER,
      name: 'logoWidthPx',
      label: 'Logo width (px)',
      description:
        'Width in pixels. Set one: mail clients do not honour CSS sizing reliably.',
      icon: 'IconRuler',
    },
    {
      universalIdentifier: UNSUBSCRIBE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'unsubscribeUrlTemplate',
      label: 'Unsubscribe URL',
      description:
        "Herald's self-serve link with {{email}} where the recipient goes. Substituted per message.",
      icon: 'IconMailOff',
    },
    {
      universalIdentifier: FOOTER_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'footerHtml',
      label: 'Shared footer',
      description:
        'Optional HTML appended below every signature — address, disclaimer.',
      icon: 'IconFileText',
    },
  ],
});
