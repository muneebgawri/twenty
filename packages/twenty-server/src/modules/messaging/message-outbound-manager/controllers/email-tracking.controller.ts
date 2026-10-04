import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';

import { type Response } from 'express';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { EmailTrackingService } from 'src/modules/messaging/message-outbound-manager/services/email-tracking.service';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);

@Controller('email-tracking')
export class EmailTrackingController {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly emailTrackingService: EmailTrackingService,
  ) {}

  private assertSignature(value: string, signature?: string): void {
    if (
      !signature ||
      !this.emailTrackingService.isValidSignature(value, signature)
    ) {
      throw new BadRequestException('Invalid tracking signature');
    }
  }

  private async updateMessage(
    workspaceId: string,
    messageId: string,
    event: 'open' | 'click',
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const repository =
        await this.globalWorkspaceOrmManager.getRepository<MessageWorkspaceEntity>(
          workspaceId,
          'message',
          { shouldBypassPermissionChecks: true },
        );
      const message = await repository.findOne({ where: { id: messageId } });

      if (!message) {
        throw new NotFoundException('Tracked email not found');
      }

      if (event === 'open') {
        await repository.update(messageId, {
          deliveryStatus:
            message.deliveryStatus === 'CLICKED' ? 'CLICKED' : 'OPENED',
          firstOpenedAt: message.firstOpenedAt ?? new Date(),
        });
        await repository.increment({ id: messageId }, 'openCount', 1);
      } else {
        await repository.update(messageId, {
          deliveryStatus: 'CLICKED',
          lastClickedAt: new Date(),
        });
        await repository.increment({ id: messageId }, 'clickCount', 1);
      }
    }, authContext);
  }

  @Get('open/:workspaceId/:messageId.gif')
  async open(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query('signature') signature: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    this.assertSignature(`${workspaceId}:${messageId}:open`, signature);
    await this.updateMessage(workspaceId, messageId, 'open');
    response
      .set({
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, max-age=0',
      })
      .send(TRANSPARENT_GIF);
  }

  @Get('click/:workspaceId/:messageId')
  async click(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query('url') url: string,
    @Query('signature') signature: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    let target: URL;

    try {
      target = new URL(url);
    } catch {
      throw new BadRequestException('Invalid redirect URL');
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new BadRequestException('Invalid redirect protocol');
    }

    this.assertSignature(`${workspaceId}:${messageId}:click:${url}`, signature);
    await this.updateMessage(workspaceId, messageId, 'click');
    response.redirect(302, url);
  }
}
