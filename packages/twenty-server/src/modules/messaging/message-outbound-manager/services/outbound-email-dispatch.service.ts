import { Injectable } from '@nestjs/common';

import { FileFolder } from 'twenty-shared/types';
import { v4 } from 'uuid';

import { FileEmailAttachmentService } from 'src/engine/core-modules/file/file-email-attachment/services/file-email-attachment.service';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { SendEmailInput } from 'src/modules/messaging/message-outbound-manager/dtos/send-email.input';
import { EmailSignatureService } from 'src/modules/messaging/message-outbound-manager/services/email-signature.service';
import { EmailTrackingService } from 'src/modules/messaging/message-outbound-manager/services/email-tracking.service';
import { SendEmailService } from 'src/modules/messaging/message-outbound-manager/services/send-email.service';

@Injectable()
export class OutboundEmailDispatchService {
  constructor(
    private readonly connectedAccountMetadataService: ConnectedAccountMetadataService,
    private readonly emailComposerService: EmailComposerService,
    private readonly fileEmailAttachmentService: FileEmailAttachmentService,
    private readonly sendEmailService: SendEmailService,
    private readonly emailTrackingService: EmailTrackingService,
    private readonly emailSignatureService: EmailSignatureService,
  ) {}

  /**
   * Throws unless this user may send from that connected account. Exposed so the
   * resolver can check before enqueueing a scheduled send — otherwise the user
   * is told "scheduled" and only a worker ever learns it was not allowed.
   */
  async assertCanSendFrom({
    connectedAccountId,
    userWorkspaceId,
    workspaceId,
  }: {
    connectedAccountId: string;
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.connectedAccountMetadataService.verifyOwnership({
      id: connectedAccountId,
      userWorkspaceId,
      workspaceId,
    });
  }

  async dispatch({
    input,
    workspaceId,
    userWorkspaceId,
    userId,
  }: {
    input: SendEmailInput;
    workspaceId: string;
    userWorkspaceId: string;
    userId: string;
  }): Promise<{ success: boolean; error?: string }> {
    // Re-checked here as well as at schedule time: a delayed job can fire long
    // after access was revoked, and this is the last gate before the send.
    await this.assertCanSendFrom({
      connectedAccountId: input.connectedAccountId,
      userWorkspaceId,
      workspaceId,
    });

    const result = await this.emailComposerService.composeEmail(
      {
        recipients: {
          to: input.to,
          cc: input.cc ?? '',
          bcc: input.bcc ?? '',
        },
        subject: input.subject,
        body: input.body,
        connectedAccountId: input.connectedAccountId,
        files: input.files ?? [],
        inReplyTo: input.inReplyTo,
      },
      { workspaceId },
      { attachmentsFileFolder: FileFolder.EmailAttachment },
    );

    if (!result.success) {
      return {
        success: false,
        error: result.output.error ?? result.output.message,
      };
    }

    const messageId = v4();
    // Resolved server-side. The client used to send this from localStorage,
    // which meant the signature was whatever that browser held — different on
    // another device, absent after a cache clear, and impossible for a
    // scheduled send dispatched with no browser present.
    const signature = await this.emailSignatureService.getForConnectedAccount({
      userId,
      workspaceId,
      connectedAccountId: input.connectedAccountId,
    });
    const trackedEmail = await this.emailTrackingService.addTracking({
      email: result.data,
      workspaceId,
      messageId,
      signature,
      enabled: input.trackEmail !== false,
    });
    const sendResult =
      await this.sendEmailService.sendComposedEmail(trackedEmail);

    await this.sendEmailService.persistSentMessage(
      sendResult,
      trackedEmail,
      workspaceId,
      {
        messageId,
        scheduledAt: input.scheduledAt
          ? new Date(input.scheduledAt)
          : undefined,
      },
    );

    const attachmentFileIds = (input.files ?? []).map((file) => file.id);

    if (attachmentFileIds.length > 0) {
      await this.fileEmailAttachmentService.deleteFiles({
        fileIds: attachmentFileIds,
        workspaceId,
      });
    }

    return { success: true };
  }
}
