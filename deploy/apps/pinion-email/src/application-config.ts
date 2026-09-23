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
    HERALD_TRACKING_WEBHOOK_SECRET: {
      universalIdentifier:
        HERALD_TRACKING_WEBHOOK_SECRET_VARIABLE_UNIVERSAL_IDENTIFIER,
      description:
        "The secret Herald generated for this webhook endpoint. Without it every delivery is rejected -- the check fails closed rather than skipping.",
      isSecret: true,
    },
  },
});
