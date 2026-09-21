import { Injectable } from '@nestjs/common';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import {
  buildEmailSignatureKey,
  EMAIL_SIGNATURE_MAX_LENGTH,
  type EmailSignatureKeyValueType,
  type EmailSignaturesByConnectedAccountId,
  parseEmailSignatureKey,
} from 'src/modules/messaging/message-outbound-manager/types/email-signature-key-value.type';

@Injectable()
export class EmailSignatureService {
  constructor(
    private readonly userVarsService: UserVarsService<EmailSignatureKeyValueType>,
  ) {}

  /** Every signature this user has saved, keyed by connected account. */
  async getForUser({
    userId,
    workspaceId,
  }: {
    userId: string;
    workspaceId: string;
  }): Promise<EmailSignaturesByConnectedAccountId> {
    const userVars = await this.userVarsService.getAll({
      userId,
      workspaceId,
    });

    const signatures: EmailSignaturesByConnectedAccountId = {};

    for (const [key, value] of userVars) {
      const connectedAccountId = parseEmailSignatureKey(key);

      // getAll returns every user variable, not only ours.
      if (connectedAccountId === undefined || typeof value !== 'string') {
        continue;
      }

      const signature = value.trim();

      if (signature) {
        signatures[connectedAccountId] = signature;
      }
    }

    return signatures;
  }

  /**
   * The signature to append for this account, or undefined when none is set.
   *
   * Resolved from storage on the server, never taken from the request: the
   * client previously supplied it on every send, which meant the signature was
   * whatever that browser happened to have, and an empty localStorage silently
   * sent none.
   */
  async getForConnectedAccount({
    userId,
    workspaceId,
    connectedAccountId,
  }: {
    userId: string;
    workspaceId: string;
    connectedAccountId: string;
  }): Promise<string | undefined> {
    const stored = await this.userVarsService.get({
      userId,
      workspaceId,
      key: buildEmailSignatureKey(connectedAccountId),
    });

    const signature = stored?.trim();

    return signature ? signature : undefined;
  }

  /**
   * Save (or clear, by passing an empty string) the signature for one account.
   * Returns the full map so a caller can render every account without a second
   * round trip.
   *
   * Writes only this account's row. Reading the whole map first and writing it
   * back would let a concurrent save of a different account be overwritten.
   */
  async setForConnectedAccount({
    userId,
    workspaceId,
    connectedAccountId,
    signature,
  }: {
    userId: string;
    workspaceId: string;
    connectedAccountId: string;
    signature: string;
  }): Promise<EmailSignaturesByConnectedAccountId> {
    const trimmed = signature.trim();

    if (trimmed.length > EMAIL_SIGNATURE_MAX_LENGTH) {
      throw new Error(
        `Signature exceeds ${EMAIL_SIGNATURE_MAX_LENGTH} characters`,
      );
    }

    const key = buildEmailSignatureKey(connectedAccountId);

    if (trimmed) {
      await this.userVarsService.set({
        userId,
        workspaceId,
        key,
        value: trimmed,
      });
    } else {
      // Clearing removes the row rather than storing "", so an account with no
      // signature reads the same whether it was never set or was emptied.
      await this.userVarsService.delete({ userId, workspaceId, key });
    }

    return await this.getForUser({ userId, workspaceId });
  }
}
