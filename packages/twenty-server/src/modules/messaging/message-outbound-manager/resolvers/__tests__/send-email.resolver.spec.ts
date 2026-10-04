import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type SendEmailInput } from 'src/modules/messaging/message-outbound-manager/dtos/send-email.input';
import {
  MAXIMUM_SCHEDULE_DELAY_MS,
  SendEmailResolver,
} from 'src/modules/messaging/message-outbound-manager/resolvers/send-email.resolver';
import { OutboundEmailDispatchService } from 'src/modules/messaging/message-outbound-manager/services/outbound-email-dispatch.service';

const WORKSPACE = { id: 'workspace-1' } as WorkspaceEntity;
const USER = { id: 'user-1' } as UserEntity;
const USER_WORKSPACE_ID = 'user-workspace-1';
const CONNECTED_ACCOUNT_ID = 'connected-account-1';

const buildInput = (extra: Partial<SendEmailInput> = {}): SendEmailInput =>
  ({
    connectedAccountId: CONNECTED_ACCOUNT_ID,
    to: 'someone@example.com',
    subject: 'Subject',
    body: 'Body',
    ...extra,
  }) as SendEmailInput;

const inMinutes = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

describe('SendEmailResolver', () => {
  let resolver: SendEmailResolver;
  let dispatchService: {
    assertCanSendFrom: jest.Mock;
    dispatch: jest.Mock;
  };
  let queueService: { add: jest.Mock };

  const sendEmail = (input: SendEmailInput) =>
    resolver.sendEmail(input, WORKSPACE, USER_WORKSPACE_ID, USER);

  beforeEach(async () => {
    dispatchService = {
      assertCanSendFrom: jest.fn().mockResolvedValue(undefined),
      dispatch: jest.fn().mockResolvedValue({ success: true }),
    };
    queueService = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendEmailResolver,
        { provide: OutboundEmailDispatchService, useValue: dispatchService },
        {
          provide: getQueueToken(MessageQueue.messagingQueue),
          useValue: queueService,
        },
      ],
    }).compile();

    resolver = module.get<SendEmailResolver>(SendEmailResolver);
  });

  it('sends immediately when no schedule is given', async () => {
    const result = await sendEmail(buildInput());

    expect(result).toEqual({ success: true });
    expect(dispatchService.dispatch).toHaveBeenCalledTimes(1);
    expect(queueService.add).not.toHaveBeenCalled();
  });

  describe('scheduling', () => {
    it('rejects an unparseable date', async () => {
      const result = await sendEmail(
        buildInput({ scheduledAt: 'not a date' }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid scheduled date/);
      expect(queueService.add).not.toHaveBeenCalled();
    });

    it.each([
      ['a time in the past', inMinutes(-1)],
      ['a time under the 30 second floor', inMinutes(0.1)],
    ])('rejects %s', async (_, scheduledAt) => {
      const result = await sendEmail(buildInput({ scheduledAt }));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/at least 30 seconds in the future/);
      expect(queueService.add).not.toHaveBeenCalled();
    });

    /**
     * Without a ceiling a mistyped year parks a job in Redis for decades, long
     * after the credentials it would send with have been rotated.
     */
    it('rejects a send scheduled beyond a year out', async () => {
      const beyond = new Date(
        Date.now() + MAXIMUM_SCHEDULE_DELAY_MS + 60_000,
      ).toISOString();

      const result = await sendEmail(buildInput({ scheduledAt: beyond }));

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/within one year/);
      expect(queueService.add).not.toHaveBeenCalled();
    });

    it('queues a valid send with the delay and the sender identity', async () => {
      const scheduledAt = inMinutes(60);

      const result = await sendEmail(buildInput({ scheduledAt }));

      expect(result).toEqual({ success: true, scheduledAt });
      expect(dispatchService.dispatch).not.toHaveBeenCalled();

      const [jobName, data, options] = queueService.add.mock.calls[0];

      expect(jobName).toBe('ScheduledEmailJob');
      expect(data).toEqual(
        expect.objectContaining({
          workspaceId: WORKSPACE.id,
          userWorkspaceId: USER_WORKSPACE_ID,
          userId: USER.id,
        }),
      );
      expect(options.delay).toBeGreaterThan(59 * 60_000);
      expect(options.delay).toBeLessThanOrEqual(60 * 60_000);
    });

    it('verifies mailbox ownership before reporting success', async () => {
      dispatchService.assertCanSendFrom.mockRejectedValue(
        new ForbiddenException('Not your mailbox'),
      );

      await expect(
        sendEmail(buildInput({ scheduledAt: inMinutes(10) })),
      ).rejects.toThrow(ForbiddenException);

      expect(queueService.add).not.toHaveBeenCalled();
    });
  });

  describe('error surfacing', () => {
    it('passes through a deliberate user-facing failure', async () => {
      dispatchService.assertCanSendFrom.mockRejectedValue(
        new NotFoundException('Connected account not found'),
      );

      const result = await sendEmail(
        buildInput({ scheduledAt: inMinutes(10) }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Connected account not found/);
    });

    /** Internal faults can carry hostnames and ports; they must not reach the caller. */
    it('generalises an unexpected internal error', async () => {
      dispatchService.dispatch.mockRejectedValue(
        new Error('connect ECONNREFUSED 10.0.0.5:5432'),
      );

      const result = await sendEmail(buildInput());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send email');
      expect(result.error).not.toMatch(/10\.0\.0\.5/);
    });
  });
});
