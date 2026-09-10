import { Injectable } from '@nestjs/common';

import { FileFolder } from 'twenty-shared/types';
import { v4 } from 'uuid';

import { FileEmailAttachmentService } from 'src/engine/core-modules/file/file-email-attachment/services/file-email-attachment.service';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { SendEmailInput } from 'src/modules/messaging/message-outbound-manager/dtos/send-email.input';
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
  ) {}

  async dispatch({
    input,
    workspaceId,
    userWorkspaceId,
  }: {
    input: SendEmailInput;
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<{ success: boolean; error?: string }> {
    await this.connectedAccountMetadataService.verifyOwnership({
      id: input.connectedAccountId,
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
    const trackedEmail = await this.emailTrackingService.addTracking({
      email: result.data,
      workspaceId,
      messageId,
      signature: input.signature,
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
