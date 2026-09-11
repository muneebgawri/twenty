import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/roles/default-role';
import { defineApplication } from 'twenty-sdk/define';

export const OPENPHONE_WEBHOOK_SIGNING_KEY_VARIABLE_UNIVERSAL_IDENTIFIER =
  '0c0d6b8e-3f0a-4f7c-9a52-6a1f4f2f8e31';

export default defineApplication({
  universalIdentifier: '4daa5147-7e70-4e43-b091-c27e1e8a32e3',
  displayName: 'OpenPhone call recording',
  description:
    'Click-to-call with OpenPhone / Quo and import completed call recordings',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  applicationVariables: {
    OPENPHONE_WEBHOOK_SIGNING_KEY: {
      universalIdentifier:
        OPENPHONE_WEBHOOK_SIGNING_KEY_VARIABLE_UNIVERSAL_IDENTIFIER,
      description:
        'Base64 signing key shown by OpenPhone / Quo when the webhook is created',
      isSecret: true,
    },
  },
});
