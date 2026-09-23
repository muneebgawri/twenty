import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  SystemPermissionFlag,
} from 'twenty-sdk/define';
import { EMAIL_SIGNATURE_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/email-signature';
import { EMAIL_SIGNATURE_SETTINGS_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/email-signature-settings';
import { EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/objects/email-tracking-event';

export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '8b3d1f6a-27c4-4e59-9a80-5f2c7d4e1b93';

// The role this app runs under. Both grants below were found the same way: the
// settings page rendered, listed nothing and showed "Entity performing the
// request does not have permission" -- a message that names the APPLICATION,
// not the signed-in user, which is why it is confusing. The component calls the
// API with the user's token, so the call looks like one the user is plainly
// entitled to make; Twenty checks what the app was granted as well.
//
// CONNECTED_ACCOUNTS covers `myConnectedAccounts`, the only way to learn which
// mailboxes exist (§3.5).
//
// objectPermissions covers the app's OWN object. Owning emailSignature does not
// imply being able to read it: with no grant the list query fails, and the page
// cannot show or save a signature. Scoped to that one object rather than
// flipping canReadAllObjectRecords, because this app has no business reading
// people or companies and the public tracking routes in §4.2 will run under
// this same role.
export default defineRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Pinion email default function role',
  description: 'Pinion email default function role',
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  // SEND_EMAIL_TOOL is what lets the composer call sendEmail. The user is
  // sending from their own connected mailbox with their own token, but the
  // application still has to be granted the capability -- same lesson as
  // CONNECTED_ACCOUNTS, same unhelpful "Entity performing the request does not
  // have permission" when it is missing.
  permissionFlagUniversalIdentifiers: [
    SystemPermissionFlag.CONNECTED_ACCOUNTS,
    SystemPermissionFlag.SEND_EMAIL_TOOL,
  ],
  objectPermissions: [
    {
      objectUniversalIdentifier: EMAIL_SIGNATURE_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    },
    {
      objectUniversalIdentifier:
        EMAIL_SIGNATURE_SETTINGS_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    },
    // The webhook writes these; nothing deletes them. A tracking event is a
    // fact about something that already happened, so destroy stays off even
    // for the app that creates them.
    {
      objectUniversalIdentifier: EMAIL_TRACKING_EVENT_OBJECT_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    },
    // READ ONLY, and only so the composer can prefill the address of the
    // person it was opened on. The app never writes to person, and the user
    // could read that record anyway -- this grants the APPLICATION what the
    // user already has, nothing wider.
    {
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    },
  ],
});
