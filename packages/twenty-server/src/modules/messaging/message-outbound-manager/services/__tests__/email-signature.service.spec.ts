import { Test, type TestingModule } from '@nestjs/testing';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { EmailSignatureService } from 'src/modules/messaging/message-outbound-manager/services/email-signature.service';
import { EMAIL_SIGNATURE_MAX_LENGTH } from 'src/modules/messaging/message-outbound-manager/types/email-signature-key-value.type';

const USER = { userId: 'user-1', workspaceId: 'workspace-1' };
const ACCOUNT_A = 'connected-account-a';
const ACCOUNT_B = 'connected-account-b';

/**
 * Stands in for the key-value pair table: one row per (user, workspace, key),
 * which is what makes concurrent saves of different accounts independent.
 */
const createUserVarsStore = () => {
  const rows = new Map<string, unknown>();
  const rowKey = (userId?: string, workspaceId?: string, key?: string) =>
    `${userId}:${workspaceId}:${key}`;

  return {
    rows,
    get: jest.fn(async ({ userId, workspaceId, key }) =>
      rows.get(rowKey(userId, workspaceId, key)),
    ),
    set: jest.fn(async ({ userId, workspaceId, key, value }) => {
      rows.set(rowKey(userId, workspaceId, key), value);
    }),
    delete: jest.fn(async ({ userId, workspaceId, key }) => {
      rows.delete(rowKey(userId, workspaceId, key));
    }),
    getAll: jest.fn(async ({ userId, workspaceId }) => {
      const result = new Map<string, unknown>();

      for (const [storedKey, value] of rows) {
        const [storedUserId, storedWorkspaceId, ...rest] = storedKey.split(':');

        if (storedUserId === userId && storedWorkspaceId === workspaceId) {
          result.set(rest.join(':'), value);
        }
      }

      return result;
    }),
  };
};

describe('EmailSignatureService', () => {
  let service: EmailSignatureService;
  let userVars: ReturnType<typeof createUserVarsStore>;

  beforeEach(async () => {
    userVars = createUserVarsStore();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSignatureService,
        { provide: UserVarsService, useValue: userVars },
      ],
    }).compile();

    service = module.get<EmailSignatureService>(EmailSignatureService);
  });

  it('returns an empty map for a user who has never saved one', async () => {
    expect(await service.getForUser(USER)).toEqual({});
  });

  it('returns undefined for an account with no signature', async () => {
    expect(
      await service.getForConnectedAccount({
        ...USER,
        connectedAccountId: ACCOUNT_A,
      }),
    ).toBeUndefined();
  });

  it('saves a trimmed signature and reads it back', async () => {
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_A,
      signature: '  Matt Marshall\nPinion Newswire  ',
    });

    expect(
      await service.getForConnectedAccount({
        ...USER,
        connectedAccountId: ACCOUNT_A,
      }),
    ).toBe('Matt Marshall\nPinion Newswire');
  });

  it('keeps a signature per connected account', async () => {
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_A,
      signature: 'From the personal mailbox',
    });
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_B,
      signature: 'From the outreach mailbox',
    });

    expect(await service.getForUser(USER)).toEqual({
      [ACCOUNT_A]: 'From the personal mailbox',
      [ACCOUNT_B]: 'From the outreach mailbox',
    });
  });

  /**
   * The regression this file exists for. Saving used to read every account's
   * signature, edit the map and write it back, so two saves in flight at once
   * dropped whichever finished first — one mailbox's signature silently gone.
   */
  it('does not lose a concurrent save of another account', async () => {
    await Promise.all([
      service.setForConnectedAccount({
        ...USER,
        connectedAccountId: ACCOUNT_A,
        signature: 'A',
      }),
      service.setForConnectedAccount({
        ...USER,
        connectedAccountId: ACCOUNT_B,
        signature: 'B',
      }),
    ]);

    expect(await service.getForUser(USER)).toEqual({
      [ACCOUNT_A]: 'A',
      [ACCOUNT_B]: 'B',
    });
  });

  it('clears a signature without touching the other accounts', async () => {
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_A,
      signature: 'A',
    });
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_B,
      signature: 'B',
    });

    const remaining = await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_A,
      signature: '   ',
    });

    expect(remaining).toEqual({ [ACCOUNT_B]: 'B' });
    expect(
      await service.getForConnectedAccount({
        ...USER,
        connectedAccountId: ACCOUNT_A,
      }),
    ).toBeUndefined();
  });

  it('rejects a signature over the cap', async () => {
    await expect(
      service.setForConnectedAccount({
        ...USER,
        connectedAccountId: ACCOUNT_A,
        signature: 'x'.repeat(EMAIL_SIGNATURE_MAX_LENGTH + 1),
      }),
    ).rejects.toThrow(`Signature exceeds ${EMAIL_SIGNATURE_MAX_LENGTH}`);

    expect(userVars.set).not.toHaveBeenCalled();
  });

  it('accepts a signature exactly at the cap', async () => {
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_A,
      signature: 'x'.repeat(EMAIL_SIGNATURE_MAX_LENGTH),
    });

    expect(
      await service.getForConnectedAccount({
        ...USER,
        connectedAccountId: ACCOUNT_A,
      }),
    ).toHaveLength(EMAIL_SIGNATURE_MAX_LENGTH);
  });

  it('does not read another user’s signatures', async () => {
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_A,
      signature: 'mine',
    });

    expect(
      await service.getForUser({ userId: 'user-2', workspaceId: 'workspace-1' }),
    ).toEqual({});
  });

  it('ignores user variables belonging to other features', async () => {
    await userVars.set({ ...USER, key: 'COLOR_SCHEME', value: 'Dark' });
    await service.setForConnectedAccount({
      ...USER,
      connectedAccountId: ACCOUNT_A,
      signature: 'A',
    });

    expect(await service.getForUser(USER)).toEqual({ [ACCOUNT_A]: 'A' });
  });
});
