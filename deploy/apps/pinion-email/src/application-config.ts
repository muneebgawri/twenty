import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/roles/default-role';
import { defineApplication } from 'twenty-sdk/define';

// Email productivity for Account Managers: signatures now, our own composer,
// scheduled send and tracking to follow. See
// deploy/apps/PRD-email-productivity.md for the design and, more importantly,
// for what was measured rather than assumed.
export const HERALD_TRACKING_WEBHOOK_SECRET_VARIABLE_UNIVERSAL_IDENTIFIER =
  'e2a36fb8-9edc-4b7f-a6e2-3b578c14590d';

export default defineApplication({
  universalIdentifier: 'd7c4e920-5b81-4a36-8f2d-13e6b9a4c750',
  displayName: 'Pinion email',
  description:
    'Per-mailbox email signatures, applied when sending from Twenty',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  applicationVariables: {
    EXTERNAL_TRACKING_TOKEN_SECRET: {
      universalIdentifier: '68fcd340-7b33-46fb-b278-01250599a990',
      description:
        "Shared with Herald, and deliberately NOT Herald's campaign tracking key: the composer has to mint tokens, so this one leaves Herald and a shared key would let anything holding it forge campaign tokens too.",
      isSecret: true,
    },
    HERALD_TRACKING_OPEN_URL: {
      universalIdentifier: '87c4f629-733d-411a-ac2c-362ed72ffc82',
      description:
        'The full open-pixel URL, e.g. https://track.pinionnewswire.com/o. A branded host on the sending domain is first-party to Gmail and Outlook, so the image is far likelier to load at all. Tracking stays off until it is set.',
      isSecret: false,
    },
    HERALD_TRACKING_CLICK_URL: {
      universalIdentifier: 'a944a681-bebd-490c-9ec0-507009fb8ba2',
      description:
        'The full click-redirect URL, e.g. https://track.pinionnewswire.com/c. Links are left unwrapped if unset.',
      isSecret: false,
    },
    HERALD_TENANT_ID: {
      universalIdentifier: '2a6091fa-7ec7-4af4-afda-82ae77d0af78',
      description: "The Herald tenant these sends belong to; goes inside the signed token.",
      isSecret: false,
    },
    HERALD_TRACKING_WEBHOOK_SECRET: {
      universalIdentifier:
        HERALD_TRACKING_WEBHOOK_SECRET_VARIABLE_UNIVERSAL_IDENTIFIER,
      description:
        "The secret Herald generated for this webhook endpoint. Without it every delivery is rejected -- the check fails closed rather than skipping.",
      isSecret: true,
    },
  },
});
