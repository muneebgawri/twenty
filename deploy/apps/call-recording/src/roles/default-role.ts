import { defineRole, PermissionFlag } from 'twenty-sdk/define';

export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  'f9cfb3ce-cb1e-4f55-af85-be45f6059054';

// The role the app's logic functions run as. The OpenPhone webhook is a public
// route, so this is kept to what that function needs: look people up, create
// call recordings, and upload the audio. Upstream also granted soft-delete and
// AI, which only the removed summarization features used.
export default defineRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Call recording default function role',
  description: 'Call recording default function role',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  permissionFlags: [PermissionFlag.UPLOAD_FILE],
});
