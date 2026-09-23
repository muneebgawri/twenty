import { defineRole } from 'twenty-sdk/define';

export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '8b3d1f6a-27c4-4e59-9a80-5f2c7d4e1b93';

// The role this app's logic functions run as. Step 1 ships no logic functions
// at all -- signatures are written by the settings front component, which runs
// as the signed-in user and not as this role.
//
// Kept deliberately empty so the role grows with the features that need it:
// scheduled send (§4.1) will need read/write on the app's own queue object,
// and the public tracking routes (§4.2) must have no record access beyond
// their own event object. Granting it up front and trimming later never
// happens.
export default defineRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Pinion email default function role',
  description: 'Pinion email default function role',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
});
