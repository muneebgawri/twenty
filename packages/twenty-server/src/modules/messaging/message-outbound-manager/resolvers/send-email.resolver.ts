import {
  ForbiddenException,
  HttpException,
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
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
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

/**
 * Floor on a scheduled send. Below this the job would fire while the user is
 * still looking at the composer, which reads as "it sent immediately" and makes
 * the schedule pointless.
 */
export const MINIMUM_SCHEDULE_DELAY_MS = 30_000;

/**
 * Ceiling on a scheduled send. Without one, a mistyped year parks a job in Redis
 * for decades — it outlives the queue, the credentials it will send with, and
 * usually the person who scheduled it.
 */
export const MAXIMUM_SCHEDULE_DELAY_MS = 365 * 24 * 60 * 60 * 1000;

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
    @AuthUser() user: UserEntity,
  ): Promise<SendEmailOutputDTO> {
    try {
      if (input.scheduledAt) {
        const scheduledAt = new Date(input.scheduledAt);

        if (Number.isNaN(scheduledAt.getTime())) {
          return { success: false, error: 'Invalid scheduled date' };
        }

        const delay = scheduledAt.getTime() - Date.now();

        if (delay < MINIMUM_SCHEDULE_DELAY_MS) {
          return {
            success: false,
            error: 'Scheduled time must be at least 30 seconds in the future',
          };
        }

        if (delay > MAXIMUM_SCHEDULE_DELAY_MS) {
          return {
            success: false,
            error: 'Scheduled time must be within one year',
          };
        }

        // Verify the sender owns the account BEFORE reporting success.
        // Previously this ran only when the job fired, so a user without
        // access saw "scheduled" and the failure surfaced hours later in a
        // worker log with nothing shown to them.
        await this.outboundEmailDispatchService.assertCanSendFrom({
          connectedAccountId: input.connectedAccountId,
          userWorkspaceId,
          workspaceId: workspace.id,
        });

        await this.messageQueueService.add<ScheduledEmailJobData>(
          ScheduledEmailJob.name,
          {
            input,
            workspaceId: workspace.id,
            userWorkspaceId,
            userId: user.id,
          },
          { delay },
        );

        return { success: true, scheduledAt: scheduledAt.toISOString() };
      }

      return await this.outboundEmailDispatchService.dispatch({
        input,
        workspaceId: workspace.id,
        userWorkspaceId,
        userId: user.id,
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // A thrown HttpException is a deliberate, user-facing failure — "connected
      // account not found" and the like — so its message is meant for the
      // caller. Anything else is an internal fault whose text can carry
      // hostnames, ports and query fragments, so it is logged and generalised.
      if (error instanceof HttpException) {
        return { success: false, error: error.message };
      }

      this.logger.error(
        'Failed to send email',
        error instanceof Error ? error.stack : String(error),
      );

      return { success: false, error: 'Failed to send email' };
    }
  }
}
