import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/roles/default-role';
import { defineApplication } from 'twenty-sdk/define';

// Email productivity for Account Managers: signatures now, our own composer,
// scheduled send and tracking to follow. See
// deploy/apps/PRD-email-productivity.md for the design and, more importantly,
// for what was measured rather than assumed.
export default defineApplication({
  universalIdentifier: 'd7c4e920-5b81-4a36-8f2d-13e6b9a4c750',
  displayName: 'Pinion email',
  description:
    'Per-mailbox email signatures, applied when sending from Twenty',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
});
