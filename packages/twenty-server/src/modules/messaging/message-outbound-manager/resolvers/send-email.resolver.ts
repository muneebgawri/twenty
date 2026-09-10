import {
  ForbiddenException,
  Logger,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { SendEmailOutputDTO } from 'src/modules/messaging/message-outbound-manager/dtos/send-email-output.dto';
import { SendEmailInput } from 'src/modules/messaging/message-outbound-manager/dtos/send-email.input';
import {
  ScheduledEmailJob,
  type ScheduledEmailJobData,
} from 'src/modules/messaging/message-outbound-manager/jobs/scheduled-email.job';
import { OutboundEmailDispatchService } from 'src/modules/messaging/message-outbound-manager/services/outbound-email-dispatch.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard, NoPermissionGuard)
export class SendEmailResolver {
  private readonly logger = new Logger(SendEmailResolver.name);

  constructor(
    private readonly outboundEmailDispatchService: OutboundEmailDispatchService,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @Mutation(() => SendEmailOutputDTO)
  async sendEmail(
    @Args('input') input: SendEmailInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<SendEmailOutputDTO> {
    try {
      if (input.scheduledAt) {
        const scheduledAt = new Date(input.scheduledAt);

        if (Number.isNaN(scheduledAt.getTime())) {
          return { success: false, error: 'Invalid scheduled date' };
        }

        const delay = scheduledAt.getTime() - Date.now();

        if (delay < 30_000) {
          return {
            success: false,
            error: 'Scheduled time must be at least 30 seconds in the future',
          };
        }

        await this.messageQueueService.add<ScheduledEmailJobData>(
          ScheduledEmailJob.name,
          { input, workspaceId: workspace.id, userWorkspaceId },
          { delay },
        );

        return { success: true, scheduledAt: scheduledAt.toISOString() };
      }

      return await this.outboundEmailDispatchService.dispatch({
        input,
        workspaceId: workspace.id,
        userWorkspaceId,
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(`Failed to send email: ${error}`);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }
}
