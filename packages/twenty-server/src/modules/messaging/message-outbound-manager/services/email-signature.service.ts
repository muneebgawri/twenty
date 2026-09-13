import { Injectable } from '@nestjs/common';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import {
  EMAIL_SIGNATURE_MAX_LENGTH,
  EmailSignatureKeys,
  type EmailSignatureKeyValueType,
  type EmailSignaturesByConnectedAccountId,
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
    const stored = await this.userVarsService.get({
      userId,
      workspaceId,
      key: EmailSignatureKeys.EMAIL_SIGNATURES,
    });

    // A user who has never saved one has no row at all.
    return stored ?? {};
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
    const signatures = await this.getForUser({ userId, workspaceId });
    const signature = signatures[connectedAccountId]?.trim();

    return signature ? signature : undefined;
  }

  /**
   * Save (or clear, by passing an empty string) the signature for one account.
   * Returns the full map so a caller can render every account without a second
   * round trip.
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

    const signatures = await this.getForUser({ userId, workspaceId });

    if (trimmed) {
      signatures[connectedAccountId] = trimmed;
    } else {
      // Clearing removes the entry rather than storing "", so an account with no
      // signature reads the same whether it was never set or was emptied.
      delete signatures[connectedAccountId];
    }

    await this.userVarsService.set({
      userId,
      workspaceId,
      key: EmailSignatureKeys.EMAIL_SIGNATURES,
      value: signatures,
    });

    return signatures;
  }
}
