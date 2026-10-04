import { Module } from '@nestjs/common';

import { FileEmailAttachmentModule } from 'src/engine/core-modules/file/file-email-attachment/file-email-attachment.module';
import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { UserVarsModule } from 'src/engine/core-modules/user/user-vars/user-vars.module';
import { ConnectedAccountMetadataModule } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.module';
import { SendEmailResolver } from 'src/modules/messaging/message-outbound-manager/resolvers/send-email.resolver';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { EmailTrackingController } from 'src/modules/messaging/message-outbound-manager/controllers/email-tracking.controller';
import { ScheduledEmailJob } from 'src/modules/messaging/message-outbound-manager/jobs/scheduled-email.job';
import { EmailSignatureResolver } from 'src/modules/messaging/message-outbound-manager/resolvers/email-signature.resolver';
import { EmailSignatureService } from 'src/modules/messaging/message-outbound-manager/services/email-signature.service';
import { EmailTrackingService } from 'src/modules/messaging/message-outbound-manager/services/email-tracking.service';
import { OutboundEmailDispatchService } from 'src/modules/messaging/message-outbound-manager/services/outbound-email-dispatch.service';

@Module({
  imports: [
    FileEmailAttachmentModule,
    ToolModule,
    MessagingSendManagerModule,
    ConnectedAccountMetadataModule,
    UserVarsModule,
  ],
  controllers: [EmailTrackingController],
  providers: [
    SendEmailResolver,
    EmailSignatureResolver,
    ScheduledEmailJob,
    EmailSignatureService,
    EmailTrackingService,
    OutboundEmailDispatchService,
  ],
  exports: [ScheduledEmailJob],
})
export class SendEmailModule {}
