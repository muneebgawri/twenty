import { Scope } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { SendEmailInput } from 'src/modules/messaging/message-outbound-manager/dtos/send-email.input';
import { OutboundEmailDispatchService } from 'src/modules/messaging/message-outbound-manager/services/outbound-email-dispatch.service';

export type ScheduledEmailJobData = {
  input: SendEmailInput;
  workspaceId: string;
  userWorkspaceId: string;
};

@Processor({ queueName: MessageQueue.messagingQueue, scope: Scope.REQUEST })
export class ScheduledEmailJob {
  constructor(
    private readonly outboundEmailDispatchService: OutboundEmailDispatchService,
  ) {}

  @Process(ScheduledEmailJob.name)
  async handle(data: ScheduledEmailJobData): Promise<void> {
    const result = await this.outboundEmailDispatchService.dispatch(data);

    if (!result.success) {
      throw new Error(result.error ?? 'Scheduled email failed');
    }
  }
}
