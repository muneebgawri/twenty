import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/roles/default-role';
import { defineApplication } from 'twenty-sdk';

export default defineApplication({
  universalIdentifier: '4daa5147-7e70-4e43-b091-c27e1e8a32e3',
  displayName: 'OpenPhone call recording',
  description:
    'Click-to-call with OpenPhone / Quo and import completed call recordings',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
});
